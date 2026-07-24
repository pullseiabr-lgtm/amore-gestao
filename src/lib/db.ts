// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { supabase } from './supabase'
import type { NFeParsed } from './nfe'
import type { Pendencia, Colaborador, Profile, TenantSettings, SalaoMesa, SalaoAtendimento, SalaoAvaliacao, SalaoAvaliacaoEquipe, SalaoChecklistItem, EstoqueProduto, EstoqueMovimentacao, EstoqueContagem, EstoqueContagemItem, Fornecedor, ComprasLista, ComprasListaItem, Requisicao, RequisicaoItem, RequisicaoCotacao, RequisicaoCotacaoItem, ReqTimeline, RequisicaoAutomatica, CozinhaChecklist, CozinhaProducao, CozinhaDesperdicio, CozinhaFicha, CozinhaSolicitacao, MarketPriceHistory, FornecedorScore, MarketAlert, MarketTendencia, ComprasPesquisaMercado, ChecklistModelo, ChecklistExecucao, PautaReuniao, Tarefa, TarefaChecklist, TarefaComentario, TarefaHistorico, EnxovalItem, EnxovalMovimentacao, PlanejamentoEvento, PlanejamentoMeta, AtaReuniao, AtaAcao, ListaPadrao, ListaPadraoItem, ListaHistoricoPreco, ActivityLog, AlertasConfig, AprovacaoConfig, Boleto, Notificacao, Caixa, CaixaItem } from '../types/database'

const db = supabase as any

// ── Timeout helpers ─────────────────────────────────────────
// All helpers use function declarations so they are hoisted and available
// throughout the module even before their physical definition point.

// Resolve auth token with up to `ms` ms — avoids hanging when Supabase is paused
async function getToken(ms = 3000): Promise<string> {
  const sr = await Promise.race([
    supabase.auth.getSession(),
    new Promise<null>(r => setTimeout(() => r(null), ms)),
  ])
  const token = sr && 'data' in sr ? sr.data.session?.access_token : null
  return token ?? import.meta.env.VITE_SUPABASE_ANON_KEY
}

// Wrap any Supabase SDK call with a hard timeout
async function sdkCall<T>(promise: Promise<{ data: T | null; error: any }>, ms = 8000): Promise<T> {
  const result = await Promise.race([
    promise,
    new Promise<{ data: null; error: Error }>(resolve =>
      setTimeout(() => resolve({ data: null, error: new Error('Request timeout') }), ms)
    ),
  ])
  if (result.error) throw result.error
  return result.data as T
}

// DELETE via REST with full AbortController timeout
async function restDelete(table: string, filter: string): Promise<void> {
  const token = await getToken()
  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/${table}?${filter}`,
      {
        method: 'DELETE',
        signal: ctrl.signal,
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
        },
      },
    )
    if (!res.ok) throw new Error(res.statusText)
  } finally { clearTimeout(timer) }
}

// POST/UPSERT (merge-duplicates) via REST with full AbortController timeout
async function restUpsert(table: string, body: unknown): Promise<any[]> {
  const token = await getToken()
  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/${table}`,
      {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation,resolution=merge-duplicates',
        },
        body: JSON.stringify(body),
      },
    )
    if (!res.ok) throw new Error(res.statusText)
    return res.json()
  } finally { clearTimeout(timer) }
}

// ── Pendências ──────────────────────────────────────────────

export async function fetchPendencias(): Promise<Pendencia[]> {
  return sdkCall<Pendencia[]>(db.from('pendencias').select('*').order('created_at', { ascending: false }))
}

export async function insertPendencia(p: Omit<Pendencia, 'id' | 'created_at' | 'updated_at'>): Promise<Pendencia> {
  return sdkCall<Pendencia>(db.from('pendencias').insert(p).select().single())
}

export async function updatePendencia(id: string, p: Partial<Pendencia>): Promise<Pendencia> {
  return sdkCall<Pendencia>(db.from('pendencias').update(p).eq('id', id).select().single())
}

export async function deletePendencia(id: string): Promise<void> {
  await sdkCall<null>(db.from('pendencias').delete().eq('id', id))
}

// ── Colaboradores ───────────────────────────────────────────

export async function fetchColaboradores(): Promise<Colaborador[]> {
  return sdkCall<Colaborador[]>(db.from('colaboradores').select('*').order('created_at', { ascending: false }))
}

export async function insertColaborador(c: Omit<Colaborador, 'id' | 'created_at'>): Promise<Colaborador> {
  return sdkCall<Colaborador>(db.from('colaboradores').insert(c).select().single())
}

export async function updateColaborador(id: string, c: Partial<Colaborador>): Promise<Colaborador> {
  return sdkCall<Colaborador>(db.from('colaboradores').update(c).eq('id', id).select().single())
}

export async function deleteColaborador(id: string): Promise<void> {
  await sdkCall<null>(db.from('colaboradores').delete().eq('id', id))
}

// ── Profiles ────────────────────────────────────────────────

export async function fetchProfiles(): Promise<Profile[]> {
  return sdkCall<Profile[]>(db.from('profiles').select('*').order('created_at', { ascending: false }))
}

export async function fetchProfile(id: string): Promise<Profile | null> {
  try {
    return await sdkCall<Profile>(db.from('profiles').select('*').eq('id', id).single())
  } catch {
    return null
  }
}

export async function upsertProfile(p: Partial<Profile> & { id: string }): Promise<Profile> {
  return sdkCall<Profile>(db.from('profiles').upsert(p).select().single())
}

export async function updateProfile(id: string, p: Partial<Profile>): Promise<Profile> {
  return sdkCall<Profile>(db.from('profiles').update(p).eq('id', id).select().single())
}

// ── Tenant Settings ─────────────────────────────────────────

export async function fetchTenantSettings(): Promise<TenantSettings | null> {
  try {
    return await sdkCall<TenantSettings>(db.from('tenant_settings').select('*').eq('slug', 'default').single())
  } catch {
    return null
  }
}

export async function saveTenantSettings(t: Partial<TenantSettings>): Promise<TenantSettings> {
  return sdkCall<TenantSettings>(db.from('tenant_settings').upsert({ ...t, slug: 'default' }).select().single())
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

export async function fetchVendas(loja?: string): Promise<Venda[]> {
  // SDK hangs; use direct fetch with timeout
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 6000)
  try {
    const sessionResult = await Promise.race([
      supabase.auth.getSession(),
      new Promise<null>(resolve => setTimeout(() => resolve(null), 3000)),
    ])
    const session = sessionResult && 'data' in sessionResult ? sessionResult.data.session : null
    const lojaFilter = loja && loja !== 'Todas as Lojas' && loja !== 'all'
      ? `&loja=eq.${encodeURIComponent(loja)}`
      : ''
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/vendas?order=created_at.desc${lojaFilter}`,
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
  const token = await getToken()
  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/vendas`,
      {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
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
  } finally { clearTimeout(timer) }
}

export async function deleteVenda(id: string): Promise<void> {
  await sdkCall<null>(db.from('vendas').delete().eq('id', id))
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
  // Non-blocking — fire and forget with timeout protection
  sdkCall<null>(db.from('audit_logs').insert(entry)).catch(() => {})
}

export async function fetchAuditLogs(): Promise<any[]> {
  return sdkCall<any[]>(db.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(100))
}

// ── Salão — helpers ─────────────────────────────────────────

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

// Helper: POST com timeout completo (getToken + AbortController no fetch)
async function salaoPost(table: string, body: unknown): Promise<any> {
  const token = await getToken()
  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/${table}`,
      {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
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
  } finally { clearTimeout(timer) }
}

async function salaoPatch(table: string, id: string, body: unknown): Promise<any> {
  const token = await getToken()
  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`,
      {
        method: 'PATCH',
        signal: ctrl.signal,
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify(body),
      },
    )
    if (!res.ok) throw new Error(res.statusText)
    const rows = await res.json()
    return Array.isArray(rows) ? rows[0] : rows
  } finally { clearTimeout(timer) }
}

async function salaoDelete(table: string, id: string): Promise<void> {
  const token = await getToken()
  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`,
      {
        method: 'DELETE',
        signal: ctrl.signal,
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
        },
      },
    )
    if (!res.ok) throw new Error(res.statusText)
  } finally { clearTimeout(timer) }
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
  const token = await getToken()
  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/${table}`,
      {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
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
  } finally { clearTimeout(timer) }
}

