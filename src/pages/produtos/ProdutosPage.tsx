import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Search, Trash2, Edit3, Copy, Package, Tag, Award,
  ChevronLeft, Loader, X, Check, AlertTriangle, Grid3X3,
  ToggleLeft, ToggleRight, Building2, Filter, RefreshCw,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useLoja } from '../../contexts/LojaContext'
import {
  fetchProdutos, insertProduto, updateProduto, deleteProduto, duplicarProduto,
  fetchCategoriasProduto, insertCategoriaProduto, updateCategoriaProduto, deleteCategoriaProduto,
  fetchMarcasProduto, insertMarcaProduto, updateMarcaProduto,
  fetchContagemPorCategoria,
  insertProdutoTeste, updateProdutoHomologacao,
} from '../../lib/db'
import type { Produto, CategoriaProduto, MarcaProduto, HomologacaoStatus } from '../../types/database'

// ── Constantes (baseadas no scraping do Foozi) ───────────────

const UNIDADES = [
  'Miligrama','Grama','Quilograma','Tonelada',
  'Mililitro','Litro',
  'Unidade','Caixa','Peça','Dúzia','Garrafa','Frasco',
  'Galão','Pote','Rolo','Pacote','Lata','Saco',
  'Metro','Centímetro','Par','Barrica','Tambor','Fardo',
  'Bisnaga','Maço','Bandeja','Embalagem','Display','Pente','Balde',
]

// ── Helpers ──────────────────────────────────────────────────

const fmtData = (d: string) => new Date(d).toLocaleDateString('pt-BR')

function Badge({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{ display:'inline-flex', alignItems:'center', fontSize:10, fontWeight:700,
      padding:'2px 8px', borderRadius:20, background:bg, color }}>
      {label}
    </span>
  )
}

// ── Toast simples ────────────────────────────────────────────

function useToast() {
  const [msg, setMsg] = useState<{text:string;type:'ok'|'err'}|null>(null)
  const toast = (text: string, type: 'ok'|'err' = 'ok') => {
    setMsg({ text, type })
    setTimeout(() => setMsg(null), 3000)
  }
  const ToastEl = msg ? (
    <div style={{
      position:'fixed', bottom:24, right:24, zIndex:9999,
      background: msg.type==='ok' ? 'var(--success)' : 'var(--danger)',
      color:'#fff', padding:'10px 18px', borderRadius:10, fontSize:13, fontWeight:700,
      boxShadow:'0 4px 20px rgba(0,0,0,.2)', display:'flex', alignItems:'center', gap:8,
    }}>
      {msg.type==='ok' ? <Check size={14}/> : <X size={14}/>} {msg.text}
    </div>
  ) : null
  return { toast, ToastEl }
}

// ── Modal Categoria ──────────────────────────────────────────

