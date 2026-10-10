import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { permAllowed } from "./permissions";

export const ADMIN_COOKIE = "admin_session";
const secret = () => {
  const s = process.env.ADMIN_JWT_SECRET;
  if (!s || s.length < 32) throw new Error("ADMIN_JWT_SECRET must be set (32+ chars)");
  return new TextEncoder().encode(s);
};

export async function signAdminToken(adminId: string, tokenVersion: number) {
  return new SignJWT({ tv: tokenVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(adminId)
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(secret());
}

export const adminCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
  maxAge: 60 * 60 * 8,
};

export async function getAdmin() {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub) return null;
    const admin = await prisma.adminAccount.findUnique({ where: { id: payload.sub }, include: { role: true } });
    if (!admin || !admin.active || admin.tokenVersion !== payload.tv) return null;
    return admin;
  } catch {
    return null;
  }
}
export type Admin = NonNullable<Awaited<ReturnType<typeof getAdmin>>>;

export const hasPerm = (admin: Admin, p: string) => permAllowed(admin.role.permissions, p);

/** لصفحات الأدمن (يعيد التوجيه عند الفشل) */
export async function requireAdminPage(perm?: string) {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login");
  if (admin.mustChange) redirect("/admin/change-password");
  if (perm && !hasPerm(admin, perm)) redirect("/admin?denied=1");
  return admin;
}

/** لإجراءات الخادم (Server Actions): يرمي خطأ عند عدم الصلاحية */
export async function requirePerm(perm: string) {
  const admin = await getAdmin();
  if (!admin || admin.mustChange || !hasPerm(admin, perm)) throw new Error("FORBIDDEN");
  return admin;
}
