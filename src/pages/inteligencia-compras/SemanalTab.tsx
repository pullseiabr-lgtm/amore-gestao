import { useEffect, useMemo, useState } from 'react'
import { FileText, FileSpreadsheet, Send } from 'lucide-react'
import { useToast } from '../../hooks/useToast'
import { fetchAppConfig, saveAppConfig } from '../../lib/db'
import { enviarWhatsApp } from '../../lib/notify'
import { type Compra, type Cfg, brl, pctF, dBR, titulo, abrirPdf, baixarExcel } from './engine'
import { relatorioSemanal, semanaAnteriorCompleta, addDias } from './semanal'

const LOJAS = ['Amore Paiva', 'Amore CD', 'Flow CD']
const card: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', marginBottom: 10 }
const inp: React.CSSProperties = { padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, boxSizing: 'border-box' }
const th: React.CSSProperties = { textAlign: 'left', padding: '7px 9px', fontSize: 11, color: 'var(--muted)', fontWeight: 700, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '6px 9px', fontSize: 12.5, borderBottom: '1px solid var(--border)', verticalAlign: 'top' }

function Tab({ cab, linhas }: { cab: string[]; linhas: (string | number)[][] }) {
  if (!linhas.length) return <div style={{ padding: 10, color: 'var(--muted)', fontSize: 12.5 }}>Sem dados nesta semana.</div>
  return <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{cab.map(c => <th key={c} style={th}>{c}</th>)}</tr></thead><tbody>{linhas.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} style={td}>{v}</td>)}</tr>)}</tbody></table></div>
}

