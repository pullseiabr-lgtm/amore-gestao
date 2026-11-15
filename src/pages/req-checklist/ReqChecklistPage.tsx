import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { useLoja } from '../../contexts/LojaContext'
import { siteOrigin } from '../../lib/site'
import { enviarWhatsApp } from '../../lib/notify'
import { rpcErro } from '../alimentacao/aliLib'
import { Btn, Modal, Pill, card, grid, inp, lbl } from '../plantao/plantaoUi'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any

type Base = {
  k: string; nome: string; cat: string; un: string; saldo: number; min: number | null; ideal: number | null; no_cadastro: boolean
  compras_n: number; compras_qtd: number; entradas: number; saidas: number; consumo_mensal: number; consumo_semanal: number
  freq_dias: number | null; ult_compra: string | null; ult_mov: string | null; habitual: boolean; sem_mov: boolean
  tendencia: 'crescente' | 'decrescente' | 'estavel' | null; s30: number; s60: number
}
type Linha = { k: string; nome: string; cat: string; un: string; conf: boolean; fisico: number | null; qtd: number; obs: string; extra: boolean }
type Final = Linha & { saldo: number | null; consumo_mensal: number | null; habitual: boolean; diferenca: number | null; ult_compra: string | null; tendencia: string | null }
type Conf = {
  id: string; token: string; origem: 'link' | 'interna'; loja: string; solicitante: string; dias: number; validade: string | null
  status: 'aguardando' | 'em_preenchimento' | 'enviada' | 'cancelada'; itens: Linha[]; itens_final: Final[] | null
  protocolo: string | null; requisicao_id: string | null; requisicao_numero: number | null
  aberto_em: string | null; enviado_em: string | null; enviado_por: string | null; notificado_em: string | null
  created_at: string; updated_at: string; criado_por: string | null
}
type Ocorrencia = { id: string; conf_id: string; produto: string; unidade: string | null; saldo_sistema: number | null; qtd_fisica: number | null; diferenca: number | null; obs: string | null; status: string; criado_por: string | null; created_at: string }

const LOJAS_PADRAO = ['Amore CD', 'Amore Paiva', 'Flow CD']
const REQ_ST: Record<string, [string, string]> = {
  enviada: ['Aguardando análise/aprovação', '#B45309'], aprovada: ['Aprovada', '#15803D'], em_cotacao: ['Em cotação', '#0369A1'],
  compra_realizada: ['Compra realizada', '#15803D'], concluida: ['Concluída', '#15803D'], reprovada: ['Reprovada', '#B91C1C'], cancelada: ['Cancelada', '#B91C1C'], rascunho: ['Rascunho', '#6b7280'],
}
const APROVADORES = [{ nome: 'Wagner', fone: '5581994135602' }, { nome: 'Aline', fone: '5581994573420' }]
const fmtD = (d?: string | null) => (d ? new Date(d).toLocaleDateString('pt-BR') : '—')
const fmtDH = (d?: string | null) => (d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—')
const n2 = (v: number | null | undefined) => (v == null ? '—' : String(Math.round(v * 100) / 100).replace('.', ','))
const num = (v: string) => { if (v.trim() === '') return null; const n = parseFloat(v.replace(',', '.')); return isNaN(n) ? null : n }
const diasDesde = (d?: string | null) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : null)
/** Divergência relevante: |físico − sistema| ≥ 1 e ≥ 10% do saldo do sistema (ou saldo zero com físico > 0). */
export const divRelevante = (saldo: number | null | undefined, fisico: number | null | undefined) => {
  if (fisico == null || saldo == null) return false
  const d = Math.abs(fisico - saldo)
  return d >= 1 && (saldo === 0 || d / Math.abs(saldo) >= 0.1)
}
const statusConf = (c: Conf): [string, string] => {
  if (c.status === 'enviada') return ['Enviada', '#15803D']
  if (c.status === 'cancelada') return ['Cancelada', '#B91C1C']
  if (c.validade && new Date(c.validade) < new Date()) return ['Expirada', '#6b7280']
  return c.status === 'aguardando' ? ['Aguardando abertura', '#0369A1'] : ['Em preenchimento', '#B45309']
}
const linkDe = (c: Conf) => `${siteOrigin()}/requisicao-inteligente.html?t=${c.token}`
async function copiar(t: string) { try { await navigator.clipboard.writeText(t); return true } catch { return false } }

type Aba = 'conferencia' | 'links' | 'historico'

