import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { useLoja } from '../../contexts/LojaContext'
import { fetchCozinhaFichas } from '../../lib/db'
import { siteOrigin } from '../../lib/site'
import { APPROVER_EMAILS } from '../../lib/permissions'
import { Btn, Modal, Pill, card, grid, inp, lbl } from '../plantao/plantaoUi'
import {
  sb, TIPOS, TIPOS_COM_EMPRESA, PERFIS, STATUS_SOL, CONFIG_PADRAO, carregarConfig, salvarConfig, fmtDH, hojeISO, addDiasISO, brl, norm, isoLocal, parseNum, rpcErro, buscarTudo, csv,
} from './aliLib'
import type { AliConfig, Auditoria, Consumo, Ingrediente, Perfil, Prato, Solicitacao, Ticket } from './aliLib'

type Aba = 'painel' | 'solicitar' | 'aprovacoes' | 'tickets' | 'cozinha' | 'consumo' | 'pratos' | 'config'
const ABAS: { id: Aba; label: string; perfis: Perfil[] }[] = [
  { id: 'painel', label: '📊 Painel', perfis: ['gestor', 'estoque', 'administrativo'] },
  { id: 'solicitar', label: '➕ Solicitar', perfis: ['solicitante', 'gestor'] },
  { id: 'aprovacoes', label: '✅ Aprovações', perfis: ['gestor'] },
  { id: 'tickets', label: '🎫 Tickets', perfis: ['solicitante', 'gestor', 'cozinha'] },
  { id: 'cozinha', label: '🍳 Cozinha', perfis: ['cozinha', 'gestor'] },
  { id: 'consumo', label: '📦 Consumo / Estoque', perfis: ['estoque', 'administrativo', 'gestor'] },
  { id: 'pratos', label: '🍽️ Pratos', perfis: ['gestor'] },
  { id: 'config', label: '⚙️ Configurar', perfis: [] },
]

export default function AlimentacaoPage() {
  const { user, isOwner } = useAuth()
  const { theme } = useTheme()
  const { loja: lojaCtx } = useLoja()
  const lojas = theme.stores?.length ? theme.stores : ['Amore CD', 'Amore Paiva', 'Flow CD']
  const quem = (user?.name || 'Usuário').trim()
  const email = (user?.email || '').toLowerCase()
  const [cfg, setCfg] = useState<AliConfig>(CONFIG_PADRAO)
  const [sols, setSols] = useState<Solicitacao[]>([])
  const [tks, setTks] = useState<Ticket[]>([])
  const [cons, setCons] = useState<Consumo[]>([])
  const [pratos, setPratos] = useState<Prato[]>([])
  const [estoque, setEstoque] = useState<{ nome: string; loja: string; preco_unitario: number | null }[]>([])
  const [de, setDe] = useState(addDiasISO(-7))
  const [ate, setAte] = useState(hojeISO())
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [detalhe, setDetalhe] = useState<string | null>(null)

  const admin = isOwner || user?.role === 'admin' || user?.role === 'super_admin'
  const perfis: Perfil[] = useMemo(() => {
    if (admin) return ['solicitante', 'gestor', 'cozinha', 'estoque', 'administrativo', 'admin']
    if (cfg.perfis[email]?.length) return cfg.perfis[email]
    if (APPROVER_EMAILS.includes(email)) return ['solicitante', 'gestor', 'estoque', 'administrativo']
    return ['solicitante', 'cozinha']
  }, [admin, cfg, email])
  const abas = ABAS.filter(a => a.id === 'config' ? perfis.includes('admin') : a.perfis.some(p => perfis.includes(p)))
  const [aba, setAba] = useState<Aba>('tickets')
  useEffect(() => {
    if (!abas.length) return
    const p = new URLSearchParams(location.search).get('aba') as Aba | null
    setAba(prev => abas.some(a => a.id === prev) ? prev : (p && abas.some(a => a.id === p) ? p : abas[0].id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfis])

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('')
    try {
      const ini = de + 'T00:00:00-03:00'; const fim = ate + 'T23:59:59-03:00'
      const [a, b, t, c, p] = await Promise.all([
        sb.from('ali_solicitacoes').select('*').gte('data_hora', ini).lte('data_hora', fim).order('data_hora', { ascending: false }).limit(1000),
        sb.from('ali_solicitacoes').select('*').eq('status', 'aguardando').order('data_hora', { ascending: false }).limit(300),
        sb.from('ali_tickets').select('*').or(`status.eq.emitido,emitido_em.gte.${ini}`).order('numero', { ascending: false }).limit(2000),
        sb.from('ali_consumos').select('*').gte('created_at', ini).order('created_at', { ascending: false }).limit(2000),
        sb.from('ali_pratos').select('*').order('nome'),
      ])
      for (const r of [a, b, t, c, p]) if (r.error) throw r.error
      const m = new Map<string, Solicitacao>(); for (const s of [...(a.data || []), ...(b.data || [])]) m.set(s.id, s)
      setSols(Array.from(m.values()).sort((x, y) => y.data_hora.localeCompare(x.data_hora)))
      setTks(t.data || []); setCons(c.data || []); setPratos(p.data || [])
    } catch (e) { setErro(rpcErro(e)) }
    setCarregando(false)
  }, [de, ate])
  useEffect(() => { void carregar() }, [carregar])
  useEffect(() => { void carregarConfig().then(setCfg) }, [])
  useEffect(() => {
    void buscarTudo<{ nome: string; loja: string; preco_unitario: number | null }>((f, t) => sb.from('estoque_produtos').select('nome,loja,preco_unitario').eq('ativo', true).order('nome').range(f, t)).then(setEstoque).catch(() => {})
  }, [])

  const tkDe = useMemo(() => { const m = new Map<string, Ticket>(); for (const t of tks) if (t.status !== 'cancelado' || !m.has(t.solicitacao_id)) m.set(t.solicitacao_id, t); return m }, [tks])
  const abrirTicket = (id: string, auto = false) => window.open(`${siteOrigin()}/ticket-alimentacao.html?id=${id}${auto ? '&auto=1' : ''}`, '_blank')
  const aud = (tipo: string, ref: string, acao: string, det: string, antes?: unknown, depois?: unknown) => sb.rpc('ali_aud', { p_tipo: tipo, p_ref: ref, p_acao: acao, p_por: quem, p_det: det, p_antes: antes ?? null, p_depois: depois ?? null })

  if (!abas.length) return <div style={card}>Sem acesso a este módulo.</div>
  const pend = sols.filter(s => s.status === 'aguardando').length
  const fila = tks.filter(t => t.status === 'emitido' && !t.impresso_em).length

  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 1100 }}>
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
        {abas.map(a => (
          <button key={a.id} onClick={() => setAba(a.id)}
            style={{ padding: '9px 14px', borderRadius: 99, border: `1px solid ${aba === a.id ? 'var(--bordo)' : 'var(--border)'}`, background: aba === a.id ? 'var(--bordo)' : 'var(--card, #fff)', color: aba === a.id ? '#fff' : 'var(--text)', fontWeight: 700, fontSize: 13.5, whiteSpace: 'nowrap', cursor: 'pointer' }}>
            {a.label}{a.id === 'aprovacoes' && pend > 0 ? ` (${pend})` : ''}{a.id === 'tickets' && fila > 0 ? ` (${fila} na fila)` : ''}
          </button>
        ))}
        <Btn small tone="ghost" onClick={() => void carregar()}>{carregando ? '⏳' : '↻'}</Btn>
      </div>
      {erro && <div style={{ ...card, borderColor: '#dc2626', color: '#dc2626' }}>Erro: {erro}</div>}

      {aba === 'painel' && <Painel sols={sols} tks={tks} cons={cons} lojas={lojas} de={de} ate={ate} setDe={setDe} setAte={setAte} tkDe={tkDe} onOpen={setDetalhe} />}
      {aba === 'solicitar' && <Solicitar lojas={lojas} lojaCtx={lojaCtx} cfg={cfg} pratos={pratos} quem={quem} onDone={carregar} />}
      {aba === 'aprovacoes' && <Aprovacoes sols={sols.filter(s => s.status === 'aguardando')} pratos={pratos} estoque={estoque} quem={quem} onDone={(tk) => { void carregar(); if (tk) abrirTicket(tk, true) }} />}
      {aba === 'tickets' && <Tickets sols={sols} tks={tks} onPrint={abrirTicket} onOpen={setDetalhe} lojas={lojas} />}
      {aba === 'cozinha' && <Cozinha lojas={lojas} lojaCtx={lojaCtx} sols={sols} tks={tks} quem={quem} onDone={carregar} />}
      {aba === 'consumo' && <ConsumoTab cons={cons} tks={tks} lojas={lojas} de={de} ate={ate} setDe={setDe} setAte={setAte} />}
      {aba === 'pratos' && <Pratos pratos={pratos} estoque={estoque} lojas={lojas} quem={quem} onDone={carregar} />}
      {aba === 'config' && <Config cfg={cfg} setCfg={setCfg} lojas={lojas} />}

      {detalhe && <Detalhe id={detalhe} sol={sols.find(s => s.id === detalhe)} tk={tkDe.get(detalhe)} quem={quem} aud={aud} onPrint={abrirTicket} onClose={() => setDetalhe(null)} onDone={carregar} />}
    </div>
  )
}

