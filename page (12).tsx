import { prisma } from "@/lib/prisma";
import { requireAdminPage, hasPerm } from "@/lib/admin-session";
import { Card, btnDanger, btnGhost, inputCls } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { deleteMessageAdmin } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

export default async function Messages({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const admin = await requireAdminPage("messages.view_meta");
  const { q } = await searchParams;
  const canSearch = hasPerm(admin, "messages.search");
  const canContent = hasPerm(admin, "messages.view_content");
  const msgs = await prisma.message.findMany({
    where: q && canSearch ? { OR: [{ fromAddr: { contains: q, mode: "insensitive" } }, { subject: { contains: q, mode: "insensitive" } }, { mailbox: { address: { contains: q, mode: "insensitive" } } }] } : undefined,
    orderBy: { receivedAt: "desc" }, take: 100,
    select: { id: true, fromAddr: true, subject: true, text: true, receivedAt: true, mailbox: { select: { address: true } } },
  });
  return (
    <Card title="مراقبة الرسائل (آخر 100)">
      {canSearch && <form className="mb-3 flex gap-2"><input name="q" defaultValue={q} placeholder="بحث" className={inputCls} /><button className={btnGhost}>بحث</button></form>}
      {msgs.map((m) => (
        <div key={m.id} className="border-t border-slate-200 py-3">
          <b>{m.subject || "(بدون عنوان)"}</b>
          <div className="text-xs text-slate-500" dir="ltr">{m.fromAddr} → {m.mailbox.address} · {m.receivedAt.toLocaleString("ar")}</div>
          {canContent && <pre className="mt-1 whitespace-pre-wrap break-words text-sm">{(m.text ?? "").slice(0, 600)}</pre>}
          {hasPerm(admin, "messages.delete") && (
            <form action={deleteMessageAdmin} className="mt-2"><input type="hidden" name="id" value={m.id} /><ConfirmButton message="حذف الرسالة؟" className={btnDanger}>حذف</ConfirmButton></form>
          )}
        </div>
      ))}
    </Card>
  );
}
