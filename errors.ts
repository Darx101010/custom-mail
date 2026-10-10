export class AppError extends Error {
  constructor(public code: string) { super(code); }
}
export const ERR: Record<string, string> = {
  BANNED: "حسابك محظور",
  MAINTENANCE: "الموقع في وضع الصيانة حالياً",
  REG_CLOSED: "التسجيل مغلق حالياً",
  LIMIT: "وصلت للحد الأقصى من الإيميلات",
  BAD_NAME: "الاسم غير صالح (3-30 حرفاً: a-z و0-9 ونقطة وشرطة، بلا بداية/نهاية بفاصل)",
  RESERVED: "هذا الاسم محجوز",
  BAD_DOMAIN: "نطاق غير صالح",
  PREMIUM_ONLY: "هذه الميزة للبريميوم",
  TAKEN: "الإيميل مأخوذ",
  RATE: "محاولات كثيرة، حاول لاحقاً",
  BAD_KEY: "المفتاح غير صالح أو مستخدم",
  FEATURE_OFF: "الميزة معطّلة حالياً",
  NOT_FOUND: "غير موجود",
};
export const errText = (c?: string) => (c ? ERR[c] ?? "حدث خطأ" : "");