const Chip = ({ s }: { s: string }) => <Pill cor={STATUS_SOL[s]?.cor || '#6b7280'}>{STATUS_SOL[s]?.label || s}</Pill>
const Vazio = ({ t }: { t: string }) => <div style={{ ...card, textAlign: 'center', color: 'var(--muted)', padding: 28 }}>{t}</div>

// ───────────────────────── Painel gerencial ─────────────────────────
function Painel({ sols, tks, cons, lojas, de, ate, setDe, setAte, tkDe, onOpen }: { sols: Solicitacao[]; tks: Ticket[]; cons: Consumo[]; lojas: string[]; de: string; ate: string; setDe: (v: string) => void; setAte: (v: string) => void; tkDe: Map<string, Ticket>; onOpen: (id: string) => void }) {
  const [loja, setLoja] = useState(''); const [tipo, setTipo] = useState(''); const [empresa, setEmpresa] = useState(''); const [prato, setPrato] = useState(''); const [gestor, setGestor] = useState(''); const [status, setStatus] = useState('')
  const f = sols.filter(s => {
    const tk = tkDe.get(s.id)
    return (!loja || s.loja === loja) && (!tipo || s.tipo_solicitante === tipo) && (!empresa || norm(s.empresa) === norm(empresa)) && (!status || s.status === status)
      && (!prato || (tk ? norm(tk.prato_nome) === norm(prato) : norm(s.prato_solicitado) === norm(prato))) && (!gestor || (s.decidido_por || '') === gestor)
  })
  const ids = new Set(f.map(s => s.id))
  const tf = tks.filter(t => ids.has(t.solicitacao_id) && t.status !== 'cancelado')
  const entreg = tf.filter(t => t.status === 'entregue')
  const custo = cons.filter(c => entreg.some(t => t.id === c.ticket_id)).reduce((a, c) => a + Number(c.custo_total), 0)
  const opt = (arr: (string | null)[]) => Array.from(new Set(arr.filter(Boolean) as string[])).sort()
  const grupos = (chave: (s: Solicitacao, t?: Ticket) => string) => {
    const m = new Map<string, { q: number; c: number }>()
    for (const t of entreg) { const s = f.find(x => x.id === t.solicitacao_id); if (!s) continue; const k = chave(s, t) || '—'; const g = m.get(k) || { q: 0, c: 0 }; g.q += Number(t.qtd); g.c += Number(t.custo_total); m.set(k, g) }
    return Array.from(m.entries()).sort((a, b) => b[1].c - a[1].c)
  }
  const periodo = (n: number) => { setDe(addDiasISO(n)); setAte(hojeISO()) }
  const exportar = () => csv([
    ['Nº Sol.', 'Ticket', 'Data/hora', 'Loja', 'Solicitante', 'Tipo', 'Empresa', 'Responsável', 'Motivo', 'Prato', 'Qtd', 'Custo (R$)', 'Autorizado por', 'Status', 'Entregue em'],
    ...f.map(s => { const t = tkDe.get(s.id); return [s.numero, t?.codigo || '', fmtDH(s.data_hora), s.loja, s.nome, s.tipo_solicitante, s.empresa || '', s.responsavel || '', s.motivo || '', t?.prato_nome || s.prato_solicitado || '', t?.qtd ?? '', t ? String(t.custo_total).replace('.', ',') : '', s.decidido_por || '', STATUS_SOL[s.status]?.label || s.status, fmtDH(t?.entregue_em)] }),
  ], `alimentacao_${de}_${ate}.csv`)
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ ...grid(130) }}>
        {[['Refeições liberadas', tf.reduce((a, t) => a + Number(t.qtd), 0), '#2563eb'], ['Custo total (entregues)', brl(custo), '#16a34a'], ['Aguardando aprovação', f.filter(s => s.status === 'aguardando').length, '#ca8a04'], ['Refeições entregues', entreg.reduce((a, t) => a + Number(t.qtd), 0), '#16a34a']].map(([t, v, c]) => (
          <div key={String(t)} style={{ ...card, borderLeft: `4px solid ${c}` }}><div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>{t}</div><div style={{ fontSize: 24, fontWeight: 800 }}>{v}</div></div>
        ))}
      </div>
      <div style={{ ...card, display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Btn small tone="ghost" onClick={() => periodo(0)}>Hoje</Btn><Btn small tone="ghost" onClick={() => periodo(-6)}>Semana</Btn><Btn small tone="ghost" onClick={() => periodo(-29)}>Mês</Btn>
          <Btn small tone="ok" onClick={exportar}>⬇ Excel (CSV)</Btn><Btn small tone="ghost" onClick={() => window.print()}>🖨 PDF</Btn>
        </div>
        <div style={grid(150)}>
          <div><label style={lbl}>De</label><input type="date" style={inp} value={de} onChange={e => setDe(e.target.value)} /></div>
          <div><label style={lbl}>Até</label><input type="date" style={inp} value={ate} onChange={e => setAte(e.target.value)} /></div>
          {([['Loja', loja, setLoja, lojas], ['Tipo', tipo, setTipo, TIPOS], ['Empresa', empresa, setEmpresa, opt(sols.map(s => s.empresa))], ['Prato', prato, setPrato, opt(tks.map(t => t.prato_nome))], ['Gestor', gestor, setGestor, opt(sols.map(s => s.decidido_por))], ['Status', status, setStatus, Object.keys(STATUS_SOL)]] as [string, string, (v: string) => void, string[]][]).map(([l, v, set, o]) => (
            <div key={l}><label style={lbl}>{l}</label><select style={inp} value={v} onChange={e => set(e.target.value)}><option value="">Todos</option>{o.map(x => <option key={x} value={x}>{l === 'Status' ? STATUS_SOL[x].label : x}</option>)}</select></div>
          ))}
        </div>
      </div>
      <div style={grid(280)}>
        {([['Por loja', grupos(s => s.loja)], ['Por tipo de solicitante', grupos(s => s.tipo_solicitante)], ['Por empresa', grupos(s => s.empresa || '')], ['Por prato', grupos((_s, t) => t?.prato_nome || '')], ['Por gestor', grupos(s => s.decidido_por || '')]] as [string, [string, { q: number; c: number }][]][]).map(([t, g]) => (
          <div key={t} style={card}><div style={{ fontWeight: 800, marginBottom: 6 }}>{t}</div>
            {g.length === 0 ? <div style={{ color: 'var(--muted)', fontSize: 13 }}>Sem entregas no período.</div> : g.slice(0, 8).map(([k, v]) => <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13.5, padding: '3px 0', borderBottom: '1px solid var(--border)' }}><span>{k}</span><b>{v.q}x · {brl(v.c)}</b></div>)}
          </div>
        ))}
      </div>
      <div style={card}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>Solicitações ({f.length})</div>
        {f.length === 0 ? <div style={{ color: 'var(--muted)' }}>Nada no período/filtros.</div> : f.map(s => <LinhaSol key={s.id} s={s} t={tkDe.get(s.id)} onClick={() => onOpen(s.id)} />)}
      </div>
    </div>
  )
}

