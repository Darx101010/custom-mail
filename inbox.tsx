"use client";
import useSWR from "swr";
import { useState } from "react";

type Msg = {
  id: string; fromAddr: string; fromName: string | null; subject: string; text: string | null; html: string | null;
  read: boolean; starred: boolean; note: string | null; deletedAt: string | null; receivedAt: string;
};
const fetcher = (u: string) => fetch(u).then((r) => (r.ok ? r.json() : []));
const otp = (m: Msg) => ((m.subject + " " + (m.text ?? "")).match(/\b\d{4,8}\b/) ?? [""])[0];
const CSP = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><base target="_blank">`;
const btn = "rounded-xl border border-slate-300 px-2 py-1 text-xs";

export function Inbox({ mailboxId, canNote, canTrash, canBulk }: { mailboxId: string; canNote: boolean; canTrash: boolean; canBulk: boolean }) {
  const [trash, setTrash] = useState(false);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [selMode, setSelMode] = useState(false);
  const { data = [], mutate } = useSWR<Msg[]>(`/api/inbox?mailboxId=${mailboxId}${trash ? "&trash=1" : ""}`, fetcher, { refreshInterval: 4000 });
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const shown = data.filter((m) => !q || (m.fromAddr + m.subject + (m.text ?? "")).toLowerCase().includes(q.toLowerCase()));

  async function patch(id: string, body: object) {
    await fetch("/api/inbox", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...body }) });
    mutate();
  }
  async function del(id: string) {
    if (trash && !confirm("حذف نهائي؟")) return;
    await fetch(`/api/inbox?id=${id}`, { method: "DELETE" });
    mutate();
  }
  async function bulk(action: "read" | "delete") {
    const ids = Object.keys(sel).filter((k) => sel[k]);
    if (!ids.length) return;
    await fetch("/api/inbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, action }) });
    setSel({});
    mutate();
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <input className="min-w-40 flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="🔍 بحث" value={q} onChange={(e) => setQ(e.target.value)} />
        {canTrash && <button className={btn} onClick={() => setTrash(!trash)}>{trash ? "الوارد" : "🗑 السلة"}</button>}
        {canBulk && <button className={btn} onClick={() => { setSelMode(!selMode); setSel({}); }}>{selMode ? "إلغاء التحديد" : "تحديد"}</button>}
        {selMode && <><button className={btn} onClick={() => bulk("read")}>قراءة المحدد</button><button className="rounded-xl bg-red-600 px-2 py-1 text-xs text-white" onClick={() => bulk("delete")}>حذف المحدد</button></>}
      </div>
      {!shown.length && <p className="text-sm text-slate-500">{trash ? "السلة فارغة." : "لا رسائل بعد. تظهر هنا لحظياً."}</p>}
      {shown.map((m) => {
        const c = otp(m);
        const isOpen = open === m.id;
        return (
          <div key={m.id} className="border-t border-slate-200 py-3">
            <div className="flex items-start gap-2">
              {selMode && <input type="checkbox" className="mt-1" checked={!!sel[m.id]} onChange={(e) => setSel({ ...sel, [m.id]: e.target.checked })} />}
              <button className="w-full text-start" onClick={() => { setOpen(isOpen ? null : m.id); if (!m.read) patch(m.id, { read: true }); }}>
                <div className={m.read ? "" : "font-bold"}>{m.starred ? "⭐ " : ""}{m.subject || "(بدون عنوان)"}</div>
                <div className="text-xs text-slate-500" dir="ltr">{m.fromAddr} · {new Date(m.receivedAt).toLocaleString("ar")}</div>
              </button>
            </div>
            {m.note && <div className="mt-1 text-xs text-slate-500">📝 {m.note}</div>}
            {c && (
              <button className="mt-2 rounded-xl bg-indigo-600 px-3 py-1 text-xs text-white" onClick={() => navigator.clipboard.writeText(c)}>نسخ الرمز {c}</button>
            )}
            {isOpen && (
              <div className="mt-2">
                {m.html ? (
                  <iframe title={m.id} sandbox="" referrerPolicy="no-referrer" srcDoc={CSP + m.html} className="h-72 w-full rounded-xl border border-slate-200 bg-white" />
                ) : (
                  <pre className="whitespace-pre-wrap break-words text-sm">{m.text}</pre>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button className={btn} onClick={() => patch(m.id, { starred: !m.starred })}>{m.starred ? "إزالة النجمة" : "نجمة"}</button>
                  {canNote && <button className={btn} onClick={() => { const n = prompt("ملاحظتك:", m.note ?? ""); if (n !== null) patch(m.id, { note: n }); }}>ملاحظة ⭐</button>}
                  {trash && <button className={btn} onClick={() => patch(m.id, { restore: true })}>استرجاع</button>}
                  <button className="rounded-xl bg-red-600 px-2 py-1 text-xs text-white" onClick={() => del(m.id)}>{trash ? "حذف نهائي" : "حذف"}</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
