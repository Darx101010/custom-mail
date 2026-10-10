# الدليل الرسمي: بريد دائم + بريميوم + أدمن (نسخة آمنة للإنتاج)

يكمل ملف `custom-email-admin-blueprint.md` ويضيف: الإيميل العشوائي، نظام مفاتيح البريميوم، التأمين الكامل، كتالوج 230 ميزة، وخطوات النقل من اللابتوب إلى الإنتاج.

---

## 1) تحديث قاعدة البيانات (أضف إلى `schema.prisma`)

```prisma
enum KeyStatus { UNUSED USED REVOKED }

model Subscription {
  userId    String   @id
  lifetime  Boolean  @default(false)
  expiresAt DateTime?              // null + lifetime=false = لا اشتراك
  updatedAt DateTime @updatedAt
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model LicenseKey {
  id           String    @id @default(cuid())
  keyHash      String    @unique        // HMAC للمفتاح، لا يُخزَّن المفتاح نفسه أبداً
  durationDays Int                      // 0 = دائم
  status       KeyStatus @default(UNUSED)
  note         String?
  createdAt    DateTime  @default(now())
  redeemedById String?
  redeemedAt   DateTime?
}

model BlockedSender {
  id        String  @id @default(cuid())
  mailboxId String
  address   String
  mailbox   Mailbox @relation(fields: [mailboxId], references: [id], onDelete: Cascade)
  @@unique([mailboxId, address])
}

model AuditLog {
  id        String   @id @default(cuid())
  actor     String                    // "admin" أو userId
  action    String
  detail    String?
  ip        String?
  createdAt DateTime @default(now())
  @@index([createdAt])
}
```

وأضف إلى `User`: `subscription Subscription?` وإلى `Mailbox`: الحقول `label String?`, `pinned Boolean @default(false)`, `autoDeleteDays Int @default(0)`, `expiresAt DateTime?`, `blocked BlockedSender[]`.
وأضف إلى `SiteSetting`: `freeMax Int @default(3)`, `premMax Int @default(25)`, `maintenance Boolean @default(false)`, `announcement String @default("")`.

ثم: `npx prisma migrate dev --name premium`

---

## 2) الإيميل العشوائي (خادم)

`src/lib/random-name.ts`

```ts
import { randomInt } from "crypto";

const ADJ = ["swift","brave","quiet","lucky","cosmic","silver","wild","neon","frozen","royal","shadow","pixel","amber","turbo","crimson"];
const NOUN = ["falcon","wolf","tiger","comet","ninja","dragon","pilot","rider","hunter","ghost","storm","fox","raven","knight","viper"];
const pick = <T,>(a: T[]) => a[randomInt(a.length)];
const str = (set: string, n: number) => Array.from({ length: n }, () => set[randomInt(set.length)]).join("");
const L = "abcdefghijklmnopqrstuvwxyz", LN = L + "0123456789";

export type Style = "letters" | "name" | "gamer" | "mix" | "words";
export const FREE_STYLES: Style[] = ["letters", "name"];

export function genName(style: Style, len = 10) {
  switch (style) {
    case "name":  return `${pick(ADJ)}.${pick(NOUN)}${str("0123456789", 2)}`;
    case "gamer": return `${pick(ADJ)}_${pick(NOUN)}_${str("0123456789", 3)}`;
    case "mix":   return str(L, 1) + str(LN, Math.max(5, len - 1));
    case "words": return `${pick(ADJ)}${pick(NOUN)}${pick(NOUN)}${str("0123456789", 2)}`;
    default:      return str(L, len);
  }
}
```

`src/lib/plan.ts`

```ts
import { prisma } from "./prisma";

export async function getPlan(userId: string) {
  const [sub, s] = await Promise.all([
    prisma.subscription.findUnique({ where: { userId } }),
    prisma.siteSetting.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } }),
  ]);
  const premium = !!sub && (sub.lifetime || (sub.expiresAt !== null && sub.expiresAt > new Date()));
  return { premium, max: premium ? s.premMax : s.freeMax, settings: s, sub };
}
```

`src/app/dashboard/actions.ts` (أضف):

