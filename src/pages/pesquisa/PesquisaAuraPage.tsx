import { useState, useEffect, useMemo, useCallback } from 'react'
import { RefreshCw, Download, QrCode, MessageCircle, Users, Sparkles, Music, CalendarClock, Trophy, Send } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../hooks/useToast'
import { siteOrigin } from '../../lib/site'

const sb = supabase as any
const SURVEY = `${siteOrigin()}/vamos-farmar-aura.html`
const qrImg = (data: string, size = 240) => `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=8&data=${encodeURIComponent(data)}`
const C = { bg: '#160404', cream: '#F4EEE4', orange: '#F5821F', pink: '#FF4FA3', maroon: '#4a0f0f' }

type Resp = {
  chave: string
  loja?: string; participaria?: string; musica?: string[]; brincadeiras?: string[]
  horario?: string; dia?: string; musica_hino?: string; indicacao?: string
  galera_tam?: string; motivadores?: string[]; quer_convite?: boolean
  nome?: string; whatsapp?: string; instagram?: string
  aura?: number; aura_faixa?: string; interesse?: string; created_at?: string
}
const P_LABEL: Record<string, string> = { com_certeza: '🔥 Com certeza', galera: '👀 Só com a galera', talvez: '😎 Talvez', nao: '❌ Não iria' }

