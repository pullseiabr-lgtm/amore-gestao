import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Trash2, Edit3, RefreshCw, Clock, Calendar,
  CheckCircle2, XCircle, Zap, AlertTriangle, Power,
  ChevronLeft, Loader,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useLoja } from '../../contexts/LojaContext'
import { useTheme } from '../../contexts/ThemeContext'
import {
  fetchRequisoesAutomaticas, insertRequisicaoAutomatica,
  updateRequisicaoAutomatica, deleteRequisicaoAutomatica,
  fetchComprasListas,
} from '../../lib/db'
import type { RequisicaoAutomatica, ComprasLista } from '../../types/database'

// ── Helpers ───────────────────────────────────────────────────

const DIAS_SEMANA = [
  { v: 0, label: 'Domingo' },
  { v: 1, label: 'Segunda-feira' },
  { v: 2, label: 'Terça-feira' },
  { v: 3, label: 'Quarta-feira' },
  { v: 4, label: 'Quinta-feira' },
  { v: 5, label: 'Sexta-feira' },
  { v: 6, label: 'Sábado' },
]

const fmtDia = (d: number) => DIAS_SEMANA[d]?.label ?? '—'

const fmtTs = (d: string) =>
  new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })

/** Retorna a próxima data em que o dia-da-semana ocorre */
function proximaExecucao(diaSemana: number): string {
  const hoje = new Date()
  const diff = (diaSemana - hoje.getDay() + 7) % 7 || 7
  const prox = new Date(hoje)
  prox.setDate(hoje.getDate() + diff)
  return prox.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
}

// ── Tipos do formulário ───────────────────────────────────────

interface Form {
  loja: string
  lista_id: string
  lista_titulo: string
  dia_semana: number
  hora_maxima: string
  prazo_dias: number
  ativo: boolean
}

const FORM_EMPTY: Form = {
  loja: '',
  lista_id: '',
  lista_titulo: '',
  dia_semana: 1,
  hora_maxima: '17:00',
  prazo_dias: 1,
  ativo: true,
}

// ── Componente principal ──────────────────────────────────────

