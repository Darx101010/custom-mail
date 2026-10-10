// 100 صلاحية. كل صلاحية قابلة للإسناد لأي دور، والتحقق منها يتم في الخادم عبر requirePerm().
export type Perm = readonly [id: string, label: string];

export const PERM_GROUPS: { key: string; label: string; perms: Perm[] }[] = [
  { key: "users", label: "المستخدمون", perms: [
    ["users.view", "عرض قائمة المستخدمين"], ["users.search", "البحث في المستخدمين"], ["users.detail", "عرض تفاصيل مستخدم"],
    ["users.ban", "حظر مستخدم"], ["users.unban", "رفع الحظر"], ["users.delete", "حذف مستخدم"],
    ["users.grant_premium", "منح بريميوم"], ["users.revoke_premium", "سحب بريميوم"], ["users.set_limit", "تعديل حد الإيميلات لمستخدم"],
    ["users.force_logout", "إنهاء جلسات مستخدم"], ["users.export", "تصدير بيانات المستخدمين"], ["users.notify", "إرسال إشعار لمستخدم"],
    ["users.note", "كتابة ملاحظات إدارية"], ["users.verify", "توثيق مستخدم"] ] },
  { key: "mailboxes", label: "الإيميلات", perms: [
    ["mailboxes.view", "عرض الإيميلات"], ["mailboxes.search", "البحث في الإيميلات"], ["mailboxes.create_for_user", "إنشاء إيميل لمستخدم"],
    ["mailboxes.disable", "تعطيل إيميل"], ["mailboxes.enable", "تفعيل إيميل"], ["mailboxes.delete", "حذف إيميل"],
    ["mailboxes.transfer", "نقل ملكية إيميل"], ["mailboxes.set_expiry", "تحديد انتهاء إيميل"], ["mailboxes.reserve_name", "حجز اسم"],
    ["mailboxes.release_name", "تحرير اسم محجوز"], ["mailboxes.export", "تصدير الإيميلات"], ["mailboxes.bulk_delete", "حذف جماعي للإيميلات"] ] },
  { key: "messages", label: "الرسائل", perms: [
    ["messages.view_meta", "عرض بيانات الرسائل (مرسل/موضوع)"], ["messages.view_content", "عرض محتوى الرسائل"], ["messages.search", "البحث في الرسائل"],
    ["messages.delete", "حذف رسالة"], ["messages.bulk_delete", "حذف جماعي للرسائل"], ["messages.export", "تصدير الرسائل"],
    ["messages.restore", "استرجاع رسائل"], ["messages.flag", "وسم رسالة كمشبوهة"], ["messages.view_headers", "عرض الترويسات"],
    ["messages.view_html", "عرض HTML الرسالة"], ["messages.purge_old", "تنظيف الرسائل القديمة"], ["messages.block_sender_global", "حظر مرسل عالمياً"] ] },
  { key: "keys", label: "مفاتيح البريميوم", perms: [
    ["keys.view", "عرض المفاتيح"], ["keys.generate", "توليد مفتاح"], ["keys.generate_bulk", "توليد مفاتيح بالجملة"],
    ["keys.revoke", "إلغاء مفتاح"], ["keys.reactivate", "إعادة تفعيل مفتاح ملغى"], ["keys.export", "تصدير المفاتيح"],
    ["keys.set_note", "تعديل ملاحظة مفتاح"], ["keys.view_redeemers", "عرض من فعّل المفتاح"], ["keys.delete", "حذف مفتاح"],
    ["keys.expire", "تحديد انتهاء للمفتاح"], ["keys.stats", "إحصائيات المفاتيح"], ["keys.reissue", "إعادة إصدار مفتاح"] ] },
  { key: "plans", label: "الخطط والميزات", perms: [
    ["plans.view", "عرض الخطط والميزات"], ["plans.edit_limits", "تعديل حدود الخطط"], ["plans.edit_retention", "تعديل مدد الاحتفاظ"],
    ["plans.edit_features", "تفعيل/تعطيل الميزات"], ["plans.set_tier", "تحديد مستوى كل ميزة"], ["plans.view_subscriptions", "عرض الاشتراكات"],
    ["plans.extend", "تمديد اشتراك"], ["plans.cancel", "إلغاء اشتراك"] ] },
  { key: "domains", label: "النطاقات", perms: [
    ["domains.view", "عرض النطاقات"], ["domains.add", "إضافة نطاق"], ["domains.remove", "حذف نطاق"],
    ["domains.activate", "تفعيل/تعطيل نطاق"], ["domains.set_premium_only", "جعل النطاق للبريميوم"], ["domains.check_dns", "فحص DNS"],
    ["domains.set_default", "تعيين النطاق الافتراضي"], ["domains.edit", "تعديل نطاق"] ] },
  { key: "settings", label: "إعدادات الموقع", perms: [
    ["settings.view", "عرض الإعدادات"], ["settings.edit_general", "تعديل الإعدادات العامة"], ["settings.maintenance", "وضع الصيانة"],
    ["settings.registration", "فتح/إغلاق التسجيل"], ["settings.announcement", "الإعلان العام"], ["settings.reserved_names", "الأسماء المحجوزة"],
    ["settings.rate_limits", "حدود المعدل"], ["settings.legal_pages", "الصفحات القانونية"] ] },
  { key: "security", label: "الأمان والإساءة", perms: [
    ["security.view_blocklist", "عرض القوائم السوداء"], ["security.block_ip", "حظر IP"], ["security.unblock_ip", "رفع حظر IP"],
    ["security.view_sessions", "عرض الجلسات"], ["security.kill_sessions", "إنهاء الجلسات"], ["security.view_abuse", "عرض بلاغات الإساءة"],
    ["security.resolve_abuse", "إغلاق بلاغات الإساءة"], ["security.manage_blocked_domains", "إدارة النطاقات المحظورة"] ] },
  { key: "admins", label: "المسؤولون والأدوار", perms: [
    ["admins.view", "عرض المسؤولين"], ["admins.create", "إنشاء مسؤول"], ["admins.edit", "تعديل دور مسؤول"],
    ["admins.deactivate", "تعطيل مسؤول"], ["admins.reset_password", "إعادة تعيين كلمة مرور مسؤول"], ["admins.reset_totp", "إعادة ضبط 2FA لمسؤول"],
    ["roles.view", "عرض الأدوار"], ["roles.edit", "تعديل صلاحيات الأدوار"] ] },
  { key: "audit", label: "سجل التدقيق", perms: [
    ["audit.view", "عرض السجل"], ["audit.search", "البحث في السجل"], ["audit.export", "تصدير السجل"],
    ["audit.purge", "تنظيف السجل"], ["audit.view_ips", "عرض عناوين IP في السجل"] ] },
  { key: "reports", label: "التقارير", perms: [
    ["reports.view_stats", "عرض الإحصائيات"], ["reports.view_charts", "عرض الرسوم البيانية"], ["reports.export", "تصدير التقارير"],
    ["reports.revenue", "عرض الإيرادات"], ["reports.system_health", "عرض صحة النظام"] ] },
];

