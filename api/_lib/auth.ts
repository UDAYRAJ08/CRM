/// <reference types="node" />
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;

// Resolves the signed-in Supabase user from the Bearer token; null when missing or invalid.
export async function requireUser(req: any): Promise<{ id: string; email: string | null } | null> {
  const url = supabaseUrl();
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const auth = String(req.headers?.authorization || '');
  if (!url || !anonKey || !auth.startsWith('Bearer ')) return null;
  const who = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: auth } });
  if (!who.ok) return null;
  const u: any = await who.json().catch(() => null);
  return u?.id ? { id: u.id, email: u.email ?? null } : null;
}

export function adminDb(): SupabaseClient {
  const url = supabaseUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('SUPABASE_URL is not set');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return createClient(url, key, { auth: { persistSession: false } });
}
