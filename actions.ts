"use server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { ADMIN_COOKIE, adminCookieOptions, getAdmin, requirePerm, signAdminToken, hasPerm } from "@/lib/admin-session";
import { newKey, hashKey } from "@/lib/keys";
import { applyDuration } from "@/lib/subscription";
import { ALL_PERM_IDS } from "@/lib/permissions";
import { FEATURES } from "@/lib/features";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const back = (p: string) => { revalidatePath(p); };

export async function adminLogout() {
  (await cookies()).delete(ADMIN_COOKIE);
  redirect("/admin/login");
}

/* ---------- كلمة المرور ---------- */
function strongPassword(pw: string) {
  return pw.length >= 12 && /[A-Za-z]/.test(pw) && /\d/.test(pw) && pw.toLowerCase() !== "darx" && !/^(.)\1+$/.test(pw);
}

export async function changePassword(_: unknown, fd: FormData): Promise<{ error?: string }> {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login");
  const cur = String(fd.get("current") ?? ""), next = String(fd.get("next") ?? ""), again = String(fd.get("again") ?? "");
  if (!(await bcrypt.compare(cur, admin.passwordHash))) return { error: "كلمة المرور الحالية غير صحيحة" };
  if (next !== again) return { error: "كلمتا المرور غير متطابقتين" };
  if (!strongPassword(next)) return { error: "كلمة المرور ضعيفة: 12 حرفاً على الأقل وتحتوي أحرفاً وأرقاماً" };
  if (await bcrypt.compare(next, admin.passwordHash)) return { error: "اختر كلمة مرور مختلفة" };
  const updated = await prisma.adminAccount.update({
    where: { id: admin.id },
    data: { passwordHash: await bcrypt.hash(next, 12), mustChange: false, tokenVersion: { increment: 1 } },
  });
  (await cookies()).set(ADMIN_COOKIE, await signAdminToken(updated.id, updated.tokenVersion), adminCookieOptions);
  await audit(admin.username, "ADMIN_PASSWORD_CHANGED");
  redirect("/admin");
}

/* ---------- المستخدمون ---------- */
export async function banUser(fd: FormData) {
  const a = await requirePerm("users.ban");
  const id = s(fd, "id");
  await prisma.user.update({ where: { id }, data: { banned: true } });
  await prisma.session.deleteMany({ where: { userId: id } });
  await prisma.mailbox.updateMany({ where: { userId: id }, data: { isActive: false } });
  await audit(a.username, "BAN_USER", id); back("/admin/users");
}
export async function unbanUser(fd: FormData) {
  const a = await requirePerm("users.unban");
  const id = s(fd, "id");
  await prisma.user.update({ where: { id }, data: { banned: false } });
  await prisma.mailbox.updateMany({ where: { userId: id }, data: { isActive: true } });
  await audit(a.username, "UNBAN_USER", id); back("/admin/users");
}
export async function deleteUser(fd: FormData) {
  const a = await requirePerm("users.delete");
  const id = s(fd, "id");
  await prisma.user.delete({ where: { id } });
  await audit(a.username, "DELETE_USER", id); back("/admin/users");
}
export async function grantPremium(fd: FormData) {
  const a = await requirePerm("users.grant_premium");
  const id = s(fd, "id"), days = [0, 1, 7, 30, 90, 365].includes(Number(s(fd, "days"))) ? Number(s(fd, "days")) : 30;
  await applyDuration(id, days);
  await audit(a.username, "GRANT_PREMIUM", `${id}:${days}`); back("/admin/users");
}
export async function revokePremium(fd: FormData) {
  const a = await requirePerm("users.revoke_premium");
  const id = s(fd, "id");
  await prisma.subscription.deleteMany({ where: { userId: id } });
  await audit(a.username, "REVOKE_PREMIUM", id); back("/admin/users");
}
export async function setUserLimit(fd: FormData) {
  const a = await requirePerm("users.set_limit");
  const id = s(fd, "id"), raw = s(fd, "limit");
  const v = raw === "" ? null : Math.min(Math.max(parseInt(raw, 10) || 0, 0), 1000);
  await prisma.user.update({ where: { id }, data: { maxMailboxesOverride: v } });
  await audit(a.username, "SET_USER_LIMIT", `${id}:${v}`); back("/admin/users");
}

