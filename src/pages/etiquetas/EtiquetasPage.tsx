import { useState, useEffect, useCallback, useRef } from 'react'
import { QrCode, Printer, Camera, ScanLine, PackageMinus, RefreshCw, Plus, AlertTriangle, Check, X, Tag, Trash2, Undo2, ArrowRightLeft, ClipboardList, BarChart3, Clock, Scissors } from 'lucide-react'
import QRCode from 'qrcode'
import JsBarcode from 'jsbarcode'
import { Html5Qrcode } from 'html5-qrcode'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../hooks/useToast'
import { useAuth } from '../../contexts/AuthContext'

const sb = supabase as any
const LOJAS = ['Amore Paiva', 'Amore CD']
const SETORES = ['Cozinha', 'Salão', 'Bar', 'Confeitaria', 'Estoque', 'Limpeza', 'Administrativo']
const MOTIVOS = [['producao', 'Produção'], ['venda', 'Venda'], ['consumo_interno', 'Consumo interno'], ['degustacao', 'Degustação'], ['perda', 'Perda'], ['avaria', 'Avaria'], ['vencimento', 'Vencimento'], ['ajuste', 'Ajuste de estoque'], ['outro', 'Outro']]
const PERDA_TIPOS = ['perda', 'avaria', 'vencimento', 'vencido']
const UNIDADES = ['un', 'kg', 'g', 'L', 'ml', 'cx', 'pct', 'dz']
const SB_URL = 'https://xdwnsqkzgopymufsuccr.supabase.co'
const fmt = (n: any) => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const CONSERV = [['', '— não manipulado —'], ['resfriado', 'Resfriado'], ['congelado', 'Congelado'], ['descongelado', 'Descongelado'], ['pronto', 'Produto pronto'], ['porcionado', 'Porcionado'], ['molhos', 'Molhos'], ['carnes', 'Carnes'], ['frutos_do_mar', 'Frutos do mar'], ['hortifruti', 'Hortifruti higienizado']]
// cor por status sanitário: congelado=azul, descongelado=roxo, senão verde/amarelo/vermelho por validade
function corValidade(it: any) {
  const tc = (it.tipo_conservacao || '').toLowerCase()
  if (tc === 'congelado') return { cor: '#1D4ED8', label: 'Congelado', emoji: '🔵' }
  if (tc === 'descongelado') return { cor: '#7C3AED', label: 'Descongelado', emoji: '🟣' }
  const dv = it.data_validade || it.validade
  const d = dv ? Math.ceil((new Date(dv).getTime() - Date.now()) / 864e5) : null
  if (d == null) return { cor: '#6b7280', label: '—', emoji: '⚪' }
  if (d < 0) return { cor: '#DC2626', label: 'Vencido', emoji: '🔴' }
  if (d <= 2) return { cor: '#D97706', label: 'Próximo do venc.', emoji: '🟡' }
  return { cor: '#166534', label: 'Dentro da validade', emoji: '🟢' }
}
const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '1.1rem 1.3rem', marginBottom: 14 }
const inp: React.CSSProperties = { padding: '.5rem .7rem', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, width: '100%' }
const btn = (bg: string): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '.55rem 1rem', borderRadius: 10, border: 'none', background: bg, color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 })
const fmtD = (d: any) => d ? new Date(d + 'T00:00').toLocaleDateString('pt-BR') : '—'
function baixarCSV(nome: string, colunas: string[], linhas: any[][]) {
  const esc = (v: any) => { const s = String(v ?? ''); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }
  const csv = [colunas.join(';'), ...linhas.map(l => l.map(esc).join(';'))].join('\r\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome; a.click(); URL.revokeObjectURL(a.href)
}

async function qrDataURL(text: string) { try { return await QRCode.toDataURL(text, { margin: 1, width: 180 }) } catch { return '' } }
function barcodeDataURL(text: string) {
  try { const c = document.createElement('canvas'); JsBarcode(c, text, { format: 'CODE128', width: 1.5, height: 40, fontSize: 12, margin: 4 }); return c.toDataURL('image/png') } catch { return '' }
}

// imprime UMA etiqueta por item (cada item = 1 etiqueta)
const TAMANHOS: any = { '40x40': [40, 40], '50x30': [50, 30], '60x40': [60, 40], '100x50': [100, 50] }
async function imprimirItens(itens: any[], loja: string, tam = '60x40') {
  const [W] = TAMANHOS[tam] || [60, 40]
  const blocos: string[] = []
  for (const it of itens) {
    const qr = await qrDataURL(it.codigo)
    const bc = barcodeDataURL(it.codigo)
    blocos.push(`
      <div class="et">
        <div class="et-top"><div class="et-nome">${(it.produto_nome || '').toUpperCase()}</div><div class="et-cod">${it.codigo_interno || ''}</div></div>
        <div class="et-mid">
          <img class="qr" src="${qr}" alt="qr"/>
          <div class="et-info">
            <div><b>Qtd:</b> ${it.quantidade ?? 1} ${it.unidade || 'un'}</div>
            <div><b>Validade:</b> ${fmtD(it.data_validade)}</div>
            <div><b>Lote:</b> ${it.numero_lote || '—'}</div>
            <div><b>Forn.:</b> ${(it.fornecedor || '—').slice(0, 20)}</div>
            <div><b>Local:</b> ${it.local_armazenamento || '—'}</div>
          </div>
        </div>
        <img class="bc" src="${bc}" alt="barcode"/>
        <div class="et-foot">${loja} · ${it.codigo}</div>
      </div>`)
  }
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Etiquetas</title><style>
    @page{margin:8mm} *{box-sizing:border-box;font-family:Arial,Helvetica,sans-serif}
    body{margin:0;display:flex;flex-wrap:wrap;gap:4mm;padding:4mm}
    .et{width:${W}mm;border:1px solid #333;border-radius:2mm;padding:2.5mm;page-break-inside:avoid;display:flex;flex-direction:column;gap:1mm}
    .et-top{display:flex;justify-content:space-between;align-items:flex-start;gap:2mm;border-bottom:1px solid #ccc;padding-bottom:1mm}
    .et-nome{font-size:10pt;font-weight:800;line-height:1.1} .et-cod{font-size:7pt;color:#555;white-space:nowrap}
    .et-mid{display:flex;gap:2mm;align-items:center} .qr{width:20mm;height:20mm}
    .et-info{font-size:7pt;line-height:1.35} .et-info b{font-weight:700}
    .bc{width:100%;height:12mm;object-fit:contain} .et-foot{font-size:6.5pt;color:#666;text-align:center}
  </style></head><body>${blocos.join('')}
  <script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script>
  </body></html>`
  const w = window.open('', '_blank', 'width=800,height=600')
  if (!w) { alert('Permita pop-ups para imprimir as etiquetas.'); return }
  w.document.write(html); w.document.close()
}

// Etiqueta SANITÁRIA de produto manipulado (faixa de cor por status + campos obrigatórios)
async function imprimirManipulados(itens: any[], loja: string, tam = '60x40') {
  const [W, H] = TAMANHOS[tam] || [60, 40]
  const blocos: string[] = []
  for (const it of itens) {
    const qr = await qrDataURL(it.codigo)
    const cv = corValidade(it)
    const dm = it.data_manipulacao ? new Date(it.data_manipulacao).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'
    const dv = it.data_validade ? new Date(it.data_validade + 'T00:00').toLocaleDateString('pt-BR') : '—'
    const vo = it.validade_original ? new Date(it.validade_original + 'T00:00').toLocaleDateString('pt-BR') : null
    blocos.push(`
      <div class="et">
        <div class="band" style="background:${cv.cor}">${cv.emoji} ${cv.label.toUpperCase()}${it.categoria_conservacao ? ' · ' + String(it.categoria_conservacao).replace(/_/g, ' ').toUpperCase() : ''}</div>
        <div class="body">
          <div class="left">
            <div class="nome">${(it.produto_nome || '').toUpperCase()}</div>
            <div class="row"><b>Peso/Qtd:</b> ${it.quantidade ?? ''} ${it.unidade || ''}</div>
            <div class="row"><b>Manipulado:</b> ${dm}</div>
            <div class="row val"><b>VALIDADE:</b> ${dv}</div>
            ${vo ? `<div class="row"><b>Val. original:</b> ${vo}</div>` : ''}
            <div class="row"><b>Resp.:</b> ${it.responsavel_manip || '—'}${it.conferente_manip ? ' · Conf.: ' + it.conferente_manip : ''}</div>
            <div class="row"><b>Lote:</b> ${it.numero_lote || '—'}${it.op_numero ? ' · OP ' + it.op_numero : ''}</div>
            <div class="row"><b>Forn.:</b> ${(it.fornecedor || '—').slice(0, 24)}${it.sif ? ' · ' + it.sif : ''}</div>
          </div>
          <div class="right"><img class="qr" src="${qr}"/><div class="cod">${it.codigo}</div></div>
        </div>
        <div class="foot">${loja} · Amore Food · manipulado</div>
      </div>`)
  }
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Etiquetas manipulado</title><style>
    @page{margin:6mm} *{box-sizing:border-box;font-family:Arial,Helvetica,sans-serif}
    body{margin:0;display:flex;flex-wrap:wrap;gap:4mm;padding:4mm}
    .et{width:${W}mm;min-height:${H}mm;border:1px solid #333;border-radius:1.5mm;overflow:hidden;page-break-inside:avoid;display:flex;flex-direction:column}
    .band{color:#fff;font-size:7.5pt;font-weight:800;padding:1mm 2mm;text-align:center}
    .body{display:flex;gap:1.5mm;padding:1.5mm 2mm;flex:1}
    .left{flex:1;font-size:6.5pt;line-height:1.3} .nome{font-size:8.5pt;font-weight:800;margin-bottom:.5mm;line-height:1.05}
    .row b{font-weight:700} .val{color:#b30000;font-size:7.5pt}
    .right{text-align:center} .qr{width:15mm;height:15mm} .cod{font-size:5.5pt;color:#555}
    .foot{font-size:5.5pt;color:#666;text-align:center;border-top:1px solid #ddd;padding:.5mm}
  </style></head><body>${blocos.join('')}
  <script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script></body></html>`
  const w = window.open('', '_blank', 'width=800,height=600')
  if (!w) { alert('Permita pop-ups para imprimir as etiquetas.'); return }
  w.document.write(html); w.document.close()
}

export default function EtiquetasPage() {
  const { toast } = useToast()
  const { user } = useAuth()
  const [tab, setTab] = useState('home')
  const [loja, setLoja] = useState('Amore Paiva')

  const role = (user?.role || '').toLowerCase()
  const ROLE_OPS: Record<string, string[]> = {
    conferente: ['entrada', 'consulta'], estoquista: ['entrada', 'saida', 'transferencia', 'consulta'],
    cozinha: ['saida', 'consulta'], compras: ['consulta'], auditoria: ['consulta'],
  }
  const opsPermitidas = ROLE_OPS[role] || ['entrada', 'saida', 'transferencia', 'consulta']
  const podeOp = (id: string) => opsPermitidas.includes(id)

  const OPS = [
    { id: 'entrada', icon: '📥', label: 'Entrada', desc: 'Receber mercadoria', c: '#166534', bg: '#DCFCE7' },
    { id: 'saida', icon: '📤', label: 'Saída', desc: 'Retirada / consumo', c: '#B91C1C', bg: '#FEE2E2' },
    { id: 'transferencia', icon: '🔄', label: 'Transferência', desc: 'Entre setores/unidades', c: '#6D28D9', bg: '#EDE9FE' },
    { id: 'consulta', icon: '🔍', label: 'Consulta', desc: 'Ver produto', c: '#1D4ED8', bg: '#DBEAFE' },
  ].filter(o => podeOp(o.id))
  const TOOLS = [
    { id: 'dashboard', icon: <BarChart3 size={15} />, label: 'Dashboard' },
    { id: 'beneficiamento', icon: <Scissors size={15} />, label: 'Beneficiamento' },
    { id: 'etiquetas', icon: <QrCode size={15} />, label: 'Etiquetas' },
    { id: 'inventario', icon: <ClipboardList size={15} />, label: 'Inventário' },
    { id: 'relatorios', icon: <BarChart3 size={15} />, label: 'Relatórios' },
    { id: 'historico', icon: <Clock size={15} />, label: 'Histórico' },
  ]
  const TITULOS: Record<string, string> = { entrada: '📥 Entrada de Estoque', saida: '📤 Saída de Estoque', transferencia: '🔄 Transferência', consulta: '🔍 Consulta', dashboard: '📈 Dashboard do Estoque', beneficiamento: '⚙️ Beneficiamento', etiquetas: '🖨️ Etiquetas', inventario: '📋 Inventário', relatorios: '📊 Relatórios', historico: '🕘 Histórico' }

  return (
    <div style={{ padding: '1rem 0' }}>
      {tab === 'home' ? <>
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Tag size={20} style={{ color: '#6B1212' }} /><b style={{ fontSize: 15 }}>Estoque — Operação por leitura</b></div>
            <select value={loja} onChange={e => setLoja(e.target.value)} style={{ ...inp, width: 'auto' }}>{LOJAS.map(l => <option key={l}>{l}</option>)}</select>
          </div>
          <p style={{ fontSize: 12.5, color: '#9ca3af', margin: '8px 0 0' }}>Escolha a operação e aponte a câmera para o QR Code ou código de barras.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 14 }}>
          {OPS.map(o => (
            <button key={o.id} onClick={() => setTab(o.id)} style={{ background: o.bg, border: 'none', borderRadius: 16, padding: '22px 18px', cursor: 'pointer', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 6, minHeight: 120 }}>
              <span style={{ fontSize: 34, lineHeight: 1 }}>{o.icon}</span>
              <span style={{ fontSize: 17, fontWeight: 800, color: o.c }}>{o.label}</span>
              <span style={{ fontSize: 12.5, color: '#6b7280' }}>{o.desc}</span>
            </button>
          ))}
        </div>
        <div style={card}>
          <div style={{ fontSize: 12, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700, marginBottom: 8 }}>Ferramentas</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {TOOLS.map(t => <button key={t.id} onClick={() => setTab(t.id)} style={{ ...btn('#f3f4f6'), color: '#374151' }}>{t.icon}{t.label}</button>)}
          </div>
        </div>
      </> : <>
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={() => setTab('home')} style={{ ...btn('#f3f4f6'), color: '#374151', padding: '.45rem .8rem' }}>← Voltar</button>
              <b style={{ fontSize: 15 }}>{TITULOS[tab] || tab}</b>
            </div>
            <select value={loja} onChange={e => setLoja(e.target.value)} style={{ ...inp, width: 'auto' }}>{LOJAS.map(l => <option key={l}>{l}</option>)}</select>
          </div>
        </div>
        {tab === 'dashboard' ? <TabDashboard loja={loja} toast={toast} setTab={setTab} />
          : tab === 'entrada' ? <TabEntrada loja={loja} toast={toast} user={user} />
          : tab === 'saida' ? <TabLeitura loja={loja} toast={toast} user={user} />
          : tab === 'transferencia' ? <TabTransferencia loja={loja} toast={toast} user={user} />
          : tab === 'consulta' ? <TabConsulta loja={loja} toast={toast} />
          : tab === 'beneficiamento' ? <TabBeneficiamento loja={loja} toast={toast} user={user} />
          : tab === 'etiquetas' ? <TabEtiquetas loja={loja} toast={toast} user={user} />
          : tab === 'inventario' ? <TabInventario loja={loja} toast={toast} user={user} />
          : tab === 'relatorios' ? <TabRelatorios loja={loja} toast={toast} user={user} />
          : <TabHistorico loja={loja} />}
      </>}
    </div>
  )
}

// ─────────────────────────────────────────── Etiquetas por item
function TabEtiquetas({ loja, toast, user }: any) {
  const [itens, setItens] = useState<any[]>([])
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [busca, setBusca] = useState('')
  const [tamanho, setTamanho] = useState('60x40')
  const [novo, setNovo] = useState(false)
  const [prods, setProds] = useState<any[]>([])
  const [gerando, setGerando] = useState(false)
  const [form, setForm] = useState<any>({ produto_id: '', n_itens: '1', qtd_item: '1', unidade: 'un', data_validade: '', numero_lote: '', local_armazenamento: '', fornecedor: '' })

  const load = useCallback(async () => {
    const { data } = await sb.from('estoque_itens').select('*').eq('loja', loja).eq('status', 'disponivel').order('created_at', { ascending: false }).limit(500)
    setItens(data || [])
  }, [loja])
  useEffect(() => { load(); setSel(new Set()) }, [load])
  useEffect(() => { sb.from('estoque_produtos').select('id,nome,gramatura').eq('loja', loja).eq('ativo', true).order('nome').then(({ data }: any) => setProds(data || [])) }, [loja])

  const filtrados = itens.filter(l => !busca || (l.produto_nome || '').toLowerCase().includes(busca.toLowerCase()) || (l.codigo || '').toLowerCase().includes(busca.toLowerCase()))
  const toggle = (id: string) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const selecionados = itens.filter(l => sel.has(l.id))
  const marcarTodos = () => setSel(new Set(filtrados.map(i => i.id)))

  const cancelarItem = async (item: any) => {
    if (!confirm(`Cancelar a etiqueta de "${item.produto_nome}" (${item.codigo})? Isso remove ${item.quantidade} ${item.unidade} do estoque.`)) return
    const { data, error } = await sb.rpc('item_cancelar', { p_codigo: item.codigo, p_motivo: 'Etiqueta cancelada', p_por: user?.name || null })
    if (error || !data?.ok) { toast(data?.erro || 'Erro ao cancelar.', 'error'); return }
    toast('Etiqueta cancelada e estoque ajustado. 🗑️'); load()
  }
  const cancelarSelecionados = async () => {
    if (!sel.size) return
    if (!confirm(`Cancelar ${sel.size} etiqueta(s)? O estoque será ajustado.`)) return
    const codigos = selecionados.map(i => i.codigo)
    const { data, error } = await sb.rpc('itens_cancelar', { p_codigos: codigos, p_motivo: 'Etiquetas canceladas', p_por: user?.name || null })
    if (error || !data?.ok) { toast('Erro ao cancelar.', 'error'); return }
    toast(`${data.cancelados} etiqueta(s) cancelada(s)${data.erros ? ` · ${data.erros} não puderam` : ''}.`); setSel(new Set()); load()
  }

  const gerar = async () => {
    if (!form.produto_id || !form.n_itens) { toast('Escolha o produto e o número de itens.', 'error'); return }
    const p = prods.find(x => x.id === form.produto_id)
    setGerando(true)
    const { data, error } = await sb.rpc('itens_gerar', {
      p_loja: loja, p_produto_id: form.produto_id, p_produto_nome: p?.nome || 'Produto', p_n_itens: Number(form.n_itens),
      p_qtd_item: Number(form.qtd_item) || 1, p_unidade: form.unidade, p_validade: form.data_validade || null, p_numero_lote: form.numero_lote || null,
      p_fornecedor: form.fornecedor || null, p_local: form.local_armazenamento || null, p_lote_id: null, p_somar_estoque: true, p_origem: 'manual', p_por: user?.name || null,
    })
    setGerando(false)
    if (error || !data?.ok) { toast('Erro ao gerar etiquetas.', 'error'); return }
    toast(`${data.n} etiqueta(s)-item geradas! 🏷️ Selecione e imprima.`)
    setNovo(false); setForm({ produto_id: '', n_itens: '1', qtd_item: '1', unidade: 'un', data_validade: '', numero_lote: '', local_armazenamento: '', fornecedor: '' })
    await load()
    // já seleciona os recém-criados para imprimir
    const novos: string[] = (data.codigos || [])
    const { data: nd } = await sb.from('estoque_itens').select('id').in('codigo', novos)
    setSel(new Set((nd || []).map((x: any) => x.id)))
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <b style={{ fontSize: 14 }}>Itens etiquetados disponíveis ({filtrados.length})</b>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input style={{ ...inp, width: 170 }} placeholder="Buscar produto/código…" value={busca} onChange={e => setBusca(e.target.value)} />
          <button onClick={() => setNovo(v => !v)} style={btn('#7C3AED')}><Plus size={15} />Gerar etiquetas</button>
          <button onClick={load} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}><RefreshCw size={15} /></button>
        </div>
      </div>

      {novo && <div style={{ marginTop: 12, padding: 12, background: '#faf8f5', borderRadius: 10, border: '1px solid #ece4dd' }}>
        <div style={{ fontSize: 12.5, color: '#6b7280', marginBottom: 8 }}>Cada item vira uma etiqueta com QR próprio. A quantidade entra no estoque como entrada nova.</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))', gap: 8 }}>
          <div><label style={{ fontSize: 11, color: '#9ca3af' }}>Produto</label>
            <select style={inp} value={form.produto_id} onChange={e => setForm({ ...form, produto_id: e.target.value })}><option value="">Selecione…</option>{prods.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></div>
          <div><label style={{ fontSize: 11, color: '#9ca3af' }}>Nº de itens (etiquetas)</label><input style={inp} type="number" min={1} value={form.n_itens} onChange={e => setForm({ ...form, n_itens: e.target.value })} /></div>
          <div><label style={{ fontSize: 11, color: '#9ca3af' }}>Qtd por item</label><input style={inp} type="number" step="0.01" value={form.qtd_item} onChange={e => setForm({ ...form, qtd_item: e.target.value })} /></div>
          <div><label style={{ fontSize: 11, color: '#9ca3af' }}>Unidade</label><select style={inp} value={form.unidade} onChange={e => setForm({ ...form, unidade: e.target.value })}>{UNIDADES.map(u => <option key={u}>{u}</option>)}</select></div>
          <div><label style={{ fontSize: 11, color: '#9ca3af' }}>Validade</label><input style={inp} type="date" value={form.data_validade} onChange={e => setForm({ ...form, data_validade: e.target.value })} /></div>
          <div><label style={{ fontSize: 11, color: '#9ca3af' }}>Nº lote</label><input style={inp} value={form.numero_lote} onChange={e => setForm({ ...form, numero_lote: e.target.value })} /></div>
          <div><label style={{ fontSize: 11, color: '#9ca3af' }}>Fornecedor</label><input style={inp} value={form.fornecedor} onChange={e => setForm({ ...form, fornecedor: e.target.value })} /></div>
          <div><label style={{ fontSize: 11, color: '#9ca3af' }}>Local</label><input style={inp} value={form.local_armazenamento} onChange={e => setForm({ ...form, local_armazenamento: e.target.value })} placeholder="Câmara fria, prateleira…" /></div>
        </div>
        <div style={{ marginTop: 10, display: 'flex', gap: 8 }}><button onClick={gerar} disabled={gerando} style={btn('#1D9E75')}><Check size={15} />{gerando ? 'Gerando…' : `Gerar ${form.n_itens || 0} etiqueta(s)`}</button><button onClick={() => setNovo(false)} style={{ ...btn('#e5e7eb'), color: '#374151' }}>Cancelar</button></div>
      </div>}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '14px 0 8px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, color: '#374151' }}><b>{sel.size}</b> selecionado(s)</span>
        <button onClick={marcarTodos} style={{ ...btn('#e5e7eb'), color: '#374151' }}>Selecionar todos</button>
        <select value={tamanho} onChange={e => setTamanho(e.target.value)} title="Tamanho da etiqueta" style={{ ...inp, width: 'auto' }}>{['40x40', '50x30', '60x40', '100x50'].map(t => <option key={t} value={t}>{t} mm</option>)}</select>
        <button disabled={!sel.size} onClick={() => imprimirItens(selecionados, loja, tamanho)} style={{ ...btn(sel.size ? '#6B1212' : '#c4b5a8'), cursor: sel.size ? 'pointer' : 'not-allowed' }}><Printer size={15} />Imprimir {sel.size ? `(${sel.size})` : ''}</button>
        <button disabled={!sel.size} onClick={() => imprimirManipulados(selecionados, loja, tamanho)} title="Etiqueta sanitária de produto manipulado" style={{ ...btn(sel.size ? '#166534' : '#b7cdb7'), cursor: sel.size ? 'pointer' : 'not-allowed' }}>🏷️ Manipulado {sel.size ? `(${sel.size})` : ''}</button>
        <button disabled={!sel.size} onClick={cancelarSelecionados} style={{ ...btn(sel.size ? '#DC2626' : '#e5b4b4'), cursor: sel.size ? 'pointer' : 'not-allowed' }}><Trash2 size={15} />Cancelar {sel.size ? `(${sel.size})` : ''}</button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 720 }}>
          <thead><tr style={{ textAlign: 'left', color: '#9ca3af', fontSize: 11, textTransform: 'uppercase' }}>
            <th style={{ padding: 6, width: 30 }}></th><th>Produto</th><th>Código do item</th><th>Qtd</th><th>Validade</th><th>Lote</th><th>Local</th><th></th>
          </tr></thead>
          <tbody>
            {filtrados.length === 0 ? <tr><td colSpan={7} style={{ padding: 18, color: '#9ca3af', textAlign: 'center' }}>Nenhum item etiquetado. Clique em "Gerar etiquetas".</td></tr> :
              filtrados.map(l => { const venc = l.data_validade ? Math.ceil((new Date(l.data_validade).getTime() - Date.now()) / 864e5) : null; return (
                <tr key={l.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                  <td><input type="checkbox" checked={sel.has(l.id)} onChange={() => toggle(l.id)} /></td>
                  <td style={{ fontWeight: 600 }}><span title={corValidade(l).label} style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: corValidade(l).cor, marginRight: 6 }} />{l.produto_nome}{l.manipulado ? <span title="Produto manipulado" style={{ marginLeft: 5, fontSize: 11 }}>🏷️</span> : ''}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 11.5 }}>{l.codigo}</td>
                  <td>{l.quantidade} {l.unidade}</td>
                  <td style={{ color: venc != null && venc <= 7 ? '#DC2626' : '#374151', fontWeight: venc != null && venc <= 7 ? 700 : 400 }}>{fmtD(l.data_validade)}{venc != null && venc <= 7 ? ` (${venc}d)` : ''}</td>
                  <td>{l.numero_lote || '—'}</td>
                  <td>{l.local_armazenamento || '—'}</td>
                  <td><button onClick={() => cancelarItem(l)} title="Cancelar etiqueta" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626' }}><Trash2 size={14} /></button></td>
                </tr>) })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────── Leitura & Baixa
