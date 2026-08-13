import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { signInWithGoogle, supabase, supabaseConfigured } from '../lib/supabase'

export default function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  async function submit(event: FormEvent) { event.preventDefault(); if (!email || !password) { setMessage('Enter your email and password to continue.'); return } if (!supabaseConfigured) { setMessage('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'); return } const { error } = await supabase.auth.signInWithPassword({ email, password }); if (error) setMessage(error.message); else navigate('/dashboard') }
  async function google() { if (!supabaseConfigured) { setMessage('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'); return } const { error } = await signInWithGoogle(); if (error) setMessage(error.message) }
  return <div className="auth-shell"><div className="auth-brand"><div className="brand-mark">G</div><span>GeoSuite</span></div><div className="auth-card"><div className="eyebrow">AI visibility intelligence</div><h1>Welcome back</h1><p className="muted">See how your brand appears across the answers people trust.</p><form onSubmit={submit} className="stack"><label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" /></label><label>Password<div className="password-field"><input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" /><Link to="#" className="field-action">Forgot?</Link></div></label><button className="button primary" type="submit">Sign in <span>→</span></button></form><div className="divider"><span>or continue with</span></div><button className="button secondary" onClick={google}><span className="google-dot">G</span> Continue with Google</button>{message && <p className="form-message" role="status">{message}</p>}<p className="auth-footer">New to GeoSuite? <Link to="/onboarding">Start a workspace</Link></p></div><p className="legal">By continuing, you agree to our Terms and Privacy Policy.</p></div>
}
