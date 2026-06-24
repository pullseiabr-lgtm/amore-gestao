import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Plus, Edit2, Trash2, Loader2, CheckCircle2, Camera, MapPin,
  Star, ClipboardCheck, Play, RefreshCw, Save, X, Sparkles,
} from 'lucide-react'
import { useLoja } from '../../contexts/LojaContext'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../hooks/useToast'
import Modal from '../../components/ui/Modal'
import {
  fetchChecklistModelos, insertChecklistModelo, updateChecklistModelo, deleteChecklistModelo,
  fetchChecklistExecucoes, fetchChecklistExecucoesRange, insertChecklistExecucao, updateChecklistExecucao,
  uploadAnexo,
} from '../../lib/db'
import { gerarItensIA, validarFotoIA } from '../../lib/checklistIa'
import { enviarWhatsApp, getZapiCfg, carregarZapiCfgRemoto } from '../../lib/notify'
import type {
  ChecklistModelo, ChecklistExecucao, ChecklistItem, ChecklistResposta,
  ChecklistItemTipo, ChecklistRecorrencia, ChecklistTurno,
} from '../../types/database'

// ── Constantes ───────────────────────────────────────────────
const TURNOS: { v: ChecklistTurno; lbl: string }[] = [
  { v: 'abertura', lbl: '🌅 Abertura' },
  { v: 'almoco', lbl: '☀️ Almoço' },
  { v: 'jantar', lbl: '🌙 Jantar' },
  { v: 'fechamento', lbl: '🌃 Fechamento' },
  { v: 'qualquer', lbl: '⏱️ Qualquer' },
]
const RECORRENCIAS: { v: ChecklistRecorrencia; lbl: string }[] = [
  { v: 'diario', lbl: 'Diário' },
  { v: 'semanal', lbl: 'Semanal' },
  { v: 'mensal', lbl: 'Mensal' },
  { v: 'avulso', lbl: 'Avulso (manual)' },
]
const TIPOS: { v: ChecklistItemTipo; lbl: string; emoji: string }[] = [
  { v: 'confirm', lbl: 'Confirmação', emoji: '✔️' },
  { v: 'numero', lbl: 'Número', emoji: '🔢' },
  { v: 'foto', lbl: 'Foto', emoji: '📷' },
  { v: 'avaliacao', lbl: 'Avaliação (1-5)', emoji: '⭐' },
]
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const SETORES = ['Geral', 'Cozinha', 'Bar', 'Salão', 'Estoque', 'Limpeza', 'Produção', 'Caixa']

const hoje = () => new Date().toISOString().slice(0, 10)
const turnoLbl = (t: string) => TURNOS.find(x => x.v === t)?.lbl || t

// Um modelo "vale para hoje"? (recorrência + dia + turno)
function aplicaHoje(m: ChecklistModelo): boolean {
  if (!m.ativo) return false
  const d = new Date()
  if (m.recorrencia === 'diario') return true
  if (m.recorrencia === 'semanal') return (m.dias_semana || []).includes(d.getDay())
  if (m.recorrencia === 'mensal') return m.dia_mes === d.getDate()
  return false // avulso → só manual
}

// Item respondido de forma satisfatória?
function itemOk(item: ChecklistItem, r?: ChecklistResposta): boolean {
  if (!r) return false
  switch (item.tipo) {
    case 'confirm': return r.ok === true
    case 'numero': return r.valor !== null && r.valor !== undefined
    case 'foto': return !!r.foto_url
    case 'avaliacao': return (r.nota || 0) > 0
  }
}

// Score de compliance 0..100 (peso, crítico vale dobro, atraso -20%)
function calcScore(itens: ChecklistItem[], respostas: ChecklistResposta[], atrasado: boolean): number {
  const obrig = itens.filter(i => i.obrigatorio)
  if (obrig.length === 0) {
    const total = itens.length || 1
    const ok = itens.filter(i => itemOk(i, respostas.find(r => r.item_id === i.id))).length
    let s = Math.round((ok / total) * 100)
    if (atrasado) s = Math.round(s * 0.8)
    return s
  }
  const pesoDe = (i: ChecklistItem) => (i.peso || 1) * (i.critico ? 2 : 1)
  const totalPeso = obrig.reduce((a, i) => a + pesoDe(i), 0)
  const okPeso = obrig.reduce((a, i) => a + (itemOk(i, respostas.find(r => r.item_id === i.id)) ? pesoDe(i) : 0), 0)
  let s = Math.round((okPeso / totalPeso) * 100)
  if (atrasado) s = Math.round(s * 0.8)
  return Math.max(0, Math.min(100, s))
}

const scoreColor = (s: number | null) =>
  s == null ? 'var(--muted)' : s >= 90 ? '#16a34a' : s >= 70 ? '#f59e0b' : '#ef4444'

