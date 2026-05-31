import { useState, useEffect, useCallback } from 'react'
import { Loader2, RefreshCw, ArrowRight, Package, AlertTriangle, Settings2, Check, X } from 'lucide-react'
import { useLoja } from '../../contexts/LojaContext'
import { useAuth } from '../../contexts/AuthContext'
import { fetchRequisicoes, updateRequisicao, fetchAprovacaoConfig, upsertAprovacaoConfig, insertReqTimeline } from '../../lib/db'
import type { Requisicao, ReqStatus, ReqPrioridade, AprovacaoConfig, NivelAprovacao, FiscalStatus } from '../../types/database'

// ── Etapas macro do fluxo de suprimentos ─────────────────────
type EtapaId = 'solicitacao' | 'cotacao' | 'aprovacao' | 'pedido' | 'recebimento' | 'finalizado'

const ETAPAS: { id: EtapaId; label: string; cor: string; bg: string; status: ReqStatus[] }[] = [
  { id: 'solicitacao', label: '1 · Solicitação',        cor: '#64748b', bg: '#f1f5f9', status: ['rascunho'] },
  { id: 'cotacao',     label: '2 · Cotação',            cor: '#7c3aed', bg: '#ede9fe', status: ['em_cotacao', 'em_analise'] },
  { id: 'aprovacao',   label: '3 · Aprovação',          cor: '#ca8a04', bg: '#fef9c3', status: ['enviada', 'parcialmente_aprovada', 'aprovada', 'reprovada'] },
  { id: 'pedido',      label: '4 · Pedido / Compra',    cor: '#0891b2', bg: '#cffafe', status: ['em_separacao', 'compra_realizada'] },
  { id: 'recebimento', label: '5 · Recebim. / Fiscal',  cor: '#ea580c', bg: '#ffedd5', status: ['prestacao_pendente', 'em_auditoria'] },
  { id: 'finalizado',  label: '6 · Finalizado',         cor: '#16a34a', bg: '#dcfce7', status: ['concluida'] },
]

// Níveis de aprovação exigidos conforme o valor ultrapassa cada limite
const NIVEL_LABEL: Record<NivelAprovacao, string> = { gestor: 'Gestor', financeiro: 'Financeiro', diretoria: 'Diretoria' }

// Resultados da validação fiscal
const FISCAL_CFG: Record<FiscalStatus, { label: string; cor: string; bg: string }> = {
  pendente:             { label: 'Pendente',              cor: '#6b7280', bg: '#f3f4f6' },
  liberado:             { label: 'Liberado p/ entrada',   cor: '#16a34a', bg: '#dcfce7' },
  divergencia:          { label: 'Divergência',           cor: '#dc2626', bg: '#fee2e2' },
  aguardando_correcao:  { label: 'Aguardando correção',   cor: '#d97706', bg: '#ffedd5' },
}

