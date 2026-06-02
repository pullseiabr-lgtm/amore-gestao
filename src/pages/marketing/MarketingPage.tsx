import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Edit3, Trash2, Search, X, Check, Loader,
  TrendingUp, BarChart2, Target, Calendar, RefreshCw,
  ChevronLeft, ToggleLeft, ToggleRight, Send, AlertTriangle,
} from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'
import { useLoja } from '../../contexts/LojaContext'
import { useAuth } from '../../contexts/AuthContext'
import { fetchMktCampanhas, insertMktCampanha, updateMktCampanha, deleteMktCampanha } from '../../lib/db'
import type { MktCampanha } from '../../lib/db'
import AssistenteCampanhaIA from './AssistenteCampanhaIA'

// ── Tipos ─────────────────────────────────────────────────────

type CampanhaTipo = 'promocao' | 'evento' | 'digital' | 'acao_rua' | 'parceria' | 'redes_sociais'
type CampanhaStatus = 'planejamento' | 'em_execucao' | 'pausada' | 'finalizada' | 'cancelada'
type CampanhaIntensidade = 'leve' | 'media' | 'agressiva'

// ── Helpers ───────────────────────────────────────────────────

const TIPOS: Record<CampanhaTipo, { label: string; color: string; bg: string }> = {
  promocao:     { label: 'Promoção',     color: '#7C3AED', bg: '#EDE9FE' },
  evento:       { label: 'Evento',       color: '#6B1212', bg: '#FEE2E2' },
  digital:      { label: 'Digital',      color: '#1D4ED8', bg: '#DBEAFE' },
  acao_rua:     { label: 'Ação de Rua',  color: '#065F46', bg: '#D1FAE5' },
  parceria:     { label: 'Parceria',     color: '#92400E', bg: '#FEF3C7' },
  redes_sociais:{ label: 'Redes Sociais',color: '#0E7490', bg: '#CFFAFE' },
}

const STATUS: Record<CampanhaStatus, { label: string; color: string; bg: string }> = {
  planejamento:  { label: 'Planejamento', color: '#92400E', bg: '#FEF3C7' },
  em_execucao:   { label: 'Em execução',  color: '#1D4ED8', bg: '#DBEAFE' },
  pausada:       { label: 'Pausada',      color: '#6B7280', bg: '#F3F4F6' },
  finalizada:    { label: 'Finalizada',   color: '#065F46', bg: '#D1FAE5' },
  cancelada:     { label: 'Cancelada',    color: '#991B1B', bg: '#FEE2E2' },
}

const INTENSIDADE: Record<CampanhaIntensidade, { label: string; color: string; bg: string }> = {
  leve:      { label: 'Leve',      color: '#065F46', bg: '#D1FAE5' },
  media:     { label: 'Média',     color: '#92400E', bg: '#FEF3C7' },
  agressiva: { label: 'Agressiva', color: '#991B1B', bg: '#FEE2E2' },
}

function fmtBRL(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function fmtDate(iso: string | null) { if (!iso) return '—'; return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR') }

function Badge({ label, color, bg }: { label: string; color: string; bg: string }) {
  return <span style={{ background: bg, color, borderRadius: 12, padding: '2px 8px', fontSize: 10.5, fontWeight: 700, display: 'inline-block', whiteSpace: 'nowrap' }}>{label}</span>
}

// ── Toast ─────────────────────────────────────────────────────

function useToastLocal() {
  const [msg, setMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null)
  const toast = (text: string, type: 'ok' | 'err' = 'ok') => {
    setMsg({ text, type })
    setTimeout(() => setMsg(null), 3000)
  }
  const ToastEl = msg ? (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, background: msg.type === 'ok' ? 'var(--success)' : 'var(--danger)', color: '#fff', padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700, boxShadow: '0 4px 20px rgba(0,0,0,.2)', display: 'flex', alignItems: 'center', gap: 8 }}>
      {msg.type === 'ok' ? <Check size={14} /> : <X size={14} />} {msg.text}
    </div>
  ) : null
  return { toast, ToastEl }
}

// ── Formulário de Campanha ────────────────────────────────────

type FormData = {
  nome: string; descricao: string; tipo: CampanhaTipo; loja: string
  objetivo: string; intensidade: CampanhaIntensidade; status: CampanhaStatus
  data_inicio: string; data_fim: string
  investimento: string; receita_estimada: string; receita_real: string
  aprendizado: string; responsavel: string
}

