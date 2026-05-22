// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { supabase } from './supabase'
import type { Pendencia, Colaborador, Profile, TenantSettings, SalaoMesa, SalaoAtendimento, SalaoAvaliacao, SalaoAvaliacaoEquipe, SalaoChecklistItem, EstoqueProduto, EstoqueMovimentacao, EstoqueContagem, EstoqueContagemItem, Fornecedor, ComprasLista, ComprasListaItem, Requisicao, RequisicaoItem, RequisicaoCotacao, RequisicaoCotacaoItem, ReqTimeline } from '../types/database'

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

// ── Fornecedores ────────────────────────────────────────────

export async function fetchFornecedores(loja?: string): Promise<Fornecedor[]> {
  const q = loja && loja !== 'Todas as Lojas'
    ? `loja=eq.${encodeURIComponent(loja)}&order=nome.asc`
    : 'order=nome.asc'
  return estoqueFetch('fornecedores', q)
}

export async function insertFornecedor(f: Omit<Fornecedor, 'id' | 'created_at' | 'updated_at'>): Promise<Fornecedor> {
  return estoquePost('fornecedores', f)
}

export async function updateFornecedor(id: string, f: Partial<Fornecedor>): Promise<Fornecedor> {
  return estoquePatch('fornecedores', id, { ...f, updated_at: new Date().toISOString() })
}

