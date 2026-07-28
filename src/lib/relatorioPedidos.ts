// Relatório visual "Comparativo & Pedidos" da cotação — abre em nova aba pronto p/ imprimir/PDF.
// Escolhe o MENOR preço por item entre os fornecedores que cotaram, calcula a % de economia
// (vs maior preço cotado) e monta o pedido por fornecedor vencedor.
import { supabase } from './supabase'
const db = supabase as any

const esc = (s: unknown) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const brl = (v: number) => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const marca = (o: string) => { try { return JSON.parse(o || '{}').marca || '' } catch { return '' } }

export async function gerarRelatorioPedidos(req: { id: string; numero?: number; titulo?: string; loja: string }) {
  const win = window.open('', '_blank')
  if (win) win.document.write('<p style="font-family:sans-serif;padding:24px">Gerando relatório…</p>')

  const [{ data: itens }, { data: cots }, { data: forns }] = await Promise.all([
    db.from('requisicao_itens').select('id,produto_nome,quantidade,unidade').eq('requisicao_id', req.id).order('produto_nome'),
    db.from('requisicao_cotacoes').select('id,fornecedor_nome').eq('requisicao_id', req.id),
    db.from('fornecedores').select('nome,whatsapp,telefone,contato_nome').eq('loja', req.loja).limit(2000),
  ])
  const ids = (cots || []).map((c: any) => c.id)
  const nomeCot: Record<string, string> = {}; (cots || []).forEach((c: any) => nomeCot[c.id] = c.fornecedor_nome)
  const { data: ci } = ids.length
    ? await db.from('requisicao_cotacao_itens').select('cotacao_id,item_id,preco_unitario,disponivel,observacoes').in('cotacao_id', ids)
    : { data: [] }
  const contato: Record<string, { zap: string; vend: string }> = {}
  ;(forns || []).forEach((f: any) => { const k = (f.nome || '').toLowerCase(); if (!contato[k]) contato[k] = { zap: (f.whatsapp || f.telefone || '').replace(/\D/g, ''), vend: f.contato_nome || '' } })

  const ofertas: Record<string, { forn: string; preco: number; marca: string }[]> = {}
  ;(itens || []).forEach((i: any) => ofertas[i.id] = [])
  ;(ci || []).forEach((r: any) => { const pr = Number(r.preco_unitario) || 0; if (r.disponivel !== false && pr > 0 && ofertas[r.item_id]) ofertas[r.item_id].push({ forn: nomeCot[r.cotacao_id], preco: pr, marca: marca(r.observacoes) }) })

  const comp = (itens || []).map((i: any) => {
    const of = ofertas[i.id].slice().sort((a, b) => a.preco - b.preco)
    const win2 = of[0] || null, seg = of[1] || null
    // Economia = redução vs o 2º melhor preço; ignora 2º preço absurdo (>3x o menor = provável erro de digitação)
    const baseSeg = win2 && seg && seg.preco <= win2.preco * 3 ? seg.preco : 0
    const ecoPct = win2 && baseSeg > 0 ? ((baseSeg - win2.preco) / baseSeg) * 100 : 0
    const ecoVal = win2 && baseSeg > 0 ? (baseSeg - win2.preco) * i.quantidade : 0
    return { prod: i.produto_nome, qtd: i.quantidade, un: i.unidade, nQ: of.length, win: win2, seg, ecoPct, ecoVal }
  })
  const pedidos: Record<string, { itens: any[]; total: number; contato: any }> = {}
  comp.forEach((c: any) => { if (!c.win) return; const f = c.win.forn; (pedidos[f] = pedidos[f] || { itens: [], total: 0, contato: contato[f.toLowerCase()] || {} }); const lt = c.win.preco * c.qtd; pedidos[f].itens.push({ prod: c.prod, qtd: c.qtd, un: c.un, preco: c.win.preco, marca: c.win.marca, total: lt }); pedidos[f].total += lt })
  const semCot = comp.filter((c: any) => !c.win)
  const totalGeral = comp.reduce((s: number, c: any) => s + (c.win ? c.win.preco * c.qtd : 0), 0)
  const economia = comp.reduce((s: number, c: any) => s + c.ecoVal, 0)
  const fornsPart = new Set(comp.flatMap((c: any) => (c.win ? [c.win.forn] : []).concat(c.seg ? [c.seg.forn] : []))).size
  const cotados = comp.filter((c: any) => c.win).length
  const hoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })

  const compRows = comp.map((c: any) => {
    const w = c.win
    const flag = w && c.seg && w.preco < c.seg.preco * 0.4 ? '<span title="muito abaixo do 2º — conferir" style="color:var(--warn)">⚠ </span>' : ''
    return `<tr class="${w ? '' : 'nocot'}"><td class="prod">${esc(c.prod)}</td><td class="num">${c.qtd} <span class="un">${esc(c.un)}</span></td><td class="num">${c.nQ || '—'}</td>${w ? `<td class="win">${flag}🏆 ${esc(w.forn)}${w.marca ? `<span class="mc">${esc(w.marca)}</span>` : ''}</td><td class="num pr"><b>${brl(w.preco)}</b></td><td class="num">${brl(w.preco * c.qtd)}</td><td class="num eco">${c.ecoPct > 0 ? '-' + c.ecoPct.toFixed(0) + '%' : '—'}</td><td class="num mut">${c.seg ? brl(c.seg.preco) : '—'}</td>` : `<td colspan="5" class="semq">Sem cotação válida</td>`}</tr>`
  }).join('')
  const peds = Object.entries(pedidos).sort((a, b) => b[1].total - a[1].total).map(([f, p]) => {
    const rows = p.itens.map(i => `<tr><td>${esc(i.prod)}${i.marca ? `<span class="mc">${esc(i.marca)}</span>` : ''}</td><td class="num">${i.qtd} ${esc(i.un)}</td><td class="num">${brl(i.preco)}</td><td class="num">${brl(i.total)}</td></tr>`).join('')
    return `<div class="ped"><div class="phd"><b>${esc(f)}</b>${p.contato.vend ? ` · ${esc(p.contato.vend)}` : ''}${p.contato.zap ? ` · 📲 ${esc(p.contato.zap)}` : ''}<span class="pt">${brl(p.total)}</span></div><table class="pt2"><thead><tr><th>Produto</th><th class="num">Qtd</th><th class="num">Unit.</th><th class="num">Total</th></tr></thead><tbody>${rows}</tbody></table></div>`
  }).join('')

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Comparativo & Pedidos — ${esc(req.loja)} REQ-${String(req.numero || '').padStart(4, '0')}</title>
<style>
:root{--vinho:#8B1212;--bg:#faf7f6;--card:#fff;--text:#1c1517;--muted:#6f656a;--border:#ece4e5;--ok:#15803D;--warn:#B45309;--shadow:0 1px 2px rgba(80,20,25,.05),0 8px 24px -12px rgba(80,20,25,.12)}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.5;font-variant-numeric:tabular-nums}
.wrap{max-width:1060px;margin:0 auto;padding:28px 20px 60px}
header.top{border-bottom:2px solid var(--vinho);padding-bottom:14px;margin-bottom:16px;display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap}
.eyebrow{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--vinho);font-weight:700}
h1{font-size:23px;margin:6px 0 4px}.sub{color:var(--muted);font-size:13.5px}
.btn{border:1px solid var(--vinho);background:var(--vinho);color:#fff;border-radius:10px;padding:9px 15px;font-size:13px;font-weight:600;cursor:pointer}
h2{font-size:17px;margin:26px 0 12px;color:var(--vinho)}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:16px 0}
.kpi{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:14px 16px;box-shadow:var(--shadow)}
.kpi.eco{border-left:4px solid var(--ok)}.kpi.eco .kn{color:var(--ok)}
.kpi .kn{font-size:23px;font-weight:800}.kpi .kl{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
.tw{overflow-x:auto;border:1px solid var(--border);border-radius:14px;box-shadow:var(--shadow);background:var(--card)}
table{width:100%;border-collapse:collapse;font-size:13px;min-width:740px}
thead th{text-align:left;font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);font-weight:700;padding:10px 12px;border-bottom:1px solid var(--border);white-space:nowrap}
tbody td{padding:9px 12px;border-bottom:1px solid var(--border)}tbody tr:last-child td{border-bottom:none}
.num{text-align:right;white-space:nowrap}.prod{font-weight:600}.un{color:var(--muted);font-size:11px}.mut{color:var(--muted)}
.win{color:var(--ok);font-weight:600}.pr b{color:var(--vinho);font-size:14px}.eco{color:var(--ok);font-weight:700}
.mc{display:block;font-size:10.5px;color:var(--muted);font-weight:400}.semq,.nocot .prod{color:var(--warn)}.semq{text-align:center;font-size:12px}
.ped{border:1px solid var(--border);border-radius:14px;box-shadow:var(--shadow);background:var(--card);margin-bottom:14px;overflow:hidden}
.phd{padding:12px 16px;background:color-mix(in srgb,var(--vinho) 6%,var(--card));border-bottom:1px solid var(--border);font-size:14px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.phd .pt{margin-left:auto;font-weight:800;color:var(--vinho);font-size:15px}
.foot{margin-top:24px;color:var(--muted);font-size:12px;border-top:1px solid var(--border);padding-top:14px}
@media print{.btn{display:none}body{background:#fff}.tw,.kpi,.ped{box-shadow:none}}
</style></head><body><div class="wrap">
<header class="top"><div><div class="eyebrow">Compras Amore · Comparativo & Pedidos</div><h1>Melhor preço por item — ${esc(req.loja)}</h1><div class="sub">REQ-${String(req.numero || '').padStart(4, '0')} ${esc(req.titulo || '')} · ${fornsPart} fornecedores · ${cotados}/${(itens || []).length} itens com vencedor · ${hoje}</div></div><button class="btn" onclick="window.print()">🖨 Imprimir / PDF</button></header>
<div class="kpis">
<div class="kpi"><div class="kn">${fornsPart}</div><div class="kl">Fornecedores participantes</div></div>
<div class="kpi"><div class="kn">${cotados}/${(itens || []).length}</div><div class="kl">Itens com vencedor</div></div>
<div class="kpi"><div class="kn">${brl(totalGeral)}</div><div class="kl">Total (menores preços)</div></div>
<div class="kpi eco"><div class="kn">${brl(economia)}</div><div class="kl">Economia vs 2º melhor preço</div></div>
</div>
<h2>🏆 Comparativo — vencedor por item</h2>
<div class="tw"><table><thead><tr><th>Produto</th><th class="num">Qtd</th><th class="num">Cot.</th><th>Vencedor (menor preço)</th><th class="num">Unit.</th><th class="num">Total</th><th class="num">Economia</th><th class="num">2º menor</th></tr></thead><tbody>${compRows}</tbody></table></div>
<h2>🧾 Pedidos por fornecedor (prontos para enviar)</h2>
${peds || '<p class="mut">Nenhum item com vencedor ainda.</p>'}
${semCot.length ? `<h2>⚠ Itens sem cotação (${semCot.length})</h2><div class="tw"><table><tbody>${semCot.map((c: any) => `<tr><td class="prod">${esc(c.prod)}</td><td class="num">${c.qtd} ${esc(c.un)}</td></tr>`).join('')}</tbody></table></div>` : ''}
<div class="foot">Vencedor = menor preço unitário válido. "Economia" = redução vs o 2º melhor preço (preços mais de 3× acima do menor são ignorados como possível erro). "⚠" = preço muito abaixo do 2º menor. <b>Confira os preços com os fornecedores antes de fechar o pedido.</b> Gerado pelo Painel Amore em ${hoje}.</div>
</div></body></html>`

  if (win) { win.document.open(); win.document.write(html); win.document.close() }
  else { const b = new Blob([html], { type: 'text/html' }); window.open(URL.createObjectURL(b), '_blank') }
}