function LinhaSol({ s, t, onClick }: { s: Solicitacao; t?: Ticket; onClick: () => void }) {
  return (
    <div onClick={onClick} style={{ borderTop: '1px solid var(--border)', padding: '9px 0', cursor: 'pointer', display: 'grid', gap: 3 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}><b>{t ? t.codigo + ' · ' : `#${s.numero} · `}{s.nome}</b><Chip s={s.status} /></div>
      <div style={{ fontSize: 13, color: 'var(--muted)' }}>{s.loja} · {s.tipo_solicitante}{s.empresa ? ` · ${s.empresa}` : ''} · {fmtDH(s.data_hora)}</div>
      <div style={{ fontSize: 13.5 }}>{t ? `${t.qtd}x ${t.prato_nome} · ${brl(t.custo_total)} · aut. ${t.autorizado_por}` : `Pedido: ${s.prato_solicitado || '—'}`}</div>
    </div>
  )
}

// ───────────────────────── Solicitar ─────────────────────────
function Solicitar({ lojas, lojaCtx, cfg, pratos, quem, onDone }: { lojas: string[]; lojaCtx: string; cfg: AliConfig; pratos: Prato[]; quem: string; onDone: () => void }) {
  const vazio = { loja: lojas.includes(lojaCtx) ? lojaCtx : lojas[0], data_hora: isoLocal(), nome: '', tipo_solicitante: TIPOS[0], empresa: '', responsavel: quem, motivo: '', prato_solicitado: '', obs: '' }
  const [f, setF] = useState(vazio); const [env, setEnv] = useState(false); const [ok, setOk] = useState('')
  const set = (k: keyof typeof vazio, v: string) => setF(x => ({ ...x, [k]: v }))
  const precisaEmp = TIPOS_COM_EMPRESA.includes(f.tipo_solicitante)
  const salvar = async () => {
    if (!f.nome.trim()) return alert('Informe o nome de quem vai receber a refeição.')
    if (!f.motivo.trim()) return alert('Informe o motivo.')
    if (precisaEmp && f.tipo_solicitante !== 'Visitante' && f.tipo_solicitante !== 'Outros' && !f.empresa.trim()) return alert('Informe a empresa de origem.')
    setEnv(true)
    const { data, error } = await sb.from('ali_solicitacoes').insert({ ...f, data_hora: new Date(f.data_hora).toISOString(), nome: f.nome.trim(), empresa: precisaEmp ? f.empresa.trim() || null : null, solicitado_por: quem }).select().single()
    if (error) { setEnv(false); return alert('Erro: ' + rpcErro(error)) }
    await sb.rpc('ali_aud', { p_tipo: 'solicitacao', p_ref: data.id, p_acao: 'criada', p_por: quem, p_det: `${f.nome} — ${f.prato_solicitado || 'prato a definir'}` })
    setOk(`Solicitação #${data.numero} enviada para aprovação da gestão. Nada é liberado antes da aprovação.`)
    setF({ ...vazio, loja: f.loja, data_hora: isoLocal() }); setEnv(false); onDone()
  }
  return (
    <div style={{ ...card, display: 'grid', gap: 10, maxWidth: 640 }}>
      <div style={{ fontWeight: 800, fontSize: 16 }}>Nova solicitação de refeição</div>
      {ok && <div style={{ background: '#dcfce7', color: '#166534', padding: 10, borderRadius: 10, fontWeight: 600 }}>✅ {ok}</div>}
      <div style={grid(200)}>
        <div><label style={lbl}>Loja</label><select style={inp} value={f.loja} onChange={e => set('loja', e.target.value)}>{lojas.map(l => <option key={l}>{l}</option>)}</select></div>
        <div><label style={lbl}>Data / hora</label><input type="datetime-local" style={inp} value={f.data_hora} onChange={e => set('data_hora', e.target.value)} /></div>
      </div>
      <div><label style={lbl}>Nome de quem vai receber *</label><input style={inp} value={f.nome} onChange={e => set('nome', e.target.value)} /></div>
      <div style={grid(200)}>
        <div><label style={lbl}>Tipo de solicitante *</label><select style={inp} value={f.tipo_solicitante} onChange={e => set('tipo_solicitante', e.target.value)}>{TIPOS.map(t => <option key={t}>{t}</option>)}</select></div>
        {precisaEmp && <div><label style={lbl}>Empresa de origem</label><input style={inp} list="ali-emp" value={f.empresa} onChange={e => set('empresa', e.target.value)} /><datalist id="ali-emp">{cfg.empresas.map(e => <option key={e} value={e} />)}</datalist></div>}
      </div>
      <div><label style={lbl}>Responsável interno pela liberação</label><input style={inp} value={f.responsavel} onChange={e => set('responsavel', e.target.value)} /></div>
      <div><label style={lbl}>Motivo *</label><input style={inp} list="ali-mot" value={f.motivo} onChange={e => set('motivo', e.target.value)} /><datalist id="ali-mot">{cfg.motivos.map(e => <option key={e} value={e} />)}</datalist></div>
      <div><label style={lbl}>Prato solicitado</label><input style={inp} list="ali-prt" value={f.prato_solicitado} onChange={e => set('prato_solicitado', e.target.value)} placeholder="Ex.: Parmegiana de frango" /><datalist id="ali-prt">{pratos.filter(p => p.ativo).map(p => <option key={p.id} value={p.nome} />)}</datalist></div>
      <div><label style={lbl}>Observações</label><textarea style={{ ...inp, minHeight: 70 }} value={f.obs} onChange={e => set('obs', e.target.value)} /></div>
      <Btn onClick={() => void salvar()} disabled={env}>{env ? 'Enviando…' : 'Enviar para aprovação'}</Btn>
    </div>
  )
}

// ───────────────────────── Aprovações ─────────────────────────
function Aprovacoes({ sols, pratos, estoque, quem, onDone }: { sols: Solicitacao[]; pratos: Prato[]; estoque: { nome: string; loja: string; preco_unitario: number | null }[]; quem: string; onDone: (ticketId?: string) => void }) {
  const [sel, setSel] = useState<Solicitacao | null>(null)
  if (!sols.length) return <Vazio t="Nenhuma solicitação aguardando aprovação. ✅" />
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {sols.map(s => (
        <div key={s.id} style={{ ...card, display: 'grid', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}><b>#{s.numero} · {s.nome}</b><span style={{ color: 'var(--muted)', fontSize: 13 }}>{fmtDH(s.data_hora)}</span></div>
          <div style={{ fontSize: 13.5 }}>{s.loja} · {s.tipo_solicitante}{s.empresa ? ` · ${s.empresa}` : ''}</div>
          <div style={{ fontSize: 13.5 }}>Motivo: {s.motivo || '—'} · Prato pedido: <b>{s.prato_solicitado || '—'}</b>{s.obs ? ` · Obs.: ${s.obs}` : ''}</div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Responsável: {s.responsavel || '—'} · Solicitado por {s.solicitado_por || '—'}</div>
          <Btn onClick={() => setSel(s)}>Analisar</Btn>
        </div>
      ))}
      {sel && <Decidir s={sel} pratos={pratos} estoque={estoque} quem={quem} onClose={() => setSel(null)} onDone={tk => { setSel(null); onDone(tk) }} />}
    </div>
  )
}

function Decidir({ s, pratos, estoque, quem, onClose, onDone }: { s: Solicitacao; pratos: Prato[]; estoque: { nome: string; loja: string; preco_unitario: number | null }[]; quem: string; onClose: () => void; onDone: (ticketId?: string) => void }) {
  const ativos = pratos.filter(p => p.ativo)
  const inicial = ativos.find(p => norm(p.nome) === norm(s.prato_solicitado))
  const [pid, setPid] = useState(inicial?.id || '')
  const [qtd, setQtd] = useState('1'); const [adSel, setAdSel] = useState<string[]>([]); const [custo, setCusto] = useState(''); const [obs, setObs] = useState(''); const [recusando, setRecusando] = useState(false); const [motivo, setMotivo] = useState(''); const [env, setEnv] = useState(false)
  const prato = ativos.find(p => p.id === pid)
  const sugerido = (p: Prato | undefined) => {
    if (!p) return 0
    if (p.custo != null) return Number(p.custo)
    return p.ingredientes.reduce((a, i) => { const e = estoque.find(x => x.loja.toLowerCase() === s.loja.toLowerCase() && norm(x.nome) === norm(i.nome)); return a + (e?.preco_unitario ? Number(e.preco_unitario) * Number(i.qtd) : 0) }, 0)
  }
  useEffect(() => { setCusto(prato ? String(sugerido(prato)).replace('.', ',') : ''); setAdSel([]) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [pid])
  const adicionais = (prato?.adicionais || []).filter(a => adSel.includes(a.nome))
  const unit = parseNum(custo) + adicionais.reduce((a, x) => a + Number(x.custo || 0), 0)
  const q = parseNum(qtd) || 0
  const aprovar = async () => {
    if (!prato) return alert('Escolha o prato autorizado (do cadastro de pratos).')
    if (q <= 0) return alert('Quantidade inválida.')
    setEnv(true)
    const { data, error } = await sb.rpc('ali_aprovar', { p_sol: s.id, p_por: quem, p_prato_id: prato.id, p_prato_nome: prato.nome, p_qtd: q, p_adicionais: adicionais, p_ingredientes: prato.ingredientes, p_custo_unit: unit, p_obs_cozinha: obs || null, p_prato_alterado: !!s.prato_solicitado && norm(s.prato_solicitado) !== norm(prato.nome) })
    setEnv(false)
    if (error) return alert('Erro: ' + rpcErro(error))
    onDone((data as Ticket).id)
  }
  const recusar = async () => {
    setEnv(true)
    const { error } = await sb.rpc('ali_recusar', { p_sol: s.id, p_por: quem, p_motivo: motivo })
    setEnv(false)
    if (error) return alert(rpcErro(error))
    onDone()
  }
  return (
    <Modal titulo={`Aprovação #${s.numero} — ${s.nome}`} onClose={onClose}>
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ fontSize: 13.5 }}>{s.loja} · {s.tipo_solicitante}{s.empresa ? ` · ${s.empresa}` : ''}<br />Motivo: {s.motivo} · Prato pedido: <b>{s.prato_solicitado || '—'}</b>{s.obs ? <><br />Obs.: {s.obs}</> : null}</div>
        {!recusando ? (<>
          <div><label style={lbl}>Prato autorizado * (mesmo do estoque/ficha técnica)</label>
            <select style={inp} value={pid} onChange={e => setPid(e.target.value)}><option value="">Selecione…</option>{ativos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}</select>
            {ativos.length === 0 && <div style={{ color: '#dc2626', fontSize: 13, marginTop: 4 }}>Nenhum prato cadastrado — cadastre na aba “🍽️ Pratos”.</div>}
            {prato && s.prato_solicitado && norm(prato.nome) !== norm(s.prato_solicitado) && <div style={{ color: '#ca8a04', fontSize: 13, marginTop: 4 }}>⚠ Prato diferente do solicitado — ficará registrado como nova autorização.</div>}
          </div>
          <div style={grid(150)}>
            <div><label style={lbl}>Quantidade</label><input style={inp} inputMode="decimal" value={qtd} onChange={e => setQtd(e.target.value)} /></div>
            <div><label style={lbl}>Custo do prato (R$)</label><input style={inp} inputMode="decimal" value={custo} onChange={e => setCusto(e.target.value)} /></div>
          </div>
          {prato && prato.adicionais.length > 0 && <div><label style={lbl}>Adicionais permitidos</label><div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{prato.adicionais.map(a => { const on = adSel.includes(a.nome); return <button key={a.nome} type="button" onClick={() => setAdSel(on ? adSel.filter(x => x !== a.nome) : [...adSel, a.nome])} style={{ padding: '8px 12px', borderRadius: 99, border: `1px solid ${on ? 'var(--bordo)' : 'var(--border)'}`, background: on ? 'var(--bordo)' : 'var(--bg)', color: on ? '#fff' : 'var(--text)', fontWeight: 600, cursor: 'pointer' }}>{on ? '✓ ' : ''}{a.nome} (+{brl(a.custo)})</button> })}</div></div>}
          <div><label style={lbl}>Observações para a cozinha</label><input style={inp} value={obs} onChange={e => setObs(e.target.value)} /></div>
          <div style={{ fontWeight: 800 }}>Custo total: {brl(unit * q)}</div>
          <Btn tone="ok" onClick={() => void aprovar()} disabled={env}>{env ? 'Emitindo…' : '✅ Aprovar e emitir ticket'}</Btn>
          <Btn tone="danger" onClick={() => setRecusando(true)}>Recusar</Btn>
        </>) : (<>
          <div><label style={lbl}>Motivo da recusa *</label><textarea style={{ ...inp, minHeight: 70 }} value={motivo} onChange={e => setMotivo(e.target.value)} /></div>
          <Btn tone="danger" onClick={() => void recusar()} disabled={env || !motivo.trim()}>Confirmar recusa</Btn>
          <Btn tone="ghost" onClick={() => setRecusando(false)}>Voltar</Btn>
        </>)}
      </div>
    </Modal>
  )
}

