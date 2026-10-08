// Cross-device sync config. Leave empty to run fully local (the app works the same, just without sync).
// Fill these in after creating a free Supabase project (see README.md -> "Turn on sync").
// The anon key is designed to be public; row-level security in supabase/schema.sql protects the data.
export const CONFIG = {
  SUPABASE_URL: '',      // e.g. 'https://abcdxyz.supabase.co'
  SUPABASE_ANON_KEY: '', // 'eyJhbGciOi...'
};
