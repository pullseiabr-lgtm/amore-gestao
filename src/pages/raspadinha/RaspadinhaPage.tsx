import { useState, useEffect, useMemo, useCallback } from 'react'
import { Ticket, BarChart3, Users, QrCode, RefreshCw, CheckCircle2, XCircle, SlidersHorizontal, Lock, ShieldCheck, Play, Pause, Save } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../hooks/useToast'
import { useAuth } from '../../contexts/AuthContext'
import { fetchRaspBloqueio, setRaspBloqueio, pausarPremio, editarPremio, type RaspBloqueio } from '../../lib/db'

const sb = supabase as any
const RASP_URL = 'https://painel.amorefood.com.br/raspadinha.html'
const slugLoja = (l: string) => (l === 'Amore CD' ? 'cd' : l === 'Amore Paiva' ? 'paiva' : l)
const qrImg = (data: string, size = 200) => `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=8&data=${encodeURIComponent(data)}`
const fmtDT = (d: string | null) => d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'
const fmtD = (d: string | null) => d ? d.split('-').reverse().join('/') : '—'
const STATUS_COR: Record<string, string> = { disponivel: '#3B82F6', resgatado: '#10B981', expirado: '#9ca3af', cancelado: '#EF4444', bloqueado: '#EF4444' }

type Tab = 'dashboard' | 'gerenciar' | 'validar' | 'participantes' | 'qr'

