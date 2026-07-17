import { useState, useEffect, useCallback, useRef } from 'react'
import { QrCode, Printer, Camera, ScanLine, PackageMinus, RefreshCw, Plus, AlertTriangle, Check, X, Tag, Trash2, Undo2, ArrowRightLeft, ClipboardList, BarChart3, Clock } from 'lucide-react'
import QRCode from 'qrcode'
import JsBarcode from 'jsbarcode'
import { Html5Qrcode } from 'html5-qrcode'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../hooks/useToast'
import { useAuth } from '../../contexts/AuthContext'

const sb = supabase as any
const LOJAS = ['Amore Paiva', 'Amore CD']
const SETORES = ['Cozinha', 'Salão', 'Bar', 'Confeitaria', 'Estoque', 'Limpeza', 'Administrativo']
const MOTIVOS = [['consumo', 'Consumo (retirada)'], ['consumo_interno', 'Consumo interno'], ['perda', 'Perda'], ['avaria', 'Avaria'], ['vencido', 'Vencido']]
const UNIDADES = ['un', 'kg', 'g', 'L', 'ml', 'cx', 'pct', 'dz']
const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '1.1rem 1.3rem', marginBottom: 14 }
const inp: React.CSSProperties = { padding: '.5rem .7rem', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, width: '100%' }
const btn = (bg: string): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '.55rem 1rem', borderRadius: 10, border: 'none', background: bg, color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 })
const fmtD = (d: any) => d ? new Date(d + 'T00:00').toLocaleDateString('pt-BR') : '—'

async function qrDataURL(text: string) { try { return await QRCode.toDataURL(text, { margin: 1, width: 180 }) } catch { return '' } }
function barcodeDataURL(text: string) {
  try { const c = document.createElement('canvas'); JsBarcode(c, text, { format: 'CODE128', width: 1.5, height: 40, fontSize: 12, margin: 4 }); return c.toDataURL('image/png') } catch { return '' }
}

