import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { authenticator } from "otplib";
import { prisma } from "@/lib/prisma";
import { limit } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";
import { ADMIN_COOKIE, adminCookieOptions, signAdminToken } from "@/lib/admin-session";

export const runtime = "nodejs";
const DUMMY = bcrypt.hashSync("dummy-password", 12); // يمنع كشف وجود الحساب بالتوقيت
const FAIL = { error: "بيانات الدخول غير صحيحة أو الحساب مقفل مؤقتاً" };

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!(await limit(`adminlogin:${ip}`, 10, 900))) return NextResponse.json({ error: "محاولات كثيرة" }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const username = String(body.username ?? "").slice(0, 64);
  const password = String(body.password ?? "").slice(0, 200);
  const totp = String(body.totp ?? "").slice(0, 10);

  const acc = await prisma.adminAccount.findUnique({ where: { username } });
  const locked = !!acc?.lockedUntil && acc.lockedUntil > new Date();
  const valid = await bcrypt.compare(password, acc?.passwordHash ?? DUMMY);

  if (!acc || !acc.active || locked || !valid) {
    if (acc && !valid && !locked) {
      const failed = acc.failedCount + 1;
      await prisma.adminAccount.update({
        where: { id: acc.id },
        data: { failedCount: failed, ...(failed >= 5 ? { lockedUntil: new Date(Date.now() + 15 * 60_000), failedCount: 0 } : {}) },
      });
    }
    await audit(`login:${username}`, "ADMIN_LOGIN_FAILED");
    return NextResponse.json(FAIL, { status: 401 });
  }

  if (acc.totpSecret) {
    if (!totp) return NextResponse.json({ needTotp: true }, { status: 401 });
    if (!authenticator.check(totp, acc.totpSecret)) {
      await audit(`login:${username}`, "ADMIN_TOTP_FAILED");
      return NextResponse.json(FAIL, { status: 401 });
    }
  }

  await prisma.adminAccount.update({ where: { id: acc.id }, data: { failedCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
  await audit(acc.username, "ADMIN_LOGIN");
  const res = NextResponse.json({ ok: true, mustChange: acc.mustChange });
  res.cookies.set(ADMIN_COOKIE, await signAdminToken(acc.id, acc.tokenVersion), adminCookieOptions);
  return res;
}
