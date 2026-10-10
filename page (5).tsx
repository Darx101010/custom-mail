import { prisma } from "@/lib/prisma";
import { requireAdminPage, hasPerm } from "@/lib/admin-session";
import { getSettings } from "@/lib/plan";
import { CATEGORIES, FEATURES } from "@/lib/features";
import { Badge, Card, btnCls, inputCls } from "@/components/ui";
import { saveFeatures, saveLimits } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

export default async function Plans() {
  const admin = await requireAdminPage("plans.view");
  const s = await getSettings();
  const flags = new Map((await prisma.featureFlag.findMany()).map((f) => [f.id, f]));
  const canEdit = hasPerm(admin, "plans.edit_features");
  const canTier = hasPerm(admin, "plans.set_tier");

  return (
    <>
      {hasPerm(admin, "plans.edit_limits") && (
        <Card title="الحدود ومدد الاحتفاظ">
          <form action={saveLimits} className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <label className="text-sm">حد المجاني<input name="freeMax" type="number" defaultValue={s.freeMax} className={inputCls} /></label>
            <label className="text-sm">حد البريميوم<input name="premMax" type="number" defaultValue={s.premMax} className={inputCls} /></label>
            <label className="text-sm">احتفاظ المجاني (يوم)<input name="freeRet" type="number" defaultValue={s.freeRetentionDays} className={inputCls} /></label>
            <label className="text-sm">احتفاظ البريميوم (يوم)<input name="premRet" type="number" defaultValue={s.premRetentionDays} className={inputCls} /></label>
            <div className="col-span-2 md:col-span-4"><button className={btnCls}>حفظ</button></div>
          </form>
        </Card>
      )}
      <Card title={`الميزات (${FEATURES.length})`}>
        <form action={saveFeatures}>
          {CATEGORIES.map((c) => (
            <details key={c.key} className="border-t border-slate-200 py-2">
              <summary className="cursor-pointer font-medium">{c.label}</summary>
              <div className="mt-2 space-y-1 text-sm">
                {FEATURES.filter((f) => f.cat === c.key).map((f) => {
                  const fl = flags.get(f.id);
                  return (
                    <div key={f.id} className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-2">
                        <input type="checkbox" name={`en_${f.id}`} defaultChecked={fl ? fl.enabled : true} disabled={!canEdit} />
                        <span>{f.label}</span>
                      </label>
                      <span className="flex items-center gap-2">
                        {f.live ? <Badge tone="green">منفّذة</Badge> : <Badge>قريباً</Badge>}
                        <select name={`tier_${f.id}`} defaultValue={fl?.tier ?? "PREMIUM"} disabled={!canTier} className="rounded-lg border border-slate-300 px-1 text-xs">
                          <option value="PREMIUM">بريميوم</option><option value="FREE">مجاني</option>
                        </select>
                      </span>
                    </div>
                  );
                })}
              </div>
            </details>
          ))}
          {canEdit && <button className={btnCls + " mt-3"}>حفظ الميزات</button>}
        </form>
      </Card>
    </>
  );
}
