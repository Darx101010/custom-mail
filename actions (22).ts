"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { needUser } from "@/lib/session";
import { AppError } from "@/lib/errors";
import { canUse } from "@/lib/plan";
import { makeMailbox, makeRandomMailboxes } from "@/lib/mailbox-service";
import { hashKey, KEY_RE } from "@/lib/keys";
import { applyDuration } from "@/lib/subscription";
import { limit } from "@/lib/ratelimit";
import { signOut } from "@/lib/auth";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "");

async function run(back: string, fn: () => Promise<string | void>) {
  let err = "", ok = "";
  try { ok = (await fn()) || "1"; } catch (e) { if (e instanceof AppError) err = e.code; else throw e; }
  revalidatePath("/dashboard");
  redirect(`${back}?${err ? `err=${err}` : `ok=${encodeURIComponent(ok)}`}`);
}

export async function createMailbox(fd: FormData) {
  const u = await needUser();
  await run("/dashboard", async () => { const m = await makeMailbox(u.id, s(fd, "name"), s(fd, "domain"), Number(s(fd, "ttl")) || 0); return `تم إنشاء ${m.address}`; });
}

export async function createRandom(fd: FormData) {
  const u = await needUser();
  await run("/dashboard", async () => {
    const made = await makeRandomMailboxes(u.id, s(fd, "style"), Number(s(fd, "len")) || 10, Number(s(fd, "count")) || 1, s(fd, "domain"), Number(s(fd, "ttl")) || 0);
    return made.length ? `تم إنشاء ${made.length}: ${made.slice(0, 3).join(", ")}` : "لم يتم إنشاء شيء";
  });
}

async function own(userId: string, id: string) {
  const b = await prisma.mailbox.findFirst({ where: { id, userId } });
  if (!b) throw new AppError("NOT_FOUND");
  return b;
}

export async function deleteMailbox(fd: FormData) {
  const u = await needUser();
  await run("/dashboard", async () => { const b = await own(u.id, s(fd, "id")); await prisma.mailbox.delete({ where: { id: b.id } }); return "تم الحذف"; });
}

export async function updateMailbox(fd: FormData) {
  const u = await needUser();
  const id = s(fd, "id");
  await run(`/dashboard/${id}`, async () => {
    const b = await own(u.id, id);
    const data: Prisma.MailboxUpdateInput = {};
    data.pinned = fd.get("pinned") === "on";
    const label = s(fd, "label").trim().slice(0, 40);
    if (label !== (b.label ?? "")) {
      if (label && !(await canUse(u.id, "inbox.2"))) throw new AppError("PREMIUM_ONLY");
      data.label = label || null;
    }
    const days = Math.min(Math.max(parseInt(s(fd, "autoDeleteDays"), 10) || 0, 0), 365);
    if (days !== b.autoDeleteDays) {
      if (days > 0 && !(await canUse(u.id, "privacy.1"))) throw new AppError("PREMIUM_ONLY");
      data.autoDeleteDays = days;
    }
    const color = s(fd, "color");
    if (color !== (b.color ?? "")) {
      if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) throw new AppError("BAD_NAME");
      if (color && !(await canUse(u.id, "mail.28"))) throw new AppError("PREMIUM_ONLY");
      data.color = color || null;
    }
    const icon = [...s(fd, "icon")].slice(0, 2).join("");
    if (icon !== (b.icon ?? "")) {
      if (icon && !(await canUse(u.id, "mail.29"))) throw new AppError("PREMIUM_ONLY");
      data.icon = icon || null;
    }
    const archived = fd.get("archived") === "on";
    if (archived !== b.archived) {
      if (archived && !(await canUse(u.id, "mail.30"))) throw new AppError("PREMIUM_ONLY");
      data.archived = archived;
    }
    const muted = fd.get("muted") === "on";
    if (muted !== b.muted) {
      if (muted && !(await canUse(u.id, "notify.28"))) throw new AppError("PREMIUM_ONLY");
      data.muted = muted;
    }
    const rules = s(fd, "rules").split("\n").slice(0, 10).map((l) => {
      const [kw, act] = l.split("|");
      return { kw: (kw ?? "").trim().toLowerCase().slice(0, 60), act: (act ?? "").trim() === "delete" ? "delete" : "star" };
    }).filter((r) => r.kw);
    if (JSON.stringify(rules) !== JSON.stringify(b.rules)) {
      if (rules.length && !(await canUse(u.id, "filters.4"))) throw new AppError("PREMIUM_ONLY");
      data.rules = rules as Prisma.InputJsonValue;
    }
    await prisma.mailbox.update({ where: { id }, data });
    return "تم الحفظ";
  });
}

export async function addBlocked(fd: FormData) {
  const u = await needUser();
  const id = s(fd, "id");
  await run(`/dashboard/${id}`, async () => {
    await own(u.id, id);
    if (!(await canUse(u.id, "filters.1"))) throw new AppError("PREMIUM_ONLY");
    const addr = z.string().min(3).max(320).regex(/^(@)?[^\s@]+(\.[^\s@]+)+$|^[^\s@]+@[^\s@]+\.[^\s@]+$/).parse(s(fd, "address").trim().toLowerCase());
    if ((await prisma.blockedSender.count({ where: { mailboxId: id } })) >= 100) throw new AppError("LIMIT");
    await prisma.blockedSender.upsert({ where: { mailboxId_address: { mailboxId: id, address: addr } }, update: {}, create: { mailboxId: id, address: addr } });
    return "تم الحظر";
  });
}

export async function removeBlocked(fd: FormData) {
  const u = await needUser();
  const id = s(fd, "id");
  await run(`/dashboard/${id}`, async () => {
    await own(u.id, id);
    await prisma.blockedSender.deleteMany({ where: { id: s(fd, "blockId"), mailboxId: id } });
    return "تم رفع الحظر";
  });
}

export async function redeemKey(fd: FormData) {
  const u = await needUser();
  await run("/dashboard/premium", async () => {
    if (!(await limit(`redeem:${u.id}`, 5, 3600))) throw new AppError("RATE");
    const key = s(fd, "key").trim().toUpperCase();
    if (!KEY_RE.test(key)) throw new AppError("BAD_KEY");
    const h = hashKey(key);
    // تفعيل ذري: ينجح مرة واحدة فقط حتى مع طلبين متزامنين
    const res = await prisma.licenseKey.updateMany({
      where: { keyHash: h, status: "UNUSED" },
      data: { status: "USED", redeemedById: u.id, redeemedAt: new Date() },
    });
    if (res.count !== 1) throw new AppError("BAD_KEY");
    const lk = await prisma.licenseKey.findUniqueOrThrow({ where: { keyHash: h } });
    await applyDuration(u.id, lk.durationDays);
    await prisma.auditLog.create({ data: { actor: u.id, action: "REDEEM_KEY", detail: lk.id } });
    return "تم تفعيل البريميوم 🎉";
  });
}

export async function logout() {
  await signOut({ redirectTo: "/" });
}
