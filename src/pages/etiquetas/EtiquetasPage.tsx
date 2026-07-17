import { useState, useEffect, useCallback, useRef } from 'react'
import { QrCode, Printer, Camera, ScanLine, PackageMinus, RefreshCw, Plus, AlertTriangle, Check, X, Tag } from 'lucide-react'
import QRCode from 'qrcode'
import JsBarcode from 'jsbarcode'
import { Html5Qrcode } from 'html5-qrcode'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../hooks/useToast'
import { useAuth } from '../../contexts/AuthContext'

const sb = supabase as any
const LOJAS = ['Amore Paiva', 'Amore CD']
const SETORES = ['Cozinha', 'Salão', 'Bar', 'Confeitaria', 'Estoque', 'Limpeza', 'Administrativo']
const UNIDADES = ['un', 'kg', 'g', 'L', 'ml', 'cx', 'pct', 'dz']
const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '1.1rem 1.3rem', marginBottom: 14 }
const inp: React.CSSProperties = { padding: '.5rem .7rem', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, width: '100%' }
const btn = (bg: string): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '.55rem 1rem', borderRadius: 10, border: 'none', background: bg, color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 })
const fmtD = (d: any) => d ? new Date(d + 'T00:00').toLocaleDateString('pt-BR') : '—'

// gera <img> QR (dataURL) e código de barras (canvas dataURL)
async function qrDataURL(text: string) { try { return await QRCode.toDataURL(text, { margin: 1, width: 180 }) } catch { return '' } }
function barcodeDataURL(text: string) {
  try { const c = document.createElement('canvas'); JsBarcode(c, text, { format: 'CODE128', width: 1.6, height: 42, fontSize: 13, margin: 4 }); return c.toDataURL('image/png') } catch { return '' }
}

async function imprimirEtiquetas(lotes: any[], copiasPorLote: number, loja: string) {
  const blocos: string[] = []
  for (const l of lotes) {
    const qr = await qrDataURL(l.codigo)
    const bc = barcodeDataURL(l.codigo)
    for (let i = 0; i < copiasPorLote; i++) {
      blocos.push(`
      <div class="et">
        <div class="et-top"><div class="et-nome">${(l.produto_nome || '').toUpperCase()}</div><div class="et-cod">${l.codigo_interno || l.codigo}</div></div>
        <div class="et-mid">
          <img class="qr" src="${qr}" alt="qr"/>
          <div class="et-info">
            <div><b>Un.:</b> ${l.unidade || '—'} &nbsp; <b>Qtd:</b> ${l.quantidade_inicial ?? '—'}</div>
            <div><b>Entrada:</b> ${fmtD(l.data_entrada)}</div>
            <div><b>Validade:</b> ${fmtD(l.data_validade)}</div>
            <div><b>Lote:</b> ${l.numero_lote || '—'}</div>
            <div><b>Forn.:</b> ${(l.fornecedor || '—').slice(0, 22)}</div>
            <div><b>Local:</b> ${l.local_armazenamento || '—'}</div>
          </div>
        </div>
        <img class="bc" src="${bc}" alt="barcode"/>
        <div class="et-foot">${loja} · ${l.codigo}</div>
      </div>`)
    }
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
    @media print{ .noprint{display:none} }
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
  const [tab, setTab] = useState<'etiquetas' | 'leitura'>('etiquetas')
  const [loja, setLoja] = useState('Amore Paiva')
  return (
    <div style={{ padding: '1rem 0' }}>
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}><Tag size={20} style={{ color: '#6B1212' }} /><b style={{ fontSize: 15 }}>Etiquetas & Leitura de Estoque</b></div>
        <p style={{ fontSize: 12.5, color: '#9ca3af', margin: '0 0 12px' }}>Gere etiquetas com QR Code e código de barras por lote, e dê baixa lendo a etiqueta pela câmera do celular — com controle de saldo, validade e PEPS/FIFO.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select value={loja} onChange={e => setLoja(e.target.value)} style={{ ...inp, width: 'auto' }}>{LOJAS.map(l => <option key={l}>{l}</option>)}</select>
          <button onClick={() => setTab('etiquetas')} style={{ ...btn(tab === 'etiquetas' ? '#6B1212' : '#e5e7eb'), color: tab === 'etiquetas' ? '#fff' : '#374151' }}><QrCode size={15} />Etiquetas</button>
          <button onClick={() => setTab('leitura')} style={{ ...btn(tab === 'leitura' ? '#6B1212' : '#e5e7eb'), color: tab === 'leitura' ? '#fff' : '#374151' }}><ScanLine size={15} />Leitura & Baixa</button>
        </div>
      </div>
      {tab === 'etiquetas' ? <TabEtiquetas loja={loja} toast={toast} user={user} /> : <TabLeitura loja={loja} toast={toast} user={user} />}
    </div>
  )
}

