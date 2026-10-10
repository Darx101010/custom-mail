import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { needUser } from "@/lib/session";
import { getPlan, canUse } from "@/lib/plan";
import { errText } from "@/lib/errors";
import { STYLES, STYLE_LABEL } from "@/lib/random-name";
import { Badge, Card, Notice, btnCls, btnGhost, inputCls } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { createMailbox, createRandom, deleteMailbox } from "./actions";

export const dynamic = "force-dynamic";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ err?: string; ok?: string; arch?: string }> }) {
  const sp = await searchParams;
  const u = await needUser();
  const plan = await getPlan(u.id);
  const [boxes, domains, multiDomain] = await Promise.all([
    prisma.mailbox.findMany({
      where: { userId: u.id, ...(sp.arch === "1" ? {} : { archived: false }) },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      include: { _count: { select: { messages: { where: { read: false, deletedAt: null } } } } },
    }),
    prisma.domain.findMany({ where: { active: true }, orderBy: [{ isDefault: "desc" }, { name: "asc" }] }),
    canUse(u.id, "mail.6"),
  ]);
  const allowedDomains = domains.filter((d) => d.isDefault || (multiDomain && true));

  return (
    <>
      <Notice err={errText(sp.err)} ok={sp.ok && sp.ok !== "1" ? sp.ok : undefined} />
      <Card title="إنشاء إيميل">
        <form action={createMailbox} className="flex flex-wrap gap-2">
          <input name="name" dir="ltr" placeholder="الاسم" className={inputCls + " flex-1 min-w-32"} required maxLength={30} />
          <select name="domain" dir="ltr" className={inputCls + " w-auto"}>
            {allowedDomains.map((d) => <option key={d.id} value={d.name}>@{d.name}</option>)}
          </select>
          <select name="ttl" className={inputCls + " w-auto"}><option value="0">دائم</option><option value="1">⏳ ساعة ⭐</option><option value="24">⏳ يوم ⭐</option><option value="168">⏳ أسبوع ⭐</option></select>
          <button className={btnCls}>إنشاء</button>
        </form>
        <hr className="my-3" />
        <form action={createRandom} className="flex flex-wrap gap-2">
          <select name="style" className={inputCls + " w-auto"}>
            {STYLES.map((s) => <option key={s} value={s}>{STYLE_LABEL[s]}</option>)}
          </select>
          <select name="len" defaultValue="10" className={inputCls + " w-auto"}>
            {[6, 8, 10, 12, 14, 16, 20].map((n) => <option key={n} value={n}>{n} حرف{n !== 10 ? " ⭐" : ""}</option>)}
          </select>
          <select name="count" className={inputCls + " w-auto"}>
            {[1, 2, 3, 5, 10].map((n) => <option key={n} value={n}>{n} إيميل{n > 1 ? " ⭐" : ""}</option>)}
          </select>
          <select name="domain" dir="ltr" className={inputCls + " w-auto"}>
            {allowedDomains.map((d) => <option key={d.id} value={d.name}>@{d.name}</option>)}
          </select>
          <select name="ttl" className={inputCls + " w-auto"}><option value="0">دائم</option><option value="1">⏳ ساعة ⭐</option><option value="24">⏳ يوم ⭐</option><option value="168">⏳ أسبوع ⭐</option></select>
          <button className={btnCls}>🎲 إنشاء عشوائي</button>
        </form>
        <p className="mt-2 text-xs text-slate-500">إيميلاتك: {boxes.length} / {plan.max} · ⭐ = ميزة بريميوم · <Link className="underline" href={sp.arch === "1" ? "/dashboard" : "/dashboard?arch=1"}>{sp.arch === "1" ? "إخفاء المؤرشفة" : "عرض المؤرشفة"}</Link></p>
      </Card>

      {!boxes.length && <Card>لا توجد إيميلات بعد.</Card>}
      {boxes.map((b) => (
        <Card key={b.id} style={b.color ? { borderRight: `5px solid ${b.color}` } : undefined}>
          <div className="flex items-center justify-between gap-2">
            <Link href={`/dashboard/${b.id}`} className="font-bold" dir="ltr">{b.icon ? b.icon + " " : ""}{b.pinned ? "📌 " : ""}{b.address}{b.muted ? " 🔕" : ""}</Link>
            <div className="flex gap-1">
              {!b.muted && b._count.messages > 0 && <Badge tone="amber">{b._count.messages} جديد</Badge>}
              {!b.isActive && <Badge tone="red">معطّل</Badge>}
            </div>
          </div>
          {b.label && <div className="text-xs text-slate-500">🏷️ {b.label}</div>}
          {b.expiresAt && <div className="text-xs text-slate-500">⏳ ينتهي {b.expiresAt.toLocaleString("ar")}</div>}
          <div className="mt-2 flex gap-2">
            <Link href={`/dashboard/${b.id}`} className={btnGhost}>فتح الصندوق</Link>
            <form action={deleteMailbox}>
              <input type="hidden" name="id" value={b.id} />
              <ConfirmButton message="حذف الإيميل وكل رسائله؟" className="rounded-xl border border-red-300 px-3 py-2 text-sm text-red-600">حذف</ConfirmButton>
            </form>
          </div>
        </Card>
      ))}
    </>
  );
}
