// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { supabase } from './supabase'
import type { Pendencia, Colaborador, Profile, TenantSettings, SalaoMesa, SalaoAtendimento, SalaoAvaliacao, SalaoAvaliacaoEquipe, SalaoChecklistItem, EstoqueProduto, EstoqueMovimentacao, EstoqueContagem, EstoqueContagemItem } from '../types/database'

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

// ── Salão — helper ──────────────────────────────────────────

async function salaoFetch(table: string, params = ''): Promise<any[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 6000)
  try {
    const sessionResult = await Promise.race([
      supabase.auth.getSession(),
      new Promise<null>(resolve => setTimeout(() => resolve(null), 3000)),
    ])
    const session = sessionResult && 'data' in sessionResult ? sessionResult.data.session : null
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/${table}?${params}`,
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

async function salaoPost(table: string, body: unknown): Promise<any> {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/${table}`,
    {
      method: 'POST',
      headers: {
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(body),
    },
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as any).message || res.statusText)
  }
  const rows = await res.json()
  return Array.isArray(rows) ? rows[0] : rows
}

async function salaoPatch(table: string, id: string, body: unknown): Promise<any> {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`,
    {
      method: 'PATCH',
      headers: {
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(body),
    },
  )
  if (!res.ok) throw new Error(res.statusText)
  const rows = await res.json()
  return Array.isArray(rows) ? rows[0] : rows
}

async function salaoDelete(table: string, id: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`,
    {
      method: 'DELETE',
      headers: {
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
    },
  )
  if (!res.ok) throw new Error(res.statusText)
}

// ── Salão — Mesas ───────────────────────────────────────────

export async function fetchSalaoMesas(loja?: string): Promise<SalaoMesa[]> {
  const q = loja && loja !== 'Todas as Lojas'
    ? `loja=eq.${encodeURIComponent(loja)}&order=numero.asc`
    : 'order=loja.asc,numero.asc'
  return salaoFetch('salao_mesas', q)
}

export async function updateSalaoMesa(id: string, data: Partial<SalaoMesa>): Promise<SalaoMesa> {
  return salaoPatch('salao_mesas', id, { ...data, updated_at: new Date().toISOString() })
}

// ── Salão — Atendimentos ────────────────────────────────────

export async function fetchSalaoAtendimentos(loja?: string): Promise<SalaoAtendimento[]> {
  const q = loja && loja !== 'Todas as Lojas'
    ? `loja=eq.${encodeURIComponent(loja)}&order=created_at.desc`
    : 'order=created_at.desc'
  return salaoFetch('salao_atendimentos', q)
}

export async function insertSalaoAtendimento(a: Omit<SalaoAtendimento, 'id' | 'created_at'>): Promise<SalaoAtendimento> {
  return salaoPost('salao_atendimentos', a)
}

export async function updateSalaoAtendimento(id: string, data: Partial<SalaoAtendimento>): Promise<SalaoAtendimento> {
  return salaoPatch('salao_atendimentos', id, data)
}

// ── Salão — Avaliações ──────────────────────────────────────

export async function fetchSalaoAvaliacoes(loja?: string): Promise<SalaoAvaliacao[]> {
  const q = loja && loja !== 'Todas as Lojas'
    ? `loja=eq.${encodeURIComponent(loja)}&order=data_aval.desc`
    : 'order=data_aval.desc'
  return salaoFetch('salao_avaliacoes', q)
}

export async function insertSalaoAvaliacao(a: Omit<SalaoAvaliacao, 'id' | 'created_at'>): Promise<SalaoAvaliacao> {
  return salaoPost('salao_avaliacoes', a)
}

export async function deleteSalaoAvaliacao(id: string): Promise<void> {
  return salaoDelete('salao_avaliacoes', id)
}

// ── Salão — Avaliação de Equipe ─────────────────────────────

export async function fetchSalaoAvaliacaoEquipe(loja?: string): Promise<SalaoAvaliacaoEquipe[]> {
  const q = loja && loja !== 'Todas as Lojas'
    ? `loja=eq.${encodeURIComponent(loja)}&order=created_at.desc`
    : 'order=created_at.desc'
  return salaoFetch('salao_avaliacao_equipe', q)
}

export async function insertSalaoAvaliacaoEquipe(a: Omit<SalaoAvaliacaoEquipe, 'id' | 'created_at'>): Promise<SalaoAvaliacaoEquipe> {
  return salaoPost('salao_avaliacao_equipe', a)
}

export async function deleteSalaoAvaliacaoEquipe(id: string): Promise<void> {
  return salaoDelete('salao_avaliacao_equipe', id)
}

// ── Salão — Checklist ───────────────────────────────────────

export async function fetchSalaoChecklist(loja: string, data: string): Promise<SalaoChecklistItem[]> {
  const q = `loja=eq.${encodeURIComponent(loja)}&data_reg=eq.${data}&order=tipo.asc,categoria.asc,item.asc`
  return salaoFetch('salao_checklist_itens', q)
}

export async function upsertSalaoChecklistItem(item: Omit<SalaoChecklistItem, 'id' | 'created_at'>): Promise<SalaoChecklistItem> {
  return salaoPost('salao_checklist_itens', item)
}

export async function updateSalaoChecklistItem(id: string, data: Partial<SalaoChecklistItem>): Promise<SalaoChecklistItem> {
  return salaoPatch('salao_checklist_itens', id, data)
}

