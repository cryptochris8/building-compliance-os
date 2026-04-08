import { createClient } from '@supabase/supabase-js';

/**
 * Creates a Supabase client using the service role key.
 * Use this for server-side operations that need elevated privileges
 * (e.g., Inngest background jobs, storage uploads outside of user context).
 */
export function createServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, supabaseServiceKey);
}