```ts
import { genName, FREE_STYLES, Style } from "@/lib/random-name";
import { getPlan } from "@/lib/plan";
import { ratelimit } from "@/lib/ratelimit";
import { z } from "zod";

const schema = z.object({
  style: z.enum(["letters","name","gamer","mix","words"]),
  len: z.number().int().min(6).max(20),
  count: z.number().int().min(1).max(10),
  domain: z.string(),
});

export async function createRandomMailboxes(input: z.infer<typeof schema>) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHORIZED");
  const userId = session.user.id;
  if (!(await ratelimit.limit(`rand:${userId}`)).success) throw new Error("RATE_LIMITED");

  const { style, len, count, domain } = schema.parse(input);
  const { premium, max, settings } = await getPlan(userId);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.banned || settings.maintenance) throw new Error("FORBIDDEN");

  const domains = settings.domains.split(",");
  if (!domains.includes(domain)) throw new Error("BAD_DOMAIN");
  if (!premium && (count > 1 || !FREE_STYLES.includes(style as Style) || domain !== domains[0])) throw new Error("PREMIUM_ONLY");

  const owned = await prisma.mailbox.count({ where: { userId } });
  if (owned + count > max) throw new Error("LIMIT_REACHED");

  const made: string[] = [];
  for (let i = 0; i < count; i++) {
    for (let t = 0; t < 5; t++) {
      const address = `${genName(style as Style, len)}@${domain}`;
      try { await prisma.mailbox.create({ data: { address, userId } }); made.push(address); break; }
      catch { /* تكرار → أعد المحاولة */ }
    }
  }
  revalidatePath("/dashboard");
  return made;
}
```

(حوّل `SiteSetting.domains` إلى نص مفصول بفواصل، أو `String[]` في PostgreSQL.)

---

## 3) نظام مفاتيح البريميوم (آمن)

المبادئ:
- المفتاح 16 حرفاً من أبجدية 32 رمزاً = 80 بت عشوائية (لا يمكن تخمينه).
- لا يُحفظ المفتاح، بل **HMAC-SHA256** مع سر `KEY_PEPPER` على الخادم. تسريب القاعدة لا يكشف مفاتيح.
- التفعيل **ذري** (UPDATE واحد بشرط UNUSED)، فلا يُفعَّل مفتاح مرتين حتى مع طلبين متزامنين.
- حد محاولات على التفعيل لمنع التخمين.
- يظهر المفتاح للأدمن مرة واحدة عند التوليد فقط.

`src/lib/keys.ts`

```ts
import { randomInt, createHmac } from "crypto";

const AB = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 رمزاً بلا I و O
const grp = () => Array.from({ length: 4 }, () => AB[randomInt(32)]).join("");

export const newKey = () => `DARX-${grp()}-${grp()}-${grp()}-${grp()}`;
export const hashKey = (k: string) =>
  createHmac("sha256", process.env.KEY_PEPPER!).update(k.trim().toUpperCase()).digest("hex");
export const KEY_RE = /^DARX(-[A-Z2-9]{4}){4}$/;
```

أضف في `src/app/admin/actions.ts`:

```ts
import { newKey, hashKey } from "@/lib/keys";

export async function generateKeys(days: 0 | 30 | 90 | 365, qty: number, note?: string) {
  await requireAdmin();
  if (!Number.isInteger(qty) || qty < 1 || qty > 100) throw new Error("BAD_QTY");
  const keys = Array.from({ length: qty }, newKey);
  await prisma.licenseKey.createMany({
    data: keys.map((k) => ({ keyHash: hashKey(k), durationDays: days, note: note?.slice(0, 80) })),
  });
  await prisma.auditLog.create({ data: { actor: "admin", action: "GENERATE_KEYS", detail: `${qty}x${days}d` } });
  return keys; // تُعرض مرة واحدة في الواجهة
}

export async function revokeKey(id: string) {
  await requireAdmin();
  await prisma.licenseKey.updateMany({ where: { id, status: "UNUSED" }, data: { status: "REVOKED" } });
  revalidatePath("/admin");
}

export async function grantPremium(userId: string, days: number) {
  await requireAdmin();
  await applyDuration(userId, days);
  await prisma.auditLog.create({ data: { actor: "admin", action: "GRANT", detail: `${userId}:${days}` } });
  revalidatePath("/admin");
}
```

`src/lib/subscription.ts`