function TabLeitura({ loja, toast, user }: any) {
  const [codigo, setCodigo] = useState('')
  const [info, setInfo] = useState<any | null>(null)
  const [qtd, setQtd] = useState('')
  const [setor, setSetor] = useState('Cozinha')
  const [colaborador, setColaborador] = useState('')
  const [motivo, setMotivo] = useState('producao')
  const [centroCusto, setCentroCusto] = useState('')
  const [solicitante, setSolicitante] = useState('')
  const [scanning, setScanning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [recentes, setRecentes] = useState<any[]>([])
  const [modoLote, setModoLote] = useState(false)
  const [lote, setLote] = useState<string[]>([])
  const scannerRef = useRef<any>(null)
  const loteRef = useRef<string[]>([])
  const addLote = (c: string) => { const cod = (c || '').trim(); if (!cod || loteRef.current.includes(cod)) return; loteRef.current = [...loteRef.current, cod]; setLote(loteRef.current) }
  const rmLote = (c: string) => { loteRef.current = loteRef.current.filter(x => x !== c); setLote(loteRef.current) }

  useEffect(() => { if (user?.name && !colaborador) setColaborador(user.name) }, [user])
  const loadRecentes = useCallback(async () => {
    const { data } = await sb.from('estoque_movimentacoes').select('*').eq('loja', loja).eq('tipo', 'saida').order('created_at', { ascending: false }).limit(10)
    setRecentes(data || [])
  }, [loja])
  useEffect(() => { loadRecentes() }, [loadRecentes])

  const consultar = async (cod: string) => {
    const c = (cod || '').trim(); if (!c) return
    const { data, error } = await sb.rpc('codigo_consultar', { p_codigo: c })
    if (error || !data?.ok) { toast(data?.erro || 'Etiqueta não encontrada.', 'error'); setInfo(null); return }
    setInfo(data); setCodigo(c); setQtd(data.tipo === 'item' ? String(data.quantidade ?? 1) : '')
    if (data.status && data.status !== 'disponivel') { toast('Este item já saiu (' + data.status + ').', 'error') }
    else if (!data.fifo_ok) toast('⚠️ Não é o item mais antigo (PEPS/FIFO). Prefira o de validade mais próxima.', 'error')
  }

  const pararScanner = useCallback(async () => {
    if (scannerRef.current) { try { await scannerRef.current.stop(); await scannerRef.current.clear() } catch {} scannerRef.current = null }
    setScanning(false)
  }, [])
  const iniciarScanner = async () => {
    setScanning(true); setInfo(null)
    try {
      const h = new Html5Qrcode('leitor-cam'); scannerRef.current = h
      await h.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 230, height: 230 } },
        async (txt: string) => { if (modoLote) { addLote(txt) } else { await pararScanner(); consultar(txt) } }, () => {})
    } catch (e: any) { toast('Não foi possível abrir a câmera: ' + (e?.message || ''), 'error'); setScanning(false) }
  }
  useEffect(() => () => { pararScanner() }, [pararScanner])

  const darBaixa = async () => {
    if (!info) return
    setBusy(true)
    let resp
    if (info.tipo === 'item') {
      resp = await sb.rpc('item_saida', { p_codigo: info.codigo, p_tipo: motivo, p_motivo: null, p_setor: setor, p_colaborador: colaborador || user?.name || 'Leitura', p_centro_custo: centroCusto || null, p_solicitante: solicitante || null })
    } else {
      if (!qtd || Number(qtd) <= 0) { toast('Informe a quantidade retirada.', 'error'); setBusy(false); return }
      resp = await sb.rpc('baixa_por_leitura', { p_codigo: info.codigo, p_qtd: Number(qtd), p_setor: setor, p_colaborador: colaborador || user?.name || 'Leitura', p_unidade_destino: info.unidade, p_motivo: 'Saída por leitura' })
    }
    setBusy(false)
    const { data, error } = resp
    if (error || !data?.ok) { toast(data?.erro || 'Erro ao dar baixa.', 'error'); return }
    toast(`Baixa · ${data.produto_nome}. Saldo do produto: ${data.saldo_produto} ${data.unidade || ''} ✅`)
    setInfo(null); setCodigo(''); setQtd(''); loadRecentes()
  }

  const podeEstornar = ['super_admin', 'manager', 'admin', 'gestor', 'diretor'].includes((user?.role || '').toLowerCase())
  const estornar = async () => {
    if (!info) return
    if (!confirm(`Desfazer a saída de "${info.produto_nome}" e devolver ao estoque?`)) return
    setBusy(true)
    const { data, error } = await sb.rpc('item_estornar', { p_codigo: info.codigo, p_por: user?.name || null })
    setBusy(false)
    if (error || !data?.ok) { toast(data?.erro || 'Erro ao estornar.', 'error'); return }
    toast(`Saída desfeita · ${data.produto_nome} devolvido ao estoque. ↩️`)
    setInfo(null); setCodigo(''); loadRecentes()
  }

  const confirmarLote = async () => {
    if (!loteRef.current.length) return
    if (!confirm(`Confirmar saída de ${loteRef.current.length} item(ns)?`)) return
    setBusy(true)
    const { data, error } = await sb.rpc('itens_saida_lote', { p_codigos: loteRef.current, p_tipo: motivo, p_motivo: null, p_setor: setor, p_colaborador: colaborador || user?.name || 'Leitura', p_centro_custo: centroCusto || null, p_solicitante: solicitante || null })
    setBusy(false)
    if (error || !data?.ok) { toast('Erro ao dar baixa em lote.', 'error'); return }
    toast(`${data.baixados} saída(s) confirmada(s)${data.erros ? ` · ${data.erros} com erro` : ''}. ✅`)
    loteRef.current = []; setLote([]); loadRecentes()
  }

  const isItem = info?.tipo === 'item'
  const jaSaiu = info && info.status && info.status !== 'disponivel'

  return (
    <>
      <div style={card}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 8, fontSize: 13, fontWeight: 600 }}>
          <input type="checkbox" checked={modoLote} onChange={e => { setModoLote(e.target.checked); setInfo(null) }} />
          📋 Leitura contínua (lote) — escaneie vários itens e confirme de uma vez
        </label>
        <b style={{ fontSize: 14 }}>Leitura da etiqueta</b>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '10px 0' }}>
          {!scanning ? <button onClick={iniciarScanner} style={btn('#6B1212')}><Camera size={16} />Ler com a câmera</button>
            : <button onClick={pararScanner} style={btn('#DC2626')}><X size={16} />Parar câmera</button>}
          <span style={{ fontSize: 12, color: '#9ca3af' }}>ou digite o código:</span>
          <input style={{ ...inp, width: 200 }} placeholder="Código da etiqueta" value={codigo} onChange={e => setCodigo(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { if (modoLote) { addLote(codigo); setCodigo('') } else consultar(codigo) } }} />
          <button onClick={() => { if (modoLote) { addLote(codigo); setCodigo('') } else consultar(codigo) }} style={{ ...btn('#e5e7eb'), color: '#374151' }}><ScanLine size={15} />{modoLote ? 'Adicionar' : 'Consultar'}</button>
        </div>
        <div id="leitor-cam" style={{ width: '100%', maxWidth: 340, margin: scanning ? '8px 0' : 0 }} />

        {modoLote && <div style={{ marginTop: 10, padding: 12, borderRadius: 12, border: '1px solid #e5e7eb', background: '#f9fafb' }}>
          <b style={{ fontSize: 13.5 }}>Itens no lote ({lote.length})</b>
          {lote.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {lote.map(c => <span key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontFamily: 'monospace', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 20, padding: '.25rem .6rem' }}>{c}<button onClick={() => rmLote(c)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', padding: 0 }}><X size={12} /></button></span>)}
          </div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px,1fr))', gap: 8, marginTop: 10 }}>
            <div><label style={{ fontSize: 11, color: '#9ca3af' }}>Motivo</label><select style={inp} value={motivo} onChange={e => setMotivo(e.target.value)}>{MOTIVOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            <div><label style={{ fontSize: 11, color: '#9ca3af' }}>Setor</label><input style={inp} list="setores" value={setor} onChange={e => setSetor(e.target.value)} /></div>
            <div><label style={{ fontSize: 11, color: '#9ca3af' }}>Responsável</label><input style={inp} value={colaborador} onChange={e => setColaborador(e.target.value)} /></div>
          </div>
          <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={confirmarLote} disabled={!lote.length || busy} style={{ ...btn(lote.length ? '#1D9E75' : '#c4b5a8'), cursor: lote.length ? 'pointer' : 'not-allowed' }}><PackageMinus size={16} />{busy ? 'Registrando…' : `Confirmar ${lote.length} saída(s)`}</button>
          </div>
        </div>}

        {!modoLote && info && <div style={{ marginTop: 10, padding: 14, borderRadius: 12, border: '1px solid ' + (jaSaiu ? '#FCA5A5' : '#e5e7eb'), background: jaSaiu ? '#FEF2F2' : '#f9fafb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800 }}>{info.produto_nome}</div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>{isItem ? 'Item' : 'Lote'} {info.codigo} · Lote {info.numero_lote || '—'} · Local {info.local || '—'}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#1D9E75' }}>{isItem ? info.quantidade : info.saldo_lote} <span style={{ fontSize: 13, color: '#6b7280' }}>{info.unidade}</span></div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>{isItem ? `este item · ${info.itens_disponiveis} un. disponíveis` : 'saldo do lote'} · produto: {info.saldo_produto}</div>
            </div>
          </div>
          {jaSaiu && <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', fontSize: 12.5, color: '#B91C1C', background: '#FEE2E2', padding: '.5rem .7rem', borderRadius: 8, fontWeight: 700 }}>
            <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><AlertTriangle size={14} />Este item já saiu do estoque{info.consumido_por ? ` (por ${info.consumido_por})` : ''}.</span>
            {isItem && info.status === 'consumido' && podeEstornar && <button onClick={estornar} disabled={busy} style={{ ...btn('#B45309'), padding: '.4rem .8rem' }}><Undo2 size={14} />Estornar (desfazer saída)</button>}
          </div>}
          {info.data_validade && <div style={{ marginTop: 6, fontSize: 12.5, color: info.vence_em_dias != null && info.vence_em_dias <= 7 ? '#DC2626' : '#6b7280', fontWeight: info.vence_em_dias != null && info.vence_em_dias <= 7 ? 700 : 400 }}>Validade: {fmtD(info.data_validade)}{info.vence_em_dias != null ? ` — vence em ${info.vence_em_dias} dia(s)` : ''}</div>}
          {!jaSaiu && !info.fifo_ok && <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5, color: '#B45309', background: '#FEF3C7', padding: '.4rem .7rem', borderRadius: 8, fontWeight: 600 }}><AlertTriangle size={14} />Não é o {isItem ? 'item' : 'lote'} mais antigo (FIFO). Sugerido: {info.fifo_sugerido_codigo} (val. {fmtD(info.fifo_sugerido_validade)})</div>}

          {!jaSaiu && <>
            <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))', gap: 8 }}>
              {isItem && <div><label style={{ fontSize: 11, color: '#9ca3af' }}>Motivo da saída</label><select style={inp} value={motivo} onChange={e => setMotivo(e.target.value)}>{MOTIVOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>}
              {!isItem && <div><label style={{ fontSize: 11, color: '#9ca3af' }}>Quantidade retirada</label><input style={inp} type="number" step="0.01" value={qtd} onChange={e => setQtd(e.target.value)} autoFocus /></div>}
              <div><label style={{ fontSize: 11, color: '#9ca3af' }}>Setor de destino</label><input style={inp} list="setores" value={setor} onChange={e => setSetor(e.target.value)} /><datalist id="setores">{SETORES.map(s => <option key={s} value={s} />)}</datalist></div>
              {isItem && <div><label style={{ fontSize: 11, color: '#9ca3af' }}>Centro de custo</label><input style={inp} value={centroCusto} onChange={e => setCentroCusto(e.target.value)} placeholder="Opcional" /></div>}
              {isItem && <div><label style={{ fontSize: 11, color: '#9ca3af' }}>Solicitante</label><input style={inp} value={solicitante} onChange={e => setSolicitante(e.target.value)} placeholder="Quem pediu" /></div>}
              <div><label style={{ fontSize: 11, color: '#9ca3af' }}>Responsável pela retirada</label><input style={inp} value={colaborador} onChange={e => setColaborador(e.target.value)} /></div>
            </div>
            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={darBaixa} disabled={busy} style={btn(PERDA_TIPOS.includes(motivo) && isItem ? '#DC2626' : '#1D9E75')}><PackageMinus size={16} />{busy ? 'Registrando…' : !isItem ? 'Confirmar baixa' : PERDA_TIPOS.includes(motivo) ? `Registrar ${motivo}` : 'Confirmar saída'}</button>
            </div>
          </>}
        </div>}
      </div>

      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><b style={{ fontSize: 14 }}>Últimas saídas ({recentes.length})</b><button onClick={loadRecentes} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}><RefreshCw size={15} /></button></div>
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {recentes.length === 0 ? <div style={{ fontSize: 13, color: '#9ca3af' }}>Nenhuma saída registrada.</div> :
            recentes.map(m => <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, background: '#f9fafb', padding: '.5rem .7rem', borderRadius: 8 }}>
              <PackageMinus size={15} style={{ color: '#DC2626' }} />
              <div style={{ flex: 1 }}><b>{m.produto_nome}</b> <span style={{ color: '#9ca3af' }}>· {m.quantidade} {m.unidade}{m.setor ? ` · ${m.setor}` : ''}{m.created_by ? ` · ${m.created_by}` : ''}</span></div>
              <span style={{ color: '#9ca3af', fontSize: 12 }}>{new Date(m.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
            </div>)}
        </div>
      </div>
    </>
  )
}