async function estoquePatch(table: string, id: string, body: unknown): Promise<any> {
  const token = await getToken()
  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`,
      {
        method: 'PATCH',
        signal: ctrl.signal,
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify(body),
      },
    )
    if (!res.ok) throw new Error(res.statusText)
    const rows = await res.json()
    return Array.isArray(rows) ? rows[0] : rows
  } finally { clearTimeout(timer) }
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

/** Atualiza preco_unitario de estoque_produtos pelo nome (busca case-insensitive) */
export async function updateEstoqueProdutoPrecoPorNome(nome: string, loja: string, preco: number): Promise<void> {
  try {
    await db.from('estoque_produtos')
      .update({ preco_unitario: preco, updated_at: new Date().toISOString() })
      .ilike('nome', nome.trim())
      .in('loja', [loja, 'Todas as Lojas'])
      .eq('ativo', true)
  } catch (e) { console.warn('updateEstoqueProdutoPrecoPorNome:', e) }
}

/**
 * Custo Médio Ponderado — busca nivel_atual + preco_unitario e recalcula:
 * (nivel_atual × preco_atual + qtdNova × precoNovo) / (nivel_atual + qtdNova)
 * Também atualiza data_validade e numero_lote se fornecidos.
 */
export async function atualizarCustoMedioPorNome(
  nome: string,
  loja: string,
  qtdNova: number,
  precoNovo: number,
  dataValidade?: string | null,
  numeroLote?: string | null,
): Promise<void> {
  try {
    const { data } = await db.from('estoque_produtos')
      .select('nivel_atual, preco_unitario')
      .ilike('nome', nome.trim())
      .in('loja', [loja, 'Todas as Lojas'])
      .eq('ativo', true)
      .maybeSingle()

    if (!data) return

    const nivelAtual  = (data as { nivel_atual: number; preco_unitario: number }).nivel_atual   ?? 0
    const precoAtual  = (data as { nivel_atual: number; preco_unitario: number }).preco_unitario ?? precoNovo
    const custoMedio  = (nivelAtual + qtdNova) > 0
      ? (nivelAtual * precoAtual + qtdNova * precoNovo) / (nivelAtual + qtdNova)
      : precoNovo

    const patch: Record<string, unknown> = {
      preco_unitario: Math.round(custoMedio * 100) / 100,
      updated_at: new Date().toISOString(),
    }
    if (dataValidade)  patch.data_validade  = dataValidade
    if (numeroLote)    patch.numero_lote    = numeroLote

    await db.from('estoque_produtos')
      .update(patch)
      .ilike('nome', nome.trim())
      .in('loja', [loja, 'Todas as Lojas'])
      .eq('ativo', true)
  } catch (e) { console.warn('atualizarCustoMedioPorNome:', e) }
}

// Atualiza ultimo_preco_compra + data_ultima_compra no catálogo de produtos por nome
export async function atualizarUltimoPrecoCompraPorNome(
  nome: string,
  loja: string,
  preco: number,
  dataCompra: string,
): Promise<void> {
  try {
    // Busca o produto pelo nome (case-insensitive, mesma loja)
    const q = db.from('produtos')
      .select('id, ultimo_preco_compra')
      .ilike('nome', nome.trim())
      .eq('loja', loja)
      .eq('ativo', true)
      .maybeSingle()
    const { data } = await q
    if (!data) return

    const prod = data as { id: string; ultimo_preco_compra: number | null }
    const patch: Record<string, unknown> = {
      ultimo_preco_compra: preco,
      data_ultima_compra: dataCompra,
      updated_at: new Date().toISOString(),
    }
    // Salva preço anterior somente se mudou
    if (prod.ultimo_preco_compra && prod.ultimo_preco_compra !== preco) {
      patch.preco_anterior_compra = prod.ultimo_preco_compra
    }
    await db.from('produtos').update(patch).eq('id', prod.id)
  } catch (e) { console.warn('atualizarUltimoPrecoCompraPorNome:', e) }
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

/** Busca movimentações em um intervalo de datas (dataInicio e dataFim no formato YYYY-MM-DD) */
export async function fetchEstoqueMovimentacoesRange(loja: string | undefined, dataInicio: string, dataFim: string): Promise<EstoqueMovimentacao[]> {
  let q = loja && loja !== 'Todas as Lojas'
    ? `loja=eq.${encodeURIComponent(loja)}&`
    : ''
  q += `created_at=gte.${dataInicio}T00:00:00Z&created_at=lte.${dataFim}T23:59:59Z&order=created_at.desc&limit=2000`
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

// Entrada COMPLETA no estoque por nome: registra movimentação + incrementa nivel_atual
// + atualiza custo médio ponderado + validade/lote. Retorna se o produto existia no catálogo.
export async function darEntradaEstoquePorNome(p: {
  nome: string
  loja: string
  quantidade: number
  preco?: number | null
  unidade?: string
  dataValidade?: string | null
  numeroLote?: string | null
  motivo: string
  usuario: string
}): Promise<boolean> {
  try {
    const { data } = await db.from('estoque_produtos')
      .select('id, nivel_atual, preco_unitario')
      .ilike('nome', p.nome.trim())
      .in('loja', [p.loja, 'Todas as Lojas'])
      .eq('ativo', true)
      .maybeSingle()

    // Sempre registra a movimentação de entrada (rastreabilidade)
    await insertEstoqueMovimentacao({
      loja: p.loja,
      produto_id: (data as { id?: string } | null)?.id ?? null,
      produto_nome: p.nome,
      tipo: 'entrada',
      quantidade: p.quantidade,
      unidade: p.unidade || 'un',
      motivo: p.motivo,
      created_by: p.usuario,
    } as Omit<EstoqueMovimentacao, 'id' | 'created_at'>).catch(() => null)

    if (!data) return false  // produto não cadastrado no estoque — só ficou a movimentação

    const d = data as { id: string; nivel_atual: number; preco_unitario: number }
    const nivelAtual = d.nivel_atual ?? 0
    const precoAtual = d.preco_unitario ?? (p.preco ?? 0)
    const novoNivel  = nivelAtual + p.quantidade

    const patch: Record<string, unknown> = { nivel_atual: novoNivel, updated_at: new Date().toISOString() }
    if (p.preco && p.preco > 0) {
      const custoMedio = novoNivel > 0 ? (nivelAtual * precoAtual + p.quantidade * p.preco) / novoNivel : p.preco
      patch.preco_unitario = Math.round(custoMedio * 100) / 100
    }
    if (p.dataValidade) patch.data_validade = p.dataValidade
    if (p.numeroLote)   patch.numero_lote   = p.numeroLote

    await db.from('estoque_produtos').update(patch).eq('id', d.id)
    return true
  } catch (e) {
    console.warn('darEntradaEstoquePorNome:', e)
    return false
  }
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
  return restUpsert('estoque_contagem_itens', itens)
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
  return restDelete('fornecedores', `id=eq.${id}`)
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
  return restDelete('compras_lista', `id=eq.${id}`)
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
  return restDelete('compras_lista_item', `id=eq.${id}`)
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

// ── Config de aprovação multinível (limites orçamentários) ──────────────────
const APROV_CFG_DEFAULT = { limite_gestor: 500, limite_financeiro: 2000, limite_diretoria: 10000 }

export async function fetchAprovacaoConfig(loja: string): Promise<AprovacaoConfig> {
  try {
    const rows = await estoqueFetch('compras_aprovacao_config', `loja=eq.${encodeURIComponent(loja)}`)
    if (rows && rows[0]) return rows[0] as AprovacaoConfig
  } catch { /* usa default */ }
  return { loja, ...APROV_CFG_DEFAULT, updated_at: new Date().toISOString() }
}

export async function upsertAprovacaoConfig(cfg: { loja: string; limite_gestor: number; limite_financeiro: number; limite_diretoria: number }): Promise<void> {
  const token = await getToken()
  await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/compras_aprovacao_config?on_conflict=loja`, {
    method: 'POST',
    headers: {
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({ ...cfg, updated_at: new Date().toISOString() }),
  })
}

// ── Central de Boletos ──────────────────────────────────────────────────────
export async function fetchBoletos(loja: string): Promise<Boleto[]> {
  return sdkCall<Boleto[]>(
    db.from('boletos').select('*')
      .eq('loja', loja)
      .order('data_vencimento', { ascending: true, nullsFirst: false }),
  ).then(d => d ?? []).catch(() => [])
}
export async function insertBoleto(b: Omit<Boleto, 'id' | 'created_at' | 'updated_at'>): Promise<Boleto> {
  return sdkCall<Boleto>(db.from('boletos').insert(b).select().single())
}
export async function updateBoleto(id: string, upd: Partial<Boleto>): Promise<void> {
  await sdkCall<null>(db.from('boletos').update({ ...upd, updated_at: new Date().toISOString() }).eq('id', id))
}
export async function deleteBoleto(id: string): Promise<void> {
  await sdkCall<null>(db.from('boletos').delete().eq('id', id))
}

// ── Central de Notificações (Fase 6) ────────────────────────────────────────
export async function fetchNotificacoes(loja?: string, limit = 200): Promise<Notificacao[]> {
  let q = db.from('notificacoes').select('*').order('created_at', { ascending: false }).limit(limit)
  if (loja && loja !== 'Todas as Lojas') q = q.eq('loja', loja)
  return sdkCall<Notificacao[]>(q).then(d => d ?? []).catch(() => [])
}
export async function insertNotificacao(n: Partial<Notificacao>): Promise<Notificacao | null> {
  return sdkCall<Notificacao>(db.from('notificacoes').insert(n).select().single()).catch(() => null)
}
export async function marcarNotificacaoLida(id: string, lida = true): Promise<void> {
  await sdkCall<null>(db.from('notificacoes').update({ lida }).eq('id', id)).catch(() => {})
}
export async function deleteNotificacao(id: string): Promise<void> {
  await sdkCall<null>(db.from('notificacoes').delete().eq('id', id)).catch(() => {})
}

// ── Configuração global (chave/valor) ───────────────────────────────────────
export async function fetchAppConfig<T = any>(chave: string): Promise<T | null> {
  try {
    const row = await sdkCall<{ valor: T }>(db.from('app_config').select('valor').eq('chave', chave).single())
    return row?.valor ?? null
  } catch { return null }
}
export async function saveAppConfig(chave: string, valor: any): Promise<void> {
  await sdkCall<null>(
    db.from('app_config').upsert({ chave, valor, updated_at: new Date().toISOString() }, { onConflict: 'chave' })
  ).catch(() => {})
}

// ── Módulo de Caixas ────────────────────────────────────────────────────────
export async function fetchCaixas(loja?: string): Promise<Caixa[]> {
  let q = db.from('caixas').select('*').order('data_ref', { ascending: false, nullsFirst: false })
  if (loja && loja !== 'Todas as Lojas') q = q.eq('loja', loja)
  return sdkCall<Caixa[]>(q).then(d => d ?? []).catch(() => [])
}
export async function fetchCaixaItens(caixaId: string): Promise<CaixaItem[]> {
  return sdkCall<CaixaItem[]>(
    db.from('caixa_itens').select('*').eq('caixa_id', caixaId).order('valor', { ascending: false }),
  ).then(d => d ?? []).catch(() => [])
}
export async function fetchTodosCaixaItens(loja?: string): Promise<CaixaItem[]> {
  // itens de todos os caixas (para ABC/comparativo) — via join na loja
  const caixas = await fetchCaixas(loja)
  const ids = caixas.map(c => c.id)
  if (!ids.length) return []
  return sdkCall<CaixaItem[]>(db.from('caixa_itens').select('*').in('caixa_id', ids)).then(d => d ?? []).catch(() => [])
}
export async function deleteCaixa(id: string): Promise<void> {
  await sdkCall<null>(db.from('caixas').delete().eq('id', id)).catch(() => {})
}
export async function insertCaixa(c: Partial<Caixa>): Promise<Caixa> {
  return sdkCall<Caixa>(db.from('caixas').insert(c).select().single())
}
export async function updateCaixa(id: string, patch: Partial<Caixa>): Promise<void> {
  await sdkCall<null>(db.from('caixas').update(patch).eq('id', id)).catch(() => {})
}
export async function insertCaixaItens(itens: Partial<CaixaItem>[]): Promise<void> {
  if (!itens.length) return
  await sdkCall<null>(db.from('caixa_itens').insert(itens)).catch(() => {})
}
// Lança um caixa como prestação de contas no Financeiro (idempotente por caixa).
export async function lancarCaixaFinanceiro(caixa: Caixa, itens: { categoria?: string | null; descricao?: string | null; fornecedor?: string | null; valor: number; data?: string | null }[]): Promise<void> {
  try {
    const ult = await sdkCall<{ numero: number }[]>(db.from('fin_prestacoes').select('numero').order('numero', { ascending: false }).limit(1)).catch(() => [])
    const numero = ((ult?.[0]?.numero) || 0) + 1
    const dataP = caixa.data_ref || caixa.periodo_fim || new Date().toISOString().slice(0, 10)
    const prest = await sdkCall<{ id: string }>(db.from('fin_prestacoes').insert({
      loja: caixa.loja, numero, credito_id: null, responsavel_nome: `Caixa: ${caixa.titulo}`,
      data_prestacao: dataP, valor_recebido: caixa.total, valor_utilizado: caixa.total, valor_devolvido: 0, diferenca: 0,
      status: 'enviada', observacoes: `[IMPORT_CAIXA] ${caixa.titulo} — arquivo: manual`, created_by: caixa.created_by,
    }).select().single())
    const base = itens.length ? itens : [{ categoria: 'Despesas do caixa', descricao: caixa.titulo, valor: caixa.total }]
    const lanc = base.map(i => ({
      prestacao_id: prest.id, categoria: i.categoria || 'Outros', descricao: i.descricao || caixa.titulo,
      fornecedor: i.fornecedor || null, valor: i.valor, data_compra: i.data || dataP, forma_pagamento: 'dinheiro', status_auditoria: 'pendente',
    }))
    await sdkCall<null>(db.from('fin_lancamentos').insert(lanc)).catch(() => {})
  } catch (e) { console.error('lancarCaixaFinanceiro', e) }
}

// ── Raspadinha: controle de premiações (bloqueio geral + edição/pausa por prêmio) ──
export interface RaspPrizeCtrl { programada: number; pausado: boolean }
export interface RaspBloqueio {
  bloqueada: boolean
  por?: string; em?: string
  historico?: { acao: string; por: string; em: string }[]
  prizes?: Record<string, RaspPrizeCtrl>   // quantidade programada + pausa por prêmio
}
const RASP_HUGE = 100000000

export async function fetchRaspBloqueio(): Promise<RaspBloqueio | null> {
  return fetchAppConfig<RaspBloqueio>('rasp_bloqueio')
}
const _raspPremios = async (): Promise<any[]> => (await sdkCall<any[]>(db.from('rasp_premios').select('*')).catch(() => [])) || []

// Garante uma linha "Não foi dessa vez" (is_premio=false) em cada campanha — é o resultado quando não há prêmio a liberar.
async function _raspGarantirNaoFoi(premios: any[]): Promise<void> {
  const campanhas = (await sdkCall<any[]>(db.from('rasp_campanhas').select('id')).catch(() => [])) || []
  for (const c of campanhas) {
    if (!premios.some(p => p.campanha_id === c.id && p.is_premio === false)) {
      await sdkCall<null>(db.from('rasp_premios').insert({
        campanha_id: c.id, nome: 'Não foi dessa vez!', descricao: 'Não foi dessa vez, mas volte sempre! 💛',
        quantidade: RASP_HUGE, distribuidos: 0, resgatados: 0, is_premio: false, ordem: 99, cor: '#8B8B8B',
      })).catch(() => {})
    }
  }
}