function formDefault(lojaAtual: string): FormData {
  return {
    nome: '', descricao: '', tipo: 'promocao', loja: lojaAtual,
    objetivo: '', intensidade: 'media', status: 'planejamento',
    data_inicio: '', data_fim: '', investimento: '0',
    receita_estimada: '0', receita_real: '0',
    aprendizado: '', responsavel: '',
  }
}

function FormCampanha({ campanha, lojaAtual, lojas, onSalvo, onVoltar }: {
  campanha: MktCampanha | null
  lojaAtual: string
  lojas: string[]
  onSalvo: (c: MktCampanha) => void
  onVoltar: () => void
}) {
  const { toast, ToastEl } = useToastLocal()
  const { user } = useAuth()

  const [form, setForm] = useState<FormData>(
    campanha ? {
      nome: campanha.nome, descricao: campanha.descricao ?? '',
      tipo: (campanha.tipo as CampanhaTipo), loja: campanha.loja,
      objetivo: campanha.objetivo ?? '', intensidade: (campanha.intensidade as CampanhaIntensidade),
      status: (campanha.status as CampanhaStatus),
      data_inicio: campanha.data_inicio ?? '', data_fim: campanha.data_fim ?? '',
      investimento: String(campanha.investimento),
      receita_estimada: String(campanha.receita_estimada),
      receita_real: String(campanha.receita_real),
      aprendizado: campanha.aprendizado ?? '', responsavel: campanha.responsavel ?? '',
    } : formDefault(lojaAtual)
  )
  const [saving, setSaving] = useState(false)
  const [errMsg, setErrMsg] = useState('')

  const set = (k: keyof FormData, v: string) => setForm(f => ({ ...f, [k]: v }))

  const roi = (() => {
    const inv = parseFloat(form.investimento) || 0
    const rec = parseFloat(form.receita_real) || 0
    if (inv === 0) return null
    return ((rec - inv) / inv * 100).toFixed(1)
  })()

  const salvar = async () => {
    if (!form.nome.trim()) { toast('Nome da campanha é obrigatório', 'err'); return }
    setSaving(true); setErrMsg('')
    try {
      const payload: Omit<MktCampanha, 'id' | 'created_at' | 'updated_at'> = {
        loja: form.loja || lojaAtual,
        nome: form.nome.trim(),
        descricao: form.descricao.trim() || null,
        tipo: form.tipo,
        objetivo: form.objetivo.trim() || null,
        intensidade: form.intensidade,
        status: form.status,
        data_inicio: form.data_inicio || null,
        data_fim: form.data_fim || null,
        investimento: parseFloat(form.investimento) || 0,
        receita_estimada: parseFloat(form.receita_estimada) || 0,
        receita_real: parseFloat(form.receita_real) || 0,
        aprendizado: form.aprendizado.trim() || null,
        responsavel: form.responsavel.trim() || null,
        created_by: user?.name ?? null,
      }
      let saved: MktCampanha
      if (campanha) {
        saved = await updateMktCampanha(campanha.id, payload)
      } else {
        saved = await insertMktCampanha(payload)
      }
      onSalvo(saved)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar campanha.'
      setErrMsg(msg)
      toast(msg, 'err')
    }
    setSaving(false)
  }

  return (
    <div>
      {ToastEl}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button className="btn bo bsm" onClick={onVoltar}><ChevronLeft size={12} /> Voltar</button>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>{campanha ? 'Editar Campanha' : 'Nova Campanha'}</h2>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>{campanha ? campanha.nome : 'Preencha os dados da nova campanha'}</p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {errMsg && (
            <span style={{ fontSize: 11, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <AlertTriangle size={12} /> {errMsg}
            </span>
          )}
          <button className="btn bo" onClick={onVoltar}>Cancelar</button>
          <button className="btn bp" onClick={salvar} disabled={saving}>
            {saving ? <Loader size={11} className="spin" /> : <Check size={11} />} Salvar
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, maxWidth: 900 }}>
        <div className="fg" style={{ gridColumn: '1/-1' }}>
          <label className="fl">Nome da Campanha <span className="rq">*</span></label>
          <input className="inp" value={form.nome} onChange={e => set('nome', e.target.value)} placeholder="Ex: Promoção Quarta do Combo, Festival Temaki..." />
        </div>

        <div className="fg">
          <label className="fl">Tipo</label>
          <select className="sel" value={form.tipo} onChange={e => set('tipo', e.target.value as CampanhaTipo)}>
            {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>

        <div className="fg">
          <label className="fl">Loja</label>
          <select className="sel" value={form.loja} onChange={e => set('loja', e.target.value)}>
            {lojas.filter(l => l !== 'Todas as Lojas').map(l => <option key={l}>{l}</option>)}
          </select>
        </div>

        <div className="fg">
          <label className="fl">Status</label>
          <select className="sel" value={form.status} onChange={e => set('status', e.target.value as CampanhaStatus)}>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>

        <div className="fg">
          <label className="fl">Intensidade</label>
          <select className="sel" value={form.intensidade} onChange={e => set('intensidade', e.target.value as CampanhaIntensidade)}>
            {Object.entries(INTENSIDADE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>

        <div className="fg">
          <label className="fl">Data de Início</label>
          <input className="inp" type="date" value={form.data_inicio} onChange={e => set('data_inicio', e.target.value)} />
        </div>

        <div className="fg">
          <label className="fl">Data de Término</label>
          <input className="inp" type="date" value={form.data_fim} onChange={e => set('data_fim', e.target.value)} />
        </div>

        <div className="fg">
          <label className="fl">Objetivo</label>
          <input className="inp" value={form.objetivo} onChange={e => set('objetivo', e.target.value)} placeholder="Ex: Aumentar faturamento, atrair clientes..." />
        </div>

        <div className="fg">
          <label className="fl">Responsável</label>
          <input className="inp" value={form.responsavel} onChange={e => set('responsavel', e.target.value)} placeholder="Nome do responsável" />
        </div>

        <div style={{ gridColumn: '1/-1', borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Indicadores Financeiros</span>
        </div>

        <div className="fg">
          <label className="fl">Investimento (R$)</label>
          <input className="inp" type="number" min={0} step={0.01} value={form.investimento} onChange={e => set('investimento', e.target.value)} />
        </div>

        <div className="fg">
          <label className="fl">Receita Estimada (R$)</label>
          <input className="inp" type="number" min={0} step={0.01} value={form.receita_estimada} onChange={e => set('receita_estimada', e.target.value)} />
        </div>

        <div className="fg">
          <label className="fl">Receita Real (R$)</label>
          <input className="inp" type="number" min={0} step={0.01} value={form.receita_real} onChange={e => set('receita_real', e.target.value)} />
        </div>

        <div className="fg" style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 4 }}>
          {roi !== null && (
            <div style={{ padding: '10px 14px', borderRadius: 8, background: parseFloat(roi) >= 0 ? '#D1FAE5' : '#FEE2E2', color: parseFloat(roi) >= 0 ? '#065F46' : '#991B1B', fontWeight: 800, fontSize: 14 }}>
              ROI: {parseFloat(roi) >= 0 ? '+' : ''}{roi}%
            </div>
          )}
        </div>

        <div className="fg" style={{ gridColumn: '1/-1' }}>
          <label className="fl">Descrição</label>
          <textarea className="inp" rows={2} value={form.descricao} onChange={e => set('descricao', e.target.value)} placeholder="Descreva a campanha, mecânica, público-alvo..." style={{ resize: 'vertical' }} />
        </div>

        <div className="fg" style={{ gridColumn: '1/-1' }}>
          <label className="fl">Aprendizado / Resultado</label>
          <textarea className="inp" rows={2} value={form.aprendizado} onChange={e => set('aprendizado', e.target.value)} placeholder="O que funcionou? O que melhorar? Lições aprendidas..." style={{ resize: 'vertical' }} />
        </div>
      </div>
    </div>
  )
}

// ── Página Principal ──────────────────────────────────────────

export default function MarketingPage() {
  const { theme } = useTheme()
  const { loja, lojas } = useLoja()
  const lojaReal = (loja && loja !== 'Todas as Lojas') ? loja : (lojas.find(l => l !== 'Todas as Lojas') || lojas[0] || 'Geral')

  const { toast, ToastEl } = useToastLocal()
  const [campanhas, setCampanhas] = useState<MktCampanha[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'lista' | 'form' | 'ia'>('lista')
  const [editando, setEditando] = useState<MktCampanha | null>(null)
  const [busca, setBusca] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [filtroLoja, setFiltroLoja] = useState('')
  const [confirmDel, setConfirmDel] = useState<MktCampanha | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchMktCampanhas(loja)
      setCampanhas(data)
    } catch {
      toast('Erro ao carregar campanhas.', 'err')
    }
    setLoading(false)
  }, [loja])

  useEffect(() => { load() }, [load])

  const handleSalvo = (c: MktCampanha) => {
    setCampanhas(prev => {
      const exists = prev.find(x => x.id === c.id)
      return exists ? prev.map(x => x.id === c.id ? c : x) : [c, ...prev]
    })
    toast(editando ? 'Campanha atualizada!' : 'Campanha criada!')
    setView('lista')
    setEditando(null)
  }

  const handleDel = async () => {
    if (!confirmDel) return
    setDeleting(true)
    try {
      await deleteMktCampanha(confirmDel.id)
      setCampanhas(prev => prev.filter(x => x.id !== confirmDel.id))
      toast('Campanha removida')
    } catch {
      toast('Erro ao remover campanha', 'err')
    }
    setDeleting(false)
    setConfirmDel(null)
  }

  const toggleStatus = async (c: MktCampanha) => {
    const next: CampanhaStatus = c.status === 'em_execucao' ? 'pausada'
      : c.status === 'pausada' ? 'em_execucao'
      : c.status === 'planejamento' ? 'em_execucao'
      : c.status as CampanhaStatus
    if (next === c.status) return
    try {
      const updated = await updateMktCampanha(c.id, { status: next })
      setCampanhas(prev => prev.map(x => x.id === c.id ? updated : x))
      toast(`Status: ${STATUS[next as CampanhaStatus]?.label ?? next}`)
    } catch {
      toast('Erro ao atualizar status', 'err')
    }
  }

  if (view === 'form') {
    return (
      <>
        {ToastEl}
        <FormCampanha
          campanha={editando}
          lojaAtual={lojaReal}
          lojas={lojas.length > 0 ? lojas : [lojaReal]}
          onSalvo={handleSalvo}
          onVoltar={() => { setView('lista'); setEditando(null) }}
        />
      </>
    )
  }

  if (view === 'ia') {
    return (
      <>
        {ToastEl}
        <AssistenteCampanhaIA
          lojaAtual={lojaReal}
          onSalvo={handleSalvo}
          onVoltar={() => setView('lista')}
        />
      </>
    )
  }

  // ── KPIs ──
  const ativas = campanhas.filter(c => c.status === 'em_execucao')
  const finalizadas = campanhas.filter(c => c.status === 'finalizada')
  const totalInvestido = campanhas.reduce((s, c) => s + c.investimento, 0)
  const totalReceita = campanhas.reduce((s, c) => s + c.receita_real, 0)
  const roiMedio = totalInvestido > 0 ? ((totalReceita - totalInvestido) / totalInvestido * 100).toFixed(0) : '—'

  // ── Filtros ──
  const filtradas = campanhas
    .filter(c => !busca || c.nome.toLowerCase().includes(busca.toLowerCase()) || (c.responsavel ?? '').toLowerCase().includes(busca.toLowerCase()))
    .filter(c => !filtroTipo || c.tipo === filtroTipo)
    .filter(c => !filtroStatus || c.status === filtroStatus)
    .filter(c => !filtroLoja || c.loja === filtroLoja)

  return (
    <div>
      {ToastEl}

      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        {[
          { lbl: 'Total de Campanhas', val: String(campanhas.length), sub: `${ativas.length} em execução`, col: 'var(--bordo)', icon: <Target size={14}/> },
          { lbl: 'Investimento Total', val: fmtBRL(totalInvestido), sub: 'em campanhas', col: 'var(--warning)', icon: <TrendingUp size={14}/> },
          { lbl: 'Receita Gerada', val: fmtBRL(totalReceita), sub: 'resultado real', col: 'var(--success)', icon: <BarChart2 size={14}/> },
          { lbl: 'ROI Médio', val: roiMedio === '—' ? '—' : `+${roiMedio}%`, sub: 'retorno sobre investimento', col: typeof roiMedio === 'string' && roiMedio !== '—' && parseInt(roiMedio) >= 0 ? 'var(--success)' : 'var(--muted)', icon: <TrendingUp size={14}/> },
          { lbl: 'Finalizadas', val: String(finalizadas.length), sub: 'campanhas concluídas', col: '#6366F1', icon: <Check size={14}/> },
        ].map((k, i) => (
          <div className="kpi" key={i}>
            <div className="kpi-ac" style={{ background: k.col }} />
            <div className="kpi-lbl">{k.lbl}</div>
            <div className="kpi-val">{k.val}</div>
            <div className="kpi-sub">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Análise por tipo */}
      {campanhas.length > 0 && (() => {
        const byTipo: Record<string, { inv: number; rec: number; cnt: number }> = {}
        campanhas.forEach(c => {
          if (!byTipo[c.tipo]) byTipo[c.tipo] = { inv: 0, rec: 0, cnt: 0 }
          byTipo[c.tipo].inv += c.investimento
          byTipo[c.tipo].rec += c.receita_real
          byTipo[c.tipo].cnt += 1
        })
        const entries = Object.entries(byTipo).sort((a, b) => (b[1].rec - b[1].inv) - (a[1].rec - a[1].inv))
        const maxRoi = Math.max(...entries.map(([, d]) => d.inv > 0 ? ((d.rec - d.inv) / d.inv * 100) : 0), 1)
        return (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-hd">
              <span className="card-tt">📊 ROI por Tipo de Estratégia</span>
              <span className="badge bg-br">{entries.length} tipo(s)</span>
            </div>
            <div style={{ padding: '10px 16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px,1fr))', gap: 12 }}>
              {entries.map(([tipo, d]) => {
                const roi = d.inv > 0 ? ((d.rec - d.inv) / d.inv * 100) : 0
                const pct = Math.max(0, Math.min(100, (roi / maxRoi) * 100))
                const t = TIPOS[tipo as CampanhaTipo]
                return (
                  <div key={tipo} style={{ padding: '10px 12px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <Badge label={t?.label || tipo} color={t?.color || '#666'} bg={t?.bg || '#eee'} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: roi >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                        {roi >= 0 ? '+' : ''}{roi.toFixed(0)}% ROI
                      </span>
                    </div>
                    <div style={{ background: 'var(--border)', borderRadius: 4, height: 6 }}>
                      <div style={{ background: t?.color || 'var(--bordo)', height: 6, borderRadius: 4, width: `${pct}%` }} />
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
                      {d.cnt} campanha(s) · inv. {fmtBRL(d.inv)}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* Tabela */}
      <div className="card">
        <div className="card-hd">
          <span className="card-tt"><Send size={13} style={{ display: 'inline', marginRight: 4 }} />Campanhas de Marketing</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn bo bsm" onClick={load} disabled={loading}><RefreshCw size={11} /></button>
            <button className="btn bsm" onClick={() => setView('ia')}
              style={{ background: 'linear-gradient(135deg,#7c3aed,#a855f7)', color: '#fff', border: 'none' }}>
              ✨ Criar com IA
            </button>
            <button className="btn bp bsm" onClick={() => { setEditando(null); setView('form') }}>
              <Plus size={11} /> Nova Campanha
            </button>
          </div>
        </div>

        <div style={{ padding: '10px 15px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div className="sw-wrap" style={{ flex: 1, minWidth: 200 }}>
            <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
            <input className="srch" placeholder="Buscar campanha ou responsável..." value={busca} onChange={e => setBusca(e.target.value)} />
          </div>
          <select className="flt" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
            <option value="">Todos os tipos</option>
            {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select className="flt" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
            <option value="">Todos status</option>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select className="flt" value={filtroLoja} onChange={e => setFiltroLoja(e.target.value)}>
            <option value="">Todas as lojas</option>
            {(theme.stores || []).filter(l => l !== 'Todas as Lojas').map(l => <option key={l}>{l}</option>)}
          </select>
          {(busca || filtroTipo || filtroStatus || filtroLoja) && (
            <button className="btn bo bsm" onClick={() => { setBusca(''); setFiltroTipo(''); setFiltroStatus(''); setFiltroLoja('') }}>
              <X size={10} /> Limpar
            </button>
          )}
        </div>

        {loading ? (
          <div className="empty"><Loader size={24} className="spin" /></div>
        ) : campanhas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--muted)' }}>
            <BarChart2 size={40} style={{ opacity: .25, display: 'block', margin: '0 auto 12px' }} />
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Nenhuma campanha cadastrada</div>
            <p style={{ fontSize: 12, margin: '0 auto 16px', maxWidth: 320 }}>
              Crie sua primeira campanha e acompanhe ROI, investimento e resultados em tempo real.
            </p>
            <button className="btn bp bsm" onClick={() => { setEditando(null); setView('form') }}>
              <Plus size={11} /> Criar Primeira Campanha
            </button>
          </div>
        ) : filtradas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 32, color: 'var(--muted)', fontSize: 13 }}>
            Nenhuma campanha encontrada com os filtros aplicados.
          </div>
        ) : (
          <>
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>Campanha</th>
                    <th>Tipo</th>
                    <th>Loja</th>
                    <th>Período</th>
                    <th>Investimento</th>
                    <th>Receita Real</th>
                    <th>ROI</th>
                    <th>Intensidade</th>
                    <th>Status</th>
                    <th style={{ width: 90 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map(c => {
                    const roi = c.investimento > 0 ? ((c.receita_real - c.investimento) / c.investimento * 100) : null
                    const tipo = TIPOS[c.tipo as CampanhaTipo]
                    const stat = STATUS[c.status as CampanhaStatus]
                    const intens = INTENSIDADE[c.intensidade as CampanhaIntensidade]
                    return (
                      <tr key={c.id}>
                        <td>
                          <strong style={{ fontSize: 12 }}>{c.nome}</strong>
                          {c.objetivo && <div style={{ fontSize: 10, color: 'var(--muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.objetivo}</div>}
                          {c.responsavel && <div style={{ fontSize: 10, color: 'var(--muted)' }}>👤 {c.responsavel}</div>}
                        </td>
                        <td><Badge label={tipo?.label || c.tipo} color={tipo?.color || '#666'} bg={tipo?.bg || '#eee'} /></td>
                        <td style={{ fontSize: 11 }}>{c.loja}</td>
                        <td style={{ fontSize: 10, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                          {fmtDate(c.data_inicio)}{c.data_fim ? ` → ${fmtDate(c.data_fim)}` : ''}
                        </td>
                        <td style={{ fontSize: 12, fontWeight: 600 }}>{fmtBRL(c.investimento)}</td>
                        <td style={{ fontSize: 12, fontWeight: 700, color: c.receita_real > 0 ? 'var(--success)' : 'var(--muted)' }}>{fmtBRL(c.receita_real)}</td>
                        <td>
                          {roi !== null
                            ? <span style={{ fontSize: 11, fontWeight: 800, color: roi >= 0 ? 'var(--success)' : 'var(--danger)', background: roi >= 0 ? '#D1FAE5' : '#FEE2E2', padding: '2px 7px', borderRadius: 8 }}>
                                {roi >= 0 ? '+' : ''}{roi.toFixed(0)}%
                              </span>
                            : <span style={{ color: 'var(--muted)', fontSize: 11 }}>—</span>}
                        </td>
                        <td><Badge label={intens?.label || c.intensidade} color={intens?.color || '#666'} bg={intens?.bg || '#eee'} /></td>
                        <td>
                          <button onClick={() => toggleStatus(c)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 5 }}
                            title={`Status: ${stat?.label ?? c.status} — clique para alternar`}>
                            {c.status === 'em_execucao'
                              ? <ToggleRight size={14} style={{ color: 'var(--success)' }} />
                              : <ToggleLeft size={14} style={{ color: 'var(--muted)' }} />}
                            <Badge label={stat?.label || c.status} color={stat?.color || '#666'} bg={stat?.bg || '#eee'} />
                          </button>
                        </td>
                        <td onClick={e => e.stopPropagation()}>
                          <div className="ab" style={{ gap: 3 }}>
                            <button className="ib" title="Editar" onClick={() => { setEditando(c); setView('form') }}><Edit3 size={12} /></button>
                            <button className="ib rd" title="Excluir" onClick={() => setConfirmDel(c)}><Trash2 size={12} /></button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '8px 15px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--muted)' }}>
              {filtradas.length} de {campanhas.length} campanha(s) exibida(s)
            </div>
          </>
        )}
      </div>

      {/* Modal confirm delete */}
      {confirmDel && (
        <div className="ov open" onClick={() => setConfirmDel(null)}>
          <div className="modal" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <div className="mhd"><span className="mtt">Excluir Campanha</span><button className="mx" onClick={() => setConfirmDel(null)}>✕</button></div>
            <div className="mbd">
              <p style={{ margin: 0, fontSize: 13 }}>Excluir <strong>{confirmDel.nome}</strong>? Esta ação não pode ser desfeita.</p>
            </div>
            <div className="mft">
              <button className="btn bo" onClick={() => setConfirmDel(null)}>Cancelar</button>
              <button className="btn" style={{ background: 'var(--danger)', color: '#fff' }} onClick={handleDel} disabled={deleting}>
                {deleting ? <Loader size={11} className="spin" /> : <Trash2 size={11} />} Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unused icons to prevent TS unused warnings */}
      <div style={{ display: 'none' }}><Calendar size={1} /></div>
    </div>
  )
}
