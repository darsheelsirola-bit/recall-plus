import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const env = import.meta.env as Record<string, string | undefined>
const supabaseUrl = env.VITE_SUPABASE_URL?.trim() ?? ''
const supabaseKey = (
  env.VITE_SUPABASE_PUBLISHABLE_KEY
  ?? env.VITE_SUPABASE_ANON_KEY
  ?? ''
).trim()

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey)

// Keep the export non-null so shared API helpers have one stable typed client.
// The placeholder client is never used for network access while configuration
// is absent; App renders a configuration error before protected content mounts.
const clientUrl = isSupabaseConfigured ? supabaseUrl : 'https://supabase.invalid'
const clientKey = isSupabaseConfigured ? supabaseKey : 'recall-plus-local-only'

export const supabase: SupabaseClient = createClient(clientUrl, clientKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'recall-plus-auth',
  },
})
