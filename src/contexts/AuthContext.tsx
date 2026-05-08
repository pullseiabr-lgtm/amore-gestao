import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchProfile, upsertProfile, updateProfile, insertAuditLog } from '../lib/db'
import type { Profile, PermissionsMap } from '../types/database'

const DEMO_USERS: Record<string, { pass: string; profile: Profile }> = {
  'admin@amore.com.br': {
    pass: 'admin123',
    profile: { id: 'u-admin', email: 'admin@amore.com.br', name: 'Rodrigo Admin', role: 'super_admin', loja: 'Todas', status: 'active', avatar_color: '#6B1212', initials: 'RA', permissions_override: null, created_at: new Date().toISOString(), last_login: new Date().toISOString(), created_by: null },
  },
  'gerente@amore.com.br': {
    pass: 'gerente123',
    profile: { id: 'u-gerente', email: 'gerente@amore.com.br', name: 'Ana Gerente', role: 'manager', loja: 'Amore Paiva', status: 'active', avatar_color: '#10B981', initials: 'AG', permissions_override: null, created_at: new Date().toISOString(), last_login: new Date().toISOString(), created_by: 'u-admin' },
  },
  'joao@amore.com.br': {
    pass: 'garcom123',
    profile: { id: 'u-joao', email: 'joao@amore.com.br', name: 'João Ricardo', role: 'user', loja: 'Amore Paiva', status: 'active', avatar_color: '#6366F1', initials: 'JR', permissions_override: null, created_at: new Date().toISOString(), last_login: new Date().toISOString(), created_by: 'u-admin' },
  },
}

export const ROLE_PERMISSIONS: Record<string, PermissionsMap> = {
  super_admin: {
    dashboard: { view: true, create: true, edit: true, delete: true, export: true },
    pendencias: { view: true, create: true, edit: true, delete: true, export: true },
    gamificacao: { view: true, create: true, edit: true, delete: true, export: true },
    marketing: { view: true, create: true, edit: true, delete: true, export: true },
    vendas: { view: true, create: true, edit: true, delete: true, export: true },
    compras: { view: true, create: true, edit: true, delete: true, export: true },
    financeiro: { view: true, create: true, edit: true, delete: true, export: true },
    cozinha: { view: true, create: true, edit: true, delete: true, export: true },
    salao: { view: true, create: true, edit: true, delete: true, export: true },
    usuarios: { view: true, create: true, edit: true, delete: true, export: true },
    configuracoes: { view: true, create: true, edit: true, delete: true, export: true },
  },
  admin: {
    dashboard: { view: true, create: true, edit: true, delete: true, export: true },
    pendencias: { view: true, create: true, edit: true, delete: true, export: true },
    gamificacao: { view: true, create: true, edit: true, delete: true, export: true },
    marketing: { view: true, create: true, edit: true, delete: true, export: true },
    vendas: { view: true, create: true, edit: true, delete: true, export: true },
    compras: { view: true, create: true, edit: true, delete: true, export: true },
    financeiro: { view: true, create: true, edit: true, delete: true, export: true },
    cozinha: { view: true, create: true, edit: true, delete: true, export: true },
    salao: { view: true, create: true, edit: true, delete: true, export: true },
    usuarios: { view: true, create: true, edit: true, delete: false, export: true },
    configuracoes: { view: false, create: false, edit: false, delete: false, export: false },
  },
  manager: {
    dashboard: { view: true, create: false, edit: false, delete: false, export: true },
    pendencias: { view: true, create: true, edit: true, delete: false, export: false },
    gamificacao: { view: true, create: true, edit: true, delete: false, export: false },
    marketing: { view: true, create: true, edit: true, delete: false, export: false },
    vendas: { view: true, create: true, edit: true, delete: false, export: true },
    compras: { view: true, create: true, edit: true, delete: false, export: false },
    financeiro: { view: true, create: false, edit: false, delete: false, export: true },
    cozinha: { view: true, create: true, edit: true, delete: false, export: false },
    salao: { view: true, create: true, edit: true, delete: false, export: false },
    usuarios: { view: false, create: false, edit: false, delete: false, export: false },
    configuracoes: { view: false, create: false, edit: false, delete: false, export: false },
  },
  user: {
    dashboard: { view: true, create: false, edit: false, delete: false, export: false },
    pendencias: { view: true, create: false, edit: false, delete: false, export: false },
    gamificacao: { view: true, create: false, edit: false, delete: false, export: false },
    vendas: { view: true, create: true, edit: false, delete: false, export: false },
    cozinha: { view: true, create: true, edit: false, delete: false, export: false },
    salao: { view: true, create: true, edit: false, delete: false, export: false },
    usuarios: { view: false, create: false, edit: false, delete: false, export: false },
    configuracoes: { view: false, create: false, edit: false, delete: false, export: false },
  },
  viewer: {
    dashboard: { view: true, create: false, edit: false, delete: false, export: false },
    pendencias: { view: true, create: false, edit: false, delete: false, export: false },
    gamificacao: { view: true, create: false, edit: false, delete: false, export: false },
    financeiro: { view: true, create: false, edit: false, delete: false, export: false },
    usuarios: { view: false, create: false, edit: false, delete: false, export: false },
    configuracoes: { view: false, create: false, edit: false, delete: false, export: false },
  },
}

