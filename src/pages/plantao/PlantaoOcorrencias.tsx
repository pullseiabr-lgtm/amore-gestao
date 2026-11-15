import { useCallback, useEffect, useMemo, useState } from 'react'
import { siteOrigin } from '../../lib/site'
import { sb, auditar, atrasada, fmtDH, prio, PRIORIDADES, STATUS_OC, stOc, addDias } from './plantaoLib'
import type { Ocorrencia, PltConfig } from './plantaoLib'
import { Btn, Evidencias, Midias, Modal, Pill, card, grid, inp, lbl } from './plantaoUi'

type Props = { cfg: PltConfig; lojas: string[]; userName: string; nomes: string[]; setores: string[]; modo: 'ocorrencias' | 'tratativas'; foco?: string | null; onFoco: (id: string | null) => void }

const CATEGORIA_RNC = (setor: string) => {
  const s = (setor || '').toLowerCase()
  if (/estoque|bebida/.test(s)) return 'Estoque, recebimento e compras'
  if (/cozinha|produ|mise/.test(s)) return 'Cozinha e produção'
  if (/limpeza/.test(s)) return 'Limpeza e segurança alimentar'
  if (/estrutura|manuten/.test(s)) return 'Estrutura e manutenção'
  if (/equipe|atendimento|frente/.test(s)) return 'Salão e atendimento'
  if (/chegada/.test(s)) return 'Abertura e fechamento da loja'
  return 'Gestão e comportamento operacional'
}

