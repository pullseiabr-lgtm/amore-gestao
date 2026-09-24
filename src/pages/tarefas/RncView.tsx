import { useState, useEffect, useCallback, useMemo } from 'react'
import type { CSSProperties } from 'react'
import { Plus, X, Loader2 } from 'lucide-react'
import { useLoja } from '../../contexts/LojaContext'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { fetchProfiles, insertTarefa, uploadAnexo } from '../../lib/db'
import { enviarWhatsApp } from '../../lib/notify'
import { siteOrigin } from '../../lib/site'
import { AnexoUploader, AnexoLinks } from '../../components/ui/AnexoUploader'

// Tabelas rnc / rnc_evidencias / rnc_historico ainda não estão em types/database.ts → cliente destipado
const sb = supabase as any

// ── Constantes de domínio ────────────────────────────────────
const TIPOS = ['Não conformidade de produto', 'Divergência no recebimento', 'Pedido de compra em desacordo', 'Produto recebido incorretamente', 'Avaria/dano', 'Quantidade divergente', 'Produto diferente do solicitado', 'Problema de embalagem', 'Outros']
const CATEGORIAS = ['Produto', 'Quantidade', 'Qualidade', 'Documental', 'Embalagem', 'Prazo/Validade', 'Especificação', 'Pedido de compra']
const GRAVIDADES = [
  { id: 'baixa', label: 'Baixa', emoji: '🟢', cor: '#16a34a' },
  { id: 'media', label: 'Média', emoji: '🟡', cor: '#ca8a04' },
  { id: 'alta', label: 'Alta', emoji: '🟠', cor: '#ea580c' },
  { id: 'critica', label: 'Crítica', emoji: '🔴', cor: '#dc2626' },
]
const TRATATIVAS = ['Recebimento integral', 'Recebimento parcial', 'Recebimento com ressalva', 'Produto segregado', 'Produto devolvido', 'Pedido recusado', 'Substituição solicitada', 'Complemento solicitado', 'Crédito/abatimento solicitado', 'Aguardando fornecedor']
const STATUS: { id: string; label: string; emoji: string; cor: string }[] = [
  { id: 'aberta', label: 'Aberta', emoji: '🔴', cor: '#dc2626' },
  { id: 'em_analise', label: 'Em análise', emoji: '🟠', cor: '#ea580c' },
  { id: 'aguardando_fornecedor', label: 'Aguardando fornecedor', emoji: '🟡', cor: '#ca8a04' },
  { id: 'em_tratativa', label: 'Em tratativa', emoji: '🔵', cor: '#2563eb' },
  { id: 'resolvida', label: 'Resolvida', emoji: '🟢', cor: '#16a34a' },
  { id: 'encerrada', label: 'Encerrada', emoji: '⚫', cor: '#374151' },
]
const EVID_TIPOS = ['Foto do produto', 'Foto da embalagem', 'Foto da etiqueta/lote', 'Nota Fiscal', 'Pedido de Compra', 'Documento complementar']
const AREAS = ['Compras', 'Recebimento', 'Estoque', 'Cozinha', 'Produção', 'Financeiro', 'Administrativo', 'Operação', 'Qualidade', 'Diretoria', 'Geral']
const RESULTADOS = [{ id: 'resolvido', label: 'Resolvido' }, { id: 'parcial', label: 'Resolvido parcialmente' }, { id: 'nao_resolvido', label: 'Não resolvido' }]

const LABELS: Record<string, string> = {
  loja: 'Unidade', setor: 'Área', centro_custo: 'Centro de custo', tipos: 'Tipos', categoria: 'Categoria', gravidade: 'Gravidade', status: 'Status',
  fornecedor: 'Fornecedor', nf_numero: 'NF', nf_data: 'Data da NF', data_recebimento: 'Data do recebimento', local_recebimento: 'Local', recebedor: 'Recebedor',
  transportadora: 'Transportadora', produto: 'Produto', lote: 'Lote', unidade: 'Unidade de medida', qtd_solicitada: 'Qtd solicitada', qtd_recebida: 'Qtd recebida',
  valor_produto: 'Valor do produto', solicitado_txt: 'O que foi solicitado', recebido_txt: 'O que foi recebido', desvio_txt: 'Desvio', tratativas: 'Tratativa imediata',
  tratativa_obs: 'Observação da tratativa', responsavel: 'Responsável', responsavel_area: 'Área do responsável', prazo: 'Prazo', causa_provavel: 'Causa provável',
  causa_raiz: 'Causa raiz', causa_area: 'Área da causa', causa_evidencias: 'Evidências da causa', acao_corretiva: 'Ação corretiva', acao_preventiva: 'Ação preventiva',
  devolucao: 'Devolução', valor_total_afetado: 'Valor total afetado', valor_devolvido: 'Valor devolvido', valor_credito: 'Crédito solicitado', valor_abatimento: 'Abatimento',
  custo_adicional: 'Custo adicional', perda: 'Perda', solucao: 'Solução aplicada', resultado: 'Resultado', eficaz: 'Foi eficaz', necessita_preventiva: 'Necessita ação preventiva',
  evidencia_solucao: 'Evidência da solução', obs_final: 'Observações finais',
}
const NUM_KEYS = new Set(['qtd_solicitada', 'qtd_recebida', 'valor_produto', 'valor_total_afetado', 'valor_devolvido', 'valor_credito', 'valor_abatimento', 'custo_adicional', 'perda'])

// ── Direcionamento: setor + usuário já cadastrados (perfil.__perfil__ = { setor, whatsapp, cargo }) ──
const perfilDe = (p: any) => (p?.permissions_override as any)?.__perfil__ || {}
const setorDe = (p: any) => String(perfilDe(p).setor || '').trim()
const foneOk = (p: any) => !!String(perfilDe(p).whatsapp || '').replace(/\D/g, '')
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const listaSetores = (profiles: any[]) => {
  const m = new Map<string, string>()
  for (const s of [...AREAS, ...profiles.map(setorDe)]) if (s && !m.has(s.toLowerCase())) m.set(s.toLowerCase(), cap(s))
  return Array.from(m.values()).sort((a, b) => a.localeCompare(b))
}
const usuariosDoSetor = (profiles: any[], setor: string) => profiles
  .filter(p => (p.name || '').trim() && (!setor || setorDe(p).toLowerCase() === setor.toLowerCase()))
  .map(p => ({ nome: (p.name as string).trim(), fone: foneOk(p) }))
  .sort((a, b) => a.nome.localeCompare(b.nome))

