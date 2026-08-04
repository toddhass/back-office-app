import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Set these in a .env file at the project root (see .env.example):
//   VITE_SUPABASE_URL=https://tjcwvcglepuuqvxqwyrw.supabase.co
//   VITE_SUPABASE_ANON_KEY=<your anon/publishable key>
export const supabase = createClient<Database>(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// Restaurant ID now comes from AuthContext (src/lib/AuthContext.tsx),
// derived from the logged-in user's staff_restaurants row. Each screen
// should read it via useAuth() rather than importing a constant.