// ───────────────────────── Tickets / fila de impressão ─────────────────────────
function Tickets({ sols, tks, onPrint, onOpen, lojas }: { sols: Solicitacao[]; tks: Ticket[]; onPrint: (id: string, auto?: boolean) => void; onOpen: (id: string) => void; lojas: string[] }) {
  const [loja, setLoja] = useState('')
  const lista = tks.filter(t => !loja || t.loja === loja)
  const fila = lista.filter(t => t.status === 'emitido' && !t.impresso_em)
  const aguard = lista.filter(t => t.status === 'emitido' && t.impresso_em)
  const outros = lista.filter(t => t.status !== 'emitido').slice(0, 30)
  const blk = (titulo: string, arr: Ticket[], dica?: string) => (
    <div style={card}>
      <div style={{ fontWeight: 800 }}>{titulo} ({arr.length})</div>{dica && <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 4 }}>{dica}</div>}
      {arr.length === 0 ? <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>—</div> : arr.map(t => {
        const s = sols.find(x => x.id === t.solicitacao_id)
        return (
          <div key={t.id} style={{ borderTop: '1px solid var(--border)', padding: '9px 0', display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <div onClick={() => onOpen(t.solicitacao_id)} style={{ cursor: 'pointer' }}><b>{t.codigo}</b> · {t.qtd}x {t.prato_nome}<div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{t.loja} · {s?.nome} · {fmtDH(t.emitido_em)}{t.status === 'entregue' ? ` · entregue ${fmtDH(t.entregue_em)}` : ''}{t.status === 'cancelado' ? ' · cancelado' : ''}</div></div>
            {t.status === 'emitido' ? <Btn small onClick={() => onPrint(t.id, true)}>🖨 {t.impresso_em ? 'Reimprimir' : 'Imprimir'}</Btn> : <Pill cor={t.status === 'entregue' ? '#16a34a' : '#6b7280'}>{t.status === 'entregue' ? 'Utilizado' : 'Cancelado'}</Pill>}
          </div>
        )
      })}
    </div>
  )
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <select style={{ ...inp, maxWidth: 260 }} value={loja} onChange={e => setLoja(e.target.value)}><option value="">Todas as lojas</option>{lojas.map(l => <option key={l}>{l}</option>)}</select>
      {blk('🕒 Fila de impressão', fila, 'Aprovados que ainda não foram impressos (impressora offline ou aba bloqueada). Toque em Imprimir.')}
      {blk('🎫 Impressos — aguardando retirada', aguard)}
      {blk('Concluídos / cancelados (recentes)', outros)}
    </div>
  )
}