// ── Componente principal ─────────────────────────────────────
export default function ChecklistsPage() {
  const { loja, lojas } = useLoja()
  const { user } = useAuth()
  const { toast } = useToast()

  const [tab, setTab] = useState<'hoje' | 'painel' | 'modelos'>('hoje')
  const [modelos, setModelos] = useState<ChecklistModelo[]>([])
  const [execucoes, setExecucoes] = useState<ChecklistExecucao[]>([])
  const [loading, setLoading] = useState(true)
  const [gerando, setGerando] = useState(false)

  // Modal de modelo
  const [modeloEdit, setModeloEdit] = useState<ChecklistModelo | null>(null)
  const [showModeloModal, setShowModeloModal] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [ms, es] = await Promise.all([
        fetchChecklistModelos(loja),
        fetchChecklistExecucoes(loja, hoje()),
      ])
      setModelos(ms)
      setExecucoes(es)
    } finally { setLoading(false) }
  }, [loja])

  useEffect(() => { load() }, [load])

  // Gera as execuções do dia para os modelos aplicáveis ainda sem instância hoje
  const gerarHoje = async () => {
    setGerando(true)
    try {
      // Alvos: a loja ativa, ou TODAS as lojas (quando admin está em "Todas as Lojas")
      const alvos = loja === 'Todas as Lojas' ? lojas.filter(l => l && l !== 'Todas as Lojas') : [loja]
      if (!alvos.length) { toast('Nenhuma loja disponível.', 'info'); return }
      const jaTem = new Set(execucoes.map(e => `${e.modelo_id}|${e.loja}`))
      let criados = 0
      for (const lj of alvos) {
        const aplicaveis = modelos.filter(m =>
          aplicaHoje(m) && (m.loja == null || m.loja === lj) && !jaTem.has(`${m.id}|${lj}`)
        )
        for (const m of aplicaveis) {
          await insertChecklistExecucao({
            modelo_id: m.id, loja: lj, titulo: m.titulo, setor: m.setor,
            data: hoje(), turno: m.turno, status: 'pendente',
            responsavel_id: null, responsavel_nome: null,
            respostas: [], gps_lat: null, gps_lng: null, score: null,
            hora_limite: m.hora_limite, iniciado_em: null, concluido_em: null,
            created_by: user?.name || null,
          })
          criados++
        }
      }
      if (!criados) { toast('Nenhum checklist novo para hoje.', 'info'); return }
      toast(`${criados} checklist(s) gerado(s) para hoje.`, 'success')
      await load()
    } catch (e) {
      toast('Erro ao gerar: ' + (e as Error).message, 'error')
    } finally { setGerando(false) }
  }

  // Cria uma execução do modelo para hoje sob demanda (serve p/ avulsos ou rodar de novo)
  const runModeloAgora = async (m: ChecklistModelo) => {
    const alvo = loja !== 'Todas as Lojas' ? loja : (m.loja || '')
    if (!alvo) { toast('Selecione uma loja específica para executar um modelo global.', 'warning'); return }
    try {
      await insertChecklistExecucao({
        modelo_id: m.id, loja: alvo, titulo: m.titulo, setor: m.setor,
        data: hoje(), turno: m.turno, status: 'pendente',
        responsavel_id: null, responsavel_nome: null,
        respostas: [], gps_lat: null, gps_lng: null, score: null,
        hora_limite: m.hora_limite, iniciado_em: null, concluido_em: null,
        created_by: user?.name || null,
      })
      toast('Checklist criado em “Execução do dia”.', 'success')
      setTab('hoje'); await load()
    } catch (e) { toast('Erro: ' + (e as Error).message, 'error') }
  }

  const modeloDe = (id: string | null) => modelos.find(m => m.id === id)

  // ── Resumo do dia ──
  const resumo = useMemo(() => {
    const tot = execucoes.length
    const concl = execucoes.filter(e => e.status === 'concluido').length
    const comScore = execucoes.filter(e => e.score != null)
    const media = comScore.length ? Math.round(comScore.reduce((a, e) => a + (e.score || 0), 0) / comScore.length) : null
    const taxa = tot ? Math.round((concl / tot) * 100) : 0
    return { tot, concl, media, taxa }
  }, [execucoes])

  return (
    <div>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #6B1212 0%, #8a2a2a 100%)', borderRadius: 12,
        padding: '18px 22px', marginBottom: 16, color: '#fff',
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ClipboardCheck size={26} />
        </div>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Operação Padrão</h2>
          <div style={{ fontSize: 13, opacity: 0.85 }}>Checklists inteligentes · evidência por foto/GPS · score de compliance · Loja <strong>{loja}</strong></div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--card)', borderRadius: 10, padding: 4 }}>
        {([['hoje', '📋 Execução do dia'], ['painel', '📊 Painel'], ['modelos', '⚙️ Modelos']] as const).map(([id, lbl]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            flex: 1, padding: '10px 8px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 13,
            fontWeight: tab === id ? 700 : 400,
            background: tab === id ? 'var(--bordo)' : 'transparent',
            color: tab === id ? '#fff' : 'var(--muted)',
          }}>{lbl}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Loader2 className="spin" size={28} /></div>
      ) : tab === 'hoje' ? (
        <>
          {/* KPIs do dia */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 14 }}>
            <Kpi label="Checklists hoje" valor={String(resumo.tot)} />
            <Kpi label="Concluídos" valor={`${resumo.concl}/${resumo.tot}`} />
            <Kpi label="Taxa de conclusão" valor={`${resumo.taxa}%`} cor={resumo.taxa >= 80 ? '#16a34a' : resumo.taxa >= 50 ? '#f59e0b' : '#ef4444'} />
            <Kpi label="Score médio" valor={resumo.media == null ? '—' : `${resumo.media}`} cor={scoreColor(resumo.media)} />
          </div>

          <button onClick={gerarHoje} disabled={gerando} style={btnPrimary}>
            {gerando ? <Loader2 className="spin" size={15} /> : <RefreshCw size={15} />} Gerar checklists de hoje
          </button>

          {execucoes.length === 0 ? (
            <Empty texto="Nenhum checklist para hoje. Clique em “Gerar checklists de hoje” ou crie um modelo na aba Modelos." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
              {execucoes.map(e => (
                <ExecucaoCard
                  key={e.id} exec={e} modelo={modeloDe(e.modelo_id)}
                  onChange={load} toast={toast} user={user}
                />
              ))}
            </div>
          )}
        </>
      ) : tab === 'painel' ? (
        <PainelTab loja={loja} toast={toast} />
      ) : (
        <ModelosTab
          modelos={modelos}
          onNew={() => { setModeloEdit(null); setShowModeloModal(true) }}
          onEdit={(m) => { setModeloEdit(m); setShowModeloModal(true) }}
          onRun={runModeloAgora}
          onChange={load} toast={toast}
        />
      )}

      {showModeloModal && (
        <ModeloModal
          modelo={modeloEdit} loja={loja} userName={user?.name || null}
          onClose={() => setShowModeloModal(false)}
          onSaved={() => { setShowModeloModal(false); load() }}
          toast={toast}
        />
      )}
    </div>
  )
}

