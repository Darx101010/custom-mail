import PostalMime from "postal-mime";

export interface Env {
  WEBHOOK_URL: string;     // https://yourdomain.com/api/inbound
  WEBHOOK_SECRET: string;  // نفس INBOUND_WEBHOOK_SECRET
}

async function hmacHex(secret: string, data: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default {
  async email(message: ForwardableEmailMessage, env: Env) {
    if (message.rawSize > 2_500_000) { message.setReject("Message too large"); return; }
    const raw = await new Response(message.raw).arrayBuffer();
    const parsed = await new PostalMime().parse(raw);

    const body = JSON.stringify({
      to: message.to,
      from: message.from,
      fromName: parsed.from?.name ?? null,
      subject: parsed.subject ?? "",
      text: (parsed.text ?? "").slice(0, 250_000),
      html: (parsed.html ?? "").slice(0, 900_000),
      size: message.rawSize,
    });
    const ts = String(Date.now());
    const res = await fetch(env.WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-timestamp": ts, "x-signature": await hmacHex(env.WEBHOOK_SECRET, `${ts}.${body}`) },
      body,
    });
    if (!res.ok) message.setReject("Temporary failure"); // يعيد المرسل المحاولة لاحقاً
  },
};
