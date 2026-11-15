import { useEffect, useMemo, useState, useCallback } from 'react'
import { siteOrigin } from '../../lib/site'
import { sb, auditar, conformidadeDe, detUuid, fmtDH, fmtD, hojeISO, onFila, filaTamanho, filaPendentes, salvarFila, sincronizarFila, prio, PRIORIDADES } from './plantaoLib'
import type { Escala, Ocorrencia, Plantao, PltConfig, Resposta, Setor, Item } from './plantaoLib'
import { Btn, Evidencias, MultiCheck, Pill, card, grid, inp, lbl } from './plantaoUi'

type Props = { cfg: PltConfig; lojas: string[]; userName: string; onAbrirOcorrencia: (id: string) => void }

export default function PlantaoExecutar({ cfg, lojas, userName, onAbrirOcorrencia }: Props) {
  const [ativos, setAtivos] = useState<Plantao[]>([])
  const [escalas, setEscalas] = useState<Escala[]>([])
  const [sel, setSel] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [iniciando, setIniciando] = useState(false)
  const [escId, setEscId] = useState('')
  const [loja, setLoja] = useState('')
  const [integ, setInteg] = useState<string[]>([])

  const carregar = useCallback(async () => {
    const [p, e] = await Promise.all([
      sb.from('plt_plantoes').select('*').eq('status', 'em_andamento').order('chegada_em', { ascending: false }),
      sb.from('plt_escala').select('*').eq('status', 'agendado').gte('data', new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10)).order('data').limit(12),
    ])
    setAtivos(p.data || []); setEscalas(e.data || []); setCarregando(false)
  }, [])
  useEffect(() => { void carregar() }, [carregar])

  const esc = escalas.find(x => x.id === escId)
  useEffect(() => { if (esc) { setInteg(esc.dupla); if (esc.lojas.length === 1) setLoja(esc.lojas[0]) } }, [escId]) // eslint-disable-line

  const iniciar = async () => {
    if (!loja) return alert('Escolha a loja.')
    if (!integ.length) return alert('Informe os integrantes do plantão.')
    setIniciando(true)
    const { data: ver } = await sb.from('plt_checklist_versoes').select('*').eq('ativa', true).order('versao', { ascending: false }).limit(1).single()
    if (!ver) { setIniciando(false); return alert('Nenhuma versão ativa do checklist. Configure em "Configurar".') }
    // chegada = horário do servidor/aparelho no momento do clique — não editável
    const { data, error } = await sb.from('plt_plantoes').insert({
      escala_id: esc?.id || null, loja, data: hojeISO(), integrantes: integ, versao_id: ver.id, versao: ver.versao, estrutura: ver.estrutura,
      chegada_em: new Date().toISOString(), created_by: userName,
    }).select('*').single()
    setIniciando(false)
    if (error || !data) return alert('Não foi possível iniciar (verifique a conexão): ' + (error?.message || ''))
    auditar('plantao', data.id, 'Plantão iniciado', null, { loja, integrantes: integ }, userName)
    setSel(data.id); void carregar()
  }

  if (sel) {
    const p = ativos.find(x => x.id === sel)
    if (p) return <Checklist plantao={p} userName={userName} onVoltar={() => { setSel(null); void carregar() }} onAbrirOcorrencia={onAbrirOcorrencia} />
  }
  if (carregando) return <div style={{ padding: 20, color: 'var(--muted)' }}>Carregando…</div>

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {ativos.length > 0 && (
        <div style={card}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>▶️ Plantões em andamento</div>
          <div style={grid(260)}>
            {ativos.map(p => (
              <div key={p.id} style={{ ...card, background: 'var(--bg)' }}>
                <div style={{ fontWeight: 800 }}>{p.loja}</div>
                <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Plantão nº {p.numero} · chegada {fmtDH(p.chegada_em)}</div>
                <div style={{ fontSize: 12.5, margin: '4px 0 8px' }}>👥 {p.integrantes.join(' + ')}</div>
                <Btn onClick={() => setSel(p.id)}>Continuar checklist</Btn>
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={card}>
        <div style={{ fontWeight: 800, marginBottom: 10 }}>🚩 Iniciar plantão numa loja</div>
        <div style={{ display: 'grid', gap: 10 }}>
          {escalas.length > 0 && (
            <div>
              <label style={lbl}>Escala (opcional)</label>
              <select value={escId} onChange={e => setEscId(e.target.value)} style={inp}>
                <option value="">— Plantão avulso —</option>
                {escalas.map(e => <option key={e.id} value={e.id}>{fmtD(e.data)} · {e.dupla.join(' + ')}{e.lojas.length ? ' · ' + e.lojas.join(', ') : ''}</option>)}
              </select>
            </div>
          )}
          <div>
            <label style={lbl}>Loja</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {lojas.map(l => <Btn key={l} tone={loja === l ? 'primary' : 'ghost'} onClick={() => setLoja(l)}>{l}</Btn>)}
            </div>
          </div>
          <div>
            <label style={lbl}>Quem está no plantão</label>
            <MultiCheck opcoes={cfg.equipe} valor={integ} onChange={setInteg} />
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>⏱ A chegada é registrada automaticamente ao iniciar e a saída ao encerrar — não são editáveis. Para visitar outra loja, inicie um novo plantão nela: os registros não se misturam.</div>
          <Btn onClick={iniciar} disabled={iniciando}>{iniciando ? 'Iniciando…' : 'Registrar chegada e iniciar checklist'}</Btn>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
function Checklist({ plantao, userName, onVoltar, onAbrirOcorrencia }: { plantao: Plantao; userName: string; onVoltar: () => void; onAbrirOcorrencia: (id: string) => void }) {
  const [resp, setResp] = useState<Record<string, Resposta>>({})
  const [oc, setOc] = useState<Record<string, Pick<Ocorrencia, 'id' | 'prioridade' | 'status' | 'numero' | 'rnc_numero'> & { numero: number }>>({})
  const [aberto, setAberto] = useState<string | null>(plantao.estrutura[0]?.id || null)
  const [fila, setFila] = useState(filaTamanho())
  const [parecer, setParecer] = useState('')
  const [encerrando, setEncerrando] = useState(false)
  const [fim, setFim] = useState<Plantao | null>(null)

  useEffect(() => onFila(setFila), [])
  useEffect(() => {
    const h = () => { void sincronizarFila() }
    window.addEventListener('online', h)
    const t = setInterval(h, 20000)
    return () => { window.removeEventListener('online', h); clearInterval(t) }
  }, [])
  useEffect(() => {
    void (async () => {
      const [r, o] = await Promise.all([
        sb.from('plt_respostas').select('*').eq('plantao_id', plantao.id),
        sb.from('plt_ocorrencias').select('id,item_id,prioridade,status,numero,rnc_numero').eq('plantao_id', plantao.id),
      ])
      const m: Record<string, Resposta> = {}
      for (const x of (r.data || []) as Resposta[]) m[x.item_id] = x
      for (const x of filaPendentes('plt_respostas') as unknown as Resposta[]) if (x.plantao_id === plantao.id) m[x.item_id] = x
      setResp(m)
      const om: typeof oc = {}
      for (const x of (o.data || [])) if (x.item_id) om[x.item_id] = x
      setOc(om)
    })()
  }, [plantao.id]) // eslint-disable-line

  const conf = useMemo(() => conformidadeDe(plantao.estrutura, Object.values(resp)), [plantao.estrutura, resp])

  const itemDe = (id: string) => plantao.estrutura.flatMap(s => s.itens).find(i => i.id === id)
  const temEv = (r?: Resposta) => !!r && (r.evidencias || []).length > 0
  const valida = (r?: Resposta) => !!r && r.resposta === 'nao_conforme' && !!(r.obs || '').trim() && (!!itemDe(r.item_id)?.semEv || temEv(r))
  // Foto/vídeo obrigatória só em desvio (Não conforme) e em setores marcados (Frente de loja); nos demais é opcional. N/A exige justificativa
  const completo = (r?: Resposta) => { if (!r) return false; const it = itemDe(r.item_id); if (it?.tipo === 'nome' || r.resposta === 'na') return !!(r.obs || '').trim(); if (r.resposta === 'nao_conforme') return valida(r); const st = plantao.estrutura.find(x => x.itens.some(i => i.id === r.item_id)); return (it?.semEv || !st?.evObrig) ? true : temEv(r) }

  const registrarOcorrencia = async (s: Setor, it: Item, r: Resposta) => {
    const existente = oc[it.id]
    const id = existente?.id || await detUuid(`${plantao.id}:${it.id}`)
    const base = { id, plantao_id: plantao.id, loja: plantao.loja, descricao: (r.obs || '').trim(), evidencias: r.evidencias || [], sem_evidencia: r.sem_evidencia || null }
    if (existente) { salvarFila('oc:' + id, 'plt_ocorrencias', { ...base, updated_at: new Date().toISOString() }); return }
    // reincidência: mesma loja + setor + tipo nos últimos 90 dias
    let reinc = false
    try {
      const { count } = await sb.from('plt_ocorrencias').select('id', { count: 'exact', head: true }).eq('loja', plantao.loja).eq('setor_id', s.id).eq('tipo', s.nome).gte('identificado_em', new Date(Date.now() - 90 * 86400000).toISOString()).neq('id', id)
      reinc = (count || 0) > 0
    } catch { /* offline: segue sem checar */ }
    salvarFila('oc:' + id, 'plt_ocorrencias', {
      ...base, setor_id: s.id, setor_nome: s.nome, item_id: it.id, item_texto: it.texto, tipo: s.nome, prioridade: 'media', identificado_por: userName,
      identificado_em: new Date().toISOString(), status: 'identificado', reincidente: reinc,
    })
    auditar('ocorrencia', id, 'Ocorrência gerada pelo checklist', null, { item: it.texto, setor: s.nome, loja: plantao.loja }, userName)
    setOc(o => ({ ...o, [it.id]: { id, prioridade: 'media', status: 'identificado', numero: 0, rnc_numero: null } }))
  }

  const gravar = (s: Setor, it: Item, patch: Partial<Resposta>) => {
    const atual: Resposta = resp[it.id] || { plantao_id: plantao.id, setor_id: s.id, item_id: it.id, resposta: 'conforme', obs: null, evidencias: [], sem_evidencia: null }
    const novo: Resposta = { ...atual, ...patch, plantao_id: plantao.id, setor_id: s.id, item_id: it.id, updated_by: userName }
    if (novo.resposta !== 'nao_conforme') { /* Conforme/N.A.: não exige texto */ }
    setResp(m => ({ ...m, [it.id]: novo }))
    salvarFila('r:' + plantao.id + ':' + it.id, 'plt_respostas', { ...novo, updated_at: new Date().toISOString() }, 'plantao_id,item_id')
    if (valida(novo)) void registrarOcorrencia(s, it, novo)
  }

  const pendentes = Object.values(oc).filter(o => o.status !== 'concluido').length
  const todos = plantao.estrutura.flatMap(s => s.itens)
  const incompletos = todos.filter(i => !completo(resp[i.id]))
  const feitos = todos.length - incompletos.length

  const encerrar = async () => {
    if (incompletos.length) return alert('Para encerrar, todas as etapas precisam de foto/vídeo (N/A: justificativa). Faltam ' + incompletos.length + ':\n• ' + incompletos.slice(0, 8).map(i => i.texto).join('\n• '))
    setEncerrando(true)
    await sincronizarFila()
    if (filaTamanho() > 0) { setEncerrando(false); return alert('Ainda há registros aguardando conexão para sincronizar. Conecte-se e tente encerrar novamente — nada foi perdido.') }
    const saida = new Date().toISOString()
    const { data, error } = await sb.from('plt_plantoes').update({ status: 'encerrado', saida_em: saida, parecer: parecer.trim() || null, conformidade: conf.pct }).eq('id', plantao.id).select('*').single()
    setEncerrando(false)
    if (error) return alert('Falha ao encerrar: ' + error.message)
    if (plantao.escala_id) await sb.from('plt_escala').update({ status: 'realizado', updated_at: saida }).eq('id', plantao.escala_id)
    auditar('plantao', plantao.id, 'Plantão encerrado', { status: 'em_andamento' }, { status: 'encerrado', conformidade: conf.pct, ocorrencias_pendentes: pendentes }, userName)
    setFim(data)
  }

  if (fim) {
    const link = `${siteOrigin()}/plantao-relatorio.html?id=${fim.id}`
    const msg = `📋 *Plantão de Gestão — ${fim.loja}*\nConformidade: ${fim.conformidade ?? '—'}%\nRelatório completo: ${link}`
    return (
      <div style={{ ...card, display: 'grid', gap: 10 }}>
        <div style={{ fontWeight: 800, fontSize: 17 }}>✅ Visita encerrada — {fim.loja}</div>
        <div style={{ fontSize: 13.5 }}>Saída registrada em {fmtDH(fim.saida_em)}. {pendentes > 0 ? `⚠️ ${pendentes} ocorrência(s) seguem pendentes e continuam em acompanhamento — o plantão só termina quando os desvios forem tratados.` : 'Nenhuma ocorrência pendente.'}</div>
        <a href={link} target="_blank" rel="noreferrer" style={{ color: 'var(--bordo)', fontWeight: 700 }}>Abrir relatório final ↗</a>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Btn tone="ghost" onClick={() => { void navigator.clipboard?.writeText(msg); alert('Mensagem com o link copiada.') }}>Copiar mensagem com link</Btn>
          <Btn tone="ghost" onClick={() => window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank')}>Compartilhar no WhatsApp</Btn>
          <Btn onClick={onVoltar}>Concluir</Btn>
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>O envio à gestão é manual por link (nenhuma mensagem é disparada automaticamente sem validação).</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ ...card, position: 'sticky', top: 0, zIndex: 5 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 800 }}>{plantao.loja} · plantão nº {plantao.numero}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Chegada {fmtDH(plantao.chegada_em)} · 👥 {plantao.integrantes.join(' + ')} · checklist v{plantao.versao}</div>
          </div>
          <Btn tone="ghost" small onClick={onVoltar}>← Voltar</Btn>
        </div>
        <div style={{ height: 8, borderRadius: 99, background: 'var(--border)', margin: '8px 0 4px', overflow: 'hidden' }}>
          <div style={{ width: `${conf.total ? (feitos / conf.total) * 100 : 0}%`, height: '100%', background: 'var(--bordo)' }} />
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
          <span>{feitos}/{conf.total} etapas com evidência · conformidade {conf.pct ?? '—'}%</span>
          <span>{fila > 0 ? `🕓 ${fila} registro(s) aguardando conexão` : '💾 Salvo automaticamente'}</span>
        </div>
      </div>

      {plantao.estrutura.map((s, idx) => {
        const itens = s.itens
        const feitos = itens.filter(i => completo(resp[i.id])).length
        const nc = itens.filter(i => resp[i.id]?.resposta === 'nao_conforme').length
        const open = aberto === s.id
        return (
          <div key={s.id} style={card}>
            <div onClick={() => setAberto(open ? null : s.id)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', gap: 8 }}>
              <div style={{ fontWeight: 800, fontSize: 14.5 }}>{String(idx + 1).padStart(2, '0')} · {s.nome}</div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {nc > 0 && <Pill cor="#dc2626">{nc} desvio(s)</Pill>}
                <Pill cor={feitos === itens.length ? '#16a34a' : '#6b7280'}>{feitos}/{itens.length}</Pill>
                <span>{open ? '▲' : '▼'}</span>
              </div>
            </div>
            {open && (
              <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
                {itens.map(it => {
                  const r = resp[it.id]
                  const o = oc[it.id]
                  return (
                    <div key={it.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 10, background: 'var(--bg)' }}>
                      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{it.texto}</div>
                      {it.tipo === 'nome' && (
                        <div>
                          <input value={r?.obs || ''} onChange={e => { gravar(s, it, { resposta: 'na', obs: e.target.value }); void sb.from('plt_plantoes').update({ responsavel_loja: e.target.value.trim() || null }).eq('id', plantao.id) }} placeholder="Nome do gestor / líder da loja" style={inp} />
                          {!completo(r) && <div style={{ fontSize: 12.5, color: '#dc2626', fontWeight: 700, marginTop: 4 }}>⚠️ Informe o nome do responsável da loja.</div>}
                        </div>
                      )}
                      {it.tipo !== 'nome' && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                        {([['conforme', '✅ Conforme', '#16a34a'], ['nao_conforme', '❌ Não conforme', '#dc2626'], ['na', '➖ N/A', '#6b7280']] as const).map(([v, t, cor]) => (
                          <button key={v} onClick={() => gravar(s, it, { resposta: v })}
                            style={{ padding: '12px 4px', borderRadius: 10, border: `2px solid ${r?.resposta === v ? cor : 'var(--border)'}`, background: r?.resposta === v ? cor : 'var(--card, #fff)', color: r?.resposta === v ? '#fff' : 'var(--text)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{t}</button>
                        ))}
                      </div>}
                      {r && it.tipo !== 'nome' && (
                        <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
                          <div>
                            <label style={lbl}>{r.resposta === 'nao_conforme' ? 'Justificativa (obrigatória)' : r.resposta === 'na' ? 'Por que não se aplica? (obrigatório)' : 'Observação (opcional)'}</label>
                            <textarea value={r.obs || ''} onChange={e => gravar(s, it, { obs: e.target.value })} rows={2} style={{ ...inp, resize: 'vertical' }} placeholder={r.resposta === 'nao_conforme' ? 'Descreva o desvio encontrado…' : ''} />
                          </div>
                          {it.semEv && <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>ℹ️ Informado pelo líder/gestor da loja — não precisa de foto.</div>}
                          {r.resposta !== 'na' && !it.semEv && it.tipo !== 'nome' && (
                            <Evidencias urls={r.evidencias || []} onChange={u => gravar(s, it, { evidencias: u })} rotulo={r.resposta === 'nao_conforme' ? '📷 Foto / vídeo do desvio (obrigatório)' : (plantao.estrutura.find(x => x.itens.some(i => i.id === it.id))?.evObrig ? '📷 Foto / vídeo desta etapa (obrigatório)' : '📷 Foto / vídeo (opcional)')} />
                          )}
                          {!completo(r) && <div style={{ fontSize: 12.5, color: '#dc2626', fontWeight: 700 }}>⚠️ {r.resposta === 'na' ? 'Falta a justificativa.' : r.resposta === 'nao_conforme' ? 'Falta a justificativa e a foto/vídeo do desvio.' : 'Falta a foto/vídeo desta etapa.'}</div>}
                          {o && (
                            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: 8, fontSize: 13 }}>
                              🚨 Ocorrência registrada{o.numero ? ` nº ${o.numero}` : ''} {o.rnc_numero ? `· RNC ${o.rnc_numero}` : ''}
                              <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                                <select value={o.prioridade} onChange={e => { const p = e.target.value; setOc(m => ({ ...m, [it.id]: { ...m[it.id], prioridade: p } })); salvarFila('oc:' + o.id, 'plt_ocorrencias', { id: o.id, plantao_id: plantao.id, loja: plantao.loja, descricao: (r.obs || '').trim() || '—', prioridade: p, updated_at: new Date().toISOString() }); auditar('ocorrencia', o.id, 'Prioridade alterada', { prioridade: o.prioridade }, { prioridade: p }, userName) }} style={{ ...inp, width: 'auto', padding: '6px 8px', fontSize: 13 }}>
                                  {PRIORIDADES.map(p => <option key={p.id} value={p.id}>{p.emoji} {p.label}</option>)}
                                </select>
                                {o.prioridade === 'critica' && <Pill cor="#dc2626">Crítica → abrir RNC agora</Pill>}
                                <Btn small tone="ghost" onClick={() => onAbrirOcorrencia(o.id)}>Tratativa / RNC →</Btn>
                              </div>
                              {o.status !== 'identificado' && <div style={{ marginTop: 4 }}><Pill cor="#7c3aed">{o.status}</Pill> <span style={{ color: prio(o.prioridade).cor }} /></div>}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      <div style={card}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>🏁 Encerrar visita</div>
        {pendentes > 0 && <div style={{ fontSize: 13, marginBottom: 8 }}>⚠️ {pendentes} ocorrência(s) pendente(s). Encerrar o checklist <b>não</b> encerra nem altera as ocorrências — elas seguem em acompanhamento.</div>}
        <label style={lbl}>Parecer da gestão sobre a visita</label>
        <textarea value={parecer} onChange={e => setParecer(e.target.value)} rows={3} style={{ ...inp, marginBottom: 10 }} placeholder="Resumo geral, pontos fortes, riscos para o fim de semana…" />
        <Btn tone="ok" onClick={encerrar} disabled={encerrando}>{encerrando ? 'Encerrando…' : 'Registrar saída e encerrar visita'}</Btn>
      </div>
    </div>
  )
}