```ts
import { prisma } from "./prisma";

export async function applyDuration(userId: string, days: number) {
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  if (days === 0 || sub?.lifetime) {
    return prisma.subscription.upsert({ where: { userId }, update: { lifetime: true, expiresAt: null }, create: { userId, lifetime: true } });
  }
  const base = sub?.expiresAt && sub.expiresAt > new Date() ? sub.expiresAt : new Date();
  const expiresAt = new Date(base.getTime() + days * 864e5);
  return prisma.subscription.upsert({ where: { userId }, update: { expiresAt }, create: { userId, expiresAt } });
}
```

تفعيل المستخدم للمفتاح: `src/app/dashboard/premium/actions.ts`

```ts
"use server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hashKey, KEY_RE } from "@/lib/keys";
import { applyDuration } from "@/lib/subscription";
import { ratelimit } from "@/lib/ratelimit";

export async function redeemKey(input: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHORIZED");
  const userId = session.user.id;

  // 5 محاولات/ساعة لكل مستخدم (غيّر الإعداد في ratelimit.ts)
  if (!(await ratelimit.limit(`redeem:${userId}`)).success) throw new Error("RATE_LIMITED");

  const key = input.trim().toUpperCase();
  if (!KEY_RE.test(key)) throw new Error("INVALID_KEY");
  const h = hashKey(key);

  // تفعيل ذري: ينجح مرة واحدة فقط مهما تكررت الطلبات
  const res = await prisma.licenseKey.updateMany({
    where: { keyHash: h, status: "UNUSED" },
    data: { status: "USED", redeemedById: userId, redeemedAt: new Date() },
  });
  if (res.count !== 1) throw new Error("INVALID_KEY"); // نفس الرسالة دائماً (لا نكشف السبب)

  const lk = await prisma.licenseKey.findUniqueOrThrow({ where: { keyHash: h } });
  await applyDuration(userId, lk.durationDays);
  await prisma.auditLog.create({ data: { actor: userId, action: "REDEEM", detail: lk.id } });
  return { ok: true };
}
```

`src/lib/ratelimit.ts` (Upstash Redis مجاني):

```ts
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
export const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, "1 h"),
});
// أنشئ نسخة ثانية بحدود أوسع لإنشاء الإيميلات وتسجيل الأدمن (5/15 دقيقة)
```

`npm i @upstash/ratelimit @upstash/redis`

---

## 4) تأمين كامل (نفّذ كل البنود قبل النشر)

### أ) كلمة مرور الأدمن
`Darx` ضعيفة. استخدمها محلياً للتجربة فقط، وللإنتاج:

```bash
npm i bcryptjs
node -e "console.log(require('bcryptjs').hashSync('كلمة-مرور-طويلة-وعشوائية-24-حرف',12))"
```

ضع الناتج في `.env` باسم `ADMIN_PASSWORD_HASH` (واحرص على كتابة كل `$` كـ `\$` داخل `.env`)، وفي `admin-session.ts` استبدل المقارنة بـ:

```ts
import bcrypt from "bcryptjs";
export const checkAdminPassword = (input: string) =>
  bcrypt.compareSync(input, process.env.ADMIN_PASSWORD_HASH!);
```

ثم أضف **2FA (TOTP)** للأدمن: `npm i otplib`، خزّن `ADMIN_TOTP_SECRET` في `.env`، واطلب رمز 6 أرقام بعد كلمة المرور في `/api/admin/login` باستخدام `authenticator.check(code, secret)`.

اجعل مسار الأدمن غير متوقع (مثلاً `/panel-x7k2`) وأضف **قفل IP** في الـ Middleware (Cloudflare Access أو قائمة IP في env) إن كان عنوانك ثابتاً.

### ب) ترويسات الأمان (`next.config.ts`)

```ts
const headers = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Content-Security-Policy", value: "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" },
];
export default { async headers() { return [{ source: "/(.*)", headers }]; } };
```

(شدّد `script-src` بـ nonce لاحقاً.)

### ج) عرض الرسائل بأمان
- لا تعرض `html` الرسالة داخل الصفحة أبداً. اعرضه في `<iframe sandbox srcdoc>` بلا `allow-scripts`، مع تعقيمه عبر `isomorphic-dompurify` قبل الحفظ.
- امنع تحميل الصور الخارجية افتراضياً (تتبع القراءة)، أو مرّرها عبر proxy.
- لا تفتح الروابط مباشرة؛ اعرض تحذيراً قبل الانتقال.

