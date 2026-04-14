import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { users, organizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

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
      // Auto-provision user + org on first login
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const [existing] = await db.select({ id: users.id })
          .from(users).where(eq(users.id, user.id)).limit(1);

        if (!existing) {
          const fullName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';
          // Create org and user in a transaction
          await db.transaction(async (tx) => {
            const [org] = await tx.insert(organizations).values({
              name: fullName + "'s Organization",
            }).returning();

            await tx.insert(users).values({
              id: user.id,
              email: user.email!,
              fullName,
              organizationId: org.id,
              role: 'owner',
            });
          });
        }
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