// ─────────────────────────────────────────── Transferência
function TabTransferencia({ loja, toast, user }: any) {
  const [codigo, setCodigo] = useState('')
  const [info, setInfo] = useState<any | null>(null)
  const [destLoja, setDestLoja] = useState('')
  const [destSetor, setDestSetor] = useState('')
  const [scanning, setScanning] = useState(false)
  const [busy, setBusy] = useState(false)
  const scannerRef = useRef<any>(null)

  const consultar = async (cod: string) => {
    const c = (cod || '').trim(); if (!c) return
    const { data, error } = await sb.rpc('codigo_consultar', { p_codigo: c })
    if (error || !data?.ok) { toast(data?.erro || 'Etiqueta não encontrada.', 'error'); setInfo(null); return }
    if (data.tipo !== 'item') { toast('Transferência disponível só para etiquetas por item.', 'error'); return }
    if (data.status && data.status !== 'disponivel') { toast('Item não está disponível (' + data.status + ').', 'error'); setInfo(null); return }
    setInfo(data); setCodigo(c)
  }
  const pararScanner = useCallback(async () => { if (scannerRef.current) { try { await scannerRef.current.stop(); await scannerRef.current.clear() } catch {} scannerRef.current = null } setScanning(false) }, [])
  const iniciarScanner = async () => {
    setScanning(true); setInfo(null)
    try { const h = new Html5Qrcode('leitor-transf'); scannerRef.current = h; await h.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 230, height: 230 } }, async (txt: string) => { await pararScanner(); consultar(txt) }, () => {}) }
    catch (e: any) { toast('Não foi possível abrir a câmera: ' + (e?.message || ''), 'error'); setScanning(false) }
  }
  useEffect(() => () => { pararScanner() }, [pararScanner])

  const transferir = async () => {
    if (!info) return
    if (!destLoja && !destSetor) { toast('Escolha a unidade ou o setor de destino.', 'error'); return }
    setBusy(true)
    const { data, error } = await sb.rpc('item_transferir', { p_codigo: info.codigo, p_destino_loja: destLoja || null, p_destino_setor: destSetor || null, p_por: user?.name || null })
    setBusy(false)
    if (error || !data?.ok) { toast(data?.erro || 'Erro ao transferir.', 'error'); return }
    toast(data.tipo === 'unidade' ? `Transferido de ${data.origem} → ${data.destino}. 🔄` : `Movido para o setor ${data.destino}. 🔄`)
    setInfo(null); setCodigo(''); setDestLoja(''); setDestSetor('')
  }

  return (
    <div style={card}>
      <b style={{ fontSize: 14 }}>Transferência por leitura</b>
      <p style={{ fontSize: 12.5, color: '#9ca3af', margin: '4px 0 10px' }}>Leia a etiqueta do item e escolha o destino: outra unidade e/ou outro setor.</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {!scanning ? <button onClick={iniciarScanner} style={btn('#6B1212')}><Camera size={16} />Ler com a câmera</button> : <button onClick={pararScanner} style={btn('#DC2626')}><X size={16} />Parar câmera</button>}
        <span style={{ fontSize: 12, color: '#9ca3af' }}>ou digite:</span>
        <input style={{ ...inp, width: 190 }} placeholder="Código do item" value={codigo} onChange={e => setCodigo(e.target.value)} onKeyDown={e => e.key === 'Enter' && consultar(codigo)} />
        <button onClick={() => consultar(codigo)} style={{ ...btn('#e5e7eb'), color: '#374151' }}><ScanLine size={15} />Consultar</button>
      </div>
      <div id="leitor-transf" style={{ width: '100%', maxWidth: 340, margin: scanning ? '8px 0' : 0 }} />

      {info && <div style={{ marginTop: 10, padding: 14, borderRadius: 12, border: '1px solid #e5e7eb', background: '#f9fafb' }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>{info.produto_nome}</div>
        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>Item {info.codigo} · {info.quantidade} {info.unidade} · {loja}{info.local ? ` · ${info.local}` : ''}</div>
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', gap: 8 }}>
          <div><label style={{ fontSize: 11, color: '#9ca3af' }}>Unidade de destino</label>
            <select style={inp} value={destLoja} onChange={e => setDestLoja(e.target.value)}><option value="">— mesma ({loja}) —</option>{LOJAS.filter(l => l !== loja).map(l => <option key={l} value={l}>{l}</option>)}</select></div>
          <div><label style={{ fontSize: 11, color: '#9ca3af' }}>Setor de destino</label>
            <input style={inp} list="setores-t" value={destSetor} onChange={e => setDestSetor(e.target.value)} placeholder="Ex.: Cozinha" /><datalist id="setores-t">{SETORES.map(s => <option key={s} value={s} />)}</datalist></div>
        </div>
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={transferir} disabled={busy} style={btn('#1D9E75')}><ArrowRightLeft size={16} />{busy ? 'Transferindo…' : 'Confirmar transferência'}</button>
        </div>
      </div>}
    </div>
  )
}