// ── Leitura de Nota Fiscal por foto (Gemini visão) ──────────
interface NotaFiscalIA {
  numero?: string; fornecedor?: string; cnpj?: string; data_emissao?: string
  valor_total?: number; impostos?: number; condicao_pagamento?: string
  vencimentos?: string[]
  produtos?: { descricao?: string; quantidade?: number; unidade?: string; valor_unitario?: number; valor_total?: number }[]
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => { const s = String(r.result); resolve(s.slice(s.indexOf(',') + 1)) }
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

async function lerNotaFiscalIA(base64: string, mime: string): Promise<NotaFiscalIA> {
  const apiKey = (typeof localStorage !== 'undefined' ? localStorage.getItem('gemini_api_key') : '') || ''
  const params = new URLSearchParams({ model: 'gemini-2.5-flash' })
  if (apiKey) params.set('k', apiKey)
  const prompt = `Você é um leitor de notas fiscais brasileiras (NF-e / NFC-e / DANFE / cupom).
Analise a imagem e extraia os dados em JSON ESTRITO, sem nenhum texto fora do JSON, neste formato exato:
{"numero":"","fornecedor":"","cnpj":"","data_emissao":"","valor_total":0,"impostos":0,"condicao_pagamento":"","vencimentos":[],"produtos":[{"descricao":"","quantidade":0,"unidade":"","valor_unitario":0,"valor_total":0}]}
Use ponto como separador decimal. Datas em DD/MM/AAAA. Se um campo não for encontrado, use string vazia ou 0. Responda APENAS o JSON.`
  const resp = await fetch(`/api/gemini?${params}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: base64 } }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
    }),
  })
  const data = await resp.json()
  if (!resp.ok) throw new Error(data?.error || `Gemini HTTP ${resp.status}`)
  let txt: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  txt = txt.replace(/```json/gi, '').replace(/```/g, '').trim()
  const s = txt.indexOf('{'); const e = txt.lastIndexOf('}')
  if (s >= 0 && e > s) txt = txt.slice(s, e + 1)
  return JSON.parse(txt)
}

function niveisExigidos(total: number, cfg: AprovacaoConfig): NivelAprovacao[] {
  const req: NivelAprovacao[] = []
  if (total > cfg.limite_gestor) req.push('gestor')
  if (total > cfg.limite_financeiro) req.push('financeiro')
  if (total > cfg.limite_diretoria) req.push('diretoria')
  return req
}
function nivelAprovado(r: Requisicao, n: NivelAprovacao): boolean {
  return n === 'gestor' ? !!r.aprov_gestor_em : n === 'financeiro' ? !!r.aprov_financeiro_em : !!r.aprov_diretoria_em
}
function nivelAprovadoPor(r: Requisicao, n: NivelAprovacao): string | null | undefined {
  return n === 'gestor' ? r.aprov_gestor_por : n === 'financeiro' ? r.aprov_financeiro_por : r.aprov_diretoria_por
}

const STATUS_LABEL: Record<ReqStatus, string> = {
  rascunho: 'Rascunho', enviada: 'Aguard. aprovação', em_analise: 'Em análise', em_cotacao: 'Em cotação',
  parcialmente_aprovada: 'Aprov. parcial', aprovada: 'Aprovada', reprovada: 'Reprovada',
  em_separacao: 'Em separação', compra_realizada: 'Compra realizada', prestacao_pendente: 'Prestação pendente',
  em_auditoria: 'Em auditoria', concluida: 'Finalizada', cancelada: 'Cancelada',
}

const PRIO: Record<ReqPrioridade, { label: string; cor: string }> = {
  baixa: { label: 'Baixa', cor: '#15803d' }, media: { label: 'Média', cor: '#b45309' },
  alta: { label: 'Alta', cor: '#ea580c' }, urgente: { label: 'Urgente', cor: '#dc2626' },
}

const fmtR$ = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDt = (d: string | null) => d ? new Date(d + (d.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('pt-BR') : '—'
const vencido = (d: string | null) => d ? new Date(d + (d.length === 10 ? 'T00:00:00' : '')) < new Date(new Date().toDateString()) : false

function etapaDoStatus(s: ReqStatus): EtapaId | null {
  const e = ETAPAS.find(et => et.status.includes(s))
  return e ? e.id : null
}

function irParaRequisicoes() {
  document.dispatchEvent(new CustomEvent('amore-nav', { detail: 'requisicoes' }))
}

export default function FluxoSuprimentosPage() {
  const { loja } = useLoja()
  const { user } = useAuth()
  const [reqs, setReqs] = useState<Requisicao[]>([])
  const [loading, setLoading] = useState(true)
  const [cfg, setCfg] = useState<AprovacaoConfig | null>(null)
  const [saving, setSaving] = useState(false)
  // Modal de limites
  const [showLimites, setShowLimites] = useState(false)
  const [limForm, setLimForm] = useState({ limite_gestor: '', limite_financeiro: '', limite_diretoria: '' })
  // Modal de validação fiscal
  const [fiscalReq, setFiscalReq] = useState<Requisicao | null>(null)
  const [fiscalForm, setFiscalForm] = useState({ nf_numero: '', nf_valor: '', mercadoria_ok: true, obs: '' })
  // Leitura de NF por foto (IA)
  const [lendoNF, setLendoNF] = useState(false)
  const [nfIA, setNfIA] = useState<NotaFiscalIA | null>(null)
  const [nfErro, setNfErro] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [data, conf] = await Promise.all([fetchRequisicoes(loja), fetchAprovacaoConfig(loja)])
      setReqs(data)
      setCfg(conf)
    } finally { setLoading(false) }
  }, [loja])

  useEffect(() => { load() }, [load])

  // ── Aprovar um nível ──────────────────────────────────────
  const aprovarNivel = async (r: Requisicao, nivel: NivelAprovacao) => {
    if (!cfg) return
    setSaving(true)
    try {
      const agora = new Date().toISOString()
      const nome = user?.name || 'Gestor'
      const upd: Partial<Requisicao> = {}
      if (nivel === 'gestor') { upd.aprov_gestor_por = nome; upd.aprov_gestor_em = agora }
      if (nivel === 'financeiro') { upd.aprov_financeiro_por = nome; upd.aprov_financeiro_em = agora }
      if (nivel === 'diretoria') { upd.aprov_diretoria_por = nome; upd.aprov_diretoria_em = agora }

      // Verifica se, após este nível, todos os exigidos estão aprovados
      const exigidos = niveisExigidos(r.total_final || r.total_estimado || 0, cfg)
      const aprovadoAgora = (n: NivelAprovacao) => n === nivel || nivelAprovado(r, n)
      const tudoAprovado = exigidos.every(aprovadoAgora)
      if (tudoAprovado) { upd.status = 'aprovada'; upd.aprovador_nome = nome; upd.aprovador_at = agora }
      else { upd.status = 'parcialmente_aprovada' }

      await updateRequisicao(r.id, upd)
      try { await insertReqTimeline({ requisicao_id: r.id, tipo: 'aprovacao', descricao: `Aprovação ${NIVEL_LABEL[nivel]} por ${nome}${tudoAprovado ? ' — totalmente aprovada' : ''}`, usuario: nome, dados: null }) } catch { /* timeline opcional */ }
      await load()
    } finally { setSaving(false) }
  }

  // ── Aprovação direta (comprador, sem níveis extras exigidos) ──
  const aprovarComprador = async (r: Requisicao) => {
    setSaving(true)
    try {
      const nome = user?.name || 'Comprador'
      await updateRequisicao(r.id, { status: 'aprovada', aprovador_nome: nome, aprovador_at: new Date().toISOString() })
      try { await insertReqTimeline({ requisicao_id: r.id, tipo: 'aprovacao', descricao: `Aprovada por ${nome} (comprador)`, usuario: nome, dados: null }) } catch { /* opcional */ }
      await load()
    } finally { setSaving(false) }
  }

  // ── Reprovar ──────────────────────────────────────────────
  const reprovar = async (r: Requisicao) => {
    const motivo = window.prompt('Motivo da reprovação:')
    if (motivo === null) return
    setSaving(true)
    try {
      const nome = user?.name || 'Gestor'
      await updateRequisicao(r.id, { status: 'reprovada', aprov_reprovado_por: nome, aprov_reprovado_motivo: motivo || null })
      try { await insertReqTimeline({ requisicao_id: r.id, tipo: 'reprovacao', descricao: `Reprovada por ${nome}${motivo ? `: ${motivo}` : ''}`, usuario: nome, dados: null }) } catch { /* opcional */ }
      await load()
    } finally { setSaving(false) }
  }

  // ── Validação fiscal tripla ───────────────────────────────
  const abrirFiscal = (r: Requisicao) => {
    setFiscalForm({
      nf_numero: r.fiscal_nf_numero || '',
      nf_valor: r.fiscal_nf_valor != null ? String(r.fiscal_nf_valor) : '',
      mercadoria_ok: r.fiscal_mercadoria_ok ?? true,
      obs: r.fiscal_obs || '',
    })
    setNfIA(null); setNfErro(''); setLendoNF(false)
    setFiscalReq(r)
  }

  // ── Captura de NF por foto (GPT/IA) ───────────────────────
  const onFotoNF = async (file: File | undefined) => {
    if (!file) return
    setNfErro(''); setNfIA(null); setLendoNF(true)
    try {
      const base64 = await fileToBase64(file)
      const dados = await lerNotaFiscalIA(base64, file.type || 'image/jpeg')
      setNfIA(dados)
      setFiscalForm(f => ({
        ...f,
        nf_numero: dados.numero || f.nf_numero,
        nf_valor: dados.valor_total ? String(dados.valor_total) : f.nf_valor,
      }))
    } catch (e) {
      setNfErro((e as Error).message || 'Não foi possível ler a nota fiscal.')
    } finally { setLendoNF(false) }
  }
  const salvarFiscal = async (resultado: FiscalStatus) => {
    if (!fiscalReq) return
    setSaving(true)
    try {
      const nome = user?.name || 'Conferente'
      await updateRequisicao(fiscalReq.id, {
        fiscal_status: resultado,
        fiscal_nf_numero: fiscalForm.nf_numero || null,
        fiscal_nf_valor: fiscalForm.nf_valor ? Number(fiscalForm.nf_valor) : null,
        fiscal_mercadoria_ok: fiscalForm.mercadoria_ok,
        fiscal_obs: fiscalForm.obs || null,
        fiscal_conferido_por: nome,
        fiscal_conferido_em: new Date().toISOString(),
      })
      try { await insertReqTimeline({ requisicao_id: fiscalReq.id, tipo: 'compra', descricao: `Validação fiscal: ${FISCAL_CFG[resultado].label} por ${nome}`, usuario: nome, dados: null }) } catch { /* opcional */ }
      setFiscalReq(null)
      await load()
    } finally { setSaving(false) }
  }

  // ── Salvar limites ────────────────────────────────────────
  const abrirLimites = () => {
    if (!cfg) return
    setLimForm({ limite_gestor: String(cfg.limite_gestor), limite_financeiro: String(cfg.limite_financeiro), limite_diretoria: String(cfg.limite_diretoria) })
    setShowLimites(true)
  }
  const salvarLimites = async () => {
    setSaving(true)
    try {
      await upsertAprovacaoConfig({
        loja,
        limite_gestor: Number(limForm.limite_gestor) || 0,
        limite_financeiro: Number(limForm.limite_financeiro) || 0,
        limite_diretoria: Number(limForm.limite_diretoria) || 0,
      })
      setShowLimites(false)
      await load()
    } finally { setSaving(false) }
  }

  // Apenas requisições ativas no pipeline (exclui canceladas)
  const ativas = reqs.filter(r => r.status !== 'cancelada')
  const porEtapa = (id: EtapaId) => ativas.filter(r => etapaDoStatus(r.status) === id)

  const totalAberto = ativas
    .filter(r => r.status !== 'concluida')
    .reduce((a, r) => a + (r.total_final || r.total_estimado || 0), 0)
  const atrasadas = ativas.filter(r => r.status !== 'concluida' && vencido(r.prazo_entrega)).length
  const emFluxo = ativas.filter(r => r.status !== 'concluida').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Pipeline de Suprimentos</h2>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
            Fluxo das requisições da loja <strong>{loja}</strong> — solicitação → cotação → aprovação → pedido → recebimento → estoque
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={abrirLimites} disabled={!cfg}
            style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Settings2 size={14} /> Limites
          </button>
          <button onClick={load}
            style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={14} /> Atualizar
          </button>
        </div>
      </div>

      {/* Régua de limites (resumo) */}
      {cfg && !loading && (
        <div style={{ fontSize: 11.5, color: 'var(--muted)', display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <span>Régua de aprovação:</span>
          <span>Comprador <strong>qualquer valor</strong></span>
          <span>· +Gestor acima de <strong>{fmtR$(cfg.limite_gestor)}</strong></span>
          <span>· +Financeiro acima de <strong>{fmtR$(cfg.limite_financeiro)}</strong></span>
          <span>· +Diretoria acima de <strong>{fmtR$(cfg.limite_diretoria)}</strong></span>
        </div>
      )}

      {/* Métricas */}
      {!loading && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[
            { lbl: 'Em fluxo', val: emFluxo, cor: '#2563eb' },
            { lbl: 'Atrasadas', val: atrasadas, cor: '#dc2626' },
            { lbl: 'Finalizadas', val: porEtapa('finalizado').length, cor: '#16a34a' },
            { lbl: 'Valor em aberto', val: fmtR$(totalAberto), cor: '#9333ea' },
          ].map(m => (
            <div key={m.lbl} style={{ flex: '1 1 130px', minWidth: 130, background: 'var(--card)', border: '1px solid var(--border)', borderTop: `3px solid ${m.cor}`, borderRadius: 10, padding: '10px 14px' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: m.cor, lineHeight: 1.1 }}>{m.val}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{m.lbl}</div>
            </div>
          ))}
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>
          <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', opacity: 0.4 }} />
        </div>
      )}

      {/* Pipeline Kanban */}
      {!loading && (
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', flex: 1, minHeight: 0, paddingBottom: 8 }}>
          {ETAPAS.map((etapa, idx) => {
            const cards = porEtapa(etapa.id)
            const totalEtapa = cards.reduce((a, r) => a + (r.total_final || r.total_estimado || 0), 0)
            return (
              <div key={etapa.id} style={{ minWidth: 250, maxWidth: 290, flex: '0 0 270px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Cabeçalho etapa */}
                <div style={{ padding: '10px 12px', borderRadius: 10, background: etapa.bg, borderTop: `3px solid ${etapa.cor}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 700, fontSize: 12.5, color: etapa.cor }}>{etapa.label}</span>
                    <span style={{ background: etapa.cor, color: '#fff', borderRadius: 20, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>{cards.length}</span>
                  </div>
                  {totalEtapa > 0 && <div style={{ fontSize: 11, color: etapa.cor, marginTop: 3, opacity: 0.85 }}>{fmtR$(totalEtapa)}</div>}
                  {idx < ETAPAS.length - 1 && (
                    <ArrowRight size={12} style={{ position: 'relative', float: 'right', color: etapa.cor, opacity: 0.4, marginTop: -14 }} />
                  )}
                </div>

                {/* Cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, overflowY: 'auto', maxHeight: 'calc(100vh - 320px)' }}>
                  {cards.map(r => {
                    const prio = PRIO[r.prioridade]
                    const atrasou = r.status !== 'concluida' && vencido(r.prazo_entrega)
                    return (
                      <div key={r.id} onClick={irParaRequisicoes} title="Abrir em Requisições"
                        style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, cursor: 'pointer', position: 'relative' }}
                        onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.1)')}
                        onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}>
                        <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', borderRadius: '10px 0 0 10px', background: prio.cor }} />
                        <div style={{ paddingLeft: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--bordo)' }}>REQ-{String(r.numero).padStart(4, '0')}</span>
                            <span style={{ fontSize: 10, fontWeight: 600, color: prio.cor }}>{prio.label}</span>
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35, marginBottom: 6 }}>{r.titulo}</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                            <span style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px', fontSize: 10, color: 'var(--muted)' }}>{STATUS_LABEL[r.status]}</span>
                            {r.setor && <span style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px', fontSize: 10, color: 'var(--muted)' }}>{r.setor}</span>}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'var(--muted)' }}>
                            <span>{fmtR$(r.total_final || r.total_estimado || 0)}</span>
                            {r.prazo_entrega && (
                              <span style={{ color: atrasou ? '#dc2626' : 'var(--muted)', fontWeight: atrasou ? 600 : 400 }}>
                                {atrasou && '⚠ '}{fmtDt(r.prazo_entrega)}
                              </span>
                            )}
                          </div>
                          {r.responsavel_nome && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{r.responsavel_nome}</div>}

                          {/* Régua de aprovação multinível (somente etapa Aprovação) */}
                          {etapa.id === 'aprovacao' && cfg && (
                            <div onClick={e => e.stopPropagation()} style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                              {r.status === 'aprovada' ? (
                                <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>✓ Aprovada{r.aprovador_nome ? ` · ${r.aprovador_nome}` : ''}</div>
                              ) : r.status === 'reprovada' ? (
                                <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 600 }}>✕ Reprovada{r.aprov_reprovado_motivo ? ` · ${r.aprov_reprovado_motivo}` : ''}</div>
                              ) : (() => {
                                const total = r.total_final || r.total_estimado || 0
                                const exig = niveisExigidos(total, cfg)
                                if (exig.length === 0) {
                                  return (
                                    <div style={{ display: 'flex', gap: 6 }}>
                                      <button onClick={() => aprovarComprador(r)} disabled={saving}
                                        style={{ flex: 1, padding: '5px 8px', borderRadius: 6, border: 'none', background: '#16a34a', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>✓ Aprovar</button>
                                      <button onClick={() => reprovar(r)} disabled={saving}
                                        style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #dc2626', background: 'transparent', color: '#dc2626', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>✕</button>
                                    </div>
                                  )
                                }
                                const proximo = exig.find(n => !nivelAprovado(r, n))
                                return (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                      <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: '#dcfce7', color: '#15803d', fontWeight: 600 }}>✓ Comprador</span>
                                      {exig.map(n => {
                                        const ok = nivelAprovado(r, n)
                                        return (
                                          <span key={n} title={ok ? `${NIVEL_LABEL[n]} · ${nivelAprovadoPor(r, n)}` : `Aguardando ${NIVEL_LABEL[n]}`}
                                            style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, fontWeight: 600,
                                              background: ok ? '#dcfce7' : '#f3f4f6', color: ok ? '#15803d' : '#6b7280' }}>
                                            {ok ? '✓' : '○'} {NIVEL_LABEL[n]}
                                          </span>
                                        )
                                      })}
                                    </div>
                                    {proximo && (
                                      <div style={{ display: 'flex', gap: 6 }}>
                                        <button onClick={() => aprovarNivel(r, proximo)} disabled={saving}
                                          style={{ flex: 1, padding: '5px 8px', borderRadius: 6, border: 'none', background: '#16a34a', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>✓ Aprovar como {NIVEL_LABEL[proximo]}</button>
                                        <button onClick={() => reprovar(r)} disabled={saving}
                                          style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #dc2626', background: 'transparent', color: '#dc2626', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>✕</button>
                                      </div>
                                    )}
                                  </div>
                                )
                              })()}
                            </div>
                          )}

