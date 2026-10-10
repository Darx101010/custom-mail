import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canUse } from "@/lib/plan";

async function me() {
  const s = await auth();
  return s?.user?.id ?? null;
}
async function ownedBox(userId: string, mailboxId: string) {
  return prisma.mailbox.findFirst({ where: { id: mailboxId, userId } });
}
async function ownedMsg(userId: string, id: string) {
  return prisma.message.findFirst({ where: { id, mailbox: { userId } } });
}

export async function GET(req: NextRequest) {
  const uid = await me();
  const mailboxId = req.nextUrl.searchParams.get("mailboxId") ?? "";
  if (!uid || !(await ownedBox(uid, mailboxId))) return NextResponse.json([], { status: 404 });
  const trash = req.nextUrl.searchParams.get("trash") === "1" && (await canUse(uid, "inbox.11"));
  const msgs = await prisma.message.findMany({
    where: { mailboxId, deletedAt: trash ? { not: null } : null },
    orderBy: { receivedAt: "desc" }, take: 100,
    select: { id: true, fromAddr: true, fromName: true, subject: true, text: true, html: true, read: true, starred: true, note: true, deletedAt: true, receivedAt: true },
  });
  return NextResponse.json(msgs);
}

// تحديث: مقروء / نجمة / ملاحظة (inbox.28) / استرجاع من السلة (inbox.12)
export async function PATCH(req: NextRequest) {
  const uid = await me();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id, read, starred, note, restore } = await req.json();
  const m = await ownedMsg(uid, String(id));
  if (!m) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const data: { read?: boolean; starred?: boolean; note?: string | null; deletedAt?: null } = {};
  if (typeof read === "boolean") data.read = read;
  if (typeof starred === "boolean") data.starred = starred;
  if (typeof note === "string") {
    if (!(await canUse(uid, "inbox.28"))) return NextResponse.json({ error: "premium_only" }, { status: 403 });
    data.note = note.slice(0, 200) || null;
  }
  if (restore === true) {
    if (!(await canUse(uid, "inbox.12"))) return NextResponse.json({ error: "premium_only" }, { status: 403 });
    data.deletedAt = null;
  }
  await prisma.message.update({ where: { id: m.id }, data });
  return NextResponse.json({ ok: true });
}

// حذف: إلى السلة إن كانت الميزة متاحة (30 يوماً)، وإلا حذف نهائي. من داخل السلة = نهائي.
export async function DELETE(req: NextRequest) {
  const uid = await me();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const m = await ownedMsg(uid, req.nextUrl.searchParams.get("id") ?? "");
  if (!m) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!m.deletedAt && (await canUse(uid, "inbox.11"))) {
    await prisma.message.update({ where: { id: m.id }, data: { deletedAt: new Date() } });
  } else {
    await prisma.message.delete({ where: { id: m.id } });
  }
  return NextResponse.json({ ok: true });
}

// إجراءات جماعية (inbox.13): { ids: string[], action: "read" | "delete" }
export async function POST(req: NextRequest) {
  const uid = await me();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await canUse(uid, "inbox.13"))) return NextResponse.json({ error: "premium_only" }, { status: 403 });
  const { ids, action } = await req.json();
  const list = (Array.isArray(ids) ? ids : []).map(String).slice(0, 100);
  const where = { id: { in: list }, mailbox: { userId: uid } };
  if (action === "read") await prisma.message.updateMany({ where, data: { read: true } });
  else if (action === "delete") {
    if (await canUse(uid, "inbox.11")) await prisma.message.updateMany({ where, data: { deletedAt: new Date() } });
    else await prisma.message.deleteMany({ where });
  }
  return NextResponse.json({ ok: true });
}