### د) الـ Webhook
- سر مشترك طويل (32+ بايت) + مقارنة ثابتة الزمن (موجودة في الكود).
- الأفضل التوقيع: يحسب الـ Worker `HMAC(body, secret)` + طابع زمني، والخادم يرفض الطلبات الأقدم من 5 دقائق.
- حدّ أقصى لحجم الجسم (مثلاً 2MB) في الـ Worker والخادم.

### هـ) قاعدة البيانات والبنية
- فعّل Row Level Security إن استخدمت Supabase، وأغلق الوصول المباشر من المتصفح (استخدم `DATABASE_URL` من الخادم فقط).
- لا تضع `SERVICE_ROLE` أو أي سر في متغيرات `NEXT_PUBLIC_*`.
- نسخ احتياطي يومي (Supabase/Neon يوفرانه) + اختبر الاستعادة مرة.
- كل أسرارك في Vercel Environment Variables، و`.env` في `.gitignore` دائماً.
- فعّل 2FA على: GitHub، Vercel، Cloudflare، Supabase، المسجّل (Registrar)، وبريدك الأساسي.
- فعّل Cloudflare Turnstile على تسجيل الدخول وإنشاء الإيميلات لمنع البوتات.
- `npm audit` أسبوعياً + Dependabot على GitHub.

### و) منع الإساءة (مهم جداً لخدمة بريد عامة)
- Rate limit على الإنشاء والتفعيل والدخول.
- صفحة «إبلاغ عن إساءة» وبريد `abuse@` فعلي.
- سياسة استخدام مقبول + سياسة خصوصية + شروط الخدمة قبل الإطلاق.
- لا تخزّن الرسائل أطول من اللازم (احتفاظ 7-30 يوماً للمجاني).

---

## 5) كتالوج 230 ميزة

الرمز ⭐ = بريميوم. نفّذها على مراحل: **المرحلة 1** (1-35 + 56 + 78-86 + 126-129 + 141-146) للإطلاق، ثم أضف الباقي تدريجياً.

### إنشاء الإيميلات
1 اسم مخصص · 2 اسم عشوائي (حروف) · 3 اسم.لقب+أرقام · 4 نمط قيمر ⭐ · 5 حروف وأرقام ⭐ · 6 كلمات مدمجة ⭐ · 7 تحديد الطول ⭐ · 8 إنشاء دفعة حتى 10 ⭐ · 9 اختيار النطاق · 10 نطاقات متعددة ⭐ · 11 Subaddress (name+tag@) · 12 Alias لإيميل واحد ⭐ · 13 إنشاء بنقرة واحدة · 14 اقتراح أسماء متاحة · 15 فحص التوفر اللحظي · 16 أسماء محجوزة · 17 منع الألفاظ المسيئة · 18 إيميل مؤقت (ساعة/يوم/أسبوع) · 19 تحويل المؤقت إلى دائم · 20 نسخ إعدادات إيميل لآخر

### صندوق الوارد
21 استقبال لحظي · 22 عداد غير مقروء · 23 مقروء/غير مقروء · 24 نجمة · 25 تثبيت · 26 وسوم · 27 مجلدات · 28 أرشيف · 29 سلة محذوفات مع استرجاع · 30 بحث نصي · 31 بحث بالمرسل · 32 فلتر بالتاريخ · 33 فرز · 34 استخراج رمز OTP تلقائياً · 35 نسخ الرمز بنقرة · 36 استخراج روابط التحقق · 37 فتح رابط التفعيل بأمان · 38 عرض HTML داخل sandbox · 39 عرض نص عادي · 40 تنزيل المرفقات · 41 معاينة الصور · 42 فحص المرفقات بمضاد فيروسات · 43 حظر الملفات التنفيذية · 44 تحديد متعدد · 45 حذف جماعي · 46 قراءة الكل · 47 تصدير TXT ⭐ · 48 تصدير EML ⭐ · 49 تصدير JSON ⭐ · 50 تصدير PDF ⭐ · 51 طباعة · 52 عرض الترويسات الكاملة · 53 عرض مصدر الرسالة · 54 تلخيص بالذكاء الاصطناعي ⭐ · 55 ترجمة الرسالة ⭐