// ─────────────────────────────────────────── Inventário pelo celular
function TabInventario({ loja, toast, user }: any) {
  const [prods, setProds] = useState<any[]>([])
  const [prodId, setProdId] = useState('')
  const [scanning, setScanning] = useState(false)
  const [lidos, setLidos] = useState<string[]>([])
  const [resultado, setResultado] = useState<any | null>(null)
  const [busy, setBusy] = useState(false)
  const scannerRef = useRef<any>(null)
  const lidosRef = useRef<string[]>([])
  const [manual, setManual] = useState('')

  useEffect(() => { sb.from('estoque_produtos').select('id,nome').eq('loja', loja).eq('ativo', true).order('nome').then(({ data }: any) => setProds(data || [])) }, [loja])

  const addCodigo = (c: string) => {
    const cod = (c || '').trim(); if (!cod) return
    if (lidosRef.current.includes(cod)) return
    lidosRef.current = [...lidosRef.current, cod]; setLidos(lidosRef.current)
  }
  const pararScanner = useCallback(async () => { if (scannerRef.current) { try { await scannerRef.current.stop(); await scannerRef.current.clear() } catch {} scannerRef.current = null } setScanning(false) }, [])
  const iniciarScanner = async () => {
    setScanning(true); setResultado(null)
    try { const h = new Html5Qrcode('leitor-inv'); scannerRef.current = h; await h.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 230, height: 230 } }, (txt: string) => addCodigo(txt), () => {}) }
    catch (e: any) { toast('Não foi possível abrir a câmera: ' + (e?.message || ''), 'error'); setScanning(false) }
  }
  useEffect(() => () => { pararScanner() }, [pararScanner])

  const reiniciar = () => { lidosRef.current = []; setLidos([]); setResultado(null) }
  const comparar = async () => {
    setBusy(true)
    const { data, error } = await sb.rpc('inventario_comparar', { p_loja: loja, p_codigos: lidosRef.current, p_produto_id: prodId || null })
    setBusy(false)
    if (error || !data?.ok) { toast('Erro ao comparar inventário.', 'error'); return }
    setResultado(data)
  }
  const baixarFaltantes = async () => {
    if (!resultado?.faltando?.length) return
    if (!confirm(`Dar baixa como PERDA de ${resultado.faltando.length} item(ns) não encontrado(s) no físico?`)) return
    const codes = resultado.faltando.map((f: any) => f.codigo)
    const { data, error } = await sb.rpc('inventario_baixar_faltantes', { p_codigos: codes, p_por: user?.name || null, p_motivo: 'Perda por inventário' })
    if (error || !data?.ok) { toast('Erro ao baixar faltantes.', 'error'); return }
    toast(`${data.baixados} item(ns) baixado(s) como perda.`); reiniciar()
  }

  return (
    <div style={card}>
      <b style={{ fontSize: 14 }}>Inventário pelo celular</b>
      <p style={{ fontSize: 12.5, color: '#9ca3af', margin: '4px 0 10px' }}>Escaneie os itens presentes na prateleira. Ao finalizar, o sistema compara o físico com o registrado e aponta o que está faltando.</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select style={{ ...inp, width: 'auto' }} value={prodId} onChange={e => { setProdId(e.target.value); setResultado(null) }}><option value="">Todos os produtos</option>{prods.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}</select>
        {!scanning ? <button onClick={iniciarScanner} style={btn('#6B1212')}><Camera size={16} />Escanear itens</button> : <button onClick={pararScanner} style={btn('#DC2626')}><X size={16} />Parar câmera</button>}
        <input style={{ ...inp, width: 150 }} placeholder="ou digite o código" value={manual} onChange={e => setManual(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { addCodigo(manual); setManual('') } }} />
      </div>
      <div id="leitor-inv" style={{ width: '100%', maxWidth: 340, margin: scanning ? '8px 0' : 0 }} />

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '12px 0 6px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>{lidos.length} item(ns) escaneado(s)</span>
        <button disabled={!lidos.length || busy} onClick={comparar} style={{ ...btn(lidos.length ? '#1D9E75' : '#c4b5a8'), cursor: lidos.length ? 'pointer' : 'not-allowed' }}><Check size={15} />Finalizar e comparar</button>
        <button onClick={reiniciar} style={{ ...btn('#e5e7eb'), color: '#374151' }}><RefreshCw size={14} />Reiniciar</button>
      </div>
      {lidos.length > 0 && <div style={{ fontSize: 11.5, color: '#6b7280', fontFamily: 'monospace', wordBreak: 'break-all' }}>{lidos.join(' · ')}</div>}

      {resultado && <div style={{ marginTop: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px,1fr))', gap: 8 }}>
          {[['Esperado', resultado.esperado, '#6b7280'], ['Presentes', resultado.presentes, '#1D9E75'], ['Faltando', resultado.faltando_n, '#DC2626'], ['Divergências', resultado.divergencias_n, '#B45309']].map(([l, v, c]: any) => (
            <div key={l} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 12px' }}><div style={{ fontSize: 11, color: '#9ca3af' }}>{l}</div><div style={{ fontSize: 22, fontWeight: 800, color: c }}>{v}</div></div>
          ))}
        </div>
        {resultado.faltando_n > 0 && <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><b style={{ fontSize: 13, color: '#DC2626' }}>Faltando no físico ({resultado.faltando_n})</b><button onClick={baixarFaltantes} style={{ ...btn('#DC2626'), padding: '.4rem .8rem' }}><PackageMinus size={14} />Baixar como perda</button></div>
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {resultado.faltando.map((f: any) => <div key={f.codigo} style={{ fontSize: 12.5, background: '#FEF2F2', padding: '.4rem .7rem', borderRadius: 8 }}><b>{f.produto}</b> <span style={{ color: '#9ca3af', fontFamily: 'monospace' }}>{f.codigo}</span>{f.local ? ` · ${f.local}` : ''}{f.validade ? ` · val. ${fmtD(f.validade)}` : ''}</div>)}
          </div>
        </div>}
        {resultado.divergencias_n > 0 && <div style={{ marginTop: 12 }}>
          <b style={{ fontSize: 13, color: '#B45309' }}>Divergências ({resultado.divergencias_n})</b>
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {resultado.divergencias.map((d: any) => <div key={d.codigo} style={{ fontSize: 12.5, background: '#FFFBEB', padding: '.4rem .7rem', borderRadius: 8 }}><span style={{ fontFamily: 'monospace' }}>{d.codigo}</span> — {d.situacao}</div>)}
          </div>
        </div>}
        {resultado.faltando_n === 0 && resultado.divergencias_n === 0 && <div style={{ marginTop: 12, fontSize: 13, color: '#166534', background: '#DCFCE7', padding: '.6rem .8rem', borderRadius: 8, fontWeight: 600 }}>✅ Inventário bateu certinho — físico igual ao sistema.</div>}
      </div>}
    </div>
  )
}

// ─────────────────────────────────────────── Relatórios (vencimentos + consumo)
function TabRelatorios({ loja, toast, user }: any) {
  const hoje = new Date().toISOString().slice(0, 10)
  const mesAtras = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)
  const [vencendo, setVencendo] = useState<any[]>([])
  const [dias, setDias] = useState(8)
  // destinatários do alerta de vencimento
  const [dests, setDests] = useState<any[]>([])
  const [novoDest, setNovoDest] = useState({ nome: '', whatsapp: '', loja: 'Todas' })
  const [testeNum, setTesteNum] = useState('')
  const loadDests = useCallback(async () => { const { data } = await sb.from('estoque_alerta_destinatarios').select('*').order('created_at'); setDests(data || []) }, [])
  useEffect(() => { loadDests() }, [loadDests])
  const addDest = async () => {
    if (!novoDest.whatsapp.trim()) { toast('Informe o WhatsApp.', 'error'); return }
    const { error } = await sb.from('estoque_alerta_destinatarios').insert({ nome: novoDest.nome || null, whatsapp: novoDest.whatsapp.replace(/\D/g, ''), loja: novoDest.loja, created_by: user?.name || null })
    if (error) { toast('Erro ao adicionar.', 'error'); return }
    setNovoDest({ nome: '', whatsapp: '', loja: 'Todas' }); loadDests()
  }
  const delDest = async (id: string) => { await sb.from('estoque_alerta_destinatarios').delete().eq('id', id); loadDests() }
  const enviarAlerta = async () => {
    const { data, error } = await sb.rpc('vencimento_disparar', { p_dias: 8 })
    if (error || !data?.ok) { toast('Erro ao disparar alerta.', 'error'); return }
    toast(data.enviados > 0 ? `${data.enviados} alerta(s) na fila — o WhatsApp envia em ~90s. 📲` : 'Nenhum item vencendo em 8 dias, ou sem destinatários ativos.')
  }
  const enviarTeste = async () => {
    if (!testeNum.trim()) { toast('Informe o número para o teste.', 'error'); return }
    const { data, error } = await sb.rpc('vencimento_enviar_numero', { p_loja: loja, p_numero: testeNum.replace(/\D/g, ''), p_dias: 8 })
    if (error || !data?.ok) { toast(data?.erro || 'Erro no teste.', 'error'); return }
    toast('Alerta de teste na fila — chega no WhatsApp em ~90s. 📲'); setTesteNum('')
  }
  const [ini, setIni] = useState(mesAtras)
  const [fim, setFim] = useState(hoje)
  const [rel, setRel] = useState<any | null>(null)
  const [aba, setAba] = useState<'produto' | 'setor' | 'colaborador'>('produto')
  const [busy, setBusy] = useState(false)

  const loadVencendo = useCallback(async () => {
    const limite = new Date(Date.now() + dias * 864e5).toISOString().slice(0, 10)
    const { data } = await sb.from('estoque_itens').select('codigo,produto_nome,data_validade,local_armazenamento,unidade')
      .eq('loja', loja).eq('status', 'disponivel').not('data_validade', 'is', null).lte('data_validade', limite).order('data_validade').limit(100)
    setVencendo(data || [])
  }, [loja, dias])
  useEffect(() => { loadVencendo() }, [loadVencendo])

  const gerar = async () => {
    setBusy(true)
    const { data, error } = await sb.rpc('consumo_relatorio', { p_loja: loja, p_ini: ini, p_fim: fim })
    setBusy(false)
    if (error || !data?.ok) { toast('Erro ao gerar relatório.', 'error'); return }
    setRel(data)
  }
  useEffect(() => { gerar() /* eslint-disable-next-line */ }, [loja])

  const lista = rel ? (aba === 'produto' ? rel.por_produto : aba === 'setor' ? rel.por_setor : rel.por_colaborador) : []
  const rotulo = (x: any) => aba === 'produto' ? x.produto : aba === 'setor' ? x.setor : x.colaborador

  return (
    <>
      {/* vencimentos */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <b style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}><Clock size={16} style={{ color: '#DC2626' }} />Vencendo em até
            <select value={dias} onChange={e => setDias(Number(e.target.value))} style={{ ...inp, width: 'auto', display: 'inline-block' }}>{[3, 8, 15, 30].map(d => <option key={d} value={d}>{d} dias</option>)}</select>
            ({vencendo.length})</b>
          <button onClick={loadVencendo} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}><RefreshCw size={15} /></button>
        </div>
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {vencendo.length === 0 ? <div style={{ fontSize: 13, color: '#9ca3af' }}>Nenhum item vencendo nesse prazo. 👍</div> :
            vencendo.map(v => { const d = Math.ceil((new Date(v.data_validade).getTime() - Date.now()) / 864e5); const venc = d < 0; return (
              <div key={v.codigo} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, background: venc ? '#FEE2E2' : '#FEF3C7', padding: '.45rem .7rem', borderRadius: 8 }}>
                <AlertTriangle size={14} style={{ color: venc ? '#DC2626' : '#B45309' }} />
                <div style={{ flex: 1 }}><b>{v.produto_nome}</b> <span style={{ color: '#9ca3af', fontFamily: 'monospace', fontSize: 11.5 }}>{v.codigo}</span>{v.local_armazenamento ? ` · ${v.local_armazenamento}` : ''}</div>
                <span style={{ fontWeight: 700, color: venc ? '#DC2626' : '#B45309' }}>{venc ? `vencido há ${-d}d` : `${d}d`}</span>
                <span style={{ color: '#6b7280', fontSize: 12 }}>{fmtD(v.data_validade)}</span>
              </div>) })}
        </div>
      </div>

      {/* alerta de vencimento no WhatsApp */}
      <div style={card}>
        <b style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>📲 Alerta de vencimento no WhatsApp</b>
        <p style={{ fontSize: 12.5, color: '#9ca3af', margin: '4px 0 10px' }}>Automático todo dia às 08h com os itens vencendo em até <b>8 dias</b>. Cadastre quem recebe e teste abaixo.</p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 10 }}>
          <div><label style={{ fontSize: 11, color: '#9ca3af' }}>Nome</label><input style={{ ...inp, width: 130 }} value={novoDest.nome} onChange={e => setNovoDest({ ...novoDest, nome: e.target.value })} placeholder="Ex.: Wagner" /></div>
          <div><label style={{ fontSize: 11, color: '#9ca3af' }}>WhatsApp</label><input style={{ ...inp, width: 150 }} value={novoDest.whatsapp} onChange={e => setNovoDest({ ...novoDest, whatsapp: e.target.value })} placeholder="5581999999999" /></div>
          <div><label style={{ fontSize: 11, color: '#9ca3af' }}>Unidade</label><select style={{ ...inp, width: 'auto' }} value={novoDest.loja} onChange={e => setNovoDest({ ...novoDest, loja: e.target.value })}><option>Todas</option>{LOJAS.map(l => <option key={l}>{l}</option>)}</select></div>
          <button onClick={addDest} style={btn('#7C3AED')}><Plus size={15} />Adicionar</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {dests.length === 0 ? <div style={{ fontSize: 12.5, color: '#9ca3af' }}>Nenhum destinatário. Adicione ao menos um para o envio automático.</div> :
            dests.map(d => <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, background: '#f9fafb', padding: '.4rem .7rem', borderRadius: 8 }}>
              <span style={{ flex: 1 }}><b>{d.nome || 'Sem nome'}</b> <span style={{ color: '#9ca3af' }}>· {d.whatsapp} · {d.loja}</span></span>
              <button onClick={() => delDest(d.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626' }}><Trash2 size={14} /></button>
            </div>)}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 12, borderTop: '1px solid #f3f4f6', paddingTop: 12 }}>
          <button onClick={enviarAlerta} style={btn('#1D9E75')}><ScanLine size={15} />Enviar alerta agora</button>
          <span style={{ fontSize: 12, color: '#9ca3af' }}>ou teste em um número:</span>
          <input style={{ ...inp, width: 160 }} value={testeNum} onChange={e => setTesteNum(e.target.value)} placeholder="5581999999999" />
          <button onClick={enviarTeste} style={{ ...btn('#e5e7eb'), color: '#374151' }}>Enviar teste</button>
        </div>
      </div>

      {/* consumo */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          <b style={{ fontSize: 14 }}>Consumo no período</b>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="date" style={{ ...inp, width: 'auto' }} value={ini} onChange={e => setIni(e.target.value)} />
            <span style={{ color: '#9ca3af' }}>até</span>
            <input type="date" style={{ ...inp, width: 'auto' }} value={fim} onChange={e => setFim(e.target.value)} />
            <button onClick={gerar} disabled={busy} style={btn('#6B1212')}><BarChart3 size={15} />{busy ? '…' : 'Gerar'}</button>
          </div>
        </div>
        {rel && <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <div style={{ background: '#DCFCE7', borderRadius: 10, padding: '8px 14px' }}><div style={{ fontSize: 11, color: '#166534' }}>Saídas</div><div style={{ fontSize: 20, fontWeight: 800, color: '#166534' }}>{rel.total_saidas}</div></div>
            <div style={{ background: '#FEE2E2', borderRadius: 10, padding: '8px 14px' }}><div style={{ fontSize: 11, color: '#B91C1C' }}>Perdas</div><div style={{ fontSize: 20, fontWeight: 800, color: '#B91C1C' }}>{rel.total_perdas}</div></div>
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {[['produto', 'Por produto'], ['setor', 'Por setor'], ['colaborador', 'Por colaborador']].map(([v, l]) => (
              <button key={v} onClick={() => setAba(v as any)} style={{ ...btn(aba === v ? '#6B1212' : '#e5e7eb'), color: aba === v ? '#fff' : '#374151', padding: '.4rem .8rem', fontSize: 12 }}>{l}</button>
            ))}
            <button onClick={() => baixarCSV(`consumo_${aba}_${ini}_a_${fim}.csv`, [aba === 'produto' ? 'Produto' : aba === 'setor' ? 'Setor' : 'Colaborador', 'Qtd', 'Saidas', 'Perdas', 'Movs'], lista.map((x: any) => [rotulo(x), x.qtd, x.saidas || 0, x.perdas || 0, x.mov]))} style={{ ...btn('#e5e7eb'), color: '#374151', padding: '.4rem .8rem', fontSize: 12, marginLeft: 'auto' }}>⬇ CSV</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 420 }}>
              <thead><tr style={{ textAlign: 'left', color: '#9ca3af', fontSize: 11, textTransform: 'uppercase' }}>
                <th style={{ padding: 6 }}>{aba === 'produto' ? 'Produto' : aba === 'setor' ? 'Setor' : 'Colaborador'}</th><th>Qtd</th>{aba === 'produto' && <><th>Saídas</th><th>Perdas</th></>}<th>Movs</th>
              </tr></thead>
              <tbody>
                {lista.length === 0 ? <tr><td colSpan={5} style={{ padding: 16, color: '#9ca3af', textAlign: 'center' }}>Sem movimentações no período.</td></tr> :
                  lista.map((x: any, i: number) => (
                    <tr key={i} style={{ borderTop: '1px solid #f3f4f6' }}>
                      <td style={{ fontWeight: 600 }}>{rotulo(x)}</td>
                      <td style={{ fontWeight: 700 }}>{x.qtd}</td>
                      {aba === 'produto' && <><td style={{ color: '#166534' }}>{x.saidas || 0}</td><td style={{ color: '#B91C1C' }}>{x.perdas || 0}</td></>}
                      <td>{x.mov}</td>
                    </tr>))}
              </tbody>
            </table>
          </div>
        </>}
      </div>
    </>
  )
}