// ─────────────────────────────────────────── Etiquetas
function TabEtiquetas({ loja, toast, user }: any) {
  const [lotes, setLotes] = useState<any[]>([])
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [copias, setCopias] = useState(1)
  const [busca, setBusca] = useState('')
  const [novo, setNovo] = useState(false)
  const [prods, setProds] = useState<any[]>([])
  const [form, setForm] = useState<any>({ produto_id: '', quantidade: '', unidade: 'un', data_validade: '', numero_lote: '', local_armazenamento: '' })

  const load = useCallback(async () => {
    const { data } = await sb.from('estoque_lotes').select('*').eq('loja', loja).eq('status', 'ativo').order('created_at', { ascending: false }).limit(300)
    setLotes(data || [])
  }, [loja])
  useEffect(() => { load(); setSel(new Set()) }, [load])
  useEffect(() => { sb.from('estoque_produtos').select('id,nome,gramatura').eq('loja', loja).eq('ativo', true).order('nome').then(({ data }: any) => setProds(data || [])) }, [loja])

  const filtrados = lotes.filter(l => !busca || (l.produto_nome || '').toLowerCase().includes(busca.toLowerCase()) || (l.codigo || '').toLowerCase().includes(busca.toLowerCase()))
  const toggle = (id: string) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const selecionados = lotes.filter(l => sel.has(l.id))

  const criarLote = async () => {
    if (!form.produto_id || !form.quantidade) { toast('Escolha o produto e a quantidade.', 'error'); return }
    const p = prods.find(x => x.id === form.produto_id)
    const { data, error } = await sb.rpc('lote_criar', {
      p_loja: loja, p_produto_id: form.produto_id, p_produto_nome: p?.nome || 'Produto', p_qtd: Number(form.quantidade),
      p_unidade: form.unidade, p_validade: form.data_validade || null, p_numero_lote: form.numero_lote || null,
      p_fornecedor: null, p_local: form.local_armazenamento || null, p_origem: 'manual', p_recebimento_id: null, p_por: user?.name || null,
    })
    if (error || !data?.ok) { toast('Erro ao criar lote.', 'error'); return }
    toast(`Lote ${data.codigo} criado! 🏷️`); setNovo(false); setForm({ produto_id: '', quantidade: '', unidade: 'un', data_validade: '', numero_lote: '', local_armazenamento: '' }); load()
  }

  return (
    <>
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <b style={{ fontSize: 14 }}>Lotes / etiquetas ({filtrados.length})</b>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input style={{ ...inp, width: 180 }} placeholder="Buscar produto/código…" value={busca} onChange={e => setBusca(e.target.value)} />
            <button onClick={() => setNovo(v => !v)} style={btn('#7C3AED')}><Plus size={15} />Nova etiqueta</button>
            <button onClick={load} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}><RefreshCw size={15} /></button>
          </div>
        </div>

        {novo && <div style={{ marginTop: 12, padding: 12, background: '#faf8f5', borderRadius: 10, border: '1px solid #ece4dd' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 8 }}>
            <div><label style={{ fontSize: 11, color: '#9ca3af' }}>Produto</label>
              <select style={inp} value={form.produto_id} onChange={e => setForm({ ...form, produto_id: e.target.value })}><option value="">Selecione…</option>{prods.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></div>
            <div><label style={{ fontSize: 11, color: '#9ca3af' }}>Quantidade</label><input style={inp} type="number" value={form.quantidade} onChange={e => setForm({ ...form, quantidade: e.target.value })} /></div>
            <div><label style={{ fontSize: 11, color: '#9ca3af' }}>Unidade</label><select style={inp} value={form.unidade} onChange={e => setForm({ ...form, unidade: e.target.value })}>{UNIDADES.map(u => <option key={u}>{u}</option>)}</select></div>
            <div><label style={{ fontSize: 11, color: '#9ca3af' }}>Validade</label><input style={inp} type="date" value={form.data_validade} onChange={e => setForm({ ...form, data_validade: e.target.value })} /></div>
            <div><label style={{ fontSize: 11, color: '#9ca3af' }}>Nº lote</label><input style={inp} value={form.numero_lote} onChange={e => setForm({ ...form, numero_lote: e.target.value })} /></div>
            <div><label style={{ fontSize: 11, color: '#9ca3af' }}>Local</label><input style={inp} value={form.local_armazenamento} onChange={e => setForm({ ...form, local_armazenamento: e.target.value })} placeholder="Câmara fria, prateleira…" /></div>
          </div>
          <div style={{ marginTop: 10, display: 'flex', gap: 8 }}><button onClick={criarLote} style={btn('#1D9E75')}><Check size={15} />Criar lote</button><button onClick={() => setNovo(false)} style={{ ...btn('#e5e7eb'), color: '#374151' }}>Cancelar</button></div>
        </div>}

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '14px 0 8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, color: '#374151' }}><b>{sel.size}</b> selecionado(s)</span>
          <label style={{ fontSize: 12.5, color: '#6b7280' }}>Cópias por etiqueta: <input type="number" min={1} value={copias} onChange={e => setCopias(Math.max(1, Number(e.target.value)))} style={{ ...inp, width: 64, display: 'inline-block' }} /></label>
          <button disabled={!sel.size} onClick={() => imprimirEtiquetas(selecionados, copias, loja)} style={{ ...btn(sel.size ? '#6B1212' : '#c4b5a8'), cursor: sel.size ? 'pointer' : 'not-allowed' }}><Printer size={15} />Imprimir {sel.size ? `(${sel.size * copias})` : ''}</button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 720 }}>
            <thead><tr style={{ textAlign: 'left', color: '#9ca3af', fontSize: 11, textTransform: 'uppercase' }}>
              <th style={{ padding: 6, width: 30 }}></th><th>Produto</th><th>Código</th><th>Saldo</th><th>Validade</th><th>Lote</th><th>Local</th>
            </tr></thead>
            <tbody>
              {filtrados.length === 0 ? <tr><td colSpan={7} style={{ padding: 18, color: '#9ca3af', textAlign: 'center' }}>Nenhum lote. Crie uma etiqueta ou faça um recebimento.</td></tr> :
                filtrados.map(l => { const venc = l.data_validade ? Math.ceil((new Date(l.data_validade).getTime() - Date.now()) / 864e5) : null; return (
                  <tr key={l.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                    <td><input type="checkbox" checked={sel.has(l.id)} onChange={() => toggle(l.id)} /></td>
                    <td style={{ fontWeight: 600 }}>{l.produto_nome}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 11.5 }}>{l.codigo}</td>
                    <td>{l.saldo} {l.unidade}</td>
                    <td style={{ color: venc != null && venc <= 7 ? '#DC2626' : '#374151', fontWeight: venc != null && venc <= 7 ? 700 : 400 }}>{fmtD(l.data_validade)}{venc != null && venc <= 7 ? ` (${venc}d)` : ''}</td>
                    <td>{l.numero_lote || '—'}</td>
                    <td>{l.local_armazenamento || '—'}</td>
                  </tr>) })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

