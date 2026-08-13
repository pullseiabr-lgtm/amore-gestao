import { useState, useEffect, useCallback, useMemo } from 'react'
import { RefreshCw, Plus, X, TrendingDown } from 'lucide-react'
import { useLoja } from '../../contexts/LojaContext'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../hooks/useToast'
import { fetchEstoquePerdas, insertEstoquePerda, fetchEstoqueProdutos, fetchTodosCaixaItens } from '../../lib/db'
import type { EstoquePerda, EstoqueProduto, PerdaTipo } from '../../types/database'

const brl = (v: number) => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const num = (v: number) => (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })
const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
const ddmm = (d?: string | null) => d ? new Date(d).toLocaleDateString('pt-BR') : '—'
const dentro = (d: any, a: string, b: string) => { if (!d) return false; const x = String(d).slice(0, 10); return x >= a && x <= b }
const norm = (s?: string | null) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

const TIPOS: { v: PerdaTipo; l: string; cor: string; bg: string; motivos: string[] }[] = [
  { v: 'desperdicio', l: 'Desperdício', cor: '#B45309', bg: '#FEF3C7', motivos: ['Preparação excessiva', 'Sobra de produção', 'Erro de produção', 'Armazenamento inadequado', 'Manipulação incorreta', 'Quebra', 'Outros'] },
  { v: 'dano', l: 'Avaria', cor: '#B91C1C', bg: '#FEE2E2', motivos: ['Danificado no recebimento', 'Embalagem danificada', 'Produto quebrado', 'Produto deteriorado', 'Erro operacional', 'Transporte', 'Fornecedor'] },
  { v: 'vencimento', l: 'Vencimento', cor: '#7C3AED', bg: '#EDE9FE', motivos: ['Produto vencido', 'Validade curta não usada', 'Excesso de estoque', 'Outros'] },
]
const tipoDe = (v: string) => TIPOS.find(t => t.v === v) || { l: v, cor: '#6B7280', bg: '#F3F4F6', motivos: [] as string[] }
const META = 2 // % meta de perda