export async function deleteSalaoChecklistItem(id: string): Promise<void> {
  return salaoDelete('salao_checklist_itens', id)
}

// ── Estoque — helper ────────────────────────────────────────

async function estoqueFetch(table: string, params = ''): Promise<any[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 6000)
  try {
    const sessionResult = await Promise.race([
      supabase.auth.getSession(),
      new Promise<null>(resolve => setTimeout(() => resolve(null), 3000)),
    ])
    const session = sessionResult && 'data' in sessionResult ? sessionResult.data.session : null
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/${table}?${params}`,
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

async function estoquePost(table: string, body: unknown): Promise<any> {
  const sessionResult = await Promise.race([
    supabase.auth.getSession(),
    new Promise<null>(resolve => setTimeout(() => resolve(null), 3000)),
  ])
  const session = sessionResult && 'data' in sessionResult ? sessionResult.data.session : null
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/${table}`,
    {
      method: 'POST',
      headers: {
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(body),
    },
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as any).message || res.statusText)
  }
  const rows = await res.json()
  return Array.isArray(rows) ? rows[0] : rows
}

async function estoquePatch(table: string, id: string, body: unknown): Promise<any> {
  const sessionResult = await Promise.race([
    supabase.auth.getSession(),
    new Promise<null>(resolve => setTimeout(() => resolve(null), 3000)),
  ])
  const session = sessionResult && 'data' in sessionResult ? sessionResult.data.session : null
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`,
    {
      method: 'PATCH',
      headers: {
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(body),
    },
  )
  if (!res.ok) throw new Error(res.statusText)
  const rows = await res.json()
  return Array.isArray(rows) ? rows[0] : rows
}

// ── Estoque — Produtos ──────────────────────────────────────

export async function fetchEstoqueProdutos(loja?: string): Promise<EstoqueProduto[]> {
  const q = loja && loja !== 'Todas as Lojas'
    ? `loja=eq.${encodeURIComponent(loja)}&ativo=eq.true&order=nome.asc`
    : 'ativo=eq.true&order=nome.asc'
  return estoqueFetch('estoque_produtos', q)
}

export async function insertEstoqueProduto(p: Omit<EstoqueProduto, 'id' | 'created_at' | 'updated_at'>): Promise<EstoqueProduto> {
  return estoquePost('estoque_produtos', p)
}

export async function updateEstoqueProduto(id: string, p: Partial<EstoqueProduto>): Promise<EstoqueProduto> {
  return estoquePatch('estoque_produtos', id, { ...p, updated_at: new Date().toISOString() })
}

// ── Estoque — Movimentações ─────────────────────────────────

export async function fetchEstoqueMovimentacoes(loja?: string, dataISO?: string): Promise<EstoqueMovimentacao[]> {
  let q = loja && loja !== 'Todas as Lojas'
    ? `loja=eq.${encodeURIComponent(loja)}`
    : ''
  if (dataISO) {
    const from = `${dataISO}T00:00:00Z`
    const to = `${dataISO}T23:59:59Z`
    q += `${q ? '&' : ''}created_at=gte.${from}&created_at=lte.${to}`
  }
  q += `${q ? '&' : ''}order=created_at.desc`
  return estoqueFetch('estoque_movimentacoes', q)
}

export async function fetchEstoqueMovimentacoesDias(loja?: string): Promise<string[]> {
  const q = loja && loja !== 'Todas as Lojas'
    ? `loja=eq.${encodeURIComponent(loja)}&select=created_at&order=created_at.desc`
    : 'select=created_at&order=created_at.desc'
  const rows: { created_at: string }[] = await estoqueFetch('estoque_movimentacoes', q)
  const dias = [...new Set(rows.map(r => r.created_at.slice(0, 10)))]
  return dias
}

export async function insertEstoqueMovimentacao(m: Omit<EstoqueMovimentacao, 'id' | 'created_at'>): Promise<EstoqueMovimentacao> {
  return estoquePost('estoque_movimentacoes', m)
}

// ── Estoque — Contagens ─────────────────────────────────────

export async function fetchEstoqueContagens(loja?: string): Promise<EstoqueContagem[]> {
  const q = loja && loja !== 'Todas as Lojas'
    ? `loja=eq.${encodeURIComponent(loja)}&order=created_at.desc`
    : 'order=created_at.desc'
  return estoqueFetch('estoque_contagens', q)
}

export async function insertEstoqueContagem(c: Omit<EstoqueContagem, 'id' | 'created_at'>): Promise<EstoqueContagem> {
  return estoquePost('estoque_contagens', c)
}

export async function fetchEstoqueContagemItens(contagemId: string): Promise<EstoqueContagemItem[]> {
  return estoqueFetch('estoque_contagem_itens', `contagem_id=eq.${contagemId}&order=produto_nome.asc`)
}

export async function upsertEstoqueContagemItens(itens: Omit<EstoqueContagemItem, 'id' | 'created_at'>[]): Promise<EstoqueContagemItem[]> {
  const sessionResult = await Promise.race([
    supabase.auth.getSession(),
    new Promise<null>(resolve => setTimeout(() => resolve(null), 3000)),
  ])
  const session = sessionResult && 'data' in sessionResult ? sessionResult.data.session : null
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/estoque_contagem_itens`,
    {
      method: 'POST',
      headers: {
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation,resolution=merge-duplicates',
      },
      body: JSON.stringify(itens),
    },
  )
  if (!res.ok) throw new Error(res.statusText)
  return res.json()
}