// Monta o ctrl atual (programada/pausado por prêmio), semeando do backup (original) ou da quantidade atual.
async function _raspCtrl(): Promise<RaspBloqueio> {
  const cfg = (await fetchRaspBloqueio()) || { bloqueada: false }
  const prizes: Record<string, RaspPrizeCtrl> = { ...(cfg.prizes || {}) }
  const backup = await fetchAppConfig<{ premios: any[] }>('rasp_premios_backup')
  const bkMap: Record<string, number> = {}
  ;(backup?.premios || []).forEach((p: any) => { bkMap[p.id] = p.quantidade })
  for (const p of await _raspPremios()) {
    if (p.is_premio === false) continue
    if (!prizes[p.id]) prizes[p.id] = { programada: bkMap[p.id] != null ? bkMap[p.id] : p.quantidade, pausado: false }
  }
  return { ...cfg, prizes }
}

// Aplica bloqueio + pausas nas quantidades reais que a função de sorteio usa.
async function _raspReaplicar(ctrl: RaspBloqueio): Promise<void> {
  const premios = await _raspPremios()
  await _raspGarantirNaoFoi(premios)
  for (const p of await _raspPremios()) {
    if (p.is_premio === false) { await sdkCall<null>(db.from('rasp_premios').update({ quantidade: RASP_HUGE }).eq('id', p.id)).catch(() => {}); continue }
    const c = ctrl.prizes?.[p.id]
    const prog = c ? c.programada : p.quantidade
    const off = ctrl.bloqueada || (c?.pausado ?? false)
    await sdkCall<null>(db.from('rasp_premios').update({ quantidade: off ? p.distribuidos : prog }).eq('id', p.id)).catch(() => {})
  }
}
const _raspLog = (ctrl: RaspBloqueio, acao: string, por: string) => {
  ctrl.historico = (ctrl.historico || []).concat([{ acao, por: por || 'Sistema', em: new Date().toISOString() }]).slice(-60)
}

// Bloqueia/ativa a campanha inteira (todas as raspadinhas passam a mostrar "Não foi dessa vez").
export async function setRaspBloqueio(bloquear: boolean, userName: string): Promise<void> {
  const ctrl = await _raspCtrl()
  ctrl.bloqueada = bloquear; ctrl.por = userName || 'Sistema'; ctrl.em = new Date().toISOString()
  _raspLog(ctrl, bloquear ? 'bloqueou a campanha' : 'ativou a campanha', userName)
  await _raspReaplicar(ctrl); await saveAppConfig('rasp_bloqueio', ctrl)
}

// Pausa/retoma um prêmio específico (sem perder a quantidade programada).
export async function pausarPremio(prizeId: string, pausar: boolean, nomePremio: string, userName: string): Promise<void> {
  const ctrl = await _raspCtrl()
  ctrl.prizes = ctrl.prizes || {}
  if (!ctrl.prizes[prizeId]) ctrl.prizes[prizeId] = { programada: 0, pausado: false }
  ctrl.prizes[prizeId].pausado = pausar
  _raspLog(ctrl, `${pausar ? 'pausou' : 'retomou'} o prêmio "${nomePremio}"`, userName)
  await _raspReaplicar(ctrl); await saveAppConfig('rasp_bloqueio', ctrl)
}

// Edita nome/descrição/quantidade programada de um prêmio.
export async function editarPremio(prizeId: string, patch: { nome?: string; descricao?: string; programada?: number }, userName: string): Promise<void> {
  const upd: Record<string, unknown> = {}
  if (patch.nome != null) upd.nome = patch.nome
  if (patch.descricao != null) upd.descricao = patch.descricao
  if (Object.keys(upd).length) await sdkCall<null>(db.from('rasp_premios').update(upd).eq('id', prizeId)).catch(() => {})
  const ctrl = await _raspCtrl()
  ctrl.prizes = ctrl.prizes || {}
  if (!ctrl.prizes[prizeId]) ctrl.prizes[prizeId] = { programada: patch.programada ?? 0, pausado: false }
  if (patch.programada != null) ctrl.prizes[prizeId].programada = patch.programada
  _raspLog(ctrl, `editou o prêmio "${patch.nome ?? ''}"`.trim(), userName)
  await _raspReaplicar(ctrl); await saveAppConfig('rasp_bloqueio', ctrl)
}