// ── KPIs / vazio ─────────────────────────────────────────────
function Kpi({ label, valor, cor }: { label: string; valor: string; cor?: string }) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: cor || 'var(--text)' }}>{valor}</div>
    </div>
  )
}
function Empty({ texto }: { texto: string }) {
  return <div style={{ textAlign: 'center', padding: 32, color: 'var(--muted)', fontSize: 13, background: 'var(--card)', borderRadius: 10, border: '1px dashed var(--border)', marginTop: 14 }}>{texto}</div>
}

// ── Card de execução (preenchimento) ─────────────────────────
function ExecucaoCard({ exec, modelo, onChange, toast, user }: {
  exec: ChecklistExecucao
  modelo?: ChecklistModelo
  onChange: () => void
  toast: (m: string, t?: 'success' | 'error' | 'warning' | 'info') => void
  user: { name?: string; id?: string } | null
}) {
  const itens = modelo?.itens || []
  const [respostas, setRespostas] = useState<ChecklistResposta[]>(exec.respostas || [])
  const [aberto, setAberto] = useState(exec.status !== 'concluido')
  const [salvando, setSalvando] = useState(false)
  const [uploadingId, setUploadingId] = useState<string | null>(null)

  const respDe = (id: string): ChecklistResposta =>
    respostas.find(r => r.item_id === id) || { item_id: id, ok: false, valor: null, foto_url: null, nota: null, ia_ok: null, ia_motivo: null, obs: null }

  const setResp = (id: string, patch: Partial<ChecklistResposta>) => {
    setRespostas(prev => {
      const ex = prev.find(r => r.item_id === id)
      if (ex) return prev.map(r => r.item_id === id ? { ...r, ...patch } : r)
      return [...prev, { item_id: id, ok: false, valor: null, foto_url: null, nota: null, ia_ok: null, ia_motivo: null, obs: null, ...patch }]
    })
  }

  const uploadFoto = async (id: string, item: ChecklistItem, files: FileList | null) => {
    if (!files || !files[0]) return
    const file = files[0]
    setUploadingId(id)
    try {
      const url = await uploadAnexo(file, 'checklists')
      setResp(id, { foto_url: url, ia_ok: null, ia_motivo: null })
      // Validação por IA (não bloqueante — falha silenciosa se a IA estiver fora)
      try {
        const v = await validarFotoIA(item.txt, file)
        setResp(id, { ia_ok: v.ok, ia_motivo: v.motivo })
        toast(v.ok ? '✅ IA validou a foto.' : '⚠️ IA apontou ressalva na foto.', v.ok ? 'success' : 'warning')
      } catch { /* IA indisponível — segue só com a foto */ }
    } catch (e) { toast('Falha no upload: ' + (e as Error).message, 'error') }
    finally { setUploadingId(null) }
  }

  const capturarGPS = (): Promise<{ lat: number; lng: number } | null> =>
    new Promise(resolve => {
      if (!navigator.geolocation) return resolve(null)
      navigator.geolocation.getCurrentPosition(
        p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(null),
        { timeout: 8000 }
      )
    })

  const salvarParcial = async () => {
    setSalvando(true)
    try {
      await updateChecklistExecucao(exec.id, {
        respostas, status: exec.status === 'concluido' ? 'concluido' : 'em_andamento',
        iniciado_em: exec.iniciado_em || new Date().toISOString(),
        responsavel_nome: exec.responsavel_nome || user?.name || null,
      })
      toast('Progresso salvo.', 'success'); onChange()
    } catch (e) { toast('Erro ao salvar: ' + (e as Error).message, 'error') }
    finally { setSalvando(false) }
  }

  const concluir = async () => {
    // valida obrigatórios
    const faltando = itens.filter(i => i.obrigatorio && !itemOk(i, respDe(i.id)))
    if (faltando.length) {
      toast(`Faltam ${faltando.length} item(ns) obrigatório(s).`, 'warning'); return
    }
    setSalvando(true)
    try {
      let gps: { lat: number; lng: number } | null = null
      if (modelo?.exige_gps) {
        gps = await capturarGPS()
        if (!gps) { toast('Não foi possível obter o GPS (permita a localização).', 'warning'); setSalvando(false); return }
      }
      const agora = new Date()
      const atrasado = !!exec.hora_limite && agora.toTimeString().slice(0, 5) > exec.hora_limite
      const score = calcScore(itens, respostas, atrasado)
      await updateChecklistExecucao(exec.id, {
        respostas, status: 'concluido', score,
        concluido_em: agora.toISOString(),
        iniciado_em: exec.iniciado_em || agora.toISOString(),
        responsavel_nome: exec.responsavel_nome || user?.name || null,
        gps_lat: gps?.lat ?? null, gps_lng: gps?.lng ?? null,
      })
      toast(`Checklist concluído — score ${score}/100${atrasado ? ' (com atraso)' : ''}.`, 'success')
      setAberto(false); onChange()
    } catch (e) { toast('Erro ao concluir: ' + (e as Error).message, 'error') }
    finally { setSalvando(false) }
  }

  const totalOk = itens.filter(i => itemOk(i, respDe(i.id))).length
  const concluido = exec.status === 'concluido'

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      {/* Cabeçalho do card */}
      <div onClick={() => setAberto(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', cursor: 'pointer' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            {concluido ? <CheckCircle2 size={16} color="#16a34a" /> : <Play size={14} color="var(--bordo)" />}
            {exec.titulo}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
            {turnoLbl(exec.turno)} · {exec.setor} · {totalOk}/{itens.length} itens
            {exec.hora_limite ? ` · limite ${exec.hora_limite}` : ''}
            {modelo?.exige_gps ? ' · 📍 exige GPS' : ''}
          </div>
        </div>
        {concluido && exec.score != null && (
          <div style={{ fontSize: 18, fontWeight: 700, color: scoreColor(exec.score) }}>{exec.score}</div>
        )}
      </div>

      {aberto && (
        <div style={{ padding: '0 14px 14px' }}>
          {itens.length === 0 && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Modelo sem itens (ou excluído).</div>}
          {itens.map(item => {
            const r = respDe(item.id)
            const ok = itemOk(item, r)
            return (
              <div key={item.id} style={{ padding: '10px 0', borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 13, flex: 1, color: 'var(--text)' }}>
                    {item.txt}
                    {item.obrigatorio && <span style={{ color: '#ef4444' }}> *</span>}
                    {item.critico && <span title="Crítico (peso dobrado)"> 🔴</span>}
                  </span>
                  {ok && <CheckCircle2 size={15} color="#16a34a" />}
                </div>

                {/* Input por tipo */}
                {item.tipo === 'confirm' && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: concluido ? 'default' : 'pointer' }}>
                    <input type="checkbox" disabled={concluido} checked={r.ok} onChange={e => setResp(item.id, { ok: e.target.checked })} />
                    Confirmar conclusão
                  </label>
                )}
                {item.tipo === 'numero' && (
                  <input type="number" disabled={concluido} value={r.valor ?? ''} placeholder="Valor"
                    onChange={e => setResp(item.id, { valor: e.target.value === '' ? null : Number(e.target.value) })}
                    style={inp} />
                )}
                {item.tipo === 'avaliacao' && (
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[1, 2, 3, 4, 5].map(n => (
                      <Star key={n} size={22} style={{ cursor: concluido ? 'default' : 'pointer' }}
                        fill={(r.nota || 0) >= n ? '#f59e0b' : 'none'} color="#f59e0b"
                        onClick={() => !concluido && setResp(item.id, { nota: n })} />
                    ))}
                  </div>
                )}
                {item.tipo === 'foto' && (
                  <div>
                    {r.foto_url && <a href={r.foto_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--bordo)', display: 'block', marginBottom: 4 }}>📎 ver foto enviada</a>}
                    {r.ia_ok != null && (
                      <div style={{ fontSize: 11, marginBottom: 4, color: r.ia_ok ? '#16a34a' : '#f59e0b' }}>
                        {r.ia_ok ? '🤖 IA validou' : '🤖 IA com ressalva'}{r.ia_motivo ? `: ${r.ia_motivo}` : ''}
                      </div>
                    )}
                    {!concluido && (
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, border: '1px dashed var(--bordo)', color: 'var(--bordo)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                        {uploadingId === item.id ? <Loader2 className="spin" size={14} /> : <Camera size={14} />}
                        {r.foto_url ? 'Trocar foto' : 'Enviar foto'}
                        <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                          onChange={e => uploadFoto(item.id, item, e.target.files)} />
                      </label>
                    )}
                  </div>
                )}
                {!concluido && (
                  <input value={r.obs || ''} placeholder="Observação (opcional)"
                    onChange={e => setResp(item.id, { obs: e.target.value || null })}
                    style={{ ...inp, marginTop: 6, fontSize: 12 }} />
                )}
              </div>
            )
          })}

          {/* Ações */}
          {!concluido && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={salvarParcial} disabled={salvando} style={btnGhost}>
                {salvando ? <Loader2 className="spin" size={14} /> : <Save size={14} />} Salvar progresso
              </button>
              <button onClick={concluir} disabled={salvando} style={btnPrimary}>
                {salvando ? <Loader2 className="spin" size={14} /> : <CheckCircle2 size={14} />} Concluir
              </button>
            </div>
          )}
          {concluido && (
            <div style={{ marginTop: 10, fontSize: 11, color: 'var(--muted)' }}>
              Concluído por {exec.responsavel_nome || '—'} {exec.concluido_em ? `em ${new Date(exec.concluido_em).toLocaleString('pt-BR')}` : ''}
              {exec.gps_lat != null && <span> · 📍 {exec.gps_lat.toFixed(4)}, {exec.gps_lng?.toFixed(4)}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Aba Modelos ──────────────────────────────────────────────
function ModelosTab({ modelos, onNew, onEdit, onRun, onChange, toast }: {
  modelos: ChecklistModelo[]
  onNew: () => void
  onEdit: (m: ChecklistModelo) => void
  onRun: (m: ChecklistModelo) => void
  onChange: () => void
  toast: (m: string, t?: 'success' | 'error' | 'warning' | 'info') => void
}) {
  const del = async (m: ChecklistModelo) => {
    if (!confirm(`Excluir o modelo "${m.titulo}"? As execuções já feitas serão removidas.`)) return
    try { await deleteChecklistModelo(m.id); toast('Modelo excluído.', 'success'); onChange() }
    catch (e) { toast('Erro: ' + (e as Error).message, 'error') }
  }
  const toggle = async (m: ChecklistModelo) => {
    try { await updateChecklistModelo(m.id, { ativo: !m.ativo }); onChange() }
    catch (e) { toast('Erro: ' + (e as Error).message, 'error') }
  }
  return (
    <>
      <button onClick={onNew} style={btnPrimary}><Plus size={15} /> Novo modelo</button>
      {modelos.length === 0 ? (
        <Empty texto="Nenhum modelo de checklist ainda. Crie o primeiro (ex.: Abertura da Cozinha)." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
          {modelos.map(m => (
            <div key={m.id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {m.titulo}
                  {!m.ativo && <span style={{ fontSize: 10, background: 'var(--border)', color: 'var(--muted)', padding: '1px 6px', borderRadius: 10 }}>inativo</span>}
                  {m.loja == null && <span style={{ fontSize: 10, background: '#1e40af', color: '#fff', padding: '1px 6px', borderRadius: 10 }}>todas as lojas</span>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                  {m.setor} · {turnoLbl(m.turno)} · {RECORRENCIAS.find(r => r.v === m.recorrencia)?.lbl}
                  {m.recorrencia === 'semanal' && m.dias_semana?.length ? ` (${m.dias_semana.map(d => DIAS[d]).join(', ')})` : ''}
                  {m.recorrencia === 'mensal' && m.dia_mes ? ` (dia ${m.dia_mes})` : ''}
                  · {m.itens.length} itens{m.exige_gps ? ' · 📍 GPS' : ''}
                </div>
              </div>
              <button onClick={() => onRun(m)} title="Executar agora" style={{ ...iconBtn, color: 'var(--bordo)' }}><Play size={15} /></button>
              <button onClick={() => toggle(m)} title={m.ativo ? 'Desativar' : 'Ativar'} style={iconBtn}>
                {m.ativo ? '⏸️' : '▶️'}
              </button>
              <button onClick={() => onEdit(m)} style={iconBtn}><Edit2 size={15} /></button>
              <button onClick={() => del(m)} style={{ ...iconBtn, color: '#ef4444' }}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// ── Modal de criar/editar modelo ─────────────────────────────
function ModeloModal({ modelo, loja, userName, onClose, onSaved, toast }: {
  modelo: ChecklistModelo | null
  loja: string
  userName: string | null
  onClose: () => void
  onSaved: () => void
  toast: (m: string, t?: 'success' | 'error' | 'warning' | 'info') => void
}) {
  const [titulo, setTitulo] = useState(modelo?.titulo || '')
  const [setor, setSetor] = useState(modelo?.setor || 'Geral')
  const [descricao, setDescricao] = useState(modelo?.descricao || '')
  const [recorrencia, setRecorrencia] = useState<ChecklistRecorrencia>(modelo?.recorrencia || 'diario')
  const [diasSemana, setDiasSemana] = useState<number[]>(modelo?.dias_semana || [])
  const [diaMes, setDiaMes] = useState<number>(modelo?.dia_mes || 1)
  const [turno, setTurno] = useState<ChecklistTurno>(modelo?.turno || 'abertura')
  const [horaLimite, setHoraLimite] = useState(modelo?.hora_limite || '')
  const [exigeGps, setExigeGps] = useState(modelo?.exige_gps || false)
  const [todasLojas, setTodasLojas] = useState(modelo ? modelo.loja == null : false)
  const [itens, setItens] = useState<ChecklistItem[]>(modelo?.itens || [])
  const [salvando, setSalvando] = useState(false)
  const [gerandoIa, setGerandoIa] = useState(false)

  const gerarIA = async () => {
    if (!titulo.trim()) { toast('Informe o título antes de gerar com IA.', 'warning'); return }
    setGerandoIa(true)
    try {
      const novos = await gerarItensIA(titulo.trim(), setor, descricao.trim())
      if (!novos.length) { toast('A IA não retornou itens.', 'warning'); return }
      setItens(prev => [...prev, ...novos])
      toast(`${novos.length} itens gerados pela IA. Revise e ajuste.`, 'success')
    } catch (e) { toast('IA indisponível: ' + (e as Error).message, 'error') }
    finally { setGerandoIa(false) }
  }

  const addItem = () => setItens(prev => [...prev, { id: crypto.randomUUID(), txt: '', tipo: 'confirm', obrigatorio: true, critico: false, peso: 1 }])
  const setItem = (id: string, patch: Partial<ChecklistItem>) => setItens(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i))
  const delItem = (id: string) => setItens(prev => prev.filter(i => i.id !== id))

  const salvar = async () => {
    if (!titulo.trim()) { toast('Informe o título.', 'warning'); return }
    const itensLimpos = itens.filter(i => i.txt.trim())
    if (itensLimpos.length === 0) { toast('Adicione ao menos 1 item.', 'warning'); return }
    setSalvando(true)
    try {
      const payload = {
        loja: todasLojas ? null : loja,
        titulo: titulo.trim(), setor, descricao: descricao.trim() || null,
        recorrencia,
        dias_semana: recorrencia === 'semanal' ? diasSemana : null,
        dia_mes: recorrencia === 'mensal' ? diaMes : null,
        turno, hora_limite: horaLimite || null, exige_gps: exigeGps,
        itens: itensLimpos, ativo: modelo?.ativo ?? true,
        created_by: modelo?.created_by ?? userName,
      }
      if (modelo) await updateChecklistModelo(modelo.id, payload)
      else await insertChecklistModelo(payload)
      toast('Modelo salvo.', 'success'); onSaved()
    } catch (e) { toast('Erro ao salvar: ' + (e as Error).message, 'error') }
    finally { setSalvando(false) }
  }

  return (
    <Modal open onClose={onClose} title={modelo ? 'Editar modelo' : 'Novo modelo de checklist'} size="lg"
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btnGhost}>Cancelar</button>
          <button onClick={salvar} disabled={salvando} style={btnPrimary}>
            {salvando ? <Loader2 className="spin" size={14} /> : <Save size={14} />} Salvar
          </button>
        </div>
      }>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Field label="Título *"><input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ex.: Abertura da Cozinha" style={inp} /></Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Setor">
            <select value={setor} onChange={e => setSetor(e.target.value)} style={inp}>
              {SETORES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Turno">
            <select value={turno} onChange={e => setTurno(e.target.value as ChecklistTurno)} style={inp}>
              {TURNOS.map(t => <option key={t.v} value={t.v}>{t.lbl}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Descrição"><input value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Opcional" style={inp} /></Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Recorrência">
            <select value={recorrencia} onChange={e => setRecorrencia(e.target.value as ChecklistRecorrencia)} style={inp}>
              {RECORRENCIAS.map(r => <option key={r.v} value={r.v}>{r.lbl}</option>)}
            </select>
          </Field>
          <Field label="Horário limite">
            <input type="time" value={horaLimite} onChange={e => setHoraLimite(e.target.value)} style={inp} />
          </Field>
        </div>

        {recorrencia === 'semanal' && (
          <Field label="Dias da semana">
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {DIAS.map((d, i) => (
                <button key={i} type="button" onClick={() => setDiasSemana(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i])}
                  style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, cursor: 'pointer',
                    background: diasSemana.includes(i) ? 'var(--bordo)' : 'var(--bg)', color: diasSemana.includes(i) ? '#fff' : 'var(--text)' }}>{d}</button>
              ))}
            </div>
          </Field>
        )}
        {recorrencia === 'mensal' && (
          <Field label="Dia do mês"><input type="number" min={1} max={31} value={diaMes} onChange={e => setDiaMes(Number(e.target.value))} style={inp} /></Field>
        )}

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={exigeGps} onChange={e => setExigeGps(e.target.checked)} /> <MapPin size={14} /> Exigir GPS na conclusão
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={todasLojas} onChange={e => setTodasLojas(e.target.checked)} /> Aplicar a todas as lojas
          </label>
        </div>

        {/* Itens */}
        <div style={{ marginTop: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Itens do checklist ({itens.length})</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={gerarIA} disabled={gerandoIa} style={{ ...btnGhost, borderColor: 'var(--bordo)', color: 'var(--bordo)' }}>
                {gerandoIa ? <Loader2 className="spin" size={13} /> : <Sparkles size={13} />} Gerar com IA
              </button>
              <button onClick={addItem} style={btnGhost}><Plus size={13} /> Item</button>
            </div>
          </div>
          {itens.map((it, idx) => (
            <div key={it.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 8, marginBottom: 6, background: 'var(--bg)' }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--muted)', paddingTop: 8 }}>{idx + 1}.</span>
                <input value={it.txt} onChange={e => setItem(it.id, { txt: e.target.value })} placeholder="Descrição do item" style={{ ...inp, flex: 1 }} />
                <button onClick={() => delItem(it.id)} style={{ ...iconBtn, color: '#ef4444' }}><X size={14} /></button>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', paddingLeft: 18 }}>
                <select value={it.tipo} onChange={e => setItem(it.id, { tipo: e.target.value as ChecklistItemTipo })} style={{ ...inp, width: 'auto', fontSize: 12, padding: '4px 8px' }}>
                  {TIPOS.map(t => <option key={t.v} value={t.v}>{t.emoji} {t.lbl}</option>)}
                </select>
                <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                  <input type="checkbox" checked={it.obrigatorio} onChange={e => setItem(it.id, { obrigatorio: e.target.checked })} /> obrigatório
                </label>
                <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                  <input type="checkbox" checked={it.critico} onChange={e => setItem(it.id, { critico: e.target.checked })} /> 🔴 crítico
                </label>
                <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                  peso <input type="number" min={1} max={10} value={it.peso} onChange={e => setItem(it.id, { peso: Number(e.target.value) || 1 })} style={{ ...inp, width: 50, padding: '4px 6px', fontSize: 12 }} />
                </label>
              </div>
            </div>
          ))}
          {itens.length === 0 && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Nenhum item. Clique em “Item” para adicionar.</div>}
        </div>
      </div>
    </Modal>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  )
}

// ── Aba Painel (compliance + rankings + WhatsApp) ────────────
interface Rank { chave: string; total: number; concl: number; taxa: number; score: number | null }

function agrupa(execs: ChecklistExecucao[], keyFn: (e: ChecklistExecucao) => string): Rank[] {
  const map: Record<string, { total: number; concl: number; soma: number; n: number }> = {}
  for (const e of execs) {
    const k = keyFn(e)
    if (!map[k]) map[k] = { total: 0, concl: 0, soma: 0, n: 0 }
    map[k].total++
    if (e.status === 'concluido') map[k].concl++
    if (e.score != null) { map[k].soma += e.score; map[k].n++ }
  }
  return Object.entries(map).map(([chave, v]) => ({
    chave, total: v.total, concl: v.concl,
    taxa: v.total ? Math.round((v.concl / v.total) * 100) : 0,
    score: v.n ? Math.round(v.soma / v.n) : null,
  })).sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
}

function montaMsgPendencias(loja: string, pend: ChecklistExecucao[]): string {
  const dataBR = new Date().toLocaleDateString('pt-BR')
  if (!pend.length) return `✅ *CHECKLISTS — ${loja}*\n${dataBR}\nTodos os checklists de hoje concluídos. 👏`
  const linhas = pend.slice(0, 15).map(e => `• ${e.titulo} (${turnoLbl(e.turno)})${e.hora_limite ? ` — limite ${e.hora_limite}` : ''}`).join('\n')
  return `⚠️ *CHECKLISTS PENDENTES — ${loja}*\n${dataBR}\n\n${pend.length} pendente(s):\n${linhas}\n\n_Operação Padrão · Amore Gestão_`
}

function PainelTab({ loja, toast }: { loja: string; toast: (m: string, t?: 'success' | 'error' | 'warning' | 'info') => void }) {
  const [dias, setDias] = useState(7)
  const [execs, setExecs] = useState<ChecklistExecucao[]>([])
  const [loading, setLoading] = useState(true)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    setLoading(true)
    const fim = hoje()
    const ini = new Date(Date.now() - (dias - 1) * 86400000).toISOString().slice(0, 10)
    fetchChecklistExecucoesRange(loja, ini, fim).then(setExecs).finally(() => setLoading(false))
  }, [loja, dias])

  const kpi = useMemo(() => {
    const tot = execs.length
    const concl = execs.filter(e => e.status === 'concluido').length
    const comScore = execs.filter(e => e.score != null)
    const media = comScore.length ? Math.round(comScore.reduce((a, e) => a + (e.score || 0), 0) / comScore.length) : null
    return { tot, concl, taxa: tot ? Math.round((concl / tot) * 100) : 0, media }
  }, [execs])

  const porColab = useMemo(() => agrupa(execs, e => e.responsavel_nome || '—'), [execs])
  const porSetor = useMemo(() => agrupa(execs, e => e.setor || '—'), [execs])
  const porLoja = useMemo(() => agrupa(execs, e => e.loja || '—'), [execs])
  const multiLoja = useMemo(() => new Set(execs.map(e => e.loja)).size > 1, [execs])

  const avisarPendencias = async () => {
    setEnviando(true)
    try {
      const remote = await carregarZapiCfgRemoto().catch(() => null)
      const cfg: any = { ...getZapiCfg(), ...(remote || {}) }
      const nums = String(cfg.recipients || '').split(',').map((s: string) => s.replace(/\D/g, '')).filter(Boolean)
      if (!nums.length) { toast('Configure os números no menu Liz → WhatsApp.', 'warning'); return }
      const pend = execs.filter(e => e.data === hoje() && e.status !== 'concluido')
      const msg = montaMsgPendencias(loja, pend)
      let ok = 0
      for (const n of nums) {
        if (await enviarWhatsApp(n, msg, undefined, { tipo: 'relatorio', modulo: 'checklists', titulo: 'Pendências de checklist', loja })) ok++
      }
      toast(`Aviso enviado para ${ok}/${nums.length} número(s).`, ok ? 'success' : 'error')
    } catch (e) { toast('Erro: ' + (e as Error).message, 'error') }
    finally { setEnviando(false) }
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Loader2 className="spin" size={28} /></div>

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>Período:</span>
        {[7, 15, 30].map(d => (
          <button key={d} onClick={() => setDias(d)} style={{
            padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, cursor: 'pointer',
            background: dias === d ? 'var(--bordo)' : 'var(--bg)', color: dias === d ? '#fff' : 'var(--text)',
          }}>{d} dias</button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={avisarPendencias} disabled={enviando} style={btnPrimary}>
          {enviando ? <Loader2 className="spin" size={14} /> : <span>📲</span>} Avisar pendências (WhatsApp)
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
        <Kpi label="Execuções" valor={String(kpi.tot)} />
        <Kpi label="Concluídas" valor={`${kpi.concl}/${kpi.tot}`} />
        <Kpi label="Taxa de conclusão" valor={`${kpi.taxa}%`} cor={kpi.taxa >= 80 ? '#16a34a' : kpi.taxa >= 50 ? '#f59e0b' : '#ef4444'} />
        <Kpi label="Score médio" valor={kpi.media == null ? '—' : String(kpi.media)} cor={scoreColor(kpi.media)} />
      </div>

      {execs.length === 0 ? (
        <Empty texto="Sem execuções no período. Gere e conclua checklists na aba “Execução do dia”." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
          {multiLoja && <RankCard titulo="🏪 Ranking por unidade" linhas={porLoja} />}
          <RankCard titulo="🏆 Ranking por colaborador" linhas={porColab} />
          <RankCard titulo="🏢 Desempenho por setor" linhas={porSetor} />
        </div>
      )}
    </div>
  )
}

function RankCard({ titulo, linhas }: { titulo: string; linhas: Rank[] }) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{titulo}</div>
      {linhas.length === 0 ? <div style={{ fontSize: 12, color: 'var(--muted)' }}>Sem dados.</div> : linhas.map((l, i) => (
        <div key={l.chave} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderTop: i ? '1px solid var(--border)' : 'none' }}>
          <span style={{ fontSize: 12, color: 'var(--muted)', width: 18 }}>{i + 1}º</span>
          <span style={{ fontSize: 13, flex: 1, color: 'var(--text)' }}>{l.chave}</span>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>{l.concl}/{l.total} · {l.taxa}%</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: scoreColor(l.score), width: 34, textAlign: 'right' }}>{l.score ?? '—'}</span>
        </div>
      ))}
    </div>
  )
}

// ── Estilos ──────────────────────────────────────────────────
const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }
const btnPrimary: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 8, border: 'none', background: 'var(--bordo)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const btnGhost: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const iconBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', cursor: 'pointer', fontSize: 14 }
