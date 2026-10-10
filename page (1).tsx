"use client";
import { useActionState } from "react";
import { changePassword } from "../actions";

export default function ChangePassword() {
  const [state, action, pending] = useActionState(changePassword, {} as { error?: string });
  const cls = "w-full rounded-xl border border-slate-300 px-3 py-2";
  return (
    <main className="mx-auto grid min-h-screen max-w-sm place-items-center p-4">
      <form action={action} className="w-full space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-lg font-bold">تغيير كلمة المرور (إجباري)</h1>
        <p className="text-sm text-slate-500">كلمة المرور المبدئية مؤقتة. اختر كلمة قوية: 12 حرفاً على الأقل بأحرف وأرقام.</p>
        <input name="current" type="password" placeholder="كلمة المرور الحالية" className={cls} autoComplete="current-password" required />
        <input name="next" type="password" placeholder="كلمة المرور الجديدة" className={cls} autoComplete="new-password" required />
        <input name="again" type="password" placeholder="تأكيد كلمة المرور" className={cls} autoComplete="new-password" required />
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button disabled={pending} className="w-full rounded-xl bg-indigo-600 px-3 py-2 text-white disabled:opacity-50">حفظ</button>
      </form>
    </main>
  );
}
