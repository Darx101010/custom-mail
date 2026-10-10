import { prisma } from "./prisma";

/** days = 0 يعني دائم. يمدّد من تاريخ الانتهاء الحالي إن كان ساري المفعول. */
export async function applyDuration(userId: string, days: number) {
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  if (days === 0 || sub?.lifetime) {
    return prisma.subscription.upsert({
      where: { userId }, update: { lifetime: true, expiresAt: null }, create: { userId, lifetime: true },
    });
  }
  const base = sub?.expiresAt && sub.expiresAt > new Date() ? sub.expiresAt : new Date();
  const expiresAt = new Date(base.getTime() + days * 864e5);
  return prisma.subscription.upsert({ where: { userId }, update: { expiresAt }, create: { userId, expiresAt } });
}
