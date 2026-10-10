import { prisma } from "./prisma";

export async function getSettings() {
  return prisma.siteSetting.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}

export async function getPlan(userId: string) {
  const [user, settings] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { subscription: true } }),
    getSettings(),
  ]);
  const sub = user.subscription;
  const premium = !!sub && (sub.lifetime || (!!sub.expiresAt && sub.expiresAt > new Date()));
  const max = user.maxMailboxesOverride ?? (premium ? settings.premMax : settings.freeMax);
  return { premium, max, settings, sub };
}

/** هل يستطيع المستخدم استخدام الميزة؟ (الميزة مفعّلة + مستواه يكفي) */
export async function canUse(userId: string, featureId: string, premiumKnown?: boolean) {
  const flag = await prisma.featureFlag.findUnique({ where: { id: featureId } });
  if (flag && !flag.enabled) return false;
  if ((flag?.tier ?? "PREMIUM") === "FREE") return true;
  const premium = premiumKnown ?? (await getPlan(userId)).premium;
  return premium;
}
