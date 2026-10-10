import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "بريدي الدائم", description: "إيميلات دائمة تستقبل الرسائل لحظياً" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="min-h-screen bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}