export const ALL_PERMS: Perm[] = PERM_GROUPS.flatMap((g) => g.perms);
export const ALL_PERM_IDS = ALL_PERMS.map((p) => p[0]);

export const ROLE_PRESETS: Record<string, string[]> = {
  SUPER: ["*"],
  MODERATOR: [
    "users.view", "users.search", "users.detail", "users.ban", "users.unban",
    "mailboxes.view", "mailboxes.search", "mailboxes.disable", "mailboxes.enable",
    "messages.view_meta", "messages.view_content", "messages.delete",
    "security.view_abuse", "security.resolve_abuse", "reports.view_stats",
  ],
  SUPPORT: ["users.view", "users.search", "users.detail", "mailboxes.view", "keys.view", "reports.view_stats"],
  FINANCE: [
    ...ALL_PERM_IDS.filter((p) => p.startsWith("keys.") || p.startsWith("plans.")),
    "users.view", "users.grant_premium", "reports.view_stats", "reports.revenue",
  ],
};

export const NAV: { href: string; label: string; perm: string }[] = [
  { href: "/admin", label: "نظرة عامة", perm: "reports.view_stats" },
  { href: "/admin/users", label: "المستخدمون", perm: "users.view" },
  { href: "/admin/mailboxes", label: "الإيميلات", perm: "mailboxes.view" },
  { href: "/admin/messages", label: "الرسائل", perm: "messages.view_meta" },
  { href: "/admin/keys", label: "المفاتيح", perm: "keys.view" },
  { href: "/admin/plans", label: "الخطط والميزات", perm: "plans.view" },
  { href: "/admin/domains", label: "النطاقات", perm: "domains.view" },
  { href: "/admin/settings", label: "الإعدادات", perm: "settings.view" },
  { href: "/admin/security", label: "الإساءة", perm: "security.view_abuse" },
  { href: "/admin/admins", label: "المسؤولون", perm: "admins.view" },
  { href: "/admin/audit", label: "السجل", perm: "audit.view" },
];

export function permAllowed(perms: string[], p: string) {
  return perms.includes("*") || perms.includes(p);
}
