import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC_ROUTES = [
  "/",
  "/home",
  "/login",
  "/signup",
  "/pricing",
  "/calculator",
  "/api/webhooks/stripe",
];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/"),
  );
}

const isDev = process.env.NODE_ENV === "development";

function generateCspHeader(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""} js.stripe.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: *.supabase.co",
    "font-src 'self' data:",
    "connect-src 'self' *.supabase.co *.sentry.io api.stripe.com *.inngest.com",
    "frame-src js.stripe.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

function applySecurityHeaders(response: NextResponse, nonce: string): void {
  response.headers.set("Content-Security-Policy", generateCspHeader(nonce));
  response.headers.set("x-nonce", nonce);
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), interest-cohort=()");
  response.headers.set("X-DNS-Prefetch-Control", "on");
  response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Generate CSP nonce for every request
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  // Skip auth for static files (specific extensions only to prevent bypass via dots in URLs)
  const STATIC_EXT = /\.(svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf|eot|map)$/;
  if (
    pathname.startsWith("/_next") ||
    STATIC_EXT.test(pathname)
  ) {
    return NextResponse.next();
  }

  // Public routes: apply CSP but skip auth
  if (isPublicRoute(pathname) || pathname === "/api/webhooks/stripe") {
    const response = NextResponse.next({
      request: { headers: new Headers({ ...Object.fromEntries(request.headers), "x-nonce": nonce }) },
    });
    applySecurityHeaders(response, nonce);
    return response;
  }

  // Protected routes: apply CSP + auth
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  let response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response = NextResponse.next({
              request: { headers: requestHeaders },
            });
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    // Validate redirect to prevent open redirect attacks
    if (pathname.startsWith("/") && !pathname.startsWith("//") && !pathname.includes("://")) {
      loginUrl.searchParams.set("redirect", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  applySecurityHeaders(response, nonce);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
