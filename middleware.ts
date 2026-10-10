import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

// بوابة أولى سريعة (Edge): تتحقق من توقيع الكوكي فقط.
// التحقق الكامل (الحساب فعّال؟ الصلاحية؟) يتم في الخادم داخل requireAdminPage/requirePerm.
const PUBLIC = ["/admin/login", "/api/admin/login"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.includes(pathname)) return NextResponse.next();

  let ok = false;
  const token = req.cookies.get("admin_session")?.value;
  if (token && process.env.ADMIN_JWT_SECRET) {
    try {
      await jwtVerify(token, new TextEncoder().encode(process.env.ADMIN_JWT_SECRET));
      ok = true;
    } catch {}
  }
  if (!ok) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.redirect(new URL("/admin/login", req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*", "/api/admin/:path*"] };
