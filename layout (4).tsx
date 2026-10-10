import Link from "next/link";
import { requireAdminPage, hasPerm } from "@/lib/admin-session";
import { NAV } from "@/lib/permissions";
import { adminLogout } from "@/app/admin/actions";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdminPage();
  return (
    <div className="mx-auto max-w-6xl p-4">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="font-bold">لوحة التحكم <span className="text-xs font-normal text-slate-500">({admin.username} · {admin.role.name})</span></div>
        <form action={adminLogout}><button className="text-sm text-slate-500 underline">خروج</button></form>
      </header>
      <nav className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {NAV.filter((n) => hasPerm(admin, n.perm)).map((n) => (
          <Link key={n.href} href={n.href} className="whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-100">{n.label}</Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
