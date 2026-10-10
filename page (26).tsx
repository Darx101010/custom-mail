import { needUser } from "@/lib/session";
import { getPlan } from "@/lib/plan";
import { prisma } from "@/lib/prisma";
import { errText } from "@/lib/errors";
import { CATEGORIES, FEATURES } from "@/lib/features";
import { Badge, Card, Notice, btnCls, inputCls } from "@/components/ui";
import { redeemKey } from "../actions";

export const dynamic = "force-dynamic";

export default async function Premium({ searchParams }: { searchParams: Promise<{ err?: string; ok?: string }> }) {
  const sp = await searchParams;
  const u = await needUser();
  const plan = await getPlan(u.id);
  const flags = new Map((await prisma.featureFlag.findMany()).map((f) => [f.id, f]));
  const status = plan.premium
    ? plan.sub?.lifetime ? "بريميوم دائم" : `بريميوم حتى ${plan.sub?.expiresAt?.toLocaleDateString("ar")}`
    : "الخطة المجانية";

  return (
    <>
      <Notice err={errText(sp.err)} ok={sp.ok && sp.ok !== "1" ? sp.ok : undefined} />
      <Card title="حالة الاشتراك"><b>{status}</b></Card>
      <Card title="تفعيل مفتاح بريميوم">
        <form action={redeemKey} className="flex gap-2">
          <input name="key" dir="ltr" placeholder="DARX-XXXX-XXXX-XXXX-XXXX" className={inputCls} autoComplete="off" />
          <button className={btnCls}>تفعيل</button>
        </form>
      </Card>
      <Card title={`ميزات البريميوم (${FEATURES.length})`}>
        <p className="mb-3 text-xs text-slate-500">الميزات المميزة بـ «قريباً» قيد التطوير ولا تعمل بعد.</p>
        {CATEGORIES.map((c) => (
          <details key={c.key} className="border-t border-slate-200 py-2">
            <summary className="cursor-pointer font-medium">{c.label}</summary>
            <ul className="mt-2 space-y-1 text-sm">
              {FEATURES.filter((f) => f.cat === c.key).map((f) => {
                const fl = flags.get(f.id);
                const off = fl && !fl.enabled;
                return (
                  <li key={f.id} className="flex items-center justify-between gap-2">
                    <span className={off ? "text-slate-400 line-through" : ""}>{f.label}</span>
                    {f.live ? <Badge tone="green">متاح</Badge> : <Badge>قريباً</Badge>}
                  </li>
                );
              })}
            </ul>
          </details>
        ))}
      </Card>
    </>
  );
}
