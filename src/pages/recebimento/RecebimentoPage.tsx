import { useState, useEffect, useCallback } from 'react'
import { PackageCheck, Upload, ScanLine, Check, AlertTriangle, RefreshCw, Trash2, Boxes, ShieldCheck, Camera, ClipboardCheck } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../hooks/useToast'
import { useAuth } from '../../contexts/AuthContext'

const sb = supabase as any
const SB_URL = 'https://xdwnsqkzgopymufsuccr.supabase.co'
const fmt = (n: any) => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '1.1rem 1.3rem', marginBottom: 14 }
const LOJAS = ['Amore Paiva', 'Amore CD']
const UNIDADES = ['', 'kg', 'g', 'L', 'ml', 'un', 'cx', 'pct', 'dz']
const inp: React.CSSProperties = { padding: '.5rem .7rem', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, width: '100%' }

// tipos de ocorrência/desvio e sua gravidade (alta = segura a entrada até aprovação)
const OCORRENCIAS = [
  { v: 'produto_diferente', l: 'Produto diferente do pedido', g: 'alta' },
  { v: 'quantidade_divergente', l: 'Quantidade divergente', g: 'alta' },
  { v: 'valor_divergente', l: 'Valor diferente do pedido/cotação', g: 'media' },
  { v: 'produto_faltando', l: 'Produto faltando', g: 'alta' },
  { v: 'produto_excedente', l: 'Produto excedente', g: 'media' },
  { v: 'embalagem_danificada', l: 'Embalagem danificada', g: 'media' },
  { v: 'produto_avariado', l: 'Produto avariado', g: 'alta' },
  { v: 'validade_curta', l: 'Validade curta', g: 'media' },
  { v: 'produto_vencido', l: 'Produto vencido', g: 'alta' },
  { v: 'temperatura_inadequada', l: 'Temperatura inadequada', g: 'alta' },
  { v: 'peso_divergente', l: 'Peso divergente', g: 'media' },
  { v: 'qualidade_fora_padrao', l: 'Qualidade fora do padrão', g: 'alta' },
  { v: 'recusa_parcial', l: 'Recusa parcial da mercadoria', g: 'alta' },
  { v: 'recusa_total', l: 'Recusa total da mercadoria', g: 'alta' },
]
const gravOf = (tipo: string) => OCORRENCIAS.find(o => o.v === tipo)?.g || 'media'
const STATUS_BADGE: Record<string, { l: string; c: string; b: string }> = {
  confirmado: { l: '✓ Confirmado', c: '#166534', b: '#DCFCE7' },
  pendente_aprovacao: { l: '⏳ Pendente de aprovação', c: '#9A3412', b: '#FFEDD5' },
  aprovado: { l: '✅ Aprovado', c: '#166534', b: '#DCFCE7' },
}

function precoUnit(it: any) {
  const q = Number(it.quantidade), u = (it.unidade || '').toLowerCase(), cont = Number(it.conteudo) || 1
  if (!q || !u) return null
  const f: any = { g: 0.001, ml: 0.001, kg: 1, l: 1, un: 1, dz: 12, cx: cont, pct: cont }
  const qb = q * (f[u] ?? 1); if (!qb) return null
  const base = ['kg', 'g'].includes(u) ? 'kg' : ['l', 'ml'].includes(u) ? 'L' : 'un'
  return { v: Number(it.valor_total || 0) / qb, base }
}
const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
const STOP = new Set(['caixa', 'cx', 'pacote', 'pct', 'pote', 'saco', 'fardo', 'unidade', 'unidades', 'und', 'kg', 'quilograma', 'grama', 'litro', 'litros', 'lata', 'garrafa', 'balde', 'com', 'sem', 'para', 'tipo', 'premium', 'gourmet', 'sache', 'sacher'])
const tok = (s: string) => norm(s).split(' ').filter(t => t.length > 2 && !STOP.has(t) && !/^\d+$/.test(t))
function matchProduto(nome: string, list: any[]) {
  const tokens = tok(nome); if (!tokens.length) return null
  let best: any = null, bestScore = 0
  for (const p of list) {
    const pn = ' ' + norm(p.nome) + ' '; let score = 0
    for (const t of tokens) if (pn.includes(' ' + t) || pn.includes(t + ' ')) score++
    if (score > bestScore) { bestScore = score; best = p }
  }
  return bestScore >= 2 ? best : null
}
const qtdEstoque = (it: any) => (Number(it.quantidade) || 0) * (Number(it.conteudo) || 1)

