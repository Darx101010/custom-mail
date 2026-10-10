# مشروع البريد الدائم + لوحة تحكم الأدمن (Next.js 15 + Prisma + Auth.js)

> ملاحظات مهمة قبل البدء
> - كلمة مرور الأدمن `Darx` ضعيفة جداً. وضعتها كقيمة مبدئية في `.env` فقط (لا تُكتب داخل الكود)، وغيّرها فور النشر.
> - استقبال الإيميلات يحتاج **MX فقط**. أما SPF/DKIM فمهمان للإرسال (وتحسين السمعة). الشرح في القسم 5.
> - امتداد `.com` يساعد، لكن بعض المنصات (Sony/Epic وغيرها) قد ترفض النطاقات المعروفة كنطاقات بريد مؤقت. استخدم نطاقاً جديداً غير مشهور وليس مشاركاً مع خدمات مؤقتة.

---

## 1) هيكلية المشروع

```
custom-mail/
├── prisma/
│   └── schema.prisma
├── src/
│   ├── middleware.ts                  # حماية مسارات الأدمن
│   ├── auth.ts                        # إعداد Auth.js (Google)
│   ├── lib/
│   │   ├── prisma.ts
│   │   ├── admin-session.ts           # إنشاء/فحص جلسة الأدمن (JWT)
│   │   └── settings.ts                # قراءة إعدادات الموقع
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                   # الصفحة الرئيسية + زر Google
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/route.ts
│   │   │   ├── inbound/route.ts       # Webhook استقبال الرسائل
│   │   │   ├── inbox/route.ts         # (مستخدم) جلب الرسائل للتحديث اللحظي
│   │   │   └── admin/
│   │   │       ├── login/route.ts
│   │   │       └── logout/route.ts
│   │   ├── dashboard/                 # ===== مسارات المستخدم =====
│   │   │   ├── layout.tsx             # يتحقق من الجلسة
│   │   │   ├── page.tsx               # قائمة الإيميلات + إنشاء إيميل
│   │   │   ├── actions.ts             # createMailbox / deleteMailbox
│   │   │   └── [mailboxId]/page.tsx   # Inbox لحظي
│   │   └── admin/                     # ===== مسارات الأدمن =====
│   │       ├── login/page.tsx
│   │       ├── page.tsx               # الإحصائيات + الجداول
│   │       ├── actions.ts             # كل أوامر الأدمن (Server Actions)
│   │       └── _components/
│   │           └── admin-panel.tsx    # واجهة لوحة التحكم (Client)
│   └── components/ui/                 # Shadcn (card, table, button, tabs, input, badge)
├── workers/
│   └── email-worker.ts                # Cloudflare Email Worker
├── .env
└── package.json
```

التثبيت:

```bash
npx create-next-app@latest custom-mail --ts --tailwind --app --src-dir
cd custom-mail
npm i prisma @prisma/client next-auth@beta @auth/prisma-adapter jose zod
npx shadcn@latest init
npx shadcn@latest add card table button tabs input badge
npx prisma init
```

`.env`:

```env
DATABASE_URL="postgresql://..."          # Supabase أو أي PostgreSQL
AUTH_SECRET="..."                        # openssl rand -base64 32
AUTH_GOOGLE_ID="..."
AUTH_GOOGLE_SECRET="..."

ADMIN_PASSWORD="Darx"                    # غيّرها بعد النشر
ADMIN_JWT_SECRET="..."                   # openssl rand -base64 32 (مختلف عن AUTH_SECRET)
INBOUND_WEBHOOK_SECRET="..."             # سر مشترك مع Cloudflare Worker
MAIL_DOMAIN="yourdomain.com"
```

---

## 2) قاعدة البيانات (`prisma/schema.prisma`)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  USER
  ADMIN
}

model User {
  id            String    @id @default(cuid())
  name          String?
  email         String    @unique
  emailVerified DateTime?
  image         String?
  role          Role      @default(USER)
  banned        Boolean   @default(false)
  createdAt     DateTime  @default(now())

  accounts  Account[]
  sessions  Session[]
  mailboxes Mailbox[]
}

