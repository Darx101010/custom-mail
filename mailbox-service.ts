import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { AppError } from "./errors";
import { canUse, getPlan } from "./plan";
import { limit } from "./ratelimit";
import { genName, Style, STYLES, STYLE_FEATURE } from "./random-name";

const NAME_RE = /^[a-z0-9](?:[a-z0-9._-]{1,28})[a-z0-9]$/;

export async function makeMailbox(userId: string, rawName: string, domainName: string, ttlHours = 0) {
  if (!(await limit(`mk:${userId}`, 30, 600))) throw new AppError("RATE");
  const plan = await getPlan(userId);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.banned) throw new AppError("BANNED");
  const s = plan.settings;
  if (s.maintenance) throw new AppError("MAINTENANCE");
  if (![0, 1, 24, 168].includes(ttlHours)) ttlHours = 0;
  if (ttlHours && !(await canUse(userId, "mail.14", plan.premium))) throw new AppError("PREMIUM_ONLY");

  const owned = await prisma.mailbox.count({ where: { userId } });
  if (owned === 0 && !s.registrationOpen) throw new AppError("REG_CLOSED");
  if (owned >= plan.max) throw new AppError("LIMIT");

  const name = rawName.trim().toLowerCase();
  if (!NAME_RE.test(name) || /[._-]{2}/.test(name)) throw new AppError("BAD_NAME");
  if (s.reserved.split(",").map((x) => x.trim()).includes(name)) throw new AppError("RESERVED");

  const domain = await prisma.domain.findFirst({ where: { name: domainName, active: true } });
  if (!domain) throw new AppError("BAD_DOMAIN");
  if (domain.premiumOnly || !domain.isDefault) {
    // النطاقات غير الافتراضية حصرية للبريميوم (mail.6)
    if (!(await canUse(userId, "mail.6", plan.premium))) throw new AppError("PREMIUM_ONLY");
  }

  try {
    return await prisma.mailbox.create({ data: { address: `${name}@${domain.name}`, userId, expiresAt: ttlHours ? new Date(Date.now() + ttlHours * 36e5) : null } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new AppError("TAKEN");
    throw e;
  }
}

export async function makeRandomMailboxes(userId: string, styleIn: string, len: number, count: number, domainName: string, ttlHours = 0) {
  const style = (STYLES as readonly string[]).includes(styleIn) ? (styleIn as Style) : "letters";
  const plan = await getPlan(userId);
  const need: string[] = [];
  if (STYLE_FEATURE[style]) need.push(STYLE_FEATURE[style]!);
  if (len !== 10) need.push("mail.1");
  if (count > 1) need.push("mail.5");
  for (const f of need) if (!(await canUse(userId, f, plan.premium))) throw new AppError("PREMIUM_ONLY");

  count = Math.min(Math.max(count, 1), 10);
  len = Math.min(Math.max(len, 6), 20);
  const made: string[] = [];
  for (let i = 0; i < count; i++) {
    let ok = false;
    for (let t = 0; t < 5 && !ok; t++) {
      try {
        const m = await makeMailbox(userId, genName(style, len), domainName, ttlHours);
        made.push(m.address);
        ok = true;
      } catch (e) {
        if (e instanceof AppError && e.code === "TAKEN") continue;
        if (made.length) return made; // توقف بهدوء (حد/صيانة...) وأرجع ما أُنشئ
        throw e;
      }
    }
  }
  return made;
}