// ── Helpers ──────────────────────────────────────────────────
const hoje0 = () => new Date(new Date().toDateString()).getTime()
const fmtD = (s?: string | null) => { if (!s) return '—'; const m = String(s).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${m[3]}/${m[2]}/${m[1]}` : '—' }
const fmtDH = (s?: string | null) => s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
const brl = (n: any) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const statusInfo = (id: string) => STATUS.find(s => s.id === id) || STATUS[0]
const gravInfo = (id: string) => GRAVIDADES.find(g => g.id === id) || GRAVIDADES[1]
const encerradaOuResolvida = (r: any) => r.status === 'encerrada' || r.status === 'resolvida'
const diasAtraso = (r: any) => {
  if (!r.prazo || encerradaOuResolvida(r)) return 0
  const d = Math.round((hoje0() - new Date(String(r.prazo).slice(0, 10) + 'T00:00:00').getTime()) / 86400000)
  return d > 0 ? d : 0
}
const diasRestantes = (r: any) => r.prazo ? Math.round((new Date(String(r.prazo).slice(0, 10) + 'T00:00:00').getTime() - hoje0()) / 86400000) : null
const diasAberto = (r: any) => Math.max(0, Math.floor(((r.encerrado_em ? new Date(r.encerrado_em).getTime() : Date.now()) - new Date(r.created_at).getTime()) / 86400000))
const temDevolucao = (r: any) => !!r.devolucao || (r.tratativas || []).includes('Produto devolvido')
const fmtVal = (v: any) => v == null || v === '' ? '—' : Array.isArray(v) ? (v.join(', ') || '—') : typeof v === 'boolean' ? (v ? 'sim' : 'não') : typeof v === 'object' ? 'atualizado' : String(v).slice(0, 140)

// Prazo de tratativa: 4 dias úteis (seg–sex) contados a partir da ciência do responsável
const PRAZO_DIAS_UTEIS = 4
const addDiasUteis = (base: Date, n: number) => {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate())
  let falta = n
  while (falta > 0) { d.setDate(d.getDate() + 1); const w = d.getDay(); if (w !== 0 && w !== 6) falta-- }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const isImg = (u: string) => /\.(jpe?g|png|gif|webp|bmp|heic|avif)(\?|$)/i.test(u) || u.startsWith('blob:')
const splitUrls = (v?: string | null) => String(v || '').split(/\n+/).map(s => s.trim()).filter(s => /^https?:\/\//.test(s))

// Busca pedidos nas DUAS fontes: tabela relacional pedidos_compra e blobs legados app_config (pedido_*).
// A maioria dos pedidos só existe no app_config — por isso a busca antiga não achava/preenchia.
async function buscarPedidos(q: string) {
  const t = q.trim().replace(/[,()*%]/g, ' ').trim()
  if (t.length < 2) return []
  const [rel, leg] = await Promise.all([
    sb.from('pedidos_compra').select('id,numero,fornecedor,loja,total,created_at,app_config_chave').or(`numero.ilike.*${t}*,fornecedor.ilike.*${t}*`).order('created_at', { ascending: false }).limit(15),
    sb.from('app_config').select('chave,valor').like('chave', 'pedido_%').or(`chave.ilike.*${t}*,valor->>numero_pedido.ilike.*${t}*,valor->>fornecedor.ilike.*${t}*`).limit(30),
  ])
  const out: any[] = (rel.data || []).map((c: any) => ({ id: c.id, chave: c.app_config_chave, numero: c.numero, fornecedor: c.fornecedor, loja: c.loja, total: c.total, data: String(c.created_at).slice(0, 10) }))
  const chaves = new Set(out.map(o => o.chave).filter(Boolean))
  for (const r of (leg.data || [])) {
    if (chaves.has(r.chave)) continue
    const v = r.valor || {}
    out.push({ id: null, chave: r.chave, numero: v.numero_pedido || null, fornecedor: v.fornecedor, loja: v.loja, total: v.total, data: v.data || String(v.em || '').slice(0, 10) })
  }
  return out.sort((a, b) => String(b.data || '').localeCompare(String(a.data || ''))).slice(0, 20)
}

// Pedido de compra completo (cabeçalho + itens + entrega + quem recebeu) — vira "snapshot" dentro da RNC
async function carregarPC(p: { id?: string | null; chave?: string | null; numero?: string | null }) {
  let cab: any = null
  if (p.id) cab = (await sb.from('pedidos_compra').select('*').eq('id', p.id).maybeSingle()).data
  else if (p.numero) cab = (await sb.from('pedidos_compra').select('*').eq('numero', p.numero).maybeSingle()).data
  const chave: string | null = cab?.app_config_chave || p.chave || null
  let blob: any = {}
  if (chave) blob = (await sb.from('app_config').select('valor').eq('chave', chave).maybeSingle()).data?.valor || {}
  let rel: any[] = []
  if (cab?.id) rel = (await sb.from('pedido_compra_itens').select('*').eq('pedido_id', cab.id).order('created_at')).data || []
  const itensRel = rel.map((it: any) => ({ produto: it.produto_nome, un: it.unidade, qtd: Number(it.qtd_pedida) || 0, qtd_recebida: Number(it.qtd_recebida) || 0, preco: it.preco != null ? Number(it.preco) : null }))
  const itensBlob = (blob.itens || []).map((it: any) => ({ produto: it.produto, un: it.un, qtd: Number(it.qtd) || 0, qtd_recebida: Number(it.qtd_recebida ?? it.recebido ?? 0) || 0, preco: it.preco != null ? Number(it.preco) : null }))
  const itens = itensRel.length ? itensRel : itensBlob
  const numero = cab?.numero || blob.numero_pedido || p.numero || (chave ? chave.replace(/^pedido_/, '') : null)
  const ref = chave ? chave.replace(/^pedido_/, '') : ''
  const filtros = [numero && !String(numero).includes(',') ? `pedido_numero.eq.${numero}` : '', ref ? `pedido_ref.eq.${ref}` : ''].filter(Boolean).join(',')
  const ent = filtros ? ((await sb.from('entregas_agendadas').select('data_prevista,chegada_em,recebido_por,status').or(filtros).limit(1)).data || [])[0] || null : null
  const dataEntrega = (ent?.chegada_em ? String(ent.chegada_em).slice(0, 10) : null) || ent?.data_prevista || blob.janela_entrega || blob.data || null
  const totalItens = itens.reduce((s: number, it: any) => s + (it.preco != null ? it.preco * it.qtd : 0), 0)
  return {
    numero, chave, fornecedor: cab?.fornecedor || blob.fornecedor || null, loja: cab?.loja || blob.loja || null,
    data_pedido: blob.data || (cab?.created_at ? String(cab.created_at).slice(0, 10) : null), data_entrega: dataEntrega, horario_recebimento: blob.horario_recebimento || null,
    recebedor: ent?.recebido_por || blob.recebimento_responsavel || null, pagamento: blob.pagamento || null, criado_por: cab?.criado_por || blob.created_by || null,
    total: Number(cab?.total ?? blob.total ?? totalItens) || totalItens, frete: blob.frete != null ? Number(blob.frete) : null, obs: cab?.observacoes || blob.obs || null,
    status: blob.status || cab?.status || null, requisicao_numero: blob.requisicao_numero || null, itens,
  }
}

// Miniaturas clicáveis: imagem abre em tela cheia, PDF/outros abrem em nova aba
function Galeria({ itens }: { itens: { url: string; rotulo?: string }[] }) {
  const [aberta, setAberta] = useState<string | null>(null)
  if (!itens.length) return null
  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {itens.map((it, i) => isImg(it.url) ? (
          <button key={i} type="button" onClick={() => setAberta(it.url)} title={it.rotulo || 'Abrir foto'} style={{ padding: 0, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', cursor: 'zoom-in', background: 'var(--bg)', width: 96, height: 96 }}>
            <img src={it.url} alt={it.rotulo || 'evidência'} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </button>
        ) : (
          <a key={i} href={it.url} target="_blank" rel="noreferrer" style={{ width: 96, height: 96, border: '1px solid var(--border)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontSize: 11, color: 'var(--bordo)', fontWeight: 700, textDecoration: 'none', padding: 6, boxSizing: 'border-box' }}>📄 {it.rotulo || 'Abrir arquivo'}</a>
        ))}
      </div>
      {aberta && (
        <div onClick={() => setAberta(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.88)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, cursor: 'zoom-out' }}>
          <img src={aberta} alt="evidência" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8 }} />
          <a href={aberta} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ position: 'absolute', top: 14, right: 60, color: '#fff', fontSize: 13, fontWeight: 700 }}>Abrir original ↗</a>
          <button onClick={() => setAberta(null)} style={{ position: 'absolute', top: 10, right: 14, background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}><X size={26} /></button>
        </div>
      )}
    </>
  )
}

// Bloco com todos os dados do pedido de compra que originou a RNC
function PedidoBloco({ pc, abertoPor, direcionadoA, setor }: { pc: any; abertoPor?: string | null; direcionadoA?: string | null; setor?: string | null }) {
  if (!pc) return null
  return (
    <div style={{ ...card, fontSize: 12.5 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--bordo)', marginBottom: 6 }}>📦 PEDIDO DE COMPRA {pc.numero || ''}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 6 }}>
        <div><b>Fornecedor:</b> {pc.fornecedor || '—'}</div>
        <div><b>Unidade:</b> {pc.loja || '—'}</div>
        <div><b>Data do pedido:</b> {fmtD(pc.data_pedido)}</div>
        <div><b>Data da entrega:</b> {fmtD(pc.data_entrega)}{pc.horario_recebimento ? ` · ${pc.horario_recebimento}` : ''}</div>
        <div><b>Quem recebeu:</b> {pc.recebedor || '—'}</div>
        <div><b>Pagamento:</b> {pc.pagamento || '—'}</div>
        <div><b>Pedido feito por:</b> {pc.criado_por || '—'}</div>
        <div><b>Valor do pedido:</b> {brl(pc.total)}{pc.frete ? ` (inclui frete ${brl(pc.frete)})` : ''}</div>
        {pc.status && <div><b>Situação do pedido:</b> {pc.status}</div>}
        {pc.requisicao_numero && <div><b>Requisição:</b> nº {pc.requisicao_numero}</div>}
        {pc.obs && <div style={{ gridColumn: '1 / -1' }}><b>Obs. do pedido:</b> {pc.obs}</div>}
        {abertoPor && <div><b>RNC aberta por:</b> {abertoPor}</div>}
        {direcionadoA && <div><b>Direcionada para tratar:</b> {direcionadoA}{setor ? ` (${setor})` : ''}</div>}
      </div>
      {(pc.itens || []).length > 0 && (
        <div style={{ overflowX: 'auto', marginTop: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr style={{ color: 'var(--muted)', textAlign: 'left' }}>{['Produto', 'Un.', 'Qtd pedida', 'Qtd recebida', 'Preço un.', 'Subtotal'].map(h => <th key={h} style={{ padding: '3px 6px' }}>{h}</th>)}</tr></thead>
            <tbody>{pc.itens.map((it: any, i: number) => (
              <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '4px 6px', fontWeight: 600 }}>{it.produto}</td><td>{it.un || '—'}</td><td>{it.qtd}</td><td>{it.qtd_recebida || '—'}</td>
                <td>{it.preco != null ? brl(it.preco) : '—'}</td><td>{it.preco != null ? brl(it.preco * it.qtd) : '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const inp: CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, boxSizing: 'border-box' }
const lbl: CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 3 }
const card: CSSProperties = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }
const btn = (bg = 'var(--bordo)', disabled = false): CSSProperties => ({ padding: '8px 14px', borderRadius: 8, border: 'none', background: disabled ? 'var(--border)' : bg, color: '#fff', cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 12.5, fontWeight: 600 })

function BarList({ titulo, itens, cor = 'var(--bordo)', fmt }: { titulo: string; itens: { label: string; value: number }[]; cor?: string; fmt?: (n: number) => string }) {
  const max = Math.max(1, ...itens.map(i => i.value))
  return (
    <div style={card}>
      <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>{titulo}</div>
      {itens.length === 0 ? <div style={{ fontSize: 12, color: 'var(--muted)' }}>Sem dados.</div> : itens.map(i => (
        <div key={i.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, fontSize: 11.5 }}>
          <div style={{ width: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }} title={i.label}>{i.label}</div>
          <div style={{ flex: 1, height: 9, background: 'var(--bg)', borderRadius: 5, overflow: 'hidden' }}><div style={{ height: '100%', width: `${Math.max(4, i.value / max * 100)}%`, background: cor, borderRadius: 5 }} /></div>
          <div style={{ width: 54, textAlign: 'right', color: 'var(--muted)' }}>{fmt ? fmt(i.value) : i.value}</div>
        </div>
      ))}
    </div>
  )
}
const contar = (rs: any[], key: (r: any) => string | string[] | null | undefined, top = 6) => {
  const m: Record<string, number> = {}
  for (const r of rs) { const k = key(r); for (const x of (Array.isArray(k) ? k : [k])) if (x) m[x] = (m[x] || 0) + 1 }
  return Object.entries(m).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, top)
}

// ══════════════════════════════════════════════════════════════
// RNC INTERNA — visão dentro da Central de Tarefas
// ══════════════════════════════════════════════════════════════
export default function RncView({ initialId }: { initialId?: string | null }) {
  const { loja, lojas } = useLoja()
  const { user } = useAuth()
  const userName = user?.name || 'Usuário'
  const [rncs, setRncs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [profiles, setProfiles] = useState<any[]>([])
  const [selId, setSelId] = useState<string | null>(initialId || null)
  const [showNova, setShowNova] = useState(false)
  const [showGraf, setShowGraf] = useState(true)
  const [vista, setVista] = useState<'painel' | 'banco'>('painel')
  const [f, setF] = useState({ unidade: '', fornecedor: '', status: '', responsavel: '', categoria: '', tipo: '', de: '', ate: '', atrasadas: false, comDevolucao: false, busca: '' })
  const setFiltro = (patch: Partial<typeof f>) => setF(o => ({ ...o, ...patch }))

  useEffect(() => { fetchProfiles().then(setProfiles).catch(() => {}) }, [])
  const responsaveis = useMemo(() => profiles.filter(p => (p.name || '').trim()).map(p => (p.name as string).trim()).sort((a, b) => a.localeCompare(b)), [profiles])
  const foneDe = useCallback((nome: string) => {
    const p = profiles.find(x => (x.name || '').trim().toLowerCase() === (nome || '').trim().toLowerCase())
    return (((p?.permissions_override as any)?.__perfil__?.whatsapp) || '').replace(/\D/g, '')
  }, [profiles])
  const notificar = useCallback(async (nome: string, msg: string, titulo: string, refId: string) => {
    const phone = foneDe(nome)
    if (!phone) return false
    return enviarWhatsApp(phone, msg, undefined, { tipo: 'compra', modulo: 'rnc', titulo, destinatario_nome: nome, referencia_id: refId, created_by: userName } as any)
  }, [foneDe, userName])

  const load = useCallback(async () => {
    setLoading(true)
    let q = sb.from('rnc').select('*').order('seq', { ascending: false }).limit(1000)
    if (loja && loja !== 'Todas as Lojas') q = q.eq('loja', loja)
    const { data } = await q
    setRncs(data || [])
    setLoading(false)
  }, [loja])
  useEffect(() => { load() }, [load])

  // ── Filtro da lista ──
  const filtradas = useMemo(() => rncs.filter(r => {
    if (f.unidade && r.loja !== f.unidade) return false
    if (f.fornecedor && r.fornecedor !== f.fornecedor) return false
    if (f.status && r.status !== f.status) return false
    if (f.responsavel && r.responsavel !== f.responsavel) return false
    if (f.categoria && r.categoria !== f.categoria) return false
    if (f.tipo && !(r.tipos || []).includes(f.tipo)) return false
    if (f.de && String(r.created_at).slice(0, 10) < f.de) return false
    if (f.ate && String(r.created_at).slice(0, 10) > f.ate) return false
    if (f.atrasadas && !diasAtraso(r)) return false
    if (f.comDevolucao && !temDevolucao(r)) return false
    if (f.busca) {
      const b = f.busca.toLowerCase()
      if (![r.numero, r.fornecedor, r.produto, r.pedido_numero, r.nf_numero, r.lote].some(x => String(x || '').toLowerCase().includes(b))) return false
    }
    return true
  }), [rncs, f])

  // ── Indicadores ──
  const cnt = (id: string) => rncs.filter(r => r.status === id).length
  const nAtraso = rncs.filter(r => diasAtraso(r) > 0).length
  const nDev = rncs.filter(temDevolucao).length
  const encerradas = rncs.filter(r => r.status === 'encerrada' && r.encerrado_em)
  const tempoMedio = encerradas.length ? encerradas.reduce((s, r) => s + diasAberto(r), 0) / encerradas.length : null
  const fornecedores = useMemo(() => {
    const m: Record<string, any[]> = {}
    for (const r of rncs) if (r.fornecedor) (m[r.fornecedor] ||= []).push(r)
    return Object.entries(m).map(([nome, rs]) => {
      const enc = rs.filter(r => r.status === 'encerrada' && r.encerrado_em)
      return {
        nome, total: rs.length,
        qtd: rs.filter(r => r.categoria === 'Quantidade').length,
        qualidade: rs.filter(r => r.categoria === 'Qualidade').length,
        devolucoes: rs.filter(temDevolucao).length,
        impacto: rs.reduce((s, r) => s + (Number(r.perda) || 0) + (Number(r.custo_adicional) || 0), 0),
        tempo: enc.length ? enc.reduce((s, r) => s + diasAberto(r), 0) / enc.length : null,
      }
    }).sort((a, b) => b.total - a.total)
  }, [rncs])
  const porMes = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of rncs) { const k = String(r.created_at).slice(0, 7); m[k] = (m[k] || 0) + 1 }
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0])).slice(-6).map(([k, value]) => ({ label: k.slice(5) + '/' + k.slice(0, 4), value }))
  }, [rncs])

  const selecionada = rncs.find(r => r.id === selId) || null
  const kpis = [
    { lbl: 'RNCs abertas', val: cnt('aberta'), emoji: '🔴', cor: '#dc2626', on: () => setF(o => ({ ...o, status: 'aberta' })) },
    { lbl: 'Em análise', val: cnt('em_analise'), emoji: '🟠', cor: '#ea580c', on: () => setF(o => ({ ...o, status: 'em_analise' })) },
    { lbl: 'Aguardando fornecedor', val: cnt('aguardando_fornecedor'), emoji: '🟡', cor: '#ca8a04', on: () => setF(o => ({ ...o, status: 'aguardando_fornecedor' })) },
    { lbl: 'Em tratativa', val: cnt('em_tratativa'), emoji: '🔵', cor: '#2563eb', on: () => setF(o => ({ ...o, status: 'em_tratativa' })) },
    { lbl: 'Resolvidas', val: cnt('resolvida'), emoji: '🟢', cor: '#16a34a', on: () => setF(o => ({ ...o, status: 'resolvida' })) },
    { lbl: 'Encerradas', val: cnt('encerrada'), emoji: '⚫', cor: '#374151', on: () => setF(o => ({ ...o, status: 'encerrada' })) },
    { lbl: 'Em atraso', val: nAtraso, emoji: '⏰', cor: '#dc2626', on: () => setF(o => ({ ...o, atrasadas: true })) },
    { lbl: 'Devoluções', val: nDev, emoji: '↩️', cor: '#7c3aed', on: () => setF(o => ({ ...o, comDevolucao: true })) },
  ]
  const filtroAtivo = f.status || f.atrasadas || f.comDevolucao

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 800 }}>RNC Internas</div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Controle de não conformidades, tratativas e devoluções.</div>
        </div>
        <button onClick={() => setShowNova(true)} style={{ ...btn(), display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', fontSize: 13 }}><Plus size={14} /> Abrir nova RNC</button>
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        {([['painel', '📋 Painel de RNCs'], ['banco', '🗄️ Banco de dados (respondidas)']] as const).map(([id, nome]) => (
          <button key={id} onClick={() => setVista(id)} style={{ padding: '7px 14px', borderRadius: 20, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', border: '1px solid var(--bordo)', background: vista === id ? 'var(--bordo)' : 'transparent', color: vista === id ? '#fff' : 'var(--bordo)' }}>{nome}</button>
        ))}
      </div>
      {vista === 'banco' && <BancoRnc rncs={rncs} loading={loading} onOpen={(id: string) => setSelId(id)} />}
      {vista === 'painel' && <>
      {/* Indicadores clicáveis */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        {kpis.map(k => (
          <button key={k.lbl} onClick={k.on} style={{ ...card, borderTop: `3px solid ${k.cor}`, padding: '10px 14px', textAlign: 'left', cursor: 'pointer' }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: k.cor, lineHeight: 1.1 }}>{k.val}</div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{k.emoji} {k.lbl}</div>
          </button>
        ))}
      </div>

      {/* Gráficos gerenciais */}
      <div>
        <button onClick={() => setShowGraf(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: 'var(--bordo)', padding: 0, marginBottom: 8 }}>
          {showGraf ? '▾' : '▸'} Gráficos e indicadores gerenciais
        </button>
        {showGraf && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 12 }}>
              <BarList titulo="RNCs por fornecedor" itens={contar(rncs, r => r.fornecedor)} />
              <BarList titulo="RNCs por unidade" itens={contar(rncs, r => r.loja)} cor="#2563eb" />
              <BarList titulo="RNCs por tipo de ocorrência" itens={contar(rncs, r => r.tipos)} cor="#7c3aed" />
              <BarList titulo="RNCs por categoria" itens={contar(rncs, r => r.categoria)} cor="#ea580c" />
              <BarList titulo="RNCs por período (mês)" itens={porMes} cor="#0891b2" />
              <BarList titulo="Abertas × encerradas" itens={[{ label: 'Abertas', value: rncs.length - cnt('encerrada') }, { label: 'Encerradas', value: cnt('encerrada') }]} cor="#374151" />
              <BarList titulo="Principais produtos envolvidos" itens={contar(rncs, r => r.produto)} cor="#16a34a" />
              <BarList titulo="Fornecedores com reincidência (2+)" itens={contar(rncs, r => r.fornecedor, 50).filter(i => i.value >= 2).slice(0, 6)} cor="#dc2626" />
              <div style={card}>
                <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>⏰ RNCs em atraso</div>
                {rncs.filter(r => diasAtraso(r) > 0).sort((a, b) => diasAtraso(b) - diasAtraso(a)).slice(0, 6).map(r => (
                  <div key={r.id} onClick={() => setSelId(r.id)} style={{ fontSize: 12, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ color: 'var(--bordo)' }}>{r.numero} · {r.fornecedor || r.produto || '—'}</span><span style={{ color: '#dc2626', fontWeight: 700 }}>{diasAtraso(r)}d</span>
                  </div>
                ))}
                {nAtraso === 0 && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Nenhuma RNC em atraso.</div>}
                <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 6 }}>
                  Tempo médio de resolução: <strong>{tempoMedio == null ? '—' : tempoMedio.toFixed(1) + ' dias'}</strong>
                </div>
              </div>
            </div>
            <div style={{ ...card, marginTop: 12, overflowX: 'auto' }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>📈 Índice de reincidência por fornecedor (dados objetivos)</div>
              {fornecedores.length === 0 ? <div style={{ fontSize: 12, color: 'var(--muted)' }}>Sem dados.</div> : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead><tr style={{ color: 'var(--muted)', textAlign: 'left' }}>{['Fornecedor', 'RNCs', 'Quantidade', 'Qualidade', 'Devoluções', 'Impacto (R$)', 'Tempo médio'].map(h => <th key={h} style={{ padding: '4px 6px' }}>{h}</th>)}</tr></thead>
                  <tbody>{fornecedores.slice(0, 10).map(x => (
                    <tr key={x.nome} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '5px 6px', fontWeight: 600 }}>{x.nome}</td><td>{x.total}</td><td>{x.qtd}</td><td>{x.qualidade}</td><td>{x.devolucoes}</td><td>{brl(x.impacto)}</td><td>{x.tempo == null ? '—' : x.tempo.toFixed(1) + 'd'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>

      {/* Filtros */}
      <div style={{ ...card, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, alignItems: 'end' }}>
        <div><label style={lbl}>Busca</label><input style={inp} value={f.busca} onChange={e => setFiltro({ busca: e.target.value })} placeholder="RNC, PC, NF, produto, lote…" /></div>
        <div><label style={lbl}>Unidade</label><select style={inp} value={f.unidade} onChange={e => setFiltro({ unidade: e.target.value })}><option value="">Todas</option>{lojas.filter(l => l && l !== 'Todas as Lojas').map(l => <option key={l}>{l}</option>)}</select></div>
        <div><label style={lbl}>Fornecedor</label><select style={inp} value={f.fornecedor} onChange={e => setFiltro({ fornecedor: e.target.value })}><option value="">Todos</option>{Array.from(new Set(rncs.map(r => r.fornecedor).filter(Boolean))).sort().map((x: any) => <option key={x}>{x}</option>)}</select></div>
        <div><label style={lbl}>Status</label><select style={inp} value={f.status} onChange={e => setFiltro({ status: e.target.value })}><option value="">Todos</option>{STATUS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
        <div><label style={lbl}>Responsável</label><select style={inp} value={f.responsavel} onChange={e => setFiltro({ responsavel: e.target.value })}><option value="">Todos</option>{Array.from(new Set(rncs.map(r => r.responsavel).filter(Boolean))).sort().map((x: any) => <option key={x}>{x}</option>)}</select></div>
        <div><label style={lbl}>Categoria</label><select style={inp} value={f.categoria} onChange={e => setFiltro({ categoria: e.target.value })}><option value="">Todas</option>{CATEGORIAS.map(c => <option key={c}>{c}</option>)}</select></div>
        <div><label style={lbl}>Tipo</label><select style={inp} value={f.tipo} onChange={e => setFiltro({ tipo: e.target.value })}><option value="">Todos</option>{TIPOS.map(c => <option key={c}>{c}</option>)}</select></div>
        <div><label style={lbl}>De</label><input type="date" style={inp} value={f.de} onChange={e => setFiltro({ de: e.target.value })} /></div>
        <div><label style={lbl}>Até</label><input type="date" style={inp} value={f.ate} onChange={e => setFiltro({ ate: e.target.value })} /></div>
        <label style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={f.atrasadas} onChange={e => setFiltro({ atrasadas: e.target.checked })} /> Atrasadas</label>
        <label style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={f.comDevolucao} onChange={e => setFiltro({ comDevolucao: e.target.checked })} /> Com devolução</label>
        {(filtroAtivo || f.unidade || f.fornecedor || f.responsavel || f.categoria || f.tipo || f.de || f.ate || f.busca) && (
          <button onClick={() => setF({ unidade: '', fornecedor: '', status: '', responsavel: '', categoria: '', tipo: '', de: '', ate: '', atrasadas: false, comDevolucao: false, busca: '' })} style={btn('#6b7280')}>Limpar filtros</button>
        )}
      </div>

      {/* Tabela central */}
      <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
        {loading ? <div style={{ padding: 24, textAlign: 'center' }}><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /></div> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead><tr style={{ background: 'var(--bg)', color: 'var(--muted)', textAlign: 'left' }}>
              {['RNC', 'Data', 'Unidade', 'Fornecedor', 'PC', 'NF', 'Produto', 'Lote', 'Desvio', 'Responsável', 'Prazo', 'Status'].map(h => <th key={h} style={{ padding: '9px 10px', fontWeight: 700, fontSize: 11.5, whiteSpace: 'nowrap' }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {filtradas.map(r => {
                const st = statusInfo(r.status); const at = diasAtraso(r)
                return (
                  <tr key={r.id} onClick={() => setSelId(r.id)} style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }}>
                    <td style={{ padding: '8px 10px', fontWeight: 700, color: 'var(--bordo)', whiteSpace: 'nowrap' }}>{r.numero}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtD(r.created_at)}</td><td>{r.loja}</td><td>{r.fornecedor || '—'}</td><td>{r.pedido_numero || '—'}</td><td>{r.nf_numero || '—'}</td>
                    <td>{r.produto || '—'}</td><td>{r.lote || '—'}</td><td>{r.categoria || (r.tipos || [])[0] || '—'}</td><td>{r.responsavel || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap', color: at ? '#dc2626' : undefined, fontWeight: at ? 700 : 400 }}>{fmtD(r.prazo)}{at ? ` ⏰${at}d` : ''}</td>
                    <td style={{ whiteSpace: 'nowrap' }}><span style={{ background: st.cor + '18', color: st.cor, borderRadius: 20, padding: '2px 9px', fontSize: 11.5, fontWeight: 700 }}>{st.emoji} {st.label}</span></td>
                  </tr>
                )
              })}
              {filtradas.length === 0 && <tr><td colSpan={12} style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>Nenhuma RNC encontrada.</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      </>}

      {showNova && <NovaRnc profiles={profiles} responsaveis={responsaveis} lojas={lojas} lojaAtual={loja} userName={userName} notificar={notificar}
        onClose={() => setShowNova(false)} onSaved={(id: string) => { setShowNova(false); load(); setSelId(id) }} />}
      {selecionada && <RncDetalhe r={selecionada} profiles={profiles} responsaveis={responsaveis} userName={userName} notificar={notificar} onClose={() => setSelId(null)} onChanged={load} />}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// BANCO DE DADOS — todas as RNCs respondidas/tratadas, com exportação CSV
// ══════════════════════════════════════════════════════════════
const respondida = (r: any) => r.status === 'encerrada' || r.status === 'resolvida' || !!(r.fornecedor_resposta || '').trim() || !!(r.devolutiva_final || '').trim()
const diasTratativa = (r: any) => r.ciencia_em ? Math.max(0, Math.round(((r.encerrado_em ? new Date(r.encerrado_em).getTime() : Date.now()) - new Date(r.ciencia_em).getTime()) / 86400000)) : null
function BancoRnc({ rncs, loading, onOpen }: { rncs: any[]; loading: boolean; onOpen: (id: string) => void }) {
  const [busca, setBusca] = useState(''); const [forn, setForn] = useState(''); const [so, setSo] = useState<'todas' | 'encerradas'>('todas')
  const base = useMemo(() => rncs.filter(respondida), [rncs])
  const lista = useMemo(() => base.filter(r => {
    if (so === 'encerradas' && r.status !== 'encerrada') return false
    if (forn && r.fornecedor !== forn) return false
    if (busca) { const b = busca.toLowerCase(); if (![r.numero, r.fornecedor, r.produto, r.pedido_numero, r.nf_numero, r.desvio_txt, r.devolutiva_final, r.responsavel].some(x => String(x || '').toLowerCase().includes(b))) return false }
    return true
  }), [base, busca, forn, so])
  const noPrazo = (r: any) => r.prazo && r.encerrado_em ? String(r.encerrado_em).slice(0, 10) <= String(r.prazo).slice(0, 10) : null
  const exportar = () => {
    const cab = ['RNC', 'Abertura', 'Unidade', 'Fornecedor', 'PC', 'NF', 'Data entrega', 'Quem recebeu', 'Produto', 'Qtd solicitada', 'Qtd recebida', 'Desvio', 'Categoria', 'Gravidade', 'Aberta por', 'Responsável', 'Setor', 'Ciência em', 'Prazo', 'Ação imediata', 'Ação corretiva', 'Ação preventiva', 'Resposta do fornecedor', 'Tratativa de Compras', 'Devolutiva final', 'Solução', 'Resultado', 'Status', 'Encerrada em', 'Dias de tratativa', 'No prazo']
    const q = (v: any) => '"' + String(v ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ') + '"'
    const linhas = lista.map(r => [r.numero, fmtD(r.created_at), r.loja, r.fornecedor, r.pedido_numero, r.nf_numero, fmtD(r.data_entrega || r.data_recebimento), r.recebedor, r.produto, r.qtd_solicitada, r.qtd_recebida, r.desvio_txt, r.categoria, gravInfo(r.gravidade).label, r.aberto_por, r.responsavel, r.responsavel_area, fmtDH(r.ciencia_em), fmtD(r.prazo), r.acao_imediata || r.tratativa_obs, r.acao_corretiva, r.acao_preventiva, r.fornecedor_resposta, r.compras_tratativa, r.devolutiva_final, r.solucao, RESULTADOS.find(x => x.id === r.resultado)?.label, statusInfo(r.status).label, fmtDH(r.encerrado_em), diasTratativa(r), noPrazo(r) == null ? '' : noPrazo(r) ? 'Sim' : 'Não'].map(q).join(';'))
    const blob = new Blob(['\ufeff' + [cab.map(q).join(';'), ...linhas].join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'banco-rnc-' + new Date().toISOString().slice(0, 10) + '.csv'; a.click()
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ ...card, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, alignItems: 'end' }}>
        <div><label style={lbl}>Busca</label><input style={inp} value={busca} onChange={e => setBusca(e.target.value)} placeholder="RNC, fornecedor, produto, devolutiva…" /></div>
        <div><label style={lbl}>Fornecedor</label><select style={inp} value={forn} onChange={e => setForn(e.target.value)}><option value="">Todos</option>{Array.from(new Set(base.map(r => r.fornecedor).filter(Boolean))).sort().map((x: any) => <option key={x}>{x}</option>)}</select></div>
        <div><label style={lbl}>Mostrar</label><select style={inp} value={so} onChange={e => setSo(e.target.value as any)}><option value="todas">Respondidas (fornecedor/devolutiva/encerradas)</option><option value="encerradas">Somente encerradas</option></select></div>
        <button onClick={exportar} disabled={!lista.length} style={btn('#166534', !lista.length)}>⬇️ Exportar CSV ({lista.length})</button>
      </div>
      <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
        {loading ? <div style={{ padding: 24, textAlign: 'center' }}><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /></div> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr style={{ background: 'var(--bg)', color: 'var(--muted)', textAlign: 'left' }}>
              {['RNC', 'Abertura', 'Fornecedor', 'PC', 'Produto', 'Responsável', 'Resposta do fornecedor', 'Devolutiva final', 'Encerramento', 'Dias', 'No prazo'].map(h => <th key={h} style={{ padding: '8px 10px', fontSize: 11.5, whiteSpace: 'nowrap' }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {lista.map(r => { const np = noPrazo(r); return (
                <tr key={r.id} onClick={() => onOpen(r.id)} style={{ borderTop: '1px solid var(--border)', cursor: 'pointer', verticalAlign: 'top' }}>
                  <td style={{ padding: '7px 10px', fontWeight: 700, color: 'var(--bordo)', whiteSpace: 'nowrap' }}>{r.numero}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtD(r.created_at)}</td><td>{r.fornecedor || '—'}</td><td>{r.pedido_numero || '—'}</td><td>{r.produto || '—'}</td><td>{r.responsavel || '—'}</td>
                  <td style={{ maxWidth: 220 }}>{(r.fornecedor_resposta || '—').slice(0, 120)}</td><td style={{ maxWidth: 220 }}>{(r.devolutiva_final || '—').slice(0, 120)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{r.encerrado_em ? fmtD(r.encerrado_em) : statusInfo(r.status).label}</td><td>{diasTratativa(r) ?? '—'}</td>
                  <td>{np == null ? '—' : np ? '✅' : '❌'}</td>
                </tr>
              ) })}
              {lista.length === 0 && <tr><td colSpan={11} style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>Nenhuma RNC respondida ainda.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// NOVA RNC
// ══════════════════════════════════════════════════════════════
function NovaRnc({ profiles, lojas, lojaAtual, userName, notificar, onClose, onSaved }: any) {
  const lojasOk: string[] = lojas.filter((l: string) => l && l !== 'Todas as Lojas')
  const [f, setF] = useState<any>({
    loja: lojaAtual && lojaAtual !== 'Todas as Lojas' ? lojaAtual : (lojasOk[0] || ''), setor: 'Recebimento', centro_custo: '', tipos: [] as string[],
    pedido_id: null, pedido_numero: '', fornecedor: '', produto: '', unidade: '', qtd_solicitada: '', valor_produto: '',
    nf_numero: '', nf_data: '', data_recebimento: new Date().toISOString().slice(0, 10), local_recebimento: '', recebedor: userName, transportadora: '', lote: '', qtd_recebida: '',
    solicitado_txt: '', recebido_txt: '', desvio_txt: '', categoria: 'Produto', gravidade: 'media', tratativas: [] as string[], tratativa_obs: '', acao_corretiva: '', acao_preventiva: '', responsavel: '', responsavel_area: '',
  })
  const [pcSnap, setPcSnap] = useState<any>(null)
  const set = (k: string, v: any) => setF((o: any) => ({ ...o, [k]: v }))
  const toggle = (k: string, v: string) => setF((o: any) => ({ ...o, [k]: o[k].includes(v) ? o[k].filter((x: string) => x !== v) : [...o[k], v] }))
  const [busca, setBusca] = useState(''); const [achados, setAchados] = useState<any[]>([]); const [itens, setItens] = useState<any[]>([])
  const [buscando, setBuscando] = useState(false); const [semAchado, setSemAchado] = useState(false)
  const [evid, setEvid] = useState<{ file: File; tipo: string; descricao: string }[]>([])
  const [evTipo, setEvTipo] = useState(EVID_TIPOS[0]); const [evDesc, setEvDesc] = useState('')
  const [salvando, setSalvando] = useState(false)

  const buscarPC = async () => {
    if (busca.trim().length < 2) return
    setBuscando(true); setSemAchado(false)
    try { const r = await buscarPedidos(busca); setAchados(r); setSemAchado(r.length === 0) } finally { setBuscando(false) }
  }
  const escolherPC = async (p: any) => {
    setF((o: any) => ({ ...o, pedido_id: p.id || null, pedido_numero: p.numero || (p.chave ? String(p.chave).replace(/^pedido_/, '') : ''), fornecedor: p.fornecedor || o.fornecedor, loja: lojasOk.includes(p.loja) ? p.loja : o.loja }))
    setAchados([])
    try {
      const snap = await carregarPC(p)
      setPcSnap(snap)
      const lista = snap.itens.map((it: any, i: number) => ({ id: i, produto_nome: it.produto, unidade: it.un, qtd_pedida: it.qtd, preco: it.preco }))
      setItens(lista)
      setF((o: any) => ({ ...o, pedido_numero: snap.numero || o.pedido_numero, fornecedor: snap.fornecedor || o.fornecedor, data_recebimento: snap.data_entrega || o.data_recebimento, recebedor: snap.recebedor || o.recebedor, nf_numero: o.nf_numero }))
      if (lista.length === 1) escolherItem(lista[0])
    } catch (e) { console.error(e); alert('Não consegui carregar os dados do pedido.') }
  }
  const escolherItem = (it: any) => setF((o: any) => ({
    ...o, produto: it.produto_nome, unidade: it.unidade || '', qtd_solicitada: String(it.qtd_pedida ?? ''), valor_produto: it.preco != null && it.qtd_pedida != null ? String(Number(it.preco) * Number(it.qtd_pedida)) : o.valor_produto,
    solicitado_txt: `${it.qtd_pedida ?? ''} ${it.unidade || ''} — ${it.produto_nome}`.trim(),
  }))
  const resumo = `Solicitado: ${f.qtd_solicitada || '?'} ${f.unidade} ${f.produto || '—'}\nRecebido: ${f.recebido_txt || (f.qtd_recebida ? `${f.qtd_recebida} ${f.unidade} ${f.produto}` : '—')}\nDesvio: ${f.categoria}${f.tipos.length ? ' — ' + f.tipos.join(' + ') : ''}`

  const salvar = async () => {
    if (!f.loja) { alert('Selecione a unidade.'); return }
    if (!f.tipos.length) { alert('Marque ao menos um tipo de ocorrência.'); return }
    if (!f.desvio_txt.trim()) { alert('Descreva o desvio.'); return }
    if (!f.tratativa_obs.trim()) { alert('A observação da tratativa é obrigatória.'); return }
    if (!f.responsavel_area || !f.responsavel) { alert('Direcione a RNC: escolha o setor e o usuário que vai tratar.'); return }
    setSalvando(true)
    try {
      const num = (k: string) => f[k] === '' || f[k] == null ? null : Number(String(f[k]).replace(',', '.'))
      const row: any = {
        loja: f.loja, setor: f.setor || null, centro_custo: f.centro_custo || null, tipos: f.tipos, categoria: f.categoria, gravidade: f.gravidade, status: 'aberta',
        pedido_id: f.pedido_id, pedido_numero: f.pedido_numero || null, fornecedor: f.fornecedor || null, nf_numero: f.nf_numero || null, nf_data: f.nf_data || null,
        data_recebimento: f.data_recebimento || null, local_recebimento: f.local_recebimento || null, recebedor: f.recebedor || null, transportadora: f.transportadora || null,
        produto: f.produto || null, lote: f.lote || null, unidade: f.unidade || null, qtd_solicitada: num('qtd_solicitada'), qtd_recebida: num('qtd_recebida'), valor_produto: num('valor_produto'),
        valor_total_afetado: num('valor_produto'),
        solicitado_txt: f.solicitado_txt || (f.qtd_solicitada ? `${f.qtd_solicitada} ${f.unidade} — ${f.produto}` : null), recebido_txt: f.recebido_txt || (f.qtd_recebida ? `${f.qtd_recebida} ${f.unidade} — ${f.produto}` : null),
        desvio_txt: f.desvio_txt.trim(), tratativas: f.tratativas, tratativa_obs: f.tratativa_obs.trim(), acao_imediata: f.tratativa_obs.trim(), acao_corretiva: f.acao_corretiva.trim() || null, acao_preventiva: f.acao_preventiva.trim() || null,
        responsavel: f.responsavel, responsavel_area: f.responsavel_area || null, prazo: null, aberto_por: userName,
        data_entrega: pcSnap?.data_entrega || null, pedido_snapshot: pcSnap || null,
      }
      const { data: nova, error } = await sb.from('rnc').insert(row).select('id, numero').single()
      if (error || !nova) { alert('Falha ao abrir a RNC: ' + (error?.message || '')); setSalvando(false); return }
      const log = (acao: string, detalhe?: string) => sb.from('rnc_historico').insert({ rnc_id: nova.id, acao, detalhe: detalhe || null, usuario: userName })
      await log('RNC aberta', `${f.categoria} · gravidade ${gravInfo(f.gravidade).label} · ${f.desvio_txt.trim()}`)
      await log('Responsável designado', `${f.responsavel} (${f.responsavel_area}) · prazo de ${PRAZO_DIAS_UTEIS} dias úteis após a ciência`)
      await log('Tratativa imediata registrada', `${f.tratativas.join(', ') || 'sem opção marcada'} — ${f.tratativa_obs.trim()}`)
      for (const ev of evid) {
        try {
          const url = await uploadAnexo(ev.file, 'rnc')
          await sb.from('rnc_evidencias').insert({ rnc_id: nova.id, tipo: ev.tipo, arquivo_url: url, descricao: ev.descricao || null, usuario: userName })
          await log('Evidência anexada', `${ev.tipo}${ev.descricao ? ' — ' + ev.descricao : ''}`)
        } catch (e) { console.error(e) }
      }
      const linkR = `${siteOrigin()}/?page=tarefas&rnc=${nova.id}`
      const corpo = `${nova.numero} · ${f.loja}\nSetor: ${f.responsavel_area}\nPC: ${f.pedido_numero || '—'}\nFornecedor: ${f.fornecedor || '—'}${pcSnap?.data_entrega ? `\nEntrega: ${fmtD(pcSnap.data_entrega)}` : ''}${f.recebedor ? `\nRecebido por: ${f.recebedor}` : ''}\nProduto: ${f.produto || '—'}${f.nf_numero ? `\nNF: ${f.nf_numero}` : ''}${f.lote ? `\nLote: ${f.lote}` : ''}\nDesvio: ${f.desvio_txt.trim()}\nGravidade: ${gravInfo(f.gravidade).emoji} ${gravInfo(f.gravidade).label}\nPrazo: ${PRAZO_DIAS_UTEIS} dias úteis após sua ciência\nAberta por: ${userName}`
      const ok1 = await notificar(f.responsavel, `🔴 *Nova RNC direcionada a você*\n\n${corpo}\n\n${linkR}\n_Amore Gestão_`, `RNC ${nova.numero}`, nova.id)
      await log('Disparo WhatsApp', ok1 ? `Aviso enviado a ${f.responsavel} (${f.responsavel_area})` : `Não foi possível avisar ${f.responsavel} (sem WhatsApp cadastrado?)`)
      if (f.avisarSetor) {
        for (const u of usuariosDoSetor(profiles, f.responsavel_area)) {
          if (!u.fone || u.nome === f.responsavel || u.nome === userName) continue
          await notificar(u.nome, `📣 *RNC direcionada ao setor ${f.responsavel_area}*\n\nResponsável: ${f.responsavel}\n${corpo}\n\n${linkR}\n_Amore Gestão_`, `RNC ${nova.numero}`, nova.id)
          await new Promise(r => setTimeout(r, 2500 + Math.random() * 2500))
        }
        await log('Disparo WhatsApp', `Setor ${f.responsavel_area} avisado`)
      }
      onSaved(nova.id)
    } finally { setSalvando(false) }
  }

  const sec = (t: string) => <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--bordo)', margin: '14px 0 8px', borderBottom: '1px solid var(--border)', paddingBottom: 4 }}>{t}</div>
  const F = (k: string, label: string, type = 'text', ph = '') => <div><label style={lbl}>{label}</label><input type={type} style={inp} value={f[k] ?? ''} onChange={e => set(k, e.target.value)} placeholder={ph} /></div>
  const grid2: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card)', borderRadius: 14, padding: 20, width: '100%', maxWidth: 780, maxHeight: '94vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>+ Abrir nova RNC</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>Nº gerado automaticamente (RNC-{new Date().getFullYear()}-######) · {userName} · {fmtDH(new Date().toISOString())}</div>

        {sec('1 · IDENTIFICAÇÃO')}
        <div style={grid2}>
          <div><label style={lbl}>Unidade *</label><select style={inp} value={f.loja} onChange={e => set('loja', e.target.value)}>{lojasOk.map(l => <option key={l}>{l}</option>)}</select></div>
          <div><label style={lbl}>Área/setor</label><select style={inp} value={f.setor} onChange={e => set('setor', e.target.value)}>{AREAS.map(a => <option key={a}>{a}</option>)}</select></div>
          {F('centro_custo', 'Centro de custo')}
        </div>
        <label style={{ ...lbl, marginTop: 10 }}>Tipo de ocorrência * (marque um ou mais)</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 4 }}>
          {TIPOS.map(t => <label key={t} style={{ fontSize: 12.5, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={f.tipos.includes(t)} onChange={() => toggle('tipos', t)} />{t}</label>)}
        </div>

        {sec('2 · DADOS DO RECEBIMENTO — informados manualmente por quem está gerando a RNC (NF e lote não precisam estar vinculados; buscar o PC é opcional)')}
        <div style={{ display: 'flex', gap: 6 }}>
          <input style={inp} value={busca} onChange={e => setBusca(e.target.value)} onKeyDown={e => e.key === 'Enter' && buscarPC()} placeholder="Buscar Pedido de Compra por número ou fornecedor (ex.: PED-0033, Casa do Queijo)" />
          <button onClick={buscarPC} style={btn()}>{buscando ? 'Buscando…' : 'Buscar PC'}</button>
        </div>
        {semAchado && <div style={{ fontSize: 12, color: '#b45309', marginTop: 4 }}>Nenhum pedido encontrado. Tente o nome do fornecedor ou preencha manualmente abaixo.</div>}
        {achados.map((p, i) => <div key={p.chave || p.id || i} onClick={() => escolherPC(p)} style={{ fontSize: 12.5, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 8, marginTop: 4, cursor: 'pointer' }}>{p.numero || 'sem nº'} · {p.fornecedor || '—'} · {p.loja} · {fmtD(p.data)} · {brl(p.total)}</div>)}
        {f.pedido_numero && <div style={{ fontSize: 12.5, marginTop: 6, color: '#166534' }}>✅ PC vinculado: <b>{f.pedido_numero}</b> — {f.fornecedor} (dados do pedido trazidos abaixo)</div>}
        {pcSnap && <div style={{ marginTop: 8 }}><PedidoBloco pc={pcSnap} abertoPor={userName} direcionadoA={f.responsavel} setor={f.responsavel_area} /></div>}
        {itens.length > 0 && (
          <div style={{ marginTop: 6 }}>
            <label style={lbl}>Produto do pedido (clique pra preencher o que foi solicitado)</label>
            {itens.map(it => <div key={it.id} onClick={() => escolherItem(it)} style={{ fontSize: 12, padding: '5px 10px', border: `1px solid ${f.produto === it.produto_nome ? 'var(--bordo)' : 'var(--border)'}`, borderRadius: 8, marginTop: 3, cursor: 'pointer' }}>{it.qtd_pedida} {it.unidade} — {it.produto_nome} {it.preco != null ? `· ${brl(it.preco)}` : ''}</div>)}
          </div>
        )}
        <div style={{ ...grid2, marginTop: 10 }}>
          {F('fornecedor', 'Fornecedor')}{F('produto', 'Produto')}{F('unidade', 'Unidade de medida')}{F('qtd_solicitada', 'Qtd solicitada', 'number')}{F('valor_produto', 'Valor do produto (R$)', 'number')}
          {F('nf_numero', 'NF')}{F('nf_data', 'Data da NF', 'date')}{F('data_recebimento', 'Data do recebimento', 'date')}{F('local_recebimento', 'Local')}{F('recebedor', 'Recebedor')}{F('transportadora', 'Transportadora')}{F('lote', 'Lote')}{F('qtd_recebida', 'Qtd recebida', 'number')}
        </div>

        {sec('3 · IDENTIFICAÇÃO DO DESVIO')}
        <div style={grid2}>
          <div><label style={lbl}>O que foi solicitado?</label><input style={inp} value={f.solicitado_txt} onChange={e => set('solicitado_txt', e.target.value)} placeholder="Vem do PC (editável)" /></div>
          <div><label style={lbl}>O que foi recebido?</label><input style={inp} value={f.recebido_txt} onChange={e => set('recebido_txt', e.target.value)} placeholder="Ex.: 20 un. Produto Z" /></div>
        </div>
        <label style={{ ...lbl, marginTop: 8 }}>Qual foi o desvio? *</label>
        <textarea style={{ ...inp, resize: 'vertical' }} rows={3} value={f.desvio_txt} onChange={e => set('desvio_txt', e.target.value)} placeholder="Ex.: Pedido solicita 100 un. do produto X, lote Y. No recebimento foram identificadas 20 un. do produto Z…" />
        <pre style={{ fontSize: 12, background: 'var(--bg)', borderRadius: 8, padding: 8, margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>{resumo}</pre>

        {sec('4 · EVIDÊNCIAS')}
        <div style={{ display: 'grid', gridTemplateColumns: '170px 1fr auto', gap: 6, alignItems: 'end' }}>
          <div><label style={lbl}>Tipo</label><select style={inp} value={evTipo} onChange={e => setEvTipo(e.target.value)}>{EVID_TIPOS.map(t => <option key={t}>{t}</option>)}</select></div>
          <div><label style={lbl}>Descrição</label><input style={inp} value={evDesc} onChange={e => setEvDesc(e.target.value)} placeholder="Ex.: lote identificado no recebimento" /></div>
          <label style={{ ...btn(), display: 'inline-block' }}>+ Arquivo<input type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => { const fl = e.target.files?.[0]; if (fl) setEvid(v => [...v, { file: fl, tipo: evTipo, descricao: evDesc }]); setEvDesc(''); e.target.value = '' }} /></label>
        </div>
        {evid.map((e, i) => (
          <div key={i} style={{ fontSize: 12, marginTop: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
            <Galeria itens={[{ url: URL.createObjectURL(e.file), rotulo: e.file.name }]} />
            <div>📎 {e.file.name} · {e.tipo}{e.descricao ? ' — ' + e.descricao : ''} <button onClick={() => setEvid(v => v.filter((_, j) => j !== i))} style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer' }}>remover</button></div>
          </div>
        ))}

        {sec('5 · CLASSIFICAÇÃO')}
        <div style={grid2}>
          <div><label style={lbl}>Categoria principal</label><select style={inp} value={f.categoria} onChange={e => set('categoria', e.target.value)}>{CATEGORIAS.map(c => <option key={c}>{c}</option>)}</select></div>
          <div><label style={lbl}>Gravidade</label>
            <div style={{ display: 'flex', gap: 4 }}>{GRAVIDADES.map(g => <button key={g.id} onClick={() => set('gravidade', g.id)} style={{ flex: 1, padding: '7px 2px', borderRadius: 8, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', border: `1px solid ${f.gravidade === g.id ? g.cor : 'var(--border)'}`, background: f.gravidade === g.id ? g.cor : 'var(--bg)', color: f.gravidade === g.id ? '#fff' : 'var(--text)' }}>{g.emoji} {g.label}</button>)}</div>
          </div>
        </div>

        {sec('6 · AÇÃO IMEDIATA, CORRETIVA E PREVENTIVA')}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 4 }}>
          {TRATATIVAS.map(t => <label key={t} style={{ fontSize: 12.5, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={f.tratativas.includes(t)} onChange={() => toggle('tratativas', t)} />{t}</label>)}
        </div>
        <label style={{ ...lbl, marginTop: 8 }}>Ação imediata * (o que foi feito agora no recebimento e por quê)</label>
        <textarea style={{ ...inp, resize: 'vertical' }} rows={2} value={f.tratativa_obs} onChange={e => set('tratativa_obs', e.target.value)} />
        <label style={{ ...lbl, marginTop: 8 }}>Ação corretiva (o que será feito para resolver o problema atual)</label>
        <textarea style={{ ...inp, resize: 'vertical' }} rows={2} value={f.acao_corretiva} onChange={e => set('acao_corretiva', e.target.value)} />
        <label style={{ ...lbl, marginTop: 8 }}>Ação preventiva (o que será feito para não voltar a acontecer)</label>
        <textarea style={{ ...inp, resize: 'vertical' }} rows={2} value={f.acao_preventiva} onChange={e => set('acao_preventiva', e.target.value)} />

        {sec('7 · DIRECIONAMENTO — setor + usuário cadastrado (dispara WhatsApp)')}
        <div style={grid2}>
          <div><label style={lbl}>Setor competente *</label><select style={inp} value={f.responsavel_area} onChange={e => { set('responsavel_area', e.target.value); set('responsavel', '') }}><option value="">Selecionar…</option>{listaSetores(profiles).map(a => <option key={a}>{a}</option>)}</select></div>
          <div><label style={lbl}>Usuário responsável *</label>
            <select style={inp} value={f.responsavel} onChange={e => set('responsavel', e.target.value)}>
              <option value="">{f.responsavel_area ? 'Selecionar usuário…' : 'Escolha o setor primeiro'}</option>
              {(f.responsavel_area ? usuariosDoSetor(profiles, f.responsavel_area) : []).map(u => <option key={u.nome} value={u.nome}>{u.nome}{u.fone ? '' : ' (sem WhatsApp)'}</option>)}
            </select>
            {f.responsavel_area && usuariosDoSetor(profiles, f.responsavel_area).length === 0 && (
              <div style={{ fontSize: 11, color: '#b45309', marginTop: 3 }}>Nenhum usuário cadastrado neste setor. <button onClick={() => set('mostrarTodos', true)} style={{ border: 'none', background: 'none', color: 'var(--bordo)', cursor: 'pointer', textDecoration: 'underline', fontSize: 11 }}>ver todos os usuários</button></div>
            )}
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6 }}>⏱ O prazo de tratativa é de <b>{PRAZO_DIAS_UTEIS} dias úteis</b>, contados a partir da ciência do responsável.</div>
        {f.mostrarTodos && (
          <div style={{ marginTop: 6 }}><label style={lbl}>Todos os usuários</label>
            <select style={inp} value={f.responsavel} onChange={e => set('responsavel', e.target.value)}><option value="">Selecionar…</option>{usuariosDoSetor(profiles, '').map(u => <option key={u.nome} value={u.nome}>{u.nome}{u.fone ? '' : ' (sem WhatsApp)'}</option>)}</select>
          </div>
        )}
        <label style={{ fontSize: 12.5, display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}><input type="checkbox" checked={!!f.avisarSetor} onChange={e => set('avisarSetor', e.target.checked)} /> Avisar também os outros usuários do setor</label>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onClose} style={{ ...btn('#6b7280') }}>Cancelar</button>
          <button onClick={salvar} disabled={salvando} style={btn('var(--bordo)', salvando)}>{salvando ? 'Abrindo…' : 'Abrir RNC'}</button>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// PÁGINA INDIVIDUAL DA RNC
// ══════════════════════════════════════════════════════════════
function RncDetalhe({ r, profiles, responsaveis, userName, notificar, onClose, onChanged }: any) {
  const [aba, setAba] = useState('resumo')
  const [ed, setEd] = useState<any>(r)
  const [busy, setBusy] = useState(false)
  const [evids, setEvids] = useState<any[]>([])
  const [hist, setHist] = useState<any[]>([])
  const [tarefas, setTarefas] = useState<any[]>([])
  const [reload, setReload] = useState(0)
  useEffect(() => { setEd(r) }, [r])
  useEffect(() => {
    sb.from('rnc_evidencias').select('*').eq('rnc_id', r.id).order('created_at', { ascending: false }).then((x: any) => setEvids(x.data || []))
    sb.from('rnc_historico').select('*').eq('rnc_id', r.id).order('created_at', { ascending: false }).then((x: any) => setHist(x.data || []))
  }, [r.id, reload, r.updated_at])
  const [pcLive, setPcLive] = useState<any>(null)
  useEffect(() => {
    setPcLive(null)
    if (!(r.pedido_snapshot?.itens || []).length && (r.pedido_id || r.pedido_numero)) carregarPC({ id: r.pedido_id, numero: r.pedido_numero }).then(setPcLive).catch(() => {})
  }, [r.id, r.pedido_id, r.pedido_numero, r.pedido_snapshot])
  const pc = (r.pedido_snapshot?.itens || []).length ? r.pedido_snapshot : (pcLive || r.pedido_snapshot)
  const ids: string[] = Array.isArray(r.tarefa_ids) ? r.tarefa_ids : []
  useEffect(() => {
    if (!ids.length) { setTarefas([]); return }
    sb.from('tarefas').select('id,numero,titulo,status,responsavel_nome,prazo').in('id', ids).then((x: any) => setTarefas(x.data || []))
  }, [r.id, ids.join(','), reload])

  const st = statusInfo(r.status); const gr = gravInfo(r.gravidade); const atraso = diasAtraso(r); const rest = diasRestantes(r)
  const log = (acao: string, detalhe?: string) => sb.from('rnc_historico').insert({ rnc_id: r.id, acao, detalhe: detalhe || null, usuario: userName })
  const pick = (keys: string[]) => Object.fromEntries(keys.map(k => [k, NUM_KEYS.has(k) ? (ed[k] === '' || ed[k] == null ? null : Number(String(ed[k]).replace(',', '.'))) : (ed[k] === '' ? null : ed[k])]))
  const salvar = async (patch: any, acao: string, depois?: () => Promise<void>) => {
    const diffs = Object.keys(patch).filter(k => JSON.stringify(patch[k] ?? null) !== JSON.stringify(r[k] ?? null)).map(k => `${LABELS[k] || k}: ${fmtVal(r[k])} → ${fmtVal(patch[k])}`)
    if (!diffs.length) return
    setBusy(true)
    try {
      await sb.from('rnc').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', r.id)
      await log(acao, diffs.join(' | '))
      if (depois) await depois()
      onChanged()
    } finally { setBusy(false) }
  }
  const mudarStatus = async (novo: string, extra: any = {}) => { await salvar({ status: novo, ...extra }, `Status → ${statusInfo(novo).label}`) }
  const link = `${siteOrigin()}/?page=tarefas&rnc=${r.id}`
  const avisar = async (nome: string, setor: string, prazo: string) => {
    const ok = await notificar(nome, `🔴 *RNC direcionada a você*\n\n${r.numero} · ${r.loja}\nSetor: ${setor || '—'}\nFornecedor: ${r.fornecedor || '—'}\nProduto: ${r.produto || '—'}${r.nf_numero ? `\nNF: ${r.nf_numero}` : ''}${r.lote ? `\nLote: ${r.lote}` : ''}\nDesvio: ${r.desvio_txt || '—'}\nPrazo: ${fmtD(prazo)}\n\n${link}\n_Amore Gestão_`, `RNC ${r.numero}`, r.id)
    await log('Disparo WhatsApp', ok ? `Aviso enviado a ${nome}${setor ? ' (' + setor + ')' : ''}` : `Não foi possível avisar ${nome} (sem WhatsApp cadastrado?)`)
    setReload(x => x + 1)
    if (!ok) alert(`${nome} não tem WhatsApp cadastrado — avise por outro canal.`)
  }

  const F = (k: string, label: string, type = 'text') => <div><label style={lbl}>{label}</label><input type={type} style={inp} value={ed[k] ?? ''} onChange={e => setEd((o: any) => ({ ...o, [k]: e.target.value }))} /></div>
  const T = (k: string, label: string, rows = 3, ph = '') => <div><label style={lbl}>{label}</label><textarea style={{ ...inp, resize: 'vertical' }} rows={rows} placeholder={ph} value={ed[k] ?? ''} onChange={e => setEd((o: any) => ({ ...o, [k]: e.target.value }))} /></div>
  const S = (k: string, label: string, opts: string[]) => <div><label style={lbl}>{label}</label><select style={inp} value={ed[k] ?? ''} onChange={e => setEd((o: any) => ({ ...o, [k]: e.target.value }))}><option value="">—</option>{opts.map(o => <option key={o}>{o}</option>)}</select></div>
  const grid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }
  const salvarBtn = (keys: string[], acao: string, depois?: () => Promise<void>) => <button onClick={() => salvar(pick(keys), acao, depois)} disabled={busy} style={{ ...btn('var(--bordo)', busy), marginTop: 10 }}>💾 Salvar</button>
  const toggleArr = (k: string, v: string) => setEd((o: any) => ({ ...o, [k]: (o[k] || []).includes(v) ? o[k].filter((x: string) => x !== v) : [...(o[k] || []), v] }))

  // ── validação antes do encerramento ──
  const alta = r.gravidade === 'alta' || r.gravidade === 'critica'
  const dev = r.devolucao || {}
  const checks = [
    { ok: (r.tratativas || []).length > 0 && !!(r.tratativa_obs || '').trim(), txt: 'Tratativa registrada' },
    { ok: !!r.responsavel, txt: 'Responsável definido' },
    { ok: evids.length > 0, txt: 'Evidências anexadas' },
    { ok: !alta || !!(r.causa_raiz || '').trim(), txt: 'Causa analisada (obrigatória para gravidade alta/crítica)' },
    { ok: !(alta || r.resultado === 'parcial' || r.resultado === 'nao_resolvido') || !!(r.acao_corretiva || '').trim(), txt: 'Ação corretiva registrada quando necessária' },
    { ok: !(r.tratativas || []).includes('Produto devolvido') || (!!dev.data_devolucao && !!dev.nf_devolucao), txt: 'Devolução concluída quando aplicável (data + NF de devolução)' },
    { ok: !(r.tratativas || []).includes('Crédito/abatimento solicitado') || Number(r.valor_credito) > 0 || Number(r.valor_abatimento) > 0, txt: 'Crédito/abatimento registrado quando aplicável' },
    { ok: !!(r.devolutiva_final || '').trim(), txt: 'Devolutiva final registrada pelo setor responsável' },
    { ok: !!(r.solucao || '').trim() && !!r.resultado && r.eficaz != null && r.necessita_preventiva != null, txt: 'Solução validada (solução, resultado, eficácia e necessidade preventiva)' },
  ]
  const tudoOk = checks.every(c => c.ok)
  // ── Fechamento: consolida todas as informações da RNC num relatório enviável ao solicitante ──
  const fechamentoTexto = () => {
    const L: string[] = []
    const add = (t: string, v?: any) => { if (v != null && String(v).trim() !== '' && String(v) !== '—') L.push(t + ': ' + String(v).trim()) }
    L.push('*FECHAMENTO DA ' + r.numero + '*', '')
    add('Unidade', r.loja); add('Aberta por', r.aberto_por ? r.aberto_por + ' em ' + fmtDH(r.created_at) : ''); add('Tratada por', r.responsavel ? r.responsavel + (r.responsavel_area ? ' (' + r.responsavel_area + ')' : '') : '')
    add('Status', statusInfo(r.status).label); add('Gravidade', gravInfo(r.gravidade).label); add('Categoria', r.categoria)
    L.push('', '*PEDIDO DE COMPRA*')
    add('PC', pc?.numero || r.pedido_numero); add('Fornecedor', pc?.fornecedor || r.fornecedor); add('Data da entrega', fmtD(pc?.data_entrega || r.data_entrega || r.data_recebimento)); add('Recebido por', pc?.recebedor || r.recebedor)
    add('NF', r.nf_numero); add('Lote', r.lote); add('Valor do pedido', pc?.total ? brl(pc.total) : '')
    for (const it of (pc?.itens || [])) L.push('• ' + it.qtd + ' ' + (it.un || '') + ' — ' + it.produto + (it.preco != null ? ' · ' + brl(it.preco) + ' un.' : ''))
    if (!(pc?.itens || []).length) add('Produto', r.produto)
    L.push('', '*NÃO CONFORMIDADE*')
    add('Solicitado', r.solicitado_txt); add('Recebido', r.recebido_txt); add('Tipo', (r.tipos || []).join(' + ')); add('Desvio', r.desvio_txt)
    L.push('', '*TRATATIVA*')
    add('Ação imediata', r.acao_imediata || r.tratativa_obs); add('Ação corretiva', r.acao_corretiva); add('Ação preventiva', r.acao_preventiva); add('Causa raiz', r.causa_raiz)
    add('Resposta do fornecedor', r.fornecedor_resposta); add('Tratativa de Compras', r.compras_tratativa)
    L.push('', '*DEVOLUTIVA E ENCERRAMENTO*')
    add('Devolutiva final', r.devolutiva_final); add('Solução aplicada', r.solucao); add('Resultado', RESULTADOS.find(x => x.id === r.resultado)?.label)
    add('Foi eficaz', r.eficaz == null ? '' : r.eficaz ? 'sim' : 'não')
    const rec = (Number(r.valor_devolvido) || 0) + (Number(r.valor_credito) || 0) + (Number(r.valor_abatimento) || 0); const imp = (Number(r.perda) || 0) + (Number(r.custo_adicional) || 0)
    if (rec) add('Recuperado (devolução/crédito/abatimento)', brl(rec)); if (imp) add('Impacto (perda + custo adicional)', brl(imp))
    L.push('')
    add('Ciência em', r.ciencia_em ? fmtDH(r.ciencia_em) : ''); add('Prazo (4 dias úteis)', fmtD(r.prazo)); add('Encerrada', r.encerrado_em ? fmtDH(r.encerrado_em) + ' por ' + (r.encerrado_por || '') : '')
    add('Evidências anexadas', evids.length ? String(evids.length) : '')
    L.push('', link, '_Amore Gestão_')
    return L.join('\n')
  }
  const enviarFechamento = async () => {
    if (!r.aberto_por) { alert('Esta RNC não tem solicitante registrado.'); return }
    setBusy(true)
    try {
      const ok = await notificar(r.aberto_por, fechamentoTexto(), 'Fechamento ' + r.numero, r.id)
      await log('Fechamento enviado ao solicitante', ok ? 'Enviado a ' + r.aberto_por : 'Não foi possível enviar a ' + r.aberto_por + ' (sem WhatsApp cadastrado?)')
      setReload(x => x + 1)
      alert(ok ? 'Fechamento enviado a ' + r.aberto_por + ' pelo WhatsApp.' : r.aberto_por + ' não tem WhatsApp cadastrado — copie o texto e envie por outro canal.')
    } finally { setBusy(false) }
  }
  const imprimirFechamento = () => {
    const w = window.open('', '_blank'); if (!w) return
    const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    w.document.write('<html><head><title>Fechamento ' + r.numero + '</title></head><body style="font-family:Arial,sans-serif;max-width:800px;margin:24px auto;font-size:14px"><h2>Amore Gestão — Fechamento de RNC</h2><pre style="white-space:pre-wrap;font-family:inherit;line-height:1.5">' + esc(fechamentoTexto().replace(/\*/g, '').replace(/_Amore Gestão_/, '')) + '</pre></body></html>')
    w.document.close(); w.focus(); setTimeout(() => w.print(), 400)
  }
  const semCiencia = !r.ciencia_em && r.status !== 'encerrada'
  const darCiencia = async () => {
    const agora = new Date()
    const prazoNovo = addDiasUteis(agora, PRAZO_DIAS_UTEIS)
    await salvar({ ciencia_por: userName, ciencia_em: agora.toISOString(), prazo: prazoNovo, ...(r.status === 'aberta' ? { status: 'em_analise' } : {}) },
      'Ciência registrada', async () => { await log('Prazo de tratativa definido', `${PRAZO_DIAS_UTEIS} dias úteis após a ciência → ${fmtD(prazoNovo)}`) })
    if (r.aberto_por && r.aberto_por !== userName) await notificar(r.aberto_por, `👁️ *Ciência da ${r.numero}*\n${userName} tomou ciência e tem até ${fmtD(prazoNovo)} (${PRAZO_DIAS_UTEIS} dias úteis) para tratar.\n\n${link}\n_Amore Gestão_`, `RNC ${r.numero}`, r.id)
  }
  const encerrar = async () => {
    if (!tudoOk) return
    const agora = new Date().toISOString()
    await salvar({ status: 'encerrada', encerrado_por: userName, encerrado_em: agora, fechamento_disparo_em: agora }, 'RNC encerrada', async () => {
      // Disparo de fechamento: quem abriu, responsável, quem recebeu e usuários do setor Compras
      const nomes = new Set<string>()
      ;[r.aberto_por, r.responsavel, r.recebedor, pc?.recebedor].forEach(n => { if (n && String(n).trim()) nomes.add(String(n).trim()) })
      usuariosDoSetor(profiles, 'Compras').forEach(u => nomes.add(u.nome))
      const resumoFim = `✅ *${r.numero} ENCERRADA*\n\n${r.loja} · ${r.fornecedor || '—'}${pc?.numero ? ` · PC ${pc.numero}` : ''}\nProduto: ${r.produto || '—'}\nDesvio: ${r.desvio_txt || '—'}\n\n*Solução:* ${r.solucao || '—'}\n*Devolutiva final:* ${r.devolutiva_final || '—'}\nResultado: ${RESULTADOS.find(x => x.id === r.resultado)?.label || '—'} · Encerrada por ${userName}\n\n${link}\n_Amore Gestão_`
      let enviados = 0
      for (const n of nomes) {
        if (await notificar(n, n === r.aberto_por ? fechamentoTexto() : resumoFim, `RNC ${r.numero}`, r.id)) enviados++
        await new Promise(res => setTimeout(res, 2500 + Math.random() * 2500))
      }
      await log('Disparo de fechamento', `${enviados}/${nomes.size} envio(s): ${Array.from(nomes).join(', ')}`)
    })
  }

  // ── evidências ──
  const [evFile, setEvFile] = useState<File | null>(null); const [evTipo, setEvTipo] = useState(EVID_TIPOS[0]); const [evDesc, setEvDesc] = useState('')
  const addEvid = async () => {
    if (!evFile) return
    setBusy(true)
    try {
      const url = await uploadAnexo(evFile, 'rnc')
      await sb.from('rnc_evidencias').insert({ rnc_id: r.id, tipo: evTipo, arquivo_url: url, descricao: evDesc || null, usuario: userName })
      await log('Evidência anexada', `${evTipo}${evDesc ? ' — ' + evDesc : ''} (${evFile.name})`)
      setEvFile(null); setEvDesc(''); setReload(x => x + 1)
    } catch (e: any) { alert('Falha no upload: ' + (e?.message || e)) } finally { setBusy(false) }
  }

  // ── comunicação / fornecedor ──
  const [nota, setNota] = useState('')
  const registrarNota = async (tipo: 'fornecedor' | 'comunicacao') => {
    if (!nota.trim()) return
    setBusy(true)
    try {
      await log(tipo === 'fornecedor' ? 'Posicionamento do fornecedor' : 'Comunicação registrada', nota.trim())
      if (tipo === 'fornecedor' && r.responsavel && r.responsavel !== userName) {
        await notificar(r.responsavel, `📩 *Novo posicionamento do fornecedor na ${r.numero}*\n\n${r.fornecedor || ''} — ${nota.trim()}\n\n${link}\n_Amore Gestão_`, `RNC ${r.numero}`, r.id)
      }
      setNota(''); setReload(x => x + 1); onChanged()
    } finally { setBusy(false) }
  }

  // ── ações → Central de Tarefas ──
  const [ac, setAc] = useState({ titulo: '', tipo: 'Corretiva', responsavel: '', prazo: '' })
  const enviarTarefa = async () => {
    if (!ac.titulo.trim() || !ac.responsavel || !ac.prazo) { alert('Informe ação, responsável e prazo.'); return }
    setBusy(true)
    try {
      const t = await insertTarefa({
        loja: r.loja, titulo: `[${r.numero}] ${ac.titulo.trim()}`, descricao: `Ação ${ac.tipo.toLowerCase()} da ${r.numero} — ${r.fornecedor || ''} · ${r.produto || ''}. Desvio: ${r.desvio_txt || ''}`,
        setor: r.responsavel_area || r.setor || 'Geral', status: 'pendente', prioridade: r.gravidade === 'critica' ? 'urgente' : r.gravidade === 'alta' ? 'alta' : 'media',
        responsavel_nome: ac.responsavel, solicitante_nome: userName, prazo: ac.prazo, observacoes: null,
        objetivo: null, envolvidos: null, competencia: null, data_inicio: null, entregaveis: null, anexos: null, tags: 'rnc',
        custo_previsto: null, custo_executado: null, resultado_esperado: null, resultado_final: null, dificuldades: null,
        iniciado_em: null, concluido_em: null, prazo_extensao_data: null, prazo_extensao_motivo: null, prazo_extensao_status: null,
        data_solicitacao: new Date().toISOString().slice(0, 10), resultado_status: null, validado_por: null, validado_em: null, observacao_final: null,
        precisa_aprovacao: false, aprovado_por: null, aprovado_at: null, obs_aprovacao: null, reaberta: false, created_by: userName,
      } as any)
      await sb.from('rnc').update({ tarefa_ids: [...ids, t.id], updated_at: new Date().toISOString() }).eq('id', r.id)
      await log('Ação enviada para a Central de Tarefas', `${ac.tipo}: ${ac.titulo.trim()} → ${ac.responsavel} (prazo ${fmtD(ac.prazo)})`)
      if (ac.responsavel !== userName) await notificar(ac.responsavel, `📋 *Nova tarefa — ação da ${r.numero}*\n\n${ac.titulo.trim()}\nPrazo: ${fmtD(ac.prazo)}\n\n${siteOrigin()}/?page=tarefas\n_Amore Gestão_`, `Tarefa ${r.numero}`, t.id)
      setAc({ titulo: '', tipo: 'Corretiva', responsavel: '', prazo: '' }); setReload(x => x + 1); onChanged()
    } catch (e: any) { alert('Falha ao criar tarefa: ' + (e?.message || e)) } finally { setBusy(false) }
  }

  const ABAS = [['resumo', 'Resumo'], ['recebimento', 'Recebimento'], ['desvio', 'Desvio'], ['evidencias', `Evidências (${evids.length})`], ['tratativa', 'Tratativa'], ['fornecedor', 'Fornecedor/Compras'], ['causa', 'Causa'], ['acoes', `Ações (${ids.length})`], ['devolucao', 'Devolução'], ['encerramento', 'Encerramento'], ['historico', `Histórico (${hist.length})`]]
  const proximos = STATUS.filter(s => s.id !== r.status && s.id !== 'encerrada')

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', justifyContent: 'flex-end' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card)', width: '100%', maxWidth: 680, height: '100vh', overflowY: 'auto', boxShadow: '-4px 0 24px rgba(0,0,0,.2)' }}>
        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--card)', zIndex: 2 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{r.numero}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                <span style={{ background: st.cor + '18', color: st.cor, borderRadius: 20, padding: '2px 9px', fontSize: 11.5, fontWeight: 700 }}>{st.emoji} {st.label}</span>
                <span style={{ background: gr.cor + '18', color: gr.cor, borderRadius: 20, padding: '2px 9px', fontSize: 11.5, fontWeight: 700 }}>{gr.emoji} {gr.label}</span>
                {atraso > 0 && <span style={{ background: '#fee2e2', color: '#b91c1c', borderRadius: 20, padding: '2px 9px', fontSize: 11.5, fontWeight: 700 }}>🔴 RNC em atraso há {atraso} dia(s)</span>}
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', alignSelf: 'flex-start' }}><X size={18} /></button>
          </div>
          {r.status !== 'encerrada' && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>Mover para:</span>
              {proximos.map(s => <button key={s.id} onClick={() => mudarStatus(s.id)} disabled={busy} style={{ padding: '3px 9px', borderRadius: 20, border: `1px solid ${s.cor}`, background: 'transparent', color: s.cor, fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>{s.emoji} {s.label}</button>)}
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', marginTop: 8, marginBottom: -16 }}>
            {ABAS.map(([id, nome]) => <button key={id} onClick={() => setAba(id)} style={{ padding: '8px 9px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 11.5, whiteSpace: 'nowrap', fontWeight: aba === id ? 700 : 400, color: aba === id ? 'var(--bordo)' : 'var(--muted)', borderBottom: aba === id ? '2px solid var(--bordo)' : '2px solid transparent' }}>{nome}</button>)}
          </div>
        </div>

        <div style={{ padding: '30px 18px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {semCiencia && (
            <div style={{ ...card, background: '#fef3c7', borderColor: '#f59e0b', fontSize: 12.5 }}>
              👁️ <b>Aguardando ciência{r.responsavel ? ` de ${r.responsavel}` : ''}.</b> O prazo de tratativa é de {PRAZO_DIAS_UTEIS} dias úteis e só começa a contar depois da ciência.
              <div><button onClick={darCiencia} disabled={busy} style={{ ...btn('#b45309', busy), marginTop: 8 }}>👁️ Dar ciência e iniciar prazo de {PRAZO_DIAS_UTEIS} dias úteis</button></div>
            </div>
          )}
          {r.ciencia_em && <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>👁️ Ciência de <b>{r.ciencia_por}</b> em {fmtDH(r.ciencia_em)} · prazo até <b>{fmtD(r.prazo)}</b> ({PRAZO_DIAS_UTEIS} dias úteis)</div>}
          {aba === 'resumo' && (
            <>
              <PedidoBloco pc={pc} abertoPor={r.aberto_por} direcionadoA={r.responsavel} setor={r.responsavel_area} />
              <div style={{ ...card, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 12.5 }}>
                <div><b>Fornecedor:</b> {r.fornecedor || '—'}</div><div><b>PC:</b> {r.pedido_numero || '—'}</div>
                <div><b>NF:</b> {r.nf_numero || '—'}</div><div><b>Produto:</b> {r.produto || '—'}</div>
                <div><b>Lote:</b> {r.lote || '—'}</div><div><b>Valor:</b> {r.valor_produto != null ? brl(r.valor_produto) : '—'}</div>
                <div><b>Unidade:</b> {r.loja}</div><div><b>Aberta por:</b> {r.aberto_por} · {fmtDH(r.created_at)}</div>
              </div>
              <pre style={{ fontSize: 12.5, background: 'var(--bg)', borderRadius: 8, padding: 10, margin: 0, whiteSpace: 'pre-wrap' }}>{`Solicitado: ${r.solicitado_txt || '—'}\nRecebido: ${r.recebido_txt || '—'}\nDesvio: ${r.categoria || ''}${(r.tipos || []).length ? ' — ' + r.tipos.join(' + ') : ''}\n\n${r.desvio_txt || ''}`}</pre>
              <div style={{ ...card, fontSize: 12.5 }}>
                ⏱ <b>{diasAberto(r)}</b> dia(s) em aberto · {r.prazo ? (atraso > 0 ? <span style={{ color: '#dc2626', fontWeight: 700 }}>{atraso} dia(s) em atraso</span> : rest != null && !encerradaOuResolvida(r) ? <span><b>{rest}</b> dia(s) restantes (prazo {fmtD(r.prazo)})</span> : `prazo ${fmtD(r.prazo)}`) : 'sem prazo'}
              </div>
              <div style={grid}>
                <div><label style={lbl}>Setor competente</label><select style={inp} value={ed.responsavel_area ?? ''} onChange={e => setEd((o: any) => ({ ...o, responsavel_area: e.target.value, responsavel: '' }))}><option value="">—</option>{listaSetores(profiles).map(a => <option key={a}>{a}</option>)}</select></div>
                <div><label style={lbl}>Usuário responsável</label><select style={inp} value={ed.responsavel ?? ''} onChange={e => setEd((o: any) => ({ ...o, responsavel: e.target.value }))}>
                  <option value="">—</option>
                  {(usuariosDoSetor(profiles, ed.responsavel_area || '').length ? usuariosDoSetor(profiles, ed.responsavel_area || '') : usuariosDoSetor(profiles, '')).map(u => <option key={u.nome} value={u.nome}>{u.nome}{u.fone ? '' : ' (sem WhatsApp)'}</option>)}
                </select></div>
                {F('prazo', 'Data limite', 'date')}
                {S('categoria', 'Categoria', CATEGORIAS)}
                <div><label style={lbl}>Gravidade</label><select style={inp} value={ed.gravidade ?? 'media'} onChange={e => setEd((o: any) => ({ ...o, gravidade: e.target.value }))}>{GRAVIDADES.map(g => <option key={g.id} value={g.id}>{g.emoji} {g.label}</option>)}</select></div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {salvarBtn(['responsavel', 'responsavel_area', 'prazo', 'categoria', 'gravidade'], 'Direcionamento/prazo/classificação atualizados', async () => {
                  if (ed.responsavel && ed.responsavel !== r.responsavel)
                    await avisar(ed.responsavel, ed.responsavel_area, ed.prazo)
                })}
                {r.responsavel && <button onClick={() => avisar(r.responsavel, r.responsavel_area, r.prazo)} disabled={busy} style={{ ...btn('#166534', busy), marginTop: 10 }}>📲 Reenviar aviso ao responsável</button>}
              </div>
            </>
          )}

          {aba === 'recebimento' && (
            <>
              <div style={grid}>{F('fornecedor', 'Fornecedor')}{F('nf_numero', 'NF')}{F('nf_data', 'Data da NF', 'date')}{F('data_recebimento', 'Data do recebimento', 'date')}{F('local_recebimento', 'Local')}{F('recebedor', 'Recebedor')}{F('transportadora', 'Transportadora')}{F('lote', 'Lote')}{F('produto', 'Produto')}{F('unidade', 'Unidade de medida')}{F('qtd_solicitada', 'Qtd solicitada', 'number')}{F('qtd_recebida', 'Qtd recebida', 'number')}{F('valor_produto', 'Valor do produto (R$)', 'number')}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>PC vinculado: <b>{r.pedido_numero || 'nenhum'}</b> (definido na abertura).</div>
              {salvarBtn(['fornecedor', 'nf_numero', 'nf_data', 'data_recebimento', 'local_recebimento', 'recebedor', 'transportadora', 'lote', 'produto', 'unidade', 'qtd_solicitada', 'qtd_recebida', 'valor_produto'], 'Dados de recebimento atualizados')}
            </>
          )}

          {aba === 'desvio' && (
            <>
              {T('solicitado_txt', 'O que foi solicitado?', 2)}{T('recebido_txt', 'O que foi recebido?', 2)}{T('desvio_txt', 'Qual foi o desvio?', 4)}
              <label style={lbl}>Tipos de ocorrência</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 4 }}>{TIPOS.map(t => <label key={t} style={{ fontSize: 12.5, display: 'flex', gap: 6 }}><input type="checkbox" checked={(ed.tipos || []).includes(t)} onChange={() => toggleArr('tipos', t)} />{t}</label>)}</div>
              {salvarBtn(['solicitado_txt', 'recebido_txt', 'desvio_txt', 'tipos'], 'Desvio atualizado')}
            </>
          )}

          {aba === 'evidencias' && (
            <>
              <div style={{ ...card, display: 'grid', gridTemplateColumns: '160px 1fr auto', gap: 6, alignItems: 'end' }}>
                <div><label style={lbl}>Tipo</label><select style={inp} value={evTipo} onChange={e => setEvTipo(e.target.value)}>{EVID_TIPOS.map(t => <option key={t}>{t}</option>)}</select></div>
                <div><label style={lbl}>Descrição</label><input style={inp} value={evDesc} onChange={e => setEvDesc(e.target.value)} /></div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <label style={{ ...btn('#6b7280'), display: 'inline-block' }}>{evFile ? '✓ ' + evFile.name.slice(0, 12) : 'Arquivo'}<input type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => setEvFile(e.target.files?.[0] || null)} /></label>
                  <button onClick={addEvid} disabled={!evFile || busy} style={btn('var(--bordo)', !evFile || busy)}>+ Adicionar</button>
                </div>
              </div>
              {evids.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Nenhuma evidência anexada.</div>}
              {evids.map(e => (
                <div key={e.id} style={{ ...card, padding: 10, fontSize: 12.5, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <Galeria itens={[{ url: e.arquivo_url, rotulo: e.tipo }]} />
                  <div>
                  <a href={e.arquivo_url} target="_blank" rel="noreferrer" style={{ color: 'var(--bordo)', fontWeight: 700 }}>📎 Abrir {String(e.arquivo_url).split('/').pop()}</a>
                  <div>{e.tipo}{e.descricao ? ' — ' + e.descricao : ''}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{e.usuario} · {fmtDH(e.created_at)}</div>
                  </div>
                </div>
              ))}
            </>
          )}

          {aba === 'tratativa' && (
            <>
              <label style={lbl}>O que foi feito no recebimento?</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 4 }}>{TRATATIVAS.map(t => <label key={t} style={{ fontSize: 12.5, display: 'flex', gap: 6 }}><input type="checkbox" checked={(ed.tratativas || []).includes(t)} onChange={() => toggleArr('tratativas', t)} />{t}</label>)}</div>
              {T('tratativa_obs', 'Ação imediata * (o que foi feito agora e por quê)', 3)}
              {T('acao_corretiva', 'Ação corretiva — o que será feito para solucionar o problema atual?', 2)}
              {T('acao_preventiva', 'Ação preventiva — o que será feito para não voltar a acontecer?', 2)}
              {salvarBtn(['tratativas', 'tratativa_obs', 'acao_corretiva', 'acao_preventiva'], 'Tratativa e plano de ação atualizados', async () => { if (ed.tratativa_obs !== r.tratativa_obs) await sb.from('rnc').update({ acao_imediata: ed.tratativa_obs }).eq('id', r.id) })}
              <div style={{ ...card }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>💬 Comunicação com o fornecedor / registro</div>
                <textarea style={{ ...inp, resize: 'vertical' }} rows={2} value={nota} onChange={e => setNota(e.target.value)} placeholder="Ex.: fornecedor confirmou a substituição / solicitou fotos…" />
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <button onClick={() => registrarNota('fornecedor')} disabled={busy || !nota.trim()} style={btn('#7c3aed', busy || !nota.trim())}>📩 Posicionamento do fornecedor (avisa o responsável)</button>
                  <button onClick={() => registrarNota('comunicacao')} disabled={busy || !nota.trim()} style={btn('#6b7280', busy || !nota.trim())}>Registrar comunicação</button>
                </div>
              </div>
            </>
          )}

          {aba === 'fornecedor' && (
            <>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--bordo)' }}>🏭 RESPOSTA DO FORNECEDOR À TRATATIVA</div>
              {r.fornecedor_resposta_em && <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>Registrada por {r.fornecedor_resposta_por} em {fmtDH(r.fornecedor_resposta_em)}</div>}
              {T('fornecedor_resposta', 'O que ' + (r.fornecedor || 'o fornecedor') + ' respondeu / propôs (substituição, crédito, devolução…)', 3)}
              <div><label style={lbl}>Anexos da resposta (e-mail, foto, NF de devolução…)</label><AnexoUploader value={ed.fornecedor_resposta_anexos ?? null} onChange={v => setEd((o: any) => ({ ...o, fornecedor_resposta_anexos: v }))} pasta="rnc" label="" /></div>
              <Galeria itens={splitUrls(ed.fornecedor_resposta_anexos).map(u => ({ url: u, rotulo: 'Resposta do fornecedor' }))} />
              {salvarBtn(['fornecedor_resposta', 'fornecedor_resposta_anexos'], 'Resposta do fornecedor registrada', async () => {
                await sb.from('rnc').update({ fornecedor_resposta_por: userName, fornecedor_resposta_em: new Date().toISOString(), ...(r.status === 'aguardando_fornecedor' || r.status === 'aberta' || r.status === 'em_analise' ? { status: 'em_tratativa' } : {}) }).eq('id', r.id)
                if (r.responsavel && r.responsavel !== userName) await notificar(r.responsavel, '📩 *Resposta do fornecedor na ' + r.numero + '*\n\n' + (r.fornecedor || '') + ' — ' + String(ed.fornecedor_resposta || '').slice(0, 300) + '\n\n' + link + '\n_Amore Gestão_', 'RNC ' + r.numero, r.id)
              })}

              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--bordo)', marginTop: 10 }}>🛒 TRATATIVA DE COMPRAS</div>
              {r.compras_em && <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>Registrada por {r.compras_por} em {fmtDH(r.compras_em)}</div>}
              {T('compras_tratativa', 'Negociação e encaminhamento de Compras com o fornecedor', 3)}
              {salvarBtn(['compras_tratativa'], 'Tratativa de Compras registrada', async () => { await sb.from('rnc').update({ compras_por: userName, compras_em: new Date().toISOString() }).eq('id', r.id) })}

              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--bordo)', marginTop: 10 }}>✅ DEVOLUTIVA FINAL DO SETOR RESPONSÁVEL{r.responsavel_area ? ' (' + r.responsavel_area + ')' : ''}</div>
              {r.devolutiva_em && <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>Registrada por {r.devolutiva_por} em {fmtDH(r.devolutiva_em)}</div>}
              {T('devolutiva_final', 'Parecer final: como a RNC foi tratada e resolvida', 3)}
              {salvarBtn(['devolutiva_final'], 'Devolutiva final registrada', async () => { await sb.from('rnc').update({ devolutiva_por: userName, devolutiva_em: new Date().toISOString() }).eq('id', r.id) })}
              <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>Depois da devolutiva, feche a RNC na aba <b>Encerramento</b> — o fechamento dispara um aviso no WhatsApp e a RNC entra no Banco de dados.</div>
            </>
          )}

          {aba === 'causa' && (r.status === 'aberta' ? (
            <div style={{ ...card, fontSize: 12.5 }}>A análise da causa aparece quando a RNC avança para análise.
              <div><button onClick={() => mudarStatus('em_analise')} disabled={busy} style={{ ...btn('#ea580c', busy), marginTop: 8 }}>🟠 Avançar para "Em análise"</button></div>
            </div>
          ) : (
            <>
              {T('causa_provavel', 'Causa provável', 2)}{T('causa_raiz', 'Causa raiz', 2)}{S('causa_area', 'Área responsável pela causa', AREAS)}
              <div><label style={lbl}>Evidências da causa (anexos)</label><AnexoUploader value={ed.causa_evidencias ?? null} onChange={v => setEd((o: any) => ({ ...o, causa_evidencias: v }))} pasta="rnc" label="" /></div>
              <Galeria itens={splitUrls(ed.causa_evidencias).map(u => ({ url: u, rotulo: 'Evidência da causa' }))} />
              {salvarBtn(['causa_provavel', 'causa_raiz', 'causa_area', 'causa_evidencias'], 'Análise de causa atualizada')}
            </>
          ))}

          {aba === 'acoes' && (
            <>
              <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Ações corretivas/preventivas viram tarefas vinculadas na Central de Tarefas.</div>
              {tarefas.map(t => <div key={t.id} style={{ ...card, padding: 10, fontSize: 12.5, display: 'flex', justifyContent: 'space-between' }}><span>#{String(t.numero ?? '').padStart(4, '0')} · {t.titulo}<br /><span style={{ color: 'var(--muted)' }}>{t.responsavel_nome || '—'} · prazo {fmtD(t.prazo)}</span></span><span style={{ fontWeight: 700 }}>{t.status}</span></div>)}
              {tarefas.length === 0 && <div style={{ fontSize: 12.5 }}>Nenhuma ação vinculada ainda.</div>}
              <div style={{ ...card, display: 'grid', gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>+ Nova ação</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {r.acao_corretiva && <button onClick={() => setAc(a => ({ ...a, titulo: r.acao_corretiva, tipo: 'Corretiva' }))} style={btn('#6b7280')}>Usar ação corretiva</button>}
                  {r.acao_preventiva && <button onClick={() => setAc(a => ({ ...a, titulo: r.acao_preventiva, tipo: 'Preventiva' }))} style={btn('#6b7280')}>Usar ação preventiva</button>}
                </div>
                <input style={inp} placeholder="Ação (ex.: alterar procedimento de conferência de camarão)" value={ac.titulo} onChange={e => setAc(a => ({ ...a, titulo: e.target.value }))} />
                <div style={grid}>
                  <select style={inp} value={ac.tipo} onChange={e => setAc(a => ({ ...a, tipo: e.target.value }))}><option>Corretiva</option><option>Preventiva</option></select>
                  <select style={inp} value={ac.responsavel} onChange={e => setAc(a => ({ ...a, responsavel: e.target.value }))}><option value="">Responsável…</option>{responsaveis.map((n: string) => <option key={n}>{n}</option>)}</select>
                  <input type="date" style={inp} value={ac.prazo} onChange={e => setAc(a => ({ ...a, prazo: e.target.value }))} />
                </div>
                <button onClick={enviarTarefa} disabled={busy} style={btn('#166534', busy)}>Enviar para Central de Tarefas</button>
              </div>
            </>
          )}

          {aba === 'devolucao' && (
            <DevolucaoForm r={r} busy={busy} onSave={(d: any) => salvar({ devolucao: d, tratativas: (r.tratativas || []).includes('Produto devolvido') ? r.tratativas : [...(r.tratativas || []), 'Produto devolvido'] }, 'Devolução atualizada')} />
          )}

          {aba === 'encerramento' && (
            <>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--bordo)' }}>💰 IMPACTO FINANCEIRO</div>
              <div style={grid}>{F('valor_total_afetado', 'Valor total afetado (R$)', 'number')}{F('valor_devolvido', 'Valor devolvido (R$)', 'number')}{F('valor_credito', 'Crédito solicitado (R$)', 'number')}{F('valor_abatimento', 'Abatimento (R$)', 'number')}{F('custo_adicional', 'Custo adicional (R$)', 'number')}{F('perda', 'Perda identificada (R$)', 'number')}</div>
              <div style={{ ...card, fontSize: 12.5 }}>
                Recuperado (devolução + crédito + abatimento): <b>{brl((Number(ed.valor_devolvido) || 0) + (Number(ed.valor_credito) || 0) + (Number(ed.valor_abatimento) || 0))}</b><br />
                Impacto líquido (perda + custo adicional): <b style={{ color: '#dc2626' }}>{brl((Number(ed.perda) || 0) + (Number(ed.custo_adicional) || 0))}</b>
              </div>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--bordo)', marginTop: 6 }}>✅ ENCERRAMENTO</div>
              {T('solucao', 'Solução aplicada *', 3)}
              <div style={grid}>
                <div><label style={lbl}>Resultado *</label><select style={inp} value={ed.resultado ?? ''} onChange={e => setEd((o: any) => ({ ...o, resultado: e.target.value }))}><option value="">—</option>{RESULTADOS.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select></div>
                <div><label style={lbl}>Foi eficaz? *</label><select style={inp} value={ed.eficaz == null ? '' : String(ed.eficaz)} onChange={e => setEd((o: any) => ({ ...o, eficaz: e.target.value === '' ? null : e.target.value === 'true' }))}><option value="">—</option><option value="true">Sim</option><option value="false">Não</option></select></div>
                <div><label style={lbl}>Necessita ação preventiva? *</label><select style={inp} value={ed.necessita_preventiva == null ? '' : String(ed.necessita_preventiva)} onChange={e => setEd((o: any) => ({ ...o, necessita_preventiva: e.target.value === '' ? null : e.target.value === 'true' }))}><option value="">—</option><option value="true">Sim</option><option value="false">Não</option></select></div>
              </div>
              <div><label style={lbl}>Evidência da solução</label><AnexoUploader value={ed.evidencia_solucao ?? null} onChange={v => setEd((o: any) => ({ ...o, evidencia_solucao: v }))} pasta="rnc" label="" /></div>
              <Galeria itens={splitUrls(ed.evidencia_solucao).map(u => ({ url: u, rotulo: 'Evidência da solução' }))} />
              {T('obs_final', 'Observações finais', 2)}
              {salvarBtn(['valor_total_afetado', 'valor_devolvido', 'valor_credito', 'valor_abatimento', 'custo_adicional', 'perda', 'solucao', 'resultado', 'eficaz', 'necessita_preventiva', 'evidencia_solucao', 'obs_final'], 'Financeiro/encerramento atualizado')}

              <div style={{ ...card, marginTop: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--bordo)', marginBottom: 6 }}>📄 FECHAMENTO DA RNC <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(reúne tudo o que foi salvo — salve os campos acima antes)</span></div>
                <pre style={{ fontSize: 12, background: 'var(--bg)', borderRadius: 8, padding: 10, margin: 0, whiteSpace: 'pre-wrap', maxHeight: 320, overflowY: 'auto' }}>{fechamentoTexto().replace(/[*]/g, '').replace(/_Amore Gestão_/, '')}</pre>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                  <button onClick={enviarFechamento} disabled={busy || !r.aberto_por} style={btn('#166534', busy || !r.aberto_por)}>📲 Enviar fechamento ao solicitante{r.aberto_por ? ' (' + r.aberto_por + ')' : ''}</button>
                  <button onClick={() => { navigator.clipboard?.writeText(fechamentoTexto()); alert('Texto copiado.') }} style={btn('#6b7280')}>📋 Copiar</button>
                  <button onClick={imprimirFechamento} style={btn('#374151')}>🖨️ Imprimir / PDF</button>
                </div>
              </div>

              <div style={{ ...card, marginTop: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>🔵 VALIDAÇÃO ANTES DE ENCERRAR <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(salve os campos acima para atualizar)</span></div>
                {checks.map(c => <div key={c.txt} style={{ fontSize: 12.5, color: c.ok ? '#166534' : '#b91c1c' }}>{c.ok ? '☑' : '☐'} {c.txt}</div>)}
                {r.status === 'encerrada' ? (
                  <div style={{ marginTop: 10, fontSize: 12.5 }}>⚫ Encerrada por <b>{r.encerrado_por}</b> em {fmtDH(r.encerrado_em)}
                    <div><button onClick={() => mudarStatus('em_tratativa', { encerrado_por: null, encerrado_em: null })} disabled={busy} style={{ ...btn('#6b7280', busy), marginTop: 6 }}>Reabrir RNC</button></div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    {r.status !== 'resolvida' && <button onClick={() => mudarStatus('resolvida')} disabled={busy || !(r.solucao || '').trim()} style={btn('#16a34a', busy || !(r.solucao || '').trim())}>🟢 Marcar como Resolvida (aguarda validação)</button>}
                    <button onClick={encerrar} disabled={busy || !tudoOk} style={btn('#374151', busy || !tudoOk)}>⚫ ENCERRAR RNC</button>
                  </div>
                )}
              </div>
            </>
          )}

          {aba === 'historico' && (
            <>
              {hist.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Sem eventos.</div>}
              {hist.map(h => (
                <div key={h.id} style={{ borderLeft: '2px solid var(--border)', paddingLeft: 10, marginLeft: 4 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700 }}>{h.acao}</div>
                  {h.detalhe && <div style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{h.detalhe}</div>}
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{h.usuario} · {fmtDH(h.created_at)}</div>
                </div>
              ))}
              {r.causa_evidencias && <div><label style={lbl}>Anexos da causa</label><AnexoLinks value={r.causa_evidencias} compact /></div>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function DevolucaoForm({ r, busy, onSave }: { r: any; busy: boolean; onSave: (d: any) => void }) {
  const habilitada = (r.tratativas || []).includes('Produto devolvido') || !!r.devolucao
  const [d, setD] = useState<any>(r.devolucao || { produto: r.produto || '', lote: r.lote || '' })
  useEffect(() => { setD(r.devolucao || { produto: r.produto || '', lote: r.lote || '' }) }, [r.devolucao, r.produto, r.lote])
  const [on, setOn] = useState(habilitada)
  const set = (k: string, v: any) => setD((o: any) => ({ ...o, [k]: v }))
  const fld = (k: string, label: string, type = 'text') => <div><label style={lbl}>{label}</label><input type={type} style={inp} value={d[k] ?? ''} onChange={e => set(k, e.target.value)} /></div>
  if (!on) return <div style={{ ...card, fontSize: 12.5 }}>Esta RNC não tem devolução. <button onClick={() => setOn(true)} style={{ ...btn('#7c3aed'), marginLeft: 8 }}>↩️ Registrar devolução</button></div>
  return (
    <>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>Vínculo: RNC → Devolução → NF → Estoque</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
        {fld('motivo', 'Motivo')}{fld('produto', 'Produto')}{fld('quantidade', 'Quantidade', 'number')}{fld('lote', 'Lote')}{fld('nf_devolucao', 'NF de devolução')}{fld('data_devolucao', 'Data da devolução', 'date')}
        {fld('transportadora', 'Transportadora')}{fld('data_coleta', 'Data da coleta', 'date')}{fld('autorizador', 'Autorizador')}{fld('responsavel', 'Responsável')}{fld('retorno_esperado', 'Retorno esperado (crédito/substituição)')}{fld('data_prevista', 'Data prevista', 'date')}
      </div>
      <div><label style={lbl}>Evidência da devolução</label><AnexoUploader value={d.evidencia ?? null} onChange={v => set('evidencia', v)} pasta="rnc" label="" /></div>
      <button onClick={() => onSave(d)} disabled={busy} style={{ ...btn('var(--bordo)', busy), alignSelf: 'flex-start' }}>💾 Salvar devolução</button>
    </>
  )
}