// جداول Auth.js المطلوبة
model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}

model Mailbox {
  id        String   @id @default(cuid())
  address   String   @unique            // مثال: ahmed123@yourdomain.com (دائماً lowercase)
  userId    String
  isActive  Boolean  @default(true)     // الأدمن يقدر يعطّله/يحظره
  createdAt DateTime @default(now())

  user     User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  messages Message[]

  @@index([userId])
}

model Message {
  id         String   @id @default(cuid())
  mailboxId  String
  fromAddr   String
  fromName   String?
  subject    String   @default("")
  text       String?  @db.Text
  html       String?  @db.Text
  size       Int      @default(0)
  read       Boolean  @default(false)
  receivedAt DateTime @default(now())

  mailbox Mailbox @relation(fields: [mailboxId], references: [id], onDelete: Cascade)

  @@index([mailboxId, receivedAt])
  @@index([receivedAt])
}

// صف واحد فقط (id = 1)
model SiteSetting {
  id                   Int     @id @default(1)
  siteName             String  @default("Custom Mail")
  domain               String  @default("yourdomain.com")
  maxMailboxesPerUser  Int     @default(5)
  registrationOpen     Boolean @default(true)
}
```

لتحويل أول مستخدم إلى `ADMIN` ضمن قاعدة البيانات (اختياري، لأن لوحة الأدمن مستقلة بكلمة مرورها):

```sql
UPDATE "User" SET role = 'ADMIN' WHERE email = 'you@gmail.com';
```

ثم:

```bash
npx prisma migrate dev --name init
```

`src/lib/prisma.ts`:

```ts
import { PrismaClient } from "@prisma/client";

const g = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = g.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") g.prisma = prisma;
```

`src/auth.ts` (Google للمستخدمين العاديين):

```ts
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [Google],
  session: { strategy: "database" },
  callbacks: {
    async signIn({ user }) {
      const dbUser = user.email
        ? await prisma.user.findUnique({ where: { email: user.email } })
        : null;
      if (dbUser?.banned) return false; // المحظور لا يدخل
      return true;
    },
    async session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
});
```

`src/app/api/auth/[...nextauth]/route.ts`:

```ts
import { handlers } from "@/auth";
export const { GET, POST } = handlers;
```

---

## 3) حماية مسارات الأدمن

نظام الأدمن **مستقل** عن Google: كلمة مرور → JWT موقّع في كوكي `HttpOnly`.
المقارنة بكلمة المرور تتم في الخادم فقط، ولا تظهر في الواجهة أو الكود.

`src/lib/admin-session.ts`:

```ts
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { createHash, timingSafeEqual } from "crypto";

export const ADMIN_COOKIE = "admin_session";
const secret = () => new TextEncoder().encode(process.env.ADMIN_JWT_SECRET!);

export function checkAdminPassword(input: string): boolean {
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(process.env.ADMIN_PASSWORD ?? "").digest();
  return timingSafeEqual(a, b); // مقارنة ثابتة الزمن
}

export async function createAdminToken() {
  return new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d") // جلسة مستمرة 7 أيام
    .sign(secret());
}

export async function verifyAdminToken(token?: string) {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.role === "admin";
  } catch {
    return false;
  }
}

// يُستخدم داخل Server Actions و Server Components
export async function requireAdmin() {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!(await verifyAdminToken(token))) throw new Error("UNAUTHORIZED");
}
```

`src/middleware.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const PUBLIC = ["/admin/login", "/api/admin/login"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.includes(pathname)) return NextResponse.next();

  const token = req.cookies.get("admin_session")?.value;
  let ok = false;
  if (token) {
    try {
      const { payload } = await jwtVerify(
        token,
        new TextEncoder().encode(process.env.ADMIN_JWT_SECRET!)
      );
      ok = payload.role === "admin";
    } catch {}
  }

  if (!ok) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/admin/login", req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*", "/api/admin/:path*"] };
```

`src/app/api/admin/login/route.ts` (مع حد محاولات بسيط):

```ts
import { NextRequest, NextResponse } from "next/server";
import { checkAdminPassword, createAdminToken, ADMIN_COOKIE } from "@/lib/admin-session";

