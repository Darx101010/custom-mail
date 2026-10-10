import { requireAdminPage, hasPerm } from "@/lib/admin-session";
import { getSettings } from "@/lib/plan";
import { Card, btnCls, inputCls } from "@/components/ui";
import { saveSettings } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

export default async function Settings() {
  const admin = await requireAdminPage("settings.view");
  const s = await getSettings();
  const can = hasPerm(admin, "settings.edit_general");
  return (
    <Card title="إعدادات الموقع">
      <form action={saveSettings} className="max-w-lg space-y-3">
        <label className="block text-sm">اسم الموقع<input name="siteName" defaultValue={s.siteName} className={inputCls} disabled={!can} /></label>
        <label className="block text-sm">إعلان أعلى الموقع (فارغ = إخفاء)<input name="announcement" defaultValue={s.announcement} className={inputCls} disabled={!hasPerm(admin, "settings.announcement")} /></label>
        <label className="block text-sm">الأسماء المحجوزة (مفصولة بفاصلة)<input name="reserved" dir="ltr" defaultValue={s.reserved} className={inputCls} disabled={!hasPerm(admin, "settings.reserved_names")} /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="registrationOpen" defaultChecked={s.registrationOpen} disabled={!hasPerm(admin, "settings.registration")} /> التسجيل مفتوح للمستخدمين الجدد</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="maintenance" defaultChecked={s.maintenance} disabled={!hasPerm(admin, "settings.maintenance")} /> وضع الصيانة</label>
        {can && <button className={btnCls}>حفظ</button>}
      </form>
    </Card>
  );
}
