import { useEffect, useMemo, useState } from 'react'
import { FileText, FileSpreadsheet, Link2, MessageCircle, RefreshCw, X } from 'lucide-react'
import { useToast } from '../../hooks/useToast'
import { baixarExcel, abrirPdf } from './engine'
import {
  type Linha, type Item, type Fonte, FONTE_INFO, LIM, carregarFontes, periodoDe, filtrar, analisarFontes, resumoLojas, alertasG, resumoFornecedores,
  brl, pctF, dBR, tit,
} from './fontes'

const LOJAS = ['Amore Paiva', 'Amore CD', 'Flow CD']
const card: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }
const inp: React.CSSProperties = { padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, boxSizing: 'border-box', width: '100%' }
const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 3 }
const grid = (min: number): React.CSSProperties => ({ display: 'grid', gridTemplateColumns: `repeat(auto-fit,minmax(${min}px,1fr))`, gap: 10 })
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: 11, color: 'var(--muted)', fontWeight: 700, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '7px 10px', fontSize: 12.5, borderBottom: '1px solid var(--border)', verticalAlign: 'top' }
const btn: React.CSSProperties = { background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }

type Visao = 'resumo' | 'historico' | 'lojas' | 'frequencia' | 'negociacao' | 'estimado' | 'alertas'
const VISOES: [Visao, string][] = [['resumo', '📊 Resumo'], ['historico', '🧾 Histórico de preços'], ['lojas', '🏬 Comparativo de lojas'], ['frequencia', '🔁 Frequência'], ['negociacao', '🤝 Negociação'], ['estimado', '⚖️ Estimado × Realizado'], ['alertas', '🔔 Alertas']]
const PERIODOS: [string, string][] = [['7', 'Últimos 7 dias'], ['30', 'Últimos 30 dias'], ['90', 'Últimos 90 dias'], ['180', 'Últimos 180 dias'], ['365', 'Últimos 12 meses'], ['tudo', 'Todo o histórico'], ['custom', 'Personalizado']]
const TIPOS: [string, string][] = [['todos', 'Todos os produtos'], ['frequentes', 'Comprados com frequência'], ['eventuais', 'Comprados eventualmente'], ['aumentando', 'Frequência aumentando'], ['reduzindo', 'Frequência reduzindo'], ['fracionado', 'Pequenas qtds muitas vezes'], ['consolidar', 'Candidatos a compra consolidada'], ['alta', 'Com aumento de preço'], ['sem_nota', 'Sem nota fiscal (só pedido/estimativa)']]

