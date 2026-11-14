import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { fetchProfiles } from '../../lib/db'
import { siteOrigin } from '../../lib/site'
import { sb, auditar, carregarConfig, salvarConfig, atrasada, fmtD, fmtDH, hojeISO, onFila, filaTamanho, sincronizarFila, pct, CONFIG_PADRAO } from './plantaoLib'
import type { Escala, Ocorrencia, Plantao, PltConfig, Setor } from './plantaoLib'
import { Btn, MultiCheck, Modal, Pill, card, grid, inp, lbl } from './plantaoUi'
import PlantaoExecutar from './PlantaoExecutar'
import PlantaoOcorrencias from './PlantaoOcorrencias'

type Aba = 'painel' | 'escala' | 'executar' | 'ocorrencias' | 'tratativas' | 'relatorios' | 'config'
const ABAS: [Aba, string][] = [['painel', '📊 Painel'], ['escala', '📅 Escala'], ['executar', '✅ Executar'], ['ocorrencias', '🚨 Ocorrências'], ['tratativas', '🛠 Tratativas'], ['relatorios', '📄 Relatórios'], ['config', '⚙️ Configurar']]

export default function PlantaoPage() {
  const { user, isOwner } = useAuth()
  const { theme } = useTheme()
  const lojas = theme.stores?.length ? theme.stores : ['Amore CD', 'Amore Paiva', 'Flow CD']
  const userName = (user?.name || 'Usuário').trim()
  const [aba, setAba] = useState<Aba>(() => {
    try { const a = new URLSearchParams(location.search).get('aba'); return (ABAS.some(x => x[0] === a) ? a : 'painel') as Aba } catch { return 'painel' }
  })
  const [cfg, setCfg] = useState<PltConfig>(CONFIG_PADRAO)
  const [nomes, setNomes] = useState<string[]>([])
  const [foco, setFoco] = useState<string | null>(null)
  const [fila, setFila] = useState(filaTamanho())

  useEffect(() => { void carregarConfig().then(setCfg) }, [])
  useEffect(() => { void fetchProfiles().then(p => setNomes(Array.from(new Set(p.map(x => (x.name || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b)))).catch(() => {}) }, [])
  useEffect(() => onFila(setFila), [])
  useEffect(() => { void sincronizarFila() }, [])

  const setores = useMemo(() => Array.from(new Set([...Object.keys(cfg.responsaveis), 'Cozinha', 'Salão', 'Estoque', 'Compras', 'Manutenção', 'Limpeza', 'Gerência', 'Operação'])).sort(), [cfg])
  const abrirOc = (id: string) => { setFoco(id); setAba('ocorrencias') }

  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 1100 }}>
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
        {ABAS.map(([k, t]) => (
          <button key={k} onClick={() => { setAba(k); setFoco(null) }}
            style={{ flex: '0 0 auto', padding: '10px 14px', borderRadius: 99, border: `1px solid ${aba === k ? 'var(--bordo)' : 'var(--border)'}`, background: aba === k ? 'var(--bordo)' : 'var(--card, #fff)', color: aba === k ? '#fff' : 'var(--text)', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', whiteSpace: 'nowrap' }}>{t}</button>
        ))}
      </div>
      {fila > 0 && <div style={{ ...card, background: '#fffbeb', borderColor: '#fcd34d', fontSize: 13 }}>🕓 {fila} registro(s) guardado(s) no aparelho aguardando conexão. Sincronizam sozinhos quando a internet voltar. <Btn small tone="ghost" onClick={() => void sincronizarFila()}>Tentar agora</Btn></div>}
      {aba === 'painel' && <Painel lojas={lojas} onAbrir={abrirOc} />}
      {aba === 'escala' && <EscalaTab cfg={cfg} lojas={lojas} userName={userName} />}
      {aba === 'executar' && <PlantaoExecutar cfg={cfg} lojas={lojas} userName={userName} onAbrirOcorrencia={abrirOc} />}
      {aba === 'ocorrencias' && <PlantaoOcorrencias cfg={cfg} lojas={lojas} userName={userName} nomes={nomes} setores={setores} modo="ocorrencias" foco={foco} onFoco={setFoco} />}
      {aba === 'tratativas' && <PlantaoOcorrencias cfg={cfg} lojas={lojas} userName={userName} nomes={nomes} setores={setores} modo="tratativas" foco={foco} onFoco={setFoco} />}
      {aba === 'relatorios' && <Relatorios lojas={lojas} />}
      {aba === 'config' && <Config cfg={cfg} onSalvo={setCfg} podeEditar={isOwner || user?.role === 'admin' || user?.role === 'super_admin'} userName={userName} />}
    </div>
  )
}

// ── Painel ───────────────────────────────────────────────────
const PRONT: [string, string][] = [['estoque', 'Estoque'], ['equipe', 'Equipe'], ['mise', 'Mise en place'], ['bebidas', 'Bebidas'], ['estrutura', 'Estrutura'], ['frente', 'Frente de loja']]
function Painel({ lojas, onAbrir }: { lojas: string[]; onAbrir: (id: string) => void }) {
  const [pl, setPl] = useState<Plantao[]>([])
  const [oc, setOc] = useState<Ocorrencia[]>([])
  const [es, setEs] = useState<Escala[]>([])
  const [rp, setRp] = useState<{ plantao_id: string; item_id: string; resposta: string }[]>([])
  const [ok, setOk] = useState(false)
  useEffect(() => {
    void (async () => {
      const [a, b, c] = await Promise.all([
        sb.from('plt_plantoes').select('*').order('chegada_em', { ascending: false }).limit(500),
        sb.from('plt_ocorrencias').select('*').limit(2000),
        sb.from('plt_escala').select('*').order('data', { ascending: false }).limit(200),
      ])
      const plantoes: Plantao[] = a.data || []
      setPl(plantoes); setOc(b.data || []); setEs(c.data || [])
      const ult = lojas.map(l => plantoes.find(p => p.loja === l && p.status === 'encerrado')?.id).filter(Boolean) as string[]
      if (ult.length) { const r = await sb.from('plt_respostas').select('plantao_id,item_id,resposta').in('plantao_id', ult); setRp(r.data || []) }
      setOk(true)
    })()
  }, [lojas])

  const enc = pl.filter(p => p.status === 'encerrado')
  const conf = enc.filter(p => p.conformidade != null)
  const confMedia = conf.length ? Math.round(conf.reduce((s, p) => s + Number(p.conformidade), 0) / conf.length * 10) / 10 : null
  const atras = oc.filter(atrasada)
  const naoRealizados = es.filter(e => e.status === 'nao_realizado' || (e.status === 'agendado' && e.data < hojeISO()))
  const comTrat = oc.filter(o => o.resp_nome && o.prazo)
  const conclu = comTrat.filter(o => o.status === 'concluido' && o.concluido_em)
  const noPrazo = conclu.filter(o => new Date(o.concluido_em!) <= new Date(o.prazo!)).length
  const tempoMed = conclu.length ? Math.round(conclu.reduce((s, o) => s + (new Date(o.concluido_em!).getTime() - new Date(o.identificado_em).getTime()), 0) / conclu.length / 3600000 * 10) / 10 : null
  const porLoja = lojas.map(l => {
    const ps = conf.filter(p => p.loja === l)
    return { l, n: ps.length, c: ps.length ? Math.round(ps.reduce((s, p) => s + Number(p.conformidade), 0) / ps.length * 10) / 10 : null, d: oc.filter(o => o.loja === l).length, pend: oc.filter(o => o.loja === l && o.status !== 'concluido').length }
  })
  const porSetor = Object.entries(oc.reduce<Record<string, number>>((m, o) => { const k = o.setor_nome || '—'; m[k] = (m[k] || 0) + 1; return m }, {})).sort((a, b) => b[1] - a[1])
  const maxSetor = Math.max(1, ...porSetor.map(x => x[1]))

  // Índice de Prontidão: último plantão encerrado de cada loja, por dimensão
  const prontidao = lojas.map(l => {
    const p = enc.find(x => x.loja === l)
    if (!p) return { l, dims: null as null | Record<string, number | null>, geral: null as number | null }
    const itens = p.estrutura.flatMap((s: Setor) => s.itens)
    const dims: Record<string, number | null> = {}
    const vals: number[] = []
    for (const [k] of PRONT) {
      const ids = new Set(itens.filter(i => i.pront === k).map(i => i.id))
      const rs = rp.filter(r => r.plantao_id === p.id && ids.has(r.item_id) && r.resposta !== 'na')
      const v = pct(rs.filter(r => r.resposta === 'conforme').length, rs.length)
      dims[k] = v; if (v != null) vals.push(v)
    }
    return { l, dims, geral: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10 : null }
  })

  if (!ok) return <div style={{ color: 'var(--muted)', padding: 16 }}>Carregando indicadores…</div>
  const K = (t: string, v: string | number, cor = 'var(--text)', sub?: string) => (
    <div style={card}><div style={{ fontSize: 26, fontWeight: 900, color: cor }}>{v}</div><div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>{t}</div>{sub && <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{sub}</div>}</div>
  )
  const cor = (v: number | null) => v == null ? 'var(--muted)' : v >= 90 ? '#16a34a' : v >= 70 ? '#ca8a04' : '#dc2626'
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={grid(150)}>
        {K('Plantões realizados', enc.length)}
        {K('Conformidade média', confMedia == null ? '—' : confMedia + '%', cor(confMedia))}
        {K('Desvios registrados', oc.length, '#dc2626', `${oc.filter(o => o.status !== 'concluido').length} pendentes`)}
        {K('Tratativas atrasadas', atras.length, atras.length ? '#b91c1c' : '#16a34a')}
        {K('Agendados não realizados', naoRealizados.length, naoRealizados.length ? '#ca8a04' : '#16a34a')}
        {K('Tratativas no prazo', conclu.length ? Math.round(noPrazo / conclu.length * 100) + '%' : '—', '#16a34a', `${conclu.length} concluídas`)}
        {K('Reincidentes', oc.filter(o => o.reincidente).length, '#7c2d12')}
        {K('Tempo médio de resolução', tempoMed == null ? '—' : tempoMed + ' h')}
      </div>

      <div style={card}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>🏪 Acompanhamento por loja</div>
        <div style={grid(220)}>
          {porLoja.map(x => (
            <div key={x.l} style={{ ...card, background: 'var(--bg)' }}>
              <div style={{ fontWeight: 800 }}>{x.l}</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: cor(x.c) }}>{x.c == null ? '—' : x.c + '%'}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{x.n} plantão(ões) · {x.d} desvio(s) · {x.pend} pendente(s)</div>
            </div>
          ))}
        </div>
      </div>

      <div style={card}>
        <div style={{ fontWeight: 800, marginBottom: 2 }}>🚦 Índice de Prontidão para o Final de Semana</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>Calculado do último plantão encerrado de cada loja (itens do checklist ligados a estoque, equipe, mise en place, bebidas, estrutura e frente de loja). Não é a conformidade geral.</div>
        <div style={grid(260)}>
          {prontidao.map(p => (
            <div key={p.l} style={{ ...card, background: 'var(--bg)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><b>{p.l}</b><b style={{ color: cor(p.geral) }}>{p.geral == null ? 'sem dados' : p.geral + '%'}</b></div>
              {p.dims && PRONT.map(([k, t]) => <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}><span>{t}</span><span style={{ color: cor(p.dims![k]), fontWeight: 700 }}>{p.dims![k] == null ? '—' : p.dims![k] + '%'}</span></div>)}
            </div>
          ))}
        </div>
      </div>

      <div style={{ ...grid(320) }}>
        <div style={card}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>📍 Ocorrências por setor</div>
          {porSetor.length === 0 ? <div style={{ fontSize: 13, color: 'var(--muted)' }}>Nenhuma ocorrência ainda.</div> : porSetor.map(([s, n]) => (
            <div key={s} style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}><span>{s}</span><b>{n}</b></div>
              <div style={{ height: 7, background: 'var(--border)', borderRadius: 99 }}><div style={{ width: `${n / maxSetor * 100}%`, height: '100%', background: 'var(--bordo)', borderRadius: 99 }} /></div>
            </div>
          ))}
        </div>
        <div style={card}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>🕓 Histórico de conformidade</div>
          {conf.length === 0 ? <div style={{ fontSize: 13, color: 'var(--muted)' }}>Nenhum plantão encerrado ainda.</div> : conf.slice(0, 10).map(p => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, borderBottom: '1px solid var(--border)', padding: '4px 0' }}>
              <span>{fmtD(p.data)} · {p.loja}</span><b style={{ color: cor(Number(p.conformidade)) }}>{p.conformidade}%</b>
            </div>
          ))}
        </div>
      </div>

      {atras.length > 0 && (
        <div style={{ ...card, borderColor: '#fecaca', background: '#fef2f2' }}>
          <div style={{ fontWeight: 800, color: '#b91c1c', marginBottom: 6 }}>⏰ Tratativas atrasadas — exigem escalonamento</div>
          {atras.slice(0, 8).map(o => <div key={o.id} onClick={() => onAbrir(o.id)} style={{ fontSize: 13, padding: '4px 0', cursor: 'pointer' }}>#{o.numero} · {o.loja} · {o.item_texto || o.setor_nome} — <b>{o.resp_nome}</b> (prazo {fmtDH(o.prazo)})</div>)}
        </div>
      )}
    </div>
  )
}

