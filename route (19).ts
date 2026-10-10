import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import sanitizeHtml from "sanitize-html";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { canUse } from "@/lib/plan";

export const runtime = "nodejs";
const MAX_BODY = 3_000_000;

const schema = z.object({
  to: z.string().max(320),
  from: z.string().max(320),
  fromName: z.string().max(200).nullish(),
  subject: z.string().max(998).optional().default(""),
  text: z.string().max(300_000).optional().default(""),
  html: z.string().max(1_000_000).optional().default(""),
  size: z.number().int().nonnegative().optional().default(0),
});

function verify(raw: string, ts: string, sig: string) {
  const secret = process.env.INBOUND_WEBHOOK_SECRET;
  if (!secret || !ts || !sig) return false;
  if (Math.abs(Date.now() - Number(ts)) > 5 * 60_000) return false; // ضد إعادة الإرسال
  const expected = createHmac("sha256", secret).update(`${ts}.${raw}`).digest("hex");
  const a = Buffer.from(expected), b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (raw.length > MAX_BODY) return NextResponse.json({ error: "too_large" }, { status: 413 });
  if (!verify(raw, req.headers.get("x-timestamp") ?? "", req.headers.get("x-signature") ?? ""))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let data;
  try { data = schema.parse(JSON.parse(raw)); } catch { return NextResponse.json({ error: "bad_request" }, { status: 400 }); }

  const to = data.to.trim().toLowerCase();
  const from = data.from.trim().toLowerCase();

  const mailbox = await prisma.mailbox.findUnique({
    where: { address: to },
    include: { user: { select: { banned: true } }, blocked: true },
  });
  const dropped = { ok: true, stored: false }; // نردّ 200 دائماً حتى لا نكشف وجود العناوين
  if (!mailbox || !mailbox.isActive || mailbox.user.banned) return NextResponse.json(dropped);
  if (mailbox.expiresAt && mailbox.expiresAt < new Date()) return NextResponse.json(dropped);
  if (mailbox.blocked.some((b) => b.address === from || (b.address.startsWith("@") && from.endsWith(b.address))))
    return NextResponse.json(dropped);
  if ((await prisma.message.count({ where: { mailboxId: mailbox.id } })) >= 1000) return NextResponse.json(dropped);

  // قواعد المستخدم (filters.4): تمييز بنجمة أو حذف تلقائي
  let starred = false;
  const rules = Array.isArray(mailbox.rules) ? (mailbox.rules as { kw: string; act: string }[]) : [];
  if (rules.length && (await canUse(mailbox.userId, "filters.4"))) {
    const hay = `${data.subject} ${data.text}`.toLowerCase();
    for (const r of rules) {
      if (r.kw && hay.includes(r.kw)) {
        if (r.act === "delete") return NextResponse.json(dropped);
        starred = true;
      }
    }
  }

  const html = data.html
    ? sanitizeHtml(data.html, {
        allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "h1", "h2", "span", "center"]),
        allowedSchemes: ["http", "https", "mailto"],
        transformTags: { a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer nofollow", target: "_blank" }) },
      })
    : null;

  await prisma.message.create({
    data: {
      mailboxId: mailbox.id,
      fromAddr: from.slice(0, 320),
      fromName: data.fromName ?? null,
      subject: data.subject,
      text: data.text || null,
      html,
      size: data.size,
      starred,
    },
  });
  return NextResponse.json({ ok: true, stored: true });
}