export default function ReqChecklistPage() {
  const { user } = useAuth()
  const { theme } = useTheme()
  const { loja: lojaCtx } = useLoja()
  const lojas = theme.stores?.length ? theme.stores : LOJAS_PADRAO
  const quem = (user?.name || 'Usuário').trim()
  const [aba, setAba] = useState<Aba>('conferencia')
  const [msg, setMsg] = useState('')
  const toast = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3500) }

  return (
    <div style={{ padding: '18px 16px 60px', maxWidth: 1200, margin: '0 auto' }}>
      {msg && <div style={{ position: 'fixed', top: 14, left: '50%', transform: 'translateX(-50%)', background: '#222', color: '#fff', padding: '10px 18px', borderRadius: 99, zIndex: 2000, fontSize: 13.5, maxWidth: '90vw' }}>{msg}</div>}
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 2 }}>🧠 Requisição Inteligente + Checklist de Consumo</div>
      <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 12 }}>A requisição não começa vazia: parte de tudo que a loja comprou, consumiu ou movimentou. Enviar não é aprovar — gera uma requisição oficial no fluxo de Compras.</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {([['conferencia', '📊 Consumo & Conferência'], ['links', '🔗 Requisição por link'], ['historico', '🗂️ Histórico & Ocorrências']] as [Aba, string][]).map(([id, l]) => (
          <button key={id} onClick={() => setAba(id)} style={{ padding: '8px 15px', fontSize: 13, fontWeight: 700, borderRadius: 10, cursor: 'pointer', border: aba === id ? '1px solid var(--bordo)' : '1px solid var(--border)', background: aba === id ? 'var(--bordo)' : 'transparent', color: aba === id ? '#fff' : 'var(--muted)' }}>{l}</button>
        ))}
      </div>
      {aba === 'conferencia' && <Conferencia lojas={lojas} lojaInicial={lojas.includes(lojaCtx) ? lojaCtx : lojas[0]} quem={quem} toast={toast} />}
      {aba === 'links' && <Links lojas={lojas} quem={quem} toast={toast} modo="links" />}
      {aba === 'historico' && <Links lojas={lojas} quem={quem} toast={toast} modo="historico" />}
    </div>
  )
}

// ───────────────────────── Aba 1: painel de consumo + checklist interno ─────────────────────────
type Filtro = 'todos' | 'consumo' | 'semmov' | 'habitual' | 'eventual' | 'recente' | 'cresc' | 'decresc' | 'diverg' | 'pend'

