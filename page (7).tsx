import { prisma } from "@/lib/prisma";
import { requireAdminPage, hasPerm } from "@/lib/admin-session";
import { Badge, Card, btnDanger, btnGhost, inputCls } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { deleteMailboxAdmin, setMailboxActive } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

export default async function Mailboxes({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const admin = await requireAdminPage("mailboxes.view");
  const { q } = await searchParams;
  const canSearch = hasPerm(admin, "mailboxes.search");
  const boxes = await prisma.mailbox.findMany({
    where: q && canSearch ? { address: { contains: q, mode: "insensitive" } } : undefined,
    orderBy: { createdAt: "desc" }, take: 200,
    include: { user: { select: { email: true } }, _count: { select: { messages: true } } },
  });
  return (
    <Card title={`الإيميلات (${boxes.length})`}>
      {canSearch && <form className="mb-3 flex gap-2"><input name="q" defaultValue={q} placeholder="بحث بالعنوان" className={inputCls} /><button className={btnGhost}>بحث</button></form>}
      {boxes.map((b) => (
        <div key={b.id} className="border-t border-slate-200 py-3">
          <div className="flex items-center justify-between gap-2">
            <b dir="ltr">{b.address}</b>
            <div className="flex gap-1"><Badge tone={b.isActive ? "green" : "red"}>{b.isActive ? "فعّال" : "معطّل"}</Badge><Badge>{b._count.messages} رسالة</Badge></div>
          </div>
          <div className="text-xs text-slate-500" dir="ltr">{b.user.email}</div>
          <div className="mt-2 flex gap-2">
            {hasPerm(admin, b.isActive ? "mailboxes.disable" : "mailboxes.enable") && (
              <form action={setMailboxActive}><input type="hidden" name="id" value={b.id} /><input type="hidden" name="on" value={b.isActive ? "0" : "1"} /><button className={btnGhost}>{b.isActive ? "تعطيل" : "تفعيل"}</button></form>
            )}
            {hasPerm(admin, "mailboxes.delete") && (
              <form action={deleteMailboxAdmin}><input type="hidden" name="id" value={b.id} /><ConfirmButton message="حذف الإيميل ورسائله؟" className={btnDanger}>حذف</ConfirmButton></form>
            )}
          </div>
        </div>
      ))}
    </Card>
  );
}