// ── Upload de anexos (Supabase Storage, bucket "anexos") ────────────────────
export async function uploadAnexo(file: File, pasta = 'geral'): Promise<string> {
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '')
  const path = `${pasta}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage.from('anexos').upload(path, file, {
    upsert: false,
    contentType: file.type || undefined,
  })
  if (error) throw new Error(error.message || 'Falha no upload do anexo')
  const { data } = supabase.storage.from('anexos').getPublicUrl(path)
  return data.publicUrl
}

export async function deleteRequisicao(id: string): Promise<void> {
  return restDelete('requisicoes', `id=eq.${id}`)
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
  return restDelete('requisicao_itens', `id=eq.${id}`)
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
  return restDelete('requisicao_cotacoes', `id=eq.${id}`)
}

export async function fetchCotacaoItens(cotacaoId: string): Promise<RequisicaoCotacaoItem[]> {
  return estoqueFetch('requisicao_cotacao_itens', `cotacao_id=eq.${cotacaoId}&order=created_at.asc`)
}

export async function upsertCotacaoItens(itens: Omit<RequisicaoCotacaoItem, 'id' | 'created_at'>[]): Promise<RequisicaoCotacaoItem[]> {
  return restUpsert('requisicao_cotacao_itens', itens)
}

// ── Timeline de Requisições ──────────────────────────────────────────────────

export async function fetchReqTimeline(requisicaoId: string): Promise<ReqTimeline[]> {
  return estoqueFetch('req_timeline', `requisicao_id=eq.${requisicaoId}&order=created_at.asc`)
}

export async function insertReqTimeline(entry: Omit<ReqTimeline, 'id' | 'created_at'>): Promise<ReqTimeline> {
  return estoquePost('req_timeline', entry)
}

// ── ESTOQUE — Perdas ────────────────────────────────────────────────────────
import type { EstoquePerda, FornecedorAvaliacao, ProdutoTeste, HomologacaoStatus } from '../types/database'

export async function fetchEstoquePerdas(loja?: string): Promise<EstoquePerda[]> {
  const q = loja && loja !== 'Todas as Lojas'
    ? `loja=eq.${encodeURIComponent(loja)}&order=created_at.desc`
    : 'order=created_at.desc'
  return estoqueFetch('estoque_perdas', q)
}

export async function insertEstoquePerda(p: Omit<EstoquePerda, 'id' | 'created_at'>): Promise<EstoquePerda> {
  return estoquePost('estoque_perdas', p)
}

export async function deleteEstoquePerda(id: string): Promise<void> {
  return restDelete('estoque_perdas', `id=eq.${id}`)
}

// ── FORNECEDORES — Avaliações ───────────────────────────────────────────────

export async function fetchFornecedorAvaliacoes(fornecedorId: string): Promise<FornecedorAvaliacao[]> {
  return sdkCall<FornecedorAvaliacao[]>(db.from('fornecedor_avaliacoes').select('*').eq('fornecedor_id', fornecedorId).order('created_at', { ascending: false }))
}

export async function insertFornecedorAvaliacao(a: Omit<FornecedorAvaliacao, 'id' | 'created_at'>): Promise<FornecedorAvaliacao> {
  return sdkCall<FornecedorAvaliacao>(db.from('fornecedor_avaliacoes').insert(a).select().single())
}

export async function deleteFornecedorAvaliacao(id: string): Promise<void> {
  return restDelete('fornecedor_avaliacoes', `id=eq.${id}`)
}

// ── PRODUTOS EM TESTE ───────────────────────────────────────────────────────

export async function fetchProdutoTestes(produtoId: string): Promise<ProdutoTeste[]> {
  return sdkCall<ProdutoTeste[]>(db.from('produto_testes').select('*').eq('produto_id', produtoId).order('created_at', { ascending: false }))
}

export async function insertProdutoTeste(t: Omit<ProdutoTeste, 'id' | 'created_at'>): Promise<ProdutoTeste> {
  return sdkCall<ProdutoTeste>(db.from('produto_testes').insert(t).select().single())
}

export async function fetchProdutosEmTeste(loja: string): Promise<{ produto_id: string; resultado: string; created_at: string }[]> {
  return sdkCall<any[]>(db.from('produto_testes').select('produto_id,resultado,created_at').eq('loja', loja).order('created_at', { ascending: false }))
}

export async function updateProdutoHomologacao(
  id: string,
  status: HomologacaoStatus,
  dados: { feedback_teste?: string; aprovado_por?: string; data_inicio_teste?: string; aprovacao_at?: string }
): Promise<import('../types/database').Produto> {
  return sdkCall<import('../types/database').Produto>(
    db.from('produtos').update({ status_homologacao: status, ...dados, updated_at: new Date().toISOString() }).eq('id', id).select().single()
  )
}

// ── MÓDULO FINANCEIRO ───────────────────────────────────────────────────────
import type { FinCredito, FinPrestacao, FinLancamento, FinAnexo, FinAuditoriaLog } from '../types/database'

export async function fetchFinCreditos(loja: string): Promise<FinCredito[]> {
  let q = db.from('fin_creditos').select('*').order('created_at', { ascending: false })
  if (loja && loja !== 'Todas as Lojas' && loja !== 'all') q = q.eq('loja', loja)
  return sdkCall<FinCredito[]>(q)
}
export async function insertFinCredito(c: Omit<FinCredito, 'id' | 'numero' | 'created_at' | 'updated_at'>): Promise<FinCredito> {
  return sdkCall<FinCredito>(db.from('fin_creditos').insert(c).select().single())
}
export async function updateFinCredito(id: string, c: Partial<FinCredito>): Promise<FinCredito> {
  return sdkCall<FinCredito>(db.from('fin_creditos').update({ ...c, updated_at: new Date().toISOString() }).eq('id', id).select().single())
}
export async function deleteFinCredito(id: string): Promise<void> {
  const { error } = await Promise.race([
    db.from('fin_creditos').delete().eq('id', id),
    new Promise<{ error: Error }>(r => setTimeout(() => r({ error: new Error('timeout') }), 8000)),
  ])
  if (error) throw error
}

export async function fetchFinPrestacoes(loja: string): Promise<FinPrestacao[]> {
  let q = db.from('fin_prestacoes').select('*').order('created_at', { ascending: false })
  if (loja && loja !== 'Todas as Lojas' && loja !== 'all') q = q.eq('loja', loja)
  return sdkCall<FinPrestacao[]>(q)
}
export async function insertFinPrestacao(p: Omit<FinPrestacao, 'id' | 'numero' | 'diferenca' | 'created_at' | 'updated_at'>): Promise<FinPrestacao> {
  return sdkCall<FinPrestacao>(db.from('fin_prestacoes').insert({ ...p, diferenca: 0 }).select().single())
}
export async function updateFinPrestacao(id: string, p: Partial<FinPrestacao>): Promise<FinPrestacao> {
  return sdkCall<FinPrestacao>(db.from('fin_prestacoes').update({ ...p, updated_at: new Date().toISOString() }).eq('id', id).select().single())
}
export async function deleteFinPrestacao(id: string): Promise<void> {
  const { error } = await Promise.race([
    db.from('fin_prestacoes').delete().eq('id', id),
    new Promise<{ error: Error }>(r => setTimeout(() => r({ error: new Error('timeout') }), 8000)),
  ])
  if (error) throw error
}

export async function fetchFinLancamentos(prestacaoId: string): Promise<FinLancamento[]> {
  return sdkCall<FinLancamento[]>(db.from('fin_lancamentos').select('*').eq('prestacao_id', prestacaoId).order('data_compra', { ascending: true }))
}
export async function insertFinLancamento(l: Omit<FinLancamento, 'id' | 'created_at'>): Promise<FinLancamento> {
  return sdkCall<FinLancamento>(db.from('fin_lancamentos').insert(l).select().single())
}
export async function updateFinLancamento(id: string, l: Partial<FinLancamento>): Promise<FinLancamento> {
  return sdkCall<FinLancamento>(db.from('fin_lancamentos').update(l).eq('id', id).select().single())
}
export async function deleteFinLancamento(id: string): Promise<void> {
  const { error } = await Promise.race([
    db.from('fin_lancamentos').delete().eq('id', id),
    new Promise<{ error: Error }>(r => setTimeout(() => r({ error: new Error('timeout') }), 8000)),
  ])
  if (error) throw error
}

export async function fetchFinAnexos(lancamentoId: string): Promise<FinAnexo[]> {
  return sdkCall<FinAnexo[]>(db.from('fin_anexos').select('*').eq('lancamento_id', lancamentoId).order('created_at'))
}
export async function insertFinAnexo(a: Omit<FinAnexo, 'id' | 'created_at'>): Promise<FinAnexo> {
  return sdkCall<FinAnexo>(db.from('fin_anexos').insert(a).select().single())
}
export async function deleteFinAnexo(id: string): Promise<void> {
  await sdkCall<null>(db.from('fin_anexos').delete().eq('id', id))
}
export async function uploadFinComprovante(file: File, lancamentoId: string, _prestacaoId: string, createdBy: string): Promise<FinAnexo> {
  if (file.size > 5 * 1024 * 1024) throw new Error('Arquivo muito grande — máximo 5 MB por comprovante.')
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'))
    reader.readAsDataURL(file)
  })
  return insertFinAnexo({
    lancamento_id: lancamentoId,
    nome_arquivo:  file.name,
    tipo:          file.type.startsWith('image/') ? 'foto' : file.type === 'application/pdf' ? 'pdf' : 'outro',
    url:           dataUrl,
    tamanho_kb:    Math.round(file.size / 1024),
    created_by:    createdBy,
  })
}

export async function insertFinAuditoriaLog(log: Omit<FinAuditoriaLog, 'id' | 'created_at'>): Promise<void> {
  sdkCall<null>(db.from('fin_auditoria_log').insert(log)).catch(() => {})
}
export async function fetchFinAuditoriaLog(entidadeId: string): Promise<FinAuditoriaLog[]> {
  return sdkCall<FinAuditoriaLog[]>(db.from('fin_auditoria_log').select('*').eq('entidade_id', entidadeId).order('created_at'))
}

// ── MÓDULO PRODUTOS ─────────────────────────────────────────────────────────
import type { CategoriaProduto, MarcaProduto, Produto, ProdutoFornecedor } from '../types/database'

// Categorias
export async function fetchCategoriasProduto(loja: string): Promise<CategoriaProduto[]> {
  let q = db.from('categorias_produto').select('*').order('nome', { ascending: true })
  if (loja && loja !== 'Todas as Lojas' && loja !== 'all') q = q.eq('loja', loja)
  return sdkCall<CategoriaProduto[]>(q)
}
export async function insertCategoriaProduto(c: Omit<CategoriaProduto, 'id' | 'created_at' | 'updated_at'>): Promise<CategoriaProduto> {
  return sdkCall<CategoriaProduto>(db.from('categorias_produto').insert(c).select().single())
}
export async function updateCategoriaProduto(id: string, c: Partial<CategoriaProduto>): Promise<CategoriaProduto> {
  return sdkCall<CategoriaProduto>(db.from('categorias_produto').update({ ...c, updated_at: new Date().toISOString() }).eq('id', id).select().single())
}
export async function deleteCategoriaProduto(id: string): Promise<void> {
  await sdkCall<null>(db.from('categorias_produto').delete().eq('id', id))
}

// Marcas
export async function fetchMarcasProduto(loja: string): Promise<MarcaProduto[]> {
  let q = db.from('marcas_produto').select('*').order('nome', { ascending: true })
  if (loja && loja !== 'Todas as Lojas' && loja !== 'all') q = q.eq('loja', loja)
  return sdkCall<MarcaProduto[]>(q)
}
export async function insertMarcaProduto(m: Omit<MarcaProduto, 'id' | 'created_at'>): Promise<MarcaProduto> {
  return sdkCall<MarcaProduto>(db.from('marcas_produto').insert(m).select().single())
}
export async function updateMarcaProduto(id: string, m: Partial<MarcaProduto>): Promise<MarcaProduto> {
  return sdkCall<MarcaProduto>(db.from('marcas_produto').update(m).eq('id', id).select().single())
}
export async function deleteMarcaProduto(id: string): Promise<void> {
  await sdkCall<null>(db.from('marcas_produto').delete().eq('id', id))
}

// Produtos
export async function fetchProdutos(loja: string, opts?: { search?: string; categoriaId?: string; marcaId?: string; ativo?: boolean }): Promise<Produto[]> {
  let q = db.from('produtos').select('*')
  if (loja && loja !== 'Todas as Lojas' && loja !== 'all') q = q.eq('loja', loja)
  if (opts?.ativo !== undefined) q = q.eq('ativo', opts.ativo)
  if (opts?.categoriaId) q = q.eq('categoria_id', opts.categoriaId)
  if (opts?.marcaId) q = q.eq('marca_id', opts.marcaId)
  if (opts?.search) q = q.ilike('nome', `%${opts.search}%`)
  return sdkCall<Produto[]>(q.order('nome', { ascending: true }))
}
export async function fetchProduto(id: string): Promise<Produto | null> {
  try {
    return await sdkCall<Produto>(db.from('produtos').select('*').eq('id', id).single())
  } catch {
    return null
  }
}
export async function insertProduto(p: Omit<Produto, 'id' | 'created_at' | 'updated_at' | 'fornecedores'>): Promise<Produto> {
  return sdkCall<Produto>(db.from('produtos').insert(p).select().single())
}
export async function updateProduto(id: string, p: Partial<Omit<Produto, 'id' | 'created_at' | 'fornecedores'>>): Promise<Produto> {
  return sdkCall<Produto>(db.from('produtos').update({ ...p, updated_at: new Date().toISOString() }).eq('id', id).select().single())
}
export async function deleteProduto(id: string): Promise<void> {
  await sdkCall<null>(db.from('produtos').delete().eq('id', id))
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
  return sdkCall<ProdutoFornecedor[]>(db.from('produto_fornecedores').select('*, fornecedor:fornecedores(id,nome,telefone,email,cidade,prazo_entrega_dias)').eq('produto_id', produtoId))
}
export async function upsertProdutoFornecedor(pf: Omit<ProdutoFornecedor, 'id' | 'created_at' | 'fornecedor'>): Promise<ProdutoFornecedor> {
  return sdkCall<ProdutoFornecedor>(db.from('produto_fornecedores').upsert(pf, { onConflict: 'produto_id,fornecedor_id' }).select().single())
}
export async function deleteProdutoFornecedor(produtoId: string, fornecedorId: string): Promise<void> {
  await sdkCall<null>(db.from('produto_fornecedores').delete().eq('produto_id', produtoId).eq('fornecedor_id', fornecedorId))
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
  const listaData = await sdkCall<{ id: string }[]>(db.from('compras_lista').select('id').eq('loja', loja)).catch(() => [])
  if (!listaData?.length) return []
  const ids = listaData.map(l => l.id)
  return sdkCall<any[]>(db
    .from('compras_lista_item')
    .select('produto_nome,categoria,quantidade,preco_real,fornecedor_nome,status,unidade')
    .in('lista_id', ids)
    .eq('status', 'comprado')).then(d => d ?? []).catch(() => [])
}

// ── MÓDULO MARKETING ────────────────────────────────────────────────────────

export interface MktCampanha {
  id: string
  loja: string
  nome: string
  descricao: string | null
  tipo: string
  objetivo: string | null
  intensidade: string
  status: string
  data_inicio: string | null
  data_fim: string | null
  investimento: number
  receita_estimada: number
  receita_real: number
  aprendizado: string | null
  responsavel: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export async function fetchMktCampanhas(loja: string): Promise<MktCampanha[]> {
  let q = db.from('mkt_campanhas').select('*').order('created_at', { ascending: false })
  if (loja && loja !== 'Todas as Lojas' && loja !== 'all') q = q.eq('loja', loja)
  return sdkCall<MktCampanha[]>(q).then(d => d ?? []).catch(() => [])
}

export async function insertMktCampanha(c: Omit<MktCampanha, 'id' | 'created_at' | 'updated_at'>): Promise<MktCampanha> {
  return sdkCall<MktCampanha>(db.from('mkt_campanhas').insert(c).select().single())
}

export async function updateMktCampanha(id: string, c: Partial<MktCampanha>): Promise<MktCampanha> {
  return sdkCall<MktCampanha>(db.from('mkt_campanhas').update({ ...c, updated_at: new Date().toISOString() }).eq('id', id).select().single())
}

export async function deleteMktCampanha(id: string): Promise<void> {
  await sdkCall<null>(db.from('mkt_campanhas').delete().eq('id', id))
}

// ── Marketing: Contatos + Consentimento (LGPD) ───────────────────
export type MktContatoStatus = 'ativo' | 'cancelado' | 'bloqueado'
export type MktContatoOrigem = 'qr_code' | 'wifi' | 'delivery' | 'site' | 'instagram' | 'presencial' | 'manual' | 'importacao'

export interface MktContato {
  id: string
  loja: string | null
  nome: string
  telefone: string
  email: string | null
  origem: MktContatoOrigem | null
  consentimento: boolean
  data_optin: string | null
  data_optout: string | null
  status: MktContatoStatus
  aniversario: string | null
  ultima_compra: string | null
  ticket_medio: number
  total_pedidos: number
  categoria_favorita: string | null
  tags: string[]
  observacoes: string | null
  created_at: string
  updated_at: string
}

export async function fetchMktContatos(loja?: string): Promise<MktContato[]> {
  let q = db.from('mkt_contatos').select('*').order('created_at', { ascending: false })
  if (loja && loja !== 'Todas as Lojas' && loja !== 'all') q = q.eq('loja', loja)
  return sdkCall<MktContato[]>(q).then(d => d ?? []).catch(() => [])
}

export async function insertMktContato(c: Omit<MktContato, 'id' | 'created_at' | 'updated_at'>): Promise<MktContato> {
  return sdkCall<MktContato>(db.from('mkt_contatos').insert(c).select().single())
}

export async function updateMktContato(id: string, c: Partial<MktContato>): Promise<MktContato> {
  return sdkCall<MktContato>(db.from('mkt_contatos').update({ ...c, updated_at: new Date().toISOString() }).eq('id', id).select().single())
}

export async function deleteMktContato(id: string): Promise<void> {
  await sdkCall<null>(db.from('mkt_contatos').delete().eq('id', id))
}

// Importa vários contatos de uma vez (ignora duplicados por telefone via upsert)
export async function upsertMktContatos(contatos: Omit<MktContato, 'id' | 'created_at' | 'updated_at'>[]): Promise<number> {
  if (!contatos.length) return 0
  const r = await sdkCall<MktContato[]>(db.from('mkt_contatos').upsert(contatos, { onConflict: 'telefone', ignoreDuplicates: true }).select())
  return (r ?? []).length
}

// Contagem por categoria
export async function fetchContagemPorCategoria(loja: string): Promise<{ categoria_nome: string | null; total: number }[]> {
  let q = db.from('produtos').select('categoria_nome').eq('ativo', true)
  if (loja && loja !== 'Todas as Lojas' && loja !== 'all') q = q.eq('loja', loja)
  const data = await sdkCall<{ categoria_nome: string | null }[]>(q).catch(() => [])
  const map: Record<string, number> = {}
  for (const r of (data ?? [])) {
    const k = r.categoria_nome ?? 'Sem categoria'
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
  return sdkCall<RelatorioCVL[]>(q).then(d => d ?? [])
}

export async function fetchRelatorioCVLItens(relatorioId: string): Promise<RelatorioCVLItem[]> {
  return sdkCall<RelatorioCVLItem[]>(db.from('relatorio_cvl_itens').select('*').eq('relatorio_id', relatorioId).order('produto_nome')).then(d => d ?? [])
}

export async function insertRelatorioCVL(r: Omit<RelatorioCVL, 'id' | 'created_at' | 'gerado_em'>): Promise<RelatorioCVL> {
  return sdkCall<RelatorioCVL>(db.from('relatorio_compra_vs_lista').insert(r).select().single())
}

export async function insertRelatorioCVLItens(itens: Omit<RelatorioCVLItem, 'id' | 'created_at' | 'diferenca_qtd' | 'divergencia_pct'>[]): Promise<void> {
  if (!itens.length) return
  await sdkCall<null>(db.from('relatorio_cvl_itens').insert(itens))
}

export async function deleteRelatorioCVL(id: string): Promise<void> {
  await sdkCall<null>(db.from('relatorio_compra_vs_lista').delete().eq('id', id))
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
  return sdkCall<Ruptura[]>(q).then(d => d ?? [])
}

export async function insertRuptura(r: Omit<Ruptura, 'id' | 'created_at' | 'updated_at' | 'qtd_ruptura' | 'pct_ruptura'>): Promise<Ruptura> {
  return sdkCall<Ruptura>(db.from('rupturas').insert(r).select().single())
}

export async function updateRuptura(id: string, r: Partial<Ruptura>): Promise<Ruptura> {
  // Strip GENERATED ALWAYS AS STORED columns — Postgres rejects updates to them
  const { qtd_ruptura, pct_ruptura, ...safe } = r
  void qtd_ruptura; void pct_ruptura
  return sdkCall<Ruptura>(db.from('rupturas').update({ ...safe, updated_at: new Date().toISOString() }).eq('id', id).select().single())
}

export async function deleteRuptura(id: string): Promise<void> {
  await sdkCall<null>(db.from('rupturas').delete().eq('id', id))
}

// ── Requisições Automáticas ──────────────────────────────────

export async function fetchRequisoesAutomaticas(loja?: string): Promise<RequisicaoAutomatica[]> {
  let q = db.from('requisicoes_automaticas').select('*').order('created_at', { ascending: false })
  if (loja && loja !== 'Todas as Lojas') q = q.eq('loja', loja)
  return sdkCall<RequisicaoAutomatica[]>(q).then(d => d ?? [])
}

export async function insertRequisicaoAutomatica(
  r: Omit<RequisicaoAutomatica, 'id' | 'created_at' | 'updated_at'>
): Promise<RequisicaoAutomatica> {
  return sdkCall<RequisicaoAutomatica>(db.from('requisicoes_automaticas').insert(r).select().single())
}

export async function updateRequisicaoAutomatica(
  id: string,
  r: Partial<RequisicaoAutomatica>
): Promise<RequisicaoAutomatica> {
  return sdkCall<RequisicaoAutomatica>(
    db.from('requisicoes_automaticas')
      .update({ ...r, updated_at: new Date().toISOString() })
      .eq('id', id).select().single()
  )
}

export async function deleteRequisicaoAutomatica(id: string): Promise<void> {
  await sdkCall<null>(db.from('requisicoes_automaticas').delete().eq('id', id))
}

// ── Cozinha — Checklists ────────────────────────────────────

export async function fetchCozinhaChecklists(loja?: string): Promise<CozinhaChecklist[]> {
  let q = db.from('cozinha_checklists').select('*').order('created_at', { ascending: true })
  if (loja && loja !== 'Todas as Lojas') q = q.eq('loja', loja)
  return sdkCall<CozinhaChecklist[]>(q).then(d => d ?? []).catch(() => [])
}
export async function insertCozinhaChecklist(
  c: Omit<CozinhaChecklist, 'id' | 'created_at' | 'updated_at'>
): Promise<CozinhaChecklist> {
  return sdkCall<CozinhaChecklist>(db.from('cozinha_checklists').insert(c).select().single())
}
export async function updateCozinhaChecklist(
  id: string, c: Partial<CozinhaChecklist>
): Promise<CozinhaChecklist> {
  return sdkCall<CozinhaChecklist>(
    db.from('cozinha_checklists').update({ ...c, updated_at: new Date().toISOString() }).eq('id', id).select().single()
  )
}
export async function deleteCozinhaChecklist(id: string): Promise<void> {
  await sdkCall<null>(db.from('cozinha_checklists').delete().eq('id', id))
}

// ── Operação Padrão / Checklists Inteligentes ───────────────
// Modelos (templates). Retorna os da loja + os globais (loja null).
export async function fetchChecklistModelos(loja?: string): Promise<ChecklistModelo[]> {
  let q = db.from('checklist_modelos').select('*').order('created_at', { ascending: true })
  // 'Todas as Lojas' (admin) → todos os modelos; loja específica → os dela + os globais (loja null)
  if (loja && loja !== 'Todas as Lojas') q = q.or(`loja.eq.${loja},loja.is.null`)
  return sdkCall<ChecklistModelo[]>(q).then((d: ChecklistModelo[] | null) => d ?? []).catch(() => [])
}

export async function insertChecklistModelo(
  m: Omit<ChecklistModelo, 'id' | 'created_at' | 'updated_at'>
): Promise<ChecklistModelo> {
  return sdkCall<ChecklistModelo>(db.from('checklist_modelos').insert(m).select().single())
}

export async function updateChecklistModelo(id: string, m: Partial<ChecklistModelo>): Promise<ChecklistModelo> {
  return sdkCall<ChecklistModelo>(
    db.from('checklist_modelos').update({ ...m, updated_at: new Date().toISOString() }).eq('id', id).select().single()
  )
}

export async function deleteChecklistModelo(id: string): Promise<void> {
  await sdkCall<null>(db.from('checklist_modelos').delete().eq('id', id))
}

// Execuções (instâncias do dia)
export async function fetchChecklistExecucoes(loja: string, data?: string): Promise<ChecklistExecucao[]> {
  let q = db.from('checklist_execucoes').select('*').order('created_at', { ascending: false })
  if (loja && loja !== 'Todas as Lojas') q = q.eq('loja', loja)
  if (data) q = q.eq('data', data)
  return sdkCall<ChecklistExecucao[]>(q).then((d: ChecklistExecucao[] | null) => d ?? []).catch(() => [])
}

// Execuções num intervalo de datas (p/ painel de compliance e rankings)
export async function fetchChecklistExecucoesRange(loja: string, dataIni: string, dataFim: string): Promise<ChecklistExecucao[]> {
  let q = db.from('checklist_execucoes').select('*').gte('data', dataIni).lte('data', dataFim).order('data', { ascending: false })
  if (loja && loja !== 'Todas as Lojas') q = q.eq('loja', loja)
  return sdkCall<ChecklistExecucao[]>(q).then((d: ChecklistExecucao[] | null) => d ?? []).catch(() => [])
}

export async function insertChecklistExecucao(
  e: Omit<ChecklistExecucao, 'id' | 'created_at' | 'updated_at' | 'modelo'>
): Promise<ChecklistExecucao> {
  return sdkCall<ChecklistExecucao>(db.from('checklist_execucoes').insert(e).select().single())
}

export async function updateChecklistExecucao(id: string, e: Partial<ChecklistExecucao>): Promise<ChecklistExecucao> {
  return sdkCall<ChecklistExecucao>(
    db.from('checklist_execucoes').update({ ...e, updated_at: new Date().toISOString() }).eq('id', id).select().single()
  )
}

export async function deleteChecklistExecucao(id: string): Promise<void> {
  await sdkCall<null>(db.from('checklist_execucoes').delete().eq('id', id))
}

// ── Sugestão de Pauta de Reunião ────────────────────────────
export async function fetchPautas(loja: string): Promise<PautaReuniao[]> {
  let q = db.from('pautas_reuniao').select('*').order('created_at', { ascending: false })
  if (loja && loja !== 'Todas as Lojas') q = q.eq('loja', loja)
  return sdkCall<PautaReuniao[]>(q).then((d: PautaReuniao[] | null) => d ?? []).catch(() => [])
}

export async function insertPauta(p: Omit<PautaReuniao, 'id' | 'created_at' | 'updated_at'>): Promise<PautaReuniao> {
  return sdkCall<PautaReuniao>(db.from('pautas_reuniao').insert(p).select().single())
}

export async function updatePauta(id: string, p: Partial<PautaReuniao>): Promise<PautaReuniao> {
  return sdkCall<PautaReuniao>(
    db.from('pautas_reuniao').update({ ...p, updated_at: new Date().toISOString() }).eq('id', id).select().single()
  )
}

export async function deletePauta(id: string): Promise<void> {
  await sdkCall<null>(db.from('pautas_reuniao').delete().eq('id', id))
}

// Cria uma tarefa a partir de um tema de pauta (loja+titulo obrigatórios; resto usa default do banco)
export async function insertTarefaDePauta(t: {
  loja: string; titulo: string; descricao?: string | null; setor?: string | null
  prioridade?: string | null; responsavel_nome?: string | null; solicitante_nome?: string | null; created_by?: string | null
}): Promise<{ id: string }> {
  const payload: Record<string, unknown> = { loja: t.loja, titulo: t.titulo }
  if (t.descricao) payload.descricao = t.descricao
  if (t.setor) payload.setor = t.setor
  if (t.prioridade) payload.prioridade = t.prioridade
  if (t.responsavel_nome) payload.responsavel_nome = t.responsavel_nome
  if (t.solicitante_nome) payload.solicitante_nome = t.solicitante_nome
  if (t.created_by) payload.created_by = t.created_by
  return sdkCall<{ id: string }>(db.from('tarefas').insert(payload).select('id').single())
}

// ── Cozinha — Produção ──────────────────────────────────────

export async function fetchCozinhaProducao(loja?: string): Promise<CozinhaProducao[]> {
  let q = db.from('cozinha_producao').select('*').order('created_at', { ascending: false })
  if (loja && loja !== 'Todas as Lojas') q = q.eq('loja', loja)
  return sdkCall<CozinhaProducao[]>(q).then(d => d ?? []).catch(() => [])
}
export async function insertCozinhaProducao(
  p: Omit<CozinhaProducao, 'id' | 'created_at' | 'updated_at'>
): Promise<CozinhaProducao> {
  return sdkCall<CozinhaProducao>(db.from('cozinha_producao').insert(p).select().single())
}
export async function updateCozinhaProducao(
  id: string, p: Partial<CozinhaProducao>
): Promise<CozinhaProducao> {
  return sdkCall<CozinhaProducao>(
    db.from('cozinha_producao').update({ ...p, updated_at: new Date().toISOString() }).eq('id', id).select().single()
  )
}
export async function deleteCozinhaProducao(id: string): Promise<void> {
  await sdkCall<null>(db.from('cozinha_producao').delete().eq('id', id))
}

// ── Cozinha — Desperdício ───────────────────────────────────

export async function fetchCozinhaDesperdicio(loja?: string): Promise<CozinhaDesperdicio[]> {
  let q = db.from('cozinha_desperdicio').select('*').order('created_at', { ascending: false })
  if (loja && loja !== 'Todas as Lojas') q = q.eq('loja', loja)
  return sdkCall<CozinhaDesperdicio[]>(q).then(d => d ?? []).catch(() => [])
}
export async function insertCozinhaDesperdicio(
  d: Omit<CozinhaDesperdicio, 'id' | 'created_at'>
): Promise<CozinhaDesperdicio> {
  return sdkCall<CozinhaDesperdicio>(db.from('cozinha_desperdicio').insert(d).select().single())
}
export async function deleteCozinhaDesperdicio(id: string): Promise<void> {
  await sdkCall<null>(db.from('cozinha_desperdicio').delete().eq('id', id))
}

// ── Cozinha — Fichas Técnicas ───────────────────────────────

export async function fetchCozinhaFichas(): Promise<CozinhaFicha[]> {
  return sdkCall<CozinhaFicha[]>(
    db.from('cozinha_fichas').select('*').order('created_at', { ascending: false })
  ).then(d => d ?? []).catch(() => [])
}
export async function insertCozinhaFicha(
  f: Omit<CozinhaFicha, 'id' | 'created_at' | 'updated_at'>
): Promise<CozinhaFicha> {
  return sdkCall<CozinhaFicha>(db.from('cozinha_fichas').insert(f).select().single())
}
export async function updateCozinhaFicha(
  id: string, f: Partial<CozinhaFicha>
): Promise<CozinhaFicha> {
  return sdkCall<CozinhaFicha>(
    db.from('cozinha_fichas').update({ ...f, updated_at: new Date().toISOString() }).eq('id', id).select().single()
  )
}
export async function deleteCozinhaFicha(id: string): Promise<void> {
  await sdkCall<null>(db.from('cozinha_fichas').delete().eq('id', id))
}

// ── Cozinha — Solicitações ──────────────────────────────────

export async function fetchCozinhaSolicitacoes(loja?: string): Promise<CozinhaSolicitacao[]> {
  let q = db.from('cozinha_solicitacoes').select('*').order('created_at', { ascending: false })
  if (loja && loja !== 'Todas as Lojas') q = q.eq('loja', loja)
  return sdkCall<CozinhaSolicitacao[]>(q).then(d => d ?? []).catch(() => [])
}
export async function insertCozinhaSolicitacao(
  s: Omit<CozinhaSolicitacao, 'id' | 'created_at' | 'updated_at'>
): Promise<CozinhaSolicitacao> {
  return sdkCall<CozinhaSolicitacao>(db.from('cozinha_solicitacoes').insert(s).select().single())
}
export async function updateCozinhaSolicitacao(
  id: string, s: Partial<CozinhaSolicitacao>
): Promise<CozinhaSolicitacao> {
  return sdkCall<CozinhaSolicitacao>(
    db.from('cozinha_solicitacoes').update({ ...s, updated_at: new Date().toISOString() }).eq('id', id).select().single()
  )
}
export async function deleteCozinhaSolicitacao(id: string): Promise<void> {
  await sdkCall<null>(db.from('cozinha_solicitacoes').delete().eq('id', id))
}

// ── Market Analytics — Histórico de Preços ──────────────────

export async function fetchMarketPriceHistory(loja?: string, produto?: string): Promise<MarketPriceHistory[]> {
  let q = db.from('market_price_history').select('*').order('data', { ascending: false }).order('created_at', { ascending: false })
  if (loja && loja !== 'Todas as Lojas') q = q.eq('loja', loja)
  if (produto) q = q.eq('produto', produto)
  return sdkCall<MarketPriceHistory[]>(q).then(d => d ?? []).catch(() => [])
}

export async function insertMarketPrice(p: Omit<MarketPriceHistory, 'id' | 'created_at'>): Promise<MarketPriceHistory> {
  return sdkCall<MarketPriceHistory>(db.from('market_price_history').insert(p).select().single())
}

export async function deleteMarketPrice(id: string): Promise<void> {
  await sdkCall<null>(db.from('market_price_history').delete().eq('id', id))
}

// ── Market Analytics — Scores de Fornecedores ───────────────

export async function fetchFornecedorScores(): Promise<FornecedorScore[]> {
  return sdkCall<FornecedorScore[]>(
    db.from('fornecedor_scores').select('*').order('score_total', { ascending: false })
  ).then(d => d ?? []).catch(() => [])
}

export async function upsertFornecedorScore(
  s: Omit<FornecedorScore, 'id' | 'created_at'>
): Promise<FornecedorScore> {
  const token = await getToken()
  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/fornecedor_scores`,
      {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation,resolution=merge-duplicates',
        },
        body: JSON.stringify(s),
      },
    )
    if (!res.ok) throw new Error(res.statusText)
    const rows = await res.json()
    return Array.isArray(rows) ? rows[0] : rows
  } finally { clearTimeout(timer) }
}

