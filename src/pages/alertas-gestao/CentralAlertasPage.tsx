import { useState, useEffect, useCallback, useMemo } from 'react'
import { RefreshCw, AlertOctagon, AlertTriangle, CheckCircle2, ChevronDown } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useLoja } from '../../contexts/LojaContext'
import { fetchEstoqueProdutos, fetchEstoquePerdas, fetchTodosCaixaItens, fetchRequisicoes } from '../../lib/db'

const sb = supabase as any
const brl = (v: number) => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
const STOP = new Set(['de','da','do','com','sem','para','e','a','o','kg','g','gr','ml','l','un','und','unid','unidade','unidades','litro','grama'])
const norm = (s?: string | null) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
const isSize = (t: string) => /^\d+([.,]\d+)?(kg|kgs|g|gr|mg|ml|l|lt|un|und|cx|pc|pct)$/.test(t)
const keyOf = (s?: string | null) => [...new Set(norm(s).split(' ').filter(t => t.length >= 2 && !STOP.has(t) && !/^\d+$/.test(t) && !isSize(t)))].sort().join(' ')
const parseDoc = (d?: string | null) => { const m = (d || '').match(/unit\s+([\d.]+)/); return m ? parseFloat(m[1]) : null }
const META_PERDA = 2

type Alerta = { titulo: string; itens: string[]; n: number }

