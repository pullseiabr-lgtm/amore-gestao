import { useState, useEffect, useCallback } from 'react'
import { PackageCheck, Upload, ScanLine, Check, AlertTriangle, RefreshCw, Trash2, Boxes } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../hooks/useToast'

const sb = supabase as any
const SB_URL = 'https://xdwnsqkzgopymufsuccr.supabase.co'
const fmt = (n: any) => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '1.1rem 1.3rem', marginBottom: 14 }
const LOJAS = ['Amore Paiva', 'Amore CD']
const UNIDADES = ['', 'kg', 'g', 'L', 'ml', 'un', 'cx', 'pct', 'dz']
const inp: React.CSSProperties = { padding: '.5rem .7rem', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, width: '100%' }

function precoUnit(it: any) {
  const q = Number(it.quantidade), u = (it.unidade || '').toLowerCase(), cont = Number(it.conteudo) || 1
  if (!q || !u) return null
  const f: any = { g: 0.001, ml: 0.001, kg: 1, l: 1, un: 1, dz: 12, cx: cont, pct: cont }
  const qb = q * (f[u] ?? 1); if (!qb) return null
  const base = ['kg', 'g'].includes(u) ? 'kg' : ['l', 'ml'].includes(u) ? 'L' : 'un'
  return { v: Number(it.valor_total || 0) / qb, base }
}

// normaliza p/ casar nomes (remove acentos, pontuação, minúsculo)
const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
// termos genéricos que NÃO devem, sozinhos, casar dois produtos diferentes
const STOP = new Set(['caixa', 'cx', 'pacote', 'pct', 'pote', 'saco', 'fardo', 'unidade', 'unidades', 'und', 'kg', 'quilograma', 'grama', 'litro', 'litros', ' litro', 'lata', 'garrafa', 'balde', 'com', 'sem', 'para', 'tipo', 'premium', 'gourmet', 'sache', 'sacher'])
const tok = (s: string) => norm(s).split(' ').filter(t => t.length > 2 && !STOP.has(t) && !/^\d+$/.test(t))
function matchProduto(nome: string, list: any[]) {
  const tokens = tok(nome); if (!tokens.length) return null
  let best: any = null, bestScore = 0
  for (const p of list) {
    const pn = ' ' + norm(p.nome) + ' '; let score = 0
    for (const t of tokens) if (pn.includes(' ' + t) || pn.includes(t + ' ')) score++
    if (score > bestScore) { bestScore = score; best = p }
  }
  // conservador: exige 2+ palavras significativas em comum p/ evitar casar produto errado
  return bestScore >= 2 ? best : null
}
// quantidade total (unidades) que entra no estoque = qtd × conteúdo
const qtdEstoque = (it: any) => (Number(it.quantidade) || 0) * (Number(it.conteudo) || 1)

