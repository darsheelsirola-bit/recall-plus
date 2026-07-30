/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  readonly VITE_AUTH_GOOGLE_ENABLED?: string
  readonly VITE_AUTH_GITHUB_ENABLED?: string
  readonly VITE_AUTH_APPLE_ENABLED?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