### الخصوصية والأمان
56 دخول Google OAuth · 57 2FA للمستخدم · 58 إدارة الأجهزة والجلسات · 59 الخروج من كل الأجهزة · 60 قفل بـ PIN · 61 إخفاء المحتوى (Blur) · 62 Proxy للصور ضد التتبع · 63 تعطيل الصور الخارجية افتراضياً · 64 حظر مرسلين · 65 قائمة سماح · 66 فلتر سبام · 67 كشف التصيد · 68 تحذير روابط خطرة · 69 فحص الروابط (Safe Browsing) · 70 عرض نتيجة SPF/DKIM/DMARC لكل رسالة · 71 تشفير الرسائل في القاعدة · 72 حذف تلقائي · 73 حذف نهائي فوري · 74 تصدير بياناتي (GDPR) · 75 حذف حسابي · 76 سجل نشاط الحساب · 77 تنبيه دخول من جهاز جديد · 78 Rate limiting · 79 Cloudflare Turnstile · 80 CSP · 81 HSTS · 82 كوكيز HttpOnly/Secure · 83 حماية CSRF · 84 تعقيم HTML · 85 مسح الميتاداتا من المرفقات · 86 توقيع Webhook · 87 تدوير الأسرار دورياً · 88 كشف الحسابات المشبوهة · 89 حظر IP/دولة · 90 وضع الخصوصية القصوى (بلا سجلات)

### البريميوم
91 حتى 25 إيميل ⭐ · 92 إنشاء دفعي ⭐ · 93 كل أنماط الأسماء ⭐ · 94 تحديد الطول ⭐ · 95 نطاقات حصرية ⭐ · 96 أسماء قصيرة (3 أحرف) ⭐ · 97 احتفاظ أطول بالرسائل ⭐ · 98 مساحة تخزين أكبر ⭐ · 99 مرفقات أكبر ⭐ · 100 حظر مرسلين غير محدود ⭐ · 101 قواعد وفلاتر تلقائية ⭐ · 102 إعادة توجيه لإيميل خارجي ⭐ · 103 توجيه تلقائي بشروط ⭐ · 104 إشعارات بريد/تيليجرام ⭐ · 105 Webhook شخصي ⭐ · 106 مفتاح API شخصي ⭐ · 107 حذف تلقائي مخصص ⭐ · 108 تصدير جماعي ⭐ · 109 بحث متقدم ⭐ · 110 مجلدات غير محدودة ⭐ · 111 وسوم ملونة ⭐ · 112 ثيمات حصرية ⭐ · 113 شارة بريميوم ⭐ · 114 دعم بأولوية ⭐ · 115 بلا إعلانات ⭐ · 116 نسخ احتياطي تلقائي ⭐ · 117 استرجاع المحذوف 30 يوماً ⭐ · 118 ملخصات AI ⭐ · 119 ترجمة AI ⭐ · 120 إيميل ذاتي التدمير ⭐ · 121 قراءة لمرة واحدة ⭐ · 122 إيقاف/تشغيل العنوان مؤقتاً ⭐ · 123 تقارير شهرية ⭐ · 124 مشاركة مع 3 مستخدمين ⭐ · 125 ربط نطاقك الخاص ⭐

### لوحة الأدمن
126 دخول مستقل · 127 2FA للأدمن · 128 قفل IP · 129 إحصائيات مباشرة · 130 رسم 7/30 يوم · 131 توزيع حسب النطاق · 132 أكثر المرسلين · 133 أكثر المستخدمين نشاطاً · 134 قائمة المستخدمين · 135 بحث وفلترة · 136 حظر/رفع حظر · 137 حذف مستخدم · 138 دخول بحساب مستخدم للدعم (مع تسجيل) · 139 حد مخصص لمستخدم · 140 منح/سحب بريميوم · 141 توليد مفاتيح · 142 توليد دفعي · 143 اختيار المدة/الخطة · 144 ملاحظة لكل مفتاح · 145 إلغاء مفتاح · 146 حالة المفتاح (غير مستخدم/مستخدم/ملغى) · 147 مفاتيح بتاريخ انتهاء للتفعيل · 148 أكواد خصم · 149 تصدير المفاتيح · 150 إدارة الإيميلات · 151 تعطيل/حذف · 152 مراقبة الرسائل · 153 بحث في كل الرسائل · 154 حذف رسالة · 155 تنبيه كلمات ممنوعة · 156 قائمة سوداء للمرسلين عالمياً · 157 قائمة سوداء للنطاقات · 158 إعدادات عامة · 159 إدارة النطاقات · 160 فحص صحة DNS · 161 إعلان عام · 162 وضع الصيانة · 163 فتح/إغلاق التسجيل · 164 أسماء محجوزة · 165 حدود الخطط · 166 قوالب رسائل النظام · 167 سجل تدقيق كامل · 168 تصدير CSV · 169 بلاغات الإساءة · 170 مراجعة وإغلاق البلاغات

