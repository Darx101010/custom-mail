import { prisma } from "@/lib/prisma";
import { requireAdminPage, hasPerm } from "@/lib/admin-session";
import { Badge, Card, btnDanger } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { revokeKeyAction } from "@/app/admin/actions";
import { KeyGenerator } from "./key-generator";

export const dynamic = "force-dynamic";

export default async function Keys() {
  const admin = await requireAdminPage("keys.view");
  const keys = await prisma.licenseKey.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  const tone = { UNUSED: "green", USED: "gray", REVOKED: "red" } as const;
  const txt = { UNUSED: "غير مستخدم", USED: "مستخدم", REVOKED: "ملغى" } as const;
  return (
    <>
      {(hasPerm(admin, "keys.generate") || hasPerm(admin, "keys.generate_bulk")) && <Card title="توليد مفاتيح بريميوم"><KeyGenerator /></Card>}
      <Card title={`المفاتيح (${keys.length})`}>
        {keys.map((k) => (
          <div key={k.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 py-2 text-sm">
            <div>
              <span className="font-mono text-xs text-slate-500">#{k.id.slice(0, 8)}</span> · {k.durationDays === 0 ? "دائم" : `${k.durationDays} يوم`} · {k.note ?? ""}
              <div className="text-xs text-slate-500">{k.createdAt.toLocaleString("ar")}{k.redeemedAt && hasPerm(admin, "keys.view_redeemers") ? ` · فُعّل ${k.redeemedAt.toLocaleString("ar")}` : ""}</div>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={tone[k.status]}>{txt[k.status]}</Badge>
              {k.status === "UNUSED" && hasPerm(admin, "keys.revoke") && (
                <form action={revokeKeyAction}><input type="hidden" name="id" value={k.id} /><ConfirmButton message="إلغاء المفتاح؟" className={btnDanger}>إلغاء</ConfirmButton></form>
              )}
            </div>
          </div>
        ))}
      </Card>
    </>
  );
}
