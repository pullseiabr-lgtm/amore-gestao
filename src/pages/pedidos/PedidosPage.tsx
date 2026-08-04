import { useState, useEffect, useCallback } from 'react'
import { ClipboardList, RefreshCw, ExternalLink, Loader2, Package, Plus, Trash2, X, Send } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useLoja } from '../../contexts/LojaContext'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../hooks/useToast'
import { fetchFornecedores, fetchProdutos, insertProduto } from '../../lib/db'
import { enviarWhatsApp } from '../../lib/notify'
import { siteOrigin } from '../../lib/site'
import { UNIDADES } from '../../lib/catalogo'
import type { Fornecedor, Produto } from '../../types/database'

const sb = supabase as any
const fmtR$ = (v: number) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtD = (s?: string) => { if (!s) return '—'; const p = String(s).slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s }
const slugify = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 36)
const LOJAS_FALLBACK = ['Amore CD', 'Amore Paiva', 'Flow CD']
const DRAFT_KEY = 'pedido_rascunho_v1'

interface PedidoItem { produto: string; qtd: number; un?: string; preco: number; subtotal?: number }
interface Pedido { chave: string; fornecedor: string; loja: string; data?: string; total?: number; pagamento?: string; cliente?: string; recebimento_responsavel?: string; itens?: PedidoItem[]; cancelados?: string[]; recebimento?: { status: string; por?: string; obs?: string; em?: string } }
interface Linha { produto: string; qtd: string; un: string; preco: string }
const linhaVazia = (): Linha => ({ produto: '', qtd: '1', un: 'Unidade(s)', preco: '' })

