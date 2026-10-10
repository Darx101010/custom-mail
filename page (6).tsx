import { prisma } from "@/lib/prisma";
import { requireAdminPage, hasPerm } from "@/lib/admin-session";
import { Badge, Card, btnDanger, btnGhost, inputCls } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { banUser, deleteUser, grantPremium, revokePremium, setUserLimit, unbanUser } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

export default async function Users({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const admin = await requireAdminPage("users.view");
  const { q } = await searchParams;
  const canSearch = hasPerm(admin, "users.search");
  const users = await prisma.user.findMany({
    where: q && canSearch ? { email: { contains: q, mode: "insensitive" } } : undefined,
    orderBy: { createdAt: "desc" }, take: 100,
    include: { subscription: true, _count: { select: { mailboxes: true } } },
  });
  const now = new Date();

  return (
    <Card title={`المستخدمون (${users.length})`}>
      {canSearch && (
        <form className="mb-3 flex gap-2"><input name="q" defaultValue={q} placeholder="بحث بالإيميل" className={inputCls} /><button className={btnGhost}>بحث</button></form>
      )}
      {users.map((u) => {
        const prem = !!u.subscription && (u.subscription.lifetime || (u.subscription.expiresAt && u.subscription.expiresAt > now));
        return (
          <div key={u.id} className="border-t border-slate-200 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <b dir="ltr">{u.email}</b>
              <div className="flex gap-1">
                {prem && <Badge tone="amber">بريميوم</Badge>}
                {u.banned && <Badge tone="red">محظور</Badge>}
                <Badge>{u._count.mailboxes} إيميل</Badge>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {hasPerm(admin, u.banned ? "users.unban" : "users.ban") && (
                <form action={u.banned ? unbanUser : banUser}><input type="hidden" name="id" value={u.id} />
                  <ConfirmButton message={u.banned ? "رفع الحظر؟" : "حظر المستخدم وتعطيل إيميلاته؟"} className={btnGhost}>{u.banned ? "رفع الحظر" : "حظر"}</ConfirmButton></form>
              )}
              {hasPerm(admin, "users.grant_premium") && (
                <form action={grantPremium} className="flex gap-1"><input type="hidden" name="id" value={u.id} />
                  <select name="days" className="rounded-xl border border-slate-300 px-2 text-sm"><option value="1">يوم</option><option value="7">أسبوع</option><option value="30">شهر</option><option value="90">3 أشهر</option><option value="365">سنة</option><option value="0">دائم</option></select>
                  <button className={btnGhost}>منح بريميوم</button></form>
              )}
              {prem && hasPerm(admin, "users.revoke_premium") && (
                <form action={revokePremium}><input type="hidden" name="id" value={u.id} /><ConfirmButton message="سحب البريميوم؟" className={btnGhost}>سحب البريميوم</ConfirmButton></form>
              )}
              {hasPerm(admin, "users.set_limit") && (
                <form action={setUserLimit} className="flex gap-1"><input type="hidden" name="id" value={u.id} />
                  <input name="limit" type="number" min={0} placeholder="حد مخصص" defaultValue={u.maxMailboxesOverride ?? ""} className="w-24 rounded-xl border border-slate-300 px-2 text-sm" />
                  <button className={btnGhost}>حفظ الحد</button></form>
              )}
              {hasPerm(admin, "users.delete") && (
                <form action={deleteUser}><input type="hidden" name="id" value={u.id} /><ConfirmButton message="حذف المستخدم وكل بياناته نهائياً؟" className={btnDanger}>حذف</ConfirmButton></form>
              )}
            </div>
          </div>
        );
      })}
    </Card>
  );
}