// ملاحظة: على Vercel/serverless استخدم Upstash Redis بدل الذاكرة
const attempts = new Map<string, { n: number; t: number }>();

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  const rec = attempts.get(ip);
  if (rec && Date.now() - rec.t < 15 * 60_000 && rec.n >= 5) {
    return NextResponse.json({ error: "محاولات كثيرة، حاول لاحقاً" }, { status: 429 });
  }

  const { password } = await req.json();
  if (typeof password !== "string" || !checkAdminPassword(password)) {
    attempts.set(ip, { n: (rec && Date.now() - rec.t < 15 * 60_000 ? rec.n : 0) + 1, t: Date.now() });
    return NextResponse.json({ error: "كلمة المرور غير صحيحة" }, { status: 401 });
  }

  attempts.delete(ip);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, await createAdminToken(), {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
```

`src/app/api/admin/logout/route.ts`:

```ts
import { NextResponse } from "next/server";
import { ADMIN_COOKIE } from "@/lib/admin-session";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(ADMIN_COOKIE);
  return res;
}
```

`src/app/admin/login/page.tsx`:

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function AdminLogin() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (r.ok) router.replace("/admin");
    else setError((await r.json()).error ?? "خطأ");
  }

  return (
    <div dir="rtl" className="min-h-screen grid place-items-center bg-muted/40">
      <Card className="w-full max-w-sm">
        <CardHeader><CardTitle>دخول المسؤول</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-3">
            <Input type="password" placeholder="كلمة المرور" value={password}
                   onChange={(e) => setPassword(e.target.value)} autoFocus />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full">دخول</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

---

## 4) لوحة تحكم الأدمن

### أوامر الأدمن — `src/app/admin/actions.ts`

```ts
"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-session";

const refresh = () => revalidatePath("/admin");

export async function setUserBanned(userId: string, banned: boolean) {
  await requireAdmin();
  await prisma.user.update({ where: { id: userId }, data: { banned } });
  if (banned) {
    await prisma.session.deleteMany({ where: { userId } }); // إنهاء جلساته فوراً
    await prisma.mailbox.updateMany({ where: { userId }, data: { isActive: false } });
  }
  refresh();
}

export async function deleteUser(userId: string) {
  await requireAdmin();
  await prisma.user.delete({ where: { id: userId } }); // cascade يحذف إيميلاته ورسائله
  refresh();
}

export async function setMailboxActive(mailboxId: string, isActive: boolean) {
  await requireAdmin();
  await prisma.mailbox.update({ where: { id: mailboxId }, data: { isActive } });
  refresh();
}

export async function deleteMailbox(mailboxId: string) {
  await requireAdmin();
  await prisma.mailbox.delete({ where: { id: mailboxId } });
  refresh();
}

export async function deleteMessage(messageId: string) {
  await requireAdmin();
  await prisma.message.delete({ where: { id: messageId } });
  refresh();
}

const settingsSchema = z.object({
  siteName: z.string().min(1).max(60),
  domain: z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i),
  maxMailboxesPerUser: z.coerce.number().int().min(1).max(1000),
  registrationOpen: z.boolean(),
});