                          {/* Validação fiscal (somente etapa Recebimento/Fiscal) */}
                          {etapa.id === 'recebimento' && (
                            <div onClick={e => e.stopPropagation()} style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                              {r.fiscal_status && r.fiscal_status !== 'pendente' ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  <span style={{ alignSelf: 'flex-start', fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 700, background: FISCAL_CFG[r.fiscal_status].bg, color: FISCAL_CFG[r.fiscal_status].cor }}>
                                    🧾 {FISCAL_CFG[r.fiscal_status].label}
                                  </span>
                                  <button onClick={() => abrirFiscal(r)} style={{ alignSelf: 'flex-start', fontSize: 11, background: 'none', border: 'none', color: 'var(--bordo)', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>revisar conferência</button>
                                </div>
                              ) : (
                                <button onClick={() => abrirFiscal(r)}
                                  style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid var(--bordo)', background: 'transparent', color: 'var(--bordo)', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                                  🧾 Conferir Fiscal (NF)
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  {cards.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '20px 8px', color: 'var(--muted)', fontSize: 12, border: '1px dashed var(--border)', borderRadius: 8 }}>
                      —
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!loading && ativas.length === 0 && (
        <div style={{ textAlign: 'center', padding: 50, color: 'var(--muted)' }}>
          <Package size={36} style={{ opacity: 0.3, marginBottom: 10 }} />
          <div style={{ fontSize: 14 }}>Nenhuma requisição no fluxo.</div>
          <button onClick={irParaRequisicoes}
            style={{ marginTop: 14, padding: '9px 18px', borderRadius: 8, border: 'none', background: 'var(--bordo)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            Criar requisição
          </button>
        </div>
      )}

      {!loading && atrasadas > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px' }}>
          <AlertTriangle size={14} /> {atrasadas} requisição{atrasadas > 1 ? 'ões' : ''} com prazo de entrega vencido — priorize.
        </div>
      )}

      {/* Modal de validação fiscal tripla */}
      {fiscalReq && (() => {
        const pedido = fiscalReq.total_final || fiscalReq.total_estimado || 0
        const nf = fiscalForm.nf_valor ? Number(fiscalForm.nf_valor) : null
        const difNf = nf != null ? nf - pedido : null
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div style={{ background: 'var(--card)', borderRadius: 14, padding: 24, width: '100%', maxWidth: 460, maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Validação Fiscal — REQ-{String(fiscalReq.numero).padStart(4, '0')}</h3>
                <button onClick={() => setFiscalReq(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={18} /></button>
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>Conferência tripla: Pedido × Nota Fiscal × Mercadoria.</div>

              {/* 1. Pedido */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)' }}>1 · PEDIDO</div>
                  <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>{fmtR$(pedido)}</div>
                </div>
                <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)' }}>DIFERENÇA NF</div>
                  <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2, color: difNf == null ? 'var(--muted)' : Math.abs(difNf) < 0.01 ? '#16a34a' : '#dc2626' }}>
                    {difNf == null ? '—' : (difNf > 0 ? '+' : '') + fmtR$(difNf)}
                  </div>
                </div>
              </div>

              {/* 2. Nota Fiscal */}
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 6 }}>2 · NOTA FISCAL</div>

              {/* Captura por foto (IA) */}
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px', borderRadius: 8, border: '1px dashed var(--bordo)', background: 'var(--bg)', cursor: lendoNF ? 'wait' : 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--bordo)', marginBottom: 10 }}>
                {lendoNF ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Lendo a nota…</> : <>📷 Ler NF por foto (IA)</>}
                <input type="file" accept="image/*" capture="environment" disabled={lendoNF}
                  onChange={e => onFotoNF(e.target.files?.[0])} style={{ display: 'none' }} />
              </label>
              {nfErro && <div style={{ fontSize: 12, color: '#dc2626', marginBottom: 10 }}>⚠ {nfErro}</div>}

              {/* Dados extraídos pela IA */}
              {nfIA && (
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 12 }}>
                  <div style={{ fontWeight: 700, color: '#15803d', marginBottom: 4 }}>🤖 Dados lidos da nota</div>
                  {nfIA.fornecedor && <div><strong>Fornecedor:</strong> {nfIA.fornecedor}{nfIA.cnpj ? ` · ${nfIA.cnpj}` : ''}</div>}
                  {nfIA.data_emissao && <div><strong>Emissão:</strong> {nfIA.data_emissao}{nfIA.condicao_pagamento ? ` · ${nfIA.condicao_pagamento}` : ''}</div>}
                  {nfIA.impostos ? <div><strong>Impostos:</strong> {fmtR$(nfIA.impostos)}</div> : null}
                  {!!nfIA.produtos?.length && (
                    <div style={{ marginTop: 4 }}>
                      <strong>{nfIA.produtos.length} produto(s):</strong>
                      <div style={{ maxHeight: 90, overflowY: 'auto', marginTop: 2 }}>
                        {nfIA.produtos.slice(0, 12).map((p, i) => (
                          <div key={i} style={{ color: 'var(--muted)' }}>• {p.descricao} — {p.quantidade} {p.unidade} {p.valor_total ? `(${fmtR$(p.valor_total)})` : ''}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                <input value={fiscalForm.nf_numero} onChange={e => setFiscalForm(f => ({ ...f, nf_numero: e.target.value }))}
                  placeholder="Número da NF"
                  style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13 }} />
                <input type="number" step="0.01" min="0" value={fiscalForm.nf_valor} onChange={e => setFiscalForm(f => ({ ...f, nf_valor: e.target.value }))}
                  placeholder="Valor da NF (R$)"
                  style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13 }} />
              </div>

              {/* Conciliação automática */}
              {nfIA && difNf != null && (
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12, padding: '8px 10px', borderRadius: 8,
                  background: Math.abs(difNf) < 0.01 ? '#dcfce7' : Math.abs(difNf) <= pedido * 0.02 ? '#fef9c3' : '#fee2e2',
                  color: Math.abs(difNf) < 0.01 ? '#15803d' : Math.abs(difNf) <= pedido * 0.02 ? '#854d0e' : '#dc2626' }}>
                  {Math.abs(difNf) < 0.01
                    ? '✓ Conciliação OK — NF confere com o pedido'
                    : Math.abs(difNf) <= pedido * 0.02
                      ? `⚠ Pequena diferença (${fmtR$(Math.abs(difNf))}) — necessita aprovação manual`
                      : `✕ Divergência de ${fmtR$(Math.abs(difNf))} entre NF e pedido`}
                </div>
              )}

              {/* 3. Mercadoria */}
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 6 }}>3 · MERCADORIA</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <button onClick={() => setFiscalForm(f => ({ ...f, mercadoria_ok: true }))}
                  style={{ flex: 1, padding: '8px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, border: `1px solid ${fiscalForm.mercadoria_ok ? '#16a34a' : 'var(--border)'}`, background: fiscalForm.mercadoria_ok ? '#dcfce7' : 'var(--bg)', color: fiscalForm.mercadoria_ok ? '#15803d' : 'var(--muted)' }}>
                  ✓ Confere com o pedido
                </button>
                <button onClick={() => setFiscalForm(f => ({ ...f, mercadoria_ok: false }))}
                  style={{ flex: 1, padding: '8px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, border: `1px solid ${!fiscalForm.mercadoria_ok ? '#dc2626' : 'var(--border)'}`, background: !fiscalForm.mercadoria_ok ? '#fee2e2' : 'var(--bg)', color: !fiscalForm.mercadoria_ok ? '#dc2626' : 'var(--muted)' }}>
                  ✕ Há divergência
                </button>
              </div>

              <textarea value={fiscalForm.obs} onChange={e => setFiscalForm(f => ({ ...f, obs: e.target.value }))}
                rows={2} placeholder="Observações (impostos, produto, condição de pagamento…)"
                style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, resize: 'vertical', marginBottom: 16 }} />

              {/* Resultado */}
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 8 }}>RESULTADO DA CONFERÊNCIA</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button onClick={() => salvarFiscal('liberado')} disabled={saving}
                  style={{ padding: '10px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                  ✓ Liberado para entrada no estoque
                </button>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => salvarFiscal('divergencia')} disabled={saving}
                    style={{ flex: 1, padding: '9px', borderRadius: 8, border: '1px solid #dc2626', background: 'transparent', color: '#dc2626', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                    Divergência encontrada
                  </button>
                  <button onClick={() => salvarFiscal('aguardando_correcao')} disabled={saving}
                    style={{ flex: 1, padding: '9px', borderRadius: 8, border: '1px solid #d97706', background: 'transparent', color: '#d97706', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                    Aguardar correção
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Modal de limites orçamentários */}
      {showLimites && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--card)', borderRadius: 14, padding: 24, width: '100%', maxWidth: 420 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Limites de Aprovação</h3>
              <button onClick={() => setShowLimites(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={18} /></button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>
              Acima de cada valor, o nível correspondente passa a ser exigido na aprovação.
            </div>
            <div style={{ display: 'grid', gap: 14 }}>
              {([
                { k: 'limite_gestor', lbl: 'Exigir Gestor acima de (R$)' },
                { k: 'limite_financeiro', lbl: 'Exigir Financeiro acima de (R$)' },
                { k: 'limite_diretoria', lbl: 'Exigir Diretoria acima de (R$)' },
              ] as const).map(f => (
                <div key={f.k}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>{f.lbl}</label>
                  <input type="number" step="0.01" min="0" value={limForm[f.k]}
                    onChange={e => setLimForm(s => ({ ...s, [f.k]: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13 }} />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowLimites(false)}
                style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
              <button onClick={salvarLimites} disabled={saving}
                style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: saving ? 'var(--border)' : 'var(--bordo)', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={14} />} Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }`}</style>
    </div>
  )
}
