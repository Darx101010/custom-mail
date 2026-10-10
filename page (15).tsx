import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { limit } from "@/lib/ratelimit";

async function submit(fd: FormData) {
  "use server";
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!(await limit(`report:${ip}`, 5, 3600))) redirect("/report?sent=0");
  const address = String(fd.get("address") ?? "").slice(0, 320);
  const reason = String(fd.get("reason") ?? "").slice(0, 2000);
  const contact = String(fd.get("contact") ?? "").slice(0, 200);
  if (address && reason) await prisma.abuseReport.create({ data: { address, reason, contact: contact || null } });
  redirect("/report?sent=1");
}

export default async function Report({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const { sent } = await searchParams;
  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="mb-4 text-xl font-bold">الإبلاغ عن إساءة</h1>
      {sent === "1" && <p className="mb-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">وصل بلاغك، شكراً لك.</p>}
      {sent === "0" && <p className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">بلاغات كثيرة، حاول لاحقاً.</p>}
      <form action={submit} className="space-y-3">
        <input name="address" dir="ltr" placeholder="الإيميل المسيء" required className="w-full rounded-xl border border-slate-300 px-3 py-2" />
        <textarea name="reason" placeholder="سبب البلاغ" required rows={4} className="w-full rounded-xl border border-slate-300 px-3 py-2" />
        <input name="contact" placeholder="بريدك للتواصل (اختياري)" className="w-full rounded-xl border border-slate-300 px-3 py-2" />
        <button className="w-full rounded-xl bg-indigo-600 px-4 py-2 text-white">إرسال</button>
      </form>
    </main>
  );
}
