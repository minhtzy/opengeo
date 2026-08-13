import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from './App'
import { saveBrandConfig } from './lib/brand-config'

beforeEach(() => localStorage.clear())

describe('App', () => {
  it('exports the web application', () => {
    expect(App).toBeTypeOf('function')
  })

  it('shows the sign-in form at /login', () => {
    render(<MemoryRouter initialEntries={['/login']}><App /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument()
  })

  it('blocks onboarding until brand name and a valid website are supplied', async () => {
    render(<MemoryRouter initialEntries={['/onboarding']}><App /></MemoryRouter>)
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(screen.getByText(/brand name is required/i)).toBeInTheDocument()
  })

  it('redirects an unconfigured dashboard to onboarding', () => {
    render(<MemoryRouter initialEntries={['/dashboard']}><App /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: /let’s measure your brand/i })).toBeInTheDocument()
  })

  it('shows a collecting state for a configured brand', () => {
    saveBrandConfig({ brandName: 'GeoSuite', website: 'https://geosuite.ai', trackingMode: 'website', prompts: [] })
    render(<MemoryRouter initialEntries={['/dashboard']}><App /></MemoryRouter>)
    expect(screen.getByText(/collecting your first AI visibility data/i)).toBeInTheDocument()
  })

  it.each([
    ['/prompts', /prompts you’re tracking/i],
    ['/sources', /AI sources/i],
    ['/settings', /workspace settings/i],
  ])('keeps a configured workspace available at %s', (path, heading) => {
    saveBrandConfig({ brandName: 'GeoSuite', website: 'https://geosuite.ai', trackingMode: 'website', prompts: [] })
    render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /welcome back/i })).not.toBeInTheDocument()
  })
})
