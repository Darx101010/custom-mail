import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis = process.env.UPSTASH_REDIS_REST_URL ? Redis.fromEnv() : null;
const mem = new Map<string, { n: number; t: number }>();
const cache = new Map<string, Ratelimit>();

/** يرجع true إذا مسموح. في الإنتاج استخدم Upstash (الذاكرة لا تصلح مع serverless). */
export async function limit(key: string, max: number, windowSec: number): Promise<boolean> {
  if (redis) {
    const id = `${max}:${windowSec}`;
    let rl = cache.get(id);
    if (!rl) {
      rl = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(max, `${windowSec} s` as `${number} s`) });
      cache.set(id, rl);
    }
    return (await rl.limit(key)).success;
  }
  const now = Date.now();
  const r = mem.get(key);
  if (!r || now - r.t > windowSec * 1000) { mem.set(key, { n: 1, t: now }); return true; }
  r.n++;
  return r.n <= max;
}
