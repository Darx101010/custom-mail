import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canUse } from "@/lib/plan";

export async function GET(req: NextRequest) {
  const s = await auth();
  if (!s?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await canUse(s.user.id, "inbox.1"))) return NextResponse.json({ error: "premium_only" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id") ?? "";
  const fmt = req.nextUrl.searchParams.get("fmt") === "json" ? "json" : "txt";
  const box = await prisma.mailbox.findFirst({ where: { id, userId: s.user.id } });
  if (!box) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const msgs = await prisma.message.findMany({ where: { mailboxId: id, deletedAt: null }, orderBy: { receivedAt: "desc" } });
  const body = fmt === "json"
    ? JSON.stringify(msgs.map((m) => ({ from: m.fromAddr, subject: m.subject, date: m.receivedAt, text: m.text })), null, 2)
    : msgs.map((m) => `From: ${m.fromAddr}\nSubject: ${m.subject}\nDate: ${m.receivedAt.toISOString()}\n\n${m.text ?? ""}\n\n----------\n`).join("");

  return new NextResponse(body, {
    headers: {
      "Content-Type": fmt === "json" ? "application/json; charset=utf-8" : "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${box.address}.${fmt}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
