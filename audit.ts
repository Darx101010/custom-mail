import { headers } from "next/headers";
import { prisma } from "./prisma";

export async function audit(actor: string, action: string, detail?: string) {
  let ip: string | undefined;
  try { ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim(); } catch {}
  await prisma.auditLog.create({ data: { actor, action, detail: detail?.slice(0, 500), ip } }).catch(() => {});
}
