# بريدي الدائم: بريد دائم + بريميوم (300 ميزة) + أدمن (100 صلاحية)

Next.js 15 (App Router) · Prisma/PostgreSQL · Auth.js (Google) · Tailwind · Cloudflare Email Worker

> مهم: كُتب هذا المشروع بدون تشغيل `npm install` أو بناء (بيئة الكتابة بلا إنترنت). شغّل الخطوات أدناه واقرأ أي خطأ بناء بعناية. غالباً سيكون إصلاحاً صغيراً في نسخ الحزم.

## التشغيل المحلي
```bash
npm install
cp .env.example .env        # املأ القيم (انظر docs/02 قسم 6 لتوليد الأسرار)
npx prisma migrate dev --name init
npm run db:seed             # ينشئ الأدوار والنطاق والميزات وحساب الأدمن الأول
npm run dev                 # http://localhost:3000
```
- الأدمن: `http://localhost:3000/admin/login` ← المستخدم `admin` وكلمة المرور `Darx` (من `ADMIN_INITIAL_PASSWORD`). **سيُجبرك على تغييرها فوراً** (12 حرفاً+).
- اختبار الاستقبال محلياً بتوقيع صحيح:
```bash
node -e '
const c=require("crypto"),s=process.env.INBOUND_WEBHOOK_SECRET;
const body=JSON.stringify({to:"test@yourdomain.com",from:"noreply@playstation.com",subject:"Code",text:"Your code is 123456"});
const ts=String(Date.now());
const sig=c.createHmac("sha256",s).update(ts+"."+body).digest("hex");
console.log(`curl -X POST localhost:3000/api/inbound -H "content-type: application/json" -H "x-timestamp: ${ts}" -H "x-signature: ${sig}" -d '"'"'${body}'"'"'`)'
```

## النشر
راجع `docs/02-premium-security-catalog.md` القسم 6 (الخطوات 10-30) وملف `docs/01-blueprint-and-dns.md` للنطاق والبريد.
الـ Worker: `cd workers && npm i && npx wrangler secret put WEBHOOK_URL && npx wrangler secret put WEBHOOK_SECRET && npx wrangler deploy`

## البنية
- `src/lib/permissions.ts`: **100 صلاحية** + الأدوار الجاهزة (SUPER, MODERATOR, SUPPORT, FINANCE). التحقق في الخادم عبر `requirePerm()`.
- `src/lib/features.ts`: **300 ميزة بريميوم**. المنفّذة فعلياً (`LIVE`): 22 ميزة. الباقي يظهر «قريباً» ويُفعَّل عند تنفيذه.
- الأدمن يتحكم من `/admin/plans` بتفعيل كل ميزة وتحديد مستواها (مجاني/بريميوم).
- `src/lib/keys.ts`: مفاتيح DARX-XXXX-XXXX-XXXX-XXXX، تُخزَّن بصمة HMAC فقط، والتفعيل ذري.

## الأمان المنفّذ
bcrypt للأدمن + قفل بعد 5 محاولات + حد معدل + إجبار تغيير كلمة المرور + إبطال الجلسات عند تغيير الكلمة/الدور (tokenVersion) + 2FA اختياري (حقل `totpSecret`) + JWT قصير (8 ساعات) + Webhook موقّع بتوقيت + تعقيم HTML + عرض الرسائل في iframe معزول + ترويسات أمان/CSP + سجل تدقيق لكل عملية.

## ما ينقص قبل الإنتاج (مسؤوليتك)
تفعيل 2FA للأدمن (إضافة واجهة إعداد TOTP)، Cloudflare Turnstile، Upstash Redis، صفحات الشروط والخصوصية، مراقبة الأخطاء (Sentry)، ونسخ احتياطي مُختبَر.
