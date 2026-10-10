import { prisma } from "@/lib/prisma";
import { requireAdminPage, hasPerm } from "@/lib/admin-session";
import { Badge, Card, btnCls, btnDanger, btnGhost, inputCls } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { addDomain, defaultDomain, premiumDomain, removeDomain, toggleDomain } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

export default async function Domains() {
  const admin = await requireAdminPage("domains.view");
  const domains = await prisma.domain.findMany({ orderBy: [{ isDefault: "desc" }, { name: "asc" }] });
  const hid = (id: string) => <input type="hidden" name="id" value={id} />;
  return (
    <>
      {hasPerm(admin, "domains.add") && (
        <Card title="إضافة نطاق">
          <form action={addDomain} className="flex flex-wrap items-center gap-2">
            <input name="name" dir="ltr" placeholder="example.com" className={inputCls + " flex-1"} />
            <label className="text-sm"><input type="checkbox" name="premiumOnly" /> للبريميوم فقط</label>
            <button className={btnCls}>إضافة</button>
          </form>
          <p className="mt-2 text-xs text-slate-500">تذكير: أضف النطاق في Cloudflare Email Routing وفعّل Catch-all قبل استخدامه.</p>
        </Card>
      )}
      <Card title="النطاقات">
        {domains.map((d) => (
          <div key={d.id} className="border-t border-slate-200 py-3">
            <div className="flex items-center justify-between">
              <b dir="ltr">{d.name}</b>
              <div className="flex gap-1">
                {d.isDefault && <Badge tone="green">افتراضي</Badge>}
                {d.premiumOnly && <Badge tone="amber">بريميوم</Badge>}
                {!d.active && <Badge tone="red">معطّل</Badge>}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {hasPerm(admin, "domains.activate") && <form action={toggleDomain}>{hid(d.id)}<button className={btnGhost}>{d.active ? "تعطيل" : "تفعيل"}</button></form>}
              {hasPerm(admin, "domains.set_premium_only") && !d.isDefault && <form action={premiumDomain}>{hid(d.id)}<button className={btnGhost}>{d.premiumOnly ? "إتاحته للجميع" : "حصره للبريميوم"}</button></form>}
              {hasPerm(admin, "domains.set_default") && !d.isDefault && <form action={defaultDomain}>{hid(d.id)}<button className={btnGhost}>تعيين كافتراضي</button></form>}
              {hasPerm(admin, "domains.remove") && !d.isDefault && <form action={removeDomain}>{hid(d.id)}<ConfirmButton message="حذف النطاق؟" className={btnDanger}>حذف</ConfirmButton></form>}
            </div>
          </div>
        ))}
      </Card>
    </>
  );
}