/* ---------- الإيميلات والرسائل ---------- */
export async function setMailboxActive(fd: FormData) {
  const id = s(fd, "id"), on = s(fd, "on") === "1";
  const a = await requirePerm(on ? "mailboxes.enable" : "mailboxes.disable");
  await prisma.mailbox.update({ where: { id }, data: { isActive: on } });
  await audit(a.username, on ? "ENABLE_MAILBOX" : "DISABLE_MAILBOX", id); back("/admin/mailboxes");
}
export async function deleteMailboxAdmin(fd: FormData) {
  const a = await requirePerm("mailboxes.delete");
  const id = s(fd, "id");
  await prisma.mailbox.delete({ where: { id } });
  await audit(a.username, "DELETE_MAILBOX", id); back("/admin/mailboxes");
}
export async function deleteMessageAdmin(fd: FormData) {
  const a = await requirePerm("messages.delete");
  const id = s(fd, "id");
  await prisma.message.delete({ where: { id } });
  await audit(a.username, "DELETE_MESSAGE", id); back("/admin/messages");
}

/* ---------- المفاتيح ---------- */
export async function generateKeysAction(_: unknown, fd: FormData): Promise<{ keys?: string[]; error?: string }> {
  const days = Number(s(fd, "days")), qty = Number(s(fd, "qty"));
  if (![0, 1, 7, 30, 90, 365].includes(days)) return { error: "مدة غير صالحة" };
  if (!Number.isInteger(qty) || qty < 1 || qty > 100) return { error: "الكمية 1-100" };
  let a;
  try { a = await requirePerm(qty > 1 ? "keys.generate_bulk" : "keys.generate"); } catch { return { error: "لا تملك الصلاحية" }; }
  const keys = Array.from({ length: qty }, newKey);
  const note = s(fd, "note").slice(0, 80) || null;
  await prisma.licenseKey.createMany({ data: keys.map((k) => ({ keyHash: hashKey(k), durationDays: days, note })) });
  await audit(a.username, "GENERATE_KEYS", `${qty}x${days}d ${note ?? ""}`);
  back("/admin/keys");
  return { keys }; // تُعرض مرة واحدة، لا تُخزَّن
}
export async function revokeKeyAction(fd: FormData) {
  const a = await requirePerm("keys.revoke");
  const id = s(fd, "id");
  await prisma.licenseKey.updateMany({ where: { id, status: "UNUSED" }, data: { status: "REVOKED" } });
  await audit(a.username, "REVOKE_KEY", id); back("/admin/keys");
}

/* ---------- الخطط والميزات ---------- */
export async function saveLimits(fd: FormData) {
  const a = await requirePerm("plans.edit_limits");
  const n = (k: string, d: number, mx: number) => Math.min(Math.max(parseInt(s(fd, k), 10) || d, 1), mx);
  await prisma.siteSetting.update({
    where: { id: 1 },
    data: { freeMax: n("freeMax", 3, 1000), premMax: n("premMax", 25, 1000), freeRetentionDays: n("freeRet", 7, 365), premRetentionDays: n("premRet", 90, 3650) },
  });
  await audit(a.username, "SAVE_LIMITS"); back("/admin/plans");
}
export async function saveFeatures(fd: FormData) {
  const a = await requirePerm("plans.edit_features");
  const canTier = hasPerm(a, "plans.set_tier");
  const existing = new Map((await prisma.featureFlag.findMany()).map((f) => [f.id, f]));
  const ops = FEATURES.flatMap((f) => {
    const enabled = fd.get(`en_${f.id}`) === "on";
    const tier = canTier && s(fd, `tier_${f.id}`) === "FREE" ? "FREE" : (existing.get(f.id)?.tier ?? "PREMIUM");
    const cur = existing.get(f.id);
    if (cur && cur.enabled === enabled && cur.tier === tier) return [];
    return [prisma.featureFlag.upsert({ where: { id: f.id }, update: { enabled, tier }, create: { id: f.id, enabled, tier } })];
  });
  if (ops.length) await prisma.$transaction(ops);
  await audit(a.username, "SAVE_FEATURES", `${ops.length} changed`); back("/admin/plans");
}