export async function deleteFornecedorScore(id: string): Promise<void> {
  await sdkCall<null>(db.from('fornecedor_scores').delete().eq('id', id))
}

// ── Market Analytics — Alertas ───────────────────────────────

export async function fetchMarketAlerts(apenasNaoLidos = false): Promise<MarketAlert[]> {
  let q = db.from('market_alerts').select('*').order('created_at', { ascending: false }).limit(200)
  if (apenasNaoLidos) q = q.eq('lido', false)
  return sdkCall<MarketAlert[]>(q).then(d => d ?? []).catch(() => [])
}

// ── Tarefas Operacionais ─────────────────────────────────────

export async function fetchTarefas(loja: string): Promise<Tarefa[]> {
  return sdkCall<Tarefa[]>(
    db.from('tarefas')
      .select('*, checklist:tarefas_checklist(*), comentarios:tarefas_comentarios(*), historico:tarefas_historico(*)')
      .eq('loja', loja)
      .order('created_at', { ascending: false })
      .limit(500),
  ).then(d => d ?? []).catch(() => [])
}

export async function insertTarefa(t: Omit<Tarefa, 'id' | 'created_at' | 'updated_at' | 'checklist' | 'comentarios' | 'historico'>): Promise<Tarefa> {
  return sdkCall<Tarefa>(db.from('tarefas').insert(t).select().single())
}

