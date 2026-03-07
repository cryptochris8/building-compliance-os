import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Validate that a redirect path is safe (internal, relative path only).
 * Prevents open redirect attacks via protocol-relative URLs, external domains, etc.
 */
function sanitizeRedirectPath(path: string): string {
  // Must start with a single forward slash and not contain protocol markers
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.startsWith("/\\") ||
    path.includes("://")
  ) {
    return "/dashboard";
  }
  return path;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = sanitizeRedirectPath(searchParams.get("next") ?? "/dashboard");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
