import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { needUser } from "@/lib/session";
import { canUse } from "@/lib/plan";
import { errText } from "@/lib/errors";
import { Card, Notice, btnCls, btnGhost, inputCls } from "@/components/ui";
import { Inbox } from "@/components/inbox";
import { addBlocked, removeBlocked, updateMailbox } from "../actions";

export const dynamic = "force-dynamic";

export default async function MailboxPage({
  params, searchParams,
}: { params: Promise<{ mailboxId: string }>; searchParams: Promise<{ err?: string; ok?: string }> }) {
  const { mailboxId } = await params;
  const sp = await searchParams;
  const u = await needUser();
  const box = await prisma.mailbox.findFirst({ where: { id: mailboxId, userId: u.id }, include: { blocked: true } });
  if (!box) notFound();
  const [canExport, canNote, canTrash, canBulk] = await Promise.all([
    canUse(u.id, "inbox.1"), canUse(u.id, "inbox.28"), canUse(u.id, "inbox.11"), canUse(u.id, "inbox.13"),
  ]);

  return (
    <>
      <Link href="/dashboard" className="mb-3 inline-block text-sm text-slate-500">← كل الإيميلات</Link>
      <Notice err={errText(sp.err)} ok={sp.ok && sp.ok !== "1" ? sp.ok : undefined} />
      <Card>
        <div className="mb-2 font-bold" dir="ltr">{box.address}</div>
        <Inbox mailboxId={box.id} canNote={canNote} canTrash={canTrash} canBulk={canBulk} />
      </Card>

      <Card title="إعدادات الإيميل">
        <form action={updateMailbox} className="space-y-2">
          <input type="hidden" name="id" value={box.id} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="pinned" defaultChecked={box.pinned} /> تثبيت في الأعلى</label>
          <label className="block text-sm">وسم ⭐<input name="label" defaultValue={box.label ?? ""} className={inputCls} maxLength={40} /></label>
          <label className="block text-sm">حذف الرسائل الأقدم من (أيام، 0 = إيقاف) ⭐
            <input name="autoDeleteDays" type="number" min={0} max={365} defaultValue={box.autoDeleteDays} className={inputCls} />
          </label>
          <label className="block text-sm">لون الإيميل ⭐
            <select name="color" defaultValue={box.color ?? ""} className={inputCls}>
              <option value="">بدون</option><option value="#ef4444">أحمر</option><option value="#f59e0b">برتقالي</option>
              <option value="#10b981">أخضر</option><option value="#3b82f6">أزرق</option><option value="#a855f7">بنفسجي</option>
            </select>
          </label>
          <label className="block text-sm">أيقونة (إيموجي) ⭐<input name="icon" defaultValue={box.icon ?? ""} className={inputCls} maxLength={4} /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="archived" defaultChecked={box.archived} /> أرشفة الإيميل ⭐</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="muted" defaultChecked={box.muted} /> كتم الإشعارات ⭐</label>
          <label className="block text-sm">قواعد تلقائية ⭐ (سطر لكل قاعدة: كلمة|star لتمييز الرسالة، أو كلمة|delete لحذفها)
            <textarea name="rules" rows={3} dir="ltr" className={inputCls} defaultValue={(Array.isArray(box.rules) ? (box.rules as { kw: string; act: string }[]) : []).map((r) => `${r.kw}|${r.act}`).join("\n")} />
          </label>
          <button className={btnCls}>حفظ</button>
        </form>
      </Card>

      <Card title="حظر المرسلين ⭐">
        <form action={addBlocked} className="flex gap-2">
          <input type="hidden" name="id" value={box.id} />
          <input name="address" dir="ltr" placeholder="spam@site.com أو @site.com" className={inputCls} />
          <button className={btnCls}>حظر</button>
        </form>
        {box.blocked.map((b) => (
          <form key={b.id} action={removeBlocked} className="mt-2 flex items-center justify-between text-sm">
            <input type="hidden" name="id" value={box.id} />
            <input type="hidden" name="blockId" value={b.id} />
            <span dir="ltr">{b.address}</span>
            <button className="text-red-600 underline">إزالة</button>
          </form>
        ))}
      </Card>

      <Card title="تصدير الرسائل ⭐">
        {canExport ? (
          <div className="flex gap-2">
            <a className={btnGhost} href={`/api/mailbox/export?id=${box.id}&fmt=txt`}>TXT</a>
            <a className={btnGhost} href={`/api/mailbox/export?id=${box.id}&fmt=json`}>JSON</a>
          </div>
        ) : <p className="text-sm text-slate-500">متاح للبريميوم. <Link className="underline" href="/dashboard/premium">ترقية</Link></p>}
      </Card>
    </>
  );
}
