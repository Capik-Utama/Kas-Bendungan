import { createClient } from "@supabase/supabase-js";

// Fallback ini hanya berisi URL dan anon key yang memang dirancang untuk client.
// Environment variables tetap diprioritaskan saat deployment.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://zbfuwuhtrswuluaozvyg.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpiZnV3dWh0cnN3dWx1YW96dnlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzNjM0NDgsImV4cCI6MjEwNDkzOTQ0OH0.yzNPuzXiFGqX856rzUmGk_iznF64JXTTY9po2FCsSJQ";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
