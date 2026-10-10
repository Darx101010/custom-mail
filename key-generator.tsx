"use client";
import { useActionState } from "react";
import { generateKeysAction } from "@/app/admin/actions";

export function KeyGenerator() {
  const [state, action, pending] = useActionState(generateKeysAction, {} as { keys?: string[]; error?: string });
  const cls = "rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm";
  return (
    <div>
      <form action={action} className="flex flex-wrap gap-2">
        <select name="days" className={cls}><option value="1">يوم واحد</option><option value="7">أسبوع</option><option value="30">شهر</option><option value="90">3 أشهر</option><option value="365">سنة</option><option value="0">دائم</option></select>
        <select name="qty" className={cls}>{[1, 5, 10, 25, 50, 100].map((n) => <option key={n}>{n}</option>)}</select>
        <input name="note" placeholder="ملاحظة (مثلاً اسم المشتري)" className={cls + " flex-1 min-w-40"} maxLength={80} />
        <button disabled={pending} className="rounded-xl bg-amber-500 px-3 py-2 text-sm text-black disabled:opacity-50">توليد</button>
      </form>
      {state?.error && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
      {state?.keys && (
        <div className="mt-3">
          <p className="mb-1 text-xs text-red-600">انسخ المفاتيح الآن. لن تظهر مرة أخرى (يُحفظ منها بصمة فقط).</p>
          <textarea readOnly dir="ltr" className="h-32 w-full rounded-xl border border-slate-300 p-2 font-mono text-sm" value={state.keys.join("\n")} />
          <button type="button" className="mt-2 rounded-xl border border-slate-300 px-3 py-1 text-sm" onClick={() => navigator.clipboard.writeText(state.keys!.join("\n"))}>نسخ الكل</button>
        </div>
      )}
    </div>
  );
}
