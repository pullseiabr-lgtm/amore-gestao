import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { isOwner } from '../../lib/permissions'
import { useToast } from '../../hooks/useToast'
import { insertReqTimeline } from '../../lib/db'
import { brl, pctF, dBR, titulo } from './engine'
import type { AnaliseReq, ItemAnalise } from './PrecosRequisicao'

const sb = supabase as any
const card: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }
const inp: React.CSSProperties = { padding: '6px 8px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 12, boxSizing: 'border-box', width: '100%' }
const th: React.CSSProperties = { textAlign: 'left', padding: '7px 8px', fontSize: 10.5, color: 'var(--muted)', fontWeight: 700, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '7px 8px', fontSize: 12, borderBottom: '1px solid var(--border)', verticalAlign: 'top' }

interface Req { id: string; numero: number; loja: string; titulo: string; status: string; responsavel_nome: string | null; created_at: string }
interface Cot { id: string; requisicao_item_id: string; fornecedor: string; preco: number; validade: string | null; registrado_por: string | null }
interface Plano { id: string; requisicao_item_id: string; fornecedor: string; preco_negociado: number; origem_preco: string; status: string }
interface Recebido { requisicao_item_id: string; qtd_pedida: number; qtd_recebida: number; preco: number | null; pedido: string | null }

export default function CompradorTab({ comprador, loja }: { comprador: string; loja: string }) {
  const { user } = useAuth()
  const { toast } = useToast()
  const [reqs, setReqs] = useState<Req[]>([])
  const [sel, setSel] = useState<Req | null>(null)
  const [an, setAn] = useState<AnaliseReq | null>(null)
  const [cots, setCots] = useState<Cot[]>([])
  const [planos, setPlanos] = useState<Plano[]>([])
  const [recs, setRecs] = useState<Recebido[]>([])
  const [bloq, setBloq] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [forms, setForms] = useState<Record<string, { forn: string; preco: string; val: string }>>({})
  const [dec, setDec] = useState<Record<string, { forn: string; preco: string }>>({})
  const ehComprador = !!user && (user.name || '').trim().toLowerCase() === comprador.trim().toLowerCase()
  const usuario = user?.name || 'usuário'

  useEffect(() => {
    sb.from('requisicoes').select('id,numero,loja,titulo,status,responsavel_nome,created_at').in('status', ['aprovada', 'parcialmente_aprovada', 'em_cotacao']).order('created_at', { ascending: false }).limit(80)
      .then(({ data }: any) => setReqs((data || []).filter((r: Req) => !loja || r.loja === loja || r.loja === 'Todas as Lojas')))
  }, [loja])

  const abrir = useCallback(async (r: Req) => {
    setSel(r); setLoading(true); setAn(null)
    try {
      const [a, c, p, itens, pi] = await Promise.all([
        sb.rpc('ic_analise_requisicao', { p_req: r.id }),
        sb.from('ic_cotacoes').select('*').eq('requisicao_id', r.id),
        sb.from('ic_compras_plano').select('*').eq('requisicao_id', r.id),
        sb.from('requisicao_itens').select('id,bloqueado,status').eq('requisicao_id', r.id),
        sb.from('pedido_compra_itens').select('requisicao_item_id,qtd_pedida,qtd_recebida,preco,pedido_id,pedidos_compra!inner(numero,requisicao_id)').eq('pedidos_compra.requisicao_id', r.id),
      ])
      setAn(a.data); setCots(c.data || []); setPlanos(p.data || [])
      setBloq(new Set((itens.data || []).filter((i: any) => i.bloqueado || i.status === 'cancelado').map((i: any) => i.id)))
      setRecs((pi.data || []).map((x: any) => ({ requisicao_item_id: x.requisicao_item_id, qtd_pedida: Number(x.qtd_pedida), qtd_recebida: Number(x.qtd_recebida || 0), preco: x.preco == null ? null : Number(x.preco), pedido: x.pedidos_compra?.numero || null })))
    } catch (e: any) { toast('Erro ao carregar requisição: ' + (e?.message || e), 'error') }
    finally { setLoading(false) }
  }, [toast])

  const hoje = new Date().toISOString().slice(0, 10)
  const itens = useMemo(() => (an?.itens || []).filter(i => !bloq.has(i.item_id)), [an, bloq])

  const linha = (i: ItemAnalise) => {
    const cv = cots.filter(c => c.requisicao_item_id === i.item_id && (!c.validade || c.validade >= hoje))
    const cvMin = cv.length ? [...cv].sort((a, b) => a.preco - b.preco)[0] : null
    const hist = [...(i.fornecedores || [])].sort((a, b) => a.ultimo_preco - b.ultimo_preco)[0]
    let melhor: { forn: string; preco: number; tipo: 'cotação vigente' | 'histórico' } | null = null
    if (cvMin && (!hist || cvMin.preco <= hist.ultimo_preco)) melhor = { forn: cvMin.fornecedor, preco: cvMin.preco, tipo: 'cotação vigente' }
    else if (hist) melhor = { forn: hist.nome, preco: hist.ultimo_preco, tipo: 'histórico' }
    const difPct = melhor && i.ultimo ? (melhor.preco - i.ultimo.preco) / i.ultimo.preco * 100 : null
    return { cv, melhor, difPct }
  }

  const totais = useMemo(() => {
    let ult = 0, melhorT = 0, plan = 0
    itens.forEach(i => { if (i.status !== 'ok') return; const l = linha(i); ult += i.custo_estimado || 0; melhorT += l.melhor ? l.melhor.preco * (i as any).qtd_base : i.custo_estimado || 0
      const p = planos.find(x => x.requisicao_item_id === i.item_id); if (p) plan += p.preco_negociado * (i as any).qtd_base })
    return { ult, melhorT, plan }
    // eslint-disable-next-line
  }, [itens, cots, planos])

  const addCot = async (i: ItemAnalise) => {
    const f = forms[i.item_id]; const preco = Number((f?.preco || '').replace(',', '.'))
    if (!f?.forn?.trim() || !(preco > 0)) { toast('Informe fornecedor e preço (por ' + (i.un_base || 'un') + ').', 'error'); return }
    const { error } = await sb.from('ic_cotacoes').insert({ requisicao_id: sel!.id, requisicao_item_id: i.item_id, loja: sel!.loja, produto_nome: i.produto, un_base: i.un_base || null, fornecedor: f.forn.trim().toUpperCase(), preco, validade: f.val || null, registrado_por: usuario })
    if (error) { toast('Erro: ' + error.message, 'error'); return }
    setForms(s => ({ ...s, [i.item_id]: { forn: '', preco: '', val: '' } })); toast('Cotação registrada ✅'); abrir(sel!)
  }
  const delCot = async (id: string) => { await sb.from('ic_cotacoes').delete().eq('id', id); abrir(sel!) }

  const decidir = async (i: ItemAnalise, fornPadrao: string, precoPadrao: number, tipo: string) => {
    const d = dec[i.item_id]; const forn = (d?.forn || fornPadrao).trim(); const preco = d?.preco ? Number(d.preco.replace(',', '.')) : precoPadrao
    if (!forn || !(preco > 0)) { toast('Escolha o fornecedor e informe o preço negociado.', 'error'); return }
    const { error } = await sb.from('ic_compras_plano').upsert({ requisicao_id: sel!.id, requisicao_item_id: i.item_id, loja: sel!.loja, produto_nome: i.produto, un_base: i.un_base || null, fornecedor: forn.toUpperCase(), preco_negociado: preco, qtd_base: (i as any).qtd_base, origem_preco: d?.preco ? 'negociado' : tipo === 'cotação vigente' ? 'cotacao' : 'historico',
      analise_ref: { ultimo: i.ultimo, media: i.media, menor_hist: i.menor_hist }, decidido_por: usuario, status: 'decidido', updated_at: new Date().toISOString() }, { onConflict: 'requisicao_item_id' })
    if (error) { toast('Erro: ' + error.message, 'error'); return }
    toast('Decisão registrada ✅'); abrir(sel!)
  }

  const finalizar = async () => {
    if (!planos.length) { toast('Registre a decisão de ao menos um item.', 'error'); return }
    if (!confirm(`Finalizar a compra da REQ-${String(sel!.numero).padStart(4, '0')}? Os ${planos.length} item(ns) decididos ficam gravados como compra planejada.`)) return
    await sb.from('ic_compras_plano').update({ status: 'finalizado', finalizado_por: usuario, finalizado_em: new Date().toISOString() }).eq('requisicao_id', sel!.id)
    try { await insertReqTimeline({ requisicao_id: sel!.id, tipo: 'compra', descricao: `Compra definida por ${usuario} (Inteligência de Compras): ${planos.length} item(ns), total negociado ${brl(totais.plan)}`, usuario, dados: null } as any) } catch { /* ignora */ }
    toast('Compra finalizada ✅'); abrir(sel!)
  }

  return (
    <div>
      <div style={{ ...card, marginBottom: 12, fontSize: 12.5 }}>
        <b>Comprador responsável: {comprador}</b>{ehComprador ? ' (você)' : ''} — a requisição aprovada chega aqui com a <b>Melhor oportunidade de compra</b>. Histórico de preço ≠ cotação vigente: registre cotações novas (fornecedor, preço, validade) para recalcular a recomendação com preços confirmados. O comprador escolhe o fornecedor, registra o preço negociado e finaliza. Preços no histórico são por unidade-base (kg, L ou un).
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 10, marginBottom: 12 }}>
        {reqs.length === 0 && <div style={{ ...card, color: 'var(--muted)' }}>Nenhuma requisição aprovada aguardando compra{loja ? ` em ${loja}` : ''}.</div>}
        {reqs.slice(0, 12).map(r => <div key={r.id} onClick={() => abrir(r)} style={{ ...card, cursor: 'pointer', borderColor: sel?.id === r.id ? 'var(--bordo)' : 'var(--border)', borderWidth: sel?.id === r.id ? 2 : 1 }}>
          <b>REQ-{String(r.numero).padStart(4, '0')}</b> · {r.loja}<div style={{ fontSize: 12, color: 'var(--muted)' }}>{r.titulo} · {r.responsavel_nome || '—'} · {dBR(r.created_at.slice(0, 10))}</div><div style={{ fontSize: 11 }}>{r.status.replace(/_/g, ' ')}</div></div>)}
      </div>

      {sel && <div style={card}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
          <b style={{ fontSize: 14, flex: 1 }}>🛒 Melhor oportunidade de compra — REQ-{String(sel.numero).padStart(4, '0')} · {sel.loja}</b>
          <button className="btn" disabled={!ehComprador && !isOwner(user)} onClick={finalizar} style={{ background: 'var(--bordo)', color: '#fff' }}>Finalizar compra</button>
        </div>
        {loading && <div style={{ color: 'var(--muted)' }}>Calculando…</div>}
        {an && <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 8, marginBottom: 10 }}>
            {[['Custo pelo último preço', brl(totais.ult)], ['Custo pela melhor opção', brl(totais.melhorT)], ['Economia potencial', brl(Math.max(0, totais.ult - totais.melhorT))], ['Compra decidida (negociado)', brl(totais.plan)]].map(([t, v]) =>
              <div key={t} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}><div style={{ fontSize: 10, color: 'var(--muted)' }}>{t}</div><b style={{ fontSize: 16 }}>{v}</b></div>)}
          </div>
          <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead><tr>{['Produto / qtd aprovada', 'Último preço', 'Menor hist. / média', 'Fornecedores que já venderam', 'Cotação vigente', 'Melhor opção', 'Decisão do comprador', 'Recebido'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{itens.map(i => {
              if (i.status !== 'ok') return <tr key={i.item_id}><td style={td}><b>{i.produto}</b><br />{i.qtd} {i.unidade}</td><td style={{ ...td, color: 'var(--muted)' }} colSpan={7}>⚪ sem referência no histórico — registre uma cotação para comparar. {cots.filter(c => c.requisicao_item_id === i.item_id).map(c => `${titulo(c.fornecedor)} ${brl(c.preco)}`).join(' · ')}</td></tr>
              const l = linha(i); const p = planos.find(x => x.requisicao_item_id === i.item_id); const r = recs.filter(x => x.requisicao_item_id === i.item_id)
              const f = forms[i.item_id] || { forn: '', preco: '', val: '' }; const d = dec[i.item_id] || { forn: '', preco: '' }
              const nomesForn = [...new Set([...(i.fornecedores || []).map(x => x.nome), ...l.cv.map(c => c.fornecedor.toUpperCase())])]
              return <tr key={i.item_id}>
                <td style={td}><b>{i.produto}</b><br />{i.qtd} {i.unidade}</td>
                <td style={td}><b>{brl(i.ultimo!.preco)}</b>/{i.un_base}<br /><span style={{ color: 'var(--muted)' }}>{titulo(i.ultimo!.fornecedor)} · {dBR(i.ultimo!.data)}</span></td>
                <td style={td}>{brl(i.menor_hist?.preco)}<br /><span style={{ color: 'var(--muted)' }}>média {brl(i.media)}</span></td>
                <td style={td}>{(i.fornecedores || []).map(x => <div key={x.nome}>{titulo(x.nome)} · {brl(x.ultimo_preco)} <span style={{ color: 'var(--muted)' }}>({dBR(x.data)})</span></div>)}</td>
                <td style={td}>{l.cv.map(c => <div key={c.id}><b>{titulo(c.fornecedor)}</b> {brl(c.preco)} <span style={{ color: 'var(--muted)' }}>{c.validade ? 'até ' + dBR(c.validade) : 'sem validade'}</span> <a onClick={() => delCot(c.id)} style={{ cursor: 'pointer', color: '#DC2626' }}>✕</a></div>)}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px', gap: 3, marginTop: 4 }}>
                    <input style={inp} placeholder="fornecedor" value={f.forn} onChange={e => setForms(s => ({ ...s, [i.item_id]: { ...f, forn: e.target.value } }))} />
                    <input style={inp} placeholder={`R$/${i.un_base}`} inputMode="decimal" value={f.preco} onChange={e => setForms(s => ({ ...s, [i.item_id]: { ...f, preco: e.target.value } }))} />
                    <input style={inp} type="date" value={f.val} onChange={e => setForms(s => ({ ...s, [i.item_id]: { ...f, val: e.target.value } }))} />
                    <button className="btn" style={{ padding: '3px 6px' }} onClick={() => addCot(i)}>+ cotar</button></div></td>
                <td style={td}>{l.melhor ? <><b>{titulo(l.melhor.forn)}</b><br />{brl(l.melhor.preco)} <span style={{ fontSize: 10, color: 'var(--muted)' }}>({l.melhor.tipo})</span><br /><b style={{ color: (l.difPct || 0) < -0.5 ? '#1D9E75' : (l.difPct || 0) > 0.5 ? '#DC2626' : 'inherit' }}>{pctF(l.difPct)} {(l.difPct || 0) < -0.5 ? 'economia' : (l.difPct || 0) > 0.5 ? 'aumento' : 'igual ao último'}</b></> : '—'}</td>
                <td style={td}>{p && <div style={{ color: p.status === 'finalizado' ? '#1D9E75' : '#D97706', fontWeight: 700, marginBottom: 3 }}>{p.status === 'finalizado' ? '✅' : '📝'} {titulo(p.fornecedor)} · {brl(p.preco_negociado)}</div>}
                  <select style={inp} value={d.forn} onChange={e => setDec(s => ({ ...s, [i.item_id]: { ...d, forn: e.target.value } }))}><option value="">{l.melhor ? `Melhor: ${titulo(l.melhor.forn)}` : 'Fornecedor…'}</option>{nomesForn.map(n => <option key={n} value={n}>{titulo(n)}</option>)}</select>
                  <input style={{ ...inp, marginTop: 3 }} placeholder={`preço negociado (R$/${i.un_base})`} inputMode="decimal" value={d.preco} onChange={e => setDec(s => ({ ...s, [i.item_id]: { ...d, preco: e.target.value } }))} />
                  <button className="btn" style={{ marginTop: 3, padding: '3px 8px' }} onClick={() => decidir(i, l.melhor?.forn || '', l.melhor?.preco || 0, l.melhor?.tipo || '')}>Registrar</button></td>
                <td style={td}>{r.length === 0 ? <span style={{ color: 'var(--muted)' }}>—</span> : r.map((x, k) => <div key={k}>{x.pedido}: <b>{x.qtd_recebida}</b>/{x.qtd_pedida}{x.qtd_recebida < x.qtd_pedida ? ' (parcial)' : ' ✅'}{x.preco != null && p ? <div style={{ fontSize: 10.5, color: x.preco > p.preco_negociado ? '#DC2626' : '#1D9E75' }}>NF/pedido {brl(x.preco)} vs. negociado {brl(p.preco_negociado)}</div> : null}</div>)}</td>
              </tr>
            })}</tbody></table></div>
        </>}
      </div>}
    </div>
  )
}