// ─────────────────────────────────────────── Leitura & Baixa
function TabLeitura({ loja, toast, user }: any) {
  const [codigo, setCodigo] = useState('')
  const [info, setInfo] = useState<any | null>(null)
  const [qtd, setQtd] = useState('')
  const [setor, setSetor] = useState('Cozinha')
  const [colaborador, setColaborador] = useState('')
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
    const { data, error } = await sb.rpc('lote_consultar', { p_codigo: c })
    if (error || !data?.ok) { toast(data?.erro || 'Etiqueta não encontrada.', 'error'); setInfo(null); return }
    setInfo(data); setCodigo(c); setQtd('')
    if (!data.fifo_ok) toast('⚠️ Este não é o lote mais antigo (PEPS/FIFO). Prefira o de validade mais próxima.', 'error')
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
    if (!qtd || Number(qtd) <= 0) { toast('Informe a quantidade retirada.', 'error'); return }
    setBusy(true)
    const { data, error } = await sb.rpc('baixa_por_leitura', { p_codigo: info.codigo, p_qtd: Number(qtd), p_setor: setor, p_colaborador: colaborador || user?.name || 'Leitura', p_unidade_destino: info.unidade, p_motivo: 'Saída por leitura' })
    setBusy(false)
    if (error || !data?.ok) { toast(data?.erro || 'Erro ao dar baixa.', 'error'); return }
    toast(`Baixa de ${qtd} ${info.unidade} · ${data.produto_nome}. Saldo do lote: ${data.saldo_lote} ✅`)
    setInfo(null); setCodigo(''); setQtd(''); loadRecentes()
  }

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

        {info && <div style={{ marginTop: 10, padding: 14, borderRadius: 12, border: '1px solid #e5e7eb', background: '#f9fafb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800 }}>{info.produto_nome}</div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>Código {info.codigo} · Lote {info.numero_lote || '—'} · Local {info.local || '—'}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#1D9E75' }}>{info.saldo_lote} <span style={{ fontSize: 13, color: '#6b7280' }}>{info.unidade}</span></div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>saldo do lote · produto: {info.saldo_produto}</div>
            </div>
          </div>
          {info.data_validade && <div style={{ marginTop: 6, fontSize: 12.5, color: info.vence_em_dias != null && info.vence_em_dias <= 7 ? '#DC2626' : '#6b7280', fontWeight: info.vence_em_dias != null && info.vence_em_dias <= 7 ? 700 : 400 }}>Validade: {fmtD(info.data_validade)}{info.vence_em_dias != null ? ` — vence em ${info.vence_em_dias} dia(s)` : ''}</div>}
          {!info.fifo_ok && <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5, color: '#B45309', background: '#FEF3C7', padding: '.4rem .7rem', borderRadius: 8, fontWeight: 600 }}><AlertTriangle size={14} />Não é o lote mais antigo (FIFO). Sugerido: {info.fifo_sugerido_codigo} (val. {fmtD(info.fifo_sugerido_validade)})</div>}

          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))', gap: 8 }}>
            <div><label style={{ fontSize: 11, color: '#9ca3af' }}>Quantidade retirada</label><input style={inp} type="number" step="0.01" value={qtd} onChange={e => setQtd(e.target.value)} autoFocus /></div>
            <div><label style={{ fontSize: 11, color: '#9ca3af' }}>Setor de destino</label><input style={inp} list="setores" value={setor} onChange={e => setSetor(e.target.value)} /><datalist id="setores">{SETORES.map(s => <option key={s} value={s} />)}</datalist></div>
            <div><label style={{ fontSize: 11, color: '#9ca3af' }}>Colaborador</label><input style={inp} value={colaborador} onChange={e => setColaborador(e.target.value)} /></div>
          </div>
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={darBaixa} disabled={busy} style={btn('#1D9E75')}><PackageMinus size={16} />{busy ? 'Registrando…' : 'Confirmar baixa'}</button>
          </div>
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
