import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_KEY

if (!url || !key) {
  throw new Error('VITE_SUPABASE_URL und VITE_SUPABASE_KEY fehlen (.env.local)')
}

// Sitzung bleibt dauerhaft im Gerät gespeichert, das Tablet meldet sich nur einmal an
export const supabase = createClient<Database>(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
})