export async function updateSettings(input: z.infer<typeof settingsSchema>) {
  await requireAdmin();
  const data = settingsSchema.parse(input);
  await prisma.siteSetting.upsert({
    where: { id: 1},
    update: data,
    create: { id: 1, ...data },
  });
  refresh();
}
```

### الصفحة (جلب الإحصائيات) — `src/app/admin/page.tsx`

```tsx
import { prisma } from "@/lib/prisma";
import { AdminPanel } from "./_components/admin-panel";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [users, mailboxes, messages, stats, settings] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" }, take: 200,
      select: { id: true, name: true, email: true, banned: true, role: true,
                createdAt: true, _count: { select: { mailboxes: true } } },
    }),
    prisma.mailbox.findMany({
      orderBy: { createdAt: "desc" }, take: 200,
      select: { id: true, address: true, isActive: true, createdAt: true,
                user: { select: { email: true } }, _count: { select: { messages: true } } },
    }),
    prisma.message.findMany({
      orderBy: { receivedAt: "desc" }, take: 100,
      select: { id: true, fromAddr: true, subject: true, receivedAt: true,
                mailbox: { select: { address: true } } },
    }),
    Promise.all([
      prisma.user.count(),
      prisma.mailbox.count({ where: { isActive: true } }),
      prisma.message.count({ where: { receivedAt: { gte: startOfDay } } }),
      prisma.message.count(),
    ]),
    prisma.siteSetting.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } }),
  ]);

  return (
    <AdminPanel
      stats={{ users: stats[0], activeMailboxes: stats[1], messagesToday: stats[2], messagesTotal: stats[3] }}
      users={JSON.parse(JSON.stringify(users))}
      mailboxes={JSON.parse(JSON.stringify(mailboxes))}
      messages={JSON.parse(JSON.stringify(messages))}
      settings={settings}
    />
  );
}
```

### واجهة اللوحة — `src/app/admin/_components/admin-panel.tsx`

```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  setUserBanned, deleteUser, setMailboxActive, deleteMailbox, deleteMessage, updateSettings,
} from "../actions";

type Props = {
  stats: { users: number; activeMailboxes: number; messagesToday: number; messagesTotal: number };
  users: any[]; mailboxes: any[]; messages: any[];
  settings: { siteName: string; domain: string; maxMailboxesPerUser: number; registrationOpen: boolean };
};

const fmt = (d: string) => new Date(d).toLocaleString("ar");