/* ---------- النطاقات ---------- */
export async function addDomain(fd: FormData) {
  const a = await requirePerm("domains.add");
  const name = s(fd, "name").toLowerCase();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(name)) return;
  await prisma.domain.upsert({ where: { name }, update: {}, create: { name, premiumOnly: fd.get("premiumOnly") === "on" } });
  await audit(a.username, "ADD_DOMAIN", name); back("/admin/domains");
}
export async function toggleDomain(fd: FormData) {
  const a = await requirePerm("domains.activate");
  const id = s(fd, "id");
  const d = await prisma.domain.findUniqueOrThrow({ where: { id } });
  if (d.isDefault && d.active) return; // لا نعطّل النطاق الافتراضي
  await prisma.domain.update({ where: { id }, data: { active: !d.active } });
  await audit(a.username, "TOGGLE_DOMAIN", d.name); back("/admin/domains");
}
export async function premiumDomain(fd: FormData) {
  const a = await requirePerm("domains.set_premium_only");
  const id = s(fd, "id");
  const d = await prisma.domain.findUniqueOrThrow({ where: { id } });
  await prisma.domain.update({ where: { id }, data: { premiumOnly: !d.premiumOnly } });
  await audit(a.username, "DOMAIN_PREMIUM_ONLY", d.name); back("/admin/domains");
}
export async function defaultDomain(fd: FormData) {
  const a = await requirePerm("domains.set_default");
  const id = s(fd, "id");
  await prisma.$transaction([
    prisma.domain.updateMany({ data: { isDefault: false } }),
    prisma.domain.update({ where: { id }, data: { isDefault: true, active: true, premiumOnly: false } }),
  ]);
  await audit(a.username, "SET_DEFAULT_DOMAIN", id); back("/admin/domains");
}
export async function removeDomain(fd: FormData) {
  const a = await requirePerm("domains.remove");
  const id = s(fd, "id");
  const d = await prisma.domain.findUniqueOrThrow({ where: { id } });
  if (d.isDefault) return;
  if (await prisma.mailbox.count({ where: { address: { endsWith: `@${d.name}` } } })) return; // لا نحذف نطاقاً فيه إيميلات
  await prisma.domain.delete({ where: { id } });
  await audit(a.username, "REMOVE_DOMAIN", d.name); back("/admin/domains");
}

/* ---------- الإعدادات ---------- */
export async function saveSettings(fd: FormData) {
  const a = await requirePerm("settings.edit_general");
  const data: Record<string, unknown> = { siteName: s(fd, "siteName").slice(0, 60) || "بريدي الدائم" };
  if (hasPerm(a, "settings.maintenance")) data.maintenance = fd.get("maintenance") === "on";
  if (hasPerm(a, "settings.registration")) data.registrationOpen = fd.get("registrationOpen") === "on";
  if (hasPerm(a, "settings.announcement")) data.announcement = s(fd, "announcement").slice(0, 200);
  if (hasPerm(a, "settings.reserved_names"))
    data.reserved = s(fd, "reserved").toLowerCase().split(",").map((x) => x.trim()).filter(Boolean).join(",");
  await prisma.siteSetting.update({ where: { id: 1 }, data });
  await audit(a.username, "SAVE_SETTINGS"); back("/admin/settings");
}