// ───────────────────────── Cozinha ─────────────────────────
function Cozinha({ lojas, lojaCtx, sols, tks, quem, onDone }: { lojas: string[]; lojaCtx: string; sols: Solicitacao[]; tks: Ticket[]; quem: string; onDone: () => void }) {
  const [loja, setLoja] = useState(lojas.includes(lojaCtx) ? lojaCtx : lojas[0]); const [cod, setCod] = useState('')
  const pend = tks.filter(t => t.status === 'emitido' && t.loja === loja && (!cod || norm(t.codigo).includes(norm(cod)) || String(t.numero).padStart(6, '0').includes(cod)))
  const confirmar = async (t: Ticket) => {
    if (!confirm(`Confirmar ENTREGA de ${t.qtd}x ${t.prato_nome} (${t.codigo})?\nIsto baixa os insumos do estoque e o ticket não poderá ser usado de novo.`)) return
    const { data, error } = await sb.rpc('ali_confirmar_entrega', { p_ticket: t.id, p_por: quem, p_codigo: t.codigo })
    if (error) return alert('⛔ ' + rpcErro(error))
    const sem = (data.itens || []).filter((i: { baixado: boolean }) => !i.baixado).length
    alert(`✅ Entrega confirmada. ${sem ? `${sem} insumo(s) sem correspondência no estoque (custo registrado, sem baixa).` : 'Insumos baixados do estoque.'}`)
    onDone()
  }
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={grid(200)}>
        <select style={inp} value={loja} onChange={e => setLoja(e.target.value)}>{lojas.map(l => <option key={l}>{l}</option>)}</select>
        <input style={inp} placeholder="Buscar pelo código (ex.: AMR-000125)" value={cod} onChange={e => setCod(e.target.value)} />
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Link da cozinha (sem login, para tablet/celular da loja): <b>{siteOrigin()}/ticket-cozinha.html?loja={encodeURIComponent(loja)}</b></div>
      {pend.length === 0 ? <Vazio t="Nenhum ticket aguardando retirada nesta loja." /> : pend.map(t => {
        const s = sols.find(x => x.id === t.solicitacao_id)
        return (
          <div key={t.id} style={{ ...card, display: 'grid', gap: 4 }}>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{t.qtd}x {t.prato_nome}</div>
            <div style={{ fontSize: 13.5 }}>{t.codigo} · {s?.nome} ({s?.tipo_solicitante}{s?.empresa ? ` · ${s.empresa}` : ''})</div>
            {t.adicionais?.length > 0 && <div style={{ fontSize: 13.5 }}>Adicionais: {t.adicionais.map(a => a.nome).join(', ')}</div>}
            {t.obs_cozinha && <div style={{ fontSize: 13.5, color: '#ca8a04' }}>📝 {t.obs_cozinha}</div>}
            <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Autorizado por {t.autorizado_por} · {fmtDH(t.emitido_em)}</div>
            <Btn tone="ok" onClick={() => void confirmar(t)}>✅ Confirmar entrega</Btn>
          </div>
        )
      })}
    </div>
  )
}

