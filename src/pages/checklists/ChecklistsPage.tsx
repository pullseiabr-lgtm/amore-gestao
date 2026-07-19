import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  Plus, Edit2, Trash2, Loader2, CheckCircle2, Camera, MapPin,
  Star, ClipboardCheck, Play, RefreshCw, Save, X, Sparkles, FileDown,
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
  ChecklistItemTipo, ChecklistRecorrencia, ChecklistTurno, ChecklistNC, ChecklistCondicao,
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
  { v: 'texto', lbl: 'Comentário', emoji: '📝' },
  { v: 'temperatura', lbl: 'Temperatura', emoji: '🌡️' },
  { v: 'quantidade', lbl: 'Quantidade', emoji: '🔢' },
  { v: 'peso', lbl: 'Peso', emoji: '⚖️' },
  { v: 'valor', lbl: 'Valor (R$)', emoji: '💰' },
  { v: 'qrcode', lbl: 'QR / Cód. barras', emoji: '🔳' },
  { v: 'assinatura', lbl: 'Assinatura', emoji: '✍️' },
]
// Tipos numéricos que usam o campo "valor" + unidade/limites
const TIPOS_NUM: ChecklistItemTipo[] = ['numero', 'temperatura', 'quantidade', 'peso', 'valor']
const unidadePadrao = (t: ChecklistItemTipo) =>
  t === 'temperatura' ? '°C' : t === 'peso' ? 'kg' : t === 'valor' ? 'R$' : t === 'quantidade' ? 'un' : ''
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

// Valor numérico está dentro da faixa min/max (quando definida)?
function dentroDaFaixa(item: ChecklistItem, v: number): boolean {
  if (item.min != null && v < item.min) return false
  if (item.max != null && v > item.max) return false
  return true
}

// Item respondido de forma satisfatória?
function itemOk(item: ChecklistItem, r?: ChecklistResposta): boolean {
  if (!r) return false
  if (r.nao_executou) return false
  switch (item.tipo) {
    case 'confirm': return r.ok === true
    case 'foto': return !!r.foto_url && r.ia_status !== 'reprovado'
    case 'avaliacao': return (r.nota || 0) > 0
    case 'texto': case 'qrcode': return !!(r.texto && r.texto.trim())
    case 'assinatura': return !!r.assinatura
    case 'numero': case 'quantidade': case 'peso': case 'valor':
      return r.valor !== null && r.valor !== undefined
    case 'temperatura':
      return r.valor !== null && r.valor !== undefined && dentroDaFaixa(item, r.valor)
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

// Motivo que faz um item abrir Não Conformidade ao concluir (só casos "ruins", não faltantes)
function motivoReprovacao(item: ChecklistItem, r: ChecklistResposta): string | null {
  if (r.nao_executou) return `Não executado: ${r.motivo_nao || 'sem motivo'}`
  if (item.tipo === 'foto' && r.ia_status === 'reprovado') return `Foto reprovada pela IA${r.ia_motivo ? `: ${r.ia_motivo}` : ''}`
  if (item.tipo === 'temperatura' && r.valor != null && !dentroDaFaixa(item, r.valor))
    return `Temperatura fora do limite (${r.valor}${item.unidade || '°C'})`
  // Ação condicional: item respondido de forma não conforme com "abrir NC" ligado
  if (item.cond?.abrir_nc && !itemOk(item, r))
    return item.cond.mensagem || 'Resposta não conforme (ação condicional)'
  return null
}

const NC_GRAV: Record<'baixa' | 'media' | 'alta', { lbl: string; cor: string }> = {
  baixa: { lbl: 'Baixa', cor: '#3b82f6' },
  media: { lbl: 'Média', cor: '#f59e0b' },
  alta:  { lbl: 'Alta',  cor: '#ef4444' },
}
const NC_STATUS: Record<string, { lbl: string; cor: string }> = {
  aberta:      { lbl: 'Aberta',       cor: '#ef4444' },
  em_correcao: { lbl: 'Em correção',  cor: '#f59e0b' },
  corrigida:   { lbl: 'Corrigida',    cor: '#3b82f6' },
  encerrada:   { lbl: 'Encerrada',    cor: '#16a34a' },
}

// ── Componente principal ─────────────────────────────────────
export default function ChecklistsPage() {
  const { loja, lojas } = useLoja()
  const { user } = useAuth()
  const { toast } = useToast()

  const [tab, setTab] = useState<'hoje' | 'painel' | 'nc' | 'modelos'>('hoje')
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
        {([['hoje', '📋 Execução do dia'], ['painel', '📊 Painel'], ['nc', '🚩 Não Conformidades'], ['modelos', '⚙️ Modelos']] as const).map(([id, lbl]) => (
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
      ) : tab === 'nc' ? (
        <NcTab loja={loja} user={user} toast={toast} />
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

// ── Scanner de QR / código de barras (câmera, lib carregada sob demanda) ──
function ScannerModal({ onClose, onResult }: { onClose: () => void; onResult: (txt: string) => void }) {
  const [erro, setErro] = useState<string | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scannerRef = useRef<any>(null)
  const doneRef = useRef(false)
  const onResultRef = useRef(onResult); onResultRef.current = onResult
  useEffect(() => {
    let cancel = false
    ;(async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode')
        if (cancel) return
        const h = new Html5Qrcode('chk-scanner')
        scannerRef.current = h
        await h.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 230, height: 230 } },
          (txt: string) => { if (!doneRef.current) { doneRef.current = true; onResultRef.current(txt) } }, () => {})
      } catch (e) { if (!cancel) setErro((e as Error)?.message || 'Não foi possível abrir a câmera') }
    })()
    return () => {
      cancel = true
      const h = scannerRef.current
      if (h) { h.stop().then(() => h.clear()).catch(() => {}); scannerRef.current = null }
    }
  }, [])
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0009', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: 'var(--card)', borderRadius: 12, padding: 16, width: '100%', maxWidth: 360 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <strong style={{ fontSize: 14 }}>Escanear QR / código</strong>
          <button onClick={onClose} style={iconBtn}><X size={16} /></button>
        </div>
        <div id="chk-scanner" style={{ width: '100%', minHeight: 240, borderRadius: 8, overflow: 'hidden', background: '#000' }} />
        {erro && <div style={{ fontSize: 12, color: '#ef4444', marginTop: 8 }}>{erro}</div>}
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>Aponte a câmera para o código. Se preferir, feche e digite manualmente.</div>
      </div>
    </div>
  )
}