/* ---------- الإساءة ---------- */
export async function resolveReport(fd: FormData) {
  const a = await requirePerm("security.resolve_abuse");
  const id = s(fd, "id");
  await prisma.abuseReport.update({ where: { id }, data: { resolved: true } });
  await audit(a.username, "RESOLVE_REPORT", id); back("/admin/security");
}

/* ---------- المسؤولون والأدوار ---------- */
export async function createAdmin(fd: FormData) {
  const a = await requirePerm("admins.create");
  const username = s(fd, "username").toLowerCase(), pw = String(fd.get("password") ?? ""), roleId = s(fd, "roleId");
  if (!/^[a-z0-9_.-]{3,32}$/.test(username) || !strongPassword(pw)) return;
  const role = await prisma.adminRole.findUniqueOrThrow({ where: { id: roleId } });
  if (role.permissions.includes("*") && !a.role.permissions.includes("*")) return; // لا ترقية فوق صلاحياتك
  await prisma.adminAccount.create({ data: { username, passwordHash: await bcrypt.hash(pw, 12), roleId, mustChange: true } });
  await audit(a.username, "CREATE_ADMIN", username); back("/admin/admins");
}
export async function setAdminRole(fd: FormData) {
  const a = await requirePerm("admins.edit");
  const id = s(fd, "id"), roleId = s(fd, "roleId");
  if (id === a.id) return; // لا تعدّل دورك بنفسك
  const role = await prisma.adminRole.findUniqueOrThrow({ where: { id: roleId } });
  if (role.permissions.includes("*") && !a.role.permissions.includes("*")) return;
  await prisma.adminAccount.update({ where: { id }, data: { roleId, tokenVersion: { increment: 1 } } });
  await audit(a.username, "SET_ADMIN_ROLE", `${id}:${role.name}`); back("/admin/admins");
}
export async function toggleAdmin(fd: FormData) {
  const a = await requirePerm("admins.deactivate");
  const id = s(fd, "id");
  if (id === a.id) return;
  const t = await prisma.adminAccount.findUniqueOrThrow({ where: { id } });
  await prisma.adminAccount.update({ where: { id }, data: { active: !t.active, tokenVersion: { increment: 1 } } });
  await audit(a.username, "TOGGLE_ADMIN", t.username); back("/admin/admins");
}
export async function resetAdminPassword(fd: FormData) {
  const a = await requirePerm("admins.reset_password");
  const id = s(fd, "id"), pw = String(fd.get("password") ?? "");
  if (!strongPassword(pw)) return;
  await prisma.adminAccount.update({ where: { id }, data: { passwordHash: await bcrypt.hash(pw, 12), mustChange: true, tokenVersion: { increment: 1 } } });
  await audit(a.username, "RESET_ADMIN_PASSWORD", id); back("/admin/admins");
}
export async function saveRolePerms(fd: FormData) {
  const a = await requirePerm("roles.edit");
  const id = s(fd, "id");
  const role = await prisma.adminRole.findUniqueOrThrow({ where: { id } });
  if (role.name === "SUPER") return; // دور المالك ثابت
  const isSuper = a.role.permissions.includes("*");
  const chosen = ALL_PERM_IDS.filter((p) => fd.get(`p_${p}`) === "on" && (isSuper || a.role.permissions.includes(p)));
  await prisma.adminRole.update({ where: { id }, data: { permissions: chosen } });
  await prisma.adminAccount.updateMany({ where: { roleId: id }, data: { tokenVersion: { increment: 1 } } });
  await audit(a.username, "SAVE_ROLE", `${role.name}:${chosen.length}`); back("/admin/admins");
}
export async function createRole(fd: FormData) {
  const a = await requirePerm("roles.edit");
  const name = s(fd, "name").toUpperCase().replace(/[^A-Z0-9_]/g, "").slice(0, 24);
  if (!name) return;
  await prisma.adminRole.upsert({ where: { name }, update: {}, create: { name, permissions: [] } });
  await audit(a.username, "CREATE_ROLE", name); back("/admin/admins");
}