// ─────────────────────────────────────────── Dashboard do Estoque
function TabDashboard({ loja, toast, setTab }: any) {
  const [d, setD] = useState<any | null>(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    setBusy(true)
    const { data, error } = await sb.rpc('estoque_dashboard', { p_loja: loja })
    setBusy(false)
    if (error || !data?.ok) { toast('Erro ao carregar dashboard.', 'error'); return }
    setD(data)
  }, [loja])
  useEffect(() => { load() }, [load])

  const K = (l: string, v: any, c = '#241b19', sub?: string) => <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '12px 14px' }}><div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.04em' }}>{l}</div><div style={{ fontSize: 22, fontWeight: 800, color: c }}>{v}</div>{sub && <div style={{ fontSize: 11, color: '#9ca3af' }}>{sub}</div>}</div>
  const Lista = ({ titulo, cor, itens, render, vazio }: any) => (
    <div style={card}>
      <b style={{ fontSize: 13.5, color: cor }}>{titulo} ({itens?.length || 0})</b>
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {(!itens || itens.length === 0) ? <div style={{ fontSize: 12.5, color: '#9ca3af' }}>{vazio}</div> : itens.slice(0, 12).map(render)}
      </div>
    </div>
  )

  if (!d) return <div style={card}>{busy ? 'Carregando…' : 'Sem dados.'}</div>
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <button onClick={load} style={{ ...btn('#f3f4f6'), color: '#374151' }}><RefreshCw size={15} />Atualizar</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))', gap: 10, marginBottom: 14 }}>
        {K('Entradas hoje', d.entradas_hoje?.n || 0, '#166534', `${d.entradas_hoje?.qtd || 0} un`)}
        {K('Saídas hoje', d.saidas_hoje?.n || 0, '#B91C1C', `${d.saidas_hoje?.qtd || 0} un`)}
        {K('Transferências', d.transferencias_hoje || 0, '#6D28D9', 'hoje')}
        {K('Valor do estoque', fmt(d.valor_total), '#1D4ED8')}
        {K('Giro (30d)', d.giro, '#241b19', 'saídas / estoque')}
        {K('Perdas do mês', d.perdas_mes_qtd || 0, '#DC2626', 'un')}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px,1fr))', gap: 12 }}>
        <Lista titulo="🔴 Abaixo do mínimo" cor="#DC2626" itens={d.abaixo_minimo} vazio="Tudo acima do mínimo. 👍"
          render={(p: any, i: number) => <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12.5, background: '#FEF2F2', padding: '.4rem .7rem', borderRadius: 8 }}><b style={{ flex: 1 }}>{p.nome}</b><span style={{ color: '#DC2626', fontWeight: 700 }}>{p.atual}</span><span style={{ color: '#9ca3af' }}>/ mín {p.minimo}</span></div>} />
        <Lista titulo="⏰ Vencendo (≤8 dias)" cor="#B45309" itens={d.vencendo} vazio="Nada vencendo em breve."
          render={(v: any, i: number) => <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12.5, background: v.dias < 0 ? '#FEE2E2' : '#FEF3C7', padding: '.4rem .7rem', borderRadius: 8 }}><b style={{ flex: 1 }}>{v.produto}</b><span style={{ fontWeight: 700, color: v.dias < 0 ? '#DC2626' : '#B45309' }}>{v.dias < 0 ? `vencido ${-v.dias}d` : `${v.dias}d`}</span></div>} />
        <Lista titulo="💤 Sem movimentação (30d)" cor="#6b7280" itens={d.sem_movimento} vazio="Todos com giro recente."
          render={(p: any, i: number) => <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12.5, background: '#f9fafb', padding: '.4rem .7rem', borderRadius: 8 }}><b style={{ flex: 1 }}>{p.nome}</b><span style={{ color: '#9ca3af' }}>{p.atual}</span></div>} />
        <Lista titulo="👤 Mais movimentaram (30d)" cor="#1D4ED8" itens={d.top_colaboradores} vazio="Sem movimentações."
          render={(c: any, i: number) => <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12.5, background: '#f9fafb', padding: '.4rem .7rem', borderRadius: 8 }}><b style={{ flex: 1 }}>{c.quem}</b><span>{c.movs} movs</span><span style={{ color: '#9ca3af' }}>{c.qtd} un</span></div>} />
      </div>
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><b style={{ fontSize: 13.5 }}>Últimas movimentações</b><button onClick={() => setTab('historico')} style={{ background: 'none', border: 'none', color: '#6B1212', cursor: 'pointer', fontSize: 12 }}>ver histórico →</button></div>
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {(d.ultimas_mov || []).map((m: any, i: number) => { const t = TIPO_MOV[m.tipo] || { l: m.tipo, c: '#6b7280' }; return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, background: '#f9fafb', padding: '.4rem .7rem', borderRadius: 8 }}>
              <span style={{ fontWeight: 700, color: t.c, minWidth: 84 }}>{t.l}</span>
              <span style={{ flex: 1 }}>{m.produto} · {m.qtd} {m.unidade}{m.quem ? ` · ${m.quem}` : ''}</span>
              <span style={{ color: '#9ca3af', fontSize: 11.5 }}>{new Date(m.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
            </div>) })}
        </div>
      </div>
    </>
  )
}