export default function RecebimentoPage() {
  const { toast } = useToast()
  const { user } = useAuth()
  const podeAprovar = ['super_admin', 'manager', 'admin', 'gestor', 'diretor'].includes((user?.role || '').toLowerCase())
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
  const [colabs, setColabs] = useState<any[]>([])
  // conferência humana
  const [conferente, setConferente] = useState('')
  const [assinatura, setAssinatura] = useState('')
  const [obsGeral, setObsGeral] = useState('')
  // desvios por item: { [idx]: { tipo, descricao, foto_url, qtd_esperada, qtd_recebida, uploading } }
  const [desvios, setDesvios] = useState<Record<number, any>>({})
  const [desvioOpen, setDesvioOpen] = useState<Set<number>>(new Set())

  const loadRecs = useCallback(async () => { const { data } = await sb.from('recebimentos').select('*').order('created_at', { ascending: false }).limit(20); setRecs(data || []) }, [])
  useEffect(() => { loadRecs() }, [loadRecs])
  useEffect(() => { sb.from('colaboradores').select('nome,func,loja').then(({ data }: any) => setColabs(data || [])) }, [])
  useEffect(() => { if (user?.name && !conferente) setConferente(user.name) }, [user])

  const fetchProdutos = async (lj: string) => {
    const { data } = await sb.from('estoque_produtos').select('id,nome,gramatura,categoria,preco_unitario').eq('loja', lj).eq('ativo', true).order('nome')
    return data || []
  }
  useEffect(() => { fetchProdutos(loja).then(setProdEstoque) }, [loja])

  const enviarELer = async () => {
    if (!file) { toast('Selecione a foto/PDF da nota.', 'error'); return }
    setBusy('upload'); setCab(null); setItens([]); setEstoqueRows([]); setDesvios({}); setDesvioOpen(new Set()); setObsGeral('')
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
      const prods = await fetchProdutos(loja); setProdEstoque(prods)
      setEstoqueRows(its.map((it: any) => {
        const m = matchProduto(it.produto, prods)
        const q = qtdEstoque(it)
        return { on: true, produto_id: m ? m.id : '', novo: !m, nome: m ? m.nome : it.produto, categoria: it.categoria || '', quantidade: q || '', unidade: m?.gramatura || it.unidade || 'un', preco: q > 0 ? Number(it.valor_total || 0) / q : 0 }
      }))
      toast(`IA leu ${d.total || 0} item(ns). Confira, registre desvios e assine. 🔍`)
    } catch { toast('Falha ao processar a nota.', 'error') }
    setBusy('')
  }

  const upItem = (i: number, k: string, v: any) => setItens(a => a.map((x, idx) => idx === i ? { ...x, [k]: v } : x))
  const delItem = (i: number) => { setItens(a => a.filter((_, idx) => idx !== i)); setEstoqueRows(a => a.filter((_, idx) => idx !== i)) }
  const upEst = (i: number, patch: any) => setEstoqueRows(a => a.map((x, idx) => idx === i ? { ...x, ...patch } : x))
  const toggleDesvio = (i: number) => setDesvioOpen(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); if (!n.has(i)) return n; setDesvios(d => d[i] ? d : { ...d, [i]: { tipo: '', descricao: '' } }); return n })
  const upDesvio = (i: number, patch: any) => setDesvios(d => ({ ...d, [i]: { ...d[i], ...patch } }))
  const rmDesvio = (i: number) => { setDesvios(d => { const n = { ...d }; delete n[i]; return n }); setDesvioOpen(s => { const n = new Set(s); n.delete(i); return n }) }

  const uploadFotoDesvio = async (i: number, f: File) => {
    upDesvio(i, { uploading: true })
    try {
      const ext = (f.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `recebimentos/ocorrencias/${crypto.randomUUID()}.${ext}`
      const { error } = await sb.storage.from('anexos').upload(path, f, { upsert: true, contentType: f.type })
      if (error) { toast('Erro ao enviar foto: ' + error.message, 'error'); upDesvio(i, { uploading: false }); return }
      upDesvio(i, { foto_url: `${SB_URL}/storage/v1/object/public/anexos/${path}`, uploading: false })
    } catch { upDesvio(i, { uploading: false }) }
  }

  const somaItens = itens.reduce((s, x) => s + Number(x.valor_total || 0), 0)
  const totalNota = Number(cab?.valor_total || 0)
  const divergencia = cab && totalNota > 0 && Math.abs(somaItens - totalNota) > 0.5
  const itemRetido = (i: number) => desvios[i]?.tipo && gravOf(desvios[i].tipo) === 'alta'
  const nEntradas = darEntrada ? estoqueRows.filter((r, i) => r.on && Number(r.quantidade) > 0 && !itemRetido(i)).length : 0
  const nRetidos = darEntrada ? estoqueRows.filter((r, i) => r.on && Number(r.quantidade) > 0 && itemRetido(i)).length : 0
  const nDesvios = Object.values(desvios).filter((d: any) => d?.tipo).length

  const confirmar = async () => {
    if (!itens.length) { toast('Nenhum item para confirmar.', 'error'); return }
    if (!conferente.trim()) { toast('Informe o nome do conferente.', 'error'); return }
    if (!assinatura.trim()) { toast('Assine digitando seu nome para confirmar.', 'error'); return }
    setBusy('confirm')
    try {
      const p_estoque = darEntrada
        ? estoqueRows.map((r, i) => ({ r, i })).filter(({ r }) => r.on && Number(r.quantidade) > 0).map(({ r, i }) => ({
            acao: r.novo ? 'novo' : 'existente', produto_id: r.novo ? null : (r.produto_id || null),
            nome: r.nome, categoria: r.categoria, quantidade: r.quantidade, unidade: r.unidade, preco_unitario: r.preco,
            codigo_fornecedor: itens[i]?.codigo_fornecedor || null, codigo_barras: itens[i]?.codigo_barras || null, ncm: itens[i]?.ncm || null,
            marca: itens[i]?.marca || null, reter: itemRetido(i),
          }))
        : []
      const p_ocorrencias = Object.entries(desvios).filter(([, d]: any) => d?.tipo).map(([i, d]: any) => ({
        item_descricao: itens[+i]?.produto || '', tipo: d.tipo, gravidade: gravOf(d.tipo), descricao: d.descricao || '',
        foto_url: d.foto_url || null, quantidade_esperada: d.qtd_esperada || null, quantidade_recebida: d.qtd_recebida || null,
      }))
      const p_conferente = { nome: conferente.trim(), user_id: user?.id || null, assinatura: assinatura.trim() }
      const { data, error } = await sb.rpc('recebimento_confirmar', {
        p_loja: loja, p_header: cab, p_itens: itens, p_anexo_url: anexo?.url || null, p_arquivo: anexo?.nome || null,
        p_estoque, p_conferente, p_observacao: obsGeral || null, p_ocorrencias,
      })
      if (error || !data?.ok) { toast('Erro ao confirmar: ' + (error?.message || 'tente novamente'), 'error'); setBusy(''); return }
      if (data.status === 'pendente_aprovacao')
        toast(`Recebimento registrado com ${data.retidos} item(ns) retido(s) por divergência — aguardando aprovação. ⏳`)
      else
        toast(`Recebimento confirmado! Despesa nº ${data.prestacao} · ABC atualizada${data.estoque ? ` · ${data.estoque} no estoque 📦` : ''} ✅`)
      setFile(null); setAnexo(null); setCab(null); setItens([]); setEstoqueRows([]); setDesvios({}); setDesvioOpen(new Set()); setObsGeral(''); setAssinatura(''); loadRecs()
    } catch (e: any) { toast('Falha ao confirmar: ' + (e?.message || ''), 'error') }
    setBusy('')
  }

  const aprovar = async (rec: any) => {
    if (!confirm(`Aprovar a entrada dos itens retidos do recebimento ${rec.numero_nota || ''}?`)) return
    const { data, error } = await sb.rpc('recebimento_aprovar', { p_rec: rec.id, p_aprovador: user?.name || 'Gestor' })
    if (error || !data?.ok) { toast('Erro ao aprovar.', 'error'); return }
    toast(`Aprovado! ${data.entradas} item(ns) deram entrada no estoque. ✅`)
    loadRecs()
  }

  return (
    <div style={{ padding: '1rem 0' }}>
      {/* passo 1 */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}><PackageCheck size={20} style={{ color: '#6B1212' }} /><b style={{ fontSize: 15 }}>Recebimento Inteligente de Mercadorias</b></div>
        <p style={{ fontSize: 12.5, color: '#9ca3af', margin: '0 0 12px' }}>Leitura da nota → conferência → registro de desvios → identificação do conferente → aprovação → entrada no estoque. Produtos novos são cadastrados automaticamente como <b>pendentes de validação</b>.</p>
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
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 860 }}>
            <thead><tr style={{ textAlign: 'left', color: '#9ca3af', fontSize: 11, textTransform: 'uppercase' }}>
              <th style={{ padding: 6 }}>Produto</th><th>Qtd</th><th>Unid.</th><th>Cont.</th><th>Marca</th><th>Valor</th><th>Preço unit.</th><th>Conf.</th><th>Desvio</th><th></th>
            </tr></thead>
            <tbody>
              {itens.map((it, i) => { const pu = precoUnit(it); const cf = it.confianca; const temD = desvios[i]?.tipo; const retido = itemRetido(i); return (
                <>
                <tr key={i} style={{ borderTop: '1px solid #f3f4f6', background: retido ? '#FEF2F2' : undefined }}>
                  <td style={{ padding: 4, minWidth: 170 }}><input style={inp} value={it.produto || ''} onChange={e => upItem(i, 'produto', e.target.value)} /></td>
                  <td style={{ width: 60 }}><input style={inp} type="number" step="0.01" value={it.quantidade ?? ''} onChange={e => upItem(i, 'quantidade', e.target.value)} /></td>
                  <td style={{ width: 66 }}><select style={inp} value={it.unidade || ''} onChange={e => upItem(i, 'unidade', e.target.value)}>{UNIDADES.map(u => <option key={u} value={u}>{u || '—'}</option>)}</select></td>
                  <td style={{ width: 56 }}><input style={inp} type="number" value={it.conteudo ?? 1} onChange={e => upItem(i, 'conteudo', e.target.value)} disabled={!['cx', 'pct'].includes((it.unidade || '').toLowerCase())} /></td>
                  <td style={{ width: 90 }}><input style={inp} value={it.marca || ''} onChange={e => upItem(i, 'marca', e.target.value)} /></td>
                  <td style={{ width: 80 }}><input style={inp} type="number" step="0.01" value={it.valor_total ?? ''} onChange={e => upItem(i, 'valor_total', e.target.value)} /></td>
                  <td style={{ width: 90, fontWeight: 700, color: pu ? '#1D9E75' : '#9ca3af' }}>{pu ? 'R$ ' + pu.v.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + '/' + pu.base : '—'}</td>
                  <td style={{ width: 46 }}>{cf != null ? <span style={{ fontSize: 11, fontWeight: 700, color: cf >= 85 ? '#1D9E75' : cf >= 60 ? '#D97706' : '#DC2626' }}>{cf}%</span> : ''}</td>
                  <td style={{ width: 70 }}><button onClick={() => toggleDesvio(i)} title="Registrar desvio/avaria" style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, padding: '.3rem .5rem', borderRadius: 7, border: '1px solid ' + (temD ? '#DC2626' : '#e5e7eb'), background: temD ? '#FEE2E2' : '#fff', color: temD ? '#DC2626' : '#6b7280', cursor: 'pointer', fontWeight: 600 }}><AlertTriangle size={12} />{temD ? (retido ? 'Retido' : 'Desvio') : 'Ok'}</button></td>
                  <td><button onClick={() => delItem(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444' }}><Trash2 size={13} /></button></td>
                </tr>
                {desvioOpen.has(i) && <tr key={i + '-d'} style={{ background: '#FFFBEB' }}>
                  <td colSpan={10} style={{ padding: '8px 6px' }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <div style={{ minWidth: 220 }}><label style={{ fontSize: 11, color: '#9ca3af' }}>Tipo de ocorrência</label>
                        <select style={inp} value={desvios[i]?.tipo || ''} onChange={e => upDesvio(i, { tipo: e.target.value })}>
                          <option value="">— sem desvio —</option>
                          {OCORRENCIAS.map(o => <option key={o.v} value={o.v}>{o.l}{o.g === 'alta' ? ' 🔴' : ''}</option>)}
                        </select></div>
                      <div style={{ flex: 1, minWidth: 220 }}><label style={{ fontSize: 11, color: '#9ca3af' }}>Descrição do problema</label>
                        <input style={inp} value={desvios[i]?.descricao || ''} onChange={e => upDesvio(i, { descricao: e.target.value })} placeholder="Detalhe o ocorrido" /></div>
                      <div style={{ width: 100 }}><label style={{ fontSize: 11, color: '#9ca3af' }}>Qtd esperada</label>
                        <input style={inp} type="number" value={desvios[i]?.qtd_esperada ?? ''} onChange={e => upDesvio(i, { qtd_esperada: e.target.value })} /></div>
                      <div style={{ width: 100 }}><label style={{ fontSize: 11, color: '#9ca3af' }}>Qtd recebida</label>
                        <input style={inp} type="number" value={desvios[i]?.qtd_recebida ?? ''} onChange={e => upDesvio(i, { qtd_recebida: e.target.value })} /></div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '.5rem .7rem', border: '1px dashed #c4b5a8', borderRadius: 8, cursor: 'pointer', background: '#fff' }}>
                        <Camera size={14} />{desvios[i]?.uploading ? 'Enviando…' : desvios[i]?.foto_url ? 'Foto ✓' : 'Anexar foto'}
                        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) uploadFotoDesvio(i, f) }} />
                      </label>
                      <button onClick={() => rmDesvio(i)} style={{ fontSize: 12, background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer' }}>Remover</button>
                    </div>
                    {desvios[i]?.tipo && gravOf(desvios[i].tipo) === 'alta' && <div style={{ fontSize: 11.5, color: '#B91C1C', marginTop: 6, fontWeight: 600 }}>🔴 Divergência relevante — este item NÃO entra no estoque agora; ficará retido para aprovação da gestão.</div>}
                  </td>
                </tr>}
                </>
              ) })}
            </tbody>
          </table>
        </div>

        {/* entrada no estoque */}
        <div style={{ marginTop: 18, borderTop: '1px dashed #e5e7eb', paddingTop: 14 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 8 }}>
            <input type="checkbox" checked={darEntrada} onChange={e => setDarEntrada(e.target.checked)} />
            <Boxes size={16} style={{ color: '#6B1212' }} /><b style={{ fontSize: 14 }}>Dar entrada no estoque</b>
            {darEntrada && <span style={{ fontSize: 12, color: '#9ca3af' }}>— {nEntradas} entram agora{nRetidos > 0 ? `, ${nRetidos} retido(s) p/ aprovação` : ''}</span>}
          </label>
          {darEntrada && <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 720 }}>
              <thead><tr style={{ textAlign: 'left', color: '#9ca3af', fontSize: 11, textTransform: 'uppercase' }}>
                <th style={{ padding: 6, width: 34 }}>✓</th><th>Item da nota</th><th>Produto no estoque</th><th>Qtd entrada</th><th>Unid.</th>
              </tr></thead>
              <tbody>
                {itens.map((it, i) => { const r = estoqueRows[i]; if (!r) return null; const retido = itemRetido(i); return (
                  <tr key={i} style={{ borderTop: '1px solid #f3f4f6', opacity: r.on ? 1 : .45 }}>
                    <td style={{ padding: 4 }}><input type="checkbox" checked={r.on} onChange={e => upEst(i, { on: e.target.checked })} /></td>
                    <td style={{ fontSize: 12, color: '#6b7280', maxWidth: 200 }}>{it.produto}{retido && <span style={{ color: '#DC2626', fontWeight: 700 }}> · retido</span>}</td>
                    <td style={{ minWidth: 240 }}>
                      <select style={inp} value={r.novo ? '__novo__' : (r.produto_id || '__novo__')} onChange={e => {
                        const v = e.target.value
                        if (v === '__novo__') upEst(i, { novo: true, produto_id: '', nome: it.produto, unidade: it.unidade || 'un' })
                        else { const p = prodEstoque.find(x => x.id === v); upEst(i, { novo: false, produto_id: v, nome: p?.nome || it.produto, unidade: p?.gramatura || r.unidade }) }
                      }}>
                        <option value="__novo__">➕ Cadastrar novo (pendente validação): {(it.produto || '').slice(0, 34)}</option>
                        {prodEstoque.map(p => <option key={p.id} value={p.id}>{p.nome}{p.gramatura ? ` (${p.gramatura})` : ''}</option>)}
                      </select>
                    </td>
                    <td style={{ width: 90 }}><input style={inp} type="number" step="0.01" value={r.quantidade ?? ''} onChange={e => upEst(i, { quantidade: e.target.value })} /></td>
                    <td style={{ width: 90 }}><input style={inp} value={r.unidade || ''} onChange={e => upEst(i, { unidade: e.target.value })} /></td>
                  </tr>) })}
              </tbody>
            </table>
            <p style={{ fontSize: 11.5, color: '#9ca3af', margin: '8px 0 0' }}>Qtd de entrada = qtd × conteúdo. Produtos novos entram como <b>pendente de validação</b> (código, código de barras, NCM, marca e fornecedor são salvos para conferência posterior).</p>
          </div>}
        </div>

        {/* observação geral + conferente */}
        <div style={{ marginTop: 18, borderTop: '1px dashed #e5e7eb', paddingTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px,1fr))', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}><ClipboardCheck size={15} />Observação geral do recebimento</label>
            <textarea style={{ ...inp, minHeight: 68, marginTop: 6, resize: 'vertical' }} value={obsGeral} onChange={e => setObsGeral(e.target.value)} placeholder="Observações gerais, condições de entrega, etc." />
          </div>
          <div style={{ background: '#FAFAF9', border: '1px solid #e7e5e4', borderRadius: 10, padding: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, color: '#6B1212' }}><ShieldCheck size={15} />Identificação do conferente</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
              <div><label style={{ fontSize: 11, color: '#9ca3af' }}>Conferente *</label>
                <input style={inp} list="colabs-list" value={conferente} onChange={e => setConferente(e.target.value)} placeholder="Quem recebeu" />
                <datalist id="colabs-list">{colabs.map((c, k) => <option key={k} value={c.nome} />)}</datalist>
              </div>
              <div><label style={{ fontSize: 11, color: '#9ca3af' }}>Assinatura (digite o nome) *</label>
                <input style={inp} value={assinatura} onChange={e => setAssinatura(e.target.value)} placeholder="Confirmação" /></div>
            </div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>Usuário: <b>{user?.name || '—'}</b> · Unidade: <b>{loja}</b> · {new Date().toLocaleString('pt-BR')}</div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: '#9ca3af' }}>⚠️ Revise os itens. {nDesvios > 0 ? `${nDesvios} desvio(s) registrado(s). ` : ''}{nRetidos > 0 ? `${nRetidos} item(ns) irão para aprovação. ` : ''}Total vai 1x pra despesas; alimenta ABC{darEntrada ? ' e estoque' : ''}.</span>
          <button onClick={confirmar} disabled={!!busy || !conferente.trim() || !assinatura.trim()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '.7rem 1.6rem', borderRadius: 10, border: 'none', background: (!conferente.trim() || !assinatura.trim()) ? '#9ca3af' : '#1D9E75', color: '#fff', cursor: (!conferente.trim() || !assinatura.trim()) ? 'not-allowed' : 'pointer', fontWeight: 600 }}><Check size={16} />{busy === 'confirm' ? 'Confirmando…' : nRetidos > 0 ? 'Registrar e enviar p/ aprovação' : 'Aprovar recebimento'}</button>
        </div>
      </div>}

      {/* recebimentos recentes */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><b style={{ fontSize: 14 }}>Recebimentos recentes ({recs.length})</b><button onClick={loadRecs} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}><RefreshCw size={15} /></button></div>
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {recs.length === 0 ? <div style={{ fontSize: 13, color: '#9ca3af' }}>Nenhum recebimento ainda.</div> :
            recs.map(r => { const st = STATUS_BADGE[r.status] || STATUS_BADGE.confirmado; return (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, background: '#f9fafb', padding: '.5rem .7rem', borderRadius: 8, flexWrap: 'wrap' }}>
                <PackageCheck size={15} style={{ color: '#1D9E75' }} />
                <div style={{ flex: 1, minWidth: 180 }}><b>{r.fornecedor || 'Fornecedor'}</b> <span style={{ color: '#9ca3af' }}>· NF {r.numero_nota || 's/n'} · {r.loja} · {r.qtd_itens} itens{r.qtd_ocorrencias > 0 ? ` · ${r.qtd_ocorrencias} desvio(s)` : ''}{r.conferente_nome ? ` · por ${r.conferente_nome}` : ''}</span></div>
                <span style={{ fontSize: 11, fontWeight: 700, color: st.c, background: st.b, padding: '.2rem .6rem', borderRadius: 20 }}>{st.l}</span>
                <span style={{ fontWeight: 600 }}>{fmt(r.valor_total)}</span>
                {r.anexo_url && <a href={r.anexo_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#6B1212' }}>nota</a>}
                {r.status === 'pendente_aprovacao' && podeAprovar && <button onClick={() => aprovar(r)} style={{ fontSize: 12, fontWeight: 700, padding: '.3rem .7rem', borderRadius: 7, border: 'none', background: '#1D9E75', color: '#fff', cursor: 'pointer' }}>Aprovar entrada</button>}
                <span style={{ color: '#9ca3af', fontSize: 12 }}>{new Date(r.created_at).toLocaleDateString('pt-BR')}</span>
              </div>) })}
        </div>
      </div>
    </div>
  )
}