### الإشعارات والتكامل
171 إشعارات المتصفح · 172 Web Push · 173 ملخص يومي بالبريد · 174 بوت تيليجرام · 175 Discord webhook · 176 Slack · 177 Zapier/Make · 178 REST API · 179 مفاتيح API · 180 Webhooks صادرة · 181 PWA قابلة للتثبيت · 182 تطبيق جوال · 183 إضافة متصفح · 184 ملء رمز OTP تلقائياً · 185 رابط مؤقت لمشاركة رسالة · 186 QR للإيميل · 187 QR لرمز التحقق · 188 اختصارات لوحة المفاتيح · 189 Widget · 190 Shortcuts للجوال

### تجربة الاستخدام
191 عربي RTL كامل · 192 لغات متعددة · 193 داكن/فاتح · 194 ثيمات · 195 خطوط · 196 كثافة العرض · 197 أنيميشن خفيف · 198 وضع توفير البيانات · 199 تحميل تدريجي · 200 حالات فارغة تعليمية · 201 جولة تعريفية · 202 مركز مساعدة · 203 الأسئلة الشائعة · 204 نموذج ملاحظات · 205 صفحة حالة الخدمة · 206 إمكانية الوصول · 207 قارئ الشاشة · 208 عمل دون اتصال · 209 مزامنة الإعدادات · 210 اختصارات سريعة

### التشغيل والجودة
211 Sentry للأخطاء · 212 مراقبة التوفر (UptimeRobot) · 213 سجلات مركزية · 214 نسخ احتياطي يومي · 215 اختبار الاستعادة · 216 `/api/health` · 217 CI/CD عبر GitHub Actions · 218 اختبارات آلية · 219 بيئة تجريبية Staging · 220 Rate limit مركزي · 221 طابور للـ Webhook · 222 إعادة محاولة · 223 Dead-letter queue · 224 تخزين مؤقت · 225 CDN · 226 فهارس قاعدة البيانات · 227 Cron للتنظيف · 228 مراقبة الحصة والتكلفة · 229 تنبيهات للأدمن · 230 توثيق داخلي

---

## 6) من اللابتوب إلى الإنتاج: خطوة بخطوة

### المرحلة 0: الأدوات (30 دقيقة)
1. ثبّت **Node.js 20 LTS** من nodejs.org، و**Git**، و**VS Code**.
2. أنشئ حسابات (كلها مع 2FA): GitHub، Vercel، Cloudflare، Supabase (أو Neon)، Upstash، Google Cloud، وسجّل نطاقك (Cloudflare Registrar الأرخص بلا ربح على التجديد).

### المرحلة 1: المشروع محلياً
3. نفّذ أوامر التثبيت من الملف الأول، وأنشئ هيكل المجلدات، وانسخ الأكواد.
4. أنشئ مشروع **Supabase** ← Project Settings ← Database ← انسخ `Connection string` (وضع Transaction pooler) إلى `DATABASE_URL`.
5. **Google OAuth**: Google Cloud Console ← APIs & Services ← OAuth consent screen (External) ← Credentials ← Create OAuth client ID (Web). أضف Redirect URI:
   - محلياً: `http://localhost:3000/api/auth/callback/google`
   - إنتاج: `https://yourdomain.com/api/auth/callback/google`
6. ولّد الأسرار: `openssl rand -base64 32` لكل من `AUTH_SECRET` و`ADMIN_JWT_SECRET` و`INBOUND_WEBHOOK_SECRET` و`KEY_PEPPER` (أربعة قيم مختلفة). **احفظ `KEY_PEPPER` في مكان آمن**: لو ضاع، لن تتطابق المفاتيح القديمة.
7. شغّل: `npx prisma migrate dev` ثم `npm run dev` وافتح `localhost:3000`.
8. اختبر محلياً: دخول Google، إنشاء إيميل عشوائي، دخول الأدمن، توليد مفتاح، تفعيله من حساب عادي، ثم محاولة تفعيله ثانية (يجب أن تفشل).
9. لاختبار الـ Webhook محلياً: `curl -X POST localhost:3000/api/inbound -H "x-webhook-secret: ..." -H "content-type: application/json" -d '{"to":"test@yourdomain.com","from":"a@b.com","subject":"hi","text":"123456"}'`

