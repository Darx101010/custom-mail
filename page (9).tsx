import { prisma } from "@/lib/prisma";
import { requireAdminPage, hasPerm } from "@/lib/admin-session";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Audit() {
  const admin = await requireAdminPage("audit.view");
  const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  const showIp = hasPerm(admin, "audit.view_ips");
  return (
    <Card title="سجل التدقيق (آخر 200)">
      {logs.map((l) => (
        <div key={l.id} className="border-t border-slate-200 py-2 text-sm">
          <span className="text-xs text-slate-500">{l.createdAt.toLocaleString("ar")}</span> · <b>{l.actor}</b> · {l.action}
          {l.detail ? <span className="text-slate-500"> — {l.detail}</span> : null}
          {showIp && l.ip ? <span className="text-xs text-slate-400" dir="ltr"> [{l.ip}]</span> : null}
        </div>
      ))}
    </Card>
  );
}
