import React, { createContext, useContext, useEffect, useState } from 'react'
import { fetchTenantSettings, saveTenantSettings } from '../lib/db'
import type { TenantSettings } from '../types/database'

const DEFAULT_THEME: TenantSettings = {
  id: 'default',
  slug: 'default',
  company_name: 'Amore Gestão',
  logo_url: null,
  favicon_url: null,
  primary_color: '#C2533B',
  primary_dark: '#A4432E',
  primary_light: '#D4684F',
  sidebar_color: '#F7E8EA',
  accent_color: '#C2533B',
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

// Paleta antiga (bordô) salva no banco/localStorage migra para a identidade coral Amore.
// Cores personalizadas via White Label continuam valendo.
const LEGACY_PRIMARY = ['#6b1212', '#8b1a1a', '#4a0c0c']
export function brandPalette(t: TenantSettings) {
  const legacy = LEGACY_PRIMARY.includes((t.primary_color || '').toLowerCase())
  return legacy
    ? { primary: '#C2533B', light: '#D4684F', dark: '#A4432E' }
    : { primary: t.primary_color, light: t.primary_light, dark: t.primary_dark }
}

function applyCSS(t: TenantSettings) {
  const root = document.documentElement
  const p = brandPalette(t)
  root.style.setProperty('--bordo', p.primary)
  root.style.setProperty('--bordo-l', p.light)
  root.style.setProperty('--bordo-d', p.dark)
  root.style.setProperty('--bordo-bg', `color-mix(in srgb, ${p.primary} 10%, #fff)`)
  // Menu lateral claro: a cor escura do White Label antigo deixaria o texto ilegível
  root.style.setProperty('--sidebar', '#F7E8EA')

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
