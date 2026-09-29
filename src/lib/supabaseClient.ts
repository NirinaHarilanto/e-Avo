import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.types'
import { fetchAvecSynchro } from './synchro'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY doivent être définies (voir .env.example). ' +
      'Ce client ne doit jamais recevoir la clé secrète — uniquement la clé publique anon/publishable.',
  )
}

// fetchAvecSynchro : toute écriture réussie prévient les autres espaces ouverts (voir synchro.ts).
export const supabase = createClient<Database>(url, anonKey, { global: { fetch: fetchAvecSynchro } })
