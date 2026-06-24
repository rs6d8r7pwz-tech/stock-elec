import { createClient } from '@supabase/supabase-js'

// Client Supabase côté SERVEUR uniquement (clé service-role).
// Ne jamais importer ce fichier dans un composant client.
export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  if (!url || !serviceKey) {
    throw new Error('Variables Supabase serveur manquantes (URL / SERVICE_ROLE_KEY).')
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
