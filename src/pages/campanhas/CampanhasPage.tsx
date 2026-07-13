import { useState, useEffect, useMemo, useCallback } from 'react'
import { Megaphone, Plus, RefreshCw, Send, Pause, Play, X, Users, Eye, Trash2, Cake, Gift } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../hooks/useToast'

const sb = supabase as any

const TIPOS = [
  { key: 'promocao', label: 'Promoção' }, { key: 'brinde', label: 'Brinde' },
  { key: 'raspadinha', label: 'Raspadinha' }, { key: 'cupom', label: 'Cupom de desconto' },
  { key: 'aniversario', label: 'Aniversário' }, { key: 'reativacao', label: 'Reativação' },
  { key: 'evento', label: 'Convite p/ evento' }, { key: 'novidade', label: 'Novo prato' },
  { key: 'pesquisa', label: 'Pesquisa' }, { key: 'recuperacao', label: 'Recuperar insatisfeito' },
]
const LOJAS = [{ key: '', label: 'Todas as lojas' }, { key: 'Amore Paiva', label: 'Amore Paiva' }, { key: 'Amore CD', label: 'Amore Costa Dourada' }]
const SEGS = [
  { key: 'todos', label: 'Todos os clientes' },
  { key: 'aniv_hoje', label: '🎂 Aniversariantes de hoje' }, { key: 'aniv_semana', label: '🎂 Aniversariantes da semana' }, { key: 'aniv_mes', label: '🎂 Aniversariantes do mês' },
  { key: 'cinco_estrelas', label: '⭐ Avaliaram 5 estrelas' }, { key: 'nota_baixa', label: '⚠️ Nota baixa' },
  { key: 'ganhou_nao_resgatou', label: '🎁 Ganhou e não resgatou' },
  { key: 'sem_30', label: '⏳ Sem visita 30+ dias' }, { key: 'sem_60', label: '⏳ Sem visita 60+ dias' }, { key: 'sem_90', label: '⏳ Sem visita 90+ dias' },
  { key: 'frequentes', label: '🔁 Frequentes (3+)' },
]
const diasDe = (iso: string) => iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 864e5) : null
function matchSeg(c: any, seg: string): boolean {
  const h = new Date(), dia = h.getDate(), mes = h.getMonth() + 1
  switch (seg) {
    case 'aniv_hoje': return c.birthday_day === dia && c.birthday_month === mes
    case 'aniv_semana': { if (!c.birthday_day || !c.birthday_month) return false; for (let i = 0; i < 7; i++) { const d = new Date(); d.setDate(d.getDate() + i); if (c.birthday_day === d.getDate() && c.birthday_month === d.getMonth() + 1) return true } return false }
    case 'aniv_mes': return c.birthday_month === mes
    case 'cinco_estrelas': return Number(c.nota_media) >= 4.5
    case 'nota_baixa': return Number(c.nota_media) > 0 && Number(c.nota_media) <= 3
    case 'ganhou_nao_resgatou': return (c.premios_recebidos || 0) > (c.premios_resgatados || 0)
    case 'sem_30': return (diasDe(c.last_seen_at) ?? 0) >= 30
    case 'sem_60': return (diasDe(c.last_seen_at) ?? 0) >= 60
    case 'sem_90': return (diasDe(c.last_seen_at) ?? 0) >= 90
    case 'frequentes': return (c.avaliacoes_count || 0) >= 3
    default: return true
  }
}
const firstName = (n: string) => (n || 'cliente').trim().split(' ')[0]
const render = (msg: string, c: any, link: string) => (msg || '').replace(/\{nome\}/gi, firstName(c.name)).replace(/\{loja\}/gi, c.origin_store || 'Amore').replace(/\{link\}/gi, link || '')
const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '1rem 1.2rem' }
const STATUS_COR: Record<string, string> = { rascunho: '#9ca3af', enviando: '#2563EB', pausada: '#D97706', concluida: '#1D9E75' }

