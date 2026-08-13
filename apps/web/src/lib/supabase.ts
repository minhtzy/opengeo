import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export const supabaseConfigured = Boolean(url && anonKey)
export const supabase = createClient(url ?? 'https://placeholder.supabase.co', anonKey ?? 'placeholder-anon-key')

export async function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback` } })
}

export async function signOut() { return supabase.auth.signOut() }

export async function createWorkspace(input: { name: string; website: string; prompts: string[] }) {
  const { data: auth, error: authError } = await supabase.auth.getUser()
  if (authError || !auth.user) throw authError ?? new Error('You must be signed in.')
  const { data: org, error: orgError } = await supabase.from('organizations').insert({ name: input.name }).select('id').single()
  if (orgError) throw orgError
  const { error: membershipError } = await supabase.from('memberships').insert({ org_id: org.id, user_id: auth.user.id, role: 'owner' })
  if (membershipError) throw membershipError
  const { data: brand, error: brandError } = await supabase.from('brands').insert({ org_id: org.id, name: input.name, website: input.website }).select('id').single()
  if (brandError) throw brandError
  if (input.prompts.length) {
    const { error } = await supabase.from('prompts').insert(input.prompts.map(text => ({ org_id: org.id, brand_id: brand.id, text })))
    if (error) throw error
  }
  return { orgId: org.id, brandId: brand.id }
}
