import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { FEATURES } from "../src/lib/features";
import { ROLE_PRESETS } from "../src/lib/permissions";

const prisma = new PrismaClient();

async function main() {
  await prisma.siteSetting.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });

  const domain = (process.env.MAIL_DOMAIN || "yourdomain.com").toLowerCase();
  await prisma.domain.upsert({
    where: { name: domain }, update: {}, create: { name: domain, isDefault: true, active: true },
  });

  await prisma.featureFlag.createMany({
    data: FEATURES.map((f) => ({ id: f.id, enabled: true, tier: "PREMIUM" as const })),
    skipDuplicates: true,
  });

  for (const [name, permissions] of Object.entries(ROLE_PRESETS)) {
    await prisma.adminRole.upsert({ where: { name }, update: name === "SUPER" ? { permissions } : {}, create: { name, permissions } });
  }

  const username = process.env.ADMIN_USERNAME || "admin";
  const exists = await prisma.adminAccount.findUnique({ where: { username } });
  if (!exists) {
    const role = await prisma.adminRole.findUniqueOrThrow({ where: { name: "SUPER" } });
    const pw = process.env.ADMIN_INITIAL_PASSWORD || "Darx";
    await prisma.adminAccount.create({
      data: { username, passwordHash: await bcrypt.hash(pw, 12), roleId: role.id, mustChange: true },
    });
    console.log(`Admin created: ${username} (يُطلب تغيير كلمة المرور عند أول دخول)`);
  }
  console.log("Seed done. features:", FEATURES.length);
}

main().finally(() => prisma.$disconnect());