export function AdminPanel({ stats, users, mailboxes, messages, settings }: Props) {
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  const [form, setForm] = useState(settings);
  const router = useRouter();

  const run = (fn: () => Promise<unknown>, confirmMsg?: string) => {
    if (confirmMsg && !confirm(confirmMsg)) return;
    start(async () => { await fn(); });
  };

  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/admin/login");
  };

  const match = (s: string) => s.toLowerCase().includes(q.toLowerCase());

  const cards = [
    { label: "المستخدمون", value: stats.users },
    { label: "الإيميلات النشطة", value: stats.activeMailboxes },
    { label: "رسائل اليوم", value: stats.messagesToday },
    { label: "إجمالي الرسائل", value: stats.messagesTotal },
  ];

  return (
    <div dir="rtl" className="mx-auto max-w-6xl p-4 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">لوحة التحكم — {settings.siteName}</h1>
        <Button variant="outline" onClick={logout}>خروج</Button>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="pb-1"><CardTitle className="text-sm text-muted-foreground">{c.label}</CardTitle></CardHeader>
            <CardContent className="text-3xl font-bold">{c.value}</CardContent>
          </Card>
        ))}
      </div>

      <Input placeholder="بحث…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">المستخدمون</TabsTrigger>
          <TabsTrigger value="mailboxes">الإيميلات</TabsTrigger>
          <TabsTrigger value="messages">الرسائل</TabsTrigger>
          <TabsTrigger value="settings">الإعدادات</TabsTrigger>
        </TabsList>

        {/* المستخدمون */}
        <TabsContent value="users" className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>الإيميل</TableHead><TableHead>الإيميلات</TableHead>
              <TableHead>الحالة</TableHead><TableHead>التسجيل</TableHead><TableHead />
            </TableRow></TableHeader>
            <TableBody>
              {users.filter((u) => match(u.email)).map((u) => (
                <TableRow key={u.id}>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>{u._count.mailboxes}</TableCell>
                  <TableCell>{u.banned ? <Badge variant="destructive">محظور</Badge> : <Badge>نشط</Badge>}</TableCell>
                  <TableCell>{fmt(u.createdAt)}</TableCell>
                  <TableCell className="space-x-2 space-x-reverse whitespace-nowrap">
                    <Button size="sm" variant="outline" disabled={pending}
                      onClick={() => run(() => setUserBanned(u.id, !u.banned))}>
                      {u.banned ? "رفع الحظر" : "حظر"}
                    </Button>
                    <Button size="sm" variant="destructive" disabled={pending}
                      onClick={() => run(() => deleteUser(u.id), `حذف ${u.email} وكل بياناته؟`)}>
                      حذف
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>

        {/* الإيميلات */}
        <TabsContent value="mailboxes" className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>العنوان</TableHead><TableHead>المالك</TableHead>
              <TableHead>الرسائل</TableHead><TableHead>الحالة</TableHead><TableHead />
            </TableRow></TableHeader>
            <TableBody>
              {mailboxes.filter((m) => match(m.address) || match(m.user.email)).map((m) => (
                <TableRow key={m.id}>
                  <TableCell dir="ltr" className="text-right">{m.address}</TableCell>
                  <TableCell>{m.user.email}</TableCell>
                  <TableCell>{m._count.messages}</TableCell>
                  <TableCell>{m.isActive ? <Badge>فعّال</Badge> : <Badge variant="destructive">معطّل</Badge>}</TableCell>
                  <TableCell className="space-x-2 space-x-reverse whitespace-nowrap">
                    <Button size="sm" variant="outline" disabled={pending}
                      onClick={() => run(() => setMailboxActive(m.id, !m.isActive))}>
                      {m.isActive ? "تعطيل" : "تفعيل"}
                    </Button>
                    <Button size="sm" variant="destructive" disabled={pending}
                      onClick={() => run(() => deleteMailbox(m.id), `حذف ${m.address}؟`)}>
                      حذف
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>

        {/* الرسائل */}
        <TabsContent value="messages" className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>من</TableHead><TableHead>إلى</TableHead>
              <TableHead>الموضوع</TableHead><TableHead>الوقت</TableHead><TableHead />
            </TableRow></TableHeader>
            <TableBody>
              {messages.filter((m) => match(m.fromAddr) || match(m.subject) || match(m.mailbox.address)).map((m) => (
                <TableRow key={m.id}>
                  <TableCell dir="ltr" className="text-right">{m.fromAddr}</TableCell>
                  <TableCell dir="ltr" className="text-right">{m.mailbox.address}</TableCell>
                  <TableCell className="max-w-[260px] truncate">{m.subject}</TableCell>
                  <TableCell>{fmt(m.receivedAt)}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="destructive" disabled={pending}
                      onClick={() => run(() => deleteMessage(m.id), "حذف الرسالة؟")}>حذف</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>

        {/* الإعدادات */}
        <TabsContent value="settings">
          <Card className="max-w-md">
            <CardContent className="space-y-3 pt-6">
              <label className="block text-sm">اسم الموقع
                <Input value={form.siteName} onChange={(e) => setForm({ ...form, siteName: e.target.value })} />
              </label>
              <label className="block text-sm">النطاق
                <Input dir="ltr" value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} />
              </label>
              <label className="block text-sm">الحد الأقصى للإيميلات لكل مستخدم
                <Input type="number" min={1} value={form.maxMailboxesPerUser}
                  onChange={(e) => setForm({ ...form, maxMailboxesPerUser: Number(e.target.value) })} />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.registrationOpen}
                  onChange={(e) => setForm({ ...form, registrationOpen: e.target.checked })} />
                التسجيل مفتوح
              </label>
              <Button disabled={pending} onClick={() => run(() => updateSettings(form))}>حفظ</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

### إنشاء إيميل للمستخدم (مع احترام الحد الأقصى) — `src/app/dashboard/actions.ts`

```ts
"use server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function createMailbox(localPart: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHORIZED");

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });
  if (user.banned) throw new Error("BANNED");

  const settings = await prisma.siteSetting.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  const count = await prisma.mailbox.count({ where: { userId: user.id } });
  if (count >= settings.maxMailboxesPerUser) throw new Error("LIMIT_REACHED");

  const name = localPart.toLowerCase().trim();
  if (!/^[a-z0-9._-]{3,30}$/.test(name)) throw new Error("INVALID_NAME");
  if (["admin", "postmaster", "abuse", "root", "support"].includes(name)) throw new Error("RESERVED");

  await prisma.mailbox.create({ data: { address: `${name}@${settings.domain}`, userId: user.id } });
  revalidatePath("/dashboard");
}
```

### الـ Inbox اللحظي — `src/app/api/inbox/route.ts` + مكوّن Polling

```ts
// GET /api/inbox?mailboxId=...&since=ISO
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json([], { status: 401 });

  const mailboxId = req.nextUrl.searchParams.get("mailboxId")!;
  const mailbox = await prisma.mailbox.findFirst({ where: { id: mailboxId, userId: session.user.id } });
  if (!mailbox) return NextResponse.json([], { status: 404 });

  const since = req.nextUrl.searchParams.get("since");
  const msgs = await prisma.message.findMany({
    where: { mailboxId, ...(since ? { receivedAt: { gt: new Date(since) } } : {}) },
    orderBy: { receivedAt: "desc" }, take: 50,
    select: { id: true, fromAddr: true, fromName: true, subject: true, text: true, receivedAt: true, read: true },
  });
  return NextResponse.json(msgs);
}
```

```tsx
// في صفحة [mailboxId]: تحديث كل 4 ثوانٍ (بسيط ومضمون)
"use client";
import useSWR from "swr";
const fetcher = (u: string) => fetch(u).then((r) => r.json());
export function Inbox({ mailboxId }: { mailboxId: string }) {
  const { data = [] } = useSWR(`/api/inbox?mailboxId=${mailboxId}`, fetcher, { refreshInterval: 4000 });
  return (
    <ul className="divide-y">
      {data.map((m: any) => (
        <li key={m.id} className="py-3">
          <div className="font-medium">{m.subject || "(بدون عنوان)"}</div>
          <div className="text-sm text-muted-foreground" dir="ltr">{m.fromAddr}</div>
          <p className="text-sm mt-1 line-clamp-3">{m.text}</p>
        </li>
      ))}
    </ul>
  );
}
```

(`npm i swr`. إن أردت Push حقيقي بدل Polling: استخدم Supabase Realtime على جدول `Message`.)

> تنبيه أمان: لا تعرض `html` الرسالة مباشرة بـ `dangerouslySetInnerHTML`. اعرضه داخل `<iframe sandbox>` أو نظّفه بـ DOMPurify.

---

## 5) الربط مع النطاق واستقبال الرسائل

### أ) Webhook الاستقبال — `src/app/api/inbound/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const given = Buffer.from(req.headers.get("x-webhook-secret") ?? "");
  const expected = Buffer.from(process.env.INBOUND_WEBHOOK_SECRET!);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { to, from, fromName, subject, text, html, size } = await req.json();

  const mailbox = await prisma.mailbox.findUnique({
    where: { address: String(to).toLowerCase() },
    include: { user: { select: { banned: true } } },
  });

  // عنوان غير موجود أو معطّل أو مالكه محظور → نتجاهل بهدوء (200)
  if (!mailbox || !mailbox.isActive || mailbox.user.banned) {
    return NextResponse.json({ ok: true, stored: false });
  }

  await prisma.message.create({
    data: {
      mailboxId: mailbox.id,
      fromAddr: String(from).slice(0, 320),
      fromName: fromName ?? null,
      subject: String(subject ?? "").slice(0, 500),
      text: text ? String(text).slice(0, 200_000) : null,
      html: html ? String(html).slice(0, 500_000) : null,
      size: Number(size) || 0,
    },
  });
  return NextResponse.json({ ok: true, stored: true });
}
```

### ب) Cloudflare Email Worker — `workers/email-worker.ts`

(Cloudflare Email Routing وحده لا يرسل Webhook؛ تحتاج Email Worker صغير.)

```ts
import PostalMime from "postal-mime";

export interface Env {
  WEBHOOK_URL: string;     // https://yourdomain.com/api/inbound
  WEBHOOK_SECRET: string;
}

export default {
  async email(message: ForwardableEmailMessage, env: Env) {
    const raw = await new Response(message.raw).arrayBuffer();
    const parsed = await new PostalMime().parse(raw);

    const res = await fetch(env.WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-webhook-secret": env.WEBHOOK_SECRET },
      body: JSON.stringify({
        to: message.to,
        from: message.from,
        fromName: parsed.from?.name ?? null,
        subject: parsed.subject ?? "",
        text: parsed.text ?? "",
        html: parsed.html ?? "",
        size: message.rawSize,
      }),
    });
    if (!res.ok) message.setReject("Temporary failure"); // يعيد المرسل المحاولة لاحقاً
  },
};
```

النشر:

```bash
mkdir mail-worker && cd mail-worker
npm init -y && npm i postal-mime wrangler
# أنشئ wrangler.toml: name = "mail-worker" , main = "email-worker.ts" , compatibility_date = "2026-01-01"
npx wrangler secret put WEBHOOK_SECRET        # نفس INBOUND_WEBHOOK_SECRET
npx wrangler secret put WEBHOOK_URL           # https://yourdomain.com/api/inbound
npx wrangler deploy
```

### ج) خطوات ربط النطاق

1. **اشترِ نطاق `.com`** (Cloudflare Registrar أو Namecheap). يُفضّل نطاق جديد غير مرتبط ببريد مؤقت معروف.
2. **انقل DNS إلى Cloudflare**: أضف الموقع (Add a site) وغيّر الـ Nameservers عند المسجّل إلى التي يعطيها Cloudflare.
3. **ربط موقع Next.js**: انشره على Vercel، ثم أضف النطاق في Vercel وأنشئ سجل CNAME/A الذي يطلبه (للجذر أو `app.yourdomain.com`). اترك سجلات البريد (MX) منفصلة عن سجل الموقع.
4. **فعّل Email Routing**: Cloudflare ← نطاقك ← Email ← Email Routing ← Enable. سيضيف تلقائياً:
   - سجلات **MX** (route1/2/3.mx.cloudflare.net)
   - سجل **SPF**: `v=spf1 include:_spf.mx.cloudflare.net ~all`
5. **Catch-all → Worker**: Email Routing ← Routing rules ← Catch-all address ← Action: *Send to a Worker* ← اختر `mail-worker` ← Save. بهذا يصبح أي عنوان `anything@yourdomain.com` موجّهاً للـ Worker، والموقع يقرر هل العنوان موجود.
6. **DKIM**: لا يلزم للاستقبال. إن أردت لاحقاً **إرسال** بريد من النطاق (مثل رسائل ترحيب) استخدم Resend أو Postmark، وأضف سجلات DKIM التي يعطيها لك (TXT)، وادمج SPF بسجل واحد:
   `v=spf1 include:_spf.mx.cloudflare.net include:amazonses.com ~all`
   (لا تنشئ أكثر من سجل SPF واحد.)
7. **DMARC (يُنصح به)**: سجل TXT باسم `_dmarc`:
   `v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com`
8. **اختبر**:
   - أنشئ إيميلاً من لوحة المستخدم، ثم أرسل له من Gmail، وتأكد من ظهور الرسالة خلال ثوانٍ.
   - تحقق من MX عبر `dig MX yourdomain.com` أو mxtoolbox.com.
   - إن لم تصل الرسالة: راجع Cloudflare ← Email Routing ← Activity log، ثم logs الـ Worker (`npx wrangler tail`).

**بديل ImprovMX:** أنشئ Alias `*` (catch-all) وفعّل خيار Webhook/Forward إلى `https://yourdomain.com/api/inbound` (يتطلب خطة مدفوعة)، وستحتاج تكييف الـ payload لصيغته بدل الـ Worker أعلاه.

---

## قائمة تحقق قبل الإطلاق

- [ ] غيّر `ADMIN_PASSWORD` من `Darx` إلى كلمة قوية (16+ حرفاً)
- [ ] فعّل HTTPS فقط، وكوكي الأدمن `Secure` (مفعّل في الكود)
- [ ] استبدل rate-limit الذاكرة بـ Upstash Redis عند استخدام Vercel
- [ ] لا تعرض HTML الرسائل بدون تعقيم/iframe sandbox
- [ ] أضف سياسة استخدام (AUP) وصفحة إبلاغ عن إساءة، لأن الخدمات المفتوحة تُستغل في الاحتيال
- [ ] جدولة حذف الرسائل الأقدم من X يوماً لتوفير المساحة