export default function SemanalTab({ todas, cfg, lojaInicial, podeEnviar }: { todas: Compra[]; cfg: Cfg; lojaInicial: string; podeEnviar: boolean }) {
  const { toast } = useToast()
  const [loja, setLoja] = useState(lojaInicial || 'Amore Paiva')
  const [ini, setIni] = useState(semanaAnteriorCompleta())
  const r = useMemo(() => relatorioSemanal(todas, loja, ini, cfg), [todas, loja, ini, cfg])
  const fim = addDias(ini, 6)

  // Registra (sem enviar nada) o consolidado da semana fechada; ajustes posteriores entram como nova versão.
  useEffect(() => {
    if (!todas.length || fim >= new Date().toISOString().slice(0, 10) || r.linhas === 0) return
    const chave = `ic_semanal_${loja.replace(/\s+/g, '_')}_${ini}`
    fetchAppConfig<any>(chave).then(ant => {
      const versoes: any[] = ant?.versoes || []
      const ult = versoes[versoes.length - 1]
      if (ult && ult.linhas === r.linhas && Math.abs(ult.total - r.total) < 0.01) return
      saveAppConfig(chave, { loja, ini, fim, resumo: r.resumo, origens: r.origens, versoes: [...versoes, { em: new Date().toISOString(), linhas: r.linhas, total: r.total }].slice(-10) })
    })
  }, [r, loja, ini, fim, todas.length])

  const nome = (i: { nome: string }) => titulo(i.nome)
  const secoes = [
    { titulo: 'Resumo financeiro', cab: ['Indicador', 'Semana', 'Semana anterior', 'Variação'], linhas: [
      ['Total comprado', brl(r.total), brl(r.totalAnt), pctF(r.varTotal)], ['Produtos distintos', r.nProdutos, r.nProdutosAnt, ''], ['Fornecedores', r.nForn, r.nFornAnt, ''], ['Variação do custo de aquisição (itens comparáveis)', pctF(r.varCusto), '', '']] },
    { titulo: 'Análise item a item', cab: ['Produto', 'Un.', 'Qtd', 'Último preço', 'Preço sem. anterior', 'Variação', 'Valor total', 'Fornecedores'], linhas: r.itens.map(i => [nome(i), i.un, +i.qtd.toFixed(2), i.preco == null ? 'sem preço unit.' : brl(i.preco), i.precoAnt == null ? '—' : brl(i.precoAnt), i.suspeito ? '❓ suspeito' : pctF(i.varPct), brl(i.valor), i.fornecedores.map(titulo).join(', ')]) },
    { titulo: 'Fornecedores — maior volume, melhores preços e reajustes', cab: ['Fornecedor', 'Volume', 'Itens', 'Índice de preço (1,00 = melhor)', 'Reajustes'], linhas: r.forns.map(f => [titulo(f.nome), brl(f.valor), f.itens, f.idx == null ? '—' : f.idx.toFixed(2).replace('.', ','), f.reajustes.length ? f.reajustes.slice(0, 3).map(x => `${titulo(x.produto)} ${pctF(x.pct)}`).join(' · ') : '—']) },
    { titulo: 'Compras acima da média histórica', cab: ['Produto', 'Preço da semana', 'Média histórica', 'Diferença'], linhas: r.acimaMedia.map(i => [nome(i), brl(i.preco), brl(i.mediaHist), pctF(((i.preco! - i.mediaHist!) / i.mediaHist!) * 100)]) },
    { titulo: 'Ranking — mais comprados', cab: ['Produto', 'Datas de compra', 'Qtd', 'Valor'], linhas: r.maisComprados.map(i => [nome(i), i.compras, `${i.qtd.toFixed(2)} ${i.un}`, brl(i.valor)]) },
    { titulo: 'Ranking — maior custo', cab: ['Produto', 'Valor', 'Qtd'], linhas: r.maiorCusto.map(i => [nome(i), brl(i.valor), `${i.qtd.toFixed(2)} ${i.un}`]) },
    { titulo: 'Ranking — maior aumento (Top 20)', cab: ['Produto', 'Anterior', 'Atual', 'Variação', 'Fornecedores'], linhas: r.altas.map(i => [nome(i), brl(i.precoAnt), brl(i.preco), pctF(i.varPct), i.fornecedores.map(titulo).join(', ')]) },
    { titulo: 'Ranking — maior variação de consumo (qtd vs. semana anterior)', cab: ['Produto', 'Semana', 'Anterior', 'Variação'], linhas: r.varConsumo.map(i => [nome(i), `${i.qtd.toFixed(2)} ${i.un}`, `${i.qtdAnt.toFixed(2)} ${i.un}`, pctF(i.varConsumo)]) },
    { titulo: 'Oportunidades de negociação', cab: ['Produto', 'Pago a', 'Preço pago', 'Melhor preço (fornecedor)', 'Economia potencial'], linhas: r.oport.slice(0, 20).map(o => [titulo(o.produto), titulo(o.pagoA), brl(o.preco), `${brl(o.melhorPreco)} (${titulo(o.melhor)})`, brl(o.economia)]) },
    { titulo: 'Plano de ação', cab: ['Ação'], linhas: r.plano.map(p => [p]) },
    { titulo: 'Compras fora do padrão / alertas', cab: ['Alerta'], linhas: r.foraPadrao.map(p => [p]) },
  ]
  const nomeArq = `semanal-${loja.replace(/\s+/g, '-')}-${ini}`
  const enviarZap = async () => {
    const nums = (cfg.semanalFones || '').split(/[\n,;]+/).map(s => s.replace(/\D/g, '')).filter(n => n.length >= 10)
    if (!nums.length) { toast('Cadastre os WhatsApps dos gestores em Configurações.', 'error'); return }
    if (!confirm(`Enviar o resumo executivo da semana a ${nums.length} gestor(es)? Envio manual.`)) return
    let ok = 0
    for (const n of nums) { if (await enviarWhatsApp(n, `📊 *Inteligência de Compras — Semana ${dBR(ini)} a ${dBR(fim)}*\n${loja}\n\n${r.resumo}\n\n_Painel Amore_`)) ok++; await new Promise(res => setTimeout(res, 3000 + Math.random() * 4000)) }
    toast(`Enviado para ${ok} de ${nums.length}.`)
  }

  return <div>
    <div style={{ ...card, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
      <div><label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block' }}>Loja</label><select style={inp} value={loja} onChange={e => setLoja(e.target.value)}>{LOJAS.map(l => <option key={l}>{l}</option>)}<option value="">Todas (consolidado)</option></select></div>
      <div><label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block' }}>Semana (segunda a domingo)</label>
        <div style={{ display: 'flex', gap: 4 }}><button className="btn" onClick={() => setIni(addDias(ini, -7))}>◀</button><input type="date" style={inp} value={ini} onChange={e => { const d = e.target.value; if (d) setIni(addDias(d, -(((new Date(d + 'T12:00:00').getDay() + 6) % 7)))) }} /><button className="btn" onClick={() => setIni(addDias(ini, 7))}>▶</button></div></div>
      <div style={{ fontSize: 12, color: 'var(--muted)', flex: 1, minWidth: 180 }}>{dBR(ini)} a {dBR(fim)} · {r.linhas} lançamentos. O consolidado da semana fechada é gravado automaticamente ao abrir (sem enviar nada).</div>
      <button className="btn" style={{ background: 'var(--bordo)', color: '#fff' }} onClick={() => { if (!abrirPdf(`Relatório Semanal de Compras — ${loja || 'Todas as lojas'}`, `${dBR(ini)} a ${dBR(fim)}\n${r.resumo}`, secoes)) toast('Permita pop-ups para gerar o PDF.', 'error') }}><FileText size={12} /> PDF</button>
      <button className="btn" style={{ background: '#1D6F42', color: '#fff' }} onClick={() => baixarExcel(nomeArq, secoes.map(s => ({ nome: s.titulo.slice(0, 28), cab: s.cab, linhas: s.linhas })))}><FileSpreadsheet size={12} /> Excel</button>
      <button className="btn" disabled={!cfg.semanalWhatsApp || !podeEnviar} title={cfg.semanalWhatsApp ? 'Envio manual aos gestores' : 'Desligado: o Esdras precisa liberar em Configurações'} onClick={enviarZap} style={{ background: '#25D366', color: '#fff' }}><Send size={12} /> Enviar resumo no WhatsApp</button>
    </div>
    <div style={{ ...card, borderLeft: '4px solid var(--bordo)' }}><b>Resumo executivo</b><div style={{ fontSize: 13, marginTop: 4, whiteSpace: 'pre-wrap' }}>{r.resumo}</div></div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 10, marginBottom: 10 }}>
      {[['Total da semana', brl(r.total)], ['vs. semana anterior', pctF(r.varTotal)], ['Produtos / fornecedores', `${r.nProdutos} / ${r.nForn}`], ['Variação custo aquisição', pctF(r.varCusto)]].map(([t, v]) => <div key={t} style={{ ...card, marginBottom: 0 }}><div style={{ fontSize: 11, color: 'var(--muted)' }}>{t}</div><b style={{ fontSize: 20, color: 'var(--bordo)' }}>{v}</b></div>)}
    </div>
    {secoes.map(s => <div key={s.titulo} style={card}><b style={{ fontSize: 13 }}>{s.titulo}</b><Tab cab={s.cab} linhas={s.linhas} /></div>)}
    <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>Origem dos dados: {r.origens.length} caixa(s)/prestação(ões) — ids ficam gravados no consolidado (app_config ic_semanal_*). Itens sem quantidade/unidade entram no total, mas não nas variações de preço.</div>
  </div>
}
