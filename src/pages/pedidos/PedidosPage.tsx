import { useState, useEffect, useCallback } from 'react'
import { ClipboardList, RefreshCw, ExternalLink, Loader2, Package } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useLoja } from '../../contexts/LojaContext'

const sb = supabase as any
const fmtR$ = (v: number) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtD = (s?: string) => { if (!s) return '—'; const p = String(s).slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s }

interface PedidoItem { produto: string; qtd: number; un?: string; preco: number; subtotal?: number }
interface Pedido { chave: string; fornecedor: string; loja: string; data?: string; total?: number; pagamento?: string; cliente?: string; recebimento_responsavel?: string; itens?: PedidoItem[]; cancelados?: string[]; recebimento?: { status: string; por?: string; obs?: string; em?: string } }

export default function PedidosPage() {
  const { loja } = useLoja()
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await sb.from('app_config').select('chave,valor').like('chave', 'pedido_%')
    const list: Pedido[] = (data || []).map((r: any) => ({ chave: r.chave, ...(r.valor || {}) }))
    list.sort((a, b) => (String(b.data || '') + b.chave).localeCompare(String(a.data || '') + a.chave))
    setPedidos(list); setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const filtrados = pedidos.filter(p => loja === 'Todas as Lojas' || !loja || p.loja === loja)
  const link = (p: Pedido) => `${window.location.origin}/pedido.html?p=${encodeURIComponent(p.chave.replace(/^pedido_/, ''))}`
  const card: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }

  return (
    <div>
      <div style={{ background: 'linear-gradient(135deg, #6B1212 0%, #8a2a2a 100%)', borderRadius: 12, padding: '18px 22px', marginBottom: 16, color: '#fff', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 46, height: 46, borderRadius: 12, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ClipboardList size={24} /></div>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Pedidos de Compra</h2>
          <div style={{ fontSize: 13, opacity: 0.85 }}>Pedidos gerados — abra o link de cada um (organizado e pronto pra imprimir/compartilhar) — Loja <strong>{loja}</strong></div>
        </div>
        <button onClick={load} title="Atualizar" style={{ background: 'rgba(255,255,255,.18)', border: 'none', color: '#fff', borderRadius: 10, padding: '9px 11px', cursor: 'pointer' }}><RefreshCw size={16} /></button>
      </div>

      {loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Loader2 className="spin" size={26} /></div>
        : filtrados.length === 0 ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13, border: '1px dashed var(--border)', borderRadius: 10 }}>Nenhum pedido gerado nesta loja ainda.</div>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtrados.map(p => (
              <div key={p.chave} style={{ ...card, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: '#F3F4F6', color: '#8B1212', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Package size={19} /></div>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontWeight: 700, fontSize: 14.5 }}>{p.fornecedor || 'Fornecedor'}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                    {p.loja} · {fmtD(p.data)} · {(p.itens || []).length} itens{p.recebimento_responsavel ? ` · recebe ${p.recebimento_responsavel}` : ''}{p.cancelados && p.cancelados.length ? ` · ⚠ ${p.cancelados.length} cancelado(s)` : ''}
                  </div>
                </div>
                {p.recebimento
                  ? <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: p.recebimento.status === 'Recebido integral' ? '#DCFCE7' : '#FEF3C7', color: p.recebimento.status === 'Recebido integral' ? '#15803D' : '#B45309', whiteSpace: 'nowrap' }} title={`${p.recebimento.por || ''} · ${p.recebimento.em ? new Date(p.recebimento.em).toLocaleString('pt-BR') : ''}${p.recebimento.obs ? ' · ' + p.recebimento.obs : ''}`}>✓ {p.recebimento.status}</span>
                  : <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: '#E0F2FE', color: '#0369A1', whiteSpace: 'nowrap' }}>Aguardando recebimento</span>}
                <div style={{ textAlign: 'right', minWidth: 90 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#8B1212' }}>{fmtR$(p.total || 0)}</div>
                </div>
                <a href={link(p)} target="_blank" rel="noreferrer" className="btn" style={{ padding: '8px 14px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <ExternalLink size={15} /> Abrir pedido
                </a>
              </div>
            ))}
          </div>}
    </div>
  )
}