export default function CampanhasPage() {
  const { toast } = useToast()
  const [campanhas, setCampanhas] = useState<any[]>([])
  const [clientes, setClientes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editar, setEditar] = useState<any | null>(null)
  const [ver, setVer] = useState<any | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [ca, cl] = await Promise.all([
        sb.from('campaigns').select('*').order('created_at', { ascending: false }),
        sb.from('customers').select('id,name,phone,origin_store,birthday_day,birthday_month,nota_media,premios_recebidos,premios_resgatados,last_seen_at,avaliacoes_count,consent_whatsapp,consent_birthday,status').limit(5000),
      ])
      setCampanhas(ca.data || []); setClientes(cl.data || [])
    } catch { toast('Erro ao carregar (verifique se está logado).', 'error') }
    setLoading(false)
  }, [toast])
  useEffect(() => { load() }, [load])

  const audiencia = useCallback((camp: any) => {
    return clientes.filter(c => {
      if (camp.loja && c.origin_store !== camp.loja) return false
      if (!matchSeg(c, camp.segment_key || 'todos')) return false
      if (!c.consent_whatsapp || c.status === 'opt_out') return false          // trava LGPD marketing
      if (camp.campaign_type === 'aniversario' && !c.consent_birthday) return false
      return true
    })
  }, [clientes])

  const novo = () => setEditar({ name: '', campaign_type: 'promocao', loja: '', segment_key: 'todos', message: 'Olá {nome}! 💚 ', image_url: '', link: '', brinde: '', max_envios: '', status: 'rascunho' })

  const salvar = async (camp: any) => {
    const seg = SEGS.find(s => s.key === camp.segment_key)
    const row = { ...camp, segment_label: seg?.label, max_envios: camp.max_envios ? Number(camp.max_envios) : null, updated_at: new Date().toISOString() }
    const { data, error } = camp.id
      ? await sb.from('campaigns').update(row).eq('id', camp.id).select().maybeSingle()
      : await sb.from('campaigns').insert(row).select().maybeSingle()
    if (error) { toast('Erro ao salvar campanha.', 'error'); return null }
    toast('Campanha salva!'); load(); return data
  }

  const dispararAgora = async (camp: any) => {
    let saved = camp
    if (!camp.id) { saved = await salvar(camp); if (!saved) return } else { await salvar(camp) }
    let aud = audiencia(saved)
    if (saved.max_envios) aud = aud.slice(0, Number(saved.max_envios))
    if (aud.length === 0) { toast('Nenhum cliente elegível neste segmento (com consentimento).', 'error'); return }
    if (!confirm(`Gerar e enviar para ${aud.length} cliente(s)? O envio ocorre pelo worker do WhatsApp.`)) return
    // limpa envios anteriores pendentes desta campanha
    await sb.from('campaign_deliveries').delete().eq('campaign_id', saved.id).eq('status', 'pending')
    const rows = aud.map(c => ({ campaign_id: saved.id, customer_id: c.id, phone: c.phone, name: c.name, channel: 'whatsapp', status: 'pending', message: render(saved.message, c, saved.link) }))
    for (let i = 0; i < rows.length; i += 500) { await sb.from('campaign_deliveries').insert(rows.slice(i, i + 500)) }
    await sb.from('campaigns').update({ status: 'enviando', selected_count: aud.length, updated_at: new Date().toISOString() }).eq('id', saved.id)
    toast(`${aud.length} envio(s) na fila. O worker vai despachar. 🚀`); setEditar(null); load()
  }

  const setStatus = async (id: string, status: string) => { await sb.from('campaigns').update({ status }).eq('id', id); load() }
  const excluir = async (id: string) => { if (!confirm('Excluir campanha e seus envios?')) return; await sb.from('campaigns').delete().eq('id', id); load() }

  const kpi = useMemo(() => ({
    total: campanhas.length,
    enviando: campanhas.filter(c => c.status === 'enviando').length,
    enviados: campanhas.reduce((a, c) => a + (c.sent_count || 0), 0),
    base: clientes.filter(c => c.consent_whatsapp && c.status !== 'opt_out').length,
  }), [campanhas, clientes])

  return (
    <div style={{ padding: '1rem 0' }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        {[['Campanhas', kpi.total, ''], ['Enviando', kpi.enviando, 'ativas'], ['Mensagens enviadas', kpi.enviados, 'total'], ['Base com marketing', kpi.base, 'clientes']].map(([l, v, s]: any) =>
          <div key={l} style={{ ...card, flex: 1, minWidth: 150 }}><div style={{ fontSize: 12, color: '#9ca3af', textTransform: 'uppercase' }}>{l}</div><div style={{ fontSize: 26, fontWeight: 700, color: '#6B1212' }}>{v}</div><div style={{ fontSize: 12, color: '#9ca3af' }}>{s}</div></div>)}
      </div>

      <AniversarioCard clientes={clientes} toast={toast} />

      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <button onClick={novo} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '.6rem 1rem', borderRadius: 10, border: 'none', background: '#6B1212', color: '#fff', cursor: 'pointer', fontWeight: 600 }}><Plus size={16} />Nova campanha</button>
        <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '.6rem .9rem', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer' }}><RefreshCw size={15} />Atualizar</button>
      </div>

      {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Carregando…</div> :
        campanhas.length === 0 ? <div style={{ ...card, textAlign: 'center', color: '#9ca3af', padding: 40 }}><Megaphone size={28} style={{ opacity: .4 }} /><div style={{ marginTop: 8 }}>Nenhuma campanha ainda. Crie a primeira! 🚀</div></div> :
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {campanhas.map(c => {
              const aud = audiencia(c).length
              return <div key={c.id} style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{c.name}</div>
                    <div style={{ fontSize: 12, color: '#9ca3af' }}>{TIPOS.find(t => t.key === c.campaign_type)?.label} · {c.loja || 'Todas'} · {c.segment_label || c.segment_key}</div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: STATUS_COR[c.status] || '#9ca3af', padding: '2px 8px', borderRadius: 20 }}>{c.status}</span>
                </div>
                <div style={{ fontSize: 13, color: '#6b7280', margin: '8px 0', minHeight: 34, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{c.message}</div>
                <div style={{ display: 'flex', gap: 12, fontSize: 12.5, color: '#374151', marginBottom: 10 }}>
                  <span title="público elegível agora"><Users size={12} style={{ verticalAlign: -2 }} /> {aud} elegíveis</span>
                  <span>· {c.selected_count || 0} na fila</span>
                  <span style={{ color: '#1D9E75' }}>· {c.sent_count || 0} enviadas</span>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button onClick={() => setVer(c)} style={btnMini('#6B1212')}><Eye size={13} />Ver</button>
                  <button onClick={() => setEditar(c)} style={btnMini('#6b7280', true)}>Editar</button>
                  {c.status === 'rascunho' && <button onClick={() => dispararAgora(c)} style={btnMini('#1D9E75')}><Send size={13} />Enviar</button>}
                  {c.status === 'enviando' && <button onClick={() => setStatus(c.id, 'pausada')} style={btnMini('#D97706')}><Pause size={13} />Pausar</button>}
                  {c.status === 'pausada' && <button onClick={() => setStatus(c.id, 'enviando')} style={btnMini('#1D9E75')}><Play size={13} />Retomar</button>}
                  <button onClick={() => excluir(c.id)} style={btnMini('#EF4444', true)}><Trash2 size={13} /></button>
                </div>
              </div>
            })}
          </div>}

      {editar && <CampanhaModal camp={editar} setCamp={setEditar} onSave={salvar} onDisparar={dispararAgora} audiencia={audiencia} />}
      {ver && <MetricasModal camp={ver} onClose={() => setVer(null)} />}
    </div>
  )
}
const btnMini = (cor: string, ghost = false): React.CSSProperties => ({ display: 'flex', alignItems: 'center', gap: 4, padding: '.4rem .7rem', borderRadius: 8, border: ghost ? '1px solid #e5e7eb' : 'none', background: ghost ? '#fff' : cor, color: ghost ? cor : '#fff', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 })

