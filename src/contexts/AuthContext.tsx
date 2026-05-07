import React, { createContext, useContext, useEffect, useState } from 'react'
import type { Profile, PermissionsMap } from '../types/database'

// Demo users for offline/demo mode
const DEMO_USERS: Record<string, { pass: string; profile: Profile }> = {
  'admin@amore.com.br': {
    pass: 'admin123',
    profile: {
      id: 'u-admin',
      email: 'admin@amore.com.br',
      name: 'Rodrigo Admin',
      role: 'super_admin',
      loja: 'Todas',
      status: 'active',
      avatar_color: '#6B1212',
      initials: 'RA',
      permissions_override: null,
      created_at: new Date().toISOString(),
      last_login: new Date().toISOString(),
      created_by: null,
    },
  },
  'gerente@amore.com.br': {
    pass: 'gerente123',
    profile: {
      id: 'u-gerente',
      email: 'gerente@amore.com.br',
      name: 'Ana Gerente',
      role: 'manager',
      loja: 'Amore Paiva',
      status: 'active',
      avatar_color: '#10B981',
      initials: 'AG',
      permissions_override: null,
      created_at: new Date().toISOString(),
      last_login: new Date().toISOString(),
      created_by: 'u-admin',
    },
  },
  'joao@amore.com.br': {
    pass: 'garcom123',
    profile: {
      id: 'u-joao',
      email: 'joao@amore.com.br',
      name: 'João Ricardo',
      role: 'user',
      loja: 'Amore Paiva',
      status: 'active',
      avatar_color: '#6366F1',
      initials: 'JR',
      permissions_override: null,
      created_at: new Date().toISOString(),
      last_login: new Date().toISOString(),
      created_by: 'u-admin',
    },
  },
}

const ROLE_PERMISSIONS: Record<string, PermissionsMap> = {
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
  login: (email: string, password: string) => Promise<string | null>
  logout: () => void
  can: (module: string, action?: keyof PermissionsMap[string]) => boolean
  effectivePermissions: PermissionsMap
  demoUsers: typeof DEMO_USERS
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  login: async () => null,
  logout: () => {},
  can: () => false,
  effectivePermissions: {},
  demoUsers: DEMO_USERS,
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = sessionStorage.getItem('amore_user')
    if (stored) {
      try { setUser(JSON.parse(stored)) } catch {}
    }
    setLoading(false)
  }, [])

  const login = async (email: string, password: string): Promise<string | null> => {
    const em = email.trim().toLowerCase()
    const demo = DEMO_USERS[em]
    if (demo && demo.pass === password) {
      const profile = { ...demo.profile, last_login: new Date().toISOString() }
      setUser(profile)
      sessionStorage.setItem('amore_user', JSON.stringify(profile))
      return null
    }
    return 'Email ou senha incorretos.'
  }

  const logout = () => {
    setUser(null)
    sessionStorage.removeItem('amore_user')
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
    <AuthContext.Provider value={{ user, loading, login, logout, can, effectivePermissions, demoUsers: DEMO_USERS }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
export { ROLE_PERMISSIONS }
