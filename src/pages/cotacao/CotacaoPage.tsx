import { useState, useEffect, useCallback } from 'react'
import { Search, ArrowLeft, Loader2, RefreshCw, ShoppingCart, Plus, X } from 'lucide-react'
import { useLoja } from '../../contexts/LojaContext'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../hooks/useToast'
import { fetchRequisicoes, insertRequisicao, insertReqTimeline } from '../../lib/db'
import AnaliseCotacao from '../../components/cotacao/AnaliseCotacao'
import type { Requisicao } from '../../types/database'

const fmtR$ = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDt = (d: string | null) => d ? new Date(d + (d.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('pt-BR') : '—'

const ST: Record<string, { l: string; c: string; bg: string }> = {
  rascunho: { l: 'Rascunho', c: '#6B7280', bg: '#F3F4F6' },
  enviada: { l: 'Enviada', c: '#0369A1', bg: '#E0F2FE' },
  em_analise: { l: 'Em análise', c: '#B45309', bg: '#FEF3C7' },
  em_cotacao: { l: 'Em cotação', c: '#7C3AED', bg: '#EDE9FE' },
  parcialmente_aprovada: { l: 'Parcial', c: '#B45309', bg: '#FEF3C7' },
  aprovada: { l: 'Aprovada', c: '#15803D', bg: '#DCFCE7' },
  reprovada: { l: 'Reprovada', c: '#B91C1C', bg: '#FEE2E2' },
  em_separacao: { l: 'Em separação', c: '#0369A1', bg: '#E0F2FE' },
  compra_realizada: { l: 'Comprada', c: '#15803D', bg: '#DCFCE7' },
  concluida: { l: 'Concluída', c: '#15803D', bg: '#DCFCE7' },
  cancelada: { l: 'Cancelada', c: '#6B7280', bg: '#F3F4F6' },
}

export default function CotacaoPage() {
  const { loja } = useLoja()
  const { user } = useAuth()
  const { toast } = useToast()

  const [reqs, setReqs] = useState<Requisicao[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [sel, setSel] = useState<Requisicao | null>(null)
  const [mNova, setMNova] = useState(false)
  const [novaTitulo, setNovaTitulo] = useState('')
  const [novaSetor, setNovaSetor] = useState('')
  const [criando, setCriando] = useState(false)

  const lojaAlvo = loja && loja !== 'Todas as Lojas' ? loja : ''

  const criarCotacao = async () => {
    if (!novaTitulo.trim()) return
    if (!lojaAlvo) { toast('Selecione uma loja específica no topo antes de criar.'); return }
    setCriando(true)
    try {
      const nome = user?.name || 'Sistema'
      const req = await insertRequisicao({
        loja: lojaAlvo, titulo: novaTitulo.trim(), setor: novaSetor || null,
        responsavel_nome: nome, prioridade: 'media',
        data_necessidade: null, prazo_entrega: null, centro_custo: null,
        total_estimado: 0, total_final: 0, observacoes: null,
        status: 'em_cotacao', aprovador_nome: null, aprovador_at: null, obs_aprovacao: null,
        credito_id: null, created_by: nome,
      } as never)
      await insertReqTimeline({ requisicao_id: req.id, tipo: 'criacao', descricao: `Cotação criada por ${nome}`, usuario: nome, dados: null }).catch(() => {})
      setMNova(false); setNovaTitulo(''); setNovaSetor('')
      await load()
      setSel(req)
    } catch (e) { toast('Erro ao criar cotação: ' + (e as Error).message) }
    finally { setCriando(false) }
  }

  const load = useCallback(async () => {
    setLoading(true)
    try { setReqs(await fetchRequisicoes(loja).catch(() => [])) } finally { setLoading(false) }
  }, [loja])
  useEffect(() => { load() }, [load])

  // mantém a requisição selecionada atualizada após mudanças
  useEffect(() => { if (sel) { const f = reqs.find(r => r.id === sel.id); if (f && f !== sel) setSel(f) } }, [reqs, sel])

  const filtradas = reqs.filter(r => {
    if (!busca) return true
    const t = busca.toLowerCase()
    return r.titulo.toLowerCase().includes(t) || String(r.numero).includes(t) || (r.responsavel_nome || '').toLowerCase().includes(t)
  })

  // ── Detalhe: análise da cotação ───────────────────────────
  if (sel) {
    const st = ST[sel.status] || ST.rascunho
    return (
      <div>
        <div style={{ background: 'linear-gradient(135deg, #6B1212 0%, #8a2a2a 100%)', borderRadius: 12, padding: '16px 20px', marginBottom: 14, color: '#fff', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button onClick={() => setSel(null)} title="Voltar"
            style={{ background: 'rgba(255,255,255,.18)', border: 'none', color: '#fff', borderRadius: 9, padding: '8px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
            <ArrowLeft size={15} /> Voltar
          </button>
          <div style={{ flex: 1, minWidth: 180 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>REQ-{String(sel.numero).padStart(4, '0')} — {sel.titulo}</h2>
            <div style={{ fontSize: 12.5, opacity: .9 }}>
              {sel.loja}{sel.setor ? ` · ${sel.setor}` : ''} · Solicitante {sel.responsavel_nome} · Prazo {fmtDt(sel.prazo_entrega)}
            </div>
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: st.bg, color: st.c }}>{st.l}</span>
        </div>
        <AnaliseCotacao
          req={sel} loja={sel.loja} userName={user?.name || 'Sistema'}
          toast={toast} onAtualizar={load}
        />
      </div>
    )
  }

  // ── Lista: escolher a requisição a cotar ──────────────────
  return (
    <div>
      <div style={{ background: 'linear-gradient(135deg, #6B1212 0%, #8a2a2a 100%)', borderRadius: 12, padding: '18px 22px', marginBottom: 16, color: '#fff', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 46, height: 46, borderRadius: 12, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ShoppingCart size={24} />
        </div>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Cotação Inteligente de Compras</h2>
          <div style={{ fontSize: 13, opacity: 0.85 }}>Comparativo por item · custo real com frete · sugestão de compra · aprovação e relatório — Loja <strong>{loja}</strong></div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por número, título ou solicitante…"
            style={{ width: '100%', padding: '9px 12px 9px 32px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 13, boxSizing: 'border-box' }} />
        </div>
        <button className="btn" onClick={load} style={{ padding: '9px 13px', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }}>
          <RefreshCw size={14} />
        </button>
        <button className="btn" onClick={() => setMNova(true)} style={{ padding: '9px 15px' }}>
          <Plus size={15} /> Nova cotação
        </button>
      </div>

      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
        Clique em <strong>Nova cotação</strong> para começar do zero (digite os produtos e os mercados/fornecedores na hora), ou escolha abaixo uma solicitação de compra já existente para cotar.
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Loader2 className="spin" size={26} /></div>
      ) : filtradas.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13, border: '1px dashed var(--border)', borderRadius: 10 }}>
          <div style={{ marginBottom: 12 }}>Nenhuma cotação ou requisição nesta loja ainda.</div>
          <button className="btn" onClick={() => setMNova(true)} style={{ padding: '9px 16px' }}>
            <Plus size={15} /> Criar a primeira cotação
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtradas.map(r => {
            const st = ST[r.status] || ST.rascunho
            return (
              <div key={r.id} onClick={() => setSel(r)}
                style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700 }}>REQ-{String(r.numero).padStart(4, '0')} — {r.titulo}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>
                    {r.loja}{r.setor ? ` · ${r.setor}` : ''} · {r.responsavel_nome} · prazo {fmtDt(r.prazo_entrega)}
                  </div>
                </div>
                <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: st.bg, color: st.c }}>{st.l}</span>
                <div style={{ textAlign: 'right', minWidth: 90 }}>
                  <div style={{ fontSize: 14, fontWeight: 800 }}>{fmtR$(r.total_final || r.total_estimado || 0)}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>cotar →</div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal: nova cotação */}
      {mNova && (
        <div style={{ position: 'fixed', inset: 0, background: '#0008', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setMNova(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card)', borderRadius: 14, padding: 20, width: '100%', maxWidth: 460 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <strong style={{ fontSize: 16 }}>➕ Nova cotação</strong>
              <button onClick={() => setMNova(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={18} /></button>
            </div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Nome da cotação *</label>
            <input value={novaTitulo} onChange={e => setNovaTitulo(e.target.value)} autoFocus
              onKeyDown={e => { if (e.key === 'Enter') criarCotacao() }}
              placeholder="Ex.: Cotação hortifruti — semana 30"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, boxSizing: 'border-box' }} />
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', margin: '12px 0 4px' }}>Setor (opcional)</label>
            <input value={novaSetor} onChange={e => setNovaSetor(e.target.value)} placeholder="Ex.: Cozinha, Bar, Salão"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, boxSizing: 'border-box' }} />
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 10 }}>
              Loja: <strong>{lojaAlvo || '— selecione uma loja específica no topo —'}</strong>. Depois de criar, você adiciona os produtos e os mercados/fornecedores dentro da cotação.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button className="btn" onClick={() => setMNova(false)} style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', padding: '9px 16px' }}>Cancelar</button>
              <button className="btn" onClick={criarCotacao} disabled={criando || !novaTitulo.trim() || !lojaAlvo} style={{ padding: '9px 16px' }}>
                {criando ? 'Criando…' : 'Criar e cotar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