// ───────────────────────── Consumo / Estoque ─────────────────────────
function ConsumoTab({ cons, tks, lojas, de, ate, setDe, setAte }: { cons: Consumo[]; tks: Ticket[]; lojas: string[]; de: string; ate: string; setDe: (v: string) => void; setAte: (v: string) => void }) {
  const [loja, setLoja] = useState('')
  const l = cons.filter(c => !loja || c.loja === loja)
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ ...card, ...grid(150) }}>
        <div><label style={lbl}>De</label><input type="date" style={inp} value={de} onChange={e => setDe(e.target.value)} /></div>
        <div><label style={lbl}>Até</label><input type="date" style={inp} value={ate} onChange={e => setAte(e.target.value)} /></div>
        <div><label style={lbl}>Loja</label><select style={inp} value={loja} onChange={e => setLoja(e.target.value)}><option value="">Todas</option>{lojas.map(x => <option key={x}>{x}</option>)}</select></div>
      </div>
      <div style={{ fontWeight: 800 }}>{l.length} lançamento(s) · {brl(l.reduce((a, c) => a + Number(c.custo_total), 0))} · categoria “alimentação autorizada”</div>
      {l.length === 0 ? <Vazio t="Nenhum consumo registrado no período. A baixa só ocorre após a confirmação de entrega pela cozinha." /> : l.map(c => {
        const t = tks.find(x => x.id === c.ticket_id)
        return (
          <div key={c.id} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}><b>{t?.codigo || ''} · {c.qtd}x {c.prato_nome}</b><b>{brl(c.custo_total)}</b></div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{c.loja} · {fmtDH(c.created_at)} · por {c.registrado_por}</div>
            {c.itens.length === 0 ? <div style={{ fontSize: 13, color: '#ca8a04' }}>Prato sem ficha de insumos — custo registrado, sem baixa de estoque.</div> :
              c.itens.map((i, k) => <div key={k} style={{ fontSize: 13, display: 'flex', justifyContent: 'space-between', gap: 8, borderTop: '1px dashed var(--border)', padding: '2px 0' }}><span>{i.nome}</span><span>{i.baixado ? `−${i.qtd} ${i.unidade} (saldo ${i.saldo_antes} → ${i.saldo_depois})` : '⚠ sem correspondência no estoque'}</span></div>)}
          </div>
        )
      })}
    </div>
  )
}