export default function PedidosPage() {
  const { loja } = useLoja()
  const { theme } = useTheme()
  const LOJAS = (theme?.stores && theme.stores.length ? theme.stores : LOJAS_FALLBACK)
  const { user } = useAuth()
  const { toast } = useToast()
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [loading, setLoading] = useState(true)
  const [forns, setForns] = useState<Fornecedor[]>([])
  // form novo pedido
  const [mNovo, setMNovo] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const lojaDef = LOJAS.includes(loja) ? loja : 'Amore Paiva'
  const [fForn, setFForn] = useState('')
  const [fLoja, setFLoja] = useState(lojaDef)
  const [fData, setFData] = useState(() => new Date().toISOString().slice(0, 10))
  const [fPagto, setFPagto] = useState('à vista')
  const [fCliente, setFCliente] = useState('')
  const [fReceb, setFReceb] = useState('')
  const [linhas, setLinhas] = useState<Linha[]>([linhaVazia()])
  const [produtosLoja, setProdutosLoja] = useState<Produto[]>([])
  // envio do link
  const [fornMap, setFornMap] = useState<Record<string, string>>({})
  const [profMap, setProfMap] = useState<Record<string, string>>({})
  const [recebLoja, setRecebLoja] = useState<Record<string, { nome: string; whatsapp: string }>>({})
  const [mEnviar, setMEnviar] = useState(false)
  const [pedSel, setPedSel] = useState<Pedido | null>(null)
  const [foneForn, setFoneForn] = useState('')
  const [foneReceb, setFoneReceb] = useState('')
  const [enviandoP, setEnviandoP] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await sb.from('app_config').select('chave,valor').like('chave', 'pedido_%')
    const list: Pedido[] = (data || []).map((r: any) => ({ chave: r.chave, ...(r.valor || {}) }))
    list.sort((a, b) => (String(b.data || '') + b.chave).localeCompare(String(a.data || '') + a.chave))
    setPedidos(list); setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => { fetchFornecedores(fLoja).then(f => setForns(f.filter(x => x.ativo !== false))).catch(() => setForns([])) }, [fLoja])
  useEffect(() => { if (!mNovo) return; fetchProdutos(fLoja, { ativo: true }).then(setProdutosLoja).catch(() => setProdutosLoja([])) }, [mNovo, fLoja])
  useEffect(() => { (async () => {
    const [{ data: fs }, { data: ps }] = await Promise.all([
      sb.from('fornecedores').select('nome,loja,whatsapp,telefone'),
      sb.from('profiles').select('name,permissions_override'),
    ])
    const fm: Record<string, string> = {}; (fs || []).forEach((f: any) => { const k = f.loja + '|' + (f.nome || '').toLowerCase(); if (!fm[k]) fm[k] = (f.whatsapp || f.telefone || '').replace(/\D/g, '') })
    setFornMap(fm)
    const pm: Record<string, string> = {}; (ps || []).forEach((p: any) => { const perf = p.permissions_override?.__perfil__ || {}; if (p.name) pm[p.name.toLowerCase()] = String(perf.whatsapp || perf.telefone || '').replace(/\D/g, '') })
    setProfMap(pm)
    const { data: rl } = await sb.from('app_config').select('valor').eq('chave', 'recebimento_por_loja').maybeSingle()
    if (rl?.valor) setRecebLoja(rl.valor)
  })() }, [])

  // preenche o responsável de recebimento da loja automaticamente ao abrir/trocar a loja no formulário
  useEffect(() => { if (mNovo && !fReceb.trim() && recebLoja[fLoja]?.nome) setFReceb(recebLoja[fLoja].nome) }, [mNovo, fLoja, recebLoja]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtrados = pedidos.filter(p => loja === 'Todas as Lojas' || !loja || p.loja === loja)
  const link = (p: Pedido) => `${siteOrigin()}/pedido.html?p=${encodeURIComponent(p.chave.replace(/^pedido_/, ''))}`

  const abrirEnviar = (p: Pedido) => {
    setPedSel(p)
    setFoneForn(fornMap[p.loja + '|' + (p.fornecedor || '').toLowerCase()] || '')
    setFoneReceb(profMap[(p.recebimento_responsavel || '').toLowerCase()] || recebLoja[p.loja]?.whatsapp || '')
    setMEnviar(true)
  }
  const enviarPedido = async () => {
    if (!pedSel) return
    const ff = foneForn.replace(/\D/g, ''), fr = foneReceb.replace(/\D/g, '')
    if (ff.length < 10 && fr.length < 10) { toast('Informe ao menos um WhatsApp com DDD.', 'error'); return }
    setEnviandoP(true)
    try {
      const l = link(pedSel)
      const msgF = `🧾 *Pedido de Compra — ${pedSel.loja}*\nFornecedor: ${pedSel.fornecedor}${pedSel.pagamento ? ` · ${pedSel.pagamento}` : ''}\n\nSegue nosso pedido (${(pedSel.itens || []).length} itens · ${fmtR$(pedSel.total || 0)}). Abra o link:\n${l}\n📍 Entrega ${pedSel.loja}${pedSel.recebimento_responsavel ? ` · Recebimento: ${pedSel.recebimento_responsavel}` : ''}\n— Compras Amore`
      const msgR = `📦 *Pedido a receber — ${pedSel.loja}*\nFornecedor: ${pedSel.fornecedor} · ${fmtR$(pedSel.total || 0)}\n\nConfira na chegada (link com a lista organizada):\n${l}\n— Compras Amore`
      let ok = 0, alvos = 0
      if (ff.length >= 10) { alvos++; if (await enviarWhatsApp(ff, msgF)) ok++ }
      if (fr.length >= 10) { alvos++; if (await enviarWhatsApp(fr, msgR)) ok++ }
      toast(`Link enviado para ${ok} de ${alvos} destino(s). ✅`)
      setMEnviar(false)
    } catch { toast('Não foi possível enviar.', 'error') }
    finally { setEnviandoP(false) }
  }

  const setLinha = (i: number, patch: Partial<Linha>) => setLinhas(ls => ls.map((l, j) => j === i ? { ...l, ...patch } : l))
  const totalForm = linhas.reduce((s, l) => s + (Number(l.qtd) || 0) * (Number(l.preco) || 0), 0)
  const resetForm = () => { setFForn(''); setFCliente(''); setFReceb(''); setFPagto('à vista'); setFData(new Date().toISOString().slice(0, 10)); setLinhas([linhaVazia()]); try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ } }

  // salva rascunho automaticamente enquanto o modal está aberto (não perde o pedido se fechar)
  useEffect(() => {
    if (!mNovo) return
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ fForn, fLoja, fData, fPagto, fCliente, fReceb, linhas })) } catch { /* ignore */ }
  }, [mNovo, fForn, fLoja, fData, fPagto, fCliente, fReceb, linhas])

  const abrirNovo = () => {
    let restaurou = false
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (raw) {
        const d = JSON.parse(raw)
        const temItens = Array.isArray(d.linhas) && d.linhas.some((l: any) => (l?.produto || '').trim())
        if (temItens || (d.fForn || '').trim()) {
          setFForn(d.fForn || ''); setFLoja(d.fLoja || lojaDef); setFData(d.fData || new Date().toISOString().slice(0, 10))
          setFPagto(d.fPagto || 'à vista'); setFCliente(d.fCliente || ''); setFReceb(d.fReceb || '')
          setLinhas(Array.isArray(d.linhas) && d.linhas.length ? d.linhas : [linhaVazia()])
          restaurou = true
        }
      }
    } catch { /* ignore */ }
    if (!restaurou) { resetForm(); setFLoja(lojaDef) }
    setMNovo(true)
    if (restaurou) setTimeout(() => toast('📝 Rascunho recuperado — continue de onde parou.'), 300)
  }

  const salvar = async () => {
    if (!fForn.trim()) { toast('Informe o fornecedor.', 'error'); return }
    const itens = linhas.filter(l => l.produto.trim() && Number(l.qtd) > 0).map(l => {
      const qtd = Number(l.qtd), preco = Number(l.preco) || 0
      return { produto: l.produto.trim(), qtd, un: l.un || 'Unidade(s)', preco, subtotal: Math.round(qtd * preco * 100) / 100 }
    })
    if (!itens.length) { toast('Adicione ao menos 1 item com quantidade.', 'error'); return }
    setSalvando(true)
    try {
      // cadastra produtos novos (nome não existente na loja) com nome + embalagem
      const existentes = new Set(produtosLoja.map(p => (p.nome || '').trim().toLowerCase()))
      const novos = itens.filter(it => !existentes.has(it.produto.toLowerCase()))
      let cadastrados = 0
      for (const it of novos) {
        try {
          await insertProduto({
            loja: fLoja, codigo_interno: 'PED-' + Date.now().toString(36).slice(-4).toUpperCase() + Math.floor(Math.random() * 900 + 100),
            nome: it.produto.toUpperCase(), descricao: null, categoria_id: null, categoria_nome: 'Cadastrado via Pedido',
            gramatura: null, unidade: it.un, marca_id: null, marca_nome: null, imagem_url: null, ativo: true,
            estoque_atual: 0, estoque_minimo: 0, status_homologacao: 'homologado', feedback_teste: null,
            data_inicio_teste: null, aprovado_por: null, aprovacao_at: null, created_by: user?.name ?? 'Pedido',
            ultimo_preco_compra: it.preco || null, preco_anterior_compra: null, data_ultima_compra: fData,
            fornecedor_padrao_id: null, fornecedor_padrao_nome: fForn.trim() || null, preco_venda: null, disponivel_pdv: false,
          } as any)
          cadastrados++
        } catch { /* nome duplicado / código repetido — ignora e segue o pedido */ }
      }
      const total = Math.round(itens.reduce((s, i) => s + i.subtotal, 0) * 100) / 100
      const chave = `pedido_${slugify(fForn)}_${slugify(fLoja)}_${Date.now().toString(36).slice(-6)}`
      const valor = { fornecedor: fForn.trim(), loja: fLoja, data: fData, pagamento: fPagto || null, cliente: fCliente || null, recebimento_responsavel: fReceb || null, itens, total, cancelados: [], em: new Date().toISOString(), created_by: user?.name || 'Painel' }
      await sb.from('app_config').upsert({ chave, valor }, { onConflict: 'chave' })
      toast(cadastrados ? `Pedido gerado. ✅ ${cadastrados} produto(s) novo(s) cadastrado(s).` : 'Pedido gerado. ✅')
      setMNovo(false); resetForm(); await load()
    } catch (e) { toast('Não foi possível gerar o pedido.', 'error') }
    finally { setSalvando(false) }
  }

  const card: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }
  const inp: React.CSSProperties = { padding: '9px 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, boxSizing: 'border-box' }

  return (
    <div>
      <div style={{ background: 'linear-gradient(135deg, #6B1212 0%, #8a2a2a 100%)', borderRadius: 12, padding: '18px 22px', marginBottom: 16, color: '#fff', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 46, height: 46, borderRadius: 12, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ClipboardList size={24} /></div>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Pedidos de Compra</h2>
          <div style={{ fontSize: 13, opacity: 0.85 }}>Gere o pedido, abra o link (imprimir/compartilhar) e acompanhe o recebimento — Loja <strong>{loja}</strong></div>
        </div>
        <button className="btn" onClick={abrirNovo} style={{ padding: '9px 15px', background: '#fff', color: '#8B1212' }}><Plus size={16} /> Novo pedido</button>
        <button onClick={load} title="Atualizar" style={{ background: 'rgba(255,255,255,.18)', border: 'none', color: '#fff', borderRadius: 10, padding: '9px 11px', cursor: 'pointer' }}><RefreshCw size={16} /></button>
      </div>

      {loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Loader2 className="spin" size={26} /></div>
        : filtrados.length === 0 ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13, border: '1px dashed var(--border)', borderRadius: 10 }}>
            Nenhum pedido nesta loja ainda. <button className="btn" onClick={abrirNovo} style={{ padding: '7px 14px', marginLeft: 8 }}><Plus size={14} /> Novo pedido</button>
          </div>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtrados.map(p => (
              <div key={p.chave} style={{ ...card, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: '#F3F4F6', color: '#8B1212', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Package size={19} /></div>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontWeight: 700, fontSize: 14.5 }}>{p.fornecedor || 'Fornecedor'}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                    {p.loja} · {fmtD(p.data)} · {(p.itens || []).length} itens{p.recebimento_responsavel ? ` · recebe ${p.recebimento_responsavel}` : ''}{p.cancelados && p.cancelados.length ? ` · ⚠ ${p.cancelados.length} cancelado(s)` : ''}
                  </div>
                </div>
                {p.recebimento
                  ? <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: p.recebimento.status === 'Recebido integral' ? '#DCFCE7' : '#FEF3C7', color: p.recebimento.status === 'Recebido integral' ? '#15803D' : '#B45309', whiteSpace: 'nowrap' }} title={`${p.recebimento.por || ''} · ${p.recebimento.em ? new Date(p.recebimento.em).toLocaleString('pt-BR') : ''}${p.recebimento.obs ? ' · ' + p.recebimento.obs : ''}`}>✓ {p.recebimento.status}</span>
                  : <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: '#E0F2FE', color: '#0369A1', whiteSpace: 'nowrap' }}>Aguardando recebimento</span>}
                <div style={{ textAlign: 'right', minWidth: 90 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#8B1212' }}>{fmtR$(p.total || 0)}</div>
                </div>
                <a href={link(p)} target="_blank" rel="noreferrer" className="btn" style={{ padding: '8px 14px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }}>
                  <ExternalLink size={15} /> Abrir
                </a>
                <button onClick={() => abrirEnviar(p)} className="btn" style={{ padding: '8px 14px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Send size={15} /> Enviar
                </button>
              </div>
            ))}
          </div>}

      {/* Modal: novo pedido manual */}
      {mNovo && (
        <div style={{ position: 'fixed', inset: 0, background: '#0008', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, overflowY: 'auto' }}>
          <div style={{ background: 'var(--card)', borderRadius: 14, padding: 20, width: '100%', maxWidth: 720, margin: '24px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <strong style={{ fontSize: 16 }}>🧾 Novo pedido de compra</strong>
              <button onClick={() => setMNovo(false)} title="Fechar (mantém o rascunho)" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={18} /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>Fornecedor *
                <input list="forn-list" value={fForn} onChange={e => setFForn(e.target.value)} placeholder="Nome do fornecedor" style={inp} />
                <datalist id="forn-list">{forns.map(f => <option key={f.id} value={f.nome} />)}</datalist>
              </label>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>Loja
                <select value={fLoja} onChange={e => setFLoja(e.target.value)} style={inp}>{LOJAS.map(l => <option key={l} value={l}>{l}</option>)}</select>
              </label>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>Data
                <input type="date" value={fData} onChange={e => setFData(e.target.value)} style={inp} />
              </label>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>Pagamento
                <input value={fPagto} onChange={e => setFPagto(e.target.value)} placeholder="à vista / 28 dias…" style={inp} />
              </label>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>Recebimento (responsável)
                <input value={fReceb} onChange={e => setFReceb(e.target.value)} placeholder="Ex.: Carlos Wellington" style={inp} />
              </label>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>Cliente (opcional)
                <input value={fCliente} onChange={e => setFCliente(e.target.value)} placeholder="Ex.: Amore / LDI" style={inp} />
              </label>
            </div>

            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>Itens</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 520 }}>
                <thead><tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase' }}>
                  <th style={{ padding: 6 }}>Produto</th><th style={{ width: 80 }}>Qtd</th><th style={{ width: 120 }}>Unidade</th><th style={{ width: 100 }}>Preço unit.</th><th style={{ width: 100 }}>Subtotal</th><th style={{ width: 34 }}></th>
                </tr></thead>
                <tbody>
                  {linhas.map((l, i) => {
                    const sub = (Number(l.qtd) || 0) * (Number(l.preco) || 0)
                    const nomeTrim = (l.produto || '').trim().toLowerCase()
                    const existe = !!nomeTrim && produtosLoja.some(p => (p.nome || '').trim().toLowerCase() === nomeTrim)
                    const novo = !!nomeTrim && !existe
                    return <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: 6 }}>
                        <input list="prod-list" value={l.produto} onChange={e => {
                          const v = e.target.value
                          const prod = produtosLoja.find(p => (p.nome || '').trim().toLowerCase() === v.trim().toLowerCase())
                          setLinha(i, { produto: v, ...(prod ? { un: prod.unidade || l.un, ...(!l.preco && prod.ultimo_preco_compra ? { preco: String(prod.ultimo_preco_compra) } : {}) } : {}) })
                        }} placeholder="Produto (busque ou digite um novo)" style={{ ...inp, width: '100%' }} />
                        {novo && <div style={{ fontSize: 10.5, color: '#15803D', marginTop: 3, fontWeight: 600 }}>✨ Produto novo — será cadastrado na loja</div>}
                      </td>
                      <td style={{ padding: 6 }}><input type="number" min={0} step="0.001" value={l.qtd} onChange={e => setLinha(i, { qtd: e.target.value })} style={{ ...inp, width: 74 }} /></td>
                      <td style={{ padding: 6 }}><select value={l.un} onChange={e => setLinha(i, { un: e.target.value })} style={{ ...inp, width: 114 }}>{UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}</select></td>
                      <td style={{ padding: 6 }}><input type="number" min={0} step="0.01" value={l.preco} onChange={e => setLinha(i, { preco: e.target.value })} placeholder="0,00" style={{ ...inp, width: 94 }} /></td>
                      <td style={{ padding: 6, fontWeight: 700, whiteSpace: 'nowrap' }}>{fmtR$(sub)}</td>
                      <td style={{ padding: 6 }}>{linhas.length > 1 && <button onClick={() => setLinhas(ls => ls.filter((_, j) => j !== i))} title="Remover" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#DC2626' }}><Trash2 size={16} /></button>}</td>
                    </tr>
                  })}
                </tbody>
              </table>
              <datalist id="prod-list">{produtosLoja.filter(p => p.nome).map(p => <option key={p.id} value={p.nome}>{p.unidade ? `${p.unidade}${p.ultimo_preco_compra ? ' · últ. ' + fmtR$(p.ultimo_preco_compra) : ''}` : ''}</option>)}</datalist>
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>💡 {produtosLoja.length} produtos cadastrados em <strong>{fLoja}</strong>. Escolha da lista (a embalagem e o último preço entram sozinhos) ou digite um nome novo — na hora de gerar, o produto novo é cadastrado com a embalagem escolhida.</div>
            <button onClick={() => setLinhas(ls => [...ls, linhaVazia()])} style={{ marginTop: 8, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Plus size={14} /> Adicionar item</button>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, flexWrap: 'wrap', gap: 10 }}>
              <div style={{ fontSize: 17, fontWeight: 800 }}>Total: <span style={{ color: '#8B1212' }}>{fmtR$(totalForm)}</span> <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)' }}>· {linhas.filter(l => (l.produto || '').trim()).length} itens · rascunho salvo automaticamente</span></div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" onClick={() => { if (linhas.some(l => (l.produto || '').trim()) && !confirm('Limpar todos os itens deste pedido? Não dá para desfazer.')) return; resetForm() }} style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', padding: '9px 16px' }} title="Apaga tudo e começa do zero">🗑️ Limpar</button>
                <button className="btn" onClick={() => setMNovo(false)} style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', padding: '9px 16px' }} title="Fecha sem perder — o rascunho fica salvo">Fechar</button>
                <button className="btn" onClick={salvar} disabled={salvando} style={{ padding: '9px 18px', opacity: salvando ? .6 : 1 }}>{salvando ? 'Gerando…' : '✅ Gerar pedido'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: enviar link do pedido */}
      {mEnviar && pedSel && (
        <div style={{ position: 'fixed', inset: 0, background: '#0008', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setMEnviar(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card)', borderRadius: 14, padding: 20, width: '100%', maxWidth: 460 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <strong style={{ fontSize: 16 }}>📤 Enviar pedido</strong>
              <button onClick={() => setMEnviar(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={18} /></button>
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
              {pedSel.fornecedor} · {pedSel.loja} · {fmtR$(pedSel.total || 0)} — dispara o <strong>link do pedido</strong> por WhatsApp.
            </div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Fornecedor ({pedSel.fornecedor})</label>
            <input value={foneForn} onChange={e => setFoneForn(e.target.value)} placeholder="WhatsApp do fornecedor c/ DDD" style={{ ...inp, width: '100%', marginBottom: 4 }} />
            {!foneForn && <div style={{ fontSize: 11, color: '#B45309', marginBottom: 8 }}>Sem WhatsApp cadastrado — digite para enviar.</div>}
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', margin: '10px 0 4px' }}>Recebimento{pedSel.recebimento_responsavel ? ` (${pedSel.recebimento_responsavel})` : ''}</label>
            <input value={foneReceb} onChange={e => setFoneReceb(e.target.value)} placeholder="WhatsApp do responsável c/ DDD" style={{ ...inp, width: '100%' }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button className="btn" onClick={() => setMEnviar(false)} style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', padding: '9px 16px' }}>Cancelar</button>
              <button className="btn" onClick={enviarPedido} disabled={enviandoP} style={{ padding: '9px 16px', opacity: enviandoP ? .6 : 1 }}>{enviandoP ? 'Enviando…' : '📲 Enviar link'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