// ─────────────────────────────────────────── Beneficiamento / Conversão
const DESTINOS = ['descarte', 'reaproveitamento', 'caldo', 'molho', 'recheio', 'alimentacao_colaborador', 'doacao', 'devolucao_fornecedor', 'amostra', 'outro']
const nnum = (n: any) => Number(n) || 0
function TabBeneficiamento({ loja, toast, user }: any) {
  const [view, setView] = useState<'nova' | 'indicadores' | 'regras'>('nova')
  const [prods, setProds] = useState<any[]>([])
  const [origem, setOrigem] = useState<any>({ produto_id: '', qtd_bruta: '', custo_kg: '', peso_antes: '', lote: '', validade: '', tipo_beneficiamento: '', sif: '' })
  const [saidas, setSaidas] = useState<any[]>([{ tipo: 'final', produto_nome: '', quantidade: '', unidade: 'kg', destino: '', custo_atribuido: '', validade: '', local: '', categoria_conservacao: '' }])
  const [meta, setMeta] = useState<any>({ setor: '', colaborador: '', conferente: '', observacao: '', op_numero: '' })
  const [justificativa, setJustificativa] = useState('')
  const [fotos, setFotos] = useState<string[]>([])
  const [upBusy, setUpBusy] = useState(false)
  const [busy, setBusy] = useState(false)
  const [novos, setNovos] = useState<string[]>([])

  useEffect(() => { sb.from('estoque_produtos').select('id,nome,gramatura,preco_unitario,nivel_atual,rend_min,rend_max').eq('loja', loja).eq('ativo', true).order('nome').then(({ data }: any) => setProds(data || [])) }, [loja])
  useEffect(() => { if (user?.name && !meta.colaborador) setMeta((m: any) => ({ ...m, colaborador: user.name })) }, [user])
  const prodOrigem = prods.find(p => p.id === origem.produto_id)
  useEffect(() => { if (prodOrigem) setOrigem((o: any) => ({ ...o, custo_kg: o.custo_kg || prodOrigem.preco_unitario || '' })) /* eslint-disable-next-line */ }, [origem.produto_id])

  const upSaida = (i: number, patch: any) => setSaidas(a => a.map((x, idx) => idx === i ? { ...x, ...patch } : x))
  const addSaida = (tipo: string) => setSaidas(a => [...a, { tipo, produto_nome: '', quantidade: '', unidade: 'kg', destino: tipo === 'perda' ? 'descarte' : '', custo_atribuido: '', validade: '', local: '', categoria_conservacao: '' }])
  const rmSaida = (i: number) => setSaidas(a => a.filter((_, idx) => idx !== i))

  const pesoAntes = nnum(origem.peso_antes) || nnum(origem.qtd_bruta)
  const pesoFinal = saidas.filter(s => s.tipo === 'final').reduce((a, s) => a + nnum(s.quantidade), 0)
  const pesoSub = saidas.filter(s => s.tipo === 'subproduto').reduce((a, s) => a + nnum(s.quantidade), 0)
  const pesoPerda = saidas.filter(s => s.tipo === 'perda').reduce((a, s) => a + nnum(s.quantidade), 0)
  const custoBruto = nnum(origem.qtd_bruta) * nnum(origem.custo_kg)
  const custoSub = saidas.filter(s => s.tipo === 'subproduto').reduce((a, s) => a + nnum(s.custo_atribuido), 0)
  const custoLiq = custoBruto - custoSub
  const custoKg = pesoFinal > 0 ? custoLiq / pesoFinal : 0
  const rend = pesoAntes > 0 ? 100 * pesoFinal / pesoAntes : 0
  const perdaPct = pesoAntes > 0 ? 100 * pesoPerda / pesoAntes : 0
  const foraPadrao = prodOrigem?.rend_min != null && prodOrigem?.rend_max != null && pesoFinal > 0 && (rend < prodOrigem.rend_min || rend > prodOrigem.rend_max)
  const somaSaidas = pesoFinal + pesoSub + pesoPerda
  const divergePeso = pesoAntes > 0 && Math.abs(somaSaidas - pesoAntes) > 0.05

  const upFoto = async (f: File) => {
    setUpBusy(true)
    try {
      const ext = (f.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `beneficiamento/${crypto.randomUUID()}.${ext}`
      const { error } = await sb.storage.from('anexos').upload(path, f, { upsert: true, contentType: f.type })
      if (error) { toast('Erro ao enviar foto.', 'error'); setUpBusy(false); return }
      setFotos(fs => [...fs, `${SB_URL}/storage/v1/object/public/anexos/${path}`])
    } catch {} setUpBusy(false)
  }

  const confirmar = async () => {
    if (!origem.produto_id || nnum(origem.qtd_bruta) <= 0) { toast('Selecione a origem e a quantidade bruta.', 'error'); return }
    if (pesoFinal <= 0) { toast('Informe ao menos um produto final.', 'error'); return }
    if (foraPadrao && !justificativa.trim()) { toast('Rendimento fora do padrão — informe a justificativa.', 'error'); return }
    setBusy(true)
    const { data, error } = await sb.rpc('beneficiamento_registrar', {
      p_loja: loja,
      p_origem: { produto_id: origem.produto_id, lote: origem.lote || null, validade: origem.validade || null, qtd_bruta: nnum(origem.qtd_bruta), unidade: prodOrigem?.gramatura || 'kg', peso_antes: pesoAntes, custo_kg: nnum(origem.custo_kg), tipo_beneficiamento: origem.tipo_beneficiamento || null, sif: origem.sif || null },
      p_saidas: saidas.filter(s => nnum(s.quantidade) > 0).map(s => ({ tipo: s.tipo, produto_nome: s.produto_nome, quantidade: nnum(s.quantidade), unidade: s.unidade, destino: s.destino || null, custo_atribuido: s.custo_atribuido ? nnum(s.custo_atribuido) : null, validade: s.validade || null, local: s.local || null, categoria_conservacao: s.categoria_conservacao || null })),
      p_meta: meta, p_fotos: fotos, p_justificativa: justificativa || null,
    })
    setBusy(false)
    if (error || !data?.ok) { toast(data?.erro || 'Erro ao registrar beneficiamento.', 'error'); return }
    toast(`Beneficiamento nº ${data.numero} · rendimento ${data.rendimento}% · custo R$ ${Number(data.custo_kg_benef).toFixed(2)}/kg ✅`)
    setNovos(data.codigos || [])
  }
  const imprimirNovas = async () => { if (!novos.length) return; const { data } = await sb.from('estoque_itens').select('*').in('codigo', novos); imprimirItens(data || [], loja) }

  if (novos.length) return (
    <div style={card}>
      <div style={{ textAlign: 'center', padding: 12 }}>
        <div style={{ fontSize: 40 }}>✅</div>
        <b style={{ fontSize: 15 }}>Beneficiamento registrado!</b>
        <p style={{ fontSize: 13, color: '#6b7280' }}>Rendimento {rend.toFixed(1)}% · custo real R$ {custoKg.toFixed(2)}/kg. Gerou {novos.length} etiqueta(s).</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 10, flexWrap: 'wrap' }}>
          <button onClick={imprimirNovas} style={btn('#6B1212')}><Printer size={16} />Imprimir etiquetas</button>
          <button onClick={() => { setNovos([]); setOrigem({ produto_id: '', qtd_bruta: '', custo_kg: '', peso_antes: '', lote: '', validade: '', tipo_beneficiamento: '' }); setSaidas([{ tipo: 'final', produto_nome: '', quantidade: '', unidade: 'kg', destino: '', custo_atribuido: '', validade: '', local: '' }]); setFotos([]); setJustificativa('') }} style={{ ...btn('#e5e7eb'), color: '#374151' }}>Novo beneficiamento</button>
        </div>
      </div>
    </div>
  )

  const TCOR: any = { final: '#166534', subproduto: '#B45309', perda: '#DC2626' }
  return (
    <div style={card}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <button onClick={() => setView('nova')} style={{ ...btn(view === 'nova' ? '#166534' : '#e5e7eb'), color: view === 'nova' ? '#fff' : '#374151', padding: '.45rem .9rem', fontSize: 12.5 }}><Scissors size={14} />Nova conversão</button>
        <button onClick={() => setView('indicadores')} style={{ ...btn(view === 'indicadores' ? '#166534' : '#e5e7eb'), color: view === 'indicadores' ? '#fff' : '#374151', padding: '.45rem .9rem', fontSize: 12.5 }}><BarChart3 size={14} />Indicadores</button>
        <button onClick={() => setView('regras')} style={{ ...btn(view === 'regras' ? '#166534' : '#e5e7eb'), color: view === 'regras' ? '#fff' : '#374151', padding: '.45rem .9rem', fontSize: 12.5 }}><Clock size={14} />Regras de validade</button>
      </div>
      {view === 'indicadores' ? <BenefIndicadores loja={loja} toast={toast} /> : view === 'regras' ? <BenefRegras toast={toast} /> : <>
      <b style={{ fontSize: 14 }}>Beneficiamento / Conversão</b>
      <p style={{ fontSize: 12.5, color: '#9ca3af', margin: '4px 0 10px' }}>Transforme um produto bruto em produtos finais, subprodutos e perdas — com rendimento e custo real calculados.</p>

      {/* origem */}
      <div style={{ background: '#faf8f5', border: '1px solid #ece4dd', borderRadius: 10, padding: 12 }}>
        <b style={{ fontSize: 12.5 }}>Matéria-prima (origem)</b>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))', gap: 8, marginTop: 8 }}>
          <div style={{ gridColumn: 'span 2' }}><label style={{ fontSize: 11, color: '#9ca3af' }}>Produto de origem</label>
            <select style={inp} value={origem.produto_id} onChange={e => setOrigem({ ...origem, produto_id: e.target.value })}><option value="">Selecione…</option>{prods.map(p => <option key={p.id} value={p.id}>{p.nome} (estoque {p.nivel_atual})</option>)}</select></div>
          <div><label style={{ fontSize: 11, color: '#9ca3af' }}>Qtd bruta ({prodOrigem?.gramatura || 'kg'})</label><input style={inp} type="number" step="0.01" value={origem.qtd_bruta} onChange={e => setOrigem({ ...origem, qtd_bruta: e.target.value })} /></div>
          <div><label style={{ fontSize: 11, color: '#9ca3af' }}>Custo por {prodOrigem?.gramatura || 'kg'} (R$)</label><input style={inp} type="number" step="0.01" value={origem.custo_kg} onChange={e => setOrigem({ ...origem, custo_kg: e.target.value })} /></div>
          <div><label style={{ fontSize: 11, color: '#9ca3af' }}>Peso antes (opcional)</label><input style={inp} type="number" step="0.01" value={origem.peso_antes} onChange={e => setOrigem({ ...origem, peso_antes: e.target.value })} placeholder={String(origem.qtd_bruta || '')} /></div>
          <div><label style={{ fontSize: 11, color: '#9ca3af' }}>Tipo de beneficiamento</label><input style={inp} value={origem.tipo_beneficiamento} onChange={e => setOrigem({ ...origem, tipo_beneficiamento: e.target.value })} placeholder="Limpeza, porcionamento…" /></div>
          <div><label style={{ fontSize: 11, color: '#9ca3af' }}>Lote origem</label><input style={inp} value={origem.lote} onChange={e => setOrigem({ ...origem, lote: e.target.value })} /></div>
          <div><label style={{ fontSize: 11, color: '#9ca3af' }}>SIF/SIE/SIM</label><input style={inp} value={origem.sif} onChange={e => setOrigem({ ...origem, sif: e.target.value })} placeholder="Opcional" /></div>
          <div><label style={{ fontSize: 11, color: '#9ca3af' }}>Validade origem</label><input style={inp} type="date" value={origem.validade} onChange={e => setOrigem({ ...origem, validade: e.target.value })} /></div>
        </div>
      </div>

      {/* saídas */}
      <div style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
          <b style={{ fontSize: 12.5 }}>Produtos gerados</b>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => addSaida('final')} style={{ ...btn('#DCFCE7'), color: '#166534', padding: '.35rem .7rem', fontSize: 12 }}><Plus size={13} />Final</button>
            <button onClick={() => addSaida('subproduto')} style={{ ...btn('#FEF3C7'), color: '#B45309', padding: '.35rem .7rem', fontSize: 12 }}><Plus size={13} />Subproduto</button>
            <button onClick={() => addSaida('perda')} style={{ ...btn('#FEE2E2'), color: '#DC2626', padding: '.35rem .7rem', fontSize: 12 }}><Plus size={13} />Perda</button>
          </div>
        </div>
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {saidas.map((s, i) => (
            <div key={i} style={{ border: '1px solid #e5e7eb', borderLeft: `4px solid ${TCOR[s.tipo]}`, borderRadius: 10, padding: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: TCOR[s.tipo] }}>{s.tipo === 'final' ? 'PRODUTO FINAL' : s.tipo === 'subproduto' ? 'SUBPRODUTO (reaproveitável)' : 'PERDA / RESÍDUO'}</span>
                {saidas.length > 1 && <button onClick={() => rmSaida(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626' }}><Trash2 size={13} /></button>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px,1fr))', gap: 6 }}>
                <div style={{ gridColumn: 'span 2' }}><input style={inp} value={s.produto_nome} onChange={e => upSaida(i, { produto_nome: e.target.value })} placeholder={s.tipo === 'perda' ? 'Descrição do resíduo' : 'Nome do produto'} /></div>
                <div><input style={inp} type="number" step="0.01" value={s.quantidade} onChange={e => upSaida(i, { quantidade: e.target.value })} placeholder="Qtd" /></div>
                <div><select style={inp} value={s.unidade} onChange={e => upSaida(i, { unidade: e.target.value })}>{UNIDADES.map(u => <option key={u}>{u}</option>)}</select></div>
                {s.tipo === 'subproduto' && <div><input style={inp} type="number" step="0.01" value={s.custo_atribuido} onChange={e => upSaida(i, { custo_atribuido: e.target.value })} placeholder="Custo atribuído R$" /></div>}
                {(s.tipo === 'perda' || s.tipo === 'subproduto') && <div><select style={inp} value={s.destino} onChange={e => upSaida(i, { destino: e.target.value })}><option value="">Destino…</option>{DESTINOS.map(d => <option key={d} value={d}>{d.replace(/_/g, ' ')}</option>)}</select></div>}
                {s.tipo !== 'perda' && <div title="Manipulado — calcula validade automática"><select style={inp} value={s.categoria_conservacao} onChange={e => upSaida(i, { categoria_conservacao: e.target.value })}>{CONSERV.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>}
                {s.tipo !== 'perda' && !s.categoria_conservacao && <div><input style={inp} type="date" value={s.validade} onChange={e => upSaida(i, { validade: e.target.value })} title="Validade manual" /></div>}
              </div>
              {s.tipo !== 'perda' && s.categoria_conservacao && <div style={{ fontSize: 11, color: '#166534', marginTop: 4 }}>🏷️ Produto manipulado — validade automática por categoria + etiqueta sanitária.</div>}
            </div>
          ))}
        </div>
      </div>

      {/* cálculo */}
      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px,1fr))', gap: 8 }}>
        <div style={{ background: '#DCFCE7', borderRadius: 10, padding: '8px 12px' }}><div style={{ fontSize: 11, color: '#166534' }}>Rendimento</div><div style={{ fontSize: 19, fontWeight: 800, color: foraPadrao ? '#DC2626' : '#166534' }}>{rend.toFixed(1)}%</div></div>
        <div style={{ background: '#FEE2E2', borderRadius: 10, padding: '8px 12px' }}><div style={{ fontSize: 11, color: '#B91C1C' }}>Perda</div><div style={{ fontSize: 19, fontWeight: 800, color: '#B91C1C' }}>{perdaPct.toFixed(1)}%</div></div>
        <div style={{ background: '#f9fafb', borderRadius: 10, padding: '8px 12px' }}><div style={{ fontSize: 11, color: '#9ca3af' }}>Custo bruto</div><div style={{ fontSize: 17, fontWeight: 800 }}>{fmt(custoBruto)}</div></div>
        <div style={{ background: '#EDE9FE', borderRadius: 10, padding: '8px 12px' }}><div style={{ fontSize: 11, color: '#6D28D9' }}>Custo real/kg</div><div style={{ fontSize: 17, fontWeight: 800, color: '#6D28D9' }}>{fmt(custoKg)}</div></div>
      </div>
      {divergePeso && <div style={{ marginTop: 8, fontSize: 12, color: '#B45309', background: '#FEF3C7', padding: '.4rem .7rem', borderRadius: 8 }}>⚠️ Soma dos produtos ({somaSaidas.toFixed(2)}) diferente do peso antes ({pesoAntes.toFixed(2)}).</div>}
      {foraPadrao && <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 12.5, color: '#B91C1C', background: '#FEE2E2', padding: '.5rem .7rem', borderRadius: 8, fontWeight: 600, display: 'flex', gap: 6, alignItems: 'center' }}><AlertTriangle size={14} />Rendimento fora do padrão ({prodOrigem.rend_min}–{prodOrigem.rend_max}%). Justifique abaixo.</div>
        <input style={{ ...inp, marginTop: 6 }} value={justificativa} onChange={e => setJustificativa(e.target.value)} placeholder="Justificativa obrigatória" />
      </div>}

      {/* conferência + fotos */}
      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))', gap: 8 }}>
        <div><label style={{ fontSize: 11, color: '#9ca3af' }}>Setor</label><input style={inp} list="setores-b" value={meta.setor} onChange={e => setMeta({ ...meta, setor: e.target.value })} /><datalist id="setores-b">{SETORES.map(s => <option key={s} value={s} />)}</datalist></div>
        <div><label style={{ fontSize: 11, color: '#9ca3af' }}>Colaborador</label><input style={inp} value={meta.colaborador} onChange={e => setMeta({ ...meta, colaborador: e.target.value })} /></div>
        <div><label style={{ fontSize: 11, color: '#9ca3af' }}>Conferente</label><input style={inp} value={meta.conferente} onChange={e => setMeta({ ...meta, conferente: e.target.value })} /></div>
        <div><label style={{ fontSize: 11, color: '#9ca3af' }}>Ordem de Produção</label><input style={inp} value={meta.op_numero} onChange={e => setMeta({ ...meta, op_numero: e.target.value })} placeholder="OP-000" /></div>
        <div><label style={{ fontSize: 11, color: '#9ca3af' }}>Observação</label><input style={inp} value={meta.observacao} onChange={e => setMeta({ ...meta, observacao: e.target.value })} /></div>
      </div>
      <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, padding: '.5rem .8rem', border: '1px dashed #c4b5a8', borderRadius: 8, cursor: 'pointer', background: '#fff' }}>
          <Camera size={15} />{upBusy ? 'Enviando…' : 'Anexar foto'}<input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) upFoto(f) }} />
        </label>
        {fotos.map((f, i) => <a key={i} href={f} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#6B1212' }}>foto {i + 1}</a>)}
      </div>

      <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={confirmar} disabled={busy} style={btn('#166534')}><Check size={16} />{busy ? 'Registrando…' : 'Confirmar beneficiamento'}</button>
      </div>
      </>}
    </div>
  )
}