function Tabela({ cab, linhas, vazio }: { cab: string[]; linhas: React.ReactNode[][]; vazio?: string }) {
  if (!linhas.length) return <div style={{ padding: 12, color: 'var(--muted)', fontSize: 12.5 }}>{vazio || 'Sem dados para este filtro.'}</div>
  return <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{cab.map(c => <th key={c} style={th}>{c}</th>)}</tr></thead>
    <tbody>{linhas.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} style={td}>{v}</td>)}</tr>)}</tbody></table></div>
}
const Kpi = ({ t, v, s, c }: { t: string; v: string; s?: string; c?: string }) => (
  <div style={{ ...card, borderLeft: `4px solid ${c || 'var(--bordo)'}` }}><div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{t}</div><div style={{ fontSize: 21, fontWeight: 800, color: c || 'var(--bordo)' }}>{v}</div>{s && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{s}</div>}</div>
)
const FonteTag = ({ f }: { f: Fonte }) => <span style={{ background: FONTE_INFO[f].c + '22', color: FONTE_INFO[f].c, border: `1px solid ${FONTE_INFO[f].c}55`, borderRadius: 999, padding: '1px 8px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{FONTE_INFO[f].l}</span>
const cor = (p: number | null) => p == null ? 'inherit' : p > 0 ? '#DC2626' : p < 0 ? '#1D9E75' : 'inherit'
const FREQ_L = { frequente: '🔁 Frequente', regular: 'Regular', eventual: '🕓 Eventual' }

export default function VisaoGerencialTab({ lojaInicial }: { lojaInicial: string }) {
  const { toast } = useToast()
  const [todas, setTodas] = useState<Linha[]>([]); const [loading, setLoading] = useState(true)
  const [visao, setVisao] = useState<Visao>('resumo')
  const [per, setPer] = useState('90'); const [ini, setIni] = useState(''); const [fim, setFim] = useState('')
  const [loja, setLoja] = useState(lojaInicial); const [fonte, setFonte] = useState<'' | Fonte>(''); const [forn, setForn] = useState(''); const [busca, setBusca] = useState('')
  const [tipo, setTipo] = useState('todos')
  const [ficha, setFicha] = useState<Item | null>(null)
  const [aplicado, setAplicado] = useState({ per: '90', ini: '', fim: '', loja: lojaInicial, fonte: '' as '' | Fonte, forn: '', busca: '' })

  const carregar = async () => {
    setLoading(true)
    try { setTodas(await carregarFontes()) } catch (e: any) { toast('Erro ao carregar as fontes de compra: ' + (e?.message || e), 'error') } finally { setLoading(false) }
  }
  useEffect(() => { carregar() /* eslint-disable-next-line */ }, [])

  const [pIni, pFim] = periodoDe(aplicado.per, aplicado.ini, aplicado.fim)
  const filtradas = useMemo(() => filtrar(todas, { ini: pIni, fim: pFim, loja: aplicado.loja, fonte: '', fornecedor: aplicado.forn, busca: aplicado.busca }), [todas, pIni, pFim, aplicado])
  const todosItens = useMemo(() => analisarFontes(filtradas, pIni, pFim), [filtradas, pIni, pFim])
  // "Origem do preço" restringe o que aparece; as análises de confirmação seguem usando a nota (referência prioritária)
  const itens = useMemo(() => {
    let l = todosItens
    if (aplicado.fonte === 'pedido') l = l.filter(i => i.pedidoN > 0); else if (aplicado.fonte === 'estimativa') l = l.filter(i => i.estimadoN > 0); else if (aplicado.fonte === 'nota') l = l.filter(i => i.compras > 0)
    switch (tipo) {
      case 'frequentes': return l.filter(i => i.freq === 'frequente')
      case 'eventuais': return l.filter(i => i.freq === 'eventual' && i.compras > 0)
      case 'aumentando': return l.filter(i => i.tendencia === 'aumentando'); case 'reduzindo': return l.filter(i => i.tendencia === 'reduzindo')
      case 'fracionado': return l.filter(i => i.fracionado); case 'consolidar': return l.filter(i => i.consolidar)
      case 'alta': return l.filter(i => i.altaPct != null && i.altaPct >= 5); case 'sem_nota': return l.filter(i => i.semNota)
      default: return l
    }
  }, [todosItens, tipo, aplicado.fonte])
  const confirmados = itens.filter(i => i.compras > 0)
  const lojasR = useMemo(() => resumoLojas(confirmados), [confirmados])
  const fornR = useMemo(() => resumoFornecedores(confirmados), [confirmados])
  const alertas = useMemo(() => alertasG(itens), [itens])
  const desembolso = confirmados.reduce((s, i) => s + i.desembolso, 0)
  const nCompras = confirmados.reduce((s, i) => s + i.compras, 0)
  const economia = confirmados.reduce((s, i) => s + (i.difLojaPct >= LIM.difLojaMin && i.difLojaPct <= 400 ? i.economia : 0), 0)
  const fontesCont = useMemo(() => (['nota', 'pedido', 'estimativa'] as Fonte[]).map(f => [f, filtradas.filter(l => l.fonte === f).length] as const), [filtradas])
  const opcForn = useMemo(() => [...new Set(todas.map(l => l.fornecedor_key).filter(Boolean))].sort(), [todas])

  const aplicar = () => setAplicado({ per, ini, fim, loja, fonte, forn, busca })
  const limpar = () => { setPer('90'); setIni(''); setFim(''); setLoja(''); setFonte(''); setForn(''); setBusca(''); setTipo('todos'); setAplicado({ per: '90', ini: '', fim: '', loja: '', fonte: '', forn: '', busca: '' }) }
  const diasLink = aplicado.per === 'tudo' ? 3650 : aplicado.per === 'custom' ? Math.max(1, Math.round((Date.now() - new Date((aplicado.ini || '2025-01-01') + 'T12:00:00').getTime()) / 86400000)) : Number(aplicado.per)
  const link = `${window.location.origin}/relatorio-inteligencia.html?dias=${diasLink}${aplicado.loja ? '&loja=' + encodeURIComponent(aplicado.loja) : ''}`
  const subt = `${aplicado.loja || 'Todas as lojas'} · ${aplicado.per === 'tudo' ? 'todo o histórico' : `${dBR(pIni)} a ${dBR(pFim)}`} · origem: ${aplicado.fonte ? FONTE_INFO[aplicado.fonte].l : 'todas'} · ${confirmados.length} produtos com nota · desembolso ${brl(desembolso)}`

  // ── seções (tela, PDF, Excel) ──
  const secoes = () => [
    { titulo: 'Histórico de preços (nota fiscal = pago)', cab: ['Produto', 'Un.', 'Melhor preço', 'Loja', 'Pior preço', 'Loja', 'Último preço', 'Preço médio pond.', 'Variação melhor×pior', 'Compras', 'Qtd total', 'Desembolso'],
      linhas: confirmados.map(i => [tit(i.nome), i.un, i.melhor?.preco ?? '', i.melhor?.loja ?? '', i.pior?.preco ?? '', i.pior?.loja ?? '', i.ultimo?.preco ?? '', +i.media.toFixed(2), i.variacaoPct == null ? '' : +i.variacaoPct.toFixed(1), i.compras, +i.qtdTotal.toFixed(2), +i.desembolso.toFixed(2)]) },
    { titulo: 'Comparativo entre lojas por produto', cab: ['Produto', 'Un.', 'Loja', 'Preço médio pond.', 'Último preço', 'Compras', 'Qtd', 'Gasto', 'Mais barata?'],
      linhas: confirmados.filter(i => i.lojas.length > 1).flatMap(i => i.lojas.map(l => [tit(i.nome), i.un, l.loja, +l.media.toFixed(2), +l.ultimo.toFixed(2), l.compras, +l.qtd.toFixed(2), +l.valor.toFixed(2), l.loja === i.lojaBarata?.loja ? 'sim' : ''])) },
    { titulo: 'Resumo por loja', cab: ['Loja', 'Produtos', 'Compras', 'Desembolso', 'Índice de preço (1,00 = melhor)', 'Mais barata em', 'Mais cara em', 'Economia potencial'],
      linhas: lojasR.map(l => [l.loja, l.produtos, l.compras, +l.desembolso.toFixed(2), +l.indice.toFixed(3), l.maisBarata, l.maisCara, +l.economia.toFixed(2)]) },
    { titulo: 'Frequência de compras', cab: ['Produto', 'Un.', 'Compras', 'Intervalo médio (dias)', 'Classe', 'Tendência', 'Qtd média/compra', 'Valor médio/compra', 'Observação'],
      linhas: confirmados.map(i => [tit(i.nome), i.un, i.compras, i.intervaloMedio == null ? '' : +i.intervaloMedio.toFixed(1), FREQ_L[i.freq], i.tendencia, +(i.qtdTotal / Math.max(i.compras, 1)).toFixed(2), +(i.desembolso / Math.max(i.compras, 1)).toFixed(2), [i.fracionado ? 'pequenas qtds, muitas vezes' : '', i.consolidar ? 'candidato a compra consolidada' : ''].filter(Boolean).join('; ')]) },
    { titulo: 'Oportunidades de negociação / economia', cab: ['Produto', 'Un.', 'Loja mais barata', 'Preço', 'Loja mais cara', 'Preço', 'Diferença', 'Economia potencial', 'Consolidar?'],
      linhas: confirmados.filter(i => i.economia > 0 && i.difLojaPct >= LIM.difLojaMin && i.difLojaPct <= 400).sort((a, b) => b.economia - a.economia).map(i => [tit(i.nome), i.un, i.lojaBarata!.loja, +i.lojaBarata!.media.toFixed(2), i.lojaCara!.loja, +i.lojaCara!.media.toFixed(2), pctF(i.difLojaPct), +i.economia.toFixed(2), i.consolidar ? 'sim' : '']) },
    { titulo: 'Estimado (requisição) × Pedido × Realizado (nota)', cab: ['Produto', 'Un.', 'Estimado', 'Pedido', 'Pago em nota', 'Dif. estimado R$', 'Dif. estimado %', 'Dif. pedido R$', 'Dif. pedido %'],
      linhas: confirmados.filter(i => i.difEst != null || i.difPed != null).map(i => [tit(i.nome), i.un, i.estimado == null ? '' : +i.estimado.toFixed(2), i.pedido == null ? '' : +i.pedido.toFixed(2), +i.media.toFixed(2), i.difEst == null ? '' : +i.difEst.toFixed(2), i.difEstPct == null ? '' : +i.difEstPct.toFixed(1), i.difPed == null ? '' : +i.difPed.toFixed(2), i.difPedPct == null ? '' : +i.difPedPct.toFixed(1)]) },
    { titulo: 'Fornecedores', cab: ['Fornecedor', 'Compras', 'Produtos', 'Desembolso', 'Índice de preço (1,00 = melhor)'], linhas: fornR.map(f => [tit(f.nome), f.compras, f.produtos, +f.valor.toFixed(2), +f.indice.toFixed(3)]) },
    { titulo: 'Alertas de gestão', cab: ['Tipo', 'Alerta', 'Detalhe'], linhas: alertas.map(a => [a.tipo, a.titulo, a.detalhe]) },
  ]
  const detalhe = () => ({ nome: 'Detalhamento', cab: ['Data', 'Fonte', 'Loja', 'Produto', 'Fornecedor', 'Qtd (un. base)', 'Un.', 'Preço unitário', 'Total', 'Documento', 'Embalagem'],
    linhas: filtradas.filter(l => !aplicado.fonte || l.fonte === aplicado.fonte).map(l => [dBR(l.data), FONTE_INFO[l.fonte].l, l.loja, tit(l.descricao), tit(l.fornecedor_key), +l.qtd_base.toFixed(3), l.un_base, +l.preco_base.toFixed(2), +l.valor.toFixed(2), l.documento, l.embalagem]) })
  const exportarExcel = () => {
    const abas = secoes().map(s => ({ nome: s.titulo.replace(/\(.*\)/, '').trim().slice(0, 28), cab: s.cab, linhas: s.linhas })); abas.push(detalhe())
    baixarExcel('inteligencia-compras', abas)
  }
  const exportarPdf = () => { if (!abrirPdf('Relatório Inteligente de Compras — Amore Food', subt, secoes().map(s => ({ ...s, linhas: s.linhas.slice(0, 60) })))) toast('Permita pop-ups para gerar o PDF.', 'error') }
  const copiar = async () => { try { await navigator.clipboard.writeText(link); toast('Link copiado.', 'success') } catch { window.prompt('Copie o link:', link) } }
  const zap = () => window.open('https://wa.me/?text=' + encodeURIComponent(`📊 *Inteligência de Compras — Amore Food*\n${aplicado.loja || 'Todas as lojas'} · ${aplicado.per === 'tudo' ? 'todo o histórico' : dBR(pIni) + ' a ' + dBR(pFim)}\n\n${link}`), '_blank')

  const Nome = ({ i }: { i: Item }) => <a onClick={() => setFicha(i)} style={{ cursor: 'pointer', color: 'var(--bordo)', fontWeight: 600, textDecoration: 'underline' }}>{tit(i.nome)}</a>
  const pl = (l: string, v: number | undefined) => v == null ? '—' : `${brl(v)} (${l})`

  return (
    <div>
      <div style={{ ...card, marginBottom: 12 }}>
        <div style={grid(150)}>
          <div><label style={lbl}>Período de análise</label><select style={inp} value={per} onChange={e => setPer(e.target.value)}>{PERIODOS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          {per === 'custom' && <><div><label style={lbl}>De</label><input type="date" style={inp} value={ini} onChange={e => setIni(e.target.value)} /></div><div><label style={lbl}>Até</label><input type="date" style={inp} value={fim} onChange={e => setFim(e.target.value)} /></div></>}
          <div><label style={lbl}>Loja</label><select style={inp} value={loja} onChange={e => setLoja(e.target.value)}><option value="">Todas as lojas</option>{LOJAS.map(l => <option key={l}>{l}</option>)}</select></div>
          <div><label style={lbl}>Origem do preço</label><select style={inp} value={fonte} onChange={e => setFonte(e.target.value as any)}><option value="">Todas as fontes</option>{(Object.keys(FONTE_INFO) as Fonte[]).map(f => <option key={f} value={f}>{FONTE_INFO[f].l}</option>)}</select></div>
          <div><label style={lbl}>Fornecedor</label><select style={inp} value={forn} onChange={e => setForn(e.target.value)}><option value="">Todos</option>{opcForn.map(f => <option key={f} value={f}>{tit(f)}</option>)}</select></div>
          <div><label style={lbl}>Produto</label><input style={inp} placeholder="Buscar produto…" value={busca} onChange={e => setBusca(e.target.value)} onKeyDown={e => e.key === 'Enter' && aplicar()} /></div>
          <div><label style={lbl}>Tipo de análise</label><select style={inp} value={tipo} onChange={e => setTipo(e.target.value)}>{TIPOS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn" onClick={aplicar} style={{ background: 'var(--bordo)', color: '#fff' }}>Aplicar configuração</button>
          <button className="btn" onClick={limpar} style={btn}>Limpar</button>
          <button className="btn" onClick={carregar} style={btn}><RefreshCw size={12} /> Atualizar</button>
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={exportarPdf} style={{ background: 'var(--bordo)', color: '#fff' }}><FileText size={12} /> PDF</button>
          <button className="btn" onClick={exportarExcel} style={{ background: '#1D6F42', color: '#fff' }}><FileSpreadsheet size={12} /> Excel</button>
          <button className="btn" onClick={copiar} style={btn}><Link2 size={12} /> Copiar link</button>
          <button className="btn" onClick={zap} style={btn} title="Abre o seu WhatsApp com o link — você escolhe o contato e confirma o envio"><MessageCircle size={12} /> Compartilhar</button>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 8 }}>
          Fontes no filtro: {fontesCont.map(([f, n]) => `${FONTE_INFO[f].l}: ${n}`).join(' · ')}. Melhor/pior/médio/frequência usam <b>somente notas fiscais</b>; pedido e estimativa aparecem separados e servem de comparação.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {VISOES.map(([k, l]) => <button key={k} className="btn" onClick={() => setVisao(k)} style={{ background: visao === k ? 'var(--bordo)' : 'var(--card)', color: visao === k ? '#fff' : 'var(--text)', border: '1px solid var(--border)' }}>{l}{k === 'alertas' && alertas.length ? ` (${alertas.length})` : ''}</button>)}
      </div>

      {loading ? <div style={{ ...card, color: 'var(--muted)' }}>Carregando as 3 fontes de compra…</div> : <>

      {visao === 'resumo' && <>
        <div style={{ ...grid(180), marginBottom: 12 }}>
          <Kpi t="Desembolso confirmado (NF)" v={brl(desembolso)} s={`${nCompras} compras · ${confirmados.length} produtos`} />
          <Kpi t="Economia potencial" v={brl(economia)} s="todas as lojas ao preço da mais barata" c="#1D9E75" />
          <Kpi t="Candidatos a consolidar" v={String(itens.filter(i => i.consolidar).length)} s="compra conjunta p/ negociar" c="#7C3AED" />
          <Kpi t="Alertas" v={String(alertas.length)} s={`${alertas.filter(a => a.tipo === 'aumento').length} aumentos · ${alertas.filter(a => a.tipo === 'estimativa').length} estimativa×pago`} c="#DC2626" />
        </div>
        <div style={{ ...grid(340), marginBottom: 12 }}>
          <div style={card}><b style={{ fontSize: 13 }}>Maior desembolso</b><Tabela cab={['Produto', 'Compras', 'Último', 'Gasto']} linhas={confirmados.slice(0, 8).map(i => [<Nome i={i} />, i.compras, brl(i.ultimo?.preco), brl(i.desembolso)])} /></div>
          <div style={card}><b style={{ fontSize: 13 }}>Lojas — quem compra melhor</b><Tabela cab={['Loja', 'Índice', 'Mais barata em', 'Mais cara em', 'Gasto']} linhas={lojasR.map(l => [l.loja, l.indice.toFixed(3).replace('.', ','), l.maisBarata, l.maisCara, brl(l.desembolso)])} /></div>
        </div>
        <div style={card}><b style={{ fontSize: 13 }}>🔔 Alertas principais</b><Tabela cab={['Tipo', 'Alerta', 'Detalhe']} vazio="Nenhum alerta neste filtro." linhas={alertas.slice(0, 12).map(a => [a.tipo, a.titulo, a.detalhe])} /></div>
      </>}

      {visao === 'historico' && <div style={card}><b style={{ fontSize: 13 }}>Histórico de preços por produto — clique no produto para ver compra a compra</b>
        <Tabela cab={['Produto', 'Un.', 'Melhor preço', 'Pior preço', 'Último', 'Médio pond.', 'Var. melhor×pior', 'Compras', 'Qtd total', 'Desembolso']}
          linhas={confirmados.map(i => [<Nome i={i} />, i.un, pl(i.melhor?.loja || '', i.melhor?.preco), pl(i.pior?.loja || '', i.pior?.preco), brl(i.ultimo?.preco), brl(i.media), <span style={{ color: cor(i.variacaoPct), fontWeight: 700 }}>{pctF(i.variacaoPct)}</span>, i.compras, +i.qtdTotal.toFixed(2), brl(i.desembolso)])} /></div>}

      {visao === 'lojas' && <>
        <div style={{ ...card, marginBottom: 12 }}><b style={{ fontSize: 13 }}>Qual loja compra melhor?</b>
          <Tabela cab={['Loja', 'Produtos', 'Compras', 'Desembolso', 'Índice de preço', 'Mais barata em', 'Mais cara em', 'Economia potencial']}
            linhas={lojasR.map(l => [l.loja, l.produtos, l.compras, brl(l.desembolso), l.indice.toFixed(3).replace('.', ','), l.maisBarata, l.maisCara, <b style={{ color: '#1D9E75' }}>{brl(l.economia)}</b>])} />
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6 }}>Índice 1,00 = a loja sempre paga o menor preço médio ponderado entre as lojas, nos produtos comprados por 2+ lojas.</div></div>
        <div style={card}><b style={{ fontSize: 13 }}>Mesmo produto, preços diferentes entre lojas</b>
          <Tabela vazio="Nenhum produto com 2+ lojas confirmadas neste filtro." cab={['Produto', 'Un.', 'Mais barata', 'Mais cara', 'Diferença', 'Economia potencial']}
            linhas={confirmados.filter(i => i.lojas.length > 1 && i.difLojaPct <= 400).sort((a, b) => b.difLojaPct - a.difLojaPct).map(i => [<Nome i={i} />, i.un, pl(i.lojaBarata!.loja, i.lojaBarata!.media), pl(i.lojaCara!.loja, i.lojaCara!.media), <b style={{ color: '#DC2626' }}>{pctF(i.difLojaPct)}</b>, brl(i.economia)])} /></div>
      </>}

      {visao === 'frequencia' && <div style={card}><b style={{ fontSize: 13 }}>Frequência de compras (eventos reais de nota fiscal)</b>
        <div style={{ fontSize: 11.5, color: 'var(--muted)', margin: '4px 0' }}>Frequente = 4+ compras com intervalo médio ≤ {LIM.frequente} dias · Eventual = até 2 compras ou intervalo &gt; {LIM.eventual} dias · Pequenas quantidades = 4+ compras, intervalo ≤ {LIM.frequente} dias e valor médio &lt; {brl(LIM.fracionadoValor)}.</div>
        <Tabela cab={['Produto', 'Compras', 'Intervalo médio', 'Classe', 'Tendência', 'Qtd/compra', 'Valor/compra', 'Observações']}
          linhas={confirmados.slice().sort((a, b) => b.compras - a.compras).map(i => [<Nome i={i} />, i.compras, i.intervaloMedio == null ? '—' : `${i.intervaloMedio.toFixed(0)} dias`, FREQ_L[i.freq], i.tendencia === 'aumentando' ? '📈 aumentando' : i.tendencia === 'reduzindo' ? '📉 reduzindo' : 'estável', `${(i.qtdTotal / Math.max(i.compras, 1)).toFixed(1)} ${i.un}`, brl(i.desembolso / Math.max(i.compras, 1)), [i.fracionado ? '🧩 pequenas qtds, muitas vezes' : '', i.consolidar ? '🤝 consolidar' : ''].filter(Boolean).join(' · ') || '—'])} /></div>}

      {visao === 'negociacao' && <div style={card}><b style={{ fontSize: 13 }}>Inteligência de negociação — onde dá para pagar menos</b>
        <Tabela vazio="Nenhuma oportunidade neste filtro." cab={['Produto', 'Gasto no período', 'Mais barata', 'Mais cara', 'Diferença', 'Economia potencial', 'Sugestão']}
          linhas={confirmados.filter(i => i.economia > 0 || i.consolidar).sort((a, b) => b.economia - a.economia).slice(0, 80).map(i => [<Nome i={i} />, brl(i.desembolso), i.lojaBarata ? pl(i.lojaBarata.loja, i.lojaBarata.media) : '—', i.lojaCara && i.lojas.length > 1 ? pl(i.lojaCara.loja, i.lojaCara.media) : '—', i.lojas.length > 1 ? pctF(i.difLojaPct) : '—', <b style={{ color: '#1D9E75' }}>{brl(i.economia)}</b>, i.consolidar ? (i.lojas.length > 1 ? 'Centralizar a negociação entre as lojas' : 'Compra consolidada (menos pedidos, maior volume)') : 'Replicar o preço da loja mais barata'])} /></div>}

      {visao === 'estimado' && <div style={card}><b style={{ fontSize: 13 }}>Estimativa da requisição × Pedido × Pago em nota fiscal</b>
        <div style={{ fontSize: 11.5, color: 'var(--muted)', margin: '4px 0' }}>Preço por unidade-base (kg, L ou un), médias ponderadas pela quantidade. Estimativa e pedido nunca entram no melhor/pior pago. Diferença positiva = estimou/pediu a mais do que pagou.</div>
        <Tabela vazio="Nenhum produto com estimativa ou pedido comparável a uma nota fiscal neste filtro." cab={['Produto', 'Un.', 'Estimado', 'Pedido', 'Pago (NF)', 'Estimado − Pago', 'Pedido − Pago']}
          linhas={confirmados.filter(i => i.difEst != null || i.difPed != null).sort((a, b) => Math.abs(b.difEstPct ?? b.difPedPct ?? 0) - Math.abs(a.difEstPct ?? a.difPedPct ?? 0)).map(i => [<Nome i={i} />, i.un, i.estimado == null ? '—' : brl(i.estimado), i.pedido == null ? '—' : brl(i.pedido), brl(i.media),
            i.difEst == null ? '—' : <span style={{ color: i.difEst > 0 ? '#DC2626' : '#1D9E75', fontWeight: 700 }}>{brl(i.difEst)} ({pctF(i.difEstPct)})</span>,
            i.difPed == null ? '—' : <span style={{ color: i.difPed > 0 ? '#DC2626' : '#1D9E75', fontWeight: 700 }}>{brl(i.difPed)} ({pctF(i.difPedPct)})</span>])} /></div>}

      {visao === 'alertas' && <div style={card}><b style={{ fontSize: 13 }}>Alertas inteligentes de gestão</b>
        <Tabela vazio="Nenhum alerta neste filtro." cab={['Tipo', 'Produto', 'Alerta', 'Detalhe']} linhas={alertas.map(a => [a.tipo === 'aumento' ? '🔴 Aumento de preço' : a.tipo === 'economia' ? '💰 Oportunidade' : a.tipo === 'frequencia' ? '⏱️ Frequência' : '⚖️ Estimativa × pago', <Nome i={a.item} />, a.titulo, a.detalhe])} /></div>}
      </>}

      {ficha && <FichaModal item={ficha} linhas={filtradas.filter(l => l.produto_key + '|' + l.un_base === ficha.key)} fechar={() => setFicha(null)} />}
    </div>
  )
}