export default function CentralAlertasPage() {
  const { loja } = useLoja()
  const [produtos, setProdutos] = useState<any[]>([])
  const [perdas, setPerdas] = useState<any[]>([])
  const [caixaItens, setCaixaItens] = useState<any[]>([])
  const [reqs, setReqs] = useState<any[]>([])
  const [lotes, setLotes] = useState<any[]>([])
  const [recDiv, setRecDiv] = useState<any[]>([])
  const [open, setOpen] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    const [pr, pe, ci, rq] = await Promise.all([
      fetchEstoqueProdutos(loja).catch(() => []), fetchEstoquePerdas(loja).catch(() => []),
      fetchTodosCaixaItens(loja).catch(() => []), fetchRequisicoes(loja).catch(() => []),
    ])
    setProdutos(pr); setPerdas(pe); setCaixaItens(ci); setReqs(rq)
    let lq = sb.from('estoque_lotes').select('produto_nome,saldo,data_validade,loja').gt('saldo', 0).not('data_validade', 'is', null)
    if (loja && loja !== 'Todas as Lojas') lq = lq.eq('loja', loja)
    const { data: lo } = await lq.limit(2000); setLotes(lo || [])
    let rq2 = sb.from('recebimentos').select('fornecedor,numero_nota,qtd_ocorrencias,created_at,loja').gt('qtd_ocorrencias', 0).order('created_at', { ascending: false }).limit(30)
    if (loja && loja !== 'Todas as Lojas') rq2 = rq2.eq('loja', loja)
    const { data: rc } = await rq2; setRecDiv(rc || [])
  }, [loja])
  useEffect(() => { load() }, [load])

  const { criticos, atencao, normais } = useMemo(() => {
    const hoje = iso(new Date()); const em7 = iso(new Date(Date.now() + 7 * 864e5)); const em30 = iso(new Date(Date.now() + 30 * 864e5))
    const nivel = (p: any) => Number(p.nivel_atual) || 0, min = (p: any) => Number(p.nivel_minimo) || 0, ideal = (p: any) => Number(p.nivel_ideal) || 0
    const zerados = produtos.filter(p => min(p) > 0 && nivel(p) <= 0)
    const abaixo = produtos.filter(p => min(p) > 0 && nivel(p) > 0 && nivel(p) < min(p))
    const elevado = produtos.filter(p => ideal(p) > 0 && nivel(p) > ideal(p) * 1.5)
    const adequados = produtos.filter(p => nivel(p) > 0 && (min(p) <= 0 || nivel(p) >= min(p)) && !(ideal(p) > 0 && nivel(p) > ideal(p) * 1.5))
    const venc7 = lotes.filter((l: any) => l.data_validade && l.data_validade >= hoje && l.data_validade <= em7)
    const venc30 = lotes.filter((l: any) => l.data_validade && l.data_validade > em7 && l.data_validade <= em30)
    // preço subindo (último > média*1.1)
    const pm: Record<string, { us: { d: string; u: number }[]; nome: string }> = {}
    caixaItens.forEach((i: any) => { const k = keyOf(i.descricao); if (!k) return; const u = Number(i.preco_unit) > 0 ? Number(i.preco_unit) : (parseDoc(i.documento) || (Number(i.quantidade) > 0 ? Number(i.valor) / Number(i.quantidade) : 0)); if (u > 0 && i.data) { (pm[k] = pm[k] || { us: [], nome: i.descricao }).us.push({ d: i.data, u }) } })
    const subindo: string[] = []
    Object.values(pm).forEach(p => { if (p.us.length < 2) return; const ord = [...p.us].sort((a, b) => (a.d < b.d ? 1 : -1)); const ult = ord[0].u; const med = p.us.reduce((s, x) => s + x.u, 0) / p.us.length; if (ult > med * 1.12) subindo.push(`${p.nome} (${brl(med)}→${brl(ult)})`) })
    // perdas mês × compras
    const mIni = iso(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
    const perdaMes = perdas.filter((p: any) => String(p.created_at).slice(0, 10) >= mIni).reduce((s: number, p: any) => s + (Number(p.valor_estimado) || 0), 0)
    const compraMes = caixaItens.filter((i: any) => String(i.data || '').slice(0, 10) >= mIni).reduce((s: number, i: any) => s + (Number(i.valor) || 0), 0)
    const indice = compraMes > 0 ? (perdaMes / compraMes) * 100 : 0
    const reqUrg = reqs.filter((r: any) => (r.prioridade === 'alta' || r.prioridade === 'urgente') && !['concluida', 'cancelada', 'reprovada'].includes(String(r.status)))

    const cr: Alerta[] = []
    if (zerados.length) cr.push({ titulo: '🔴 Produtos zerados', n: zerados.length, itens: zerados.slice(0, 20).map(p => p.nome) })
    if (abaixo.length) cr.push({ titulo: '🔴 Abaixo do estoque mínimo', n: abaixo.length, itens: abaixo.slice(0, 20).map(p => `${p.nome} (${p.nivel_atual}/${p.nivel_minimo})`) })
    if (venc7.length) cr.push({ titulo: '🔴 Vencendo em até 7 dias', n: venc7.length, itens: venc7.slice(0, 20).map((l: any) => `${l.produto_nome} · vence ${String(l.data_validade).split('-').reverse().join('/')}`) })
    if (recDiv.length) cr.push({ titulo: '🔴 Notas com divergência/ocorrência', n: recDiv.length, itens: recDiv.slice(0, 15).map((r: any) => `NF ${r.numero_nota || 's/n'} · ${r.fornecedor || ''} · ${r.qtd_ocorrencias} ocorr.`) })
    if (reqUrg.length) cr.push({ titulo: '🔴 Requisições urgentes pendentes', n: reqUrg.length, itens: reqUrg.slice(0, 15).map((r: any) => `Nº ${r.numero} · ${r.titulo || ''}`) })

    const at: Alerta[] = []
    if (subindo.length) at.push({ titulo: '🟡 Preço subindo (acima da média)', n: subindo.length, itens: subindo.slice(0, 20) })
    if (indice > META_PERDA) at.push({ titulo: '🟡 Índice de perda acima da meta', n: 1, itens: [`Perda ${indice.toFixed(2)}% das compras do mês (meta ≤ ${META_PERDA}%) · ${brl(perdaMes)}`] })
    if (elevado.length) at.push({ titulo: '🟡 Estoque elevado (acima do ideal)', n: elevado.length, itens: elevado.slice(0, 20).map(p => `${p.nome} (${p.nivel_atual})`) })
    if (venc30.length) at.push({ titulo: '🟡 Vencendo em 8–30 dias', n: venc30.length, itens: venc30.slice(0, 20).map((l: any) => `${l.produto_nome} · ${String(l.data_validade).split('-').reverse().join('/')}`) })

    const no: Alerta[] = [
      { titulo: '🟢 Produtos em estoque adequado', n: adequados.length, itens: [] },
      { titulo: '🟢 Índice de perda dentro da meta', n: indice <= META_PERDA ? 1 : 0, itens: indice <= META_PERDA ? [`${indice.toFixed(2)}% (meta ≤ ${META_PERDA}%)`] : [] },
    ].filter(x => x.n > 0)
    return { criticos: cr, atencao: at, normais: no }
  }, [produtos, perdas, caixaItens, reqs, lotes, recDiv])

  const nCrit = criticos.reduce((s, a) => s + a.n, 0), nAt = atencao.reduce((s, a) => s + a.n, 0)
  const toggle = (t: string) => setOpen(s => { const n = new Set(s); n.has(t) ? n.delete(t) : n.add(t); return n })

  const secao = (titulo: string, cor: string, bg: string, icon: React.ReactNode, arr: Alerta[], vazio: string) => (
    <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 14, borderTop: `3px solid ${cor}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', background: bg, color: cor, fontWeight: 800, fontSize: 14 }}>{icon}{titulo}</div>
      {arr.length === 0 ? <div style={{ padding: 16, color: 'var(--muted)', fontSize: 13 }}>{vazio}</div> :
        arr.map(a => <div key={a.titulo} style={{ borderTop: '1px solid var(--border)' }}>
          <div onClick={() => a.itens.length && toggle(a.titulo)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', cursor: a.itens.length ? 'pointer' : 'default' }}>
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>{a.titulo}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ background: cor, color: '#fff', borderRadius: 20, padding: '1px 10px', fontWeight: 800, fontSize: 12.5 }}>{a.n}</span>{a.itens.length ? <ChevronDown size={15} style={{ transform: open.has(a.titulo) ? 'rotate(180deg)' : 'none', transition: '.2s' }} /> : null}</span>
          </div>
          {open.has(a.titulo) && a.itens.length > 0 && <div style={{ padding: '0 14px 12px', fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.7 }}>{a.itens.map((i, k) => <div key={k}>• {i}</div>)}{a.n > a.itens.length && <div style={{ marginTop: 4 }}>+{a.n - a.itens.length} outros…</div>}</div>}
        </div>)}
    </div>
  )

  return (
    <div>
      <div style={{ background: 'linear-gradient(135deg,#6B1212,#8a2a2a)', borderRadius: 12, padding: '16px 20px', marginBottom: 14, color: '#fff', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 22 }}>🚨</span>
        <div style={{ flex: 1, minWidth: 180 }}><h2 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>Central de Alertas</h2><div style={{ fontSize: 12.5, opacity: .85 }}>O que precisa de ação agora · {loja}</div></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <span style={{ background: '#FEE2E2', color: '#B91C1C', borderRadius: 20, padding: '4px 12px', fontWeight: 800, fontSize: 13 }}>🔴 {nCrit}</span>
          <span style={{ background: '#FEF3C7', color: '#B45309', borderRadius: 20, padding: '4px 12px', fontWeight: 800, fontSize: 13 }}>🟡 {nAt}</span>
        </div>
        <button className="btn bo" onClick={load} style={{ borderColor: 'rgba(255,255,255,.4)', color: '#fff', padding: '8px 11px' }}><RefreshCw size={15} /></button>
      </div>

      {secao('CRÍTICO — ação imediata', '#B91C1C', '#FEE2E2', <AlertOctagon size={17} />, criticos, '✅ Nenhum alerta crítico. Tudo sob controle.')}
      {secao('ATENÇÃO — acompanhar', '#B45309', '#FEF3C7', <AlertTriangle size={17} />, atencao, 'Nada em atenção no momento.')}
      {secao('NORMAL — dentro do esperado', '#15803D', '#DCFCE7', <CheckCircle2 size={17} />, normais, 'Sem indicadores positivos consolidados ainda.')}

      <div style={{ fontSize: 11.5, color: 'var(--muted)', textAlign: 'center', marginTop: 4 }}>Alertas de estoque (mínimo/zerado/elevado), validade (lotes), preço (compras), perdas (índice), requisições e recebimento. Clique para ver os itens.</div>
    </div>
  )
}