// ───────────────────────── Pratos ─────────────────────────
function Pratos({ pratos, estoque, lojas, quem, onDone }: { pratos: Prato[]; estoque: { nome: string; loja: string; preco_unitario: number | null }[]; lojas: string[]; quem: string; onDone: () => void }) {
  const [ed, setEd] = useState<Partial<Prato> | null>(null)
  const nomesEstoque = useMemo(() => Array.from(new Set(estoque.map(e => e.nome))), [estoque])
  const importar = async () => {
    const fichas = await fetchCozinhaFichas()
    if (!fichas.length) return alert('Não há fichas técnicas cadastradas em Cozinha → Ficha Técnica. Cadastre os pratos aqui diretamente.')
    const novos = fichas.filter(f => !pratos.some(p => p.ficha_id === f.id)).map(f => ({ nome: f.nome, ficha_id: f.id, custo: f.custo_total || null, ingredientes: (f.ingredientes || []).map(i => ({ nome: i.desc, qtd: parseNum(i.qtd), unidade: i.unidade })), created_by: quem }))
    if (!novos.length) return alert('Todas as fichas já foram importadas.')
    const { error } = await sb.from('ali_pratos').insert(novos)
    if (error) return alert(rpcErro(error))
    alert(`${novos.length} prato(s) importado(s). Confira os insumos: o nome precisa ser igual ao do estoque para baixar automaticamente.`); onDone()
  }
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><Btn onClick={() => setEd({ nome: '', ingredientes: [], adicionais: [], ativo: true, custo: null })}>➕ Novo prato</Btn><Btn tone="ghost" onClick={() => void importar()}>⬇ Importar das fichas técnicas</Btn></div>
      <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>O prato cadastrado aqui é o mesmo usado na aprovação, no ticket, na cozinha e na baixa de estoque. Os insumos (nome = nome no estoque, quantidade na unidade do estoque) são baixados só na confirmação de entrega.</div>
      {pratos.length === 0 ? <Vazio t="Nenhum prato cadastrado ainda." /> : pratos.map(p => (
        <div key={p.id} style={{ ...card, display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center', opacity: p.ativo ? 1 : 0.55 }}>
          <div><b>{p.nome}</b>{!p.ativo && ' (inativo)'}<div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{p.custo != null ? brl(p.custo) : 'custo pelos insumos'} · {p.ingredientes.length} insumo(s) · {p.adicionais.length} adicional(is)</div></div>
          <Btn small tone="ghost" onClick={() => setEd(p)}>Editar</Btn>
        </div>
      ))}
      {ed && <PratoForm p={ed} nomes={nomesEstoque} lojas={lojas} quem={quem} onClose={() => setEd(null)} onDone={() => { setEd(null); onDone() }} />}
    </div>
  )
}

function PratoForm({ p, nomes, quem, onClose, onDone }: { p: Partial<Prato>; nomes: string[]; lojas: string[]; quem: string; onClose: () => void; onDone: () => void }) {
  const [nome, setNome] = useState(p.nome || ''); const [custo, setCusto] = useState(p.custo != null ? String(p.custo).replace('.', ',') : ''); const [ativo, setAtivo] = useState(p.ativo !== false)
  const [ing, setIng] = useState<Ingrediente[]>(p.ingredientes || []); const [ad, setAd] = useState<{ nome: string; custo: number }[]>(p.adicionais || [])
  const salvar = async () => {
    if (!nome.trim()) return alert('Informe o nome do prato.')
    const row = { nome: nome.trim().toUpperCase(), custo: custo.trim() ? parseNum(custo) : null, ativo, ingredientes: ing.filter(i => i.nome.trim()), adicionais: ad.filter(a => a.nome.trim()), updated_at: new Date().toISOString() }
    const r = p.id ? await sb.from('ali_pratos').update(row).eq('id', p.id) : await sb.from('ali_pratos').insert({ ...row, created_by: quem })
    if (r.error) return alert(rpcErro(r.error))
    onDone()
  }
  return (
    <Modal titulo={p.id ? 'Editar prato' : 'Novo prato'} onClose={onClose}>
      <div style={{ display: 'grid', gap: 10 }}>
        <div><label style={lbl}>Nome do prato</label><input style={inp} value={nome} onChange={e => setNome(e.target.value)} /></div>
        <div style={grid(160)}>
          <div><label style={lbl}>Custo padrão (R$) — vazio = soma dos insumos</label><input style={inp} inputMode="decimal" value={custo} onChange={e => setCusto(e.target.value)} /></div>
          <div><label style={lbl}>Situação</label><select style={inp} value={ativo ? '1' : '0'} onChange={e => setAtivo(e.target.value === '1')}><option value="1">Ativo</option><option value="0">Inativo</option></select></div>
        </div>
        <div style={{ fontWeight: 800 }}>Insumos (ficha técnica)</div>
        <datalist id="ali-est">{nomes.map(n => <option key={n} value={n} />)}</datalist>
        {ing.map((i, k) => (
          <div key={k} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 60px 32px', gap: 6 }}>
            <input style={inp} list="ali-est" placeholder="Produto do estoque" value={i.nome} onChange={e => setIng(ing.map((x, y) => y === k ? { ...x, nome: e.target.value } : x))} />
            <input style={inp} inputMode="decimal" placeholder="Qtd" value={i.qtd || ''} onChange={e => setIng(ing.map((x, y) => y === k ? { ...x, qtd: parseNum(e.target.value) } : x))} />
            <input style={inp} placeholder="un" value={i.unidade} onChange={e => setIng(ing.map((x, y) => y === k ? { ...x, unidade: e.target.value } : x))} />
            <button onClick={() => setIng(ing.filter((_, y) => y !== k))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#dc2626' }}>✕</button>
          </div>
        ))}
        <Btn small tone="ghost" onClick={() => setIng([...ing, { nome: '', qtd: 0, unidade: 'un' }])}>+ Insumo</Btn>
        <div style={{ fontWeight: 800 }}>Adicionais permitidos</div>
        {ad.map((a, k) => (
          <div key={k} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 32px', gap: 6 }}>
            <input style={inp} placeholder="Ex.: Ovo frito" value={a.nome} onChange={e => setAd(ad.map((x, y) => y === k ? { ...x, nome: e.target.value } : x))} />
            <input style={inp} inputMode="decimal" placeholder="Custo" value={a.custo || ''} onChange={e => setAd(ad.map((x, y) => y === k ? { ...x, custo: parseNum(e.target.value) } : x))} />
            <button onClick={() => setAd(ad.filter((_, y) => y !== k))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#dc2626' }}>✕</button>
          </div>
        ))}
        <Btn small tone="ghost" onClick={() => setAd([...ad, { nome: '', custo: 0 }])}>+ Adicional</Btn>
        <Btn onClick={() => void salvar()}>Salvar prato</Btn>
      </div>
    </Modal>
  )
}

// ───────────────────────── Config (administrador) ─────────────────────────
function Config({ cfg, setCfg, lojas }: { cfg: AliConfig; setCfg: (c: AliConfig) => void; lojas: string[] }) {
  const [c, setC] = useState(cfg); const [em, setEm] = useState(''); const [emp, setEmp] = useState(''); const [msg, setMsg] = useState('')
  const salvar = async () => { await salvarConfig(c); setCfg(c); setMsg('Salvo ✔'); setTimeout(() => setMsg(''), 2500) }
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={card}><div style={{ fontWeight: 800 }}>🖨 Impressora por loja</div><div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 6 }}>Nome/identificação da impressora térmica (80mm) de cada loja. Fase 1: a impressão usa o diálogo do navegador do dispositivo da loja — deixe a térmica como padrão. O agente de impressão automática entra na próxima fase.</div>
        <div style={grid(220)}>{lojas.map(l => <div key={l}><label style={lbl}>{l}</label><input style={inp} value={c.impressoras[l] || ''} onChange={e => setC({ ...c, impressoras: { ...c.impressoras, [l]: e.target.value } })} placeholder="Ex.: Epson TM-T20 — balcão" /></div>)}</div></div>
      <div style={card}><div style={{ fontWeight: 800 }}>👥 Perfis por e-mail</div><div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 6 }}>Donos/administradores têm todos os perfis. Sem configuração: Wagner e Aline = Gestor/Estoque/Administrativo; demais liberados = Solicitante + Cozinha. O e-mail também precisa estar liberado no módulo (lista em permissions.ts).</div>
        {Object.entries(c.perfis).map(([e, ps]) => (
          <div key={e} style={{ borderTop: '1px solid var(--border)', padding: '8px 0' }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><b style={{ fontSize: 13.5 }}>{e}</b><button onClick={() => { const p = { ...c.perfis }; delete p[e]; setC({ ...c, perfis: p }) }} style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer' }}>remover</button></div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>{PERFIS.map(p => { const on = ps.includes(p.id); return <button key={p.id} onClick={() => setC({ ...c, perfis: { ...c.perfis, [e]: on ? ps.filter(x => x !== p.id) : [...ps, p.id] } })} style={{ padding: '6px 10px', borderRadius: 99, border: `1px solid ${on ? 'var(--bordo)' : 'var(--border)'}`, background: on ? 'var(--bordo)' : 'var(--bg)', color: on ? '#fff' : 'var(--text)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>{p.label}</button> })}</div></div>
        ))}
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}><input style={inp} placeholder="e-mail do usuário" value={em} onChange={e => setEm(e.target.value)} /><Btn small onClick={() => { const k = em.trim().toLowerCase(); if (k) { setC({ ...c, perfis: { ...c.perfis, [k]: ['solicitante'] } }); setEm('') } }}>Adicionar</Btn></div></div>
      <div style={card}><div style={{ fontWeight: 800 }}>🏢 Empresas terceirizadas (sugestões)</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '6px 0' }}>{c.empresas.map(e => <Pill key={e} cor="#2563eb">{e} <span style={{ cursor: 'pointer' }} onClick={() => setC({ ...c, empresas: c.empresas.filter(x => x !== e) })}>✕</span></Pill>)}</div>
        <div style={{ display: 'flex', gap: 6 }}><input style={inp} placeholder="nome da empresa" value={emp} onChange={e => setEmp(e.target.value)} /><Btn small onClick={() => { if (emp.trim()) { setC({ ...c, empresas: [...c.empresas, emp.trim()] }); setEmp('') } }}>Adicionar</Btn></div></div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Btn onClick={() => void salvar()}>Salvar configurações</Btn><span style={{ color: '#16a34a', fontWeight: 700 }}>{msg}</span></div>
    </div>
  )
}

