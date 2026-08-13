import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function AuthCallbackPage() {
  const navigate = useNavigate()
  useEffect(() => { supabase.auth.getSession().then(() => navigate('/dashboard', { replace: true })) }, [navigate])
  return <div className="auth-shell"><div className="auth-card"><p className="muted">Finishing Google sign-in…</p></div></div>
}