export default function PlantaoOcorrencias({ cfg, lojas, userName, nomes, setores, modo, foco, onFoco }: Props) {
  const [lista, setLista] = useState<Ocorrencia[]>([])
  const [carregando, setCarregando] = useState(true)
  const [f, setF] = useState({ loja: '', setor: '', prio: '', status: '', resp: '', quem: '', de: '', ate: '', rnc: '', q: '', card: '' })
  const carregar = useCallback(async () => {
    const { data } = await sb.from('plt_ocorrencias').select('*').order('numero', { ascending: false }).limit(1000)
    setLista(data || []); setCarregando(false)
  }, [])
  useEffect(() => { void carregar() }, [carregar])

  const base = modo === 'tratativas' ? lista.filter(o => o.resp_nome) : lista
  const cont = useMemo(() => ({
    abertas: base.filter(o => ['identificado', 'encaminhado'].includes(o.status)).length,
    andamento: base.filter(o => o.status === 'em_execucao').length,
    validacao: base.filter(o => o.status === 'aguardando_validacao').length,
    concluidas: base.filter(o => o.status === 'concluido').length,
    atrasadas: base.filter(atrasada).length,
    reincidentes: base.filter(o => o.reincidente).length,
  }), [base])

  const filtrada = base.filter(o => {
    if (f.loja && o.loja !== f.loja) return false
    if (f.setor && o.setor_nome !== f.setor) return false
    if (f.prio && o.prioridade !== f.prio) return false
    if (f.status && o.status !== f.status) return false
    if (f.resp && o.resp_nome !== f.resp) return false
    if (f.quem && o.identificado_por !== f.quem) return false
    if (f.de && o.identificado_em.slice(0, 10) < f.de) return false
    if (f.ate && o.identificado_em.slice(0, 10) > f.ate) return false
    if (f.rnc === 'com' && !o.rnc_id) return false
    if (f.rnc === 'sem' && o.rnc_id) return false
    if (f.q && !(`${o.descricao} ${o.item_texto} ${o.numero}`.toLowerCase().includes(f.q.toLowerCase()))) return false
    switch (f.card) {
      case 'abertas': return ['identificado', 'encaminhado'].includes(o.status)
      case 'andamento': return o.status === 'em_execucao'
      case 'validacao': return o.status === 'aguardando_validacao'
      case 'concluidas': return o.status === 'concluido'
      case 'atrasadas': return atrasada(o)
      case 'reincidentes': return o.reincidente
    }
    return true
  })

  const detalhe = lista.find(o => o.id === foco) || null
  const cards: [string, string, number, string][] = [['abertas', 'Abertas', cont.abertas, '#dc2626'], ['andamento', 'Em andamento', cont.andamento, '#2563eb'], ['validacao', 'Aguard. validação', cont.validacao, '#ca8a04'], ['concluidas', 'Concluídas', cont.concluidas, '#16a34a'], ['atrasadas', 'Atrasadas', cont.atrasadas, '#b91c1c'], ['reincidentes', 'Reincidentes', cont.reincidentes, '#7c2d12']]
  const sel = (k: keyof typeof f, v: string[], vazio: string) => (
    <select value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} style={inp}><option value="">{vazio}</option>{v.map(x => <option key={x} value={x}>{x}</option>)}</select>
  )

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={grid(130)}>
        {cards.map(([k, t, n, cor]) => (
          <div key={k} onClick={() => setF({ ...f, card: f.card === k ? '' : k })} style={{ ...card, cursor: 'pointer', borderColor: f.card === k ? cor : 'var(--border)', borderWidth: f.card === k ? 2 : 1 }}>
            <div style={{ fontSize: 26, fontWeight: 900, color: cor }}>{n}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>{t}</div>
          </div>
        ))}
      </div>
      <div style={{ ...card, ...grid(150) }}>
        <input value={f.q} onChange={e => setF({ ...f, q: e.target.value })} placeholder="🔎 Buscar…" style={inp} />
        {sel('loja', lojas, 'Todas as lojas')}
        {sel('setor', setores, 'Todos os setores')}
        {sel('prio', PRIORIDADES.map(p => p.id), 'Qualquer prioridade')}
        {sel('status', STATUS_OC.map(s => s.id), 'Qualquer status')}
        {sel('resp', nomes, 'Qualquer responsável')}
        {sel('quem', cfg.equipe, 'Quem identificou')}
        <select value={f.rnc} onChange={e => setF({ ...f, rnc: e.target.value })} style={inp}><option value="">RNC: todas</option><option value="com">Com RNC</option><option value="sem">Sem RNC</option></select>
        <input type="date" value={f.de} onChange={e => setF({ ...f, de: e.target.value })} style={inp} title="De" />
        <input type="date" value={f.ate} onChange={e => setF({ ...f, ate: e.target.value })} style={inp} title="Até" />
      </div>
      {carregando ? <div style={{ color: 'var(--muted)', padding: 12 }}>Carregando…</div> : filtrada.length === 0 ? <div style={{ ...card, color: 'var(--muted)' }}>Nenhum registro com esses filtros.</div> : (
        <div style={grid(300)}>
          {filtrada.map(o => (
            <div key={o.id} onClick={() => onFoco(o.id)} style={{ ...card, cursor: 'pointer', borderLeft: `5px solid ${prio(o.prioridade).cor}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' }}>
                <b>#{o.numero} · {o.loja}</b>
                <Pill cor={stOc(o.status).cor}>{stOc(o.status).label}</Pill>
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{o.setor_nome} · {fmtDH(o.identificado_em)} · {o.identificado_por}</div>
              <div style={{ fontSize: 13.5, margin: '6px 0' }}>{o.item_texto ? <b>{o.item_texto}: </b> : null}{o.descricao.slice(0, 140)}</div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                <Pill cor={prio(o.prioridade).cor}>{prio(o.prioridade).emoji} {prio(o.prioridade).label}</Pill>
                {atrasada(o) && <Pill cor="#b91c1c">⏰ Atrasada</Pill>}
                {o.reincidente && <Pill cor="#7c2d12">🔁 Reincidente</Pill>}
                {o.rnc_numero && <Pill cor="#0f766e">RNC {o.rnc_numero}</Pill>}
                {o.resp_nome && <Pill cor="#4b5563">👤 {o.resp_nome}</Pill>}
              </div>
            </div>
          ))}
        </div>
      )}
      {detalhe && <Detalhe o={detalhe} cfg={cfg} userName={userName} nomes={nomes} setores={setores} onClose={() => onFoco(null)} onMudou={carregar} />}
    </div>
  )
}

function Detalhe({ o, cfg, userName, nomes, setores, onClose, onMudou }: { o: Ocorrencia; cfg: PltConfig; userName: string; nomes: string[]; setores: string[]; onClose: () => void; onMudou: () => Promise<void> }) {
  const [hist, setHist] = useState<{ id: string; acao: string; usuario: string; quando: string; antes: unknown; depois: unknown }[]>([])
  const [trat, setTrat] = useState(false)
  const [busy, setBusy] = useState(false)
  const [t, setT] = useState({ setor: o.resp_setor || o.setor_nome || '', resp: o.resp_nome || '', acao: o.acao || '', prazo: '', prioridade: o.prioridade, evid: o.evid_inicial || [], aprov: o.exige_aprovacao, obs: o.obs_gestao || '' })
  const [concl, setConcl] = useState({ obs: '', evid: [] as string[] })

  const carregarHist = useCallback(async () => {
    const { data } = await sb.from('plt_auditoria').select('*').eq('entidade_id', o.id).order('quando', { ascending: false })
    setHist(data || [])
  }, [o.id])
  useEffect(() => { void carregarHist() }, [carregarHist])

  // prazo padrão pela prioridade (editável) + responsável padrão da competência
  useEffect(() => {
    if (!t.prazo) setT(x => ({ ...x, prazo: new Date(addDias(cfg.prazos[x.prioridade] ?? 2)).toISOString().slice(0, 16) }))
  }, []) // eslint-disable-line
  const mudaPrio = (p: string) => setT(x => ({ ...x, prioridade: p, prazo: new Date(addDias(cfg.prazos[p] ?? 2)).toISOString().slice(0, 16) }))
  const mudaSetor = (s: string) => setT(x => ({ ...x, setor: s, resp: x.resp || cfg.responsaveis[s] || '' }))

  const atualizar = async (patch: Record<string, unknown>, acao: string) => {
    setBusy(true)
    const antes: Record<string, unknown> = {}
    for (const k of Object.keys(patch)) antes[k] = (o as unknown as Record<string, unknown>)[k]
    const { error } = await sb.from('plt_ocorrencias').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', o.id)
    setBusy(false)
    if (error) return alert('Falha ao salvar: ' + error.message)
    auditar('ocorrencia', o.id, acao, antes, patch, userName)
    await onMudou(); setTimeout(() => { void carregarHist() }, 800)
  }

  const solicitar = async () => {
    if (!t.resp) return alert('Informe o responsável pela execução.')
    if (!t.prazo) return alert('Informe o prazo.')
    if (!t.acao.trim()) return alert('Descreva a ação a ser executada.')
    await atualizar({ resp_setor: t.setor || null, resp_nome: t.resp, acao: t.acao.trim(), prazo: new Date(t.prazo).toISOString(), prioridade: t.prioridade, evid_inicial: t.evid, exige_aprovacao: t.aprov, obs_gestao: t.obs.trim() || null, status: o.status === 'identificado' ? 'encaminhado' : o.status, encaminhado_em: o.encaminhado_em || new Date().toISOString() }, 'Tratativa solicitada')
    setTrat(false)
  }

  const abrirRnc = async () => {
    if (o.rnc_id) return
    if (!confirm('Abrir uma RNC (Central de Tarefas) a partir desta ocorrência? As evidências e o histórico do plantão serão importados.')) return
    setBusy(true)
    const setor = o.resp_setor || o.setor_nome || 'Operação'
    const prazo = (o.prazo ? new Date(o.prazo) : new Date(addDias(cfg.prazos[o.prioridade] ?? 2))).toISOString().slice(0, 10)
    const { data: nova, error } = await sb.from('rnc').insert({
      origem: 'operacao', loja: o.loja, setor, categoria: CATEGORIA_RNC(o.setor_nome || ''), tipos: ['Operação', 'Plantão de Gestão', ...(o.reincidente ? ['Reincidência'] : [])],
      gravidade: o.prioridade, status: o.reincidente ? 'reincidente' : 'aberta', titulo: `[Plantão] ${o.item_texto || o.setor_nome || 'Desvio'} — ${o.loja}`.slice(0, 140),
      desvio_txt: o.descricao, tratativa_obs: o.obs_gestao || null, acao_imediata: null, acao_corretiva: o.acao || null,
      responsavel: o.resp_nome || userName, responsavel_area: setor, prazo, aberto_por: userName, validador: null, acompanhantes: [], reincidente_de: null, produto: null,
      plantao_id: o.plantao_id, plt_ocorrencia_id: o.id,
    }).select('id, numero').single()
    if (error || !nova) { setBusy(false); return alert('Falha ao abrir a RNC: ' + (error?.message || 'sem resposta')) }
    const log = (acao: string, detalhe: string) => sb.from('rnc_historico').insert({ rnc_id: nova.id, acao, detalhe, usuario: userName })
    await log('RNC aberta a partir do Plantão de Gestão', `Ocorrência #${o.numero} · ${o.loja} · ${o.setor_nome} · identificada por ${o.identificado_por} em ${fmtDH(o.identificado_em)}`)
    for (const h of [...hist].reverse()) await log('Histórico do plantão: ' + h.acao, `${h.usuario || ''} em ${fmtDH(h.quando)}`)
    if (o.acao) await log('Correção solicitada', o.acao)
    for (const u of [...(o.evidencias || []), ...(o.evid_inicial || [])]) {
      await sb.from('rnc_evidencias').insert({ rnc_id: nova.id, tipo: /\.(mp4|mov|webm|3gp)(\?|$)/i.test(u) ? 'Vídeo' : 'Foto do problema', arquivo_url: u, descricao: 'Importada do Plantão de Gestão', usuario: userName })
    }
    await sb.from('plt_ocorrencias').update({ rnc_id: nova.id, rnc_numero: nova.numero, updated_at: new Date().toISOString() }).eq('id', o.id)
    auditar('ocorrencia', o.id, 'RNC aberta', null, { rnc: nova.numero }, userName)
    setBusy(false); await onMudou(); void carregarHist()
    if (confirm(`RNC ${nova.numero} aberta. Abrir agora na Central de Tarefas?`)) window.open(`${siteOrigin()}/?page=tarefas&rnc=${nova.id}`, '_blank')
  }

  const p = prio(o.prioridade)
  const emAtraso = atrasada(o)
  return (
    <Modal titulo={`Ocorrência #${o.numero} · ${o.loja}`} onClose={onClose}>
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          <Pill cor={stOc(o.status).cor}>{stOc(o.status).label}</Pill>
          <Pill cor={p.cor}>{p.emoji} {p.label}</Pill>
          {emAtraso && <Pill cor="#b91c1c">⏰ Prazo vencido</Pill>}
          {o.reincidente && <Pill cor="#7c2d12">🔁 Reincidente (loja + setor + tipo)</Pill>}
          {o.rnc_numero && <Pill cor="#0f766e">RNC {o.rnc_numero}</Pill>}
        </div>
        <div style={{ fontSize: 13 }}><b>{o.setor_nome}</b>{o.item_texto ? ` · ${o.item_texto}` : ''}<br />Identificada por {o.identificado_por} em {fmtDH(o.identificado_em)}</div>
        <div style={{ ...card, background: 'var(--bg)', fontSize: 14 }}>{o.descricao}{o.sem_evidencia ? <div style={{ marginTop: 6, fontSize: 12.5, color: 'var(--muted)' }}>Sem evidência — justificativa: {o.sem_evidencia}</div> : null}</div>
        <Midias urls={o.evidencias || []} />
        {o.resp_nome && (
          <div style={{ ...card, background: 'var(--bg)', fontSize: 13.5 }}>
            <b>🛠 Tratativa:</b> {o.acao}<br />Responsável: <b>{o.resp_nome}</b>{o.resp_setor ? ` (${o.resp_setor})` : ''} · prazo {fmtDH(o.prazo)}{o.exige_aprovacao ? ' · exige aprovação' : ''}
            {o.obs_gestao && <div style={{ color: 'var(--muted)' }}>Obs. da gestão: {o.obs_gestao}</div>}
            <Midias urls={o.evid_inicial || []} />
          </div>
        )}
        {(o as unknown as { devolutiva?: string }).devolutiva && (
          <div style={{ ...card, background: '#f0fdf4' }}>
            <b>↩ Devolutiva de {(o as unknown as { devolutiva_por?: string }).devolutiva_por}</b> · {fmtDH((o as unknown as { devolutiva_em?: string }).devolutiva_em)}<div>{(o as unknown as { devolutiva?: string }).devolutiva}</div>
            <Midias urls={(o as unknown as { devolutiva_evid?: string[] }).devolutiva_evid || []} />
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Btn small tone="ghost" onClick={() => window.open(`${siteOrigin()}/plantao-tratativa.html?o=${o.id}`, '_blank')}>📄 Página da tratativa / devolutiva</Btn>
          <Btn small tone="ghost" onClick={() => { void navigator.clipboard?.writeText(`${siteOrigin()}/plantao-tratativa.html?o=${o.id}`); alert('Link da tratativa copiado.') }}>Copiar link</Btn>
        </div>
        {o.status === 'concluido' && <div style={{ ...card, background: '#f0fdf4' }}>✅ Concluída em {fmtDH(o.concluido_em)} por {o.concluido_por}{o.obs_conclusao ? ` — ${o.obs_conclusao}` : ''}<Midias urls={o.evid_conclusao || []} /></div>}

        {o.status !== 'concluido' && !trat && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Btn onClick={() => setTrat(true)} disabled={busy}>{o.resp_nome ? '✏️ Editar tratativa' : '📨 Solicitar tratativa'}</Btn>
            {o.status === 'encaminhado' && <Btn tone="ghost" onClick={() => atualizar({ status: 'em_execucao' }, 'Status: em execução')} disabled={busy}>▶️ Iniciar execução</Btn>}
            {['encaminhado', 'em_execucao'].includes(o.status) && <Btn tone="ghost" onClick={() => atualizar({ status: 'aguardando_validacao' }, 'Status: aguardando validação')} disabled={busy}>📤 Enviar p/ validação</Btn>}
            {!o.rnc_id && (o.prioridade === 'critica' || o.prioridade === 'alta' || o.reincidente) && <Btn tone="danger" onClick={abrirRnc} disabled={busy}>🚫 Abrir RNC</Btn>}
          </div>
        )}
        {o.status !== 'concluido' && !trat && !o.rnc_id && !(o.prioridade === 'critica' || o.prioridade === 'alta' || o.reincidente) && <div><Btn small tone="ghost" onClick={abrirRnc} disabled={busy}>Abrir RNC mesmo assim</Btn></div>}

        {trat && (
          <div style={{ ...card, display: 'grid', gap: 8 }}>
            <div style={{ fontWeight: 800 }}>📨 Solicitar tratativa</div>
            <div style={grid(200)}>
              <div><label style={lbl}>Setor responsável</label><select value={t.setor} onChange={e => mudaSetor(e.target.value)} style={inp}><option value="">—</option>{setores.map(s => <option key={s}>{s}</option>)}</select></div>
              <div><label style={lbl}>Responsável pela execução *</label><select value={t.resp} onChange={e => setT({ ...t, resp: e.target.value })} style={inp}><option value="">—</option>{nomes.map(s => <option key={s}>{s}</option>)}</select></div>
              <div><label style={lbl}>Prioridade</label><select value={t.prioridade} onChange={e => mudaPrio(e.target.value)} style={inp}>{PRIORIDADES.map(x => <option key={x.id} value={x.id}>{x.emoji} {x.label}</option>)}</select></div>
              <div><label style={lbl}>Prazo *</label><input type="datetime-local" value={t.prazo} onChange={e => setT({ ...t, prazo: e.target.value })} style={inp} /></div>
            </div>
            <div><label style={lbl}>Descrição da ação *</label><textarea rows={3} value={t.acao} onChange={e => setT({ ...t, acao: e.target.value })} style={inp} /></div>
            <Evidencias urls={t.evid} onChange={u => setT({ ...t, evid: u })} rotulo="📷 Evidência inicial" />
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}><input type="checkbox" checked={t.aprov} onChange={e => setT({ ...t, aprov: e.target.checked })} /> Necessita aprovação da gestão para concluir</label>
            <div><label style={lbl}>Observação da gestão</label><input value={t.obs} onChange={e => setT({ ...t, obs: e.target.value })} style={inp} /></div>
            <div style={{ display: 'flex', gap: 8 }}><Btn onClick={solicitar} disabled={busy}>Encaminhar</Btn><Btn tone="ghost" onClick={() => setTrat(false)}>Cancelar</Btn></div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>O responsável é acionado pelo painel; nenhum WhatsApp é disparado automaticamente nesta fase.</div>
          </div>
        )}

        {o.status === 'aguardando_validacao' && (
          <div style={{ ...card, display: 'grid', gap: 8 }}>
            <div style={{ fontWeight: 800 }}>✅ Validar e concluir</div>
            <textarea rows={2} value={concl.obs} onChange={e => setConcl({ ...concl, obs: e.target.value })} placeholder="Como foi resolvido / observação" style={inp} />
            <Evidencias urls={concl.evid} onChange={u => setConcl({ ...concl, evid: u })} rotulo="📷 Evidência da conclusão" />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Btn tone="ok" disabled={busy} onClick={() => atualizar({ status: 'concluido', concluido_em: new Date().toISOString(), concluido_por: userName, obs_conclusao: concl.obs.trim() || null, evid_conclusao: concl.evid }, 'Tratativa concluída')}>Concluir</Btn>
              <Btn tone="ghost" disabled={busy} onClick={() => atualizar({ status: 'em_execucao' }, 'Devolvida p/ execução')}>↩ Devolver para execução</Btn>
            </div>
          </div>
        )}
        {o.status === 'concluido' && <Btn tone="ghost" small onClick={() => confirm('Reabrir esta ocorrência?') && atualizar({ status: 'em_execucao', concluido_em: null, concluido_por: null }, 'Reaberta')}>↩ Reabrir</Btn>}

        <div>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 4 }}>🧾 Histórico de alterações</div>
          {hist.length === 0 ? <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Sem registros.</div> : hist.map(h => (
            <div key={h.id} style={{ fontSize: 12.5, borderBottom: '1px solid var(--border)', padding: '4px 0' }}>
              <b>{h.acao}</b> · {h.usuario} · {fmtDH(h.quando)}
              {h.antes != null && h.depois != null ? <div style={{ color: 'var(--muted)' }}>antes: {JSON.stringify(h.antes)} → depois: {JSON.stringify(h.depois)}</div> : null}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  )
}
