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

      {showNova && <NovaRnc profiles={profiles} responsaveis={responsaveis} lojas={lojas} lojaAtual={loja} userName={userName} notificar={notificar}
        onClose={() => setShowNova(false)} onSaved={(id: string) => { setShowNova(false); load(); setSelId(id) }} />}
      {selecionada && <RncDetalhe r={selecionada} responsaveis={responsaveis} userName={userName} notificar={notificar} onClose={() => setSelId(null)} onChanged={load} />}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// NOVA RNC
// ══════════════════════════════════════════════════════════════
function NovaRnc({ responsaveis, lojas, lojaAtual, userName, notificar, onClose, onSaved }: any) {
  const lojasOk: string[] = lojas.filter((l: string) => l && l !== 'Todas as Lojas')
  const [f, setF] = useState<any>({
    loja: lojaAtual && lojaAtual !== 'Todas as Lojas' ? lojaAtual : (lojasOk[0] || ''), setor: 'Recebimento', centro_custo: '', tipos: [] as string[],
    pedido_id: null, pedido_numero: '', fornecedor: '', produto: '', unidade: '', qtd_solicitada: '', valor_produto: '',
    nf_numero: '', nf_data: '', data_recebimento: new Date().toISOString().slice(0, 10), local_recebimento: '', recebedor: userName, transportadora: '', lote: '', qtd_recebida: '',
    solicitado_txt: '', recebido_txt: '', desvio_txt: '', categoria: 'Produto', gravidade: 'media', tratativas: [] as string[], tratativa_obs: '', responsavel: '', responsavel_area: '', prazo: '',
  })
  const set = (k: string, v: any) => setF((o: any) => ({ ...o, [k]: v }))
  const toggle = (k: string, v: string) => setF((o: any) => ({ ...o, [k]: o[k].includes(v) ? o[k].filter((x: string) => x !== v) : [...o[k], v] }))
  const [busca, setBusca] = useState(''); const [achados, setAchados] = useState<any[]>([]); const [itens, setItens] = useState<any[]>([])
  const [evid, setEvid] = useState<{ file: File; tipo: string; descricao: string }[]>([])
  const [evTipo, setEvTipo] = useState(EVID_TIPOS[0]); const [evDesc, setEvDesc] = useState('')
  const [salvando, setSalvando] = useState(false)

  const buscarPC = async () => {
    if (busca.trim().length < 2) return
    const { data } = await sb.from('pedidos_compra').select('id,numero,fornecedor,loja,total,created_at').ilike('numero', `%${busca.trim()}%`).order('created_at', { ascending: false }).limit(10)
    setAchados(data || [])
  }
  const escolherPC = async (p: any) => {
    setF((o: any) => ({ ...o, pedido_id: p.id, pedido_numero: p.numero, fornecedor: p.fornecedor || o.fornecedor, loja: lojasOk.includes(p.loja) ? p.loja : o.loja }))
    setAchados([])
    const { data } = await sb.from('pedido_compra_itens').select('*').eq('pedido_id', p.id).order('created_at')
    setItens(data || [])
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
    if (!f.responsavel || !f.prazo) { alert('Defina o responsável pela tratativa e o prazo.'); return }
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
        desvio_txt: f.desvio_txt.trim(), tratativas: f.tratativas, tratativa_obs: f.tratativa_obs.trim(), responsavel: f.responsavel, responsavel_area: f.responsavel_area || null, prazo: f.prazo, aberto_por: userName,
      }
      const { data: nova, error } = await sb.from('rnc').insert(row).select('id, numero').single()
      if (error || !nova) { alert('Falha ao abrir a RNC: ' + (error?.message || '')); setSalvando(false); return }
      const log = (acao: string, detalhe?: string) => sb.from('rnc_historico').insert({ rnc_id: nova.id, acao, detalhe: detalhe || null, usuario: userName })
      await log('RNC aberta', `${f.categoria} · gravidade ${gravInfo(f.gravidade).label} · ${f.desvio_txt.trim()}`)
      await log('Responsável designado', `${f.responsavel} · prazo ${fmtD(f.prazo)}`)
      await log('Tratativa imediata registrada', `${f.tratativas.join(', ') || 'sem opção marcada'} — ${f.tratativa_obs.trim()}`)
      for (const ev of evid) {
        try {
          const url = await uploadAnexo(ev.file, 'rnc')
          await sb.from('rnc_evidencias').insert({ rnc_id: nova.id, tipo: ev.tipo, arquivo_url: url, descricao: ev.descricao || null, usuario: userName })
          await log('Evidência anexada', `${ev.tipo}${ev.descricao ? ' — ' + ev.descricao : ''}`)
        } catch (e) { console.error(e) }
      }
      if (f.responsavel && f.responsavel !== userName) {
        await notificar(f.responsavel, `🔴 *Nova RNC atribuída a você*\n\n${nova.numero} · ${f.loja}\nFornecedor: ${f.fornecedor || '—'}\nProduto: ${f.produto || '—'}\nDesvio: ${f.desvio_txt.trim()}\nGravidade: ${gravInfo(f.gravidade).emoji} ${gravInfo(f.gravidade).label}\nPrazo: ${fmtD(f.prazo)}\n\n${siteOrigin()}/?page=tarefas&rnc=${nova.id}\n_Amore Gestão_`, `RNC ${nova.numero}`, nova.id)
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

        {sec('2 · PEDIDO DE COMPRA → RECEBIMENTO (rastreabilidade PC → NF → Recebimento → Estoque → RNC)')}
        <div style={{ display: 'flex', gap: 6 }}>
          <input style={inp} value={busca} onChange={e => setBusca(e.target.value)} onKeyDown={e => e.key === 'Enter' && buscarPC()} placeholder="Buscar Pedido de Compra pelo número (ex.: PED-0033)" />
          <button onClick={buscarPC} style={btn()}>Buscar PC</button>
        </div>
        {achados.map(p => <div key={p.id} onClick={() => escolherPC(p)} style={{ fontSize: 12.5, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 8, marginTop: 4, cursor: 'pointer' }}>{p.numero} · {p.fornecedor || '—'} · {p.loja} · {brl(p.total)}</div>)}
        {f.pedido_numero && <div style={{ fontSize: 12.5, marginTop: 6, color: '#166534' }}>✅ PC vinculado: <b>{f.pedido_numero}</b> — {f.fornecedor}</div>}
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
        {evid.map((e, i) => <div key={i} style={{ fontSize: 12, marginTop: 4 }}>📎 {e.file.name} · {e.tipo}{e.descricao ? ' — ' + e.descricao : ''} <button onClick={() => setEvid(v => v.filter((_, j) => j !== i))} style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer' }}>remover</button></div>)}

        {sec('5 · CLASSIFICAÇÃO')}
        <div style={grid2}>
          <div><label style={lbl}>Categoria principal</label><select style={inp} value={f.categoria} onChange={e => set('categoria', e.target.value)}>{CATEGORIAS.map(c => <option key={c}>{c}</option>)}</select></div>
          <div><label style={lbl}>Gravidade</label>
            <div style={{ display: 'flex', gap: 4 }}>{GRAVIDADES.map(g => <button key={g.id} onClick={() => set('gravidade', g.id)} style={{ flex: 1, padding: '7px 2px', borderRadius: 8, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', border: `1px solid ${f.gravidade === g.id ? g.cor : 'var(--border)'}`, background: f.gravidade === g.id ? g.cor : 'var(--bg)', color: f.gravidade === g.id ? '#fff' : 'var(--text)' }}>{g.emoji} {g.label}</button>)}</div>
          </div>
        </div>

        {sec('6 · TRATATIVA IMEDIATA')}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 4 }}>
          {TRATATIVAS.map(t => <label key={t} style={{ fontSize: 12.5, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={f.tratativas.includes(t)} onChange={() => toggle('tratativas', t)} />{t}</label>)}
        </div>
        <label style={{ ...lbl, marginTop: 8 }}>Observação da tratativa * (explique a decisão)</label>
        <textarea style={{ ...inp, resize: 'vertical' }} rows={2} value={f.tratativa_obs} onChange={e => set('tratativa_obs', e.target.value)} />

        {sec('7 · RESPONSÁVEL E PRAZO')}
        <div style={grid2}>
          <div><label style={lbl}>Responsável pela tratativa *</label><select style={inp} value={f.responsavel} onChange={e => set('responsavel', e.target.value)}><option value="">Selecionar…</option>{responsaveis.map((n: string) => <option key={n}>{n}</option>)}</select></div>
          <div><label style={lbl}>Área</label><select style={inp} value={f.responsavel_area} onChange={e => set('responsavel_area', e.target.value)}><option value="">—</option>{AREAS.map(a => <option key={a}>{a}</option>)}</select></div>
          {F('prazo', 'Data limite *', 'date')}
        </div>

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
function RncDetalhe({ r, responsaveis, userName, notificar, onClose, onChanged }: any) {
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
    { ok: !!(r.solucao || '').trim() && !!r.resultado && r.eficaz != null && r.necessita_preventiva != null, txt: 'Solução validada (solução, resultado, eficácia e necessidade preventiva)' },
  ]
  const tudoOk = checks.every(c => c.ok)
  const encerrar = async () => {
    if (!tudoOk) return
    await salvar({ status: 'encerrada', encerrado_por: userName, encerrado_em: new Date().toISOString() }, 'RNC encerrada')
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

  const ABAS = [['resumo', 'Resumo'], ['recebimento', 'Recebimento'], ['desvio', 'Desvio'], ['evidencias', `Evidências (${evids.length})`], ['tratativa', 'Tratativa'], ['causa', 'Causa'], ['acoes', `Ações (${ids.length})`], ['devolucao', 'Devolução'], ['encerramento', 'Encerramento'], ['historico', `Histórico (${hist.length})`]]
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
          {aba === 'resumo' && (
            <>
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
                <div><label style={lbl}>Responsável</label><select style={inp} value={ed.responsavel ?? ''} onChange={e => setEd((o: any) => ({ ...o, responsavel: e.target.value }))}><option value="">—</option>{responsaveis.map((n: string) => <option key={n}>{n}</option>)}</select></div>
                {S('responsavel_area', 'Área', AREAS)}{F('prazo', 'Data limite', 'date')}
                {S('categoria', 'Categoria', CATEGORIAS)}
                <div><label style={lbl}>Gravidade</label><select style={inp} value={ed.gravidade ?? 'media'} onChange={e => setEd((o: any) => ({ ...o, gravidade: e.target.value }))}>{GRAVIDADES.map(g => <option key={g.id} value={g.id}>{g.emoji} {g.label}</option>)}</select></div>
              </div>
              {salvarBtn(['responsavel', 'responsavel_area', 'prazo', 'categoria', 'gravidade'], 'Responsável/prazo/classificação atualizados', async () => {
                if (ed.responsavel && ed.responsavel !== r.responsavel && ed.responsavel !== userName)
                  await notificar(ed.responsavel, `🔴 *RNC atribuída a você*\n\n${r.numero} · ${r.fornecedor || ''} · ${r.produto || ''}\nPrazo: ${fmtD(ed.prazo)}\n\n${link}\n_Amore Gestão_`, `RNC ${r.numero}`, r.id)
              })}
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
                <div key={e.id} style={{ ...card, padding: 10, fontSize: 12.5 }}>
                  <a href={e.arquivo_url} target="_blank" rel="noreferrer" style={{ color: 'var(--bordo)', fontWeight: 700 }}>📎 {String(e.arquivo_url).split('/').pop()}</a>
                  <div>{e.tipo}{e.descricao ? ' — ' + e.descricao : ''}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{e.usuario} · {fmtDH(e.created_at)}</div>
                </div>
              ))}
            </>
          )}

          {aba === 'tratativa' && (
            <>
              <label style={lbl}>O que foi feito no recebimento?</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 4 }}>{TRATATIVAS.map(t => <label key={t} style={{ fontSize: 12.5, display: 'flex', gap: 6 }}><input type="checkbox" checked={(ed.tratativas || []).includes(t)} onChange={() => toggleArr('tratativas', t)} />{t}</label>)}</div>
              {T('tratativa_obs', 'Observação da tratativa * (obrigatória)', 3)}
              {salvarBtn(['tratativas', 'tratativa_obs'], 'Tratativa atualizada')}
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

          {aba === 'causa' && (r.status === 'aberta' ? (
            <div style={{ ...card, fontSize: 12.5 }}>A análise da causa aparece quando a RNC avança para análise.
              <div><button onClick={() => mudarStatus('em_analise')} disabled={busy} style={{ ...btn('#ea580c', busy), marginTop: 8 }}>🟠 Avançar para "Em análise"</button></div>
            </div>
          ) : (
            <>
              {T('causa_provavel', 'Causa provável', 2)}{T('causa_raiz', 'Causa raiz', 2)}{S('causa_area', 'Área responsável pela causa', AREAS)}
              <div><label style={lbl}>Evidências da causa (anexos)</label><AnexoUploader value={ed.causa_evidencias ?? null} onChange={v => setEd((o: any) => ({ ...o, causa_evidencias: v }))} pasta="rnc" label="" /></div>
              {T('acao_corretiva', 'Ação corretiva — o que será feito para solucionar o problema atual?', 2)}{T('acao_preventiva', 'Ação preventiva — o que será feito para não voltar a acontecer?', 2)}
              {salvarBtn(['causa_provavel', 'causa_raiz', 'causa_area', 'causa_evidencias', 'acao_corretiva', 'acao_preventiva'], 'Análise de causa atualizada')}
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
              {T('obs_final', 'Observações finais', 2)}
              {salvarBtn(['valor_total_afetado', 'valor_devolvido', 'valor_credito', 'valor_abatimento', 'custo_adicional', 'perda', 'solucao', 'resultado', 'eficaz', 'necessita_preventiva', 'evidencia_solucao', 'obs_final'], 'Financeiro/encerramento atualizado')}

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
