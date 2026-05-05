import { createClient } from "@supabase/supabase-js";

import { getRequiredEnv } from "@/lib/env";
import type { Database } from "@/types/database";

export function createAdminClient() {
  return createClient<Database>(
    getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