export async function deleteFornecedor(id: string): Promise<void> {
  const sessionResult = await Promise.race([
    supabase.auth.getSession(),
    new Promise<null>(resolve => setTimeout(() => resolve(null), 3000)),
  ])
  const session = sessionResult && 'data' in sessionResult ? sessionResult.data.session : null
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/fornecedores?id=eq.${id}`,
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

// ── Lista de Compras ─────────────────────────────────────────

export async function fetchComprasListas(loja?: string): Promise<ComprasLista[]> {
  const q = loja && loja !== 'Todas as Lojas'
    ? `loja=eq.${encodeURIComponent(loja)}&order=created_at.desc`
    : 'order=created_at.desc'
  return estoqueFetch('compras_lista', q)
}

export async function insertComprasLista(l: Omit<ComprasLista, 'id' | 'created_at' | 'updated_at'>): Promise<ComprasLista> {
  return estoquePost('compras_lista', l)
}

export async function updateComprasLista(id: string, l: Partial<ComprasLista>): Promise<ComprasLista> {
  return estoquePatch('compras_lista', id, { ...l, updated_at: new Date().toISOString() })
}

export async function deleteComprasLista(id: string): Promise<void> {
  const sessionResult = await Promise.race([
    supabase.auth.getSession(),
    new Promise<null>(resolve => setTimeout(() => resolve(null), 3000)),
  ])
  const session = sessionResult && 'data' in sessionResult ? sessionResult.data.session : null
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/compras_lista?id=eq.${id}`,
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

// ── Itens da Lista de Compras ────────────────────────────────

export async function fetchComprasListaItens(listaId: string): Promise<ComprasListaItem[]> {
  return estoqueFetch('compras_lista_item', `lista_id=eq.${listaId}&order=produto_nome.asc`)
}

export async function insertComprasListaItem(item: Omit<ComprasListaItem, 'id' | 'created_at'>): Promise<ComprasListaItem> {
  return estoquePost('compras_lista_item', item)
}

export async function updateComprasListaItem(id: string, item: Partial<ComprasListaItem>): Promise<ComprasListaItem> {
  return estoquePatch('compras_lista_item', id, item)
}

export async function deleteComprasListaItem(id: string): Promise<void> {
  const sessionResult = await Promise.race([
    supabase.auth.getSession(),
    new Promise<null>(resolve => setTimeout(() => resolve(null), 3000)),
  ])
  const session = sessionResult && 'data' in sessionResult ? sessionResult.data.session : null
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/compras_lista_item?id=eq.${id}`,
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

// ── Requisições ──────────────────────────────────────────────

export async function fetchRequisicoes(loja?: string): Promise<Requisicao[]> {
  const q = loja && loja !== 'Todas as Lojas'
    ? `loja=eq.${encodeURIComponent(loja)}&order=created_at.desc`
    : 'order=created_at.desc'
  return estoqueFetch('requisicoes', q)
}

export async function insertRequisicao(r: Omit<Requisicao, 'id' | 'numero' | 'created_at' | 'updated_at'>): Promise<Requisicao> {
  return estoquePost('requisicoes', r)
}

export async function updateRequisicao(id: string, r: Partial<Requisicao>): Promise<Requisicao> {
  return estoquePatch('requisicoes', id, { ...r, updated_at: new Date().toISOString() })
}

export async function deleteRequisicao(id: string): Promise<void> {
  const sessionResult = await Promise.race([
    supabase.auth.getSession(),
    new Promise<null>(resolve => setTimeout(() => resolve(null), 3000)),
  ])
  const session = sessionResult && 'data' in sessionResult ? sessionResult.data.session : null
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/requisicoes?id=eq.${id}`,
    { method: 'DELETE', headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}` } },
  )
  if (!res.ok) throw new Error(res.statusText)
}

export async function fetchRequisicaoItens(requisicaoId: string): Promise<RequisicaoItem[]> {
  return estoqueFetch('requisicao_itens', `requisicao_id=eq.${requisicaoId}&order=produto_nome.asc`)
}

export async function insertRequisicaoItem(item: Omit<RequisicaoItem, 'id' | 'created_at'>): Promise<RequisicaoItem> {
  return estoquePost('requisicao_itens', item)
}

export async function updateRequisicaoItem(id: string, item: Partial<RequisicaoItem>): Promise<RequisicaoItem> {
  return estoquePatch('requisicao_itens', id, item)
}

export async function deleteRequisicaoItem(id: string): Promise<void> {
  const sessionResult = await Promise.race([
    supabase.auth.getSession(),
    new Promise<null>(resolve => setTimeout(() => resolve(null), 3000)),
  ])
  const session = sessionResult && 'data' in sessionResult ? sessionResult.data.session : null
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/requisicao_itens?id=eq.${id}`,
    { method: 'DELETE', headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}` } },
  )
  if (!res.ok) throw new Error(res.statusText)
}

export async function fetchRequisicaoCotacoes(requisicaoId: string): Promise<RequisicaoCotacao[]> {
  return estoqueFetch('requisicao_cotacoes', `requisicao_id=eq.${requisicaoId}&order=created_at.asc`)
}

export async function insertRequisicaoCotacao(c: Omit<RequisicaoCotacao, 'id' | 'created_at' | 'updated_at'>): Promise<RequisicaoCotacao> {
  return estoquePost('requisicao_cotacoes', c)
}

export async function updateRequisicaoCotacao(id: string, c: Partial<RequisicaoCotacao>): Promise<RequisicaoCotacao> {
  return estoquePatch('requisicao_cotacoes', id, { ...c, updated_at: new Date().toISOString() })
}

export async function deleteRequisicaoCotacao(id: string): Promise<void> {
  const sessionResult = await Promise.race([
    supabase.auth.getSession(),
    new Promise<null>(resolve => setTimeout(() => resolve(null), 3000)),
  ])
  const session = sessionResult && 'data' in sessionResult ? sessionResult.data.session : null
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/requisicao_cotacoes?id=eq.${id}`,
    { method: 'DELETE', headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}` } },
  )
  if (!res.ok) throw new Error(res.statusText)
}

export async function fetchCotacaoItens(cotacaoId: string): Promise<RequisicaoCotacaoItem[]> {
  return estoqueFetch('requisicao_cotacao_itens', `cotacao_id=eq.${cotacaoId}&order=created_at.asc`)
}

export async function upsertCotacaoItens(itens: Omit<RequisicaoCotacaoItem, 'id' | 'created_at'>[]): Promise<RequisicaoCotacaoItem[]> {
  const sessionResult = await Promise.race([
    supabase.auth.getSession(),
    new Promise<null>(resolve => setTimeout(() => resolve(null), 3000)),
  ])
  const session = sessionResult && 'data' in sessionResult ? sessionResult.data.session : null
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/requisicao_cotacao_itens`,
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

// ── Timeline de Requisições ──────────────────────────────────────────────────

export async function fetchReqTimeline(requisicaoId: string): Promise<ReqTimeline[]> {
  return estoqueFetch('req_timeline', `requisicao_id=eq.${requisicaoId}&order=created_at.asc`)
}

export async function insertReqTimeline(entry: Omit<ReqTimeline, 'id' | 'created_at'>): Promise<ReqTimeline> {
  return estoquePost('req_timeline', entry)
}

// ── MÓDULO FINANCEIRO ───────────────────────────────────────────────────────
import type { FinCredito, FinPrestacao, FinLancamento, FinAnexo, FinAuditoriaLog } from '../types/database'

export async function fetchFinCreditos(loja: string): Promise<FinCredito[]> {
  let q = db.from('fin_creditos').select('*').order('created_at', { ascending: false })
  if (loja && loja !== 'Todas as Lojas' && loja !== 'all') q = q.eq('loja', loja)
  const { data, error } = await q
  if (error) throw error; return data
}
export async function insertFinCredito(c: Omit<FinCredito, 'id' | 'numero' | 'created_at' | 'updated_at'>): Promise<FinCredito> {
  const { data, error } = await db.from('fin_creditos').insert(c).select().single()
  if (error) throw error; return data
}
export async function updateFinCredito(id: string, c: Partial<FinCredito>): Promise<FinCredito> {
  const { data, error } = await db.from('fin_creditos').update({ ...c, updated_at: new Date().toISOString() }).eq('id', id).select().single()
  if (error) throw error; return data
}
export async function deleteFinCredito(id: string): Promise<void> {
  const { error } = await db.from('fin_creditos').delete().eq('id', id)
  if (error) throw error
}

export async function fetchFinPrestacoes(loja: string): Promise<FinPrestacao[]> {
  const { data, error } = await db.from('fin_prestacoes').select('*').eq('loja', loja).order('created_at', { ascending: false })
  if (error) throw error; return data
}
export async function insertFinPrestacao(p: Omit<FinPrestacao, 'id' | 'numero' | 'diferenca' | 'created_at' | 'updated_at'>): Promise<FinPrestacao> {
  const { data, error } = await db.from('fin_prestacoes').insert({ ...p, diferenca: 0 }).select().single()
  if (error) throw error; return data
}
export async function updateFinPrestacao(id: string, p: Partial<FinPrestacao>): Promise<FinPrestacao> {
  const { data, error } = await db.from('fin_prestacoes').update({ ...p, updated_at: new Date().toISOString() }).eq('id', id).select().single()
  if (error) throw error; return data
}
export async function deleteFinPrestacao(id: string): Promise<void> {
  const { error } = await db.from('fin_prestacoes').delete().eq('id', id)
  if (error) throw error
}

export async function fetchFinLancamentos(prestacaoId: string): Promise<FinLancamento[]> {
  const { data, error } = await db.from('fin_lancamentos').select('*').eq('prestacao_id', prestacaoId).order('data_compra', { ascending: true })
  if (error) throw error; return data
}
export async function insertFinLancamento(l: Omit<FinLancamento, 'id' | 'created_at'>): Promise<FinLancamento> {
  const { data, error } = await db.from('fin_lancamentos').insert(l).select().single()
  if (error) throw error; return data
}
export async function updateFinLancamento(id: string, l: Partial<FinLancamento>): Promise<FinLancamento> {
  const { data, error } = await db.from('fin_lancamentos').update(l).eq('id', id).select().single()
  if (error) throw error; return data
}
export async function deleteFinLancamento(id: string): Promise<void> {
  const { error } = await db.from('fin_lancamentos').delete().eq('id', id)
  if (error) throw error
}

export async function fetchFinAnexos(lancamentoId: string): Promise<FinAnexo[]> {
  const { data, error } = await db.from('fin_anexos').select('*').eq('lancamento_id', lancamentoId).order('created_at')
  if (error) throw error; return data
}
export async function insertFinAnexo(a: Omit<FinAnexo, 'id' | 'created_at'>): Promise<FinAnexo> {
  const { data, error } = await db.from('fin_anexos').insert(a).select().single()
  if (error) throw error; return data
}
export async function deleteFinAnexo(id: string): Promise<void> {
  const { error } = await db.from('fin_anexos').delete().eq('id', id)
  if (error) throw error
}
export async function uploadFinComprovante(file: File, lancamentoId: string, prestacaoId: string, createdBy: string): Promise<FinAnexo> {
  const ext  = file.name.split('.').pop() || 'bin'
  const path = `${prestacaoId}/${lancamentoId}/${Date.now()}.${ext}`
  const { error: upErr } = await db.storage.from('fin-comprovantes').upload(path, file)
  if (upErr) throw upErr
  const { data: { publicUrl } } = db.storage.from('fin-comprovantes').getPublicUrl(path)
  return insertFinAnexo({
    lancamento_id: lancamentoId, nome_arquivo: file.name,
    tipo: file.type.startsWith('image/') ? 'foto' : file.type === 'application/pdf' ? 'pdf' : 'outro',
    url: publicUrl, tamanho_kb: Math.round(file.size / 1024), created_by: createdBy,
  })
}

export async function insertFinAuditoriaLog(log: Omit<FinAuditoriaLog, 'id' | 'created_at'>): Promise<void> {
  await db.from('fin_auditoria_log').insert(log)
}
export async function fetchFinAuditoriaLog(entidadeId: string): Promise<FinAuditoriaLog[]> {
  const { data, error } = await db.from('fin_auditoria_log').select('*').eq('entidade_id', entidadeId).order('created_at')
  if (error) throw error; return data ?? []
}

// ── MÓDULO PRODUTOS ─────────────────────────────────────────────────────────
import type { CategoriaProduto, MarcaProduto, Produto, ProdutoFornecedor } from '../types/database'

// Categorias
export async function fetchCategoriasProduto(loja: string): Promise<CategoriaProduto[]> {
  const { data, error } = await db.from('categorias_produto').select('*').eq('loja', loja).order('nome', { ascending: true })
  if (error) throw error
  return data
}
export async function insertCategoriaProduto(c: Omit<CategoriaProduto, 'id' | 'created_at' | 'updated_at'>): Promise<CategoriaProduto> {
  const { data, error } = await db.from('categorias_produto').insert(c).select().single()
  if (error) throw error
  return data
}
export async function updateCategoriaProduto(id: string, c: Partial<CategoriaProduto>): Promise<CategoriaProduto> {
  const { data, error } = await db.from('categorias_produto').update({ ...c, updated_at: new Date().toISOString() }).eq('id', id).select().single()
  if (error) throw error
  return data
}
export async function deleteCategoriaProduto(id: string): Promise<void> {
  const { error } = await db.from('categorias_produto').delete().eq('id', id)
  if (error) throw error
}

// Marcas
export async function fetchMarcasProduto(loja: string): Promise<MarcaProduto[]> {
  const { data, error } = await db.from('marcas_produto').select('*').eq('loja', loja).order('nome', { ascending: true })
  if (error) throw error
  return data
}
export async function insertMarcaProduto(m: Omit<MarcaProduto, 'id' | 'created_at'>): Promise<MarcaProduto> {
  const { data, error } = await db.from('marcas_produto').insert(m).select().single()
  if (error) throw error
  return data
}
export async function updateMarcaProduto(id: string, m: Partial<MarcaProduto>): Promise<MarcaProduto> {
  const { data, error } = await db.from('marcas_produto').update(m).eq('id', id).select().single()
  if (error) throw error
  return data
}
export async function deleteMarcaProduto(id: string): Promise<void> {
  const { error } = await db.from('marcas_produto').delete().eq('id', id)
  if (error) throw error
}

// Produtos
export async function fetchProdutos(loja: string, opts?: { search?: string; categoriaId?: string; marcaId?: string; ativo?: boolean }): Promise<Produto[]> {
  let q = db.from('produtos').select('*').eq('loja', loja)
  if (opts?.ativo !== undefined) q = q.eq('ativo', opts.ativo)
  if (opts?.categoriaId) q = q.eq('categoria_id', opts.categoriaId)
  if (opts?.marcaId) q = q.eq('marca_id', opts.marcaId)
  if (opts?.search) q = q.ilike('nome', `%${opts.search}%`)
  const { data, error } = await q.order('nome', { ascending: true })
  if (error) throw error
  return data
}
export async function fetchProduto(id: string): Promise<Produto | null> {
  const { data, error } = await db.from('produtos').select('*').eq('id', id).single()
  if (error) return null
  return data
}
export async function insertProduto(p: Omit<Produto, 'id' | 'created_at' | 'updated_at' | 'fornecedores'>): Promise<Produto> {
  const { data, error } = await db.from('produtos').insert(p).select().single()
  if (error) throw error
  return data
}
export async function updateProduto(id: string, p: Partial<Omit<Produto, 'id' | 'created_at' | 'fornecedores'>>): Promise<Produto> {
  const { data, error } = await db.from('produtos').update({ ...p, updated_at: new Date().toISOString() }).eq('id', id).select().single()
  if (error) throw error
  return data
}
export async function deleteProduto(id: string): Promise<void> {
  const { error } = await db.from('produtos').delete().eq('id', id)
  if (error) throw error
}
export async function duplicarProduto(id: string, loja: string): Promise<Produto> {
  const original = await fetchProduto(id)
  if (!original) throw new Error('Produto nao encontrado')
  const { id: _id, created_at, updated_at, fornecedores, ...rest } = original
  const sufixo = Math.floor(Math.random() * 9000) + 1000
  return insertProduto({ ...rest, codigo_interno: `${rest.codigo_interno}-${sufixo}`, nome: `${rest.nome} (copia)`, loja })
}

// Produto x Fornecedor
export async function fetchProdutoFornecedores(produtoId: string): Promise<ProdutoFornecedor[]> {
  const { data, error } = await db.from('produto_fornecedores').select('*, fornecedor:fornecedores(id,nome,telefone,email,cidade,prazo_entrega_dias)').eq('produto_id', produtoId)
  if (error) throw error
  return data
}
export async function upsertProdutoFornecedor(pf: Omit<ProdutoFornecedor, 'id' | 'created_at' | 'fornecedor'>): Promise<ProdutoFornecedor> {
  const { data, error } = await db.from('produto_fornecedores').upsert(pf, { onConflict: 'produto_id,fornecedor_id' }).select().single()
  if (error) throw error
  return data
}
export async function deleteProdutoFornecedor(produtoId: string, fornecedorId: string): Promise<void> {
  const { error } = await db.from('produto_fornecedores').delete().eq('produto_id', produtoId).eq('fornecedor_id', fornecedorId)
  if (error) throw error
}

// Dashboard de Compras — todos os itens comprados de uma loja
export async function fetchItensComprasDashboard(loja: string): Promise<{
  produto_nome: string
  categoria: string | null
  quantidade: number
  preco_real: number | null
  fornecedor_nome: string | null
  status: string
  unidade: string
}[]> {
  const { data: listaData, error: e1 } = await db.from('compras_lista').select('id').eq('loja', loja)
  if (e1 || !listaData?.length) return []
  const ids = (listaData as { id: string }[]).map(l => l.id)
  const { data, error } = await db
    .from('compras_lista_item')
    .select('produto_nome,categoria,quantidade,preco_real,fornecedor_nome,status,unidade')
    .in('lista_id', ids)
    .eq('status', 'comprado')
  if (error) throw error
  return data ?? []
}

// Contagem por categoria
export async function fetchContagemPorCategoria(loja: string): Promise<{ categoria_nome: string | null; total: number }[]> {
  const { data, error } = await db.from('produtos').select('categoria_nome').eq('loja', loja).eq('ativo', true)
  if (error) throw error
  const map: Record<string, number> = {}
  for (const r of (data ?? [])) {
    const k = (r.categoria_nome as string | null) ?? 'Sem categoria'
    map[k] = (map[k] ?? 0) + 1
  }
  return Object.entries(map).map(([categoria_nome, total]) => ({ categoria_nome, total })).sort((a, b) => b.total - a.total)
}

// ── Relatório Compra vs Lista ────────────────────────────────

export interface RelatorioCVLItem {
  id: string
  relatorio_id: string
  produto_nome: string
  categoria: string | null
  qtd_solicitada: number
  unidade: string | null
  valor_previsto: number
  requisicao_id: string | null
  responsavel_req: string | null
  data_req: string | null
  qtd_comprada: number
  valor_realizado: number
  compra_id: string | null
  responsavel_comp: string | null
  data_comp: string | null
  diferenca_qtd: number
  divergencia_pct: number
  status: 'ok' | 'acima' | 'abaixo' | 'nao_comprado'
  created_at: string
}

export interface RelatorioCVL {
  id: string
  loja: string
  periodo_inicio: string
  periodo_fim: string
  gerado_por: string | null
  gerado_em: string
  total_itens_solicitados: number
  total_itens_comprados: number
  total_itens_nao_comprados: number
  valor_previsto: number
  valor_realizado: number
  economia: number
  excesso: number
  assertividade: number
  created_at: string
  itens?: RelatorioCVLItem[]
}

export async function fetchRelatoriosCVL(loja: string): Promise<RelatorioCVL[]> {
  let q = db.from('relatorio_compra_vs_lista').select('*').order('created_at', { ascending: false })
  if (loja && loja !== 'Todas as Lojas') q = q.eq('loja', loja)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

export async function fetchRelatorioCVLItens(relatorioId: string): Promise<RelatorioCVLItem[]> {
  const { data, error } = await db.from('relatorio_cvl_itens').select('*').eq('relatorio_id', relatorioId).order('produto_nome')
  if (error) throw error
  return data ?? []
}

export async function insertRelatorioCVL(r: Omit<RelatorioCVL, 'id' | 'created_at' | 'gerado_em'>): Promise<RelatorioCVL> {
  const { data, error } = await db.from('relatorio_compra_vs_lista').insert(r).select().single()
  if (error) throw error
  return data
}

export async function insertRelatorioCVLItens(itens: Omit<RelatorioCVLItem, 'id' | 'created_at' | 'diferenca_qtd' | 'divergencia_pct'>[]): Promise<void> {
  if (!itens.length) return
  const { error } = await db.from('relatorio_cvl_itens').insert(itens)
  if (error) throw error
}

export async function deleteRelatorioCVL(id: string): Promise<void> {
  const { error } = await db.from('relatorio_compra_vs_lista').delete().eq('id', id)
  if (error) throw error
}

// ── Relatório de Ruptura ─────────────────────────────────────

export interface Ruptura {
  id: string
  loja: string
  numero_pedido: string | null
  cliente: string | null
  produto_nome: string
  categoria: string | null
  qtd_solicitada: number
  qtd_atendida: number
  qtd_ruptura: number
  pct_ruptura: number
  motivo: string | null
  motivo_descricao: string | null
  impacto_financeiro: number
  unidade: string | null
  fornecedor_nome: string | null
  responsavel: string | null
  data_ocorrencia: string
  status: 'aberta' | 'resolvida' | 'parcial'
  created_by: string | null
  created_at: string
  updated_at: string
}

export async function fetchRupturas(loja: string, inicio?: string, fim?: string): Promise<Ruptura[]> {
  let q = db.from('rupturas').select('*').order('data_ocorrencia', { ascending: false })
  if (loja && loja !== 'Todas as Lojas') q = q.eq('loja', loja)
  if (inicio) q = q.gte('data_ocorrencia', inicio)
  if (fim)    q = q.lte('data_ocorrencia', fim)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

export async function insertRuptura(r: Omit<Ruptura, 'id' | 'created_at' | 'updated_at' | 'qtd_ruptura' | 'pct_ruptura'>): Promise<Ruptura> {
  const { data, error } = await db.from('rupturas').insert(r).select().single()
  if (error) throw error
  return data
}

export async function updateRuptura(id: string, r: Partial<Ruptura>): Promise<Ruptura> {
  const { data, error } = await db.from('rupturas').update({ ...r, updated_at: new Date().toISOString() }).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteRuptura(id: string): Promise<void> {
  const { error } = await db.from('rupturas').delete().eq('id', id)
  if (error) throw error
}