// ───────────────────────── Detalhe / auditoria ─────────────────────────
function Detalhe({ id, sol, tk, quem, aud, onPrint, onClose, onDone }: { id: string; sol?: Solicitacao; tk?: Ticket; quem: string; aud: (tipo: string, ref: string, acao: string, det: string, antes?: unknown, depois?: unknown) => PromiseLike<unknown>; onPrint: (id: string, auto?: boolean) => void; onClose: () => void; onDone: () => void }) {
  const [hist, setHist] = useState<Auditoria[]>([]); const [modo, setModo] = useState<'' | 'editar' | 'cancelar'>('')
  const [f, setF] = useState({ nome: sol?.nome || '', empresa: sol?.empresa || '', responsavel: sol?.responsavel || '', motivo: sol?.motivo || '', obs: sol?.obs || '' }); const [just, setJust] = useState('')
  const ler = useCallback(async () => {
    const ids = [id, ...(tk ? [tk.id] : [])]
    const { data } = await sb.from('ali_auditoria').select('*').in('ref_id', ids).order('em', { ascending: false })
    setHist(data || [])
  }, [id, tk])
  useEffect(() => { void ler() }, [ler])
  if (!sol) return null
  const salvar = async () => {
    const antes: Record<string, unknown> = {}; const depois: Record<string, unknown> = {}
    for (const k of Object.keys(f) as (keyof typeof f)[]) { const n = f[k] || null; if ((sol[k] || null) !== n) { antes[k] = sol[k]; depois[k] = n } }
    if (!Object.keys(depois).length) return setModo('')
    const { error } = await sb.from('ali_solicitacoes').update({ ...Object.fromEntries(Object.entries(depois)), updated_at: new Date().toISOString() }).eq('id', sol.id)
    if (error) return alert(rpcErro(error))
    await aud('solicitacao', sol.id, 'editada', `Campos: ${Object.keys(depois).join(', ')}`, antes, depois)
    setModo(''); void ler(); onDone()
  }
  const cancelar = async () => {
    const { error } = await sb.rpc('ali_cancelar', { p_sol: sol.id, p_por: quem, p_just: just })
    if (error) return alert(rpcErro(error))
    setModo(''); void ler(); onDone()
  }
  return (
    <Modal titulo={`Solicitação #${sol.numero}${tk ? ' · ' + tk.codigo : ''}`} onClose={onClose}>
      <div style={{ display: 'grid', gap: 8 }}>
        <Chip s={sol.status} />
        <div style={{ fontSize: 14 }}><b>{sol.nome}</b> · {sol.tipo_solicitante}{sol.empresa ? ` · ${sol.empresa}` : ''}<br />{sol.loja} · {fmtDH(sol.data_hora)}<br />Responsável: {sol.responsavel || '—'} · Motivo: {sol.motivo || '—'}<br />Prato solicitado: {sol.prato_solicitado || '—'}{sol.obs ? <><br />Obs.: {sol.obs}</> : null}</div>
        {sol.motivo_recusa && <div style={{ color: '#dc2626' }}>Recusa ({sol.decidido_por}): {sol.motivo_recusa}</div>}
        {sol.justificativa_cancel && <div style={{ color: '#6b7280' }}>Cancelada por {sol.cancelado_por} em {fmtDH(sol.cancelado_em)}: {sol.justificativa_cancel}</div>}
        {tk && <div style={{ fontSize: 14, background: 'var(--bg)', borderRadius: 10, padding: 10 }}>Ticket <b>{tk.codigo}</b>: {tk.qtd}x {tk.prato_nome} · custo {brl(tk.custo_total)} · aut. {tk.autorizado_por}<br />{tk.impresso_em ? `Impresso ${fmtDH(tk.impresso_em)} (${tk.impressoes}x)` : 'Ainda não impresso (na fila)'}{tk.status === 'entregue' ? <><br />Entregue {fmtDH(tk.entregue_em)} por {tk.entregue_por}</> : null}{tk.obs_cozinha ? <><br />Cozinha: {tk.obs_cozinha}</> : null}</div>}
        {modo === '' && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {tk?.status === 'emitido' && <Btn small onClick={() => onPrint(tk.id, true)}>🖨 {tk.impresso_em ? 'Reimprimir' : 'Imprimir'}</Btn>}
          <Btn small tone="ghost" onClick={() => setModo('editar')}>✏️ Editar</Btn>
          {!['concluida', 'cancelada', 'recusada'].includes(sol.status) && <Btn small tone="danger" onClick={() => setModo('cancelar')}>Cancelar</Btn>}
        </div>}
        {modo === 'editar' && <div style={{ display: 'grid', gap: 6 }}>
          {(['nome', 'empresa', 'responsavel', 'motivo', 'obs'] as const).map(k => <div key={k}><label style={lbl}>{k === 'obs' ? 'Observações' : k.charAt(0).toUpperCase() + k.slice(1)}</label><input style={inp} value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} /></div>)}
          <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>A alteração fica registrada no histórico (quem, quando, antes/depois).</div>
          <Btn onClick={() => void salvar()}>Salvar alteração</Btn><Btn tone="ghost" onClick={() => setModo('')}>Voltar</Btn></div>}
        {modo === 'cancelar' && <div style={{ display: 'grid', gap: 6 }}>
          <label style={lbl}>Justificativa do cancelamento *</label><textarea style={{ ...inp, minHeight: 60 }} value={just} onChange={e => setJust(e.target.value)} />
          <Btn tone="danger" disabled={!just.trim()} onClick={() => void cancelar()}>Confirmar cancelamento</Btn><Btn tone="ghost" onClick={() => setModo('')}>Voltar</Btn></div>}
        <div style={{ fontWeight: 800, marginTop: 6 }}>Histórico / rastreabilidade</div>
        {hist.length === 0 ? <div style={{ color: 'var(--muted)', fontSize: 13 }}>Sem registros.</div> : hist.map(h => (
          <div key={h.id} style={{ borderTop: '1px solid var(--border)', padding: '6px 0', fontSize: 13 }}>
            <b>{h.acao}</b> — {h.por} · {fmtDH(h.em)}{h.detalhe ? <div style={{ color: 'var(--muted)' }}>{h.detalhe}</div> : null}
            {h.antes != null && h.depois != null && <div style={{ fontSize: 12, color: 'var(--muted)' }}>antes: {JSON.stringify(h.antes)} → depois: {JSON.stringify(h.depois)}</div>}
          </div>
        ))}
      </div>
    </Modal>
  )
}