export default function PesquisaAuraPage() {
  const { toast } = useToast()
  const [rows, setRows] = useState<Resp[]>([])
  const [loading, setLoading] = useState(true)
  const [loja, setLoja] = useState('')
  const [filtroInt, setFiltroInt] = useState('')
  const [tab, setTab] = useState<'evento' | 'leads' | 'campanha' | 'qr'>('evento')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await sb.from('app_config').select('chave,valor').like('chave', 'pesquisa_vfa_%').limit(10000)
      const list: Resp[] = (data || []).map((r: any) => ({ chave: r.chave, ...(r.valor || {}) }))
      list.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
      setRows(list)
    } catch { toast('Erro ao carregar respostas.', 'error') }
    setLoading(false)
  }, [toast])
  useEffect(() => { load() }, [load])

  const fil = useMemo(() => rows.filter(r => (!loja || r.loja === loja) && (!filtroInt || r.interesse === filtroInt)), [rows, loja, filtroInt])
  const lojasPresentes = useMemo(() => Array.from(new Set(rows.map(r => r.loja).filter(Boolean))) as string[], [rows])

  const rank = (getter: (r: Resp) => string[] | undefined) => {
    const m: Record<string, number> = {}
    fil.forEach(r => (getter(r) || []).forEach(v => { if (v) m[v] = (m[v] || 0) + 1 }))
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }
  const rankOne = (getter: (r: Resp) => string | undefined) => rank(r => { const v = getter(r); return v ? [v] : [] })

  const stats = useMemo(() => {
    const leads = fil.filter(r => (r.whatsapp || '').length >= 10)
    const auraVals = fil.map(r => Number(r.aura) || 0)
    const auraMed = auraVals.length ? Math.round(auraVals.reduce((a, b) => a + b, 0) / auraVals.length) : 0
    const alto = fil.filter(r => r.interesse === 'Alto').length
    return {
      total: fil.length, leads: leads.length, auraMed, alto,
      musica: rank(r => r.musica), brincadeiras: rank(r => r.brincadeiras), motivadores: rank(r => r.motivadores),
      dia: rankOne(r => r.dia), horario: rankOne(r => r.horario), galera: rankOne(r => r.galera_tam),
      participaria: rankOne(r => r.participaria),
      hinos: fil.map(r => r.musica_hino).filter(Boolean) as string[],
      indicacoes: fil.map(r => r.indicacao).filter(Boolean) as string[],
    }
  }, [fil])

  const leads = useMemo(() => fil.filter(r => (r.whatsapp || '').length >= 10)
    .sort((a, b) => (Number(b.aura) || 0) - (Number(a.aura) || 0)), [fil])

  const top = (arr: [string, number][]) => arr[0]?.[0] || '—'
  const promo = useMemo(() => {
    const dia = top(stats.dia), hora = top(stats.horario), mus = stats.musica.slice(0, 2).map(m => m[0]).join(' e ') || 'a sua vibe'
    return `🔥 *VAMOS FARMAR AURA* — Amore Paiva ✨\n\nO happy hour que tem a SUA vibe chegou! ${dia !== '—' ? `📅 *${dia}*` : ''}${hora !== '—' ? ` · 🕗 ${hora}` : ''}\n🎧 Som de ${mus} · 🍹 Mocktails sem álcool · 🎮 Brincadeiras · 🎁 Prêmios\n\nChama a galera e vem farmar essa aura com a gente!\n📍 Amore Paiva · Acompanhe @amorepaiva`
  }, [stats])

  const csv = () => {
    const head = ['nome', 'whatsapp', 'instagram', 'loja', 'aura', 'faixa', 'interesse', 'participaria', 'dia', 'horario', 'galera', 'musica', 'brincadeiras', 'motivadores', 'musica_hino', 'indicacao', 'quer_convite', 'data']
    const esc = (v: any) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`
    const lines = fil.map(r => [r.nome, r.whatsapp, r.instagram, r.loja, r.aura, r.aura_faixa, r.interesse, P_LABEL[r.participaria || ''] || r.participaria, r.dia, r.horario, r.galera_tam, (r.musica || []).join('; '), (r.brincadeiras || []).join('; '), (r.motivadores || []).join('; '), r.musica_hino, r.indicacao, r.quer_convite ? 'sim' : 'não', r.created_at ? new Date(r.created_at).toLocaleString('pt-BR') : ''].map(esc).join(','))
    const blob = new Blob(['﻿' + [head.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `vamos-farmar-aura-${new Date().toISOString().slice(0, 10)}.csv`; a.click()
  }

  const waLink = (fone: string, msg: string) => `https://wa.me/${(fone || '').length <= 11 ? '55' + fone : fone}?text=${encodeURIComponent(msg)}`
  const copiar = (t: string) => { navigator.clipboard?.writeText(t); toast('Copiado!') }

  const card: React.CSSProperties = { background: 'var(--card-bg,#fff)', border: '1px solid var(--border,#e5e7eb)', borderRadius: 14, padding: '1rem 1.2rem' }
  const kpi = (label: string, value: React.ReactNode, sub?: string, color = C.orange) => (
    <div style={{ ...card, flex: 1, minWidth: 140 }}>
      <div style={{ fontSize: 12, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1.1, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{sub}</div>}
    </div>
  )
  const barList = (title: string, icon: React.ReactNode, data: [string, number][], color = C.orange) => {
    const max = data[0]?.[1] || 1
    return <div style={{ ...card, flex: 1, minWidth: 260 }}>
      <b style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>{icon}{title}</b>
      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {data.length === 0 ? <span style={{ fontSize: 13, color: '#9ca3af' }}>Sem respostas ainda.</span> :
          data.map(([k, n]) => <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 150, fontSize: 13 }}>{k}</span>
            <div style={{ flex: 1, height: 12, background: '#f3f4f6', borderRadius: 6, overflow: 'hidden' }}><div style={{ width: (n / max) * 100 + '%', height: '100%', background: color }} /></div>
            <span style={{ width: 30, textAlign: 'right', fontSize: 13, color: '#6b7280' }}>{n}</span>
          </div>)}
      </div>
    </div>
  }
  const tabBtn = (id: typeof tab, icon: React.ReactNode, label: string) => (
    <button onClick={() => setTab(id)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '.6rem 1rem', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600, background: tab === id ? C.maroon : 'transparent', color: tab === id ? '#fff' : '#6b7280' }}>{icon}{label}</button>
  )

  return (
    <div style={{ padding: '1rem 0' }}>
      {/* banner identidade do card */}
      <div style={{ borderRadius: 18, padding: '20px 22px', marginBottom: 16, color: C.cream, background: `radial-gradient(120% 120% at 20% 20%, ${C.maroon} 0%, #2a0808 55%, ${C.bg} 100%)`, border: '1px solid #3a0d0d' }}>
        <div style={{ fontFamily: 'Anton, system-ui, sans-serif', fontSize: 34, lineHeight: .95, letterSpacing: .5 }}>
          <span style={{ color: C.cream }}>VAMOS </span><span style={{ color: C.orange }}>FARMAR </span>
          <span style={{ background: `linear-gradient(92deg,${C.pink},${C.orange})`, WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>AURA</span>
        </div>
        <div style={{ fontSize: 13, opacity: .9, marginTop: 6 }}>Pesquisa Gen Z · Amore Paiva — o happy hour que tem a sua vibe ✨</div>
      </div>

      {/* filtros */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <select value={loja} onChange={e => setLoja(e.target.value)} style={{ padding: '.55rem .8rem', borderRadius: 10, border: '1px solid #e5e7eb' }}>
          <option value="">Todas as lojas</option>
          {lojasPresentes.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <select value={filtroInt} onChange={e => setFiltroInt(e.target.value)} style={{ padding: '.55rem .8rem', borderRadius: 10, border: '1px solid #e5e7eb' }}>
          <option value="">Todo interesse</option><option value="Alto">🔥 Alto</option><option value="Médio">✨ Médio</option><option value="Baixo">👀 Baixo</option>
        </select>
        <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '.55rem .9rem', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer' }}><RefreshCw size={15} />Atualizar</button>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        {kpi('Respostas', stats.total, `${stats.leads} com contato`)}
        {kpi('Leads p/ convite', stats.leads, 'deixaram WhatsApp', C.pink)}
        {kpi('Aura média', stats.auraMed, 'de 100', C.orange)}
        {kpi('Alto interesse', stats.alto, `${stats.total ? Math.round((stats.alto / stats.total) * 100) : 0}% do total`, '#10B981')}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16, background: '#f9fafb', padding: 6, borderRadius: 12, width: 'fit-content' }}>
        {tabBtn('evento', <CalendarClock size={16} />, 'Estrutura do evento')}
        {tabBtn('leads', <Users size={16} />, `Leads (${leads.length})`)}
        {tabBtn('campanha', <Send size={16} />, 'Campanha de divulgação')}
        {tabBtn('qr', <QrCode size={16} />, 'QR da pesquisa')}
      </div>

      {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Carregando…</div> : <>

        {tab === 'evento' && <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            {barList('Vibe musical', <Music size={16} />, stats.musica, C.pink)}
            {barList('Melhor dia', <CalendarClock size={16} />, stats.dia, C.orange)}
            {barList('Melhor horário', <CalendarClock size={16} />, stats.horario, C.orange)}
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            {barList('Brincadeiras', <Trophy size={16} />, stats.brincadeiras, C.pink)}
            {barList('O que atrai', <Sparkles size={16} />, stats.motivadores, C.orange)}
            {barList('Tamanho da galera', <Users size={16} />, stats.galera, C.maroon)}
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ ...card, flex: 1, minWidth: 260 }}>
              <b style={{ fontSize: 14 }}>🎵 Músicas que não podem faltar ({stats.hinos.length})</b>
              <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                {stats.hinos.length === 0 ? <span style={{ fontSize: 13, color: '#9ca3af' }}>Nenhuma sugerida ainda.</span> :
                  stats.hinos.map((m, i) => <span key={i} style={{ fontSize: 12.5, background: '#fdf2f8', color: '#9d174d', padding: '4px 10px', borderRadius: 999 }}>{m}</span>)}
              </div>
            </div>
            <div style={{ ...card, flex: 1, minWidth: 260 }}>
              <b style={{ fontSize: 14 }}>🎤 Indicações p/ banca/produção ({stats.indicacoes.length})</b>
              <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                {stats.indicacoes.length === 0 ? <span style={{ fontSize: 13, color: '#9ca3af' }}>Nenhuma indicação ainda.</span> :
                  stats.indicacoes.map((m, i) => <span key={i} style={{ fontSize: 12.5, background: '#fff7ed', color: '#9a3412', padding: '4px 10px', borderRadius: 999 }}>{m}</span>)}
              </div>
            </div>
          </div>
          <div style={{ ...card, marginTop: 12, borderLeft: `3px solid ${C.orange}` }}>
            <b style={{ fontSize: 14 }}>📋 Resumo para montar o evento</b>
            <div style={{ fontSize: 13.5, color: '#374151', marginTop: 8, lineHeight: 1.7 }}>
              Melhor dia: <b>{top(stats.dia)}</b> · Horário: <b>{top(stats.horario)}</b> · Vibe: <b>{stats.musica.slice(0, 2).map(m => m[0]).join(' / ') || '—'}</b> ·
              Brincadeira nº1: <b>{top(stats.brincadeiras)}</b> · Atrai mais: <b>{top(stats.motivadores)}</b> · Galera típica: <b>{top(stats.galera)}</b>
            </div>
          </div>
        </>}

        {tab === 'leads' && <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <b style={{ fontSize: 14 }}>Leads da pesquisa — CRM ({leads.length})</b>
            <button onClick={csv} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '.5rem .9rem', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 13 }}><Download size={15} />Exportar CSV</button>
          </div>
          <div style={{ marginTop: 12, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, minWidth: 720 }}>
              <thead><tr style={{ textAlign: 'left', color: '#9ca3af', fontSize: 11.5, textTransform: 'uppercase' }}>
                <th style={{ padding: 8 }}>Aura</th><th>Nome</th><th>WhatsApp</th><th>Instagram</th><th>Vibe</th><th>Dia/Hora</th><th>Loja</th><th></th>
              </tr></thead>
              <tbody>
                {leads.length === 0 ? <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>Nenhum lead ainda. Divulgue o QR da pesquisa.</td></tr> :
                  leads.map(r => {
                    const msgConvite = `Oi${r.nome ? ' ' + r.nome.split(' ')[0] : ''}! 💛 Aqui é do Amore Paiva. Você farmou aura com a gente no *Vamos Farmar Aura* — e o convite oficial tá chegando! 🔥 Fica ligado que a data já vem. ✨`
                    return <tr key={r.chave} style={{ borderTop: '1px solid #f3f4f6' }}>
                      <td style={{ padding: 8 }}><span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap', background: r.interesse === 'Alto' ? '#FEE2E2' : r.interesse === 'Médio' ? '#FEF3C7' : '#F3F4F6', color: r.interesse === 'Alto' ? '#B91C1C' : r.interesse === 'Médio' ? '#B45309' : '#6b7280' }}>{r.aura_faixa || r.aura}</span></td>
                      <td style={{ fontWeight: 600 }}>{r.nome || '—'}</td>
                      <td>{r.whatsapp}</td>
                      <td>{r.instagram ? <a href={`https://instagram.com/${r.instagram}`} target="_blank" rel="noreferrer" style={{ color: C.pink }}>@{r.instagram}</a> : '—'}</td>
                      <td style={{ fontSize: 12.5, color: '#6b7280' }}>{(r.musica || []).slice(0, 2).join(', ') || '—'}</td>
                      <td style={{ fontSize: 12.5, color: '#6b7280' }}>{r.dia || '—'}{r.horario ? ' · ' + r.horario : ''}</td>
                      <td style={{ fontSize: 12.5, color: '#6b7280' }}>{r.loja}</td>
                      <td><a href={waLink(r.whatsapp!, msgConvite)} target="_blank" rel="noreferrer" title="Falar no WhatsApp" style={{ color: '#25D366' }}><MessageCircle size={18} /></a></td>
                    </tr>
                  })}
              </tbody>
            </table>
          </div>
        </div>}

        {tab === 'campanha' && <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ ...card, borderLeft: `3px solid ${C.pink}` }}>
            <b style={{ fontSize: 14 }}>📣 Mensagem de divulgação (gerada das respostas)</b>
            <p style={{ fontSize: 12.5, color: '#9ca3af', margin: '4px 0 10px' }}>Montada com o dia, horário e a vibe musical mais votados. Copie e use nos stories/status ou dispare pela aba Campanhas.</p>
            <textarea readOnly value={promo} style={{ width: '100%', minHeight: 150, padding: 12, borderRadius: 10, border: '1px solid #e5e7eb', fontFamily: 'inherit', fontSize: 13.5, resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <button onClick={() => copiar(promo)} style={{ padding: '.6rem 1rem', borderRadius: 10, border: 'none', background: C.maroon, color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Copiar mensagem</button>
              <a href={`https://wa.me/?text=${encodeURIComponent(promo)}`} target="_blank" rel="noreferrer" style={{ padding: '.6rem 1rem', borderRadius: 10, background: '#25D366', color: '#fff', textDecoration: 'none', fontWeight: 600, fontSize: 13 }}>Compartilhar no WhatsApp</a>
            </div>
          </div>
          <div style={{ ...card }}>
            <b style={{ fontSize: 14 }}>🎯 Públicos para segmentar</b>
            <p style={{ fontSize: 12.5, color: '#9ca3af', margin: '4px 0 10px' }}>Priorize os de maior aura na hora de mandar o convite oficial.</p>
            {(['Alto', 'Médio', 'Baixo'] as const).map(nv => {
              const grp = fil.filter(r => r.interesse === nv && (r.whatsapp || '').length >= 10)
              return <div key={nv} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
                <span style={{ fontSize: 13.5 }}>{nv === 'Alto' ? '🔥' : nv === 'Médio' ? '✨' : '👀'} Interesse {nv}</span>
                <b style={{ fontSize: 14, color: C.maroon }}>{grp.length} contato(s)</b>
              </div>
            })}
            <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 10 }}>💡 Dispares em massa saem pela aba <b>Campanhas</b> (com o worker anti-bloqueio). Aqui você valida a lista e a mensagem antes.</p>
          </div>
        </div>}

        {tab === 'qr' && <div style={{ ...card, textAlign: 'center', maxWidth: 420, margin: '0 auto' }}>
          <b style={{ fontSize: 15 }}>QR da pesquisa — Vamos Farmar Aura</b>
          <p style={{ fontSize: 13, color: '#9ca3af', margin: '6px 0 14px' }}>Imprima e cole nas mesas/balcão, ou use nos stories. Ao abrir, a pessoa responde e vira lead no CRM da campanha.</p>
          <img src={qrImg(SURVEY, 260)} alt="QR pesquisa" style={{ width: 220, height: 220, borderRadius: 12, border: '1px solid #e5e7eb' }} />
          <div style={{ marginTop: 12, fontSize: 12.5, color: '#6b7280', wordBreak: 'break-all' }}>{SURVEY}</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12, flexWrap: 'wrap' }}>
            <a href={qrImg(SURVEY, 800)} download="QR_Vamos_Farmar_Aura.png" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '.6rem 1rem', borderRadius: 10, background: C.maroon, color: '#fff', textDecoration: 'none', fontWeight: 600, fontSize: 13 }}><Download size={15} />Baixar QR</a>
            <button onClick={() => copiar(SURVEY)} style={{ padding: '.6rem 1rem', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Copiar link</button>
            <a href={SURVEY} target="_blank" rel="noreferrer" style={{ padding: '.6rem 1rem', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', textDecoration: 'none', color: '#374151', fontWeight: 600, fontSize: 13 }}>Abrir pesquisa</a>
          </div>
        </div>}

      </>}
    </div>
  )
}