export default function RaspadinhaPage() {
  const { toast } = useToast()
  const { user } = useAuth()
  const userName = user?.name || (user as any)?.email || 'Painel'
  const [tab, setTab] = useState<Tab>('dashboard')
  const [campanhas, setCampanhas] = useState<any[]>([])
  const [campId, setCampId] = useState<string>('')
  const [premios, setPremios] = useState<any[]>([])
  const [parts, setParts] = useState<any[]>([])
  const [bloq, setBloq] = useState<RaspBloqueio | null>(null)
  const [loading, setLoading] = useState(true)

  const loadCamps = useCallback(async () => {
    const { data } = await sb.from('rasp_campanhas').select('*').order('created_at', { ascending: false })
    setCampanhas(data || [])
    if (!campId && data && data.length) setCampId(data[0].id)
  }, [campId])

  const loadCamp = useCallback(async () => {
    if (!campId) { setLoading(false); return }
    setLoading(true)
    const [pr, pa] = await Promise.all([
      sb.from('rasp_premios').select('*').eq('campanha_id', campId).order('ordem'),
      sb.from('rasp_participacoes').select('*').eq('campanha_id', campId).order('created_at', { ascending: false }).limit(3000),
    ])
    setPremios(pr.data || []); setParts(pa.data || []); setLoading(false)
  }, [campId])

  const loadBloq = useCallback(async () => { setBloq(await fetchRaspBloqueio()) }, [])

  useEffect(() => { loadCamps() }, [loadCamps])
  useEffect(() => { loadCamp() }, [loadCamp])
  useEffect(() => { loadBloq() }, [loadBloq])

  const camp = campanhas.find(c => c.id === campId)
  const kpi = useMemo(() => {
    const total = parts.length
    const ganhos = parts.filter(p => p.ganhou).length
    const resg = parts.filter(p => p.status === 'resgatado').length
    const contatos = new Set(parts.map(p => p.telefone)).size
    const estoque = premios.reduce((s, p) => s + p.quantidade, 0)
    const distrib = premios.reduce((s, p) => s + p.distribuidos, 0)
    return { total, ganhos, resg, contatos, estoque, distrib, taxaResg: ganhos ? Math.round((resg / ganhos) * 100) : 0, restante: estoque - distrib }
  }, [parts, premios])

  const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '1.1rem 1.3rem' }
  const kcard = (label: string, value: string | number, sub?: string, color = '#8B1212') => (
    <div style={{ ...card, flex: 1, minWidth: 140 }}>
      <div style={{ fontSize: 12, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1.1, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{sub}</div>}
    </div>
  )
  const tabBtn = (id: Tab, icon: React.ReactNode, label: string) => (
    <button onClick={() => setTab(id)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '.6rem 1rem', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 500, background: tab === id ? '#8B1212' : 'transparent', color: tab === id ? '#fff' : '#6b7280' }}>{icon}{label}</button>
  )

  return (
    <div style={{ padding: '1rem 0' }}>
      {bloq?.bloqueada && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#B42318', borderRadius: 12, padding: '.7rem 1rem', marginBottom: 14, fontSize: 14 }}>
          <Lock size={18} />
          <div><b>Premiações bloqueadas.</b> Os clientes conseguem jogar, mas todas as raspadinhas mostram “Não foi dessa vez”. {bloq.por && <>Bloqueado por {bloq.por}{bloq.em ? ` em ${fmtDT(bloq.em)}` : ''}.</>} Reative na aba <b>Prêmios &amp; Status</b>.</div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <select value={campId} onChange={e => setCampId(e.target.value)} style={{ padding: '.55rem .8rem', borderRadius: 10, border: '1px solid #e5e7eb', maxWidth: 320 }}>
          {campanhas.length === 0 && <option>Nenhuma campanha</option>}
          {campanhas.map(c => <option key={c.id} value={c.id}>{c.nome} {c.status !== 'ativa' ? `(${c.status})` : ''}</option>)}
        </select>
        <button onClick={() => { loadCamps(); loadCamp() }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '.55rem .9rem', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer' }}><RefreshCw size={15} />Atualizar</button>
        {camp && <span style={{ fontSize: 12, color: '#6b7280' }}>{fmtD(camp.data_inicio)} → {fmtD(camp.data_fim)} · {(camp.unidades || []).join(', ') || 'Todas'}</span>}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18, background: '#f9fafb', padding: 6, borderRadius: 12, width: 'fit-content' }}>
        {tabBtn('dashboard', <BarChart3 size={16} />, 'Dashboard')}
        {tabBtn('gerenciar', <SlidersHorizontal size={16} />, 'Prêmios & Status')}
        {tabBtn('validar', <Ticket size={16} />, 'Validar Cupom')}
        {tabBtn('participantes', <Users size={16} />, 'Participantes')}
        {tabBtn('qr', <QrCode size={16} />, 'QR Codes')}
      </div>

      {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Carregando…</div> : !camp ? <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Nenhuma campanha cadastrada.</div> : <>

      {tab === 'dashboard' && <>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          {kcard('Participações', kpi.total)}
          {kcard('Prêmios liberados', kpi.ganhos, `${kpi.restante} em estoque`, '#3B82F6')}
          {kcard('Resgatados', kpi.resg, `${kpi.taxaResg}% de resgate`, '#10B981')}
          {kcard('Contatos captados', kpi.contatos, 'clientes únicos', '#E0A83E')}
        </div>
        <div style={card}>
          <b style={{ fontSize: 14 }}>Estoque de prêmios</b>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10, fontSize: 14 }}>
            <thead><tr style={{ textAlign: 'left', color: '#9ca3af', fontSize: 12, textTransform: 'uppercase' }}>
              <th style={{ padding: 8 }}>Prêmio</th><th>Total</th><th>Liberados</th><th>Resgatados</th><th>Restante</th><th>Progresso</th>
            </tr></thead>
            <tbody>
              {premios.map(p => { const pct = p.quantidade ? Math.round((p.distribuidos / p.quantidade) * 100) : 0
                return <tr key={p.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                  <td style={{ padding: 8, fontWeight: 600 }}>{p.is_premio ? '🎁' : '—'} {p.nome}</td>
                  <td>{p.quantidade}</td><td>{p.distribuidos}</td><td>{p.resgatados}</td><td>{p.quantidade - p.distribuidos}</td>
                  <td style={{ width: 160 }}><div style={{ height: 10, background: '#f3f4f6', borderRadius: 5, overflow: 'hidden' }}><div style={{ width: pct + '%', height: '100%', background: p.cor || '#8B1212' }} /></div></td>
                </tr> })}
            </tbody>
          </table>
        </div>
      </>}

      {tab === 'gerenciar' && <GerenciarTab premios={premios} bloq={bloq} userName={userName} toast={toast} onDone={() => { loadCamp(); loadBloq() }} />}

      {tab === 'validar' && <ValidarTab validador={user?.name || (user as any)?.email || 'Atendente'} toast={toast} onDone={loadCamp} />}

      {tab === 'participantes' && <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <b style={{ fontSize: 14 }}>Participantes ({parts.length})</b>
          <button onClick={() => exportCsv(parts)} style={{ padding: '.45rem .9rem', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 13 }}>⬇ Exportar CSV</button>
        </div>
        <div style={{ overflowX: 'auto', marginTop: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 640 }}>
            <thead><tr style={{ textAlign: 'left', color: '#9ca3af', fontSize: 12, textTransform: 'uppercase' }}>
              <th style={{ padding: 8 }}>Data</th><th>Cliente</th><th>WhatsApp</th><th>Unidade</th><th>Prêmio</th><th>Cupom</th><th>Status</th>
            </tr></thead>
            <tbody>
              {parts.length === 0 ? <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>Nenhuma participação ainda.</td></tr> :
                parts.map(p => <tr key={p.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                  <td style={{ padding: 8, whiteSpace: 'nowrap' }}>{fmtDT(p.created_at)}</td>
                  <td style={{ fontWeight: 600 }}>{p.nome}</td><td>{p.telefone}</td><td>{p.unidade}</td>
                  <td>{p.ganhou ? p.premio_nome : '—'}</td>
                  <td style={{ fontFamily: 'monospace' }}>{p.cupom || '—'}</td>
                  <td><span style={{ background: (STATUS_COR[p.status] || '#9ca3af') + '22', color: STATUS_COR[p.status] || '#6b7280', padding: '.2rem .6rem', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>{p.status}</span></td>
                </tr>)}
            </tbody>
          </table>
        </div>
      </div>}

      {tab === 'qr' && <div style={{ ...card }}>
        <b style={{ fontSize: 14 }}>QR Codes da campanha — 1 por unidade</b>
        <p style={{ fontSize: 13, color: '#9ca3af', margin: '4px 0 14px' }}>Imprima e coloque nas mesas/balcão de cada loja. Cada QR já identifica a unidade.</p>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          {(camp.unidades && camp.unidades.length ? camp.unidades : ['Amore Paiva', 'Amore CD']).map((u: string) => {
            const link = `${RASP_URL}?loja=${slugLoja(u)}&c=${camp.slug}`
            return <div key={u} style={{ textAlign: 'center', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14 }}>
              <img src={qrImg(link, 190)} alt={u} style={{ width: 170, height: 170, display: 'block', margin: '0 auto' }} />
              <div style={{ fontWeight: 700, marginTop: 8 }}>{u === 'Amore CD' ? 'Amore Costa Dourada' : u}</div>
              <a href={qrImg(link, 700)} download={`QR_Raspadinha_${u}.png`} style={{ fontSize: 12, color: '#8B1212' }}>⬇ Baixar</a>
              <span style={{ margin: '0 6px', color: '#e5e7eb' }}>·</span>
              <a href={link} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#6b7280' }}>Testar</a>
            </div>
          })}
        </div>
      </div>}

      </>}
    </div>
  )
}

function GerenciarTab({ premios, bloq, userName, toast, onDone }: { premios: any[]; bloq: RaspBloqueio | null; userName: string; toast: (m: string, t?: any) => void; onDone: () => void }) {
  const [busy, setBusy] = useState('')
  const [edits, setEdits] = useState<Record<string, { nome: string; descricao: string; programada: string }>>({})
  const reais = premios.filter(p => p.is_premio !== false)

  useEffect(() => {
    const m: Record<string, { nome: string; descricao: string; programada: string }> = {}
    for (const p of premios) {
      if (p.is_premio === false) continue
      const prog = bloq?.prizes?.[p.id]?.programada ?? p.quantidade
      m[p.id] = { nome: p.nome || '', descricao: p.descricao || '', programada: String(prog) }
    }
    setEdits(m)
  }, [premios, bloq])

  const bloqueada = !!bloq?.bloqueada
  const setField = (id: string, f: 'nome' | 'descricao' | 'programada', v: string) =>
    setEdits(e => ({ ...e, [id]: { ...(e[id] || { nome: '', descricao: '', programada: '0' }), [f]: v } }))

  const wrap = async (key: string, fn: () => Promise<void>, ok: string) => {
    setBusy(key)
    try { await fn(); toast(ok); onDone() }
    catch { toast('Não foi possível concluir. Tente novamente.', 'error') }
    setBusy('')
  }
  const toggleBloqueio = () => wrap('bloq', () => setRaspBloqueio(!bloqueada, userName), !bloqueada ? 'Premiações bloqueadas.' : 'Premiações reativadas.')
  const togglePausa = (p: any) => wrap('pz' + p.id, () => pausarPremio(p.id, !(bloq?.prizes?.[p.id]?.pausado), p.nome, userName), !(bloq?.prizes?.[p.id]?.pausado) ? `“${p.nome}” pausado.` : `“${p.nome}” reativado.`)
  const salvar = (p: any) => {
    const e = edits[p.id]; if (!e) return
    const prog = Math.max(0, Math.floor(Number(e.programada) || 0))
    wrap('pz' + p.id, () => editarPremio(p.id, { nome: e.nome.trim(), descricao: e.descricao.trim(), programada: prog }, userName), `“${e.nome.trim()}” salvo.`)
  }

  const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '1.1rem 1.3rem' }
  const inp: React.CSSProperties = { padding: '.5rem .6rem', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, width: '100%' }

  return <>
    {/* Status da campanha */}
    <div style={{ ...card, marginBottom: 14, borderColor: bloqueada ? '#FCA5A5' : '#A6F4C5', background: bloqueada ? '#FEF2F2' : '#F0FDF4' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {bloqueada ? <Lock size={26} style={{ color: '#B42318' }} /> : <ShieldCheck size={26} style={{ color: '#067647' }} />}
          <div>
            <div style={{ fontSize: 12, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.04em' }}>Status da campanha</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: bloqueada ? '#B42318' : '#067647' }}>{bloqueada ? '🔴 Premiações BLOQUEADAS' : '🟢 Premiações ATIVAS'}</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
              {bloqueada
                ? 'Os clientes jogam normalmente, mas todas as raspadinhas mostram “Não foi dessa vez”.'
                : 'As raspadinhas liberam prêmios conforme o estoque programado abaixo.'}
            </div>
          </div>
        </div>
        <button onClick={toggleBloqueio} disabled={busy === 'bloq'}
          style={{ padding: '.7rem 1.2rem', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14, color: '#fff', background: bloqueada ? '#059669' : '#DC2626', opacity: busy === 'bloq' ? .6 : 1 }}>
          {busy === 'bloq' ? 'Aplicando…' : bloqueada ? '▶ Ativar premiações' : '⏸ Bloquear tudo'}
        </button>
      </div>
      {bloq?.em && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 10 }}>Última alteração: {bloq.por || 'Sistema'} · {fmtDT(bloq.em)}</div>}
    </div>

    {/* Editor de prêmios */}
    <div style={{ ...card, marginBottom: 14 }}>
      <b style={{ fontSize: 14 }}>🎁 Prêmios da campanha</b>
      <p style={{ fontSize: 13, color: '#9ca3af', margin: '4px 0 6px' }}>
        Edite o nome, a mensagem e a quantidade programada de cada prêmio. Use <b>Pausar</b> para tirar um prêmio específico do sorteio sem perder a quantidade — ele volta ao ativar.
      </p>
      {bloqueada && <div style={{ fontSize: 12, color: '#B42318', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '.5rem .7rem', marginBottom: 10 }}>⚠️ A campanha está bloqueada no geral — nenhum prêmio é liberado agora, independente das pausas individuais. Ative a campanha acima para o sorteio voltar a valer.</div>}
      <div style={{ overflowX: 'auto', marginTop: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 720 }}>
          <thead><tr style={{ textAlign: 'left', color: '#9ca3af', fontSize: 12, textTransform: 'uppercase' }}>
            <th style={{ padding: 8, minWidth: 150 }}>Prêmio</th><th style={{ minWidth: 220 }}>Mensagem</th><th style={{ width: 110 }}>Qtd. programada</th><th style={{ width: 90 }}>Liberados</th><th style={{ width: 90 }}>Situação</th><th style={{ width: 190 }}>Ações</th>
          </tr></thead>
          <tbody>
            {reais.length === 0 ? <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>Nenhum prêmio cadastrado nesta campanha.</td></tr> :
              reais.map(p => {
                const e = edits[p.id] || { nome: p.nome, descricao: p.descricao || '', programada: String(p.quantidade) }
                const pausado = !!bloq?.prizes?.[p.id]?.pausado
                const off = bloqueada || pausado
                const bz = busy === 'pz' + p.id
                return <tr key={p.id} style={{ borderTop: '1px solid #f3f4f6', opacity: off ? .7 : 1 }}>
                  <td style={{ padding: 8 }}><input value={e.nome} onChange={ev => setField(p.id, 'nome', ev.target.value)} style={inp} /></td>
                  <td style={{ padding: 8 }}><input value={e.descricao} onChange={ev => setField(p.id, 'descricao', ev.target.value)} style={inp} /></td>
                  <td style={{ padding: 8 }}><input type="number" min={0} value={e.programada} onChange={ev => setField(p.id, 'programada', ev.target.value)} style={{ ...inp, width: 90 }} /></td>
                  <td style={{ padding: 8, color: '#6b7280' }}>{p.distribuidos} / {p.resgatados} resg.</td>
                  <td style={{ padding: 8 }}>
                    <span style={{ background: (pausado ? '#F59E0B' : '#10B981') + '22', color: pausado ? '#B45309' : '#067647', padding: '.2rem .55rem', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>{pausado ? 'Pausado' : 'Ativo'}</span>
                  </td>
                  <td style={{ padding: 8 }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button onClick={() => salvar(p)} disabled={bz} title="Salvar alterações"
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '.4rem .7rem', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#8B1212', color: '#fff', fontSize: 13, fontWeight: 600, opacity: bz ? .6 : 1 }}><Save size={14} />Salvar</button>
                      <button onClick={() => togglePausa(p)} disabled={bz} title={pausado ? 'Voltar ao sorteio' : 'Tirar do sorteio'}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '.4rem .7rem', borderRadius: 8, border: '1px solid #e5e7eb', cursor: 'pointer', background: '#fff', color: pausado ? '#067647' : '#B45309', fontSize: 13, fontWeight: 600, opacity: bz ? .6 : 1 }}>
                        {pausado ? <><Play size={14} />Retomar</> : <><Pause size={14} />Pausar</>}
                      </button>
                    </div>
                  </td>
                </tr>
              })}
          </tbody>
        </table>
      </div>
    </div>

    {/* Histórico */}
    <div style={card}>
      <b style={{ fontSize: 14 }}>📋 Histórico de alterações</b>
      {(!bloq?.historico || bloq.historico.length === 0)
        ? <p style={{ fontSize: 13, color: '#9ca3af', margin: '8px 0 0' }}>Nenhuma alteração registrada ainda.</p>
        : <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[...bloq.historico].reverse().slice(0, 30).map((h, i) => (
              <div key={i} style={{ fontSize: 13, display: 'flex', gap: 8, borderTop: i ? '1px solid #f3f4f6' : 'none', paddingTop: i ? 6 : 0 }}>
                <span style={{ color: '#9ca3af', whiteSpace: 'nowrap' }}>{fmtDT(h.em)}</span>
                <span><b>{h.por}</b> {h.acao}</span>
              </div>
            ))}
          </div>}
    </div>
  </>
}

function ValidarTab({ validador, toast, onDone }: { validador: string; toast: (m: string, t?: any) => void; onDone: () => void }) {
  const [codigo, setCodigo] = useState('')
  const [res, setRes] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const validar = async () => {
    const cod = codigo.trim(); if (!cod) return
    setBusy(true); setRes(null)
    try {
      const { data, error } = await sb.rpc('rasp_resgatar', { p_cupom: cod, p_validador: validador })
      if (error) { setRes({ erro: 'falha' }) }
      else { setRes(data); if (data.ok) { toast('Cupom resgatado! ✅'); onDone() } }
    } catch { setRes({ erro: 'falha' }) }
    setBusy(false)
  }
  const ERRMSG: Record<string, string> = { cupom_inexistente: 'Cupom não encontrado.', ja_resgatado: 'Este cupom JÁ foi resgatado.', expirado: 'Cupom expirado.', cupom_cancelado: 'Cupom cancelado.', cupom_bloqueado: 'Cupom bloqueado.', falha: 'Erro ao validar. Tente novamente.' }
  return <div style={{ maxWidth: 460, margin: '0 auto' }}>
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '1.6rem', textAlign: 'center' }}>
      <Ticket size={34} style={{ color: '#8B1212' }} />
      <h3 style={{ color: '#8B1212', margin: '.5rem 0 .2rem' }}>Validar cupom</h3>
      <p style={{ fontSize: 13, color: '#9ca3af', marginBottom: 16 }}>Digite o código apresentado pelo cliente.</p>
      <input value={codigo} onChange={e => setCodigo(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && validar()} placeholder="AMR-XXX-XXXX"
        style={{ width: '100%', padding: '.9rem 1rem', border: '2px solid #e5e7eb', borderRadius: 12, fontSize: 20, fontWeight: 700, textAlign: 'center', letterSpacing: '.05em', fontFamily: 'monospace' }} />
      <button onClick={validar} disabled={busy} style={{ width: '100%', marginTop: 12, padding: '1rem', border: 'none', borderRadius: 12, background: '#8B1212', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>{busy ? 'Verificando…' : 'Validar e utilizar'}</button>
      {res && <div style={{ marginTop: 18, padding: '1.1rem', borderRadius: 12, background: res.ok ? '#ECFDF3' : '#FEF2F2', border: `1px solid ${res.ok ? '#A6F4C5' : '#FCA5A5'}` }}>
        {res.ok ? <>
          <CheckCircle2 size={40} style={{ color: '#10B981' }} />
          <div style={{ fontSize: 18, fontWeight: 800, color: '#067647', marginTop: 6 }}>Resgate confirmado!</div>
          <div style={{ fontSize: 15, marginTop: 4 }}><b>{res.premio}</b></div>
          <div style={{ fontSize: 13, color: '#6b7280' }}>Cliente: {res.nome} · {res.unidade}</div>
        </> : <>
          <XCircle size={40} style={{ color: '#EF4444' }} />
          <div style={{ fontSize: 16, fontWeight: 700, color: '#B42318', marginTop: 6 }}>{ERRMSG[res.erro] || 'Não foi possível resgatar.'}</div>
          {res.resgatado_em && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Resgatado em {fmtDT(res.resgatado_em)} por {res.validado_por}</div>}
        </>}
      </div>}
    </div>
  </div>
}

function exportCsv(parts: any[]) {
  const head = ['Data', 'Nome', 'WhatsApp', 'Unidade', 'Premio', 'Cupom', 'Status', 'Validade']
  const linhas = parts.map(p => [fmtDT(p.created_at), p.nome, p.telefone, p.unidade, p.ganhou ? p.premio_nome : '', p.cupom || '', p.status, fmtD(p.validade)].map(x => `"${(x || '').toString().replace(/"/g, '""')}"`).join(','))
  const csv = [head.join(','), ...linhas].join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'raspadinha_participantes.csv'; a.click()
}
