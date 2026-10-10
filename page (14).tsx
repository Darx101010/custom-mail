import { prisma } from "@/lib/prisma";
import { requireAdminPage, hasPerm } from "@/lib/admin-session";
import { Badge, Card, btnGhost } from "@/components/ui";
import { resolveReport } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

export default async function Security() {
  const admin = await requireAdminPage("security.view_abuse");
  const reports = await prisma.abuseReport.findMany({ orderBy: [{ resolved: "asc" }, { createdAt: "desc" }], take: 100 });
  return (
    <Card title="بلاغات الإساءة">
      {!reports.length && <p className="text-sm text-slate-500">لا توجد بلاغات.</p>}
      {reports.map((r) => (
        <div key={r.id} className="border-t border-slate-200 py-3 text-sm">
          <div className="flex items-center justify-between"><b dir="ltr">{r.address}</b><Badge tone={r.resolved ? "green" : "red"}>{r.resolved ? "مغلق" : "مفتوح"}</Badge></div>
          <p className="mt-1 whitespace-pre-wrap">{r.reason}</p>
          <div className="text-xs text-slate-500">{r.createdAt.toLocaleString("ar")} {r.contact ? `· ${r.contact}` : ""}</div>
          {!r.resolved && hasPerm(admin, "security.resolve_abuse") && (
            <form action={resolveReport} className="mt-2"><input type="hidden" name="id" value={r.id} /><button className={btnGhost}>إغلاق البلاغ</button></form>
          )}
        </div>
      ))}
    </Card>
  );
}
