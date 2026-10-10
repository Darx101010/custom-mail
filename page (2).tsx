"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLogin() {
  const [f, setF] = useState({ username: "", password: "", totp: "" });
  const [needTotp, setNeedTotp] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    const r = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.ok) { router.replace(j.mustChange ? "/admin/change-password" : "/admin"); router.refresh(); return; }
    if (j.needTotp) { setNeedTotp(true); return; }
    setErr(j.error ?? "خطأ");
  }

  return (
    <main className="mx-auto grid min-h-screen max-w-sm place-items-center p-4">
      <form onSubmit={submit} className="w-full space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-lg font-bold">دخول المسؤول</h1>
        <input className="w-full rounded-xl border border-slate-300 px-3 py-2" placeholder="اسم المستخدم" autoComplete="username" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} />
        <input className="w-full rounded-xl border border-slate-300 px-3 py-2" type="password" placeholder="كلمة المرور" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        {needTotp && <input className="w-full rounded-xl border border-slate-300 px-3 py-2" inputMode="numeric" placeholder="رمز التحقق (2FA)" value={f.totp} onChange={(e) => setF({ ...f, totp: e.target.value })} autoFocus />}
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button disabled={busy} className="w-full rounded-xl bg-indigo-600 px-3 py-2 text-white disabled:opacity-50">دخول</button>
      </form>
    </main>
  );
}