### المرحلة 2: النشر
10. `git init`، تأكد أن `.env*` في `.gitignore`، ثم ارفع إلى GitHub (**Private repo**).
11. في **Vercel**: Add New ← Project ← اختر المستودع ← أضف كل المتغيرات (Environment Variables) ← Deploy. أضف `prisma generate` إلى سكربت `build` (`"build": "prisma generate && next build"`).
12. شغّل الهجرة على قاعدة الإنتاج: `npx prisma migrate deploy` (من اللابتوب بعد وضع `DATABASE_URL` الإنتاج مؤقتاً، أو كخطوة في CI).
13. اربط النطاق: Vercel ← Settings ← Domains ← أضف `yourdomain.com`، وأنشئ السجل المطلوب في Cloudflare (اجعله **DNS only** لسجل Vercel).
14. حدّث `AUTH_URL=https://yourdomain.com` وروابط Google OAuth، ثم أعد النشر.

### المرحلة 3: البريد
15. Cloudflare ← Email ← Email Routing ← Enable (يضيف MX وSPF).
16. انشر الـ Worker (من الملف الأول) واضبط `WEBHOOK_URL` و`WEBHOOK_SECRET`.
17. Catch-all ← Send to Worker.
18. أرسل رسالة من Gmail إلى إيميل أنشأته. يجب أن تظهر خلال ثوانٍ. إن لم تظهر: Email Routing ← Activity log، ثم `npx wrangler tail`.
19. أضف DMARC: `_dmarc` TXT = `v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com`.

### المرحلة 4: قبل فتح الموقع للجمهور
20. نفّذ كل بنود القسم 4 (خصوصاً: كلمة أدمن جديدة بتجزئة + 2FA، Turnstile، Rate limit، تعقيم HTML).
21. غيّر `ADMIN_PASSWORD` من `Darx` نهائياً، واحذف أي أثر لها من الكود والسجلات.
22. أضف صفحات: الشروط، الخصوصية، سياسة الاستخدام، الإبلاغ عن إساءة، التواصل.
23. فعّل مراقبة: Sentry (أخطاء)، UptimeRobot (توفر)، وتنبيهات Vercel.
24. اختبر الحمل والأمان: جرّب إدخال `<script>` في موضوع/نص رسالة، وتخمين المفاتيح (يجب أن يُحظر بعد 5 محاولات)، ومحاولة الوصول لـ `/admin` بدون كوكي (يجب التحويل).
25. اختبر الاستعادة من النسخة الاحتياطية مرة واحدة.

### المرحلة 5: بيع البريميوم
26. اختر منصة دفع: **Lemon Squeezy** أو **Paddle** (تتولى الضرائب كتاجر مسجل) أو Stripe.
27. بعد الدفع، أنشئ المفتاح تلقائياً: Webhook من منصة الدفع إلى `/api/payments/webhook` (يتحقق من توقيعها) يستدعي `generateKeys` ويرسل المفتاح للمشتري بالبريد. أو بدّل التسليم اليدوي بتوليد المفاتيح من لوحة الأدمن وبيعها عبر منصتك.
28. اترك الأدمن يُلغي أي مفتاح مسرّب أو مسترد (Refund) من تبويب المفاتيح.

### بعد الإطلاق
29. راقب لوحة الأدمن يومياً أول أسبوعين: سبام، إساءة، استهلاك قاعدة البيانات.
30. فعّل جدولة Cron (Vercel Cron) لحذف الرسائل المنتهية وفق الاحتفاظ.

---

## 7) ملاحظات قانونية ومنطقية سريعة

- خدمات البريد العامة تجذب الإساءة (احتيال، سبام). السياسات + الإبلاغ + الحظر السريع ليست اختيارية.
- بعض المنصات تحظر نطاقات البريد المؤقت. لا يمكن ضمان القبول؛ اختبر مع كل منصة قبل البيع، ولا تَعِد المشترين بقبول 100%.
- إن بعت لمستخدمين في دول مختلفة فاستشر مختصاً في الضرائب والخصوصية (GDPR وغيره)، أو استخدم تاجراً مسجلاً مثل Lemon Squeezy/Paddle.