function ModalCategoria({ loja, cat, onSalvo, onFechar }: {
  loja: string
  cat: CategoriaProduto | null
  onSalvo: (c: CategoriaProduto) => void
  onFechar: () => void
}) {
  const [nome, setNome] = useState(cat?.nome ?? '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const salvar = async () => {
    if (!nome.trim()) { setErr('Nome é obrigatório'); return }
    setSaving(true)
    try {
      const saved = cat
        ? await updateCategoriaProduto(cat.id, { nome: nome.trim() })
        : await insertCategoriaProduto({ loja, nome: nome.trim(), ativo: true })
      onSalvo(saved)
    } catch (e: any) {
      setErr(e.message?.includes('unique') ? 'Já existe uma categoria com esse nome' : 'Erro ao salvar')
    }
    setSaving(false)
  }

  return (
    <div className="ov open" onClick={onFechar}>
      <div className="modal" style={{ maxWidth:420 }} onClick={e => e.stopPropagation()}>
        <div className="mhd">
          <span className="mtt">{cat ? 'Editar Categoria' : 'Nova Categoria'}</span>
          <button className="mx" onClick={onFechar}>✕</button>
        </div>
        <div className="mbd">
          <div className="fg">
            <label className="fl">Nome da categoria <span className="rq">*</span></label>
            <input className={`inp${err?' err':''}`} value={nome} autoFocus
              onChange={e => { setNome(e.target.value); setErr('') }}
              onKeyDown={e => e.key==='Enter' && salvar()}
              placeholder="Ex: Bebidas, Carnes, Limpeza..." />
            {err && <span style={{ fontSize:11, color:'var(--danger)' }}>{err}</span>}
          </div>
        </div>
        <div className="mft">
          <button className="btn bo" onClick={onFechar}>Cancelar</button>
          <button className="btn bp" onClick={salvar} disabled={saving}>
            {saving ? <Loader size={12} className="spin"/> : <Check size={12}/>} Salvar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal Marca ──────────────────────────────────────────────

function ModalMarca({ loja, marca, onSalvo, onFechar }: {
  loja: string
  marca: MarcaProduto | null
  onSalvo: (m: MarcaProduto) => void
  onFechar: () => void
}) {
  const [nome, setNome] = useState(marca?.nome ?? '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const salvar = async () => {
    if (!nome.trim()) { setErr('Nome é obrigatório'); return }
    setSaving(true)
    try {
      const saved = marca
        ? await updateMarcaProduto(marca.id, { nome: nome.trim() })
        : await insertMarcaProduto({ loja, nome: nome.trim(), ativo: true })
      onSalvo(saved)
    } catch (e: any) {
      setErr(e.message?.includes('unique') ? 'Já existe uma marca com esse nome' : 'Erro ao salvar')
    }
    setSaving(false)
  }

  return (
    <div className="ov open" onClick={onFechar}>
      <div className="modal" style={{ maxWidth:420 }} onClick={e => e.stopPropagation()}>
        <div className="mhd">
          <span className="mtt">{marca ? 'Editar Marca' : 'Nova Marca'}</span>
          <button className="mx" onClick={onFechar}>✕</button>
        </div>
        <div className="mbd">
          <div className="fg">
            <label className="fl">Nome da marca <span className="rq">*</span></label>
            <input className={`inp${err?' err':''}`} value={nome} autoFocus
              onChange={e => { setNome(e.target.value); setErr('') }}
              onKeyDown={e => e.key==='Enter' && salvar()}
              placeholder="Ex: Sadia, Nestlé, Coca-Cola..." />
            {err && <span style={{ fontSize:11, color:'var(--danger)' }}>{err}</span>}
          </div>
        </div>
        <div className="mft">
          <button className="btn bo" onClick={onFechar}>Cancelar</button>
          <button className="btn bp" onClick={salvar} disabled={saving}>
            {saving ? <Loader size={12} className="spin"/> : <Check size={12}/>} Salvar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Formulário de Produto ────────────────────────────────────

type ProdutoForm = {
  codigo_interno: string
  nome: string
  descricao: string
  categoria_id: string
  categoria_nome: string
  gramatura: string
  unidade: string
  marca_id: string
  marca_nome: string
  ativo: boolean
  estoque_atual: string
  estoque_minimo: string
  ultimo_preco_compra: string
  fornecedor_padrao_nome: string
  preco_venda: string
  disponivel_pdv: boolean
}

const FORM_EMPTY: ProdutoForm = {
  codigo_interno:'', nome:'', descricao:'',
  categoria_id:'', categoria_nome:'',
  gramatura:'', unidade:'Unidade',
  marca_id:'', marca_nome:'',
  ativo: true, estoque_atual:'0', estoque_minimo:'0',
  ultimo_preco_compra:'', fornecedor_padrao_nome:'',
  preco_venda:'', disponivel_pdv: false,
}

function FormProduto({ loja, produto, onSalvo, onVoltar }: {
  loja: string
  produto: Produto | null
  onSalvo: (p: Produto) => void
  onVoltar: () => void
}) {
  const { user } = useAuth()
  const { toast, ToastEl } = useToast()
  const [form, setForm] = useState<ProdutoForm>(
    produto ? {
      codigo_interno: produto.codigo_interno,
      nome: produto.nome,
      descricao: produto.descricao ?? '',
      categoria_id: produto.categoria_id ?? '',
      categoria_nome: produto.categoria_nome ?? '',
      gramatura: produto.gramatura?.toString() ?? '',
      unidade: produto.unidade,
      marca_id: produto.marca_id ?? '',
      marca_nome: produto.marca_nome ?? '',
      ativo: produto.ativo,
      estoque_atual: produto.estoque_atual.toString(),
      estoque_minimo: produto.estoque_minimo.toString(),
      ultimo_preco_compra: produto.ultimo_preco_compra?.toString() ?? '',
      fornecedor_padrao_nome: produto.fornecedor_padrao_nome ?? '',
      preco_venda: produto.preco_venda?.toString() ?? '',
      disponivel_pdv: produto.disponivel_pdv ?? false,
    } : FORM_EMPTY
  )
  const [erros, setErros] = useState<Partial<ProdutoForm>>({})
  const [saving, setSaving] = useState(false)
  const [categorias, setCategorias] = useState<CategoriaProduto[]>([])
  const [marcas, setMarcas] = useState<MarcaProduto[]>([])
  const [modalCat, setModalCat] = useState(false)
  const [modalMarca, setModalMarca] = useState(false)
  const [tab, setTab] = useState<'dados'|'estoque'>('dados')

  useEffect(() => {
    fetchCategoriasProduto(loja).then(setCategorias).catch(() => {})
    fetchMarcasProduto(loja).then(setMarcas).catch(() => {})
  }, [loja])

  const set = (k: keyof ProdutoForm, v: string | boolean) => {
    setForm(f => ({ ...f, [k]: v }))
    setErros(e => ({ ...e, [k]: undefined }))
  }

  const selecCateg = (id: string) => {
    const c = categorias.find(c => c.id === id)
    set('categoria_id', id)
    set('categoria_nome', c?.nome ?? '')
  }
  const selecMarca = (id: string) => {
    const m = marcas.find(m => m.id === id)
    set('marca_id', id)
    set('marca_nome', m?.nome ?? '')
  }

  const validar = () => {
    const e: Partial<ProdutoForm> = {}
    if (!form.codigo_interno.trim()) e.codigo_interno = 'Obrigatório'
    if (!form.nome.trim())           e.nome = 'Obrigatório'
    if (!form.categoria_id)          e.categoria_id = 'Selecione uma categoria'
    if (!form.unidade)               e.unidade = 'Obrigatório'
    setErros(e)
    return Object.keys(e).length === 0
  }

  const salvar = async () => {
    if (!validar()) { toast('Preencha os campos obrigatórios', 'err'); return }
    setSaving(true)
    try {
      const novoPreco = form.ultimo_preco_compra ? parseFloat(form.ultimo_preco_compra) : null
      const payload = {
        loja,
        codigo_interno: form.codigo_interno.trim().toUpperCase(),
        nome: form.nome.trim().toUpperCase(),
        descricao: form.descricao.trim() || null,
        categoria_id: form.categoria_id || null,
        categoria_nome: form.categoria_nome || null,
        gramatura: form.gramatura ? parseFloat(form.gramatura) : null,
        unidade: form.unidade,
        marca_id: form.marca_id || null,
        marca_nome: form.marca_nome || null,
        imagem_url: produto?.imagem_url ?? null,
        ativo: form.ativo,
        estoque_atual: parseFloat(form.estoque_atual) || 0,
        estoque_minimo: parseFloat(form.estoque_minimo) || 0,
        status_homologacao: (produto?.status_homologacao ?? 'homologado') as 'homologado' | 'em_teste' | 'reprovado' | 'pendente',
        feedback_teste: produto?.feedback_teste ?? null,
        data_inicio_teste: produto?.data_inicio_teste ?? null,
        aprovado_por: produto?.aprovado_por ?? null,
        aprovacao_at: produto?.aprovacao_at ?? null,
        created_by: produto ? produto.created_by : (user?.name ?? null),
        // Dados de compra
        ultimo_preco_compra: novoPreco,
        preco_anterior_compra: novoPreco && produto?.ultimo_preco_compra && novoPreco !== produto.ultimo_preco_compra
          ? produto.ultimo_preco_compra
          : (produto?.preco_anterior_compra ?? null),
        data_ultima_compra: produto?.data_ultima_compra ?? null,
        fornecedor_padrao_id: produto?.fornecedor_padrao_id ?? null,
        fornecedor_padrao_nome: form.fornecedor_padrao_nome.trim() || null,
        // PDV
        preco_venda: form.preco_venda ? parseFloat(form.preco_venda) : null,
        disponivel_pdv: form.disponivel_pdv,
      }
      const saved = produto
        ? await updateProduto(produto.id, payload)
        : await insertProduto(payload)
      toast(produto ? 'Produto atualizado!' : 'Produto cadastrado!')
      setTimeout(() => onSalvo(saved), 600)
    } catch (e: any) {
      if (e.message?.includes('unique') || e.message?.includes('duplicate')) {
        toast('Código interno já existe para esta loja', 'err')
        setErros(prev => ({ ...prev, codigo_interno: 'Código já existe' }))
      } else {
        toast('Erro ao salvar produto', 'err')
      }
    }
    setSaving(false)
  }

  return (
    <div>
      {ToastEl}
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
        <button className="btn bo bsm" onClick={onVoltar}><ChevronLeft size={12}/> Voltar</button>
        <div>
          <h2 style={{ margin:0, fontSize:18, fontWeight:800 }}>
            {produto ? 'Editar Produto' : 'Cadastrar Produto'}
          </h2>
          <p style={{ margin:0, fontSize:12, color:'var(--muted)' }}>
            {produto ? `Editando: ${produto.nome}` : 'Preencha os campos para cadastrar um novo produto'}
          </p>
        </div>
        <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
          <button className="btn bo" onClick={onVoltar}>Cancelar</button>
          <button className="btn bp" onClick={salvar} disabled={saving}>
            {saving ? <><Loader size={12} className="spin"/> Salvando...</> : <><Check size={12}/> Salvar Produto</>}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:0, marginBottom:20, borderBottom:'2px solid var(--border)' }}>
        {(['dados','estoque'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              padding:'8px 18px', border:'none', background:'none', cursor:'pointer', fontSize:13,
              fontWeight: tab===t ? 800 : 500, color: tab===t ? 'var(--bordo)' : 'var(--muted)',
              borderBottom: tab===t ? '2px solid var(--bordo)' : '2px solid transparent',
              marginBottom:-2,
            }}>
            {t==='dados' ? '📋 Dados do Produto' : '📦 Estoque'}
          </button>
        ))}
      </div>

      {tab === 'dados' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, maxWidth:900 }}>
          {/* Código interno */}
          <div className="fg">
            <label className="fl">Código Interno <span className="rq">*</span></label>
            <input className={`inp${erros.codigo_interno?' err':''}`}
              value={form.codigo_interno}
              onChange={e => set('codigo_interno', e.target.value)}
              placeholder="Ex: PRD-001, BEBA-002"
              style={{ textTransform:'uppercase' }}
            />
            {erros.codigo_interno && <span style={{ fontSize:11, color:'var(--danger)' }}>{erros.codigo_interno}</span>}
          </div>

          {/* Nome */}
          <div className="fg">
            <label className="fl">Nome do Produto <span className="rq">*</span></label>
            <input className={`inp${erros.nome?' err':''}`}
              value={form.nome}
              onChange={e => set('nome', e.target.value)}
              placeholder="Ex: COCA-COLA 2L, ARROZ BRANCO TIPO 1"
            />
            {erros.nome && <span style={{ fontSize:11, color:'var(--danger)' }}>{erros.nome}</span>}
          </div>

          {/* Categoria */}
          <div className="fg">
            <label className="fl" style={{ display:'flex', justifyContent:'space-between' }}>
              <span>Categoria <span className="rq">*</span></span>
              <button onClick={() => setModalCat(true)} style={{ fontSize:10, color:'var(--bordo)', border:'none', background:'none', cursor:'pointer', fontWeight:700 }}>
                + Nova categoria
              </button>
            </label>
            <select className={`sel${erros.categoria_id?' err':''}`}
              value={form.categoria_id}
              onChange={e => selecCateg(e.target.value)}>
              <option value="">Selecione a categoria</option>
              {categorias.filter(c => c.ativo).map(c => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
            {erros.categoria_id && <span style={{ fontSize:11, color:'var(--danger)' }}>{erros.categoria_id}</span>}
          </div>

          {/* Gramatura + Unidade */}
          <div className="fg">
            <label className="fl">Gramatura / Unidade <span className="rq">*</span></label>
            <div style={{ display:'flex', gap:8 }}>
              <input className="inp" type="number" min={0} step={0.001} style={{ width:100 }}
                value={form.gramatura}
                onChange={e => set('gramatura', e.target.value)}
                placeholder="Ex: 500" />
              <select className="sel" style={{ flex:1 }}
                value={form.unidade}
                onChange={e => set('unidade', e.target.value)}>
                {UNIDADES.map(u => <option key={u}>{u}</option>)}
              </select>
            </div>
          </div>

          {/* Marca */}
          <div className="fg">
            <label className="fl" style={{ display:'flex', justifyContent:'space-between' }}>
              <span>Marca de Preferência</span>
              <button onClick={() => setModalMarca(true)} style={{ fontSize:10, color:'var(--bordo)', border:'none', background:'none', cursor:'pointer', fontWeight:700 }}>
                + Nova marca
              </button>
            </label>
            <select className="sel" value={form.marca_id} onChange={e => selecMarca(e.target.value)}>
              <option value="">Sem marca definida</option>
              {marcas.filter(m => m.ativo).map(m => (
                <option key={m.id} value={m.id}>{m.nome}</option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div className="fg" style={{ display:'flex', alignItems:'center', gap:12, paddingTop:22 }}>
            <button
              onClick={() => set('ativo', !form.ativo)}
              style={{ border:'none', background:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:8, fontSize:13, fontWeight:700, color: form.ativo ? 'var(--success)' : 'var(--muted)' }}>
              {form.ativo ? <ToggleRight size={22}/> : <ToggleLeft size={22}/>}
              {form.ativo ? 'Produto Ativo' : 'Produto Inativo'}
            </button>
          </div>

          {/* Descrição — full width */}
          <div className="fg" style={{ gridColumn:'1/-1' }}>
            <label className="fl">Descrição</label>
            <textarea className="inp" rows={3}
              value={form.descricao}
              onChange={e => set('descricao', e.target.value)}
              placeholder="Descrição adicional do produto..."
              style={{ resize:'vertical' }} />
          </div>
        </div>
      )}

      {tab === 'estoque' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, maxWidth:700 }}>
          <div className="fg">
            <label className="fl">Estoque Atual</label>
            <input className="inp" type="number" min={0} step={0.01}
              value={form.estoque_atual}
              onChange={e => set('estoque_atual', e.target.value)} />
          </div>
          <div className="fg">
            <label className="fl">Estoque Mínimo <span style={{ fontSize:10, color:'var(--muted)' }}>(alerta de reposição)</span></label>
            <input className="inp" type="number" min={0} step={0.01}
              value={form.estoque_minimo}
              onChange={e => set('estoque_minimo', e.target.value)} />
          </div>
          {parseFloat(form.estoque_atual||'0') <= parseFloat(form.estoque_minimo||'0') && parseFloat(form.estoque_minimo||'0') > 0 && (
            <div style={{ gridColumn:'1/-1', display:'flex', alignItems:'center', gap:8, padding:'10px 14px', background:'#FEF3C7', borderRadius:8, color:'#92400E', fontSize:12, fontWeight:700 }}>
              <AlertTriangle size={14}/> Estoque abaixo do mínimo — produto crítico
            </div>
          )}
          {/* Separador */}
          <div style={{ gridColumn:'1/-1', borderTop:'1px solid var(--border)', paddingTop:16, marginTop:4 }}>
            <span style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1 }}>Dados de Compra</span>
          </div>
          <div className="fg">
            <label className="fl">Último Preço de Compra <span style={{ fontSize:10, color:'var(--muted)' }}>(R$)</span></label>
            <input className="inp" type="number" min={0} step={0.01} placeholder="0,00"
              value={form.ultimo_preco_compra}
              onChange={e => set('ultimo_preco_compra', e.target.value)} />
            {produto?.preco_anterior_compra && (
              <span style={{ fontSize:10, color:'var(--muted)', marginTop:2, display:'block' }}>
                Preço anterior: R$ {produto.preco_anterior_compra.toFixed(2).replace('.',',')}
              </span>
            )}
          </div>
          <div className="fg">
            <label className="fl">Fornecedor Padrão</label>
            <input className="inp" placeholder="Nome do fornecedor habitual..."
              value={form.fornecedor_padrao_nome}
              onChange={e => set('fornecedor_padrao_nome', e.target.value)} />
          </div>
          {produto?.data_ultima_compra && (
            <div style={{ gridColumn:'1/-1', fontSize:11, color:'var(--muted)', display:'flex', alignItems:'center', gap:6, padding:'8px 12px', background:'var(--bg)', borderRadius:8 }}>
              <Package size={12}/> Última compra registrada em: <strong>{fmtData(produto.data_ultima_compra)}</strong>
              {produto.fornecedor_padrao_nome && <> — Fornecedor: <strong>{produto.fornecedor_padrao_nome}</strong></>}
            </div>
          )}
          {/* Separador PDV */}
          <div style={{ gridColumn:'1/-1', borderTop:'1px solid var(--border)', paddingTop:16, marginTop:4 }}>
            <span style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1 }}>PDV — Ponto de Venda</span>
          </div>
          <div className="fg">
            <label className="fl">Preço de Venda (R$)</label>
            <input className="inp" type="number" min={0} step={0.01} placeholder="0,00"
              value={form.preco_venda}
              onChange={e => set('preco_venda', e.target.value)} />
            <span style={{ fontSize:10, color:'var(--muted)', marginTop:2, display:'block' }}>Preço ao público no PDV</span>
          </div>
          <div className="fg" style={{ display:'flex', alignItems:'center', gap:10, paddingTop:20 }}>
            <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', userSelect:'none', fontSize:13, fontWeight:600 }}>
              <input type="checkbox" checked={form.disponivel_pdv}
                onChange={e => setForm(f => ({ ...f, disponivel_pdv: e.target.checked }))}
                style={{ width:16, height:16, accentColor:'var(--bordo)', cursor:'pointer' }} />
              Disponível no PDV
            </label>
            <span style={{ fontSize:11, color:'var(--muted)' }}>Exibir no Ponto de Venda</span>
          </div>
        </div>
      )}

      {/* Modais */}
      {modalCat && (
        <ModalCategoria loja={loja} cat={null}
          onSalvo={c => { setCategorias(prev => [...prev, c].sort((a,b) => a.nome.localeCompare(b.nome))); selecCateg(c.id); setModalCat(false) }}
          onFechar={() => setModalCat(false)} />
      )}
      {modalMarca && (
        <ModalMarca loja={loja} marca={null}
          onSalvo={m => { setMarcas(prev => [...prev, m].sort((a,b) => a.nome.localeCompare(b.nome))); selecMarca(m.id); setModalMarca(false) }}
          onFechar={() => setModalMarca(false)} />
      )}
    </div>
  )
}

