import { randomInt } from "crypto";

const ADJ = ["swift","brave","quiet","lucky","cosmic","silver","wild","neon","frozen","royal","shadow","pixel","amber","turbo","crimson"];
const NOUN = ["falcon","wolf","tiger","comet","ninja","dragon","pilot","rider","hunter","ghost","storm","fox","raven","knight","viper"];
const pick = <T,>(a: T[]) => a[randomInt(a.length)];
const str = (set: string, n: number) => Array.from({ length: n }, () => set[randomInt(set.length)]).join("");
const L = "abcdefghijklmnopqrstuvwxyz";
const LN = L + "0123456789";
const D = "0123456789";

export const STYLES = ["letters", "name", "gamer", "mix", "words"] as const;
export type Style = (typeof STYLES)[number];
// الأنماط المجانية، والباقي يحتاج ميزة بريميوم المقابلة
export const STYLE_FEATURE: Partial<Record<Style, string>> = { gamer: "mail.2", mix: "mail.3", words: "mail.4" };
export const STYLE_LABEL: Record<Style, string> = {
  letters: "حروف عشوائية", name: "اسم.لقب+أرقام", gamer: "قيمر_لقب_أرقام ⭐", mix: "حروف وأرقام ⭐", words: "كلمات مدمجة ⭐",
};

export function genName(style: Style, len = 10): string {
  switch (style) {
    case "name": return `${pick(ADJ)}.${pick(NOUN)}${str(D, 2)}`;
    case "gamer": return `${pick(ADJ)}_${pick(NOUN)}_${str(D, 3)}`;
    case "mix": return str(L, 1) + str(LN, Math.max(5, len - 1));
    case "words": return `${pick(ADJ)}${pick(NOUN)}${pick(NOUN)}${str(D, 2)}`;
    default: return str(L, len);
  }
}
