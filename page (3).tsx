import { prisma } from "@/lib/prisma";
import { requireAdminPage } from "@/lib/admin-session";
import { Card, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Overview({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  await requireAdminPage("reports.view_stats");
  const sp = await searchParams;
  const now = new Date();
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const [users, premium, boxes, msgsToday, msgs, unusedKeys, openReports, series] = await Promise.all([
    prisma.user.count(),
    prisma.subscription.count({ where: { OR: [{ lifetime: true }, { expiresAt: { gt: now } }] } }),
    prisma.mailbox.count({ where: { isActive: true } }),
    prisma.message.count({ where: { receivedAt: { gte: today } } }),
    prisma.message.count(),
    prisma.licenseKey.count({ where: { status: "UNUSED" } }),
    prisma.abuseReport.count({ where: { resolved: false } }),
    prisma.$queryRaw<{ d: Date; c: number }[]>`
      SELECT date_trunc('day', "receivedAt") AS d, count(*)::int AS c
      FROM "Message" WHERE "receivedAt" > now() - interval '7 days' GROUP BY 1 ORDER BY 1`,
  ]);
  const max = Math.max(1, ...series.map((x) => x.c));

  return (
    <>
      {sp.denied && <div className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">لا تملك صلاحية لهذه الصفحة.</div>}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="المستخدمون" value={users} />
        <Stat label="بريميوم" value={premium} />
        <Stat label="الإيميلات النشطة" value={boxes} />
        <Stat label="رسائل اليوم" value={msgsToday} />
        <Stat label="إجمالي الرسائل" value={msgs} />
        <Stat label="مفاتيح غير مستخدمة" value={unusedKeys} />
        <Stat label="بلاغات مفتوحة" value={openReports} />
      </div>
      <Card title="الرسائل آخر 7 أيام">
        <div className="flex h-28 items-end gap-2">
          {series.length === 0 && <span className="text-sm text-slate-500">لا بيانات</span>}
          {series.map((x) => (
            <div key={String(x.d)} className="flex flex-1 flex-col items-center">
              <div className="w-full rounded-t bg-indigo-500" style={{ height: `${(x.c / max) * 100}%`, minHeight: 2 }} />
              <span className="mt-1 text-[10px] text-slate-500">{new Date(x.d).getDate()} ({x.c})</span>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