// ── Assinatura digital (canvas — sem biblioteca) ─────────────
function SignaturePad({ onSave, uploading }: { onSave: (blob: Blob) => void; uploading: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const dirty = useRef(false)
  const pos = (e: React.MouseEvent | React.TouchEvent) => {
    const c = canvasRef.current!; const rect = c.getBoundingClientRect()
    const t = 'touches' in e ? e.touches[0] : e
    return { x: (t.clientX - rect.left) * (c.width / rect.width), y: (t.clientY - rect.top) * (c.height / rect.height) }
  }
  const start = (e: React.MouseEvent | React.TouchEvent) => {
    drawing.current = true; const ctx = canvasRef.current!.getContext('2d')!; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y)
  }
  const move = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing.current) return; e.preventDefault()
    const ctx = canvasRef.current!.getContext('2d')!; const p = pos(e)
    ctx.lineTo(p.x, p.y); ctx.strokeStyle = '#111'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.stroke(); dirty.current = true
  }
  const end = () => { drawing.current = false }
  const limpar = () => { const c = canvasRef.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); dirty.current = false }
  const salvar = () => { if (!dirty.current) return; canvasRef.current!.toBlob(b => { if (b) onSave(b) }, 'image/png') }
  return (
    <div>
      <canvas ref={canvasRef} width={300} height={100}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end}
        style={{ border: '1px solid var(--border)', borderRadius: 8, background: '#fff', touchAction: 'none', width: '100%', maxWidth: 300, height: 100 }} />
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <button type="button" onClick={limpar} style={{ ...btnGhost, padding: '5px 10px', fontSize: 12 }}>Limpar</button>
        <button type="button" onClick={salvar} disabled={uploading} style={{ ...btnPrimary, padding: '5px 10px', fontSize: 12 }}>
          {uploading ? <Loader2 className="spin" size={13} /> : <Save size={13} />} Usar assinatura
        </button>
      </div>
    </div>
  )
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
  const [scanItemId, setScanItemId] = useState<string | null>(null)

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
      setResp(id, { foto_url: url, ia_ok: null, ia_motivo: null, ia_status: null })
      // Validação por IA (não bloqueante — falha silenciosa se a IA estiver fora)
      try {
        const v = await validarFotoIA(item.txt, file)
        setResp(id, { ia_ok: v.ok, ia_motivo: v.motivo, ia_status: v.ok ? 'aprovado' : 'revisao' })
        toast(v.ok ? '✅ IA validou a foto.' : '⚠️ IA pediu revisão da foto.', v.ok ? 'success' : 'warning')
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
    // "Não consigo executar" sem motivo → precisa justificar
    const semMotivo = itens.filter(i => { const r = respDe(i.id); return r.nao_executou && !(r.motivo_nao && r.motivo_nao.trim()) })
    if (semMotivo.length) {
      toast(`Informe o motivo em ${semMotivo.length} item(ns) não executado(s).`, 'warning'); return
    }
    // Valida obrigatórios — itens não executados (com motivo) não bloqueiam, mas penalizam o score
    const faltando = itens.filter(i => { const r = respDe(i.id); return i.obrigatorio && !itemOk(i, r) && !r.nao_executou })
    if (faltando.length) {
      toast(`Faltam ${faltando.length} item(ns) obrigatório(s).`, 'warning'); return
    }
    // Ações condicionais: item respondido de forma não conforme pode exigir foto/observação ou bloquear a conclusão
    const condPend = respostas.filter(r => {
      const i = itens.find(x => x.id === r.item_id)
      if (!i?.cond || r.nao_executou || itemOk(i, r)) return false
      if (i.cond.bloquear) return true
      if (i.cond.exigir_foto && !r.foto_url) return true
      if (i.cond.exigir_obs && !(r.obs && r.obs.trim())) return true
      return false
    })
    if (condPend.length) {
      toast(`${condPend.length} item(ns) não conforme(s) com ação pendente (foto/observação) ou conclusão bloqueada.`, 'warning'); return
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
      // Abre Não Conformidade automática nos itens reprovados (foto reprovada, temperatura fora, não executado)
      let novasNc = 0
      const respostasFinal: ChecklistResposta[] = respostas.map(r => {
        const item = itens.find(i => i.id === r.item_id)
        if (!item || r.nc) return r
        const motivo = motivoReprovacao(item, r)
        if (!motivo) return r
        novasNc++
        const nc: ChecklistNC = {
          status: 'aberta', gravidade: item.critico ? 'alta' : 'media',
          item_txt: item.txt, foto_evidencia: r.foto_url || null, motivo_reprovacao: motivo,
          causa: null, acao: null, responsavel: null, prazo: null, impacto: null,
          foto_correcao: null, aprovado_por: null,
          aberta_em: agora.toISOString(), encerrada_em: null,
        }
        return { ...r, nc }
      })
      await updateChecklistExecucao(exec.id, {
        respostas: respostasFinal, status: 'concluido', score,
        concluido_em: agora.toISOString(),
        iniciado_em: exec.iniciado_em || agora.toISOString(),
        responsavel_nome: exec.responsavel_nome || user?.name || null,
        gps_lat: gps?.lat ?? null, gps_lng: gps?.lng ?? null,
      })
      toast(`Checklist concluído — score ${score}/100${atrasado ? ' (com atraso)' : ''}${novasNc ? ` · ${novasNc} não conformidade(s) aberta(s) 🚩` : ''}.`, novasNc ? 'warning' : 'success')
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
            const touched = respostas.some(x => x.item_id === item.id)
            const disparou = !!item.cond && touched && !r.nao_executou && !ok
            return (
              <div key={item.id} style={{ padding: '10px 0', borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 13, flex: 1, color: 'var(--text)' }}>
                    {item.txt}
                    {item.obrigatorio && <span style={{ color: '#ef4444' }}> *</span>}
                    {item.critico && <span title="Crítico (peso dobrado)"> 🔴</span>}
                  </span>
                  {r.nao_executou
                    ? <span style={{ fontSize: 11, fontWeight: 700, color: '#ef4444' }}>não executado</span>
                    : ok && <CheckCircle2 size={15} color="#16a34a" />}
                </div>

                {/* Instrução passo a passo */}
                {item.instrucao && (
                  <div style={{ fontSize: 12, color: 'var(--muted)', background: 'var(--bg)', borderRadius: 6, padding: '6px 8px', marginBottom: 6, whiteSpace: 'pre-wrap' }}>
                    ℹ️ {item.instrucao}
                  </div>
                )}
                {/* Foto de referência (padrão esperado) */}
                {item.foto_ref && (
                  <a href={item.foto_ref} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <img src={item.foto_ref} alt="padrão" style={{ width: 54, height: 54, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }} />
                    <span style={{ fontSize: 11, color: 'var(--bordo)' }}>padrão esperado</span>
                  </a>
                )}

                {r.nao_executou ? (
                  /* Estado: não consegui executar */
                  <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 10px' }}>
                    <div style={{ fontSize: 12, color: '#ef4444', fontWeight: 600, marginBottom: 4 }}>⛔ Não executado</div>
                    <input value={r.motivo_nao || ''} placeholder="Motivo (ex.: falta de insumo, equipamento parado)…"
                      disabled={concluido}
                      onChange={e => setResp(item.id, { motivo_nao: e.target.value || null })}
                      style={{ ...inp, fontSize: 12 }} />
                    {!concluido && (
                      <button onClick={() => setResp(item.id, { nao_executou: false, motivo_nao: null })}
                        style={{ ...btnGhost, marginTop: 6, padding: '5px 10px', fontSize: 12 }}>↩︎ Voltar a executar</button>
                    )}
                  </div>
                ) : (
                <>
                {/* Input por tipo */}
                {item.tipo === 'confirm' && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: concluido ? 'default' : 'pointer' }}>
                    <input type="checkbox" disabled={concluido} checked={r.ok} onChange={e => setResp(item.id, { ok: e.target.checked })} />
                    Confirmar conclusão
                  </label>
                )}
                {TIPOS_NUM.includes(item.tipo) && (() => {
                  const un = item.unidade || unidadePadrao(item.tipo)
                  const foraFaixa = item.tipo === 'temperatura' && r.valor != null && !dentroDaFaixa(item, r.valor)
                  return (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input type="number" step="any" disabled={concluido} value={r.valor ?? ''} placeholder="Valor"
                          onChange={e => setResp(item.id, { valor: e.target.value === '' ? null : Number(e.target.value) })}
                          style={{ ...inp, maxWidth: 160, borderColor: foraFaixa ? '#ef4444' : undefined }} />
                        {un && <span style={{ fontSize: 13, color: 'var(--muted)' }}>{un}</span>}
                        {(item.min != null || item.max != null) && (
                          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                            faixa {item.min ?? '−∞'}…{item.max ?? '+∞'}
                          </span>
                        )}
                      </div>
                      {foraFaixa && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 3 }}>⚠️ Fora do limite — não conforme</div>}
                    </div>
                  )
                })()}
                {item.tipo === 'avaliacao' && (
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[1, 2, 3, 4, 5].map(n => (
                      <Star key={n} size={22} style={{ cursor: concluido ? 'default' : 'pointer' }}
                        fill={(r.nota || 0) >= n ? '#f59e0b' : 'none'} color="#f59e0b"
                        onClick={() => !concluido && setResp(item.id, { nota: n })} />
                    ))}
                  </div>
                )}
                {item.tipo === 'texto' && (
                  <textarea disabled={concluido} value={r.texto || ''} placeholder="Escreva a resposta…" rows={2}
                    onChange={e => setResp(item.id, { texto: e.target.value || null })}
                    style={{ ...inp, resize: 'vertical' }} />
                )}
                {item.tipo === 'qrcode' && (
                  <div>
                    {r.texto && <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>🔳 {r.texto}</div>}
                    {!concluido && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button type="button" onClick={() => setScanItemId(item.id)} style={{ ...btnGhost, padding: '6px 12px', fontSize: 12 }}>
                          <Camera size={14} /> {r.texto ? 'Escanear de novo' : 'Escanear código'}
                        </button>
                        <input value={r.texto || ''} placeholder="ou digite o código"
                          onChange={e => setResp(item.id, { texto: e.target.value || null })}
                          style={{ ...inp, flex: 1, minWidth: 120, fontSize: 12 }} />
                      </div>
                    )}
                  </div>
                )}
                {item.tipo === 'assinatura' && (
                  <div>
                    {r.assinatura ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <img src={r.assinatura} alt="assinatura" style={{ height: 56, border: '1px solid var(--border)', borderRadius: 6, background: '#fff' }} />
                        {!concluido && <button onClick={() => setResp(item.id, { assinatura: null })} style={{ ...btnGhost, padding: '4px 10px', fontSize: 12 }}>Refazer</button>}
                      </div>
                    ) : !concluido && (
                      <SignaturePad uploading={uploadingId === item.id} onSave={async (blob) => {
                        setUploadingId(item.id)
                        try {
                          const url = await uploadAnexo(new File([blob], 'assinatura.png', { type: 'image/png' }), 'checklists/assinaturas')
                          setResp(item.id, { assinatura: url })
                        } catch { toast('Falha ao salvar a assinatura.', 'error') }
                        finally { setUploadingId(null) }
                      }} />
                    )}
                  </div>
                )}
                {item.tipo === 'foto' && (
                  <div>
                    {r.foto_url && <a href={r.foto_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--bordo)', display: 'block', marginBottom: 4 }}>📎 ver foto enviada</a>}
                    {r.ia_status && (
                      <div style={{ fontSize: 11, marginBottom: 4, fontWeight: 600, color: r.ia_status === 'aprovado' ? '#16a34a' : r.ia_status === 'reprovado' ? '#ef4444' : '#f59e0b' }}>
                        {r.ia_status === 'aprovado' ? '🤖 IA aprovou' : r.ia_status === 'reprovado' ? '🤖 IA reprovou' : '🤖 IA: revisão necessária'}
                        {r.ia_motivo ? `: ${r.ia_motivo}` : ''}
                      </div>
                    )}
                    {!concluido && (
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, border: '1px dashed var(--bordo)', color: 'var(--bordo)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                        {uploadingId === item.id ? <Loader2 className="spin" size={14} /> : <Camera size={14} />}
                        {r.foto_url ? 'Trocar foto' : 'Tirar foto'}
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
                {/* Ação condicional disparada (resposta não conforme) */}
                {disparou && item.cond && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 10px', marginTop: 6 }}>
                    <div style={{ fontSize: 12, color: '#ef4444', fontWeight: 600 }}>⚠️ {item.cond.mensagem || 'Resposta não conforme — ação necessária'}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {item.cond.exigir_foto && <span style={{ color: r.foto_url ? '#16a34a' : '#ef4444' }}>{r.foto_url ? '✓ foto anexada' : '• exige foto'}</span>}
                      {item.cond.exigir_obs && <span style={{ color: (r.obs && r.obs.trim()) ? '#16a34a' : '#ef4444' }}>{(r.obs && r.obs.trim()) ? '✓ observação preenchida' : '• exige observação'}</span>}
                      {item.cond.abrir_nc && <span>• abrirá não conformidade</span>}
                      {item.cond.bloquear && <span style={{ color: '#ef4444' }}>• conclusão bloqueada</span>}
                    </div>
                    {item.cond.exigir_foto && !r.foto_url && item.tipo !== 'foto' && !concluido && (
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 6, padding: '6px 10px', borderRadius: 8, border: '1px dashed #ef4444', color: '#ef4444', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                        {uploadingId === item.id ? <Loader2 className="spin" size={14} /> : <Camera size={14} />} Anexar foto
                        <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                          onChange={e => uploadFoto(item.id, item, e.target.files)} />
                      </label>
                    )}
                  </div>
                )}
                {!concluido && (
                  <button onClick={() => setResp(item.id, { nao_executou: true })}
                    style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: 11, cursor: 'pointer', marginTop: 6, padding: 0, textDecoration: 'underline' }}>
                    Não consigo executar
                  </button>
                )}
                </>
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

      {scanItemId && (
        <ScannerModal
          onClose={() => setScanItemId(null)}
          onResult={txt => { setResp(scanItemId, { texto: txt }); setScanItemId(null) }}
        />
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
  const [uploadingRef, setUploadingRef] = useState<string | null>(null)

  const uploadRef = async (id: string, files: FileList | null) => {
    if (!files || !files[0]) return
    setUploadingRef(id)
    try {
      const url = await uploadAnexo(files[0], 'checklists/ref')
      setItens(prev => prev.map(i => i.id === id ? { ...i, foto_ref: url } : i))
    } catch (e) { toast('Falha ao enviar referência: ' + (e as Error).message, 'error') }
    finally { setUploadingRef(null) }
  }

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

              {/* Config avançada por item: instrução, limites, foto de referência */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', paddingLeft: 18, marginTop: 6 }}>
                <input value={it.instrucao || ''} onChange={e => setItem(it.id, { instrucao: e.target.value || null })}
                  placeholder="Instrução / orientação (opcional)" style={{ ...inp, flex: 1, minWidth: 160, fontSize: 12, padding: '5px 8px' }} />
                {TIPOS_NUM.includes(it.tipo) && (
                  <>
                    <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                      un <input value={it.unidade ?? ''} onChange={e => setItem(it.id, { unidade: e.target.value || null })}
                        placeholder={unidadePadrao(it.tipo)} style={{ ...inp, width: 56, padding: '4px 6px', fontSize: 12 }} />
                    </label>
                    <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                      mín <input type="number" step="any" value={it.min ?? ''} onChange={e => setItem(it.id, { min: e.target.value === '' ? null : Number(e.target.value) })}
                        style={{ ...inp, width: 64, padding: '4px 6px', fontSize: 12 }} />
                    </label>
                    <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                      máx <input type="number" step="any" value={it.max ?? ''} onChange={e => setItem(it.id, { max: e.target.value === '' ? null : Number(e.target.value) })}
                        style={{ ...inp, width: 64, padding: '4px 6px', fontSize: 12 }} />
                    </label>
                  </>
                )}
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 8px', borderRadius: 7, border: '1px dashed var(--border)', fontSize: 12, cursor: 'pointer', color: 'var(--muted)' }}>
                  {uploadingRef === it.id ? <Loader2 className="spin" size={12} /> : <Camera size={12} />}
                  {it.foto_ref ? 'Trocar padrão' : 'Foto de referência'}
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => uploadRef(it.id, e.target.files)} />
                </label>
                {it.foto_ref && <img src={it.foto_ref} alt="ref" style={{ width: 34, height: 34, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }} />}
              </div>

              {/* Ação condicional: quando a resposta for NÃO conforme */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', paddingLeft: 18, marginTop: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Se não conforme:</span>
                {(([['exigir_foto', 'exige foto'], ['exigir_obs', 'exige obs'], ['abrir_nc', 'abre NC'], ['bloquear', 'bloqueia']]) as [keyof ChecklistCondicao, string][]).map(([k, lb]) => (
                  <label key={k} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!it.cond?.[k]}
                      onChange={e => setItem(it.id, { cond: { ...it.cond, [k]: e.target.checked } as ChecklistCondicao })} /> {lb}
                  </label>
                ))}
                {(it.cond?.exigir_foto || it.cond?.exigir_obs || it.cond?.abrir_nc || it.cond?.bloquear) && (
                  <input value={it.cond?.mensagem || ''} onChange={e => setItem(it.id, { cond: { ...it.cond, mensagem: e.target.value || null } as ChecklistCondicao })}
                    placeholder="Mensagem ao operador (opcional)" style={{ ...inp, flex: 1, minWidth: 160, fontSize: 12, padding: '5px 8px' }} />
                )}
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

// Exporta uma matriz para CSV (separador ';' + BOM → abre certinho no Excel pt-BR)
function baixarCSV(nome: string, linhas: (string | number | null)[][]) {
  const esc = (v: string | number | null) => { const s = v == null ? '' : String(v); return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  const csv = linhas.map(l => l.map(esc).join(';')).join('\r\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = nome; a.click(); URL.revokeObjectURL(url)
}
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDuracao = (h: number) => h < 48 ? `${h.toFixed(1)}h` : `${(h / 24).toFixed(1)}d`
const escHtml = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

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
  const porTurno = useMemo(() => agrupa(execs, e => turnoLbl(e.turno)), [execs])
  const multiLoja = useMemo(() => new Set(execs.map(e => e.loja)).size > 1, [execs])

  // Não Conformidades achatadas + indicadores de qualidade do período
  const ncs = useMemo(() => {
    const out: { e: ChecklistExecucao; nc: NonNullable<ChecklistResposta['nc']> }[] = []
    for (const e of execs) for (const r of (e.respostas || [])) if (r.nc) out.push({ e, nc: r.nc })
    return out
  }, [execs])
  const qual = useMemo(() => {
    const encerradas = ncs.filter(x => x.nc.status === 'encerrada')
    const tempos = encerradas
      .map(x => x.nc.aberta_em && x.nc.encerrada_em ? (new Date(x.nc.encerrada_em).getTime() - new Date(x.nc.aberta_em).getTime()) / 3600000 : null)
      .filter((v): v is number => v != null && v >= 0)
    const cont: Record<string, number> = {}
    for (const x of ncs) { const k = `${x.e.loja}|${x.nc.item_txt || ''}`; cont[k] = (cont[k] || 0) + 1 }
    return {
      abertas: ncs.filter(x => x.nc.status !== 'encerrada').length,
      total: ncs.length,
      impacto: ncs.reduce((a, x) => a + (x.nc.impacto || 0), 0),
      tmedio: tempos.length ? tempos.reduce((a, b) => a + b, 0) / tempos.length : null,
      reincid: Object.values(cont).filter(n => n > 1).length,
      fotosRecusadas: execs.reduce((a, e) => a + (e.respostas || []).filter(r => r.ia_status === 'reprovado').length, 0),
    }
  }, [ncs, execs])

  const exportExecucoesCSV = () => {
    const head = ['Data', 'Loja', 'Setor', 'Turno', 'Checklist', 'Status', 'Responsável', 'Score', 'Concluído em']
    const rows = execs.map(e => [e.data, e.loja, e.setor || '', e.turno, e.titulo, e.status, e.responsavel_nome || '', e.score ?? '', e.concluido_em ? new Date(e.concluido_em).toLocaleString('pt-BR') : ''])
    baixarCSV(`checklists_${loja}_${hoje()}.csv`, [head, ...rows])
  }
  const exportNcsCSV = () => {
    const head = ['Data', 'Loja', 'Setor', 'Checklist', 'Item', 'Gravidade', 'Status', 'Motivo', 'Causa', 'Ação', 'Responsável', 'Prazo', 'Impacto R$', 'Aberta em', 'Encerrada em', 'Aprovada por']
    const rows = ncs.map(({ e, nc }) => [e.data, e.loja, e.setor || '', e.titulo, nc.item_txt || '', nc.gravidade, nc.status, nc.motivo_reprovacao || '', nc.causa || '', nc.acao || '', nc.responsavel || '', nc.prazo || '', nc.impacto ?? '', nc.aberta_em ? new Date(nc.aberta_em).toLocaleString('pt-BR') : '', nc.encerrada_em ? new Date(nc.encerrada_em).toLocaleString('pt-BR') : '', nc.aprovado_por || ''])
    if (!ncs.length) { toast('Sem não conformidades no período para exportar.', 'info'); return }
    baixarCSV(`nao_conformidades_${loja}_${hoje()}.csv`, [head, ...rows])
  }

  const gerarPDF = () => {
    const dataBR = new Date().toLocaleDateString('pt-BR')
    const card = (lbl: string, val: string) => `<div class="k"><div class="kl">${lbl}</div><div class="kv">${val}</div></div>`
    const rank = (titulo: string, linhas: Rank[]) => `<h3>${titulo}</h3><table><thead><tr><th>#</th><th>Nome</th><th>Concl.</th><th>Taxa</th><th>Score</th></tr></thead><tbody>${linhas.map((l, i) => `<tr><td>${i + 1}</td><td>${escHtml(l.chave)}</td><td>${l.concl}/${l.total}</td><td>${l.taxa}%</td><td>${l.score ?? '—'}</td></tr>`).join('') || '<tr><td colspan="5">Sem dados</td></tr>'}</tbody></table>`
    const ncTable = ncs.length ? `<h3>🚩 Não Conformidades (${ncs.length})</h3><table><thead><tr><th>Data</th><th>Loja</th><th>Item</th><th>Grav.</th><th>Status</th><th>Responsável</th><th>Impacto</th></tr></thead><tbody>${ncs.map(({ e, nc }) => `<tr><td>${escHtml(e.data)}</td><td>${escHtml(e.loja)}</td><td>${escHtml(nc.item_txt || '')}</td><td>${escHtml(nc.gravidade)}</td><td>${escHtml(nc.status)}</td><td>${escHtml(nc.responsavel || '—')}</td><td>${nc.impacto ? escHtml(brl(nc.impacto)) : '—'}</td></tr>`).join('')}</tbody></table>` : ''
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Operação Padrão — Relatório</title><style>
      body{font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;padding:28px;max-width:900px;margin:auto}
      h1{color:#6B1212;margin:0 0 4px} h3{color:#6B1212;margin:22px 0 8px;font-size:15px} .sub{color:#666;font-size:13px;margin-bottom:18px}
      .kpis{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:8px} .k{border:1px solid #ddd;border-radius:8px;padding:10px 14px;min-width:130px}
      .kl{font-size:11px;color:#666} .kv{font-size:20px;font-weight:700}
      table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:4px} th,td{border:1px solid #e2e2e2;padding:5px 8px;text-align:left} th{background:#f6f0f0;color:#6B1212}
      @media print{.noprint{display:none}}
    </style></head><body>
      <h1>Operação Padrão — Relatório</h1>
      <div class="sub">Loja <b>${escHtml(loja)}</b> &nbsp;|&nbsp; últimos ${dias} dias &nbsp;|&nbsp; ${dataBR}</div>
      <div class="kpis">${card('Execuções', String(kpi.tot))}${card('Concluídas', `${kpi.concl}/${kpi.tot}`)}${card('Taxa conclusão', `${kpi.taxa}%`)}${card('Score médio', kpi.media == null ? '—' : String(kpi.media))}</div>
      <div class="kpis">${card('NCs abertas', String(qual.abertas))}${card('Fotos recusadas', String(qual.fotosRecusadas))}${card('Tempo médio correção', qual.tmedio == null ? '—' : fmtDuracao(qual.tmedio))}${card('Reincidências', String(qual.reincid))}${card('Impacto estimado', brl(qual.impacto))}</div>
      ${multiLoja ? rank('🏪 Por unidade', porLoja) : ''}
      ${rank('🏆 Por colaborador', porColab)}
      ${rank('🏢 Por setor', porSetor)}
      ${rank('⏱️ Por turno', porTurno)}
      ${ncTable}
      <button class="noprint" onclick="window.print()" style="margin-top:20px;padding:8px 16px;background:#6B1212;color:#fff;border:none;border-radius:6px;cursor:pointer">Imprimir / Salvar PDF</button>
    </body></html>`
    const w = window.open('', '_blank')
    if (!w) { toast('Permita pop-ups para exportar o PDF.', 'warning'); return }
    w.document.write(html); w.document.close()
  }

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
        <button onClick={gerarPDF} disabled={!execs.length} style={btnGhost} title="Relatório em PDF (imprimir/salvar)">
          <FileDown size={14} /> PDF
        </button>
        <button onClick={exportExecucoesCSV} disabled={!execs.length} style={btnGhost} title="Exportar execuções em CSV (Excel)">
          <FileDown size={14} /> CSV execuções
        </button>
        <button onClick={exportNcsCSV} style={btnGhost} title="Exportar não conformidades em CSV (Excel)">
          <FileDown size={14} /> CSV NCs
        </button>
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

      {/* Indicadores de qualidade / Não Conformidades */}
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', margin: '4px 0 8px' }}>Qualidade & Não Conformidades</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
        <Kpi label="NCs abertas" valor={String(qual.abertas)} cor={qual.abertas ? '#ef4444' : '#16a34a'} />
        <Kpi label="Fotos recusadas (IA)" valor={String(qual.fotosRecusadas)} cor={qual.fotosRecusadas ? '#f59e0b' : 'var(--text)'} />
        <Kpi label="Tempo médio de correção" valor={qual.tmedio == null ? '—' : fmtDuracao(qual.tmedio)} />
        <Kpi label="Reincidências" valor={String(qual.reincid)} cor={qual.reincid ? '#f59e0b' : 'var(--text)'} />
        <Kpi label="Impacto estimado" valor={brl(qual.impacto)} cor={qual.impacto ? '#ef4444' : 'var(--text)'} />
      </div>

      {execs.length === 0 ? (
        <Empty texto="Sem execuções no período. Gere e conclua checklists na aba “Execução do dia”." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
          {multiLoja && <RankCard titulo="🏪 Ranking por unidade" linhas={porLoja} />}
          <RankCard titulo="🏆 Ranking por colaborador" linhas={porColab} />
          <RankCard titulo="🏢 Desempenho por setor" linhas={porSetor} />
          <RankCard titulo="⏱️ Conformidade por turno" linhas={porTurno} />
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

// ── Aba Não Conformidades (plano de ação) ────────────────────
type NcRow = { exec: ChecklistExecucao; nc: ChecklistNC; itemId: string }

function NcTab({ loja, user, toast }: {
  loja: string
  user: { name?: string; id?: string } | null
  toast: (m: string, t?: 'success' | 'error' | 'warning' | 'info') => void
}) {
  const [dias, setDias] = useState(30)
  const [execs, setExecs] = useState<ChecklistExecucao[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<'abertas' | 'todas'>('abertas')

  const load = useCallback(() => {
    setLoading(true)
    const fim = hoje()
    const ini = new Date(Date.now() - (dias - 1) * 86400000).toISOString().slice(0, 10)
    fetchChecklistExecucoesRange(loja, ini, fim).then(setExecs).finally(() => setLoading(false))
  }, [loja, dias])
  useEffect(() => { load() }, [load])

  const ncs = useMemo<NcRow[]>(() => {
    const out: NcRow[] = []
    for (const e of execs) for (const r of (e.respostas || [])) if (r.nc) out.push({ exec: e, nc: r.nc, itemId: r.item_id })
    const ord: Record<string, number> = { aberta: 0, em_correcao: 1, corrigida: 2, encerrada: 3 }
    return out.sort((a, b) => (ord[a.nc.status] - ord[b.nc.status]) || (a.exec.data < b.exec.data ? 1 : -1))
  }, [execs])
  const visiveis = filtro === 'abertas' ? ncs.filter(n => n.nc.status !== 'encerrada') : ncs

  const kpi = useMemo(() => ({
    abertas: ncs.filter(n => n.nc.status === 'aberta').length,
    andamento: ncs.filter(n => n.nc.status === 'em_correcao' || n.nc.status === 'corrigida').length,
    encerradas: ncs.filter(n => n.nc.status === 'encerrada').length,
  }), [ncs])

  const patchNc = async (exec: ChecklistExecucao, itemId: string, patch: Partial<ChecklistNC>) => {
    const novas = (exec.respostas || []).map(r => r.item_id === itemId && r.nc ? { ...r, nc: { ...r.nc, ...patch } } : r)
    try {
      await updateChecklistExecucao(exec.id, { respostas: novas })
      setExecs(prev => prev.map(e => e.id === exec.id ? { ...e, respostas: novas } : e))
      toast('Não conformidade atualizada.', 'success')
    } catch (e) { toast('Erro: ' + (e as Error).message, 'error') }
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Loader2 className="spin" size={28} /></div>

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>Período:</span>
        {[7, 30, 90].map(d => (
          <button key={d} onClick={() => setDias(d)} style={{
            padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, cursor: 'pointer',
            background: dias === d ? 'var(--bordo)' : 'var(--bg)', color: dias === d ? '#fff' : 'var(--text)',
          }}>{d} dias</button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={() => setFiltro(f => f === 'abertas' ? 'todas' : 'abertas')} style={btnGhost}>
          {filtro === 'abertas' ? 'Mostrar todas' : 'Só abertas'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
        <Kpi label="Abertas" valor={String(kpi.abertas)} cor="#ef4444" />
        <Kpi label="Em correção" valor={String(kpi.andamento)} cor="#f59e0b" />
        <Kpi label="Encerradas" valor={String(kpi.encerradas)} cor="#16a34a" />
      </div>

      {visiveis.length === 0 ? (
        <Empty texto="Nenhuma não conformidade no período. 🎉 As NCs abrem sozinhas quando um item é reprovado (foto reprovada, temperatura fora do limite ou não executado)." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visiveis.map(row => (
            <NcCard key={`${row.exec.id}-${row.itemId}`} row={row} userName={user?.name || null}
              onPatch={patch => patchNc(row.exec, row.itemId, patch)} />
          ))}
        </div>
      )}
    </div>
  )
}

function NcCard({ row, userName, onPatch }: {
  row: NcRow
  userName: string | null
  onPatch: (patch: Partial<ChecklistNC>) => Promise<void>
}) {
  const { exec, nc } = row
  const [g, setG] = useState(nc.gravidade)
  const [resp, setResp] = useState(nc.responsavel || '')
  const [prazo, setPrazo] = useState(nc.prazo || '')
  const [causa, setCausa] = useState(nc.causa || '')
  const [acao, setAcao] = useState(nc.acao || '')
  const [impacto, setImpacto] = useState(nc.impacto != null ? String(nc.impacto) : '')
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)
  const st = NC_STATUS[nc.status]; const gc = NC_GRAV[nc.gravidade]
  const encerrada = nc.status === 'encerrada'

  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn() } finally { setBusy(false) } }
  const salvar = () => run(() => onPatch({
    gravidade: g, responsavel: resp || null, prazo: prazo || null, causa: causa || null, acao: acao || null,
    impacto: impacto === '' ? null : Number(impacto),
    status: nc.status === 'aberta' ? 'em_correcao' : nc.status,
  }))
  const uploadCorrecao = async (files: FileList | null) => {
    if (!files || !files[0]) return
    setUploading(true)
    try { const url = await uploadAnexo(files[0], 'checklists/nc'); await onPatch({ foto_correcao: url, status: 'corrigida' }) }
    finally { setUploading(false) }
  }
  const encerrar = () => run(() => onPatch({ status: 'encerrada', aprovado_por: userName, encerrada_em: new Date().toISOString() }))
  const reabrir = () => run(() => onPatch({ status: 'em_correcao', aprovado_por: null, encerrada_em: null }))

  return (
    <div style={{ background: 'var(--card)', border: `1px solid ${st.cor}55`, borderLeft: `4px solid ${st.cor}`, borderRadius: 10, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{nc.item_txt || 'Item'}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
            🏪 {exec.loja} · {exec.setor || '—'} · {exec.titulo} · {new Date(exec.data + 'T12:00:00').toLocaleDateString('pt-BR')}
          </div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: gc.cor + '20', color: gc.cor }}>{gc.lbl}</span>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: st.cor + '20', color: st.cor }}>{st.lbl}</span>
      </div>

      {nc.motivo_reprovacao && <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 8 }}>⚠️ {nc.motivo_reprovacao}</div>}

      {/* Fotos: evidência x correção */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
        {nc.foto_evidencia && (
          <a href={nc.foto_evidencia} target="_blank" rel="noreferrer" style={{ textAlign: 'center' }}>
            <img src={nc.foto_evidencia} alt="evidência" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid #ef4444' }} />
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>problema</div>
          </a>
        )}
        {nc.foto_correcao && (
          <a href={nc.foto_correcao} target="_blank" rel="noreferrer" style={{ textAlign: 'center' }}>
            <img src={nc.foto_correcao} alt="correção" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid #16a34a' }} />
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>corrigido</div>
          </a>
        )}
      </div>

      {!encerrada && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginBottom: 10 }}>
          <div><label style={lbl}>Gravidade</label>
            <select value={g} onChange={e => setG(e.target.value as 'baixa' | 'media' | 'alta')} style={inp}>
              {(['baixa', 'media', 'alta'] as const).map(k => <option key={k} value={k}>{NC_GRAV[k].lbl}</option>)}
            </select></div>
          <div><label style={lbl}>Responsável pela correção</label><input value={resp} onChange={e => setResp(e.target.value)} placeholder="Nome" style={inp} /></div>
          <div><label style={lbl}>Prazo</label><input type="date" value={prazo} onChange={e => setPrazo(e.target.value)} style={inp} /></div>
          <div><label style={lbl}>Impacto estimado (R$)</label><input type="number" step="any" value={impacto} onChange={e => setImpacto(e.target.value)} placeholder="0,00" style={inp} /></div>
          <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Causa-raiz</label><input value={causa} onChange={e => setCausa(e.target.value)} placeholder="Por que aconteceu?" style={inp} /></div>
          <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Ação corretiva</label><input value={acao} onChange={e => setAcao(e.target.value)} placeholder="O que foi/será feito?" style={inp} /></div>
        </div>
      )}

      {encerrada ? (
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          ✅ Encerrada por {nc.aprovado_por || '—'} {nc.encerrada_em ? `em ${new Date(nc.encerrada_em).toLocaleString('pt-BR')}` : ''}
          {nc.acao ? ` · Ação: ${nc.acao}` : ''}
          <button onClick={reabrir} disabled={busy} style={{ ...btnGhost, marginLeft: 10, padding: '4px 10px', fontSize: 12 }}>Reabrir</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={salvar} disabled={busy} style={btnGhost}>{busy ? <Loader2 className="spin" size={14} /> : <Save size={14} />} Salvar plano</button>
          <label style={{ ...btnGhost, cursor: uploading ? 'wait' : 'pointer' }}>
            {uploading ? <Loader2 className="spin" size={14} /> : <Camera size={14} />} Foto da correção
            <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => uploadCorrecao(e.target.files)} />
          </label>
          <button onClick={encerrar} disabled={busy || nc.status !== 'corrigida'}
            title={nc.status !== 'corrigida' ? 'Envie a foto da correção antes de encerrar' : 'Validar e encerrar'}
            style={{ ...btnPrimary, opacity: nc.status !== 'corrigida' ? 0.5 : 1 }}>
            <CheckCircle2 size={14} /> Validar e encerrar
          </button>
        </div>
      )}
    </div>
  )
}

// ── Estilos ──────────────────────────────────────────────────
const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }
const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 3 }
const btnPrimary: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 8, border: 'none', background: 'var(--bordo)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const btnGhost: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const iconBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', cursor: 'pointer', fontSize: 14 }