function AniversarioCard({ clientes, toast }: { clientes: any[]; toast: (m: string, t?: any) => void }) {
  const [camp, setCamp] = useState<any | null>(null)
  const [premio, setPremio] = useState<any | null>(null)
  const [busy, setBusy] = useState(false)

  const carregar = useCallback(async () => {
    const { data: c } = await sb.from('rasp_campanhas').select('*').eq('slug', 'aniversario').maybeSingle()
    setCamp(c || null)
    if (c) { const { data: p } = await sb.from('rasp_premios').select('nome,descricao').eq('campanha_id', c.id).eq('is_premio', true).limit(1); setPremio(p?.[0] || null) }
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const h = new Date(), dia = h.getDate(), mes = h.getMonth() + 1
  const elig = clientes.filter(c => c.consent_birthday && c.status !== 'opt_out')
  const hoje = elig.filter(c => c.birthday_day === dia && c.birthday_month === mes).length
  const noMes = elig.filter(c => c.birthday_month === mes).length
  const ativo = camp?.status === 'ativa'

  const toggle = async () => { if (!camp) return; await sb.from('rasp_campanhas').update({ status: ativo ? 'pausada' : 'ativa' }).eq('id', camp.id); carregar(); toast(ativo ? 'Aniversário automático pausado.' : 'Aniversário automático ligado! 🎂') }
  const gerarAgora = async () => {
    setBusy(true)
    try { const { data } = await sb.rpc('av_aniversario_gerar'); toast(`${data || 0} presente(s) de aniversário gerado(s). O WhatsApp sai pelo worker. 🎉`) }
    catch { toast('Erro ao gerar.', 'error') }
    setBusy(false)
  }

  const wrap: React.CSSProperties = { background: 'linear-gradient(135deg,#fdf2f8,#fff)', border: '1px solid #F4C0D1', borderRadius: 14, padding: '1rem 1.2rem', marginBottom: 14 }
  return (
    <div style={wrap}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: '#D4537E18', color: '#D4537E', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Cake size={22} /></div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>🎂 Aniversário automático {ativo ? <span style={{ fontSize: 11, color: '#1D9E75', fontWeight: 700 }}>· LIGADO</span> : <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 700 }}>· pausado</span>}</div>
          <div style={{ fontSize: 12.5, color: '#6b7280' }}>Todo dia às 9h envia <b>{premio?.nome || 'um presente'}</b> pra quem faz aniversário (e autorizou). <b>{hoje}</b> hoje · <b>{noMes}</b> neste mês.</div>
        </div>
        <button onClick={toggle} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '.5rem .9rem', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: ativo ? '#FEF2F2' : '#1D9E75', color: ativo ? '#B91C1C' : '#fff' }}>
          {ativo ? <><Pause size={14} />Pausar</> : <><Play size={14} />Ligar</>}
        </button>
        <button onClick={gerarAgora} disabled={busy || !ativo || hoje === 0} title={hoje === 0 ? 'Ninguém faz aniversário hoje' : ''} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '.5rem .9rem', borderRadius: 10, border: '1px solid #D4537E', background: '#fff', color: '#D4537E', cursor: busy || hoje === 0 ? 'default' : 'pointer', fontWeight: 600, fontSize: 13, opacity: (!ativo || hoje === 0) ? .5 : 1 }}>
          <Gift size={14} />{busy ? 'Gerando…' : `Gerar hoje (${hoje})`}
        </button>
      </div>
    </div>
  )
}

