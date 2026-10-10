import { randomInt, createHmac } from "crypto";

const AB = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 رمزاً بلا I وO
const grp = () => Array.from({ length: 4 }, () => AB[randomInt(32)]).join("");

export const newKey = () => `DARX-${grp()}-${grp()}-${grp()}-${grp()}`;
export const KEY_RE = /^DARX(-[A-Z2-9]{4}){4}$/;
export function hashKey(k: string) {
  const pepper = process.env.KEY_PEPPER;
  if (!pepper) throw new Error("KEY_PEPPER is not set");
  return createHmac("sha256", pepper).update(k.trim().toUpperCase()).digest("hex");
}
