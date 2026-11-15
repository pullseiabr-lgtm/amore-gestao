import { supabase } from '../../lib/supabase'
import { fetchAppConfig, saveAppConfig } from '../../lib/db'

// Tabelas ali_* ainda não estão em types/database.ts → cliente destipado (como em Plantão/Transferências)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const sb = supabase as any

export const TIPOS = ['Colaborador Amore', 'Terceirizado / Prestador', 'Visitante', 'Fornecedor', 'Outros']
export const TIPOS_COM_EMPRESA = ['Terceirizado / Prestador', 'Fornecedor', 'Visitante', 'Outros']

export type Solicitacao = {
  id: string; numero: number; loja: string; data_hora: string; nome: string; tipo_solicitante: string; empresa: string | null
  responsavel: string | null; motivo: string | null; prato_solicitado: string | null; obs: string | null
  status: 'aguardando' | 'aprovada' | 'recusada' | 'cancelada' | 'concluida'
  solicitado_por: string | null; decidido_por: string | null; decidido_em: string | null; motivo_recusa: string | null
  cancelado_por: string | null; cancelado_em: string | null; justificativa_cancel: string | null; created_at: string
}
export type Ingrediente = { nome: string; qtd: number; unidade: string }
export type Adicional = { nome: string; custo: number }
export type Prato = { id: string; nome: string; ficha_id: string | null; custo: number | null; ingredientes: Ingrediente[]; adicionais: Adicional[]; ativo: boolean }
export type Ticket = {
  id: string; numero: number; codigo: string; solicitacao_id: string; loja: string; prato_id: string | null; prato_nome: string; qtd: number
  adicionais: Adicional[]; ingredientes: Ingrediente[]; custo_unit: number; custo_total: number; obs_cozinha: string | null; autorizado_por: string
  emitido_em: string; status: 'emitido' | 'entregue' | 'cancelado'; impresso_em: string | null; impressoes: number
  entregue_em: string | null; entregue_por: string | null; cancelado_em: string | null; justificativa_cancel: string | null
}
export type Consumo = { id: string; ticket_id: string; loja: string; prato_nome: string; qtd: number; custo_total: number; categoria: string; itens: { nome: string; qtd: number; unidade: string; baixado: boolean; saldo_antes: number | null; saldo_depois: number | null }[]; registrado_por: string; created_at: string }
export type Auditoria = { id: string; ref_tipo: string; ref_id: string; acao: string; antes: unknown; depois: unknown; detalhe: string | null; por: string; em: string }

export type Perfil = 'solicitante' | 'gestor' | 'cozinha' | 'estoque' | 'administrativo' | 'admin'
export const PERFIS: { id: Perfil; label: string }[] = [
  { id: 'solicitante', label: 'Solicitante' }, { id: 'gestor', label: 'Gestor' }, { id: 'cozinha', label: 'Cozinha' },
  { id: 'estoque', label: 'Estoque' }, { id: 'administrativo', label: 'Administrativo' }, { id: 'admin', label: 'Administrador do sistema' },
]
export type AliConfig = { impressoras: Record<string, string>; perfis: Record<string, Perfil[]>; empresas: string[]; motivos: string[] }
export const CONFIG_PADRAO: AliConfig = { impressoras: {}, perfis: {}, empresas: [], motivos: ['Refeição de trabalho', 'Serviço prestado na loja', 'Visita / reunião', 'Cortesia da gestão'] }
export async function carregarConfig(): Promise<AliConfig> {
  const c = await fetchAppConfig<Partial<AliConfig>>('ali_config')
  return { ...CONFIG_PADRAO, ...(c || {}), impressoras: { ...(c?.impressoras || {}) }, perfis: { ...(c?.perfis || {}) } }
}
export const salvarConfig = (c: AliConfig) => saveAppConfig('ali_config', c)

export const STATUS_SOL: Record<string, { label: string; cor: string }> = {
  aguardando: { label: 'Aguardando aprovação', cor: '#ca8a04' }, aprovada: { label: 'Aprovada — aguardando retirada', cor: '#2563eb' },
  recusada: { label: 'Recusada', cor: '#dc2626' }, cancelada: { label: 'Cancelada', cor: '#6b7280' }, concluida: { label: 'Entregue', cor: '#16a34a' },
}

export const fmtDH = (d: string | null | undefined) => d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'
export const hojeISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) }
export const addDiasISO = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) }
export const brl = (n: number | null | undefined) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const norm = (s: string | null | undefined) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
export const isoLocal = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)

export function parseNum(v: string | number): number {
  if (typeof v === 'number') return v
  const n = parseFloat(String(v).replace(/\./g, '').replace(',', '.'))
  return isNaN(n) ? 0 : n
}

export function rpcErro(e: unknown): string {
  const m = (e as { message?: string })?.message || String(e)
  return m.replace(/^.*?ERROR:\s*/, '')
}

/** Busca paginada (PostgREST limita 1000 linhas por request). */
export async function buscarTudo<T>(montar: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < 20; i++) {
    const { data, error } = await montar(i * 1000, i * 1000 + 999)
    if (error) throw error
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return out
}

export function csv(linhas: (string | number)[][], nome: string) {
  const esc = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const txt = '﻿' + linhas.map(l => l.map(esc).join(';')).join('\r\n')
  const url = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a'); a.href = url; a.download = nome; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000)
}
