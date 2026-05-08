import React, { createContext, useContext, useEffect, useState } from 'react'
import { fetchTenantSettings, saveTenantSettings } from '../lib/db'
import type { TenantSettings } from '../types/database'

const DEFAULT_THEME: TenantSettings = {
  id: 'default',
  slug: 'default',
  company_name: 'Amore Gestão',
  logo_url: null,
  favicon_url: null,
  primary_color: '#6B1212',
  primary_dark: '#4A0C0C',
  primary_light: '#8B1A1A',
  sidebar_color: '#1A0505',
  accent_color: '#6B1212',
  font_heading: 'Plus Jakarta Sans',
  font_body: 'Inter',
  stores: ['Amore CD', 'Amore Paiva', 'Flow CD'],
  plan: 'pro',
  support_email: null,
  support_whatsapp: null,
  footer_text: null,
  custom_domain: null,
  features: { dashboard: true, pendencias: true, gamificacao: true, marketing: true, vendas: true, compras: true, financeiro: true, cozinha: true, salao: true },
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

interface ThemeContextValue {
  theme: TenantSettings
  updateTheme: (partial: Partial<TenantSettings>) => Promise<void>
  applyTheme: (t: TenantSettings) => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME,
  updateTheme: async () => {},
  applyTheme: () => {},
})

function applyCSS(t: TenantSettings) {
  const root = document.documentElement
  root.style.setProperty('--bordo', t.primary_color)
  root.style.setProperty('--bordo-l', t.primary_light)
  root.style.setProperty('--bordo-d', t.primary_dark)
  root.style.setProperty('--sidebar', t.sidebar_color)
  root.style.setProperty('--sidebar-a', lighten(t.sidebar_color, 10))
  root.style.setProperty('--sidebar-b', lighten(t.sidebar_color, 8))

  const fontId = 'dynamic-font'
  let link = document.getElementById(fontId) as HTMLLinkElement | null
  if (!link) {
    link = document.createElement('link')
    link.id = fontId
    link.rel = 'stylesheet'
    document.head.appendChild(link)
  }
  const h = t.font_heading.replace(/ /g, '+')
  const b = t.font_body.replace(/ /g, '+')
  link.href = `https://fonts.googleapis.com/css2?family=${h}:wght@400;500;600;700;800&family=${b}:wght@400;500;600&display=swap`
}

function lighten(hex: string, amount: number): string {
  try {
    const num = parseInt(hex.replace('#', ''), 16)
    const r = Math.min(255, (num >> 16) + amount)
    const g = Math.min(255, ((num >> 8) & 0xff) + amount)
    const b = Math.min(255, (num & 0xff) + amount)
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')
  } catch { return hex }
}

function getLocalTheme(): TenantSettings {
  try {
    const stored = localStorage.getItem('amore_theme')
    return stored ? { ...DEFAULT_THEME, ...JSON.parse(stored) } : DEFAULT_THEME
  } catch { return DEFAULT_THEME }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<TenantSettings>(getLocalTheme)

  useEffect(() => {
    applyCSS(theme)
    document.title = theme.company_name

    // Load from Supabase (overrides localStorage)
    fetchTenantSettings().then(data => {
      if (data) {
        const merged = { ...DEFAULT_THEME, ...data }
        setTheme(merged)
        localStorage.setItem('amore_theme', JSON.stringify(merged))
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    applyCSS(theme)
    document.title = theme.company_name
  }, [theme])

  const updateTheme = async (partial: Partial<TenantSettings>) => {
    const next = { ...theme, ...partial, updated_at: new Date().toISOString() }
    setTheme(next)
    localStorage.setItem('amore_theme', JSON.stringify(next))
    // Persist to Supabase non-blocking
    saveTenantSettings(next).catch(() => {})
  }

  const applyTheme = (t: TenantSettings) => {
    setTheme(t)
    localStorage.setItem('amore_theme', JSON.stringify(t))
  }

  return (
    <ThemeContext.Provider value={{ theme, updateTheme, applyTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
export { DEFAULT_THEME }