export async function updateTarefa(id: string, upd: Partial<Omit<Tarefa, 'id' | 'created_at' | 'checklist' | 'comentarios' | 'historico'>>): Promise<void> {
  await sdkCall<null>(db.from('tarefas').update({ ...upd, updated_at: new Date().toISOString() }).eq('id', id))
}

export async function deleteTarefa(id: string): Promise<void> {
  await sdkCall<null>(db.from('tarefas').delete().eq('id', id))
}

// Checklist
export async function insertTarefaChecklist(item: Omit<TarefaChecklist, 'id' | 'created_at'>): Promise<TarefaChecklist> {
  return sdkCall<TarefaChecklist>(db.from('tarefas_checklist').insert(item).select().single())
}
export async function updateTarefaChecklist(id: string, upd: Partial<TarefaChecklist>): Promise<void> {
  await sdkCall<null>(db.from('tarefas_checklist').update(upd).eq('id', id))
}
export async function deleteTarefaChecklist(id: string): Promise<void> {
  await sdkCall<null>(db.from('tarefas_checklist').delete().eq('id', id))
}

// Comentários
export async function insertTarefaComentario(c: Omit<TarefaComentario, 'id' | 'created_at'>): Promise<TarefaComentario> {
  return sdkCall<TarefaComentario>(db.from('tarefas_comentarios').insert(c).select().single())
}

// Histórico
export async function insertTarefaHistorico(h: Omit<TarefaHistorico, 'id' | 'created_at'>): Promise<void> {
  await sdkCall<null>(db.from('tarefas_historico').insert(h))
}

export async function insertMarketAlert(a: Omit<MarketAlert, 'id' | 'created_at'>): Promise<MarketAlert> {
  return sdkCall<MarketAlert>(db.from('market_alerts').insert(a).select().single())
}

export async function marcarAlertaLido(id: string): Promise<void> {
  await sdkCall<null>(db.from('market_alerts').update({ lido: true }).eq('id', id))
}

export async function marcarTodosLidos(): Promise<void> {
  await sdkCall<null>(db.from('market_alerts').update({ lido: true }).eq('lido', false))
}

// ── Market Analytics — Tendências ───────────────────────────

export async function fetchMarketTendencias(): Promise<MarketTendencia[]> {
  return sdkCall<MarketTendencia[]>(
    db.from('market_tendencias').select('*').order('updated_at', { ascending: false })
  ).then(d => d ?? []).catch(() => [])
}

