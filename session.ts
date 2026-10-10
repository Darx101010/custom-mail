import { redirect } from "next/navigation";
import { auth } from "./auth";
import { prisma } from "./prisma";

export async function needUser() {
  const s = await auth();
  if (!s?.user?.id) redirect("/");
  const u = await prisma.user.findUnique({ where: { id: s.user.id } });
  if (!u || u.banned) redirect("/");
  return u;
}