// imprime UMA etiqueta por item (cada item = 1 etiqueta)
async function imprimirItens(itens: any[], loja: string) {
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
    .et{width:58mm;border:1px solid #333;border-radius:2mm;padding:2.5mm;page-break-inside:avoid;display:flex;flex-direction:column;gap:1mm}
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

export default function EtiquetasPage() {
  const { toast } = useToast()
  const { user } = useAuth()
  const [tab, setTab] = useState<'etiquetas' | 'leitura' | 'transferencia' | 'inventario' | 'relatorios'>('etiquetas')
  const [loja, setLoja] = useState('Amore Paiva')
  return (
    <div style={{ padding: '1rem 0' }}>
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}><Tag size={20} style={{ color: '#6B1212' }} /><b style={{ fontSize: 15 }}>Etiquetas & Leitura de Estoque</b></div>
        <p style={{ fontSize: 12.5, color: '#9ca3af', margin: '0 0 12px' }}>Uma etiqueta por item: cada unidade recebe seu próprio QR Code. Leia a etiqueta pela câmera e o item sai do estoque automaticamente — com saldo, validade e PEPS/FIFO.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select value={loja} onChange={e => setLoja(e.target.value)} style={{ ...inp, width: 'auto' }}>{LOJAS.map(l => <option key={l}>{l}</option>)}</select>
          <button onClick={() => setTab('etiquetas')} style={{ ...btn(tab === 'etiquetas' ? '#6B1212' : '#e5e7eb'), color: tab === 'etiquetas' ? '#fff' : '#374151' }}><QrCode size={15} />Etiquetas por item</button>
          <button onClick={() => setTab('leitura')} style={{ ...btn(tab === 'leitura' ? '#6B1212' : '#e5e7eb'), color: tab === 'leitura' ? '#fff' : '#374151' }}><ScanLine size={15} />Leitura & Baixa</button>
          <button onClick={() => setTab('transferencia')} style={{ ...btn(tab === 'transferencia' ? '#6B1212' : '#e5e7eb'), color: tab === 'transferencia' ? '#fff' : '#374151' }}><ArrowRightLeft size={15} />Transferência</button>
          <button onClick={() => setTab('inventario')} style={{ ...btn(tab === 'inventario' ? '#6B1212' : '#e5e7eb'), color: tab === 'inventario' ? '#fff' : '#374151' }}><ClipboardList size={15} />Inventário</button>
          <button onClick={() => setTab('relatorios')} style={{ ...btn(tab === 'relatorios' ? '#6B1212' : '#e5e7eb'), color: tab === 'relatorios' ? '#fff' : '#374151' }}><BarChart3 size={15} />Relatórios</button>
        </div>
      </div>
      {tab === 'etiquetas' ? <TabEtiquetas loja={loja} toast={toast} user={user} />
        : tab === 'leitura' ? <TabLeitura loja={loja} toast={toast} user={user} />
        : tab === 'transferencia' ? <TabTransferencia loja={loja} toast={toast} user={user} />
        : tab === 'inventario' ? <TabInventario loja={loja} toast={toast} user={user} />
        : <TabRelatorios loja={loja} toast={toast} />}
    </div>
  )
}

// ─────────────────────────────────────────── Etiquetas por item
function TabEtiquetas({ loja, toast, user }: any) {
  const [itens, setItens] = useState<any[]>([])
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [busca, setBusca] = useState('')
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
        <button disabled={!sel.size} onClick={() => imprimirItens(selecionados, loja)} style={{ ...btn(sel.size ? '#6B1212' : '#c4b5a8'), cursor: sel.size ? 'pointer' : 'not-allowed' }}><Printer size={15} />Imprimir {sel.size ? `(${sel.size})` : ''}</button>
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
                  <td style={{ fontWeight: 600 }}>{l.produto_nome}</td>
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
  const [motivo, setMotivo] = useState('consumo')
  const [scanning, setScanning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [recentes, setRecentes] = useState<any[]>([])
  const scannerRef = useRef<any>(null)

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
        async (txt: string) => { await pararScanner(); consultar(txt) }, () => {})
    } catch (e: any) { toast('Não foi possível abrir a câmera: ' + (e?.message || ''), 'error'); setScanning(false) }
  }
  useEffect(() => () => { pararScanner() }, [pararScanner])

  const darBaixa = async () => {
    if (!info) return
    setBusy(true)
    let resp
    if (info.tipo === 'item') {
      resp = await sb.rpc('item_saida', { p_codigo: info.codigo, p_tipo: motivo, p_motivo: null, p_setor: setor, p_colaborador: colaborador || user?.name || 'Leitura' })
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

  const isItem = info?.tipo === 'item'
  const jaSaiu = info && info.status && info.status !== 'disponivel'

  return (
    <>
      <div style={card}>
        <b style={{ fontSize: 14 }}>Leitura da etiqueta</b>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '10px 0' }}>
          {!scanning ? <button onClick={iniciarScanner} style={btn('#6B1212')}><Camera size={16} />Ler com a câmera</button>
            : <button onClick={pararScanner} style={btn('#DC2626')}><X size={16} />Parar câmera</button>}
          <span style={{ fontSize: 12, color: '#9ca3af' }}>ou digite o código:</span>
          <input style={{ ...inp, width: 200 }} placeholder="Código da etiqueta" value={codigo} onChange={e => setCodigo(e.target.value)} onKeyDown={e => e.key === 'Enter' && consultar(codigo)} />
          <button onClick={() => consultar(codigo)} style={{ ...btn('#e5e7eb'), color: '#374151' }}><ScanLine size={15} />Consultar</button>
        </div>
        <div id="leitor-cam" style={{ width: '100%', maxWidth: 340, margin: scanning ? '8px 0' : 0 }} />

        {info && <div style={{ marginTop: 10, padding: 14, borderRadius: 12, border: '1px solid ' + (jaSaiu ? '#FCA5A5' : '#e5e7eb'), background: jaSaiu ? '#FEF2F2' : '#f9fafb' }}>
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
              <div><label style={{ fontSize: 11, color: '#9ca3af' }}>Colaborador</label><input style={inp} value={colaborador} onChange={e => setColaborador(e.target.value)} /></div>
            </div>
            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={darBaixa} disabled={busy} style={btn(['perda', 'avaria', 'vencido'].includes(motivo) && isItem ? '#DC2626' : '#1D9E75')}><PackageMinus size={16} />{busy ? 'Registrando…' : !isItem ? 'Confirmar baixa' : ['perda', 'avaria', 'vencido'].includes(motivo) ? `Registrar ${motivo}` : 'Retirar este item'}</button>
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
function TabRelatorios({ loja, toast }: any) {
  const hoje = new Date().toISOString().slice(0, 10)
  const mesAtras = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)
  const [vencendo, setVencendo] = useState<any[]>([])
  const [dias, setDias] = useState(7)
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
            <select value={dias} onChange={e => setDias(Number(e.target.value))} style={{ ...inp, width: 'auto', display: 'inline-block' }}>{[3, 7, 15, 30].map(d => <option key={d} value={d}>{d} dias</option>)}</select>
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
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            {[['produto', 'Por produto'], ['setor', 'Por setor'], ['colaborador', 'Por colaborador']].map(([v, l]) => (
              <button key={v} onClick={() => setAba(v as any)} style={{ ...btn(aba === v ? '#6B1212' : '#e5e7eb'), color: aba === v ? '#fff' : '#374151', padding: '.4rem .8rem', fontSize: 12 }}>{l}</button>
            ))}
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
