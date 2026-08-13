import { Navigate, NavLink, useLocation } from 'react-router-dom'
import { loadBrandConfig } from '../lib/brand-config'

const navItems = [['Overview', '/dashboard', '⌂'], ['Prompts', '/prompts', '⌁'], ['Sources', '/sources', '◌'], ['Settings', '/settings', '⚙']] as const
const pageContent = {
  '/prompts': { title: 'Prompts you’re tracking', description: 'Manage the questions GeoSuite monitors across AI search.', action: '+ Add prompt', empty: 'Add your first prompt', detail: 'Track the questions your audience asks to see where your brand appears.' },
  '/sources': { title: 'AI sources', description: 'See where your brand is surfaced across AI search.', action: 'Refresh sources', empty: 'Sources are being collected', detail: 'Your source breakdown will appear when the first visibility scan is ready.' },
  '/settings': { title: 'Workspace settings', description: 'Manage how GeoSuite identifies and tracks your brand.', action: 'Edit brand', empty: 'Tracking is active', detail: 'Your workspace is configured for ongoing AI visibility measurement.' },
} as const

export default function WorkspacePage() {
  const config = loadBrandConfig(); const { pathname } = useLocation(); if (!config) return <Navigate to="/onboarding" replace />
  const page = pageContent[pathname as keyof typeof pageContent]; if (!page) return <Navigate to="/dashboard" replace />
  return <div className="dashboard-shell"><aside className="sidebar"><div className="auth-brand"><div className="brand-mark">G</div><span>GeoSuite</span></div><div className="workspace-switcher"><span className="avatar">{config.brandName.charAt(0).toUpperCase()}</span><span><strong>{config.brandName}</strong><small>Workspace</small></span><span>⌄</span></div><nav>{navItems.map(([label, to, icon]) => <NavLink key={to} to={to} className={({ isActive }) => isActive ? 'active' : ''}><span>{icon}</span>{label}</NavLink>)}</nav></aside><main className="dashboard-main"><header className="dashboard-header"><div><div className="breadcrumb">Workspace <span>/</span> {page.title}</div><h1>{page.title}</h1><p className="muted">{page.description}</p></div><button className="button secondary small">{page.action}</button></header><section className="panel" style={{ marginTop: 38, minHeight: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, textAlign: 'center' }}><span className="empty-icon">⌁</span><h2 style={{ margin: 0, fontFamily: 'Space Grotesk', fontSize: 18 }}>{page.empty}</h2><p className="muted" style={{ margin: 0, maxWidth: 360, fontSize: 12 }}>{page.detail}</p></section></main></div>
}