// ─────────────────────────────────────────── Indicadores de beneficiamento
function BenefIndicadores({ loja, toast }: any) {
  const hoje = new Date().toISOString().slice(0, 10)
  const mesAtras = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)
  const [ini, setIni] = useState(mesAtras)
  const [fim, setFim] = useState(hoje)
  const [d, setD] = useState<any | null>(null)
  const [busy, setBusy] = useState(false)
  const [aba, setAba] = useState<'produto' | 'colaborador' | 'ranking' | 'fora'>('produto')

  const gerar = useCallback(async () => {
    setBusy(true)
    const { data, error } = await sb.rpc('beneficiamento_indicadores', { p_loja: loja, p_ini: ini, p_fim: fim })
    setBusy(false)
    if (error || !data?.ok) { toast('Erro ao gerar indicadores.', 'error'); return }
    setD(data)
  }, [loja, ini, fim])
  useEffect(() => { gerar() }, [loja]) // eslint-disable-line

  const KPI = (l: string, v: any, c = '#241b19') => <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '8px 12px' }}><div style={{ fontSize: 11, color: '#9ca3af' }}>{l}</div><div style={{ fontSize: 18, fontWeight: 800, color: c }}>{v}</div></div>

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <input type="date" style={{ ...inp, width: 'auto' }} value={ini} onChange={e => setIni(e.target.value)} />
        <span style={{ color: '#9ca3af' }}>até</span>
        <input type="date" style={{ ...inp, width: 'auto' }} value={fim} onChange={e => setFim(e.target.value)} />
        <button onClick={gerar} disabled={busy} style={btn('#166534')}><BarChart3 size={15} />{busy ? '…' : 'Gerar'}</button>
      </div>
      {!d ? <div style={{ fontSize: 13, color: '#9ca3af' }}>Sem dados.</div> : d.total_conversoes === 0 ? <div style={{ fontSize: 13, color: '#9ca3af' }}>Nenhuma conversão no período.</div> : <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px,1fr))', gap: 8 }}>
          {KPI('Conversões', d.total_conversoes)}
          {KPI('Rendimento médio', d.rendimento_medio + '%', '#166534')}
          {KPI('Perda média', d.perda_media + '%', '#B91C1C')}
          {KPI('Valor perdas', fmt(d.valor_perdas), '#DC2626')}
          {KPI('Recuperado', fmt(d.valor_recuperado), '#166534')}
          {KPI('Fora do padrão', d.fora_padrao_n, d.fora_padrao_n > 0 ? '#DC2626' : '#166534')}
        </div>
        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>Peso bruto {d.peso_bruto} · aproveitado {d.peso_aproveitado} · perdido {d.peso_perdido} · custo bruto total {fmt(d.custo_bruto_total)}</div>
        <div style={{ display: 'flex', gap: 6, margin: '12px 0 8px', flexWrap: 'wrap' }}>
          {[['produto', 'Por produto'], ['colaborador', 'Por colaborador'], ['ranking', 'Ranking desperdício'], ['fora', `Fora do padrão (${d.fora_padrao_n})`]].map(([v, l]) => (
            <button key={v} onClick={() => setAba(v as any)} style={{ ...btn(aba === v ? '#6B1212' : '#e5e7eb'), color: aba === v ? '#fff' : '#374151', padding: '.4rem .8rem', fontSize: 12 }}>{l}</button>
          ))}
        </div>
        {aba === 'produto' && <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {(d.por_produto || []).map((p: any, i: number) => <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12.5, background: '#f9fafb', padding: '.4rem .7rem', borderRadius: 8 }}><b style={{ flex: 1 }}>{p.produto}</b><span>rend. {p.rendimento_medio}%</span><span style={{ color: '#DC2626' }}>perda {fmt(p.valor_perda)}</span><span style={{ color: '#9ca3af' }}>{p.conversoes}x</span></div>)}
        </div>}
        {aba === 'colaborador' && <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {(d.por_colaborador || []).map((p: any, i: number) => <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12.5, background: '#f9fafb', padding: '.4rem .7rem', borderRadius: 8 }}><b style={{ flex: 1 }}>{p.colaborador}</b><span>rend. {p.rendimento_medio}%</span><span style={{ color: '#B91C1C' }}>perda média {p.perda_media}%</span><span style={{ color: '#9ca3af' }}>{p.conversoes}x</span></div>)}
        </div>}
        {aba === 'ranking' && <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {(d.ranking_desperdicio || []).map((p: any, i: number) => <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12.5, background: i === 0 ? '#FEE2E2' : '#f9fafb', padding: '.4rem .7rem', borderRadius: 8 }}><b style={{ minWidth: 20 }}>{i + 1}º</b><b style={{ flex: 1 }}>{p.produto}</b><span style={{ color: '#DC2626', fontWeight: 700 }}>{fmt(p.valor_perda)}</span><span style={{ color: '#9ca3af' }}>{p.peso_perdido}</span></div>)}
        </div>}
        {aba === 'fora' && <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {(d.fora_padrao || []).length === 0 ? <div style={{ fontSize: 12.5, color: '#166534' }}>✅ Nenhuma conversão fora do padrão.</div> :
            d.fora_padrao.map((p: any, i: number) => <div key={i} style={{ fontSize: 12.5, background: '#FEE2E2', padding: '.4rem .7rem', borderRadius: 8 }}>nº {p.numero} · <b>{p.produto}</b> · rend. {p.rendimento}% · {p.colaborador}{p.justificativa ? ` · "${p.justificativa}"` : ' · sem justificativa'}</div>)}
        </div>}
      </>}
    </>
  )
}

