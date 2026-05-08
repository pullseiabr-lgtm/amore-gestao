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