export async function upsertMarketTendencia(
  t: Omit<MarketTendencia, 'id' | 'created_at'>
): Promise<MarketTendencia> {
  const token = await getToken()
  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/market_tendencias`,
      {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation,resolution=merge-duplicates',
        },
        body: JSON.stringify(t),
      },
    )
    if (!res.ok) throw new Error(res.statusText)
    const rows = await res.json()
    return Array.isArray(rows) ? rows[0] : rows
  } finally { clearTimeout(timer) }
}

export async function deleteMarketTendencia(id: string): Promise<void> {
  await sdkCall<null>(db.from('market_tendencias').delete().eq('id', id))
}

// ── Agente Analítico de Compras — Histórico de Preços ───────
import type { ComprasHistoricoPreco, ComprasAuditoria, ComprasJustificativa } from '../types/database'

export async function fetchComprasHistoricoPreco(loja?: string, produto?: string): Promise<ComprasHistoricoPreco[]> {
  let q = db.from('compras_historico_preco').select('*').order('data_compra', { ascending: false }).order('created_at', { ascending: false })
  if (loja && loja !== 'Todas as Lojas') q = q.eq('loja', loja)
  if (produto) q = q.ilike('produto_nome', `%${produto}%`)
  return sdkCall<ComprasHistoricoPreco[]>(q).then(d => d ?? [])
}

export async function insertComprasHistoricoPreco(h: Omit<ComprasHistoricoPreco, 'id' | 'created_at'>): Promise<ComprasHistoricoPreco> {
  return sdkCall<ComprasHistoricoPreco>(db.from('compras_historico_preco').insert(h).select().single())
}

// ── Agente Analítico de Compras — Auditoria ──────────────────

export async function fetchComprasAuditoria(loja?: string): Promise<ComprasAuditoria[]> {
  let q = db.from('compras_auditoria').select('*').order('data_compra', { ascending: false }).order('created_at', { ascending: false })
  if (loja && loja !== 'Todas as Lojas') q = q.eq('loja', loja)
  return sdkCall<ComprasAuditoria[]>(q).then(d => d ?? [])
}

export async function insertComprasAuditoria(a: Omit<ComprasAuditoria, 'id' | 'created_at'>): Promise<ComprasAuditoria> {
  return sdkCall<ComprasAuditoria>(db.from('compras_auditoria').insert(a).select().single())
}

export async function updateComprasAuditoria(id: string, a: Partial<ComprasAuditoria>): Promise<ComprasAuditoria> {
  return sdkCall<ComprasAuditoria>(db.from('compras_auditoria').update(a).eq('id', id).select().single())
}

// ── Agente Analítico de Compras — Justificativas ─────────────

export async function fetchComprasJustificativas(auditoriaId?: string): Promise<ComprasJustificativa[]> {
  let q = db.from('compras_justificativas').select('*').order('created_at', { ascending: false })
  if (auditoriaId) q = q.eq('auditoria_id', auditoriaId)
  return sdkCall<ComprasJustificativa[]>(q).then(d => d ?? [])
}

export async function insertComprasJustificativa(j: Omit<ComprasJustificativa, 'id' | 'created_at'>): Promise<ComprasJustificativa> {
  return sdkCall<ComprasJustificativa>(db.from('compras_justificativas').insert(j).select().single())
}

export async function updateComprasJustificativa(id: string, j: Partial<ComprasJustificativa>): Promise<ComprasJustificativa> {
  return sdkCall<ComprasJustificativa>(db.from('compras_justificativas').update(j).eq('id', id).select().single())
}

// ── Registro + análise automática de compra ──────────────────

export async function registrarEAnalisarCompra(opts: {
  produto_nome: string
  categoria?: string | null
  fornecedor_nome?: string | null
  comprador_nome?: string | null
  quantidade: number
  unidade: string
  preco_atual: number
  loja: string
  data_compra: string
  lista_id?: string | null
  item_id?: string | null
}): Promise<{ historico: ComprasHistoricoPreco; auditoria?: ComprasAuditoria }> {
  // 1. Save price history
  const historico = await insertComprasHistoricoPreco({
    produto_nome:    opts.produto_nome,
    categoria:       opts.categoria ?? null,
    fornecedor_nome: opts.fornecedor_nome ?? null,
    preco_unitario:  opts.preco_atual,
    quantidade:      opts.quantidade,
    unidade:         opts.unidade,
    comprador_nome:  opts.comprador_nome ?? null,
    loja:            opts.loja,
    data_compra:     opts.data_compra,
    lista_id:        opts.lista_id ?? null,
    item_id:         opts.item_id ?? null,
    obs:             null,
  })

  // 2. Fetch historical prices for this product (last 90 days, same loja)
  const historico90d = await sdkCall<ComprasHistoricoPreco[]>(
    db.from('compras_historico_preco')
      .select('*')
      .eq('loja', opts.loja)
      .ilike('produto_nome', opts.produto_nome)
      .neq('id', historico.id)           // exclude current
      .gte('data_compra', new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString().slice(0, 10))
      .order('data_compra', { ascending: false })
      .limit(50)
  ).catch(() => [] as ComprasHistoricoPreco[])

  if (!historico90d.length) return { historico }

  const precos = historico90d.map(h => h.preco_unitario)
  const preco_anterior = historico90d[0].preco_unitario   // most recent
  const preco_medio = precos.reduce((s, p) => s + p, 0) / precos.length
  const preco_menor = Math.min(...precos)
  const preco_maior = Math.max(...precos)
  const variacao_pct = preco_anterior > 0
    ? ((opts.preco_atual - preco_anterior) / preco_anterior) * 100
    : 0

  // 3. Determine alert level
  let nivel_alerta: ComprasAuditoria['nivel_alerta'] = 'normal'
  let status: ComprasAuditoria['status'] = 'ok'

  if (variacao_pct > 15) {
    nivel_alerta = 'alto'
    status = 'pendente_justificativa'
  } else if (variacao_pct > 5) {
    nivel_alerta = 'medio'
    status = 'pendente_justificativa'
  } else if (variacao_pct > 0) {
    nivel_alerta = 'baixo'
    status = 'ok'
  }

  if (nivel_alerta === 'normal') return { historico }

  // 4. Create audit record
  const auditoria = await insertComprasAuditoria({
    lista_id:        opts.lista_id ?? null,
    item_id:         opts.item_id ?? null,
    produto_nome:    opts.produto_nome,
    categoria:       opts.categoria ?? null,
    fornecedor_nome: opts.fornecedor_nome ?? null,
    comprador_nome:  opts.comprador_nome ?? null,
    quantidade:      opts.quantidade,
    unidade:         opts.unidade,
    preco_atual:     opts.preco_atual,
    preco_anterior,
    preco_medio:     Math.round(preco_medio * 10000) / 10000,
    preco_menor,
    preco_maior,
    variacao_pct:    Math.round(variacao_pct * 100) / 100,
    nivel_alerta,
    status,
    loja:            opts.loja,
    data_compra:     opts.data_compra,
  }).catch(e => { console.error('audit insert', e); return undefined })

  return { historico, auditoria }
}

// ── Pesquisa de Mercado (Google Custom Search) ────────────────

export async function fetchComprasPesquisaMercado(
  loja?: string,
  produto?: string,
): Promise<ComprasPesquisaMercado[]> {
  let q = db.from('compras_pesquisa_mercado').select('*').order('data_pesquisa', { ascending: false }).limit(200)
  if (loja)    q = q.eq('loja', loja)
  if (produto) q = q.ilike('produto_nome', `%${produto}%`)
  return sdkCall<ComprasPesquisaMercado[]>(q)
}

export async function insertComprasPesquisaMercado(
  p: Omit<ComprasPesquisaMercado, 'id' | 'created_at'>,
): Promise<ComprasPesquisaMercado> {
  return sdkCall<ComprasPesquisaMercado>(
    db.from('compras_pesquisa_mercado').insert(p).select().single()
  )
}

export async function deleteComprasPesquisaMercado(id: string): Promise<void> {
  await sdkCall<null>(db.from('compras_pesquisa_mercado').delete().eq('id', id))
}

// ── Lista de Compras Padronizada ─────────────────────────────

export async function fetchListasPadrao(loja: string): Promise<ListaPadrao[]> {
  return sdkCall<ListaPadrao[]>(
    db.from('lista_padrao')
      .select('*, itens:lista_padrao_itens(*)')
      .eq('loja', loja)
      .order('created_at', { ascending: false })
      .limit(200),
  ).then(d => d ?? []).catch(() => [])
}

export async function insertListaPadrao(l: Omit<ListaPadrao, 'id' | 'created_at' | 'updated_at' | 'itens'>): Promise<ListaPadrao> {
  return sdkCall<ListaPadrao>(db.from('lista_padrao').insert(l).select().single())
}

export async function updateListaPadrao(id: string, upd: Partial<Omit<ListaPadrao, 'id' | 'created_at' | 'itens'>>): Promise<void> {
  await sdkCall<null>(db.from('lista_padrao').update({ ...upd, updated_at: new Date().toISOString() }).eq('id', id))
}

export async function deleteListaPadrao(id: string): Promise<void> {
  await sdkCall<null>(db.from('lista_padrao').delete().eq('id', id))
}

export async function insertListaPadraoItem(item: Omit<ListaPadraoItem, 'id' | 'created_at'>): Promise<ListaPadraoItem> {
  return sdkCall<ListaPadraoItem>(db.from('lista_padrao_itens').insert(item).select().single())
}

export async function updateListaPadraoItem(id: string, upd: Partial<ListaPadraoItem>): Promise<void> {
  await sdkCall<null>(db.from('lista_padrao_itens').update(upd).eq('id', id))
}

export async function deleteListaPadraoItem(id: string): Promise<void> {
  await sdkCall<null>(db.from('lista_padrao_itens').delete().eq('id', id))
}

export async function fetchListaHistoricoPrecos(loja: string, produtoNome?: string): Promise<ListaHistoricoPreco[]> {
  let q = db.from('lista_historico_precos').select('*').eq('loja', loja).order('created_at', { ascending: false }).limit(500)
  if (produtoNome) q = q.ilike('produto_nome', `%${produtoNome}%`)
  return sdkCall<ListaHistoricoPreco[]>(q).then(d => d ?? []).catch(() => [])
}

export async function insertListaHistoricoPreco(h: Omit<ListaHistoricoPreco, 'id' | 'created_at'>): Promise<void> {
  await sdkCall<null>(db.from('lista_historico_precos').insert(h))
}

// ── Ata de Reunião ────────────────────────────────────────────

export async function fetchAtas(loja: string): Promise<AtaReuniao[]> {
  let q = db.from('atas_reuniao')
    .select('*, acoes:atas_acoes(*)')
    .order('data_reuniao', { ascending: false })
    .limit(200)
  // "Todas as Lojas" (admin) → sem filtro de loja: retorna as atas de todas as unidades
  if (loja && loja !== 'Todas as Lojas') q = q.eq('loja', loja)
  return sdkCall<AtaReuniao[]>(q).then(d => d ?? []).catch(() => [])
}

export async function insertAta(a: Omit<AtaReuniao, 'id' | 'created_at' | 'updated_at' | 'acoes'>): Promise<AtaReuniao> {
  return sdkCall<AtaReuniao>(db.from('atas_reuniao').insert(a).select().single())
}

export async function updateAta(id: string, upd: Partial<Omit<AtaReuniao, 'id' | 'created_at' | 'acoes'>>): Promise<void> {
  await sdkCall<null>(db.from('atas_reuniao').update({ ...upd, updated_at: new Date().toISOString() }).eq('id', id))
}

export async function deleteAta(id: string): Promise<void> {
  await sdkCall<null>(db.from('atas_reuniao').delete().eq('id', id))
}

export async function insertAtaAcao(a: Omit<AtaAcao, 'id' | 'created_at'>): Promise<AtaAcao> {
  return sdkCall<AtaAcao>(db.from('atas_acoes').insert(a).select().single())
}

export async function updateAtaAcao(id: string, upd: Partial<AtaAcao>): Promise<void> {
  await sdkCall<null>(db.from('atas_acoes').update(upd).eq('id', id))
}

export async function deleteAtaAcao(id: string): Promise<void> {
  await sdkCall<null>(db.from('atas_acoes').delete().eq('id', id))
}

// ── Planejamento Operacional ─────────────────────────────────

export async function fetchPlanejamentoEventos(loja: string, mesRef?: string): Promise<PlanejamentoEvento[]> {
  let q = db.from('planejamento_eventos').select('*').eq('loja', loja).order('data_inicio', { ascending: true }).limit(500)
  if (mesRef) {
    const [y, m] = mesRef.split('-')
    const start = `${y}-${m}-01`
    const end   = new Date(+y, +m, 0).toISOString().slice(0, 10)
    q = q.gte('data_inicio', start).lte('data_inicio', end)
  }
  return sdkCall<PlanejamentoEvento[]>(q).then(d => d ?? []).catch(() => [])
}

export async function insertPlanejamentoEvento(e: Omit<PlanejamentoEvento, 'id' | 'created_at' | 'updated_at'>): Promise<PlanejamentoEvento> {
  return sdkCall<PlanejamentoEvento>(db.from('planejamento_eventos').insert(e).select().single())
}

export async function updatePlanejamentoEvento(id: string, upd: Partial<Omit<PlanejamentoEvento, 'id' | 'created_at'>>): Promise<void> {
  await sdkCall<null>(db.from('planejamento_eventos').update({ ...upd, updated_at: new Date().toISOString() }).eq('id', id))
}

export async function deletePlanejamentoEvento(id: string): Promise<void> {
  await sdkCall<null>(db.from('planejamento_eventos').delete().eq('id', id))
}

export async function fetchPlanejamentoMetas(loja: string, periodoRef?: string): Promise<PlanejamentoMeta[]> {
  let q = db.from('planejamento_metas').select('*').eq('loja', loja).order('created_at', { ascending: false }).limit(200)
  if (periodoRef) q = q.eq('periodo_ref', periodoRef)
  return sdkCall<PlanejamentoMeta[]>(q).then(d => d ?? []).catch(() => [])
}

export async function insertPlanejamentoMeta(m: Omit<PlanejamentoMeta, 'id' | 'created_at' | 'updated_at'>): Promise<PlanejamentoMeta> {
  return sdkCall<PlanejamentoMeta>(db.from('planejamento_metas').insert(m).select().single())
}

export async function updatePlanejamentoMeta(id: string, upd: Partial<Omit<PlanejamentoMeta, 'id' | 'created_at'>>): Promise<void> {
  await sdkCall<null>(db.from('planejamento_metas').update({ ...upd, updated_at: new Date().toISOString() }).eq('id', id))
}

export async function deletePlanejamentoMeta(id: string): Promise<void> {
  await sdkCall<null>(db.from('planejamento_metas').delete().eq('id', id))
}

// ── Enxoval Operacional ──────────────────────────────────────

export async function fetchEnxovalItens(loja: string): Promise<EnxovalItem[]> {
  return sdkCall<EnxovalItem[]>(
    db.from('enxoval_itens').select('*').eq('loja', loja).order('nome', { ascending: true }),
  ).then(d => d ?? []).catch(() => [])
}

export async function insertEnxovalItem(item: Omit<EnxovalItem, 'id' | 'created_at' | 'updated_at'>): Promise<EnxovalItem> {
  return sdkCall<EnxovalItem>(db.from('enxoval_itens').insert(item).select().single())
}

export async function updateEnxovalItem(id: string, upd: Partial<Omit<EnxovalItem, 'id' | 'created_at'>>): Promise<void> {
  await sdkCall<null>(db.from('enxoval_itens').update({ ...upd, updated_at: new Date().toISOString() }).eq('id', id))
}

export async function deleteEnxovalItem(id: string): Promise<void> {
  await sdkCall<null>(db.from('enxoval_itens').delete().eq('id', id))
}

export async function fetchEnxovalMovimentacoes(loja: string, limit = 300): Promise<EnxovalMovimentacao[]> {
  return sdkCall<EnxovalMovimentacao[]>(
    db.from('enxoval_movimentacoes')
      .select('*, item:enxoval_itens(*)')
      .eq('loja', loja)
      .order('created_at', { ascending: false })
      .limit(limit),
  ).then(d => d ?? []).catch(() => [])
}

export async function insertEnxovalMovimentacao(m: Omit<EnxovalMovimentacao, 'id' | 'created_at' | 'item'>): Promise<EnxovalMovimentacao> {
  return sdkCall<EnxovalMovimentacao>(db.from('enxoval_movimentacoes').insert(m).select().single())
}

export async function updateEnxovalMovimentacao(id: string, upd: Partial<Omit<EnxovalMovimentacao, 'id' | 'created_at' | 'item'>>): Promise<void> {
  await sdkCall<null>(db.from('enxoval_movimentacoes').update(upd).eq('id', id))
}

export async function deleteEnxovalMovimentacao(id: string): Promise<void> {
  await sdkCall<null>(db.from('enxoval_movimentacoes').delete().eq('id', id))
}

// ── Alertas & Rastreabilidade ─────────────────────────────────────

export async function insertActivityLog(entry: Omit<ActivityLog, 'id' | 'created_at'>): Promise<void> {
  sdkCall<null>(db.from('audit_log').insert(entry)).catch(() => {}) // fire-and-forget
}

export async function fetchActivityLog(loja: string, limit = 200): Promise<ActivityLog[]> {
  return sdkCall<ActivityLog[]>(
    db.from('audit_log').select('*').eq('loja', loja).order('created_at', { ascending: false }).limit(limit)
  ).then(d => d ?? []).catch(() => [])
}

export async function fetchAlertasConfig(loja: string): Promise<AlertasConfig[]> {
  return sdkCall<AlertasConfig[]>(
    db.from('alertas_config').select('*').eq('loja', loja)
  ).then(d => d ?? []).catch(() => [])
}

export async function upsertAlertasConfig(loja: string, tipo: string, data: { ativo: boolean; threshold: number }): Promise<void> {
  const token = await getToken()
  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/alertas_config`,
      {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal,resolution=merge-duplicates',
        },
        body: JSON.stringify({ loja, tipo, ...data, updated_at: new Date().toISOString() }),
      },
    )
  } finally { clearTimeout(timer) }
}