interface AuthContextValue {
  user: Profile | null
  loading: boolean
  isDemoMode: boolean
  login: (email: string, password: string) => Promise<string | null>
  logout: () => Promise<void>
  can: (module: string, action?: keyof PermissionsMap[string]) => boolean
  effectivePermissions: PermissionsMap
  demoUsers: typeof DEMO_USERS
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user: null, loading: true, isDemoMode: false,
  login: async () => null, logout: async () => {},
  can: () => false, effectivePermissions: {}, demoUsers: DEMO_USERS,
  refreshUser: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [isDemoMode, setIsDemoMode] = useState(false)

  const loadDemoSession = () => {
    const stored = sessionStorage.getItem('amore_user')
    if (stored) {
      try { setUser(JSON.parse(stored)); setIsDemoMode(true); return true } catch {}
    }
    return false
  }

  useEffect(() => {
    // 1. Check for existing Supabase session (with timeout — SDK can hang)
    const sessionTimeout = new Promise<null>(resolve => setTimeout(() => resolve(null), 5000))
    Promise.race([supabase.auth.getSession(), sessionTimeout]).then(async (result) => {
      const session = result && 'data' in result ? result.data.session : null
      if (session?.user) {
        const profile = await fetchProfile(session.user.id).catch(() => null)
        if (profile) {
          setUser(profile)
          setIsDemoMode(false)
          setLoading(false)
          return
        }
      }
      // 2. Fall back to demo session
      loadDemoSession()
      setLoading(false)
    })

    // Listen for real Supabase auth events
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        setUser(null)
        setIsDemoMode(false)
      } else if (event === 'SIGNED_IN' && session?.user) {
        const profile = await fetchProfile(session.user.id)
        if (profile) {
          setUser(profile)
          setIsDemoMode(false)
        }
      } else if (event === 'TOKEN_REFRESHED' && session?.user) {
        // Silently refresh profile data
        const profile = await fetchProfile(session.user.id)
        if (profile) setUser(profile)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const login = async (email: string, password: string): Promise<string | null> => {
    const em = email.trim().toLowerCase()

    // 1. Try real Supabase auth (with timeout — SDK can hang when project is paused)
    const timeout = <T,>(ms: number): Promise<T> =>
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))

    let authResult: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>> | null = null
    try {
      authResult = await Promise.race([
        supabase.auth.signInWithPassword({ email: em, password }),
        timeout<never>(6000),
      ])
    } catch {
      // Supabase timed out or network error — fall through to demo
    }

    const { data, error } = authResult ?? { data: { user: null, session: null }, error: new Error('timeout') }
    if (!error && data.user) {
      let profile = await fetchProfile(data.user.id)
      // Auto-create profile if missing (first login)
      if (!profile) {
        const name = data.user.user_metadata?.name || em.split('@')[0]
        const initials = name.split(' ').map((w: string) => w[0] || '').join('').toUpperCase().slice(0, 2)
        profile = await upsertProfile({
          id: data.user.id,
          email: em,
          name,
          role: 'user',
          loja: null,
          status: 'active',
          avatar_color: '#6B1212',
          initials,
          permissions_override: null,
          created_at: new Date().toISOString(),
          last_login: new Date().toISOString(),
          created_by: null,
        })
      } else {
        // Update last_login
        await updateProfile(data.user.id, { last_login: new Date().toISOString() }).catch(() => {})
        profile = { ...profile, last_login: new Date().toISOString() }
      }
      setUser(profile)
      setIsDemoMode(false)
      // Audit log (non-blocking)
      insertAuditLog({ user_id: profile.id, user_name: profile.name, action: 'login', module: 'auth', detail: 'Login via Supabase' }).catch(() => {})
      return null
    }

    // 2. Fall back to demo users
    const demo = DEMO_USERS[em]
    if (demo && demo.pass === password) {
      const profile = { ...demo.profile, last_login: new Date().toISOString() }
      setUser(profile)
      setIsDemoMode(true)
      sessionStorage.setItem('amore_user', JSON.stringify(profile))
      return null
    }

    return 'Email ou senha incorretos.'
  }

  const logout = async () => {
    if (!isDemoMode) {
      await supabase.auth.signOut()
    }
    setUser(null)
    setIsDemoMode(false)
    sessionStorage.removeItem('amore_user')
  }

  const refreshUser = async () => {
    if (isDemoMode || !user) return
    const profile = await fetchProfile(user.id)
    if (profile) setUser(profile)
  }

  const effectivePermissions: PermissionsMap = user
    ? { ...(ROLE_PERMISSIONS[user.role] || {}), ...(user.permissions_override || {}) }
    : {}

  const can = (module: string, action: keyof PermissionsMap[string] = 'view'): boolean => {
    if (!user) return false
    const mod = effectivePermissions[module]
    return mod ? Boolean(mod[action]) : false
  }

  return (
    <AuthContext.Provider value={{ user, loading, isDemoMode, login, logout, can, effectivePermissions, demoUsers: DEMO_USERS, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