function CampanhaModal({ camp, setCamp, onSave, onDisparar, audiencia }: any) {
  const [c, setC] = useState<any>(camp)
  const up = (k: string, v: any) => setC((p: any) => ({ ...p, [k]: v }))
  const aud = audiencia(c)
  const inp: React.CSSProperties = { width: '100%', padding: '.6rem .8rem', borderRadius: 10, border: '1px solid #e5e7eb', fontFamily: 'inherit', fontSize: 14 }
  const lbl: React.CSSProperties = { fontSize: 12, color: '#6b7280', display: 'block', margin: '10px 0 4px' }
  return (
    <div onClick={() => setCamp(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 60, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '3vh 1rem', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(560px,100%)', background: '#fff', borderRadius: 16, padding: '1.4rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <b style={{ fontSize: 17 }}>{c.id ? 'Editar campanha' : 'Nova campanha'}</b>
          <button onClick={() => setCamp(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={22} /></button>
        </div>
        <label style={lbl}>Nome da campanha</label>
        <input style={inp} value={c.name} onChange={e => up('name', e.target.value)} placeholder="Ex.: Volta às aulas, Reativação inativos..." />
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}><label style={lbl}>Tipo</label><select style={inp} value={c.campaign_type} onChange={e => up('campaign_type', e.target.value)}>{TIPOS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}</select></div>
          <div style={{ flex: 1 }}><label style={lbl}>Loja</label><select style={inp} value={c.loja} onChange={e => up('loja', e.target.value)}>{LOJAS.map(l => <option key={l.key} value={l.key}>{l.label}</option>)}</select></div>
        </div>
        <label style={lbl}>Segmento (público-alvo)</label>
        <select style={inp} value={c.segment_key} onChange={e => up('segment_key', e.target.value)}>{SEGS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
        <label style={lbl}>Mensagem <span style={{ color: '#9ca3af' }}>— use {'{nome}'} {'{loja}'} {'{link}'}</span></label>
        <textarea style={{ ...inp, minHeight: 90, resize: 'vertical' }} value={c.message} onChange={e => up('message', e.target.value)} placeholder="Olá {nome}! Preparamos algo especial pra você na {loja}..." />
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 2 }}><label style={lbl}>Link (opcional)</label><input style={inp} value={c.link} onChange={e => up('link', e.target.value)} placeholder="https://..." /></div>
          <div style={{ flex: 1 }}><label style={lbl}>Máx. envios</label><input style={inp} type="number" value={c.max_envios} onChange={e => up('max_envios', e.target.value)} placeholder="todos" /></div>
        </div>
        <div style={{ background: '#f9fafb', borderRadius: 10, padding: '.7rem .9rem', margin: '14px 0', fontSize: 13 }}>
          <b style={{ color: '#6B1212' }}>{aud.length}</b> cliente(s) elegíveis (com consentimento de marketing){c.campaign_type === 'aniversario' ? ' e aniversário' : ''}.
          {aud[0] && <div style={{ color: '#6b7280', marginTop: 6, fontStyle: 'italic' }}>Prévia: “{render(c.message, aud[0], c.link)}”</div>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={async () => { const s = await onSave(c); if (s) setCamp(null) }} style={{ flex: 1, padding: '.7rem', borderRadius: 10, border: '1px solid #6B1212', background: '#fff', color: '#6B1212', cursor: 'pointer', fontWeight: 600 }}>Salvar rascunho</button>
          <button onClick={() => onDisparar(c)} style={{ flex: 1, padding: '.7rem', borderRadius: 10, border: 'none', background: '#1D9E75', color: '#fff', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Send size={16} />Gerar e enviar</button>
        </div>
      </div>
    </div>
  )
}

function MetricasModal({ camp, onClose }: { camp: any; onClose: () => void }) {
  const [d, setD] = useState<any[] | null>(null)
  useEffect(() => { (async () => { const { data } = await sb.from('campaign_deliveries').select('status,name,phone,sent_at,error_message').eq('campaign_id', camp.id).limit(3000); setD(data || []) })() }, [camp.id])
  const cont = useMemo(() => { const m: Record<string, number> = {}; (d || []).forEach(x => m[x.status] = (m[x.status] || 0) + 1); return m }, [d])
  const box: React.CSSProperties = { background: '#f9fafb', borderRadius: 10, padding: '.8rem', textAlign: 'center', flex: 1 }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 60, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '4vh 1rem', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(520px,100%)', background: '#fff', borderRadius: 16, padding: '1.4rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div><b style={{ fontSize: 16 }}>{camp.name}</b><div style={{ fontSize: 12, color: '#9ca3af' }}>{camp.status} · {camp.segment_label}</div></div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={22} /></button>
        </div>
        {d === null ? <div style={{ color: '#9ca3af', padding: 20, textAlign: 'center' }}>Carregando…</div> : <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <div style={box}><div style={{ fontSize: 22, fontWeight: 700, color: '#6B1212' }}>{camp.selected_count || d.length}</div><div style={{ fontSize: 12, color: '#9ca3af' }}>selecionados</div></div>
            <div style={box}><div style={{ fontSize: 22, fontWeight: 700, color: '#1D9E75' }}>{cont.sent || 0}</div><div style={{ fontSize: 12, color: '#9ca3af' }}>enviados</div></div>
            <div style={box}><div style={{ fontSize: 22, fontWeight: 700, color: '#D97706' }}>{cont.pending || 0}</div><div style={{ fontSize: 12, color: '#9ca3af' }}>na fila</div></div>
            <div style={box}><div style={{ fontSize: 22, fontWeight: 700, color: '#EF4444' }}>{cont.failed || 0}</div><div style={{ fontSize: 12, color: '#9ca3af' }}>falhas</div></div>
          </div>
          <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {(d || []).slice(0, 300).map((x, i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '.4rem .6rem', background: '#f9fafb', borderRadius: 8 }}>
              <span>{x.name || x.phone}</span>
              <span style={{ color: x.status === 'sent' ? '#1D9E75' : x.status === 'failed' ? '#EF4444' : '#9ca3af' }}>{x.status}{x.error_message ? ' · ' + x.error_message : ''}</span>
            </div>)}
          </div>
        </>}
      </div>
    </div>
  )
}