// ── View Categorias ──────────────────────────────────────────

function CategoriasView({ loja, onVoltar }: { loja: string; onVoltar: () => void }) {
  const { toast, ToastEl } = useToast()
  const [cats, setCats] = useState<CategoriaProduto[]>([])
  const [contagem, setContagem] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<CategoriaProduto | null | 'nova'>(null)
  const [confirmDel, setConfirmDel] = useState<CategoriaProduto | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [c, ct] = await Promise.all([
        fetchCategoriasProduto(loja),
        fetchContagemPorCategoria(loja),
      ])
      setCats(c)
      const m: Record<string, number> = {}
      ct.forEach(r => { if (r.categoria_nome) m[r.categoria_nome] = r.total })
      setContagem(m)
    } catch {}
    setLoading(false)
  }, [loja])

  useEffect(() => { load() }, [load])

  const toggleAtivo = async (c: CategoriaProduto) => {
    try {
      const updated = await updateCategoriaProduto(c.id, { ativo: !c.ativo })
      setCats(prev => prev.map(x => x.id === c.id ? updated : x))
      toast(updated.ativo ? 'Categoria ativada' : 'Categoria inativada')
    } catch { toast('Erro ao atualizar', 'err') }
  }

  const excluir = async () => {
    if (!confirmDel) return
    try {
      await deleteCategoriaProduto(confirmDel.id)
      setCats(prev => prev.filter(c => c.id !== confirmDel.id))
      toast('Categoria removida')
    } catch { toast('Não é possível remover — existem produtos vinculados', 'err') }
    setConfirmDel(null)
  }

  return (
    <div>
      {ToastEl}
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
        <button className="btn bo bsm" onClick={onVoltar}><ChevronLeft size={12}/> Produtos</button>
        <h2 style={{ margin:0, fontSize:18, fontWeight:800 }}>Gestão de Categorias</h2>
        <button className="btn bp bsm" style={{ marginLeft:'auto' }} onClick={() => setModal('nova')}>
          <Plus size={12}/> Nova Categoria
        </button>
      </div>

      {loading ? <div className="empty"><Loader size={24} className="spin"/></div> : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px,1fr))', gap:12 }}>
          {cats.map(c => (
            <div key={c.id} className="card" style={{ padding:'14px 16px', opacity: c.ativo ? 1 : 0.6 }}>
              <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:6 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <div style={{ width:32, height:32, borderRadius:8, background:'var(--bordo-bg)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--bordo)' }}>
                    <Tag size={14}/>
                  </div>
                  <div>
                    <div style={{ fontWeight:800, fontSize:13 }}>{c.nome}</div>
                    <div style={{ fontSize:10, color:'var(--muted)' }}>{contagem[c.nome] ?? 0} produto(s)</div>
                  </div>
                </div>
                <Badge label={c.ativo ? 'Ativa' : 'Inativa'} color={c.ativo ? 'var(--success)' : 'var(--muted)'} bg={c.ativo ? '#D1FAE5' : '#F3F4F6'}/>
              </div>
              <div className="ab" style={{ gap:4, marginTop:10 }}>
                <button className="ib" title="Editar" onClick={() => setModal(c)}><Edit3 size={12}/></button>
                <button className="ib" title={c.ativo ? 'Inativar' : 'Ativar'} onClick={() => toggleAtivo(c)}>
                  {c.ativo ? <ToggleRight size={12}/> : <ToggleLeft size={12}/>}
                </button>
                <button className="ib rd" title="Excluir" onClick={() => setConfirmDel(c)}><Trash2 size={12}/></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal nova/editar */}
      {modal && (
        <ModalCategoria loja={loja}
          cat={modal === 'nova' ? null : modal}
          onSalvo={c => {
            setCats(prev => modal === 'nova' ? [...prev, c].sort((a,b)=>a.nome.localeCompare(b.nome)) : prev.map(x=>x.id===c.id?c:x))
            toast(modal === 'nova' ? 'Categoria criada!' : 'Categoria atualizada!')
            setModal(null)
          }}
          onFechar={() => setModal(null)} />
      )}

      {/* Confirm excluir */}
      {confirmDel && (
        <div className="ov open" onClick={() => setConfirmDel(null)}>
          <div className="modal" style={{ maxWidth:380 }} onClick={e => e.stopPropagation()}>
            <div className="mhd"><span className="mtt">Excluir Categoria</span><button className="mx" onClick={() => setConfirmDel(null)}>✕</button></div>
            <div className="mbd">
              <p style={{ margin:0, fontSize:13 }}>Excluir <strong>{confirmDel.nome}</strong>? Produtos vinculados perderão a categoria.</p>
            </div>
            <div className="mft">
              <button className="btn bo" onClick={() => setConfirmDel(null)}>Cancelar</button>
              <button className="btn" style={{ background:'var(--danger)', color:'#fff' }} onClick={excluir}><Trash2 size={11}/> Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Lista de Produtos ────────────────────────────────────────

export default function ProdutosPage({ initialView }: { initialView?: 'lista'|'categorias' }) {
  const { loja } = useLoja()
  const { toast, ToastEl } = useToast()

  type View = 'lista' | 'novo' | 'editar' | 'categorias' | 'em_teste'
  const [view, setView] = useState<View>(initialView ?? 'lista')
  const [produtoAtivo, setProdutoAtivo] = useState<Produto | null>(null)

  const [produtos, setProdutos] = useState<Produto[]>([])
  const [categorias, setCategorias] = useState<CategoriaProduto[]>([])
  const [loading, setLoading] = useState(true)

  // Filtros (espelhando o Foozi)
  const [busca, setBusca] = useState('')
  const [filtroCat, setFiltroCat] = useState('')
  const [filtroAtivo, setFiltroAtivo] = useState<'todos'|'ativo'|'inativo'>('todos')
  const [filtroEstoque, setFiltroEstoque] = useState(false)
  const [ordenar, setOrdenar] = useState<'nome'|'categoria'|'updated'|'estoque'>('nome')
  const [confirmDel, setConfirmDel] = useState<Produto | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [p, c] = await Promise.all([
        fetchProdutos(loja),
        fetchCategoriasProduto(loja),
      ])
      setProdutos(p)
      setCategorias(c)
    } catch {}
    setLoading(false)
  }, [loja])

  useEffect(() => { load() }, [load])

  const todasAsLojas = loja === 'Todas as Lojas'

  const abrirEditar = (p: Produto) => {
    if (todasAsLojas) { toast('Selecione uma loja específica para editar produtos', 'err'); return }
    setProdutoAtivo(p); setView('editar')
  }
  const abrirNovo = () => {
    if (todasAsLojas) { toast('Selecione uma loja específica para cadastrar produtos', 'err'); return }
    setProdutoAtivo(null); setView('novo')
  }

  const handleSalvo = (p: Produto) => {
    setProdutos(prev => {
      const exists = prev.find(x => x.id === p.id)
      return exists ? prev.map(x => x.id===p.id ? p : x) : [p, ...prev]
    })
    setView('lista')
  }

  const handleDuplicar = async (p: Produto) => {
    try {
      const copia = await duplicarProduto(p.id, loja)
      setProdutos(prev => [copia, ...prev])
      toast(`Cópia de "${p.nome}" criada`)
    } catch { toast('Erro ao duplicar produto', 'err') }
  }

  const handleToggleAtivo = async (p: Produto) => {
    try {
      const updated = await updateProduto(p.id, { ativo: !p.ativo })
      setProdutos(prev => prev.map(x => x.id===p.id ? updated : x))
      toast(updated.ativo ? 'Produto ativado' : 'Produto inativado')
    } catch { toast('Erro ao atualizar', 'err') }
  }

  const confirmarDelete = async () => {
    if (!confirmDel) return
    try {
      await deleteProduto(confirmDel.id)
      setProdutos(prev => prev.filter(x => x.id !== confirmDel.id))
      toast('Produto excluído')
    } catch { toast('Erro ao excluir produto', 'err') }
    setConfirmDel(null)
  }

  // Sub-views
  if (view === 'novo' || view === 'editar') {
    return <FormProduto loja={loja} produto={produtoAtivo} onSalvo={handleSalvo} onVoltar={() => setView('lista')} />
  }
  if (view === 'categorias') {
    return <CategoriasView loja={loja} onVoltar={() => setView('lista')} />
  }
  if (view === 'em_teste') {
    return <EmTesteView loja={loja} produtos={produtos} onVoltar={() => setView('lista')} onRefresh={load} />
  }

  // Filtrar e ordenar
  const filtrados = produtos
    .filter(p => !busca || p.nome.toLowerCase().includes(busca.toLowerCase()) || p.codigo_interno.toLowerCase().includes(busca.toLowerCase()))
    .filter(p => !filtroCat || p.categoria_nome === filtroCat)
    .filter(p => filtroAtivo === 'todos' ? true : filtroAtivo === 'ativo' ? p.ativo : !p.ativo)
    .filter(p => !filtroEstoque || p.estoque_atual <= p.estoque_minimo)
    .sort((a, b) => {
      if (ordenar === 'nome')      return a.nome.localeCompare(b.nome)
      if (ordenar === 'categoria') return (a.categoria_nome??'').localeCompare(b.categoria_nome??'')
      if (ordenar === 'estoque')   return a.estoque_atual - b.estoque_atual
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    })

  const totalAtivos   = produtos.filter(p => p.ativo).length
  const totalCriticos = produtos.filter(p => p.estoque_atual <= p.estoque_minimo && p.estoque_minimo > 0).length
  const totalEmTeste  = produtos.filter(p => p.status_homologacao === 'em_teste' || p.status_homologacao === 'pendente').length

  return (
    <div>
      {ToastEl}

      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom:16 }}>
        <div className="kpi">
          <div className="kpi-ac" style={{ background:'var(--bordo)' }}/>
          <div className="kpi-lbl">Total de Produtos</div>
          <div className="kpi-val">{produtos.length}</div>
          <div className="kpi-sub">{loja}</div>
        </div>
        <div className="kpi">
          <div className="kpi-ac" style={{ background:'var(--success)' }}/>
          <div className="kpi-lbl">Ativos</div>
          <div className="kpi-val" style={{ color:'var(--success)' }}>{totalAtivos}</div>
          <div className="kpi-sub">produtos ativos</div>
        </div>
        <div className="kpi">
          <div className="kpi-ac" style={{ background:'var(--warning)' }}/>
          <div className="kpi-lbl">Estoque Crítico</div>
          <div className="kpi-val" style={{ color: totalCriticos > 0 ? 'var(--warning)' : 'var(--muted)' }}>{totalCriticos}</div>
          <div className="kpi-sub">abaixo do mínimo</div>
        </div>
        <div className="kpi">
          <div className="kpi-ac" style={{ background:'var(--blue)' }}/>
          <div className="kpi-lbl">Categorias</div>
          <div className="kpi-val">{categorias.filter(c=>c.ativo).length}</div>
          <div className="kpi-sub">
            <button onClick={() => setView('categorias')} style={{ fontSize:10, color:'var(--bordo)', border:'none', background:'none', cursor:'pointer', fontWeight:700, padding:0 }}>
              Gerenciar →
            </button>
          </div>
        </div>
        <div className="kpi" style={{ cursor: 'pointer' }} onClick={() => setView('em_teste')}>
          <div className="kpi-ac" style={{ background: totalEmTeste > 0 ? '#8B5CF6' : 'var(--muted)' }}/>
          <div className="kpi-lbl">Em Teste</div>
          <div className="kpi-val" style={{ color: totalEmTeste > 0 ? '#8B5CF6' : 'var(--muted)' }}>{totalEmTeste}</div>
          <div className="kpi-sub">
            <span style={{ fontSize:10, color:'#8B5CF6', fontWeight:700 }}>Ver avaliações →</span>
          </div>
        </div>
      </div>

      {/* Banner: selecionar loja */}
      {todasAsLojas && (
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', background:'#FEF3C7', borderRadius:8, marginBottom:12, color:'#92400E', fontSize:12, fontWeight:600 }}>
          <AlertTriangle size={14}/>
          Você está visualizando todas as lojas. Selecione uma loja específica na barra superior para cadastrar ou editar produtos.
        </div>
      )}

      {/* Tabela */}
      <div className="card">
        {/* Header da tabela */}
        <div className="card-hd">
          <span className="card-tt"><Package size={14} style={{ display:'inline', marginRight:4 }}/>Lista de Produtos</span>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn bo bsm" onClick={() => setView('em_teste')} style={{ color: '#8B5CF6', borderColor: '#8B5CF6' }}><Award size={12}/> Em Teste{totalEmTeste > 0 && <span style={{ background:'#8B5CF6', color:'#fff', borderRadius:10, padding:'1px 5px', fontSize:9, marginLeft:3 }}>{totalEmTeste}</span>}</button>
            <button className="btn bo bsm" onClick={() => setView('categorias')}><Grid3X3 size={12}/> Categorias</button>
            <button className="btn bo bsm" onClick={load}><RefreshCw size={12}/></button>
            <button className="btn bp bsm" onClick={abrirNovo} disabled={todasAsLojas} title={todasAsLojas ? 'Selecione uma loja específica' : undefined}><Plus size={12}/> Criar Produto</button>
          </div>
        </div>

        {/* Filtros — padrão Foozi */}
        <div style={{ padding:'10px 15px', borderBottom:'1px solid var(--border)', display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
          <div className="sw-wrap" style={{ flex:1, minWidth:200 }}>
            <Search size={12} style={{ position:'absolute', left:8, top:'50%', transform:'translateY(-50%)', color:'var(--muted)', pointerEvents:'none' }}/>
            <input className="srch" placeholder="Buscar por nome ou código..." value={busca} onChange={e => setBusca(e.target.value)}/>
          </div>
          <select className="flt" value={filtroCat} onChange={e => setFiltroCat(e.target.value)}>
            <option value="">Todas as categorias</option>
            {categorias.filter(c=>c.ativo).map(c => <option key={c.id} value={c.nome}>{c.nome}</option>)}
          </select>
          <select className="flt" value={filtroAtivo} onChange={e => setFiltroAtivo(e.target.value as typeof filtroAtivo)}>
            <option value="todos">Todos</option>
            <option value="ativo">Ativos</option>
            <option value="inativo">Inativos</option>
          </select>
          <select className="flt" value={ordenar} onChange={e => setOrdenar(e.target.value as typeof ordenar)}>
            <option value="nome">Nome (A→Z)</option>
            <option value="categoria">Categoria</option>
            <option value="updated">Última atualização</option>
            <option value="estoque">Estoque</option>
          </select>
          <button
            className={`btn bsm${filtroEstoque?' bp':' bo'}`}
            onClick={() => setFiltroEstoque(o => !o)}
            title="Apenas produtos com estoque crítico"
            style={{ display:'flex', alignItems:'center', gap:4 }}>
            <AlertTriangle size={11}/> Críticos
          </button>
          {(busca || filtroCat || filtroAtivo !== 'todos' || filtroEstoque) && (
            <button className="btn bo bsm" onClick={() => { setBusca(''); setFiltroCat(''); setFiltroAtivo('todos'); setFiltroEstoque(false) }}>
              <X size={10}/> Limpar
            </button>
          )}
        </div>

        {/* Conteúdo */}
        {loading ? (
          <div className="empty"><Loader size={24} className="spin"/></div>
        ) : filtrados.length === 0 ? (
          <div className="empty" style={{ padding:'48px 0' }}>
            <Package size={40} style={{ opacity:.3 }}/>
            <div style={{ marginTop:10, fontWeight:600 }}>
              {produtos.length === 0 ? 'Nenhum produto cadastrado' : 'Nenhum produto encontrado'}
            </div>
            {produtos.length === 0 && (
              <button className="btn bp bsm" style={{ marginTop:12 }} onClick={abrirNovo}>
                <Plus size={11}/> Criar primeiro produto
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Produto</th>
                    <th>Categoria</th>
                    <th>Marca</th>
                    <th>Estoque</th>
                    <th>Últ. Preço</th>
                    <th>Últ. Compra</th>
                    <th>Variação</th>
                    <th>Status</th>
                    <th style={{ width:90 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map(p => {
                    const critico = p.estoque_atual <= p.estoque_minimo && p.estoque_minimo > 0
                    return (
                      <tr key={p.id} style={{ opacity: p.ativo ? 1 : 0.55 }}>
                        <td>
                          <code style={{ fontSize:10, background:'var(--bg)', padding:'2px 6px', borderRadius:4, fontWeight:700 }}>
                            {p.codigo_interno}
                          </code>
                        </td>
                        <td>
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <div style={{ width:30, height:30, borderRadius:7, background:'var(--bordo-bg)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--bordo)', flexShrink:0 }}>
                              <Package size={13}/>
                            </div>
                            <div>
                              <strong style={{ fontSize:12 }}>{p.nome}</strong>
                              {p.descricao && <div style={{ fontSize:10, color:'var(--muted)', maxWidth:220, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.descricao}</div>}
                            </div>
                          </div>
                        </td>
                        <td>
                          {p.categoria_nome
                            ? <span style={{ fontSize:10, padding:'2px 8px', borderRadius:12, background:'var(--bordo-bg)', color:'var(--bordo)', fontWeight:700 }}>{p.categoria_nome}</span>
                            : <span style={{ color:'var(--muted)', fontSize:11 }}>—</span>}
                        </td>
                        <td style={{ fontSize:11, color:'var(--muted)' }}>{p.marca_nome || '—'}</td>
                        <td>
                          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                            {critico && <AlertTriangle size={11} style={{ color:'var(--warning)', flexShrink:0 }}/>}
                            <span style={{ fontSize:12, fontWeight:600, color: critico ? 'var(--warning)' : 'var(--text)' }}>
                              {p.estoque_atual}
                            </span>
                            {p.estoque_minimo > 0 && (
                              <span style={{ fontSize:9, color:'var(--muted)' }}>/ min {p.estoque_minimo}</span>
                            )}
                          </div>
                        </td>
                        <td style={{ fontSize:12, fontWeight:700, color: p.ultimo_preco_compra ? 'var(--bordo)' : 'var(--muted)' }}>
                          {p.ultimo_preco_compra ? `R$ ${p.ultimo_preco_compra.toFixed(2).replace('.', ',')}` : '—'}
                        </td>
                        <td style={{ fontSize:10, color:'var(--muted)' }}>
                          {p.data_ultima_compra ? fmtData(p.data_ultima_compra) : '—'}
                        </td>
                        <td>
                          {p.ultimo_preco_compra && p.preco_anterior_compra ? (
                            (() => {
                              const diff = p.ultimo_preco_compra - p.preco_anterior_compra
                              const pct = ((diff / p.preco_anterior_compra) * 100).toFixed(1)
                              const up = diff > 0
                              return (
                                <span style={{ fontSize:10, fontWeight:700, color: up ? 'var(--danger)' : 'var(--success)', background: up ? '#FEE2E2' : '#D1FAE5', padding:'2px 6px', borderRadius:8 }}>
                                  {up ? '▲' : '▼'} {Math.abs(parseFloat(pct))}%
                                </span>
                              )
                            })()
                          ) : <span style={{ color:'var(--muted)', fontSize:11 }}>—</span>}
                        </td>
                        <td>
                          <Badge
                            label={p.ativo ? 'Ativo' : 'Inativo'}
                            color={p.ativo ? 'var(--success)' : 'var(--muted)'}
                            bg={p.ativo ? '#D1FAE5' : '#F3F4F6'}
                          />
                        </td>
                        <td onClick={e => e.stopPropagation()}>
                          <div className="ab" style={{ gap:3 }}>
                            <button className="ib" onClick={() => abrirEditar(p)} title="Editar"><Edit3 size={12}/></button>
                            <button className="ib" onClick={() => handleDuplicar(p)} title="Duplicar"><Copy size={12}/></button>
                            <button className="ib" onClick={() => handleToggleAtivo(p)} title={p.ativo ? 'Inativar' : 'Ativar'}>
                              {p.ativo ? <ToggleRight size={12}/> : <ToggleLeft size={12}/>}
                            </button>
                            <button className="ib rd" onClick={() => setConfirmDel(p)} title="Excluir"><Trash2 size={12}/></button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ padding:'8px 15px', borderTop:'1px solid var(--border)', fontSize:11, color:'var(--muted)' }}>
              {filtrados.length} de {produtos.length} produto(s) exibido(s)
            </div>
          </>
        )}
      </div>

      {/* Modal confirm excluir */}
      {confirmDel && (
        <div className="ov open" onClick={() => setConfirmDel(null)}>
          <div className="modal" style={{ maxWidth:400 }} onClick={e => e.stopPropagation()}>
            <div className="mhd">
              <span className="mtt">Excluir Produto</span>
              <button className="mx" onClick={() => setConfirmDel(null)}>✕</button>
            </div>
            <div className="mbd">
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ width:40, height:40, borderRadius:10, background:'#FEE2E2', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <Trash2 size={18} style={{ color:'var(--danger)' }}/>
                </div>
                <div>
                  <div style={{ fontWeight:700 }}>{confirmDel.nome}</div>
                  <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>Esta ação não pode ser desfeita.</div>
                </div>
              </div>
            </div>
            <div className="mft">
              <button className="btn bo" onClick={() => setConfirmDel(null)}>Cancelar</button>
              <button className="btn" style={{ background:'var(--danger)', color:'#fff' }} onClick={confirmarDelete}>
                <Trash2 size={11}/> Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirm delete + filter icon placeholder */}
      <div style={{ display:'none' }}><Filter/><Award/><Building2/></div>
    </div>
  )
}

// ── Em Teste View ─────────────────────────────────────────────

function EmTesteView({ produtos, onVoltar, onRefresh }: {
  loja: string; produtos: Produto[];
  onVoltar: () => void; onRefresh: () => Promise<void>
}) {
  const { toast } = useToast()
  const [atualizando, setAtualizando] = useState<string | null>(null)
  const [modalProduto, setModalProduto] = useState<Produto | null>(null)
  const [feedback, setFeedback] = useState('')
  const [novaStatus, setNovaStatus] = useState<HomologacaoStatus>('homologado')

  const emTeste = produtos.filter(p =>
    p.status_homologacao === 'em_teste' || p.status_homologacao === 'pendente' || p.status_homologacao === 'reprovado'
  )

  const aprovar = async (p: Produto, status: HomologacaoStatus, fb?: string) => {
    setAtualizando(p.id)
    try {
      await updateProdutoHomologacao(p.id, status, {
        feedback_teste: fb ?? p.feedback_teste ?? undefined,
        aprovado_por: undefined,
        aprovacao_at: status === 'homologado' ? new Date().toISOString() : undefined,
      })
      await insertProdutoTeste({
        produto_id: p.id,
        loja: p.loja,
        resultado: status === 'homologado' ? 'aprovado' : status === 'reprovado' ? 'reprovado' : 'em_teste',
        avaliador: null,
        nota_sabor: null,
        nota_custo: null,
        nota_fornecimento: null,
        comentario: fb ?? null,
        substituiu_produto: null,
      })
      toast(status === 'homologado' ? `${p.nome} aprovado!` : status === 'reprovado' ? `${p.nome} reprovado.` : `${p.nome} em teste.`)
      await onRefresh()
      setModalProduto(null)
    } catch {
      toast('Erro ao atualizar status.', 'err')
    }
    setAtualizando(null)
  }

  const STATUS_MAP: Record<HomologacaoStatus, { label: string; color: string; bg: string }> = {
    homologado: { label: 'Homologado', color: '#10B981', bg: '#D1FAE5' },
    em_teste:   { label: 'Em Teste',   color: '#8B5CF6', bg: '#EDE9FE' },
    pendente:   { label: 'Pendente',   color: '#F59E0B', bg: '#FEF3C7' },
    reprovado:  { label: 'Reprovado',  color: '#EF4444', bg: '#FEE2E2' },
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <button className="btn bo bsm" onClick={onVoltar}><ChevronLeft size={12} /> Voltar</button>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>🧪 Produtos em Avaliação</h2>
          <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--muted)' }}>
            Produtos pendentes, em teste ou reprovados — gerencie o processo de homologação
          </p>
        </div>
      </div>

      {/* Resumo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { status: 'em_teste', ...STATUS_MAP['em_teste'] },
          { status: 'pendente', ...STATUS_MAP['pendente'] },
          { status: 'reprovado', ...STATUS_MAP['reprovado'] },
        ].map(s => (
          <div key={s.status} className="card" style={{ padding: '12px 14px', borderLeft: `3px solid ${s.color}` }}>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{s.label}</div>
            <div style={{ fontWeight: 800, fontSize: 20, color: s.color }}>
              {emTeste.filter(p => p.status_homologacao === s.status).length}
            </div>
          </div>
        ))}
      </div>

      {emTeste.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
          <Check size={32} style={{ opacity: .3, marginBottom: 8 }} />
          <div>Todos os produtos estão homologados.</div>
        </div>
      ) : (
        <div className="card">
          <div className="card-hd"><span className="card-tt">Produtos para Avaliação</span><span className="badge bg-b">{emTeste.length} produtos</span></div>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Produto</th><th>Categoria</th><th>Status</th><th>Feedback</th><th>Ações</th></tr></thead>
              <tbody>
                {emTeste.map(p => {
                  const s = STATUS_MAP[p.status_homologacao]
                  return (
                    <tr key={p.id}>
                      <td><strong style={{ fontSize: 12 }}>{p.nome}</strong><div style={{ fontSize: 10, color: 'var(--muted)' }}>{p.codigo_interno}</div></td>
                      <td style={{ fontSize: 11 }}>{p.categoria_nome ?? '—'}</td>
                      <td>
                        <span style={{ background: s.bg, color: s.color, borderRadius: 12, padding: '2px 8px', fontSize: 10.5, fontWeight: 700 }}>
                          {s.label}
                        </span>
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.feedback_teste ?? '—'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 5 }}>
                          <button className="btn bp bsm" style={{ fontSize: 10 }} onClick={() => { setModalProduto(p); setNovaStatus('homologado'); setFeedback(p.feedback_teste ?? '') }} disabled={!!atualizando}>
                            <Check size={10} /> Aprovar
                          </button>
                          <button className="btn bo bsm" style={{ fontSize: 10, color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={() => { setModalProduto(p); setNovaStatus('reprovado'); setFeedback(p.feedback_teste ?? '') }} disabled={!!atualizando}>
                            <X size={10} /> Reprovar
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de decisão */}
      {modalProduto && (
        <div className="ov open" onClick={() => setModalProduto(null)}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div className="mhd">
              <span className="mtt">{novaStatus === 'homologado' ? '✅ Aprovar Produto' : '❌ Reprovar Produto'}</span>
              <button className="mx" onClick={() => setModalProduto(null)}>✕</button>
            </div>
            <div className="mbd" style={{ padding: '16px 18px' }}>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>{modalProduto.nome}</div>
              <div className="fg">
                <label className="fl">Status final</label>
                <select className="sel" value={novaStatus} onChange={e => setNovaStatus(e.target.value as HomologacaoStatus)}>
                  <option value="homologado">Homologado ✅</option>
                  <option value="em_teste">Manter em Teste 🧪</option>
                  <option value="reprovado">Reprovado ❌</option>
                </select>
              </div>
              <div className="fg" style={{ marginTop: 12 }}>
                <label className="fl">Feedback / Justificativa</label>
                <textarea className="inp" rows={3} value={feedback} onChange={e => setFeedback(e.target.value)} style={{ resize: 'vertical' }} placeholder="Descreva o motivo da decisão..." />
              </div>
            </div>
            <div className="mft">
              <button className="btn bo" onClick={() => setModalProduto(null)}>Cancelar</button>
              <button
                className="btn bp"
                onClick={() => aprovar(modalProduto, novaStatus, feedback)}
                disabled={!!atualizando}
                style={{ background: novaStatus === 'reprovado' ? 'var(--danger)' : undefined }}
              >
                {atualizando ? <Loader size={11} className="spin" /> : <Check size={11} />} Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