export default function RecebimentoPage() {
  const { toast } = useToast()
  const [loja, setLoja] = useState('Amore Paiva')
  const [file, setFile] = useState<File | null>(null)
  const [anexo, setAnexo] = useState<{ url: string; nome: string } | null>(null)
  const [busy, setBusy] = useState('')
  const [cab, setCab] = useState<any | null>(null)
  const [itens, setItens] = useState<any[]>([])
  const [recs, setRecs] = useState<any[]>([])
  const [prodEstoque, setProdEstoque] = useState<any[]>([])
  const [estoqueRows, setEstoqueRows] = useState<any[]>([])
  const [darEntrada, setDarEntrada] = useState(true)

  const loadRecs = useCallback(async () => { const { data } = await sb.from('recebimentos').select('*').order('created_at', { ascending: false }).limit(20); setRecs(data || []) }, [])
  useEffect(() => { loadRecs() }, [loadRecs])

  const fetchProdutos = async (lj: string) => {
    const { data } = await sb.from('estoque_produtos').select('id,nome,gramatura,categoria,preco_unitario').eq('loja', lj).eq('ativo', true).order('nome')
    return data || []
  }
  useEffect(() => { fetchProdutos(loja).then(setProdEstoque) }, [loja])

  const enviarELer = async () => {
    if (!file) { toast('Selecione a foto/PDF da nota.', 'error'); return }
    setBusy('upload'); setCab(null); setItens([]); setEstoqueRows([])
    try {
      const ext = (file.name.split('.').pop() || 'pdf').toLowerCase()
      const path = `recebimentos/${crypto.randomUUID()}.${ext}`
      const { error: upErr } = await sb.storage.from('anexos').upload(path, file, { upsert: true, contentType: file.type })
      if (upErr) { toast('Erro ao enviar o arquivo: ' + upErr.message, 'error'); setBusy(''); return }
      const url = `${SB_URL}/storage/v1/object/public/anexos/${path}`
      setAnexo({ url, nome: file.name })
      setBusy('ocr')
      const resp = await fetch('/api/ocr-nota', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file_url: url, mime: file.type }) })
      const d = await resp.json()
      if (!resp.ok) { toast(d.error || 'Erro na leitura por IA.', 'error'); setBusy(''); return }
      const its = (d.itens || []).map((x: any) => ({ ...x, conteudo: x.conteudo || 1 }))
      setCab({ fornecedor: '', cnpj: '', numero_nota: '', serie: '', data_emissao: '', valor_total: '', forma_pagamento: '', ...(d.cabecalho || {}) })
      setItens(its)
      // monta entradas de estoque casando cada item com o catálogo da loja
      const prods = await fetchProdutos(loja); setProdEstoque(prods)
      setEstoqueRows(its.map((it: any) => {
        const m = matchProduto(it.produto, prods)
        const q = qtdEstoque(it)
        return { on: true, produto_id: m ? m.id : '', novo: !m, nome: m ? m.nome : it.produto, categoria: it.categoria || '', quantidade: q || '', unidade: m?.gramatura || it.unidade || 'un', preco: q > 0 ? Number(it.valor_total || 0) / q : 0 }
      }))
      toast(`IA leu ${d.total || 0} item(ns). Confira e confirme. 🔍`)
    } catch { toast('Falha ao processar a nota.', 'error') }
    setBusy('')
  }

  const upItem = (i: number, k: string, v: any) => setItens(a => a.map((x, idx) => idx === i ? { ...x, [k]: v } : x))
  const delItem = (i: number) => { setItens(a => a.filter((_, idx) => idx !== i)); setEstoqueRows(a => a.filter((_, idx) => idx !== i)) }
  const upEst = (i: number, patch: any) => setEstoqueRows(a => a.map((x, idx) => idx === i ? { ...x, ...patch } : x))
  const somaItens = itens.reduce((s, x) => s + Number(x.valor_total || 0), 0)
  const totalNota = Number(cab?.valor_total || 0)
  const divergencia = cab && totalNota > 0 && Math.abs(somaItens - totalNota) > 0.5
  const nEntradas = darEntrada ? estoqueRows.filter(r => r.on && Number(r.quantidade) > 0).length : 0

  const confirmar = async () => {
    if (!itens.length) { toast('Nenhum item para confirmar.', 'error'); return }
    setBusy('confirm')
    try {
      const p_estoque = darEntrada
        ? estoqueRows.filter(r => r.on && Number(r.quantidade) > 0).map(r => ({
            acao: r.novo ? 'novo' : 'existente', produto_id: r.novo ? null : (r.produto_id || null),
            nome: r.nome, categoria: r.categoria, quantidade: r.quantidade, unidade: r.unidade, preco_unitario: r.preco,
          }))
        : []
      const { data, error } = await sb.rpc('recebimento_confirmar', { p_loja: loja, p_header: cab, p_itens: itens, p_anexo_url: anexo?.url || null, p_arquivo: anexo?.nome || null, p_estoque })
      if (error || !data?.ok) { toast('Erro ao confirmar recebimento.', 'error'); setBusy(''); return }
      const est = data.estoque ? ` · ${data.estoque} produto(s) no estoque 📦` : ''
      toast(`Recebimento confirmado! Despesa nº ${data.prestacao} lançada · Curva ABC atualizada${est} ✅`)
      setFile(null); setAnexo(null); setCab(null); setItens([]); setEstoqueRows([]); loadRecs()
    } catch { toast('Falha ao confirmar.', 'error') }
    setBusy('')
  }

  return (
    <div style={{ padding: '1rem 0' }}>
      {/* passo 1 */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}><PackageCheck size={20} style={{ color: '#6B1212' }} /><b style={{ fontSize: 15 }}>Recebimento Inteligente de Mercadorias</b></div>
        <p style={{ fontSize: 12.5, color: '#9ca3af', margin: '0 0 12px' }}>Selecione a unidade, envie a foto/PDF da nota e a IA lê o fornecedor e os produtos. Você confere, dá entrada no estoque e confirma.</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={loja} onChange={e => setLoja(e.target.value)} style={{ ...inp, width: 'auto' }}>{LOJAS.map(l => <option key={l}>{l}</option>)}</select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '.5rem .9rem', borderRadius: 10, border: '1px dashed #c4b5a8', cursor: 'pointer', fontSize: 13, background: '#faf8f5' }}>
            <Upload size={15} />{file ? file.name.slice(0, 30) : 'Escolher nota (foto ou PDF)'}
            <input type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => setFile(e.target.files?.[0] || null)} />
          </label>
          <button onClick={enviarELer} disabled={!file || !!busy} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '.6rem 1.1rem', borderRadius: 10, border: 'none', background: '#7C3AED', color: '#fff', cursor: 'pointer', fontWeight: 600, opacity: (!file || busy) ? .6 : 1 }}>
            <ScanLine size={16} />{busy === 'upload' ? 'Enviando…' : busy === 'ocr' ? 'Lendo com IA…' : 'Enviar e ler com IA'}
          </button>
        </div>
      </div>

      {/* passo 2 — conferência */}
      {cab && <div style={card}>
        <b style={{ fontSize: 14 }}>🔍 Conferência — cabeçalho da nota</b>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: 8, marginTop: 10 }}>
          {[['fornecedor', 'Fornecedor'], ['cnpj', 'CNPJ'], ['numero_nota', 'Nº da nota'], ['serie', 'Série'], ['data_emissao', 'Data emissão'], ['valor_total', 'Valor total'], ['forma_pagamento', 'Forma pgto']].map(([k, l]) => (
            <div key={k}><label style={{ fontSize: 11, color: '#9ca3af' }}>{l}</label><input style={inp} value={cab[k] ?? ''} onChange={e => setCab({ ...cab, [k]: e.target.value })} /></div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '16px 0 8px' }}>
          <b style={{ fontSize: 14 }}>Itens da nota ({itens.length})</b>
          {divergencia && <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: '#B45309', background: '#FEF3C7', padding: '.3rem .7rem', borderRadius: 20, fontWeight: 600 }}><AlertTriangle size={14} />Soma dos itens ({fmt(somaItens)}) ≠ total da nota ({fmt(totalNota)})</span>}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 800 }}>
            <thead><tr style={{ textAlign: 'left', color: '#9ca3af', fontSize: 11, textTransform: 'uppercase' }}>
              <th style={{ padding: 6 }}>Produto</th><th>Qtd</th><th>Unid.</th><th>Cont.</th><th>Marca</th><th>Valor</th><th>Preço unit.</th><th>Conf.</th><th></th>
            </tr></thead>
            <tbody>
              {itens.map((it, i) => { const pu = precoUnit(it); const cf = it.confianca; return (
                <tr key={i} style={{ borderTop: '1px solid #f3f4f6' }}>
                  <td style={{ padding: 4, minWidth: 170 }}><input style={inp} value={it.produto || ''} onChange={e => upItem(i, 'produto', e.target.value)} /></td>
                  <td style={{ width: 60 }}><input style={inp} type="number" step="0.01" value={it.quantidade ?? ''} onChange={e => upItem(i, 'quantidade', e.target.value)} /></td>
                  <td style={{ width: 66 }}><select style={inp} value={it.unidade || ''} onChange={e => upItem(i, 'unidade', e.target.value)}>{UNIDADES.map(u => <option key={u} value={u}>{u || '—'}</option>)}</select></td>
                  <td style={{ width: 56 }}><input style={inp} type="number" value={it.conteudo ?? 1} onChange={e => upItem(i, 'conteudo', e.target.value)} disabled={!['cx', 'pct'].includes((it.unidade || '').toLowerCase())} /></td>
                  <td style={{ width: 90 }}><input style={inp} value={it.marca || ''} onChange={e => upItem(i, 'marca', e.target.value)} /></td>
                  <td style={{ width: 80 }}><input style={inp} type="number" step="0.01" value={it.valor_total ?? ''} onChange={e => upItem(i, 'valor_total', e.target.value)} /></td>
                  <td style={{ width: 90, fontWeight: 700, color: pu ? '#1D9E75' : '#9ca3af' }}>{pu ? 'R$ ' + pu.v.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + '/' + pu.base : '—'}</td>
                  <td style={{ width: 46 }}>{cf != null ? <span style={{ fontSize: 11, fontWeight: 700, color: cf >= 85 ? '#1D9E75' : cf >= 60 ? '#D97706' : '#DC2626' }}>{cf}%</span> : ''}</td>
                  <td><button onClick={() => delItem(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444' }}><Trash2 size={13} /></button></td>
                </tr>) })}
            </tbody>
          </table>
        </div>

        {/* entrada no estoque (Fase B) */}
        <div style={{ marginTop: 18, borderTop: '1px dashed #e5e7eb', paddingTop: 14 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 8 }}>
            <input type="checkbox" checked={darEntrada} onChange={e => setDarEntrada(e.target.checked)} />
            <Boxes size={16} style={{ color: '#6B1212' }} /><b style={{ fontSize: 14 }}>Dar entrada no estoque</b>
            {darEntrada && <span style={{ fontSize: 12, color: '#9ca3af' }}>— {nEntradas} produto(s) selecionado(s)</span>}
          </label>
          {darEntrada && <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 720 }}>
              <thead><tr style={{ textAlign: 'left', color: '#9ca3af', fontSize: 11, textTransform: 'uppercase' }}>
                <th style={{ padding: 6, width: 34 }}>✓</th><th>Item da nota</th><th>Produto no estoque</th><th>Qtd entrada</th><th>Unid.</th>
              </tr></thead>
              <tbody>
                {itens.map((it, i) => { const r = estoqueRows[i]; if (!r) return null; return (
                  <tr key={i} style={{ borderTop: '1px solid #f3f4f6', opacity: r.on ? 1 : .45 }}>
                    <td style={{ padding: 4 }}><input type="checkbox" checked={r.on} onChange={e => upEst(i, { on: e.target.checked })} /></td>
                    <td style={{ fontSize: 12, color: '#6b7280', maxWidth: 200 }}>{it.produto}</td>
                    <td style={{ minWidth: 240 }}>
                      <select style={inp} value={r.novo ? '__novo__' : (r.produto_id || '__novo__')} onChange={e => {
                        const v = e.target.value
                        if (v === '__novo__') upEst(i, { novo: true, produto_id: '', nome: it.produto, unidade: it.unidade || 'un' })
                        else { const p = prodEstoque.find(x => x.id === v); upEst(i, { novo: false, produto_id: v, nome: p?.nome || it.produto, unidade: p?.gramatura || r.unidade }) }
                      }}>
                        <option value="__novo__">➕ Criar novo: {(it.produto || '').slice(0, 40)}</option>
                        {prodEstoque.map(p => <option key={p.id} value={p.id}>{p.nome}{p.gramatura ? ` (${p.gramatura})` : ''}</option>)}
                      </select>
                    </td>
                    <td style={{ width: 90 }}><input style={inp} type="number" step="0.01" value={r.quantidade ?? ''} onChange={e => upEst(i, { quantidade: e.target.value })} /></td>
                    <td style={{ width: 90 }}><input style={inp} value={r.unidade || ''} onChange={e => upEst(i, { unidade: e.target.value })} /></td>
                  </tr>) })}
              </tbody>
            </table>
            <p style={{ fontSize: 11.5, color: '#9ca3af', margin: '8px 0 0' }}>A quantidade de entrada já vem calculada (qtd × conteúdo). Produtos novos entram no catálogo de estoque da unidade.</p>
          </div>}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
          <span style={{ fontSize: 12, color: '#9ca3af' }}>⚠️ Revise os itens — a IA pode errar. O total da nota vai 1x pra despesas; cada item alimenta a Curva ABC{darEntrada ? ' e o estoque' : ''}.</span>
          <button onClick={confirmar} disabled={!!busy} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '.7rem 1.6rem', borderRadius: 10, border: 'none', background: '#1D9E75', color: '#fff', cursor: 'pointer', fontWeight: 600 }}><Check size={16} />{busy === 'confirm' ? 'Confirmando…' : 'Confirmar recebimento'}</button>
        </div>
      </div>}

      {/* recebimentos recentes */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><b style={{ fontSize: 14 }}>Recebimentos recentes ({recs.length})</b><button onClick={loadRecs} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}><RefreshCw size={15} /></button></div>
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {recs.length === 0 ? <div style={{ fontSize: 13, color: '#9ca3af' }}>Nenhum recebimento ainda.</div> :
            recs.map(r => <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, background: '#f9fafb', padding: '.5rem .7rem', borderRadius: 8 }}>
              <PackageCheck size={15} style={{ color: '#1D9E75' }} />
              <div style={{ flex: 1 }}><b>{r.fornecedor || 'Fornecedor'}</b> <span style={{ color: '#9ca3af' }}>· NF {r.numero_nota || 's/n'} · {r.loja} · {r.qtd_itens} itens</span></div>
              <span style={{ fontWeight: 600 }}>{fmt(r.valor_total)}</span>
              {r.anexo_url && <a href={r.anexo_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#6B1212' }}>nota</a>}
              <span style={{ color: '#9ca3af', fontSize: 12 }}>{new Date(r.created_at).toLocaleDateString('pt-BR')}</span>
            </div>)}
        </div>
      </div>
    </div>
  )
}
