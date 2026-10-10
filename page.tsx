import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";
import { getSettings } from "@/lib/plan";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [session, s] = await Promise.all([auth(), getSettings()]);
  if (session?.user) redirect("/dashboard");
  return (
    <main className="mx-auto max-w-md p-6 pt-20 text-center">
      <h1 className="mb-2 text-3xl font-bold">{s.siteName}</h1>
      <p className="mb-8 text-slate-600">إيميلات دائمة تستقبل رسائل التحقق لحظياً. سجّل الدخول وابدأ في ثوانٍ.</p>
      {s.maintenance && <p className="mb-4 rounded-xl bg-amber-100 p-3 text-sm">الموقع في وضع الصيانة حالياً.</p>}
      <form action={async () => { "use server"; await signIn("google", { redirectTo: "/dashboard" }); }}>
        <button className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-white">الدخول عبر Google</button>
      </form>
      <p className="mt-8 text-xs text-slate-500"><a href="/report" className="underline">الإبلاغ عن إساءة</a></p>
    </main>
  );
}
