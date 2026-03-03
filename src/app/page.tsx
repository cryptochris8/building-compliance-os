import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function RootPage() {
  let isAuthenticated = false;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    isAuthenticated = !!user;
  } catch {
    // Not authenticated
  }

  if (isAuthenticated) {
    redirect("/dashboard");
  }

  // Non-authenticated users: redirect to marketing page
  // The (marketing) group handles /pricing, /calculator
  // For the landing page, we redirect to a marketing route
  redirect("/home");
}
