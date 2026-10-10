import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/plan";

export const runtime = "nodejs";

// يعمل يومياً عبر Vercel Cron (يرسل Authorization: Bearer CRON_SECRET)
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const s = await getSettings();
  const now = new Date();
  const days = (n: number) => new Date(now.getTime() - n * 864e5);

  const premIds = (
    await prisma.subscription.findMany({
      where: { OR: [{ lifetime: true }, { expiresAt: { gt: now } }] },
      select: { userId: true },
    })
  ).map((x) => x.userId);

  const expiredBoxes = await prisma.mailbox.deleteMany({ where: { expiresAt: { lt: now } } });
  // المجانيون: احتفاظ قصير. البريميوم: احتفاظ أطول. الرسائل ذات النجمة محمية.
  const free = await prisma.message.deleteMany({
    where: { receivedAt: { lt: days(s.freeRetentionDays) }, starred: false, mailbox: { userId: { notIn: premIds } } },
  });
  const prem = await prisma.message.deleteMany({
    where: { receivedAt: { lt: days(s.premRetentionDays) }, starred: false },
  });

  // حذف تلقائي مخصص لكل إيميل (ميزة privacy.1)
  let custom = 0;
  const boxes = await prisma.mailbox.findMany({ where: { autoDeleteDays: { gt: 0 } }, select: { id: true, autoDeleteDays: true } });
  for (const b of boxes) {
    custom += (await prisma.message.deleteMany({ where: { mailboxId: b.id, starred: false, receivedAt: { lt: days(b.autoDeleteDays) } } })).count;
  }
  const trash = await prisma.message.deleteMany({ where: { deletedAt: { lt: days(30) } } }); // السلة 30 يوماً
  return NextResponse.json({ expiredBoxes: expiredBoxes.count, free: free.count, prem: prem.count, custom, trash: trash.count });
}