export default function GestaoPerdasPage() {
  const { loja } = useLoja(); const { user } = useAuth(); const { toast } = useToast()
  const [periodo, setPeriodo] = useState<'semana' | 'mes' | 'mes-ant'>('mes')
  const [perdas, setPerdas] = useState<EstoquePerda[]>([])
  const [produtos, setProdutos] = useState<EstoqueProduto[]>([])
  const [caixaItens, setCaixaItens] = useState<any[]>([])
  const [modal, setModal] = useState(false)
  const [f, setF] = useState<any>({ tipo: 'desperdicio', produto_nome: '', quantidade: '', unidade: 'un', motivo: '', valor_estimado: '' })
  const [saving, setSaving] = useState(false)

  const [ini, fim] = useMemo(() => {
    const h = new Date(); h.setHours(0, 0, 0, 0)
    if (periodo === 'semana') { const d = new Date(h); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return [iso(d), iso(h)] }
    if (periodo === 'mes-ant') return [iso(new Date(h.getFullYear(), h.getMonth() - 1, 1)), iso(new Date(h.getFullYear(), h.getMonth(), 0))]
    return [iso(new Date(h.getFullYear(), h.getMonth(), 1)), iso(h)]
  }, [periodo])

  const load = useCallback(async () => {
    try {
      const [pe, pr, ci] = await Promise.all([fetchEstoquePerdas(loja).catch(() => []), fetchEstoqueProdutos(loja).catch(() => []), fetchTodosCaixaItens(loja).catch(() => [])])
      setPerdas(pe); setProdutos(pr); setCaixaItens(ci)
    } catch { /* noop */ }
  }, [loja])
  useEffect(() => { load() }, [load])

  const perdasP = useMemo(() => perdas.filter(p => dentro(p.created_at, ini, fim)), [perdas, ini, fim])
  const total = perdasP.reduce((s, p) => s + (Number(p.valor_estimado) || 0), 0)
  const compras = caixaItens.filter((i: any) => dentro(i.data, ini, fim)).reduce((s: number, i: any) => s + (Number(i.valor) || 0), 0)
  const indice = compras > 0 ? (total / compras) * 100 : 0
  const porTipo = TIPOS.map(t => ({ ...t, valor: perdasP.filter(p => p.tipo_perda === t.v).reduce((s, p) => s + (Number(p.valor_estimado) || 0), 0), n: perdasP.filter(p => p.tipo_perda === t.v).length }))
  const maxTipo = Math.max(1, ...porTipo.map(t => t.valor))
  const ranking = useMemo(() => {
    const m: Record<string, { nome: string; q: number; v: number; n: number }> = {}
    perdasP.forEach(p => { const k = p.produto_nome || '—'; (m[k] = m[k] || { nome: k, q: 0, v: 0, n: 0 }); m[k].q += Number(p.quantidade) || 0; m[k].v += Number(p.valor_estimado) || 0; m[k].n++ })
    return Object.values(m).sort((a, b) => b.v - a.v).slice(0, 12)
  }, [perdasP])

  const selProd = (nome: string) => { const p = produtos.find(x => norm(x.nome) === norm(nome)); const un = p?.gramatura?.replace('(s)', '').toLowerCase() || 'un'; setF((s: any) => ({ ...s, produto_nome: nome, unidade: un, _preco: Number(p?.preco_unitario) || 0 })) }
  const recalcValor = (qtd: string) => setF((s: any) => ({ ...s, quantidade: qtd, valor_estimado: s._preco > 0 && qtd ? (Number(qtd) * s._preco).toFixed(2) : s.valor_estimado }))
  const salvar = async () => {
    if (!f.produto_nome.trim()) { toast('Informe o produto.', 'error'); return }
    if (!f.quantidade || Number(f.quantidade) <= 0) { toast('Informe a quantidade.', 'error'); return }
    setSaving(true)
    try {
      const p = produtos.find(x => norm(x.nome) === norm(f.produto_nome))
      await insertEstoquePerda({ loja: loja === 'Todas as Lojas' ? 'Amore Paiva' : loja, produto_id: p?.id || null, produto_nome: f.produto_nome.trim(), tipo_perda: f.tipo, quantidade: Number(f.quantidade), unidade: f.unidade || 'un', numero_lote: null, data_validade: null, motivo: f.motivo || null, valor_estimado: f.valor_estimado ? Number(f.valor_estimado) : (p ? Number(p.preco_unitario) * Number(f.quantidade) : null), created_by: user?.name || null } as any)
      toast('Perda registrada.'); setModal(false); setF({ tipo: 'desperdicio', produto_nome: '', quantidade: '', unidade: 'un', motivo: '', valor_estimado: '' }); load()
    } catch { toast('Erro ao registrar.', 'error') }
    setSaving(false)
  }

  const tipoAtual = tipoDe(f.tipo)

  return (
    <div>
      <div style={{ background: 'linear-gradient(135deg,#6B1212,#8a2a2a)', borderRadius: 12, padding: '16px 20px', marginBottom: 14, color: '#fff', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <TrendingDown size={22} />
        <div style={{ flex: 1, minWidth: 180 }}><h2 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>⚠️ Gestão de Perdas</h2><div style={{ fontSize: 12.5, opacity: .85 }}>Desperdício · Avaria · Vencimento — controle e índice de perda · {loja}</div></div>
        <div style={{ display: 'flex', background: 'rgba(255,255,255,.15)', borderRadius: 8, padding: 3 }}>
          {([['semana', 'Semana'], ['mes', 'Mês'], ['mes-ant', 'Mês ant.']] as const).map(([v, l]) => <button key={v} className="btn" onClick={() => setPeriodo(v)} style={{ padding: '5px 11px', fontSize: 12.5, border: 'none', background: periodo === v ? '#fff' : 'transparent', color: periodo === v ? 'var(--bordo)' : '#fff' }}>{l}</button>)}
        </div>
        <button className="btn" onClick={() => setModal(true)} style={{ background: '#fff', color: 'var(--bordo)', padding: '8px 13px' }}><Plus size={15} /> Registrar perda</button>
        <button className="btn bo" onClick={load} style={{ borderColor: 'rgba(255,255,255,.4)', color: '#fff', padding: '8px 11px' }}><RefreshCw size={15} /></button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10, marginBottom: 16 }}>
        <div className="card" style={{ padding: '12px 14px', borderLeft: '4px solid #B91C1C' }}><div style={{ fontSize: 21, fontWeight: 800, color: '#B91C1C' }}>{brl(total)}</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>Perda total ({perdasP.length} ocorrências)</div></div>
        <div className="card" style={{ padding: '12px 14px', borderLeft: `4px solid ${indice <= META ? '#15803D' : '#B91C1C'}` }}><div style={{ fontSize: 21, fontWeight: 800, color: indice <= META ? '#15803D' : '#B91C1C' }}>{indice.toFixed(2)}%</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>Índice de perda · 🎯 meta ≤ {META}%</div></div>
        {porTipo.map(t => <div key={t.v} className="card" style={{ padding: '12px 14px', borderLeft: `4px solid ${t.cor}` }}><div style={{ fontSize: 18, fontWeight: 800, color: t.cor }}>{brl(t.valor)}</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>{t.l} · {t.n}</div></div>)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 14 }}>
        <div className="card" style={{ padding: 16 }}>
          <b style={{ fontSize: 14 }}>Perdas por tipo</b>
          <div style={{ marginTop: 12 }}>{porTipo.every(t => t.valor === 0) ? <div style={{ fontSize: 12.5, color: '#B45309', background: '#FEF3C7', padding: '8px 10px', borderRadius: 8 }}>Sem perdas registradas no período. Use <b>Registrar perda</b> para começar a controlar (meta ≤ {META}%).</div> :
            porTipo.map(t => <div key={t.v} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 2 }}><span style={{ fontWeight: 600, color: t.cor }}>{t.l}</span><strong>{brl(t.valor)}</strong></div>
              <div style={{ height: 9, background: 'var(--bg)', borderRadius: 99 }}><div style={{ height: '100%', width: `${(t.valor / maxTipo) * 100}%`, background: t.cor, borderRadius: 99 }} /></div>
            </div>)}
          </div>
        </div>

        <div className="card" style={{ padding: 16 }}>
          <b style={{ fontSize: 14 }}>🏆 Produtos com maior perda</b>
          <div style={{ marginTop: 10, overflowX: 'auto' }}>
            {ranking.length === 0 ? <div style={{ color: 'var(--muted)', fontSize: 13 }}>Nenhuma perda no período.</div> :
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead><tr style={{ color: 'var(--muted)', fontSize: 11, textAlign: 'left' }}><th style={{ padding: 4 }}>Produto</th><th style={{ textAlign: 'right' }}>Qtd</th><th style={{ textAlign: 'right', padding: 4 }}>Valor</th></tr></thead>
                <tbody>{ranking.map(r => <tr key={r.nome} style={{ borderTop: '1px solid var(--border)' }}><td style={{ padding: '5px 4px', fontWeight: 600 }}>{r.nome}<span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 400 }}> · {r.n}x</span></td><td style={{ textAlign: 'right', color: 'var(--muted)' }}>{num(r.q)}</td><td style={{ textAlign: 'right', padding: '5px 4px', fontWeight: 700, color: '#B91C1C' }}>{brl(r.v)}</td></tr>)}</tbody>
              </table>}
          </div>
        </div>
      </div>

      {/* Lista recente */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginTop: 14 }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13 }}>Registros do período ({perdasP.length})</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 620 }}>
            <thead><tr style={{ background: 'var(--bordo-bg)', textAlign: 'left' }}><th style={{ padding: 8 }}>Data</th><th>Produto</th><th>Tipo</th><th>Motivo</th><th style={{ textAlign: 'right' }}>Qtd</th><th style={{ textAlign: 'right', padding: 8 }}>Valor</th></tr></thead>
            <tbody>{[...perdasP].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 60).map(p => { const t = tipoDe(p.tipo_perda); return <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ padding: '6px 8px' }}>{ddmm(p.created_at)}</td><td style={{ fontWeight: 600 }}>{p.produto_nome}</td>
              <td><span style={{ background: t.bg, color: t.cor, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>{t.l}</span></td>
              <td style={{ color: 'var(--muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.motivo || '—'}</td>
              <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{num(Number(p.quantidade))} {p.unidade}</td>
              <td style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 700, color: '#B91C1C' }}>{p.valor_estimado != null ? brl(Number(p.valor_estimado)) : '—'}</td>
            </tr> })}</tbody>
          </table>
          {perdasP.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: 'var(--muted)' }}>Nenhuma perda registrada no período.</div>}
        </div>
      </div>

      {modal && <div style={{ position: 'fixed', inset: 0, background: '#0008', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setModal(false)}>
        <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card)', borderRadius: 14, padding: 20, width: '100%', maxWidth: 480, maxHeight: '92vh', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}><strong style={{ fontSize: 16 }}>⚠️ Registrar perda</strong><button onClick={() => setModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={18} /></button></div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Tipo</label>
          <div style={{ display: 'flex', gap: 6, margin: '4px 0 12px' }}>{TIPOS.map(t => <button key={t.v} onClick={() => setF((s: any) => ({ ...s, tipo: t.v, motivo: '' }))} style={{ flex: 1, padding: '8px', borderRadius: 8, border: `1px solid ${f.tipo === t.v ? t.cor : 'var(--border)'}`, background: f.tipo === t.v ? t.bg : 'var(--bg)', color: f.tipo === t.v ? t.cor : 'var(--text)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>{t.v === 'desperdicio' ? '🗑️' : t.v === 'dano' ? '💥' : '⏰'} {t.l}</button>)}</div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Produto</label>
          <input list="perda-prods" value={f.produto_nome} onChange={e => selProd(e.target.value)} placeholder="Buscar produto…" style={inp} />
          <datalist id="perda-prods">{produtos.slice(0, 800).map(p => <option key={p.id} value={p.nome} />)}</datalist>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
            <div><label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Quantidade</label><input type="number" step="0.01" value={f.quantidade} onChange={e => recalcValor(e.target.value)} style={inp} /></div>
            <div><label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Valor estimado (R$)</label><input type="number" step="0.01" value={f.valor_estimado} onChange={e => setF((s: any) => ({ ...s, valor_estimado: e.target.value }))} style={inp} /></div>
          </div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginTop: 10 }}>Motivo</label>
          <select value={f.motivo} onChange={e => setF((s: any) => ({ ...s, motivo: e.target.value }))} style={inp}>
            <option value="">— selecione —</option>{tipoAtual.motivos.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <button className="btn bo" onClick={() => setModal(false)}>Cancelar</button>
            <button className="btn bp" onClick={salvar} disabled={saving}>{saving ? 'Salvando…' : 'Registrar'}</button>
          </div>
        </div>
      </div>}
    </div>
  )
}
const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13.5, boxSizing: 'border-box', marginTop: 4 }