export default function RequisoesAutomaticasPage() {
  const { user } = useAuth()
  const { loja: lojaCtx, lojas } = useLoja()
  const { theme } = useTheme()

  const lojaReal =
    lojaCtx === 'Todas as Lojas'
      ? lojas.find(l => l !== 'Todas as Lojas') ?? lojaCtx
      : lojaCtx

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin'

  const [items, setItems] = useState<RequisicaoAutomatica[]>([])
  const [listas, setListas] = useState<ComprasLista[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── View state ─────────────────────────────────────────────
  const [view, setView] = useState<'list' | 'form'>('list')
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<Form>(FORM_EMPTY)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // ── Load data ──────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [reqs, ls] = await Promise.all([
        fetchRequisoesAutomaticas(lojaCtx === 'Todas as Lojas' ? undefined : lojaCtx),
        fetchComprasListas(lojaCtx === 'Todas as Lojas' ? undefined : lojaCtx),
      ])
      setItems(reqs)
      setListas(ls)
    } catch (e: any) {
      setError('Erro ao carregar dados: ' + (e?.message ?? 'desconhecido'))
    } finally {
      setLoading(false)
    }
  }, [lojaCtx])

  useEffect(() => { load() }, [load])

  // ── Form helpers ───────────────────────────────────────────
  function openNew() {
    setForm({ ...FORM_EMPTY, loja: lojaReal })
    setEditId(null)
    setView('form')
  }

  function openEdit(item: RequisicaoAutomatica) {
    setForm({
      loja: item.loja,
      lista_id: item.lista_id ?? '',
      lista_titulo: item.lista_titulo,
      dia_semana: item.dia_semana,
      hora_maxima: item.hora_maxima.slice(0, 5),
      prazo_dias: item.prazo_dias,
      ativo: item.ativo,
    })
    setEditId(item.id)
    setView('form')
  }

  function setF<K extends keyof Form>(k: K, v: Form[K]) {
    setForm(f => ({ ...f, [k]: v }))
  }

  // Ao mudar lista, atualizar o título cacheado
  function onListaChange(listaId: string) {
    const lista = listas.find(l => l.id === listaId)
    setForm(f => ({
      ...f,
      lista_id: listaId,
      lista_titulo: lista?.titulo ?? '',
    }))
  }

  // ── Save ───────────────────────────────────────────────────
  async function handleSave() {
    if (!form.lista_id) { setError('Selecione uma Lista de Compras.'); return }
    if (!form.loja)     { setError('Selecione a filial.'); return }
    setSaving(true)
    setError(null)
    try {
      const payload = {
        loja: form.loja,
        lista_id: form.lista_id || null,
        lista_titulo: form.lista_titulo,
        dia_semana: form.dia_semana,
        hora_maxima: form.hora_maxima + ':00',
        prazo_dias: form.prazo_dias,
        ativo: form.ativo,
        criado_por: user?.name ?? null,
      }
      if (editId) {
        await updateRequisicaoAutomatica(editId, payload)
      } else {
        await insertRequisicaoAutomatica(payload)
      }
      await load()
      setView('list')
    } catch (e: any) {
      setError('Erro ao salvar: ' + (e?.message ?? 'desconhecido'))
    } finally {
      setSaving(false)
    }
  }

  // ── Toggle ativo ───────────────────────────────────────────
  async function toggleAtivo(item: RequisicaoAutomatica) {
    try {
      await updateRequisicaoAutomatica(item.id, { ativo: !item.ativo })
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, ativo: !i.ativo } : i))
    } catch {
      setError('Erro ao atualizar status.')
    }
  }

  // ── Delete ─────────────────────────────────────────────────
  async function handleDelete(id: string) {
    try {
      await deleteRequisicaoAutomatica(id)
      setItems(prev => prev.filter(i => i.id !== id))
      setDeleteConfirm(null)
    } catch (e: any) {
      setError('Erro ao excluir: ' + (e?.message ?? 'desconhecido'))
    }
  }

  // ── Render ─────────────────────────────────────────────────
  const brand = theme.primary_color || 'var(--bordo)'

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 32, color: '#64748b' }}>
      <Loader size={18} className="spin" /> Carregando requisições automáticas…
    </div>
  )

  // ── FORM VIEW ──────────────────────────────────────────────
  if (view === 'form') return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <button
          onClick={() => { setView('list'); setError(null) }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}
        >
          <ChevronLeft size={16} /> Voltar
        </button>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#1e293b' }}>
          {editId ? 'Editar Requisição Automática' : 'Nova Requisição Automática'}
        </h2>
      </div>

      {error && (
        <div style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#DC2626', fontSize: 13 }}>
          <AlertTriangle size={14} style={{ marginRight: 6 }} />{error}
        </div>
      )}

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0', padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* Filial */}
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Filial *</label>
          <select
            value={form.loja}
            onChange={e => setF('loja', e.target.value)}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 13 }}
          >
            <option value="">Selecionar filial…</option>
            {(lojas.filter(l => l !== 'Todas as Lojas')).map(l => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>

        {/* Lista de Compras */}
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Lista de Compras *</label>
          <select
            value={form.lista_id}
            onChange={e => onListaChange(e.target.value)}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 13 }}
          >
            <option value="">Selecionar lista…</option>
            {listas.map(l => (
              <option key={l.id} value={l.id}>{l.titulo}</option>
            ))}
          </select>
          {listas.length === 0 && (
            <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 4, marginBottom: 0 }}>
              Nenhuma lista encontrada. Crie uma lista em Compras primeiro.
            </p>
          )}
        </div>

        {/* Dia da semana */}
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
            Dia da Semana para Criação *
          </label>
          <select
            value={form.dia_semana}
            onChange={e => setF('dia_semana', Number(e.target.value))}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 13 }}
          >
            {DIAS_SEMANA.map(d => (
              <option key={d.v} value={d.v}>{d.label}</option>
            ))}
          </select>
          <p style={{ fontSize: 12, color: '#64748b', marginTop: 4, marginBottom: 0 }}>
            Próxima execução: <strong>{proximaExecucao(form.dia_semana)}</strong>
          </p>
        </div>

        {/* Horário Máximo */}
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
            Horário Máximo
          </label>
          <input
            type="time"
            value={form.hora_maxima}
            onChange={e => setF('hora_maxima', e.target.value)}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 13 }}
          />
          <p style={{ fontSize: 12, color: '#64748b', marginTop: 4, marginBottom: 0 }}>
            Horário limite para criação da requisição no dia configurado.
          </p>
        </div>

        {/* Prazo de Resposta */}
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
            Prazo de Finalização (dias) *
          </label>
          <input
            type="number"
            min={1}
            max={30}
            value={form.prazo_dias}
            onChange={e => setF('prazo_dias', Math.max(1, Number(e.target.value)))}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 13 }}
          />
          <p style={{ fontSize: 12, color: '#64748b', marginTop: 4, marginBottom: 0 }}>
            Dias que o fornecedor terá para responder/finalizar a requisição.
          </p>
        </div>

        {/* Ativo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            onClick={() => setF('ativo', !form.ativo)}
            style={{
              width: 40, height: 22, borderRadius: 11,
              background: form.ativo ? brand : '#CBD5E1',
              border: 'none', cursor: 'pointer', position: 'relative', transition: 'background .2s',
            }}
          >
            <span style={{
              position: 'absolute', top: 2, left: form.ativo ? 20 : 2,
              width: 18, height: 18, borderRadius: '50%', background: '#fff',
              transition: 'left .2s',
            }} />
          </button>
          <span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>
            {form.ativo ? 'Ativa — será executada automaticamente' : 'Inativa — não será executada'}
          </span>
        </div>

        {/* Botões */}
        <div style={{ display: 'flex', gap: 10, paddingTop: 8 }}>
          <button
            onClick={() => { setView('list'); setError(null) }}
            style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: '1px solid #CBD5E1', background: '#fff', cursor: 'pointer', fontSize: 13, color: '#475569' }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ flex: 2, padding: '10px 0', borderRadius: 8, border: 'none', background: brand, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            {saving ? <Loader size={14} className="spin" /> : <Zap size={14} />}
            {saving ? 'Salvando…' : editId ? 'Salvar Alterações' : 'Criar Automação'}
          </button>
        </div>
      </div>
    </div>
  )

  // ── LIST VIEW ──────────────────────────────────────────────
  const ativas   = items.filter(i => i.ativo)
  const inativas = items.filter(i => !i.ativo)

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1e293b' }}>Requisições Automáticas</h2>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
            Agendamentos que criam requisições de compra automaticamente em um dia da semana.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={load}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #CBD5E1', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#475569' }}
          >
            <RefreshCw size={13} /> Atualizar
          </button>
          <button
            onClick={openNew}
            style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: brand, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}
          >
            <Plus size={14} /> Nova Automação
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#DC2626', fontSize: 13 }}>
          <AlertTriangle size={14} style={{ marginRight: 6 }} />{error}
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total',    val: items.length,   color: '#3B82F6', bg: '#EFF6FF', icon: <Zap size={15} /> },
          { label: 'Ativas',   val: ativas.length,  color: '#16A34A', bg: '#F0FDF4', icon: <CheckCircle2 size={15} /> },
          { label: 'Inativas', val: inativas.length, color: '#94A3B8', bg: '#F8FAFC', icon: <XCircle size={15} /> },
        ].map(k => (
          <div key={k.label} style={{ background: k.bg, borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ color: k.color }}>{k.icon}</div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: k.color, lineHeight: 1 }}>{k.val}</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Empty */}
      {items.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 24px', color: '#94A3B8' }}>
          <Zap size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
          <p style={{ fontSize: 15, margin: 0 }}>Nenhuma requisição automática cadastrada.</p>
          <p style={{ fontSize: 13, marginTop: 6 }}>Crie uma automação para gerar requisições em um dia fixo da semana.</p>
          <button
            onClick={openNew}
            style={{ marginTop: 16, padding: '10px 20px', borderRadius: 8, border: 'none', background: brand, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
          >
            <Plus size={13} style={{ marginRight: 6 }} /> Criar primeira automação
          </button>
        </div>
      )}

      {/* Cards */}
      {items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map(item => (
            <div
              key={item.id}
              style={{
                background: '#fff',
                borderRadius: 12,
                border: `1px solid ${item.ativo ? '#E2E8F0' : '#F1F5F9'}`,
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                flexWrap: 'wrap',
                opacity: item.ativo ? 1 : 0.65,
              }}
            >
              {/* Status dot */}
              <div style={{
                width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                background: item.ativo ? '#16A34A' : '#CBD5E1',
                boxShadow: item.ativo ? '0 0 0 3px #DCFCE7' : 'none',
              }} />

              {/* Info principal */}
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>
                  {item.lista_titulo || 'Lista sem nome'}
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  {item.loja}
                </div>
              </div>

              {/* Agendamento */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 140 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#374151' }}>
                  <Calendar size={11} color={brand} />
                  <strong>{fmtDia(item.dia_semana)}</strong>
                  <span style={{ color: '#94A3B8' }}>até</span>
                  <Clock size={11} color={brand} />
                  <strong>{item.hora_maxima.slice(0, 5)}</strong>
                </div>
                <div style={{ fontSize: 11, color: '#94A3B8' }}>
                  Prazo fornecedor: {item.prazo_dias} dia{item.prazo_dias !== 1 ? 's' : ''}
                </div>
                {item.ativo && (
                  <div style={{ fontSize: 11, color: '#16A34A', fontWeight: 600 }}>
                    Próxima: {proximaExecucao(item.dia_semana)}
                  </div>
                )}
              </div>

              {/* Criado em */}
              <div style={{ fontSize: 11, color: '#CBD5E1', minWidth: 60, textAlign: 'right' }}>
                {fmtTs(item.created_at)}
              </div>

              {/* Ações */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {/* Toggle ativo */}
                <button
                  onClick={() => toggleAtivo(item)}
                  title={item.ativo ? 'Desativar' : 'Ativar'}
                  style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: item.ativo ? '#DCFCE7' : '#F1F5F9',
                    border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: item.ativo ? '#16A34A' : '#94A3B8',
                  }}
                >
                  <Power size={14} />
                </button>

                {isAdmin && (
                  <>
                    {/* Editar */}
                    <button
                      onClick={() => openEdit(item)}
                      title="Editar"
                      style={{
                        width: 32, height: 32, borderRadius: 8,
                        background: '#EFF6FF', border: 'none', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#3B82F6',
                      }}
                    >
                      <Edit3 size={13} />
                    </button>

                    {/* Excluir */}
                    {deleteConfirm === item.id ? (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          onClick={() => handleDelete(item.id)}
                          style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#DC2626', color: '#fff', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
                        >
                          Confirmar
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #CBD5E1', background: '#fff', fontSize: 11, cursor: 'pointer', color: '#475569' }}
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(item.id)}
                        title="Excluir"
                        style={{
                          width: 32, height: 32, borderRadius: 8,
                          background: '#FEE2E2', border: 'none', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#DC2626',
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info box */}
      <div style={{ marginTop: 24, background: '#F8FAFC', borderRadius: 10, border: '1px solid #E2E8F0', padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <Zap size={16} color={brand} style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#374151' }}>Como funcionam as Requisições Automáticas?</p>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>
            Cada automação está associada a uma <strong>Lista de Compras</strong> e é agendada para um
            <strong> dia da semana</strong> específico. No dia configurado, a requisição é criada automaticamente
            com os itens da lista, e o fornecedor tem o <strong>prazo definido</strong> para finalizar.
            Você pode ativar ou desativar cada automação a qualquer momento.
          </p>
        </div>
      </div>
    </div>
  )
}
