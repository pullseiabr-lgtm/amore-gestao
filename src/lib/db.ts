// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { supabase } from './supabase'
import type { Pendencia, Colaborador, Profile, TenantSettings } from '../types/database'

const db = supabase as any

// ── Pendências ──────────────────────────────────────────────

export async function fetchPendencias(): Promise<Pendencia[]> {
  const { data, error } = await db.from('pendencias').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function insertPendencia(p: Omit<Pendencia, 'id' | 'created_at' | 'updated_at'>): Promise<Pendencia> {
  const { data, error } = await db.from('pendencias').insert(p).select().single()
  if (error) throw error
  return data
}

export async function updatePendencia(id: string, p: Partial<Pendencia>): Promise<Pendencia> {
  const { data, error } = await db.from('pendencias').update(p).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deletePendencia(id: string): Promise<void> {
  const { error } = await db.from('pendencias').delete().eq('id', id)
  if (error) throw error
}

// ── Colaboradores ───────────────────────────────────────────

export async function fetchColaboradores(): Promise<Colaborador[]> {
  const { data, error } = await db.from('colaboradores').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function insertColaborador(c: Omit<Colaborador, 'id' | 'created_at'>): Promise<Colaborador> {
  const { data, error } = await db.from('colaboradores').insert(c).select().single()
  if (error) throw error
  return data
}

export async function updateColaborador(id: string, c: Partial<Colaborador>): Promise<Colaborador> {
  const { data, error } = await db.from('colaboradores').update(c).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteColaborador(id: string): Promise<void> {
  const { error } = await db.from('colaboradores').delete().eq('id', id)
  if (error) throw error
}

// ── Profiles ────────────────────────────────────────────────

export async function fetchProfiles(): Promise<Profile[]> {
  const { data, error } = await db.from('profiles').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function fetchProfile(id: string): Promise<Profile | null> {
  const { data, error } = await db.from('profiles').select('*').eq('id', id).single()
  if (error) return null
  return data
}

export async function upsertProfile(p: Partial<Profile> & { id: string }): Promise<Profile> {
  const { data, error } = await db.from('profiles').upsert(p).select().single()
  if (error) throw error
  return data
}

export async function updateProfile(id: string, p: Partial<Profile>): Promise<Profile> {
  const { data, error } = await db.from('profiles').update(p).eq('id', id).select().single()
  if (error) throw error
  return data
}

// ── Tenant Settings ─────────────────────────────────────────

export async function fetchTenantSettings(): Promise<TenantSettings | null> {
  const { data, error } = await db.from('tenant_settings').select('*').eq('slug', 'default').single()
  if (error) return null
  return data
}

export async function saveTenantSettings(t: Partial<TenantSettings>): Promise<TenantSettings> {
  const { data, error } = await db.from('tenant_settings').upsert({ ...t, slug: 'default' }).select().single()
  if (error) throw error
  return data
}

// ── Vendas ──────────────────────────────────────────────────

export interface VendaItem { nome: string; qtd: number; preco: number }
export interface Venda {
  id: string
  loja: string
  colaborador: string
  canal: 'salao' | 'balcao' | 'delivery' | 'app'
  itens: VendaItem[]
  total: number
  pagamento: 'pix' | 'credito' | 'debito' | 'dinheiro' | 'vr'
  avaliacao: number | null
  tempo_min: number | null
  obs: string
  created_by: string
  created_at: string
}

export async function fetchVendas(): Promise<Venda[]> {
  // SDK hangs; use direct fetch with timeout
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 6000)
  try {
    const sessionResult = await Promise.race([
      supabase.auth.getSession(),
      new Promise<null>(resolve => setTimeout(() => resolve(null), 3000)),
    ])
    const session = sessionResult && 'data' in sessionResult ? sessionResult.data.session : null
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/vendas?order=created_at.desc`,
      {
        signal: controller.signal,
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
      },
    )
    if (!res.ok) throw new Error(res.statusText)
    return res.json()
  } finally {
    clearTimeout(timer)
  }
}

export async function insertVenda(v: Omit<Venda, 'id' | 'created_at'>): Promise<Venda> {
  // SDK hangs on insert; direct fetch is reliable
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/vendas`,
    {
      method: 'POST',
      headers: {
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(v),
    },
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as any).message || res.statusText)
  }
  const rows = await res.json()
  return Array.isArray(rows) ? rows[0] : rows
}

export async function deleteVenda(id: string): Promise<void> {
  const { error } = await db.from('vendas').delete().eq('id', id)
  if (error) throw error
}

// ── Audit Logs ──────────────────────────────────────────────

export async function insertAuditLog(entry: {
  user_id: string
  user_name: string
  action: string
  module: string
  entity_id?: string
  detail: string
}): Promise<void> {
  await db.from('audit_logs').insert(entry)
}

export async function fetchAuditLogs(): Promise<any[]> {
  const { data, error } = await db.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(100)
  if (error) throw error
  return data
}