// Alert-specific queries
export async function fetchTarefasAtrasadas(loja: string): Promise<Tarefa[]> {
  const hoje = new Date().toISOString().slice(0, 10)
  return sdkCall<Tarefa[]>(
    db.from('tarefas').select('*').eq('loja', loja).lt('prazo', hoje).order('prazo', { ascending: true }).limit(50)
  ).then(d => (d ?? []).filter((t: Tarefa) => t.status !== 'concluido' && t.status !== 'cancelado')).catch(() => [])
}

export async function fetchAtaAcoesAtrasadas(loja: string): Promise<(AtaAcao & { ata_titulo?: string })[]> {
  const hoje = new Date().toISOString().slice(0, 10)
  return sdkCall<(AtaAcao & { ata?: { titulo: string } })[]>(
    db.from('atas_acoes')
      .select('*, ata:atas_reuniao(titulo)')
      .eq('loja', loja)
      .lt('prazo', hoje)
      .order('prazo', { ascending: true })
      .limit(50)
  ).then(d =>
    (d ?? [])
      .filter(a => a.status !== 'concluido' && a.status !== 'cancelado')
      .map(a => ({ ...a, ata_titulo: a.ata?.titulo }))
  ).catch(() => [])
}

// ════════════════════════════════════════════════════════════════
// ASI — AmoreFood Supply Intelligence (Fase 1: NF-e)
// ════════════════════════════════════════════════════════════════

export interface NotaFiscal {
  id: string; loja: string; fornecedor_id?: string | null; fornecedor_nome?: string
  fornecedor_cnpj?: string; numero?: string; serie?: string; chave_nfe?: string
  data_emissao?: string; valor_produtos: number; valor_impostos: number; valor_total: number
  forma_pagamento?: string; status: string; observacoes?: string; created_at?: string
}
export interface NotaItem {
  id: string; nota_id: string; loja: string; produto_id?: string | null; descricao: string
  ncm?: string; cfop?: string; unidade: string; quantidade: number; valor_unitario: number
  valor_total: number; qtd_recebida?: number | null; status_item: string; divergencia?: string
}
export interface HistoricoPreco {
  id: string; loja: string; descricao: string; fornecedor_nome?: string; unidade: string
  preco_unitario: number; data: string; nota_id?: string
}
export interface ContaPagar {
  id: string; loja: string; fornecedor_nome?: string; nota_id?: string; descricao?: string
  valor: number; vencimento?: string; forma_pagamento?: string; status: string; pago_em?: string
}

export async function fetchNotasFiscais(loja?: string): Promise<NotaFiscal[]> {
  return sdkCall<NotaFiscal[]>(db.from('notas_fiscais').select('*')
    .order('data_emissao', { ascending: false }).order('created_at', { ascending: false }))
    .then(r => (r || []).filter(n => !loja || loja === 'Todas as Lojas' || loja === 'all' || n.loja === loja))
}

export async function fetchNotaItens(notaId: string): Promise<NotaItem[]> {
  return sdkCall<NotaItem[]>(db.from('nf_itens').select('*').eq('nota_id', notaId).order('descricao'))
}

export async function fetchTodosNfItens(loja: string): Promise<NotaItem[]> {
  return sdkCall<NotaItem[]>(db.from('nf_itens').select('*').eq('loja', loja).limit(3000))
}

export async function fetchHistoricoPrecos(loja: string, descricao?: string): Promise<HistoricoPreco[]> {
  let q = db.from('historico_precos').select('*').eq('loja', loja)
  if (descricao) q = q.ilike('descricao', descricao)
  return sdkCall<HistoricoPreco[]>(q.order('data', { ascending: false }).limit(500))
}

export async function fetchContasPagar(loja?: string): Promise<ContaPagar[]> {
  return sdkCall<ContaPagar[]>(db.from('contas_pagar').select('*').order('vencimento', { ascending: true }))
    .then(r => (r || []).filter(c => !loja || loja === 'Todas as Lojas' || loja === 'all' || c.loja === loja))
}

export async function pagarConta(id: string): Promise<void> {
  await sdkCall(db.from('contas_pagar').update({ status: 'pago', pago_em: new Date().toISOString().slice(0, 10) }).eq('id', id).select())
}

// Importa uma NF-e (parseada): cria nota + itens + histórico de preços + conta a pagar
export async function importarNotaFiscal(parsed: NFeParsed, loja: string, usuario: string): Promise<NotaFiscal> {
  // 1. duplicidade por chave
  if (parsed.chave) {
    const exist = await sdkCall<{ id: string }[]>(db.from('notas_fiscais').select('id').eq('chave_nfe', parsed.chave).limit(1))
    if (exist && exist.length) throw new Error('Esta nota já foi importada (chave duplicada).')
  }
  // 2. fornecedor (casa por CNPJ ou cria)
  let fornecedor_id: string | null = null
  let prazo = 30
  try {
    const forns = await fetchFornecedores(loja)
    const m = (forns || []).find(f => (f.cnpj || '').replace(/\D/g, '') === (parsed.fornecedorCnpj || '').replace(/\D/g, '') && parsed.fornecedorCnpj)
    if (m) { fornecedor_id = m.id; prazo = m.prazo_pagamento || 30 }
    else if (parsed.fornecedorNome) {
      const novo = await insertFornecedor({ loja, nome: parsed.fornecedorNome, cnpj: parsed.fornecedorCnpj, forma_pagamento: 'boleto', prazo_pagamento: 30, ativo: true } as any)
      fornecedor_id = novo.id
    }
  } catch { /* segue sem fornecedor */ }

  // 3. cabeçalho da nota
  const nota = await sdkCall<NotaFiscal>(db.from('notas_fiscais').insert({
    loja, fornecedor_id, fornecedor_nome: parsed.fornecedorNome, fornecedor_cnpj: parsed.fornecedorCnpj,
    numero: parsed.numero, serie: parsed.serie, chave_nfe: parsed.chave || null, data_emissao: parsed.dataEmissao || null,
    valor_produtos: parsed.valorProdutos, valor_impostos: parsed.valorImpostos, valor_total: parsed.valorTotal,
    forma_pagamento: parsed.formaPagamento, status: 'pendente_recebimento', created_by: usuario,
  }).select().single())

  // 4. itens
  if (parsed.itens.length) {
    await sdkCall(db.from('nf_itens').insert(parsed.itens.map(it => ({
      nota_id: nota.id, loja, descricao: it.descricao, ncm: it.ncm, cfop: it.cfop, unidade: it.unidade,
      quantidade: it.quantidade, valor_unitario: it.valorUnitario, valor_total: it.valorTotal, status_item: 'pendente',
    }))).select())
    // 5. histórico de preços
    await sdkCall(db.from('historico_precos').insert(parsed.itens.map(it => ({
      loja, descricao: it.descricao, fornecedor_id, fornecedor_nome: parsed.fornecedorNome, unidade: it.unidade,
      preco_unitario: it.valorUnitario, data: parsed.dataEmissao || new Date().toISOString().slice(0, 10), nota_id: nota.id,
    }))).select())
  }

  // 6. conta a pagar (vencimento = emissão + prazo)
  const base = parsed.dataEmissao ? new Date(parsed.dataEmissao + 'T00:00:00') : new Date()
  base.setDate(base.getDate() + prazo)
  await sdkCall(db.from('contas_pagar').insert({
    loja, fornecedor_id, fornecedor_nome: parsed.fornecedorNome, nota_id: nota.id,
    descricao: `NF ${parsed.numero} — ${parsed.fornecedorNome}`, valor: parsed.valorTotal,
    vencimento: base.toISOString().slice(0, 10), forma_pagamento: parsed.formaPagamento, status: 'aberto',
  }).select())

  return nota
}

// Lançamento MANUAL (recibo / nota de balcão / sem XML) — reaproveita o fluxo da NF
export async function lancarNotaManual(input: {
  loja: string; usuario: string; fornecedor_nome: string; fornecedor_cnpj?: string
  numero?: string; data_emissao: string; forma_pagamento?: string; tipo: 'recibo' | 'balcao' | 'manual'
  itens: { descricao: string; unidade: string; quantidade: number; valor_unitario: number }[]
}): Promise<NotaFiscal> {
  const total = input.itens.reduce((s, i) => s + (i.quantidade || 0) * (i.valor_unitario || 0), 0)
  const parsed: NFeParsed = {
    chave: '', numero: input.numero || `${input.tipo.toUpperCase()}-${Date.now().toString().slice(-6)}`, serie: '',
    dataEmissao: input.data_emissao, fornecedorCnpj: input.fornecedor_cnpj || '', fornecedorNome: input.fornecedor_nome,
    valorProdutos: total, valorImpostos: 0, valorTotal: total, formaPagamento: input.forma_pagamento || 'A definir',
    itens: input.itens.map(i => ({ descricao: i.descricao, ncm: '', cfop: '', unidade: i.unidade, quantidade: i.quantidade, valorUnitario: i.valor_unitario, valorTotal: i.quantidade * i.valor_unitario })),
  }
  const nota = await importarNotaFiscal(parsed, input.loja, input.usuario)
  const rotulo = input.tipo === 'recibo' ? 'Recibo' : input.tipo === 'balcao' ? 'Nota de balcão' : 'Lançamento manual'
  await sdkCall(db.from('notas_fiscais').update({ observacoes: rotulo }).eq('id', nota.id).select())
  return { ...nota, observacoes: rotulo }
}

// Recebe a nota CONFORME: dá entrada de todos os itens no estoque
export async function receberNotaConforme(nota: NotaFiscal, usuario: string): Promise<void> {
  const itens = await fetchNotaItens(nota.id)
  for (const it of itens) {
    await darEntradaEstoquePorNome({
      nome: it.descricao, loja: nota.loja, quantidade: it.quantidade, preco: it.valor_unitario,
      unidade: it.unidade, motivo: `Entrada NF ${nota.numero || ''}`, usuario,
    }).catch(e => console.error('entrada estoque', it.descricao, e))
    await sdkCall(db.from('nf_itens').update({ status_item: 'conforme', qtd_recebida: it.quantidade }).eq('id', it.id).select())
  }
  await sdkCall(db.from('notas_fiscais').update({ status: 'recebido', updated_at: new Date().toISOString() }).eq('id', nota.id).select())
}

// Registra DIVERGÊNCIA (não lança no estoque até aprovação)
export async function registrarDivergenciaNota(nota: NotaFiscal, tipo: string, descricao: string, usuario: string): Promise<void> {
  await sdkCall(db.from('nf_ocorrencias').insert({ nota_id: nota.id, loja: nota.loja, tipo, descricao, created_by: usuario }).select())
  await sdkCall(db.from('notas_fiscais').update({ status: 'divergencia', updated_at: new Date().toISOString() }).eq('id', nota.id).select())
}
