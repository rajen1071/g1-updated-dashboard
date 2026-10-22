import { NextRequest, NextResponse } from "next/server";
// When DASHBOARD_PASSWORD is set, the whole site (pages + API) asks for that password. Any username works.
export function middleware(req: NextRequest) {
  const pw = process.env.DASHBOARD_PASSWORD;
  if (!pw) return NextResponse.next();
  const b64 = (req.headers.get("authorization") || "").split(" ")[1];
  const dec = b64 ? atob(b64) : "";
  if (dec.split(":").slice(1).join(":") === pw) return NextResponse.next();
  return new NextResponse("Login required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Mautic Dashboard"' } });
}
export const config = { matcher: "/((?!_next).*)" };