function Conferencia({ lojas, lojaInicial, quem, toast }: { lojas: string[]; lojaInicial: string; quem: string; toast: (m: string) => void }) {
  const [loja, setLoja] = useState(lojaInicial)
  const [dias, setDias] = useState(90)
  const [base, setBase] = useState<Base[]>([])
  const [loading, setLoading] = useState(false)
  const [linhas, setLinhas] = useState<Record<string, Linha>>({})
  const [conf, setConf] = useState<Conf | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [busca, setBusca] = useState('')
  const [enviando, setEnviando] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const confRef = useRef<Conf | null>(null)
  confRef.current = conf

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await sb.rpc('ri_base', { p_loja: loja, p_dias: dias })
      if (error) throw error
      setBase((data || []) as Base[])
      // retoma conferência interna em andamento desta loja/usuário
      const { data: abertas } = await sb.from('ri_conf').select('*').eq('origem', 'interna').eq('loja', loja).eq('criado_por', quem).eq('status', 'em_preenchimento').order('updated_at', { ascending: false }).limit(1)
      const c = (abertas?.[0] || null) as Conf | null
      setConf(c)
      const m: Record<string, Linha> = {}
      ;(c?.itens || []).forEach(i => { m[i.k] = i })
      setLinhas(m)
    } catch (e) { toast('Erro ao carregar: ' + rpcErro(e)) } finally { setLoading(false) }
  }, [loja, dias, quem, toast])
  useEffect(() => { carregar() }, [carregar])

  const payload = (m: Record<string, Linha>) => Object.values(m).filter(i => i.conf || i.qtd > 0 || i.fisico != null)
  const persistir = (m: Record<string, Linha>) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      try {
        let c = confRef.current
        if (!c) {
          const { data, error } = await sb.rpc('ri_criar', { p_loja: loja, p_solic: quem, p_dias: dias, p_valid_dias: 1, p_origem: 'interna', p_por: quem })
          if (error) throw error
          const { data: row } = await sb.from('ri_conf').select('*').eq('id', data.id).single()
          c = row as Conf; setConf(c)
        }
        const { error } = await sb.rpc('ri_salvar', { p_token: c.token, p_itens: payload(m) })
        if (error) throw error
      } catch (e) { toast('Rascunho não salvo: ' + rpcErro(e)) }
    }, 1200)
  }
  const setL = (b: Base, patch: Partial<Linha>) => {
    setLinhas(prev => {
      const atual = prev[b.k] || { k: b.k, nome: b.nome, cat: b.cat, un: b.un, conf: false, fisico: null, qtd: 0, obs: '', extra: false }
      const m = { ...prev, [b.k]: { ...atual, ...patch } }
      persistir(m); return m
    })
  }
  const feito = (k: string) => { const l = linhas[k]; return !!l && (l.conf || l.qtd > 0 || l.fisico != null) }

  const kpi = useMemo(() => ({
    total: base.length,
    consumo: base.filter(b => b.saidas > 0).length,
    semmov: base.filter(b => b.sem_mov).length,
    habitual: base.filter(b => b.habitual).length,
    eventual: base.filter(b => !b.habitual).length,
    recente: base.filter(b => (diasDesde(b.ult_compra) ?? 999) <= 14).length,
    cresc: base.filter(b => b.tendencia === 'crescente').length,
    decresc: base.filter(b => b.tendencia === 'decrescente').length,
  }), [base])

  const filtrada = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return base.filter(b => {
      if (q && !b.nome.toLowerCase().includes(q)) return false
      switch (filtro) {
        case 'consumo': return b.saidas > 0
        case 'semmov': return b.sem_mov
        case 'habitual': return b.habitual
        case 'eventual': return !b.habitual
        case 'recente': return (diasDesde(b.ult_compra) ?? 999) <= 14
        case 'cresc': return b.tendencia === 'crescente'
        case 'decresc': return b.tendencia === 'decrescente'
        case 'diverg': return divRelevante(b.saldo, linhas[b.k]?.fisico)
        case 'pend': return !feito(b.k)
        default: return true
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, busca, filtro, linhas])

  const porCat = useMemo(() => {
    const m: Record<string, Base[]> = {}
    filtrada.forEach(b => { (m[b.cat || 'Sem categoria'] = m[b.cat || 'Sem categoria'] || []).push(b) })
    Object.values(m).forEach(a => a.sort((x, y) => Number(y.habitual) - Number(x.habitual) || x.nome.localeCompare(y.nome)))
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0]))
  }, [filtrada])

  const nConf = base.filter(b => feito(b.k)).length
  const nRepor = base.filter(b => (linhas[b.k]?.qtd || 0) > 0).length
  const nDiv = base.filter(b => divRelevante(b.saldo, linhas[b.k]?.fisico)).length

  const sugerir = () => {
    setLinhas(prev => {
      const m = { ...prev }
      base.forEach(b => {
        const l = m[b.k]
        if ((l?.qtd || 0) > 0 || !b.ideal || b.ideal <= 0) return
        const ref = l?.fisico ?? b.saldo
        const sug = Math.max(0, Math.ceil((b.ideal - ref) * 100) / 100)
        if (sug > 0) m[b.k] = { ...(l || { k: b.k, nome: b.nome, cat: b.cat, un: b.un, conf: false, fisico: null, obs: '', extra: false }), qtd: sug, conf: true } as Linha
      })
      persistir(m); return m
    })
    toast('Sugestões aplicadas (ideal − saldo). Revise antes de finalizar.')
  }

  const finalizar = async () => {
    if (nRepor === 0) { toast('Informe a quantidade a repor de pelo menos um produto.'); return }
    if (!confirm(`Finalizar e gerar a requisição oficial de ${loja}?\n\n• ${nRepor} produto(s) a repor\n• ${nConf} de ${base.length} conferidos\n• ${nDiv} divergência(s) relevante(s)\n\nO saldo do estoque NÃO será alterado.`)) return
    setEnviando(true)
    try {
      let c = conf
      if (!c) {
        const { data, error } = await sb.rpc('ri_criar', { p_loja: loja, p_solic: quem, p_dias: dias, p_valid_dias: 1, p_origem: 'interna', p_por: quem })
        if (error) throw error
        const { data: row } = await sb.from('ri_conf').select('*').eq('id', data.id).single(); c = row as Conf
      }
      const { data, error } = await sb.rpc('ri_finalizar', { p_token: c.token, p_itens: payload(linhas), p_por: quem })
      if (error) throw error
      toast(`Requisição ${data.protocolo} criada (nº ${data.numero}) — aguardando análise/aprovação.`)
      setConf(null); setLinhas({})
    } catch (e) { toast('Erro: ' + rpcErro(e)) } finally { setEnviando(false) }
  }

  const chip = (f: Filtro, l: string, n?: number) => (
    <button key={f} onClick={() => setFiltro(f)} style={{ padding: '5px 11px', borderRadius: 99, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: '1px solid ' + (filtro === f ? 'var(--bordo)' : 'var(--border)'), background: filtro === f ? 'var(--bordo)' : 'transparent', color: filtro === f ? '#fff' : 'var(--text)' }}>{l}{n != null ? ` (${n})` : ''}</button>
  )
  const th: React.CSSProperties = { textAlign: 'left', fontSize: 11, color: 'var(--muted)', padding: '6px 8px', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }
  const td: React.CSSProperties = { padding: '6px 8px', fontSize: 13, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
  const mini: React.CSSProperties = { ...inp, width: 78, padding: '6px 8px', fontSize: 13, textAlign: 'center' }

  return (
    <div>
      <div style={{ ...card, marginBottom: 12 }}>
        <div style={grid(170)}>
          <div><label style={lbl}>Loja</label><select style={inp} value={loja} onChange={e => setLoja(e.target.value)}>{lojas.map(l => <option key={l}>{l}</option>)}</select></div>
          <div><label style={lbl}>Janela de análise (dias)</label><input style={inp} type="number" min={7} max={365} value={dias} onChange={e => setDias(Math.max(7, Number(e.target.value) || 90))} /></div>
          <div><label style={lbl}>Buscar produto</label><input style={inp} value={busca} onChange={e => setBusca(e.target.value)} placeholder="🔎 nome…" /></div>
        </div>
        <div style={{ ...grid(120), marginTop: 12 }}>
          {([['Identificados', kpi.total, 'todos'], ['Com consumo', kpi.consumo, 'consumo'], ['Sem movimentação', kpi.semmov, 'semmov'], ['Compra habitual', kpi.habitual, 'habitual'], ['Eventuais', kpi.eventual, 'eventual'], ['Comprados ≤14 dias', kpi.recente, 'recente'], ['Consumo crescente', kpi.cresc, 'cresc'], ['Consumo decrescente', kpi.decresc, 'decresc']] as [string, number, Filtro][]).map(([l, n, f]) => (
            <div key={l} onClick={() => setFiltro(f)} style={{ cursor: 'pointer', border: '1px solid ' + (filtro === f ? 'var(--bordo)' : 'var(--border)'), borderRadius: 12, padding: '8px 10px' }}>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{n}</div><div style={{ fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700 }}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 8 }}>Compra ≠ consumo: “consumo” = saídas de estoque na janela (compras de pedidos/caixas e entradas são mostradas à parte). Consumo estimado por ficha técnica e vendas entram nas próximas fases (fichas ainda vazias).</div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
        {chip('todos', 'Todos')}{chip('pend', 'Não conferidos', base.length - nConf)}{chip('diverg', 'Com divergência', nDiv)}
        <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700 }}>Conferidos {nConf}/{base.length} · {nRepor} a repor</span>
      </div>
      <div style={{ height: 8, background: 'var(--border)', borderRadius: 9, overflow: 'hidden', marginBottom: 12 }}><div style={{ height: '100%', width: `${base.length ? (nConf / base.length) * 100 : 0}%`, background: '#16a34a' }} /></div>

      {loading ? <div style={{ ...card, textAlign: 'center' }}>Carregando base de produtos…</div> : porCat.map(([cat, arr]) => (
        <div key={cat} style={{ ...card, marginBottom: 10, padding: 0, overflowX: 'auto' }}>
          <div style={{ padding: '9px 12px', fontWeight: 800, fontSize: 13, background: 'var(--bg)', display: 'flex', justifyContent: 'space-between' }}><span>{cat}</span><span style={{ color: 'var(--muted)' }}>{arr.filter(b => feito(b.k)).length}/{arr.length}</span></div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>Produto</th><th style={th}>Un.</th><th style={th}>Méd. mês</th><th style={th}>Méd. sem.</th><th style={th}>Compras</th><th style={th}>Últ. compra</th><th style={th}>Últ. mov.</th><th style={th}>Saldo sistema</th><th style={th}>Qtd física</th><th style={th}>Diferença</th><th style={th}>A repor</th><th style={th}>OK</th></tr></thead>
            <tbody>
              {arr.map(b => {
                const l = linhas[b.k]; const dif = l?.fisico != null ? l.fisico - b.saldo : null; const rel = divRelevante(b.saldo, l?.fisico)
                return (
                  <tr key={b.k} style={{ background: feito(b.k) ? 'rgba(22,163,74,.07)' : undefined }}>
                    <td style={{ ...td, whiteSpace: 'normal', minWidth: 190 }}><b>{b.nome}</b><div style={{ display: 'flex', gap: 4, marginTop: 2, flexWrap: 'wrap' }}>
                      <Pill cor={b.habitual ? '#15803D' : '#B45309'}>{b.habitual ? 'habitual' : 'eventual'}</Pill>
                      {b.sem_mov && <Pill cor="#6b7280">sem movimentação</Pill>}
                      {b.tendencia === 'crescente' && <Pill cor="#B91C1C">↑ crescente</Pill>}
                      {b.tendencia === 'decrescente' && <Pill cor="#0369A1">↓ decrescente</Pill>}
                    </div></td>
                    <td style={td}>{b.un}</td><td style={td}>{n2(b.consumo_mensal)}</td><td style={td}>{n2(b.consumo_semanal)}</td>
                    <td style={td}>{b.compras_n}{b.freq_dias ? ` (a cada ${n2(b.freq_dias)} d)` : ''}</td>
                    <td style={td}>{fmtD(b.ult_compra)}</td><td style={td}>{fmtD(b.ult_mov)}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{n2(b.saldo)}</td>
                    <td style={td}><input style={mini} inputMode="decimal" defaultValue={l?.fisico ?? ''} key={b.k + ':f:' + (conf?.id || '')} onBlur={e => setL(b, { fisico: num(e.target.value) })} /></td>
                    <td style={{ ...td, fontWeight: 800, color: rel ? '#B91C1C' : dif ? '#B45309' : 'var(--muted)' }}>{dif == null ? '—' : (dif > 0 ? '+' : '') + n2(dif)}{rel ? ' ⚠️' : ''}</td>
                    <td style={td}><input style={mini} inputMode="decimal" defaultValue={l?.qtd || ''} key={b.k + ':q:' + (conf?.id || '')} onBlur={e => setL(b, { qtd: num(e.target.value) || 0, conf: true })} /></td>
                    <td style={td}><input type="checkbox" checked={!!l?.conf} onChange={e => setL(b, { conf: e.target.checked })} style={{ width: 18, height: 18 }} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}
      {!loading && !porCat.length && <div style={{ ...card, textAlign: 'center', color: 'var(--muted)' }}>Nenhum produto neste filtro.</div>}

      <div style={{ position: 'sticky', bottom: 8, display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', background: 'var(--card, #fff)', border: '1px solid var(--border)', borderRadius: 14, padding: 10, marginTop: 12 }}>
        <div style={{ marginRight: 'auto', fontSize: 12.5, color: 'var(--muted)', alignSelf: 'center' }}>{nDiv > 0 ? `⚠️ ${nDiv} divergência(s) relevante(s) — gere ocorrência no Histórico após finalizar. ` : ''}Saldo do estoque nunca é alterado automaticamente.</div>
        <Btn tone="ghost" onClick={sugerir}>💡 Sugerir pelo nível ideal</Btn>
        <Btn tone="ok" onClick={finalizar} disabled={enviando}>{enviando ? 'Gerando…' : '✅ Finalizar e gerar requisição'}</Btn>
      </div>
    </div>
  )
}

// ───────────────────────── Abas 2 e 3: links / histórico ─────────────────────────
function Links({ lojas, quem, toast, modo }: { lojas: string[]; quem: string; toast: (m: string) => void; modo: 'links' | 'historico' }) {
  const [rows, setRows] = useState<Conf[]>([])
  const [reqSt, setReqSt] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [loja, setLoja] = useState(lojas[0])
  const [resp, setResp] = useState('')
  const [dias, setDias] = useState(90)
  const [valid, setValid] = useState(7)
  const [criando, setCriando] = useState(false)
  const [novo, setNovo] = useState<Conf | null>(null)
  const [det, setDet] = useState<Conf | null>(null)
  const [fLoja, setFLoja] = useState('todas')

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await sb.from('ri_conf').select('*').order('created_at', { ascending: false }).limit(300)
      if (error) throw error
      const cs = (data || []) as Conf[]; setRows(cs)
      const ids = cs.map(c => c.requisicao_id).filter(Boolean) as string[]
      if (ids.length) {
        const { data: rq } = await sb.from('requisicoes').select('id,status').in('id', ids)
        const m: Record<string, string> = {}; (rq || []).forEach((r: { id: string; status: string }) => { m[r.id] = r.status }); setReqSt(m)
      }
    } catch (e) { toast('Erro ao carregar: ' + rpcErro(e)) } finally { setLoading(false) }
  }, [toast])
  useEffect(() => { carregar() }, [carregar])

  const gerar = async () => {
    if (!resp.trim()) { toast('Informe o responsável pela requisição.'); return }
    setCriando(true)
    try {
      const { data, error } = await sb.rpc('ri_criar', { p_loja: loja, p_solic: resp, p_dias: dias, p_valid_dias: valid, p_origem: 'link', p_por: quem })
      if (error) throw error
      const { data: row } = await sb.from('ri_conf').select('*').eq('id', data.id).single()
      setNovo(row as Conf); setResp(''); carregar()
    } catch (e) { toast('Erro: ' + rpcErro(e)) } finally { setCriando(false) }
  }
  const msgDe = (c: Conf) => `Olá, ${c.solicitante}! 👋\n\nSegue o link para a *requisição de compra da ${c.loja}*. Marque o que precisa repor e informe as quantidades. Você pode salvar e continuar depois.\n\n${linkDe(c)}\n\n⏰ Válido até ${fmtDH(c.validade)}.\n_Painel Amore_`
  const cancelar = async (c: Conf) => {
    const m = prompt('Motivo do cancelamento do link?'); if (m == null) return
    const { error } = await sb.rpc('ri_cancelar', { p_id: c.id, p_por: quem, p_motivo: m }); if (error) toast(rpcErro(error)); else { toast('Link cancelado.'); carregar() }
  }
  const renovar = async (c: Conf) => {
    const { error } = await sb.rpc('ri_renovar', { p_id: c.id, p_dias: valid, p_por: quem }); if (error) toast(rpcErro(error)); else { toast(`Validade renovada por ${valid} dia(s).`); carregar() }
  }

  const lista = rows.filter(c => (modo === 'links' ? c.origem === 'link' && c.status !== 'enviada' : c.status === 'enviada' || c.status === 'cancelada') && (fLoja === 'todas' || c.loja === fLoja))
  const th: React.CSSProperties = { textAlign: 'left', fontSize: 11, color: 'var(--muted)', padding: '6px 8px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '8px', fontSize: 13, borderBottom: '1px solid var(--border)', verticalAlign: 'top' }

  return (
    <div>
      {modo === 'links' && (
        <div style={{ ...card, marginBottom: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Gerar requisição por link</div>
          <div style={grid(170)}>
            <div><label style={lbl}>Loja</label><select style={inp} value={loja} onChange={e => setLoja(e.target.value)}>{lojas.map(l => <option key={l}>{l}</option>)}</select></div>
            <div><label style={lbl}>Responsável (quem vai preencher)</label><input style={inp} value={resp} onChange={e => setResp(e.target.value)} placeholder="Ex.: Carlos Wellington" /></div>
            <div><label style={lbl}>Histórico de (dias)</label><input style={inp} type="number" min={7} value={dias} onChange={e => setDias(Math.max(7, Number(e.target.value) || 90))} /></div>
            <div><label style={lbl}>Link válido por (dias)</label><input style={inp} type="number" min={1} value={valid} onChange={e => setValid(Math.max(1, Number(e.target.value) || 7))} /></div>
          </div>
          <div style={{ marginTop: 10 }}><Btn onClick={gerar} disabled={criando}>{criando ? 'Gerando…' : '🔗 Gerar requisição por link'}</Btn></div>
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6 }}>O link não envia nada sozinho: copie a mensagem e valide antes de mandar no WhatsApp.</div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <select style={{ ...inp, width: 190 }} value={fLoja} onChange={e => setFLoja(e.target.value)}><option value="todas">Todas as lojas</option>{lojas.map(l => <option key={l}>{l}</option>)}</select>
        <Btn small tone="ghost" onClick={carregar}>↻ Atualizar</Btn><span style={{ color: 'var(--muted)', fontSize: 12.5 }}>{lista.length} registro(s)</span>
      </div>
      <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>Criado</th><th style={th}>Loja</th><th style={th}>Responsável</th><th style={th}>Origem</th><th style={th}>Status</th><th style={th}>Protocolo / Req.</th><th style={th}>Validade</th><th style={th}>Ações</th></tr></thead>
          <tbody>
            {loading && <tr><td style={td} colSpan={8}>Carregando…</td></tr>}
            {!loading && !lista.length && <tr><td style={{ ...td, color: 'var(--muted)' }} colSpan={8}>Nada por aqui ainda.</td></tr>}
            {lista.map(c => {
              const [sl, sc] = statusConf(c); const rs = c.requisicao_id ? REQ_ST[reqSt[c.requisicao_id]] : null
              const aberto = c.status === 'aguardando' || c.status === 'em_preenchimento'
              return (
                <tr key={c.id}>
                  <td style={td}>{fmtDH(c.created_at)}<div style={{ fontSize: 11, color: 'var(--muted)' }}>{c.criado_por}</div></td>
                  <td style={td}>{c.loja}</td><td style={td}>{c.solicitante}</td><td style={td}>{c.origem === 'link' ? '🔗 Link' : '🖥️ Painel'}</td>
                  <td style={td}><Pill cor={sc}>{sl}</Pill>{c.aberto_em && aberto && <div style={{ fontSize: 11, color: 'var(--muted)' }}>aberto {fmtDH(c.aberto_em)}</div>}{c.status === 'enviada' && <div style={{ fontSize: 11, color: 'var(--muted)' }}>enviado {fmtDH(c.enviado_em)}</div>}</td>
                  <td style={td}>{c.protocolo ? <><b>{c.protocolo}</b><div style={{ fontSize: 11 }}>Req. nº {c.requisicao_numero}{rs && <> · <span style={{ color: rs[1], fontWeight: 700 }}>{rs[0]}</span></>}</div></> : '—'}</td>
                  <td style={td}>{fmtDH(c.validade)}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {c.origem === 'link' && c.status !== 'cancelada' && <Btn small tone="ghost" onClick={async () => toast((await copiar(linkDe(c))) ? 'Link copiado!' : linkDe(c))}>📋 Link</Btn>}
                      {aberto && c.origem === 'link' && <Btn small tone="ghost" onClick={async () => setNovo(c)}>💬 Mensagem</Btn>}
                      {aberto && c.origem === 'link' && <Btn small tone="ghost" onClick={() => renovar(c)}>⏰ Renovar</Btn>}
                      {aberto && <Btn small tone="danger" onClick={() => cancelar(c)}>Cancelar</Btn>}
                      {c.status === 'enviada' && <Btn small onClick={() => setDet(c)}>🔍 Detalhes</Btn>}
                      {c.status === 'em_preenchimento' && <Btn small tone="ghost" onClick={() => setDet(c)}>👁 Rascunho</Btn>}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {novo && (
        <Modal titulo="Link gerado — valide antes de enviar" onClose={() => setNovo(null)}>
          <label style={lbl}>Link individual ({novo.loja} · {novo.solicitante})</label>
          <input style={inp} readOnly value={linkDe(novo)} onFocus={e => e.target.select()} />
          <label style={{ ...lbl, marginTop: 10 }}>Mensagem para o WhatsApp (nada foi enviado)</label>
          <textarea style={{ ...inp, minHeight: 170, fontFamily: 'inherit' }} readOnly value={msgDe(novo)} />
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <Btn onClick={async () => toast((await copiar(msgDe(novo))) ? 'Mensagem copiada!' : 'Selecione e copie manualmente')}>📋 Copiar mensagem</Btn>
            <Btn tone="ghost" onClick={() => window.open(linkDe(novo), '_blank', 'noopener')}>Abrir link</Btn>
            <Btn tone="ghost" onClick={() => window.open('https://wa.me/?text=' + encodeURIComponent(msgDe(novo)), '_blank', 'noopener')}>Abrir no WhatsApp (você escolhe o contato)</Btn>
          </div>
        </Modal>
      )}
      {det && <Detalhe c={det} quem={quem} toast={toast} reqStatus={det.requisicao_id ? reqSt[det.requisicao_id] : undefined} onClose={() => setDet(null)} onMudou={carregar} />}
    </div>
  )
}

function Detalhe({ c, quem, toast, reqStatus, onClose, onMudou }: { c: Conf; quem: string; toast: (m: string) => void; reqStatus?: string; onClose: () => void; onMudou: () => void }) {
  const [oc, setOc] = useState<Ocorrencia[]>([])
  const [aud, setAud] = useState<{ acao: string; por: string | null; detalhe: string | null; em: string }[]>([])
  const final = c.itens_final || []
  const rascunho = c.status !== 'enviada'
  const linhas: Final[] = rascunho ? (c.itens as unknown as Final[]) : final
  const load = useCallback(async () => {
    const [a, b] = await Promise.all([
      sb.from('ri_ocorrencias').select('*').eq('conf_id', c.id).order('created_at', { ascending: false }),
      sb.from('ri_aud').select('acao,por,detalhe,em').eq('conf_id', c.id).order('em', { ascending: false }),
    ])
    setOc((a.data || []) as Ocorrencia[]); setAud(b.data || [])
  }, [c.id])
  useEffect(() => { load() }, [load])

  const ocorrencia = async (l: Final) => {
    const obs = prompt(`Observação da ocorrência de divergência — ${l.nome}\n(saldo sistema ${n2(l.saldo)} × físico ${n2(l.fisico)})`, '')
    if (obs == null) return
    const { error } = await sb.rpc('ri_ocorrencia', { p_conf: c.id, p_k: l.k, p_por: quem, p_obs: obs }); if (error) toast(rpcErro(error)); else { toast('Ocorrência registrada. O saldo NÃO foi alterado.'); load() }
  }
  const notificar = async () => {
    const lojaLabel = ({ 'Amore CD': 'Amore Costa Dourada', 'Flow CD': 'Flow Costa Dourada' } as Record<string, string>)[c.loja] || c.loja
    const n = final.filter(i => i.qtd > 0).length
    const msg = `🧾 *Requisição para APROVAÇÃO — #${c.requisicao_numero}* (${c.protocolo})\n🏪 ${lojaLabel}\n👤 Solicitante: ${c.solicitante}\n📦 ${n} item(ns) a repor\n\nRevise, ajuste se precisar e *aprove*:\n${siteOrigin()}/requisicao-editar.html?id=${c.requisicao_id}\n\n_Painel Amore_`
    if (!confirm(`Enviar este aviso para ${APROVADORES.map(a => a.nome).join(' e ')}?\n\n${msg}`)) return
    for (const a of APROVADORES) {
      try { await enviarWhatsApp(a.fone, msg, undefined, { tipo: 'compra', modulo: 'requisicoes', titulo: `Aprovação #${c.requisicao_numero}`, loja: c.loja, created_by: quem }) } catch { /* segue */ }
      await new Promise(r => setTimeout(r, 2500 + Math.random() * 3500))
    }
    await sb.from('ri_conf').update({ notificado_em: new Date().toISOString(), notificado_por: quem }).eq('id', c.id)
    await sb.rpc('ri_aud', { p_conf: c.id, p_acao: 'notificou aprovadores', p_por: quem, p_det: 'Wagner + Aline' })
    toast('Aprovadores avisados.'); onMudou(); load()
  }
  const rs = reqStatus ? REQ_ST[reqStatus] : null
  const th: React.CSSProperties = { textAlign: 'left', fontSize: 11, color: 'var(--muted)', padding: '5px 6px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '6px', fontSize: 12.5, borderBottom: '1px solid var(--border)' }
  return (
    <Modal titulo={c.protocolo ? `${c.protocolo} — ${c.loja}` : `Rascunho — ${c.loja}`} onClose={onClose}>
      <div style={{ fontSize: 13, marginBottom: 8 }}>Solicitante: <b>{c.solicitante}</b> · {c.origem === 'link' ? 'por link' : 'pelo painel'}{c.status === 'enviada' && <> · enviado {fmtDH(c.enviado_em)} · Requisição nº <b>{c.requisicao_numero}</b>{rs && <> · <b style={{ color: rs[1] }}>{rs[0]}</b></>}</>}</div>
      {c.status === 'enviada' && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <Btn small tone="ghost" onClick={() => window.open(`/requisicao-editar.html?id=${c.requisicao_id}`, '_blank', 'noopener')}>Abrir requisição oficial</Btn>
          <Btn small tone="ghost" onClick={() => window.open(linkDe(c), '_blank', 'noopener')}>Ver tela do solicitante</Btn>
          <Btn small onClick={notificar}>{c.notificado_em ? `🔔 Avisar de novo (último: ${fmtDH(c.notificado_em)})` : '🔔 Notificar aprovadores (WhatsApp)'}</Btn>
        </div>
      )}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>Produto</th><th style={th}>Un.</th>{!rascunho && <th style={th}>Saldo sistema</th>}<th style={th}>Físico</th>{!rascunho && <th style={th}>Dif.</th>}<th style={th}>A repor</th><th style={th}></th></tr></thead>
          <tbody>
            {(linhas || []).map(l => {
              const rel = !rascunho && divRelevante(l.saldo, l.fisico); const jaOc = oc.some(o => o.produto === l.nome)
              return (
                <tr key={l.k} style={{ background: rel ? 'rgba(220,38,38,.07)' : undefined }}>
                  <td style={td}>{l.nome}{l.extra && <Pill cor="#0369A1">incluído</Pill>}</td><td style={td}>{l.un}</td>
                  {!rascunho && <td style={td}>{n2(l.saldo)}</td>}<td style={td}>{n2(l.fisico)}</td>
                  {!rascunho && <td style={{ ...td, fontWeight: 800, color: rel ? '#B91C1C' : undefined }}>{l.diferenca == null ? '—' : (l.diferenca > 0 ? '+' : '') + n2(l.diferenca)}</td>}
                  <td style={{ ...td, fontWeight: 700 }}>{l.qtd > 0 ? n2(l.qtd) : <span style={{ color: 'var(--muted)', fontWeight: 400 }}>conferido, sem reposição</span>}</td>
                  <td style={td}>{rel && !jaOc && <Btn small tone="danger" onClick={() => ocorrencia(l)}>Gerar ocorrência</Btn>}{jaOc && <Pill cor="#B45309">ocorrência aberta</Pill>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {!rascunho && <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6 }}>{final.length} produto(s) conferidos registrados (inclusive sem quantidade). Divergência relevante = diferença ≥ 1 e ≥ 10% do saldo. O saldo do estoque não é alterado automaticamente — ajustes autorizados chegam na Fase 2.</div>}
      {oc.length > 0 && <div style={{ marginTop: 12 }}><b style={{ fontSize: 13 }}>Ocorrências</b>{oc.map(o => <div key={o.id} style={{ fontSize: 12.5, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>⚠️ <b>{o.produto}</b> — sistema {n2(o.saldo_sistema)} × físico {n2(o.qtd_fisica)} (dif. {n2(o.diferenca)}) · <i>{o.status}</i>{o.obs ? ` · ${o.obs}` : ''} <span style={{ color: 'var(--muted)' }}>({o.criado_por}, {fmtDH(o.created_at)})</span></div>)}</div>}
      <div style={{ marginTop: 12 }}><b style={{ fontSize: 13 }}>Auditoria</b>{aud.map((a, i) => <div key={i} style={{ fontSize: 12, padding: '3px 0', color: 'var(--muted)' }}>{fmtDH(a.em)} — {a.por || '—'}: {a.acao}{a.detalhe ? ` (${a.detalhe})` : ''}</div>)}</div>
    </Modal>
  )
}