// ── Escala ───────────────────────────────────────────────────
function EscalaTab({ cfg, lojas, userName }: { cfg: PltConfig; lojas: string[]; userName: string }) {
  const [lista, setLista] = useState<Escala[]>([])
  const [ed, setEd] = useState<Partial<Escala> | null>(null)
  const [stats, setStats] = useState<Record<string, number>>({})
  const carregar = useCallback(async () => {
    const { data } = await sb.from('plt_escala').select('*').order('data', { ascending: false }).limit(150)
    setLista(data || [])
    const s: Record<string, number> = {}
    for (const e of (data || []) as Escala[]) if (e.status === 'realizado') for (const n of e.dupla) s[n] = (s[n] || 0) + 1
    setStats(s)
  }, [])
  useEffect(() => { void carregar() }, [carregar])

  const gerar = async () => {
    const n = Number(prompt('Gerar escala para quantos finais de semana a partir do próximo sábado?', '4'))
    if (!n || n < 1 || !cfg.duplas.length) return
    const d = new Date(); d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7))
    const novos = []
    for (let i = 0; i < n; i++) {
      const dt = new Date(d); dt.setDate(d.getDate() + i * 7)
      const iso = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
      if (lista.some(e => e.data === iso)) continue
      novos.push({ data: iso, dupla: cfg.duplas[(Math.ceil(dt.getDate() / 7) - 1) % cfg.duplas.length], lojas, horario: '18:00', status: 'agendado', created_by: userName })
    }
    if (!novos.length) return alert('Esses finais de semana já estão na escala.')
    const { error } = await sb.from('plt_escala').insert(novos)
    if (error) return alert(error.message)
    await carregar()
  }
  const salvar = async () => {
    if (!ed?.data || !ed.dupla?.length) return alert('Informe a data e a dupla.')
    if (ed.status === 'nao_realizado' && !(ed.motivo || '').trim()) return alert('Informe o motivo do plantão não realizado.')
    const row = { data: ed.data, dupla: ed.dupla, lojas: ed.lojas || [], horario: ed.horario || null, status: ed.status || 'agendado', confirmados: ed.confirmados || [], motivo: ed.motivo || null, updated_at: new Date().toISOString() }
    const antes = lista.find(x => x.id === ed.id)
    const { data, error } = ed.id ? await sb.from('plt_escala').update(row).eq('id', ed.id).select('id').single() : await sb.from('plt_escala').insert({ ...row, created_by: userName }).select('id').single()
    if (error) return alert(error.message)
    auditar('escala', data.id, ed.id ? 'Escala alterada' : 'Escala criada', antes ? { dupla: antes.dupla, lojas: antes.lojas, status: antes.status, data: antes.data } : null, { dupla: row.dupla, lojas: row.lojas, status: row.status, data: row.data }, userName)
    setEd(null); await carregar()
  }
  const futuras = lista.filter(e => e.data >= hojeISO()).reverse()
  const passadas = lista.filter(e => e.data < hojeISO())
  const linha = (e: Escala) => (
    <div key={e.id} style={{ ...card, display: 'grid', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' }}>
        <b>{fmtD(e.data)} {e.horario ? '· ' + e.horario : ''}</b>
        <Pill cor={e.status === 'realizado' ? '#16a34a' : e.status === 'nao_realizado' ? '#dc2626' : e.status === 'cancelado' ? '#6b7280' : '#2563eb'}>{{ agendado: 'Agendado', realizado: 'Realizado', nao_realizado: 'Não realizado', cancelado: 'Cancelado' }[e.status] || e.status}</Pill>
      </div>
      <div style={{ fontSize: 13.5 }}>👥 {e.dupla.map(n => (e.confirmados || []).includes(n) ? `${n} ✔` : n).join(' + ')}</div>
      <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>🏪 {e.lojas.join(' → ') || 'Roteiro livre'}{e.motivo ? ` · Motivo: ${e.motivo}` : ''}</div>
      {e.status === 'agendado' && (() => {
        const link = `${siteOrigin()}/plantao.html?e=${e.id}`
        const msg = `🚩 *Plantão de Gestão — ${fmtD(e.data)}${e.horario ? ' às ' + e.horario : ''}*\nDupla: ${e.dupla.join(' + ')}\nLojas: ${e.lojas.join(' → ') || 'a definir'}\n\nAbra o link pelo celular para fazer o checklist e as tarefas do plantão:\n${link}`
        return (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Btn small onClick={() => window.open(link, '_blank')}>📱 Abrir checklist</Btn>
            <Btn small tone="ghost" onClick={() => { void navigator.clipboard?.writeText(msg); alert('Mensagem com o link do plantonista copiada.') }}>Copiar link</Btn>
            <Btn small tone="ghost" onClick={() => window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank')}>Enviar por WhatsApp</Btn>
          </div>
        )
      })()}
      <div><Btn small tone="ghost" onClick={() => setEd(e)}>Editar / confirmar</Btn></div>
    </div>
  )
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Btn onClick={() => setEd({ data: hojeISO(), dupla: [], lojas, horario: '18:00', status: 'agendado', confirmados: [] })}>➕ Novo plantão</Btn>
        <Btn tone="ghost" onClick={gerar}>🔁 Gerar escala pelo rodízio</Btn>
      </div>
      <div style={card}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>👤 Plantões realizados por integrante</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{cfg.equipe.map(n => <Pill key={n} cor="#4b5563">{n}: {stats[n] || 0}</Pill>)}</div>
      </div>
      <div style={{ fontWeight: 800 }}>Próximos</div>
      <div style={grid(300)}>{futuras.length ? futuras.map(linha) : <div style={{ color: 'var(--muted)', fontSize: 13 }}>Nenhum plantão futuro. Use “Gerar escala pelo rodízio”.</div>}</div>
      <div style={{ fontWeight: 800 }}>Histórico</div>
      <div style={grid(300)}>{passadas.map(linha)}</div>
      {ed && (
        <Modal titulo={ed.id ? 'Editar plantão' : 'Novo plantão'} onClose={() => setEd(null)}>
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={grid(160)}>
              <div><label style={lbl}>Data</label><input type="date" value={ed.data || ''} onChange={e => setEd({ ...ed, data: e.target.value })} style={inp} /></div>
              <div><label style={lbl}>Horário</label><input type="time" value={ed.horario || ''} onChange={e => setEd({ ...ed, horario: e.target.value })} style={inp} /></div>
              <div><label style={lbl}>Situação</label><select value={ed.status} onChange={e => setEd({ ...ed, status: e.target.value })} style={inp}><option value="agendado">Agendado</option><option value="realizado">Realizado</option><option value="nao_realizado">Não realizado</option><option value="cancelado">Cancelado</option></select></div>
            </div>
            <div><label style={lbl}>Dupla</label><MultiCheck opcoes={cfg.equipe} valor={ed.dupla || []} onChange={v => setEd({ ...ed, dupla: v })} /></div>
            <div><label style={lbl}>Confirmaram participação</label><MultiCheck opcoes={ed.dupla || []} valor={ed.confirmados || []} onChange={v => setEd({ ...ed, confirmados: v })} /></div>
            <div><label style={lbl}>Lojas / roteiro</label><MultiCheck opcoes={lojas} valor={ed.lojas || []} onChange={v => setEd({ ...ed, lojas: v })} /></div>
            {ed.status === 'nao_realizado' && <div><label style={lbl}>Motivo (obrigatório)</label><input value={ed.motivo || ''} onChange={e => setEd({ ...ed, motivo: e.target.value })} style={inp} /></div>}
            <Btn onClick={salvar}>Salvar</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Relatórios ───────────────────────────────────────────────
function Relatorios({ lojas }: { lojas: string[] }) {
  const [pl, setPl] = useState<Plantao[]>([])
  const [loja, setLoja] = useState('')
  useEffect(() => { void sb.from('plt_plantoes').select('*').order('chegada_em', { ascending: false }).limit(200).then((r: { data: Plantao[] | null }) => setPl(r.data || [])) }, [])
  const lista = pl.filter(p => !loja || p.loja === loja)
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <select value={loja} onChange={e => setLoja(e.target.value)} style={{ ...inp, maxWidth: 260 }}><option value="">Todas as lojas</option>{lojas.map(l => <option key={l}>{l}</option>)}</select>
      <div style={grid(300)}>
        {lista.map(p => {
          const link = `${siteOrigin()}/plantao-relatorio.html?id=${p.id}`
          const msg = `📋 *Plantão de Gestão — ${p.loja}* (${fmtD(p.data)})\nConformidade: ${p.conformidade ?? '—'}%\nRelatório: ${link}`
          return (
            <div key={p.id} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><b>{p.loja} · nº {p.numero}</b><Pill cor={p.status === 'encerrado' ? '#16a34a' : '#2563eb'}>{p.status === 'encerrado' ? 'Encerrado' : 'Em andamento'}</Pill></div>
              <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{fmtDH(p.chegada_em)} → {fmtDH(p.saida_em)} · 👥 {p.integrantes.join(' + ')}</div>
              <div style={{ fontSize: 13, margin: '4px 0' }}>Conformidade: <b>{p.conformidade ?? '—'}{p.conformidade != null ? '%' : ''}</b></div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Btn small onClick={() => window.open(link, '_blank')}>Abrir / PDF</Btn>
                <Btn small tone="ghost" onClick={() => { void navigator.clipboard?.writeText(msg); alert('Mensagem com link copiada.') }}>Copiar link</Btn>
                <Btn small tone="ghost" onClick={() => window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank')}>WhatsApp</Btn>
              </div>
            </div>
          )
        })}
        {lista.length === 0 && <div style={{ color: 'var(--muted)' }}>Nenhum plantão registrado ainda.</div>}
      </div>
    </div>
  )
}

// ── Configurações ────────────────────────────────────────────
function Config({ cfg, onSalvo, podeEditar, userName }: { cfg: PltConfig; onSalvo: (c: PltConfig) => void; podeEditar: boolean; userName: string }) {
  const [est, setEst] = useState<Setor[]>([])
  const [ver, setVer] = useState<{ id: string; versao: number } | null>(null)
  const [c, setC] = useState({
    equipe: cfg.equipe.join(', '), duplas: cfg.duplas.map(d => d.join(' + ')).join('\n'), tipos: cfg.tipos.join('\n'),
    resp: Object.entries(cfg.responsaveis).map(([k, v]) => `${k} = ${v}`).join('\n'), prazos: { ...cfg.prazos },
  })
  useEffect(() => {
    void sb.from('plt_checklist_versoes').select('*').eq('ativa', true).order('versao', { ascending: false }).limit(1).single().then((r: { data: { id: string; versao: number; estrutura: Setor[] } | null }) => {
      if (r.data) { setVer({ id: r.data.id, versao: r.data.versao }); setEst(r.data.estrutura) }
    })
  }, [])
  if (!podeEditar) return <div style={card}>Apenas administradores configuram o checklist e as regras do plantão.</div>

  const upSetor = (i: number, p: Partial<Setor>) => setEst(e => e.map((s, k) => k === i ? { ...s, ...p } : s))
  const mover = <T,>(arr: T[], i: number, d: number) => { const a = [...arr]; const j = i + d; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a }
  const salvarChecklist = async () => {
    if (!confirm('Publicar nova versão do checklist? Plantões já iniciados continuam na versão que usaram.')) return
    const nv = (ver?.versao || 0) + 1
    const limpo = est.map(s => ({ ...s, itens: s.itens.filter(i => i.texto.trim()) })).filter(s => s.nome.trim())
    await sb.from('plt_checklist_versoes').update({ ativa: false }).eq('ativa', true)
    const { data, error } = await sb.from('plt_checklist_versoes').insert({ versao: nv, ativa: true, estrutura: limpo, created_by: userName }).select('id,versao').single()
    if (error) return alert(error.message)
    setVer(data); setEst(limpo); auditar('checklist', data.id, 'Nova versão publicada', { versao: nv - 1 }, { versao: nv }, userName)
    alert('Versão ' + nv + ' publicada.')
  }
  const salvarRegras = async () => {
    const n: PltConfig = {
      equipe: c.equipe.split(',').map(s => s.trim()).filter(Boolean),
      duplas: c.duplas.split('\n').map(l => l.split('+').map(s => s.trim()).filter(Boolean)).filter(d => d.length),
      tipos: c.tipos.split('\n').map(s => s.trim()).filter(Boolean),
      prazos: c.prazos,
      responsaveis: Object.fromEntries(c.resp.split('\n').map(l => l.split('=').map(s => s.trim())).filter(p => p[0] && p[1]).map(p => [p[0], p[1]])),
    }
    await salvarConfig(n); onSalvo(n); alert('Configurações salvas.')
  }
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={card}>
        <div style={{ fontWeight: 800 }}>📝 Checklist por setor {ver ? `(versão ativa v${ver.versao})` : ''}</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>Edite setores, itens, ordem e obrigatoriedade de foto. “Prontidão” liga o item ao Índice de Prontidão do fim de semana.</div>
        {est.map((s, i) => (
          <div key={s.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 10, marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <input value={s.nome} onChange={e => upSetor(i, { nome: e.target.value })} style={{ ...inp, fontWeight: 700 }} />
              <Btn small tone="ghost" onClick={() => setEst(mover(est, i, -1))}>↑</Btn><Btn small tone="ghost" onClick={() => setEst(mover(est, i, 1))}>↓</Btn>
              <Btn small tone="danger" onClick={() => confirm('Remover o setor?') && setEst(est.filter((_, k) => k !== i))}>🗑</Btn>
            </div>
            {s.itens.map((it, j) => (
              <div key={it.id} style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <input value={it.texto} onChange={e => upSetor(i, { itens: s.itens.map((x, k) => k === j ? { ...x, texto: e.target.value } : x) })} style={{ ...inp, flex: '1 1 220px', width: 'auto' }} />
                <label style={{ fontSize: 12.5, display: 'flex', gap: 4, alignItems: 'center' }}><input type="checkbox" checked={!!it.semEv} onChange={e => upSetor(i, { itens: s.itens.map((x, k) => k === j ? { ...x, semEv: e.target.checked } : x) })} />sem foto</label>
                <select value={it.pront || ''} onChange={e => upSetor(i, { itens: s.itens.map((x, k) => k === j ? { ...x, pront: e.target.value || undefined } : x) })} style={{ ...inp, width: 'auto', fontSize: 13 }}><option value="">Prontidão: —</option>{PRONT.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
                <Btn small tone="ghost" onClick={() => upSetor(i, { itens: mover(s.itens, j, -1) })}>↑</Btn><Btn small tone="ghost" onClick={() => upSetor(i, { itens: mover(s.itens, j, 1) })}>↓</Btn>
                <Btn small tone="danger" onClick={() => upSetor(i, { itens: s.itens.filter((_, k) => k !== j) })}>✕</Btn>
              </div>
            ))}
            <div style={{ marginTop: 6 }}><Btn small tone="ghost" onClick={() => upSetor(i, { itens: [...s.itens, { id: `${s.id}i${Date.now().toString(36)}`, texto: '', ev: false }] })}>+ item</Btn></div>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Btn tone="ghost" onClick={() => setEst([...est, { id: 's' + Date.now().toString(36), nome: 'Novo setor', itens: [] }])}>+ setor</Btn>
          <Btn onClick={salvarChecklist}>Publicar nova versão</Btn>
        </div>
      </div>
      <div style={{ ...card, display: 'grid', gap: 10 }}>
        <div style={{ fontWeight: 800 }}>👥 Equipe, rodízio e regras</div>
        <div><label style={lbl}>Integrantes (separados por vírgula)</label><input value={c.equipe} onChange={e => setC({ ...c, equipe: e.target.value })} style={inp} /></div>
        <div><label style={lbl}>Duplas do rodízio (1ª, 2ª, 3ª, 4ª semana — uma por linha, "A + B")</label><textarea rows={4} value={c.duplas} onChange={e => setC({ ...c, duplas: e.target.value })} style={inp} /></div>
        <div><label style={lbl}>Tipos de ocorrência (um por linha)</label><textarea rows={5} value={c.tipos} onChange={e => setC({ ...c, tipos: e.target.value })} style={inp} /></div>
        <div><label style={lbl}>Responsável padrão por competência (uma por linha: "Setor = Nome")</label><textarea rows={4} value={c.resp} onChange={e => setC({ ...c, resp: e.target.value })} style={inp} placeholder="Estoque = Maria&#10;Cozinha = João" /></div>
        <div>
          <label style={lbl}>Prazo padrão das tratativas (dias; 0 = imediato)</label>
          <div style={grid(110)}>{(['baixa', 'media', 'alta', 'critica'] as const).map(k => <div key={k}><div style={{ fontSize: 12 }}>{{ baixa: 'Baixa', media: 'Média', alta: 'Alta', critica: 'Crítica' }[k]}</div><input type="number" min={0} value={c.prazos[k]} onChange={e => setC({ ...c, prazos: { ...c.prazos, [k]: Number(e.target.value) } })} style={inp} /></div>)}</div>
        </div>
        <Btn onClick={salvarRegras}>Salvar regras</Btn>
      </div>
    </div>
  )
}

