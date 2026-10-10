import React from "react";

export const cx = (...a: (string | false | undefined)[]) => a.filter(Boolean).join(" ");

export function Card({ title, children, className, style }: { title?: string; children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <section style={style} className={cx("rounded-2xl border border-slate-200 bg-white p-4 shadow-sm mb-4", className)}>
      {title && <h2 className="mb-3 text-base font-bold">{title}</h2>}
      {children}
    </section>
  );
}
export function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}
export function Badge({ children, tone = "gray" }: { children: React.ReactNode; tone?: "gray" | "green" | "red" | "amber" }) {
  const t = { gray: "bg-slate-100 text-slate-700", green: "bg-emerald-100 text-emerald-700", red: "bg-red-100 text-red-700", amber: "bg-amber-100 text-amber-800" }[tone];
  return <span className={cx("inline-block rounded-full px-2 py-0.5 text-xs", t)}>{children}</span>;
}
export const inputCls = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm";
export const btnCls = "rounded-xl bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-700 disabled:opacity-50";
export const btnGhost = "rounded-xl border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50";
export const btnDanger = "rounded-xl bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700";

export function Notice({ err, ok }: { err?: string; ok?: string }) {
  if (!err && !ok) return null;
  return (
    <div className={cx("mb-3 rounded-xl px-3 py-2 text-sm", err ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700")}>
      {err || ok}
    </div>
  );
}
