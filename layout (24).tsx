import Link from "next/link";
import { needUser } from "@/lib/session";
import { getPlan } from "@/lib/plan";
import { logout } from "./actions";
import { Badge } from "@/components/ui";

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const u = await needUser();
  const plan = await getPlan(u.id);
  return (
    <div className="mx-auto max-w-3xl p-4">
      <header className="mb-4 flex items-center justify-between gap-2">
        <Link href="/dashboard" className="text-lg font-bold">{plan.settings.siteName}</Link>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/premium"><Badge tone={plan.premium ? "amber" : "gray"}>{plan.premium ? "⭐ بريميوم" : "مجاني"}</Badge></Link>
          <form action={logout}><button className="text-sm text-slate-500 underline">خروج</button></form>
        </div>
      </header>
      {plan.settings.announcement && <div className="mb-3 rounded-xl bg-amber-100 p-3 text-sm">{plan.settings.announcement}</div>}
      {plan.settings.maintenance && <div className="mb-3 rounded-xl bg-red-100 p-3 text-sm">الموقع في وضع الصيانة حالياً.</div>}
      {children}
    </div>
  );
}
