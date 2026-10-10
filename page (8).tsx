import { prisma } from "@/lib/prisma";
import { requireAdminPage, hasPerm } from "@/lib/admin-session";
import { PERM_GROUPS } from "@/lib/permissions";
import { Badge, Card, btnCls, btnGhost, inputCls } from "@/components/ui";
import { createAdmin, createRole, resetAdminPassword, saveRolePerms, setAdminRole, toggleAdmin } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

export default async function Admins() {
  const me = await requireAdminPage("admins.view");
  const [accounts, roles] = await Promise.all([
    prisma.adminAccount.findMany({ include: { role: true }, orderBy: { createdAt: "asc" } }),
    prisma.adminRole.findMany({ orderBy: { name: "asc" } }),
  ]);
  const roleSelect = (name: string, def?: string) => (
    <select name={name} defaultValue={def} className="rounded-xl border border-slate-300 px-2 py-2 text-sm">
      {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
    </select>
  );
  const canEditRoles = hasPerm(me, "roles.edit");

  return (
    <>
      {hasPerm(me, "admins.create") && (
        <Card title="إنشاء مسؤول">
          <form action={createAdmin} className="flex flex-wrap gap-2">
            <input name="username" placeholder="اسم المستخدم" dir="ltr" className={inputCls + " w-40"} required />
            <input name="password" type="password" placeholder="كلمة مرور مؤقتة (12+)" className={inputCls + " w-56"} required />
            {roleSelect("roleId")}
            <button className={btnCls}>إنشاء</button>
          </form>
          <p className="mt-2 text-xs text-slate-500">سيُجبر على تغيير كلمة المرور عند أول دخول.</p>
        </Card>
      )}

      <Card title="المسؤولون">
        {accounts.map((a) => (
          <div key={a.id} className="border-t border-slate-200 py-3 text-sm">
            <div className="flex items-center justify-between">
              <b>{a.username}</b>
              <div className="flex gap-1"><Badge>{a.role.name}</Badge>{!a.active && <Badge tone="red">معطّل</Badge>}{a.mustChange && <Badge tone="amber">كلمة مرور مؤقتة</Badge>}</div>
            </div>
            {a.id !== me.id && (
              <div className="mt-2 flex flex-wrap gap-2">
                {hasPerm(me, "admins.edit") && <form action={setAdminRole} className="flex gap-1"><input type="hidden" name="id" value={a.id} />{roleSelect("roleId", a.roleId)}<button className={btnGhost}>تغيير الدور</button></form>}
                {hasPerm(me, "admins.deactivate") && <form action={toggleAdmin}><input type="hidden" name="id" value={a.id} /><button className={btnGhost}>{a.active ? "تعطيل" : "تفعيل"}</button></form>}
                {hasPerm(me, "admins.reset_password") && <form action={resetAdminPassword} className="flex gap-1"><input type="hidden" name="id" value={a.id} /><input name="password" type="password" placeholder="كلمة مرور جديدة" className="w-40 rounded-xl border border-slate-300 px-2 text-sm" /><button className={btnGhost}>إعادة تعيين</button></form>}
              </div>
            )}
          </div>
        ))}
      </Card>

      {hasPerm(me, "roles.view") && (
        <Card title="الأدوار والصلاحيات (100 صلاحية)">
          {canEditRoles && (
            <form action={createRole} className="mb-3 flex gap-2"><input name="name" placeholder="اسم دور جديد (A-Z)" dir="ltr" className={inputCls + " w-56"} /><button className={btnGhost}>إنشاء دور</button></form>
          )}
          {roles.map((r) => {
            const isSuper = r.permissions.includes("*");
            return (
              <details key={r.id} className="border-t border-slate-200 py-2">
                <summary className="cursor-pointer font-medium">{r.name} <span className="text-xs text-slate-500">({isSuper ? "كل الصلاحيات" : `${r.permissions.length} صلاحية`})</span></summary>
                {isSuper ? <p className="mt-2 text-sm text-slate-500">دور المالك ثابت ولا يُعدَّل.</p> : (
                  <form action={saveRolePerms} className="mt-2">
                    <input type="hidden" name="id" value={r.id} />
                    {PERM_GROUPS.map((g) => (
                      <fieldset key={g.key} className="mb-3">
                        <legend className="text-sm font-bold">{g.label}</legend>
                        <div className="grid grid-cols-1 gap-1 md:grid-cols-2">
                          {g.perms.map(([id, label]) => (
                            <label key={id} className="flex items-center gap-2 text-sm">
                              <input type="checkbox" name={`p_${id}`} defaultChecked={r.permissions.includes(id)} disabled={!canEditRoles || (!me.role.permissions.includes("*") && !me.role.permissions.includes(id))} />
                              {label}
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    ))}
                    {canEditRoles && <button className={btnCls}>حفظ صلاحيات {r.name}</button>}
                  </form>
                )}
              </details>
            );
          })}
        </Card>
      )}
    </>
  );
}