function FichaModal({ item: i, linhas, fechar }: { item: Item; linhas: Linha[]; fechar: () => void }) {
  const ord = [...linhas].sort((a, b) => b.data.localeCompare(a.data))
  return (
    <div onClick={fechar} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
      <div onClick={e => e.stopPropagation()} style={{ ...card, width: 'min(980px,100%)', maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><h3 style={{ margin: 0, flex: 1 }}>{tit(i.nome)} <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>preço por {i.un}</span></h3><button className="btn" onClick={fechar} style={btn}><X size={13} /></button></div>
        <div style={{ ...grid(150), margin: '10px 0' }}>
          <Kpi t="Melhor preço (NF)" v={i.melhor ? brl(i.melhor.preco) : '—'} s={i.melhor?.loja} c="#1D9E75" />
          <Kpi t="Pior preço (NF)" v={i.pior ? brl(i.pior.preco) : '—'} s={i.pior?.loja} c="#DC2626" />
          <Kpi t="Variação" v={pctF(i.variacaoPct)} s={`${i.compras} compra(s) confirmada(s)`} />
          <Kpi t="Estimado / Pedido" v={`${i.estimado == null ? '—' : brl(i.estimado)} / ${i.pedido == null ? '—' : brl(i.pedido)}`} s="médias ponderadas" c="#D97706" />
        </div>
        {i.descartados > 0 && <div style={{ fontSize: 11.5, color: '#B45309', marginBottom: 6 }}>⚠️ {i.descartados} compra(s) com preço muito fora do padrão (provável embalagem/unidade trocada) foram desconsideradas nos indicadores, mas aparecem abaixo.</div>}
        <Tabela cab={['Data', 'Loja', 'Fonte', 'Fornecedor', 'Qtd', 'Embalagem', `Preço/${i.un}`, 'Total', 'Documento']}
          linhas={ord.map(l => [dBR(l.data), l.loja, <FonteTag f={l.fonte} />, tit(l.fornecedor_key), +l.qtd_base.toFixed(2), l.embalagem || '—', brl(l.preco_base), brl(l.valor), l.documento || '—'])} />
      </div>
    </div>
  )
}