// ─────────────────────────────────────────── Regras de validade (admin)
function BenefRegras({ toast }: any) {
  const [regras, setRegras] = useState<any[]>([])
  const load = useCallback(async () => { const { data } = await sb.from('validade_regras').select('*').order('categoria'); setRegras(data || []) }, [])
  useEffect(() => { load() }, [load])
  const salvar = async (r: any, dias: any, tipo: string) => {
    const { error } = await sb.from('validade_regras').update({ dias_validade: Number(dias) || 0, tipo_conservacao: tipo, updated_at: new Date().toISOString() }).eq('id', r.id)
    if (error) { toast('Erro ao salvar.', 'error'); return }
    toast('Regra atualizada. ✅'); load()
  }
  const TIPOS = ['resfriado', 'congelado', 'descongelado', 'ambiente']
  return (
    <div>
      <p style={{ fontSize: 12.5, color: '#9ca3af', margin: '0 0 10px' }}>Configure a validade (em dias) e o tipo de conservação de cada categoria. Ao manipular, a validade é calculada automaticamente.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {regras.map(r => (
          <div key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', background: '#f9fafb', padding: '.5rem .7rem', borderRadius: 8 }}>
            <b style={{ flex: 1, minWidth: 140, fontSize: 13 }}>{r.label || r.categoria}</b>
            <label style={{ fontSize: 12, color: '#6b7280' }}>Dias: <input type="number" defaultValue={r.dias_validade} id={`d-${r.id}`} style={{ ...inp, width: 70, display: 'inline-block' }} /></label>
            <select defaultValue={r.tipo_conservacao} id={`t-${r.id}`} style={{ ...inp, width: 'auto' }}>{TIPOS.map(t => <option key={t} value={t}>{t}</option>)}</select>
            <button onClick={() => salvar(r, (document.getElementById(`d-${r.id}`) as any).value, (document.getElementById(`t-${r.id}`) as any).value)} style={{ ...btn('#166534'), padding: '.35rem .8rem', fontSize: 12 }}><Check size={13} />Salvar</button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────── Entrada por leitura
function TabEntrada({ loja, toast, user }: any) {
  const [codigo, setCodigo] = useState('')
  const [info, setInfo] = useState<any | null>(null)
  const [form, setForm] = useState<any>({ qtd: '1', qtd_item: '1', lote: '', validade: '', fornecedor: '', nota: '', obs: '', local: '' })
  const [scanning, setScanning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [novosCodigos, setNovosCodigos] = useState<string[]>([])
  const scannerRef = useRef<any>(null)

  const consultar = async (cod: string) => {
    const c = (cod || '').trim(); if (!c) return
    const { data, error } = await sb.rpc('produto_consulta', { p_codigo: c })
    if (error || !data?.ok) { toast(data?.erro || 'Etiqueta não encontrada.', 'error'); setInfo(null); return }
    setInfo(data); setCodigo(c); setNovosCodigos([]); setForm((f: any) => ({ ...f, local: data.local || '', fornecedor: data.fornecedor || '' }))
  }
  const pararScanner = useCallback(async () => { if (scannerRef.current) { try { await scannerRef.current.stop(); await scannerRef.current.clear() } catch {} scannerRef.current = null } setScanning(false) }, [])
  const iniciarScanner = async () => {
    setScanning(true); setInfo(null)
    try { const h = new Html5Qrcode('leitor-ent'); scannerRef.current = h; await h.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 230, height: 230 } }, async (txt: string) => { await pararScanner(); consultar(txt) }, () => {}) }
    catch (e: any) { toast('Não foi possível abrir a câmera: ' + (e?.message || ''), 'error'); setScanning(false) }
  }
  useEffect(() => () => { pararScanner() }, [pararScanner])

  const salvar = async () => {
    if (!info) return
    if (!form.qtd || Number(form.qtd) <= 0) { toast('Informe a quantidade recebida.', 'error'); return }
    setBusy(true)
    const { data, error } = await sb.rpc('entrada_por_leitura', {
      p_produto_id: info.produto_id, p_qtd_itens: Number(form.qtd), p_qtd_item: Number(form.qtd_item) || 1, p_lote: form.lote || null,
      p_validade: form.validade || null, p_fornecedor: form.fornecedor || null, p_nota: form.nota || null, p_obs: form.obs || null, p_local: form.local || null, p_por: user?.name || null,
    })
    setBusy(false)
    if (error || !data?.ok) { toast(data?.erro || 'Erro ao salvar entrada.', 'error'); return }
    toast(`Entrada de ${data.n} item(ns) · ${data.produto_nome}. Saldo: ${data.saldo_produto} ✅`)
    setNovosCodigos(data.codigos || [])
    setInfo((i: any) => ({ ...i, estoque_atual: data.saldo_produto }))
  }
  const imprimirNovas = async () => {
    if (!novosCodigos.length) return
    const { data } = await sb.from('estoque_itens').select('*').in('codigo', novosCodigos)
    imprimirItens(data || [], loja)
  }

  return (
    <div style={card}>
      <b style={{ fontSize: 14 }}>Entrada por leitura</b>
      <p style={{ fontSize: 12.5, color: '#9ca3af', margin: '4px 0 10px' }}>Leia a etiqueta do produto para identificá-lo, informe a quantidade recebida e salve. Gera novas etiquetas para imprimir.</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {!scanning ? <button onClick={iniciarScanner} style={btn('#166534')}><Camera size={16} />Ler com a câmera</button> : <button onClick={pararScanner} style={btn('#DC2626')}><X size={16} />Parar câmera</button>}
        <span style={{ fontSize: 12, color: '#9ca3af' }}>ou digite:</span>
        <input style={{ ...inp, width: 190 }} placeholder="Código do produto" value={codigo} onChange={e => setCodigo(e.target.value)} onKeyDown={e => e.key === 'Enter' && consultar(codigo)} />
        <button onClick={() => consultar(codigo)} style={{ ...btn('#e5e7eb'), color: '#374151' }}><ScanLine size={15} />Consultar</button>
      </div>
      <div id="leitor-ent" style={{ width: '100%', maxWidth: 340, margin: scanning ? '8px 0' : 0 }} />

      {info && <div style={{ marginTop: 10, padding: 14, borderRadius: 12, border: '1px solid #e5e7eb', background: '#f9fafb' }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>{info.produto_nome}</div>
        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>{info.categoria || '—'} · {info.unidade || 'un'} · estoque atual <b>{info.estoque_atual}</b>{info.local ? ` · ${info.local}` : ''}{info.ultima_compra ? ` · última compra ${new Date(info.ultima_compra.data).toLocaleDateString('pt-BR')}` : ''}</div>
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px,1fr))', gap: 8 }}>
          <div><label style={{ fontSize: 11, color: '#9ca3af' }}>Qtd recebida (itens)</label><input style={inp} type="number" min={1} value={form.qtd} onChange={e => setForm({ ...form, qtd: e.target.value })} /></div>
          <div><label style={{ fontSize: 11, color: '#9ca3af' }}>Qtd por item</label><input style={inp} type="number" step="0.01" value={form.qtd_item} onChange={e => setForm({ ...form, qtd_item: e.target.value })} /></div>
          <div><label style={{ fontSize: 11, color: '#9ca3af' }}>Lote</label><input style={inp} value={form.lote} onChange={e => setForm({ ...form, lote: e.target.value })} /></div>
          <div><label style={{ fontSize: 11, color: '#9ca3af' }}>Validade</label><input style={inp} type="date" value={form.validade} onChange={e => setForm({ ...form, validade: e.target.value })} /></div>
          <div><label style={{ fontSize: 11, color: '#9ca3af' }}>Fornecedor</label><input style={inp} value={form.fornecedor} onChange={e => setForm({ ...form, fornecedor: e.target.value })} /></div>
          <div><label style={{ fontSize: 11, color: '#9ca3af' }}>Nota fiscal</label><input style={inp} value={form.nota} onChange={e => setForm({ ...form, nota: e.target.value })} /></div>
          <div><label style={{ fontSize: 11, color: '#9ca3af' }}>Localização</label><input style={inp} value={form.local} onChange={e => setForm({ ...form, local: e.target.value })} /></div>
          <div><label style={{ fontSize: 11, color: '#9ca3af' }}>Observação</label><input style={inp} value={form.obs} onChange={e => setForm({ ...form, obs: e.target.value })} /></div>
        </div>
        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>Quem recebeu: <b>{user?.name || '—'}</b> · {new Date().toLocaleString('pt-BR')}</div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {novosCodigos.length > 0 && <button onClick={imprimirNovas} style={{ ...btn('#6B1212') }}><Printer size={16} />Imprimir {novosCodigos.length} etiqueta(s)</button>}
          <button onClick={salvar} disabled={busy} style={btn('#166534')}><Check size={16} />{busy ? 'Salvando…' : 'Salvar entrada'}</button>
        </div>
      </div>}
    </div>
  )
}

// ─────────────────────────────────────────── Consulta por leitura
function TabConsulta({ toast }: any) {
  const [codigo, setCodigo] = useState('')
  const [info, setInfo] = useState<any | null>(null)
  const [rastro, setRastro] = useState<any | null>(null)
  const [scanning, setScanning] = useState(false)
  const scannerRef = useRef<any>(null)

  const consultar = async (cod: string) => {
    const c = (cod || '').trim(); if (!c) return
    const { data, error } = await sb.rpc('produto_consulta', { p_codigo: c })
    if (error || !data?.ok) { toast(data?.erro || 'Etiqueta não encontrada.', 'error'); setInfo(null); setRastro(null); return }
    setInfo(data); setCodigo(c)
    if (data.produto_id) { const { data: r } = await sb.rpc('produto_rastreabilidade', { p_produto_id: data.produto_id }); setRastro(r || null) } else setRastro(null)
  }
  const pararScanner = useCallback(async () => { if (scannerRef.current) { try { await scannerRef.current.stop(); await scannerRef.current.clear() } catch {} scannerRef.current = null } setScanning(false) }, [])
  const iniciarScanner = async () => {
    setScanning(true); setInfo(null)
    try { const h = new Html5Qrcode('leitor-cons'); scannerRef.current = h; await h.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 230, height: 230 } }, async (txt: string) => { await pararScanner(); consultar(txt) }, () => {}) }
    catch (e: any) { toast('Não foi possível abrir a câmera: ' + (e?.message || ''), 'error'); setScanning(false) }
  }
  useEffect(() => () => { pararScanner() }, [pararScanner])

  const critico = info && info.estoque_atual <= info.estoque_minimo && info.estoque_minimo > 0
  const KPI = (l: string, v: any, c = '#241b19') => <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '8px 12px' }}><div style={{ fontSize: 11, color: '#9ca3af' }}>{l}</div><div style={{ fontSize: 18, fontWeight: 800, color: c }}>{v}</div></div>

  return (
    <div style={card}>
      <b style={{ fontSize: 14 }}>Consulta por leitura</b>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '8px 0' }}>
        {!scanning ? <button onClick={iniciarScanner} style={btn('#1D4ED8')}><Camera size={16} />Ler com a câmera</button> : <button onClick={pararScanner} style={btn('#DC2626')}><X size={16} />Parar câmera</button>}
        <span style={{ fontSize: 12, color: '#9ca3af' }}>ou digite:</span>
        <input style={{ ...inp, width: 190 }} placeholder="Código" value={codigo} onChange={e => setCodigo(e.target.value)} onKeyDown={e => e.key === 'Enter' && consultar(codigo)} />
        <button onClick={() => consultar(codigo)} style={{ ...btn('#e5e7eb'), color: '#374151' }}><ScanLine size={15} />Consultar</button>
      </div>
      <div id="leitor-cons" style={{ width: '100%', maxWidth: 340, margin: scanning ? '8px 0' : 0 }} />

      {info && <div style={{ marginTop: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{info.produto_nome}</div>
            <div style={{ fontSize: 12.5, color: '#6b7280' }}>{info.categoria || '—'} · cód. {info.codigo_interno || '—'} · {info.unidade || 'un'}{info.status_cadastro === 'pendente_validacao' ? ' · ⚠️ pendente de validação' : ''}</div>
          </div>
          {critico && <span style={{ fontSize: 12, fontWeight: 700, color: '#DC2626', background: '#FEE2E2', padding: '.3rem .7rem', borderRadius: 20 }}>Abaixo do mínimo</span>}
        </div>
        {info.manipulado && (() => { const cv = corValidade(info); return (
          <div style={{ marginTop: 10, border: `1px solid ${cv.cor}`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ background: cv.cor, color: '#fff', fontSize: 12, fontWeight: 800, padding: '5px 10px' }}>{cv.emoji} PRODUTO MANIPULADO · {cv.label.toUpperCase()}{info.categoria_conservacao ? ' · ' + String(info.categoria_conservacao).replace(/_/g, ' ').toUpperCase() : ''}</div>
            <div style={{ padding: '8px 10px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 6, fontSize: 12.5 }}>
              <div><span style={{ color: '#9ca3af' }}>Manipulado em:</span> <b>{info.data_manipulacao ? new Date(info.data_manipulacao).toLocaleString('pt-BR') : '—'}</b></div>
              <div><span style={{ color: '#9ca3af' }}>Validade:</span> <b style={{ color: cv.cor }}>{fmtD(info.validade)}</b></div>
              {info.validade_original && <div><span style={{ color: '#9ca3af' }}>Val. original:</span> <b>{fmtD(info.validade_original)}</b></div>}
              <div><span style={{ color: '#9ca3af' }}>Responsável:</span> <b>{info.responsavel_manip || '—'}</b></div>
              {info.conferente_manip && <div><span style={{ color: '#9ca3af' }}>Conferente:</span> <b>{info.conferente_manip}</b></div>}
              {info.sif && <div><span style={{ color: '#9ca3af' }}>SIF/SIE/SIM:</span> <b>{info.sif}</b></div>}
              {info.op_numero && <div><span style={{ color: '#9ca3af' }}>Ordem Produção:</span> <b>{info.op_numero}</b></div>}
            </div>
          </div>) })()}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px,1fr))', gap: 8, marginTop: 12 }}>
          {KPI('Estoque atual', info.estoque_atual, critico ? '#DC2626' : '#1D9E75')}
          {KPI('Mínimo', info.estoque_minimo)}
          {KPI('Itens disp.', info.itens_disponiveis)}
          {KPI('Preço un.', 'R$ ' + Number(info.preco_unitario || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 8, marginTop: 8, fontSize: 12.5 }}>
          <div style={{ background: '#f9fafb', borderRadius: 8, padding: '8px 12px' }}><span style={{ color: '#9ca3af' }}>Localização:</span> <b>{info.local || '—'}</b></div>
          <div style={{ background: '#f9fafb', borderRadius: 8, padding: '8px 12px' }}><span style={{ color: '#9ca3af' }}>Validade:</span> <b>{fmtD(info.validade)}</b></div>
          <div style={{ background: '#f9fafb', borderRadius: 8, padding: '8px 12px' }}><span style={{ color: '#9ca3af' }}>Lote:</span> <b>{info.lote || '—'}</b></div>
          <div style={{ background: '#f9fafb', borderRadius: 8, padding: '8px 12px' }}><span style={{ color: '#9ca3af' }}>Fornecedor:</span> <b>{info.fornecedor || '—'}</b></div>
          {info.ultima_compra && <div style={{ background: '#f9fafb', borderRadius: 8, padding: '8px 12px' }}><span style={{ color: '#9ca3af' }}>Última compra:</span> <b>{new Date(info.ultima_compra.data).toLocaleDateString('pt-BR')}</b> ({info.ultima_compra.qtd})</div>}
        </div>
        <div style={{ marginTop: 12 }}>
          <b style={{ fontSize: 13 }}>Últimas movimentações</b>
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {(info.movimentacoes || []).length === 0 ? <div style={{ fontSize: 12.5, color: '#9ca3af' }}>Sem movimentações.</div> :
              info.movimentacoes.map((m: any, i: number) => { const t = TIPO_MOV[m.tipo] || { l: m.tipo, c: '#6b7280' }; return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, background: '#f9fafb', padding: '.4rem .7rem', borderRadius: 8 }}>
                  <span style={{ fontWeight: 700, color: t.c, minWidth: 84 }}>{t.l}</span>
                  <span style={{ flex: 1 }}>{m.qtd} {m.unidade}{m.motivo ? ` · ${m.motivo}` : ''}{m.quem ? ` · ${m.quem}` : ''}</span>
                  <span style={{ color: '#9ca3af', fontSize: 11.5 }}>{new Date(m.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                </div>) })}
          </div>
        </div>
        {rastro && ((rastro.veio_de || []).length > 0 || (rastro.gerou || []).length > 0) && <div style={{ marginTop: 12, background: '#F5F3FF', border: '1px solid #ddd6fe', borderRadius: 10, padding: 12 }}>
          <b style={{ fontSize: 13, color: '#6D28D9' }}>🔗 Rastreabilidade (beneficiamento)</b>
          {(rastro.veio_de || []).map((v: any, i: number) => (
            <div key={'v' + i} style={{ fontSize: 12.5, marginTop: 6 }}>↖ <b>Veio de</b> beneficiamento nº {v.numero}: <b>{v.origem}</b> → este produto ({v.tipo}, {v.qtd} {v.unidade}, custo R$ {Number(v.custo_kg).toFixed(2)}/{v.unidade}) · rend. {v.rendimento}% · {v.colaborador} · {new Date(v.data).toLocaleDateString('pt-BR')}</div>
          ))}
          {(rastro.gerou || []).map((g: any, i: number) => (
            <div key={'g' + i} style={{ fontSize: 12.5, marginTop: 6 }}>↘ <b>Gerou</b> na conversão nº {g.numero} ({new Date(g.data).toLocaleDateString('pt-BR')}) · rend. {g.rendimento}% · perda {g.perda}%: {(g.saidas || []).map((s: any) => `${s.produto} (${s.tipo} ${s.qtd}${s.unidade})`).join(' · ')}</div>
          ))}
        </div>}
      </div>}
    </div>
  )
}

// ─────────────────────────────────────────── Histórico consolidado
const TIPO_MOV: Record<string, { l: string; c: string }> = {
  entrada: { l: 'Entrada', c: '#166534' }, saida: { l: 'Saída', c: '#B91C1C' }, perda: { l: 'Perda', c: '#DC2626' },
  transferencia: { l: 'Transferência', c: '#7C3AED' }, estorno: { l: 'Estorno', c: '#B45309' }, ajuste: { l: 'Ajuste', c: '#6b7280' }, beneficiamento: { l: 'Beneficiam.', c: '#6D28D9' },
}
function TabHistorico({ loja }: any) {
  const hoje = new Date().toISOString().slice(0, 10)
  const mesAtras = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)
  const [ini, setIni] = useState(mesAtras)
  const [fim, setFim] = useState(hoje)
  const [tipo, setTipo] = useState('')
  const [busca, setBusca] = useState('')
  const [movs, setMovs] = useState<any[]>([])
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setBusy(true)
    let query = sb.from('estoque_movimentacoes').select('*').eq('loja', loja)
      .gte('created_at', ini + 'T00:00:00').lte('created_at', fim + 'T23:59:59').order('created_at', { ascending: false }).limit(500)
    if (tipo) query = query.eq('tipo', tipo)
    const { data } = await query
    setMovs(data || []); setBusy(false)
  }, [loja, ini, fim, tipo])
  useEffect(() => { load() }, [load])

  const filtrados = movs.filter(m => !busca || (m.produto_nome || '').toLowerCase().includes(busca.toLowerCase()) || (m.created_by || '').toLowerCase().includes(busca.toLowerCase()))

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <b style={{ fontSize: 14 }}>Histórico de movimentações ({filtrados.length})</b>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="date" style={{ ...inp, width: 'auto' }} value={ini} onChange={e => setIni(e.target.value)} />
          <span style={{ color: '#9ca3af' }}>até</span>
          <input type="date" style={{ ...inp, width: 'auto' }} value={fim} onChange={e => setFim(e.target.value)} />
          <select style={{ ...inp, width: 'auto' }} value={tipo} onChange={e => setTipo(e.target.value)}><option value="">Todos os tipos</option>{Object.entries(TIPO_MOV).map(([v, o]) => <option key={v} value={v}>{o.l}</option>)}</select>
          <input style={{ ...inp, width: 140 }} placeholder="Buscar produto/pessoa" value={busca} onChange={e => setBusca(e.target.value)} />
          <button onClick={() => baixarCSV(`historico_${loja}_${ini}_a_${fim}.csv`, ['Data', 'Tipo', 'Produto', 'Qtd', 'Unid', 'Setor', 'Destino', 'Responsável', 'Motivo', 'Código'], filtrados.map(m => [new Date(m.created_at).toLocaleString('pt-BR'), TIPO_MOV[m.tipo]?.l || m.tipo, m.produto_nome, m.quantidade, m.unidade, m.setor || '', m.unidade_destino || '', m.created_by || '', m.motivo || '', m.lote_codigo || '']))} style={{ ...btn('#e5e7eb'), color: '#374151', padding: '.5rem .8rem', fontSize: 12 }}>⬇ CSV</button>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 760 }}>
          <thead><tr style={{ textAlign: 'left', color: '#9ca3af', fontSize: 11, textTransform: 'uppercase' }}>
            <th style={{ padding: 6 }}>Data</th><th>Tipo</th><th>Produto</th><th>Qtd</th><th>Setor/Destino</th><th>Responsável</th><th>Motivo</th>
          </tr></thead>
          <tbody>
            {busy ? <tr><td colSpan={7} style={{ padding: 16, color: '#9ca3af', textAlign: 'center' }}>Carregando…</td></tr> :
              filtrados.length === 0 ? <tr><td colSpan={7} style={{ padding: 16, color: '#9ca3af', textAlign: 'center' }}>Sem movimentações no período.</td></tr> :
                filtrados.map(m => { const t = TIPO_MOV[m.tipo] || { l: m.tipo, c: '#6b7280' }; return (
                  <tr key={m.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                    <td style={{ whiteSpace: 'nowrap', color: '#6b7280' }}>{new Date(m.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                    <td><span style={{ fontSize: 11, fontWeight: 700, color: t.c }}>{t.l}</span></td>
                    <td style={{ fontWeight: 600 }}>{m.produto_nome}</td>
                    <td>{m.quantidade} {m.unidade}</td>
                    <td>{m.setor || m.unidade_destino || '—'}</td>
                    <td>{m.created_by || '—'}</td>
                    <td style={{ color: '#6b7280', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.motivo || '—'}</td>
                  </tr>) })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
