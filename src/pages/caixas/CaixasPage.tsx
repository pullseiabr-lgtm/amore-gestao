import { useState, useEffect, useCallback, useMemo } from 'react'
import { Archive, RefreshCw, Loader, ChevronLeft, Store, Calendar, Trash2, Plus, Check } from 'lucide-react'
import { useLoja } from '../../contexts/LojaContext'
import { useAuth } from '../../contexts/AuthContext'
import { fetchCaixas, fetchCaixaItens, fetchTodosCaixaItens, deleteCaixa, insertCaixa, insertCaixaItens, lancarCaixaFinanceiro, fetchProfiles, uploadAnexo, updateCaixa } from '../../lib/db'
import { enviarWhatsApp, getZapiCfg, soDigitos } from '../../lib/notify'
import type { Caixa, CaixaItem } from '../../types/database'

const CATEGORIAS = ['Hortifruti', 'Supermercado', 'Bebidas', 'Embalagens/Descartaveis', 'Combustivel', 'Pedagio', 'Temperos', 'Folhagens', 'Outros']
const LOJAS = ['Amore CD', 'Amore Paiva', 'Flow CD']

const fmtR$ = (v: number | null | undefined) => v == null ? '—' : `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtData = (d: string | null) => { if (!d) return '—'; const [y, m, dd] = d.split('-'); return `${dd}/${m}/${y}` }

const CAT_COR: Record<string, string> = {
  Supermercado: '#2563EB', Hortifruti: '#16A34A', 'Embalagens/Descartaveis': '#B45309', Embalagens: '#B45309',
  Combustivel: '#DC2626', Pedagio: '#9333EA', Temperos: '#EA580C', Bebidas: '#0891B2', Folhagens: '#65A30D', Outros: '#6B7280',
}
const corCat = (c: string | null) => CAT_COR[c || 'Outros'] || '#6B7280'

function Bar({ pct, cor }: { pct: number; cor: string }) {
  return <div style={{ height: 8, background: 'var(--border)', borderRadius: 99, overflow: 'hidden', flex: 1, minWidth: 80 }}>
    <div style={{ height: '100%', width: `${pct}%`, background: cor, borderRadius: 99 }} /></div>
}

// ── Detalhe de um caixa ──────────────────────────────────────
function CaixaDetalhe({ caixa, onVoltar }: { caixa: Caixa; onVoltar: () => void }) {
  const [itens, setItens] = useState<CaixaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [anexoUrl, setAnexoUrl] = useState<string | null>(caixa.anexo_url)
  const [subindo, setSubindo] = useState(false)
  useEffect(() => { fetchCaixaItens(caixa.id).then(setItens).finally(() => setLoading(false)) }, [caixa.id])

  const anexarNota = async (file: File | null) => {
    if (!file) return
    setSubindo(true)
    try {
      const url = await uploadAnexo(file, 'caixas')
      await updateCaixa(caixa.id, { anexo_url: url })
      setAnexoUrl(url)
    } catch { alert('Falha ao anexar a nota.') }
    setSubindo(false)
  }

  return (
    <div>
      <button className="btn bo bsm" onClick={onVoltar} style={{ marginBottom: 14 }}><ChevronLeft size={12} /> Caixas</button>
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 6px', fontSize: 18 }}>{caixa.titulo}</h2>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: 'var(--muted)' }}>
          <span><Store size={12} /> {caixa.loja}</span>
          <span><Calendar size={12} /> {fmtData(caixa.periodo_inicio)} — {fmtData(caixa.periodo_fim)}</span>
          <span style={{ fontWeight: 800, color: 'var(--bordo)', fontSize: 15 }}>{fmtR$(caixa.total)}</span>
        </div>
        {caixa.observacoes && <div style={{ marginTop: 8, fontSize: 12, color: '#B45309', background: '#FEF3C7', padding: '6px 10px', borderRadius: 6 }}>⚠ {caixa.observacoes}</div>}
        <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {anexoUrl
            ? <a href={anexoUrl} target="_blank" rel="noreferrer"><button className="btn bp bsm">📎 Ver Notas Fiscais / Comprovantes</button></a>
            : <span style={{ fontSize: 11, color: 'var(--muted)' }}>📎 Sem comprovante anexado ainda</span>}
          <label className="btn bo bsm" style={{ cursor: 'pointer', margin: 0 }}>
            {subindo ? <><Loader size={12} className="spin" /> Enviando…</> : (anexoUrl ? '🔄 Trocar nota' : '📎 Anexar Nota Fiscal')}
            <input type="file" accept="application/pdf,image/*" style={{ display: 'none' }} disabled={subindo} onChange={e => anexarNota(e.target.files?.[0] || null)} />
          </label>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13 }}>Itens ({itens.length})</div>
        {loading && <div style={{ padding: 30, textAlign: 'center' }}><Loader size={18} className="spin" /></div>}
        {!loading && itens.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Sem itens detalhados neste caixa (valor total no cabeçalho).</div>}
        {!loading && itens.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead><tr style={{ background: 'var(--bordo-bg)' }}>
              <th style={{ textAlign: 'left', padding: '8px 12px' }}>Descrição</th><th style={{ textAlign: 'left', padding: '8px 12px' }}>Fornecedor</th>
              <th style={{ textAlign: 'left', padding: '8px 12px' }}>Categoria</th><th style={{ textAlign: 'left', padding: '8px 12px' }}>Preço unit.</th><th style={{ textAlign: 'right', padding: '8px 12px' }}>Valor</th>
            </tr></thead>
            <tbody>{itens.map(i => (
              <tr key={i.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '7px 12px', fontWeight: 600 }}>{i.descricao || '—'}{i.anexo_url && <a href={i.anexo_url} target="_blank" rel="noreferrer" style={{ marginLeft: 6, fontSize: 10 }}>📎 NF</a>}</td>
                <td style={{ padding: '7px 12px', color: 'var(--muted)' }}>{i.fornecedor || '—'}</td>
                <td style={{ padding: '7px 12px' }}><span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, background: corCat(i.categoria) + '22', color: corCat(i.categoria), fontWeight: 700 }}>{i.categoria || 'Outros'}</span></td>
                <td style={{ padding: '7px 12px', fontSize: 11, color: 'var(--muted)' }}>{i.documento || '—'}</td>
                <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 700 }}>{fmtR$(i.valor)}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Helpers de preço (para análise produto-a-produto) ────────
const parsePU = (doc: string | null): number | null => { const m = (doc || '').match(/unit\s+([\d.]+)/); return m ? parseFloat(m[1]) : null }
const normProd = (s: string | null) => (s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim()

// ── Formulário: Novo Caixa ───────────────────────────────────
type NovoItem = { descricao: string; categoria: string; fornecedor: string; valor: string }
function NovoCaixaForm({ lojaAtual, onClose, onSalvo }: { lojaAtual: string; onClose: () => void; onSalvo: () => void }) {
  const { user } = useAuth()
  const lojaInicial = LOJAS.includes(lojaAtual) ? lojaAtual : 'Amore CD'
  const [loja, setLoja] = useState(lojaInicial)
  const [titulo, setTitulo] = useState('')
  const [data, setData] = useState(new Date().toISOString().slice(0, 10))
  const [obs, setObs] = useState('')
  const [itens, setItens] = useState<NovoItem[]>([{ descricao: '', categoria: 'Hortifruti', fornecedor: '', valor: '' }])
  const [nfFile, setNfFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const totalItens = itens.reduce((s, i) => s + (parseFloat(i.valor.replace(',', '.')) || 0), 0)
  const setItem = (idx: number, patch: Partial<NovoItem>) => setItens(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it))
  const addItem = () => setItens(prev => [...prev, { descricao: '', categoria: 'Hortifruti', fornecedor: '', valor: '' }])
  const delItem = (idx: number) => setItens(prev => prev.filter((_, i) => i !== idx))

  const salvar = async () => {
    if (!titulo.trim()) { setErr('Informe o título do caixa'); return }
    const itensValidos = itens.filter(i => i.descricao.trim() && (parseFloat(i.valor.replace(',', '.')) || 0) > 0)
    if (totalItens <= 0) { setErr('Adicione ao menos um item com valor'); return }
    setSaving(true); setErr('')
    try {
      let anexoUrl: string | null = null
      if (nfFile) { try { anexoUrl = await uploadAnexo(nfFile, 'caixas') } catch { /* segue sem anexo */ } }
      const caixa = await insertCaixa({
        loja, titulo: titulo.trim(), periodo_inicio: data, periodo_fim: data, data_ref: data,
        total: totalItens, qtd_itens: itensValidos.length, arquivo_origem: null, origem: 'manual', status: 'arquivado',
        observacoes: obs.trim() || null, anexo_url: anexoUrl, created_by: user?.name || null,
      })
      const itensDb = itensValidos.map(i => ({
        caixa_id: caixa.id, data, fornecedor: i.fornecedor.trim() || null, categoria: i.categoria,
        descricao: i.descricao.trim(), valor: parseFloat(i.valor.replace(',', '.')) || 0,
      }))
      await insertCaixaItens(itensDb)
      // Lança automaticamente no Financeiro como prestação de contas
      await lancarCaixaFinanceiro(caixa, itensDb)
      onSalvo()
    } catch (e) { console.error(e); setErr('Erro ao salvar'); setSaving(false) }
  }

  return (
    <div className="ov open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 720 }} onClick={e => e.stopPropagation()}>
        <div className="mhd"><span className="mtt">🗄️ Novo Caixa de Despesas</span><button className="mx" onClick={onClose}>✕</button></div>
        <div className="mbd" style={{ maxHeight: '76vh', overflowY: 'auto' }}>
          <div className="g2" style={{ marginBottom: 12 }}>
            <div className="fg"><label className="fl">Loja <span className="rq">*</span></label>
              <select className="sel" value={loja} onChange={e => setLoja(e.target.value)}>{LOJAS.map(l => <option key={l}>{l}</option>)}</select></div>
            <div className="fg"><label className="fl">Data</label><input className="inp" type="date" value={data} onChange={e => setData(e.target.value)} /></div>
          </div>
          <div className="fg" style={{ marginBottom: 12 }}><label className="fl">Título do caixa <span className="rq">*</span></label>
            <input className="inp" value={titulo} onChange={e => { setTitulo(e.target.value); setErr('') }} placeholder="Ex: Caixa 05/07 Amore CD" autoFocus /></div>

          <div style={{ fontWeight: 700, fontSize: 13, margin: '4px 0 8px' }}>Itens / despesas</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead><tr style={{ background: 'var(--bordo-bg)' }}>
              <th style={{ textAlign: 'left', padding: '6px 8px' }}>Descrição</th><th style={{ textAlign: 'left', padding: '6px 8px' }}>Categoria</th>
              <th style={{ textAlign: 'left', padding: '6px 8px' }}>Fornecedor</th><th style={{ padding: '6px 8px' }}>Valor</th><th></th>
            </tr></thead>
            <tbody>{itens.map((it, idx) => (
              <tr key={idx}>
                <td style={{ padding: 3 }}><input className="inp" style={{ fontSize: 12 }} value={it.descricao} onChange={e => setItem(idx, { descricao: e.target.value })} placeholder="Produto/despesa" /></td>
                <td style={{ padding: 3 }}><select className="sel" style={{ fontSize: 12 }} value={it.categoria} onChange={e => setItem(idx, { categoria: e.target.value })}>{CATEGORIAS.map(c => <option key={c}>{c}</option>)}</select></td>
                <td style={{ padding: 3 }}><input className="inp" style={{ fontSize: 12 }} value={it.fornecedor} onChange={e => setItem(idx, { fornecedor: e.target.value })} placeholder="Fornecedor" /></td>
                <td style={{ padding: 3 }}><input className="inp" style={{ width: 80, fontSize: 12 }} value={it.valor} onChange={e => setItem(idx, { valor: e.target.value })} placeholder="0,00" /></td>
                <td style={{ padding: 3 }}><button className="ib rd" onClick={() => delItem(idx)}><Trash2 size={13} /></button></td>
              </tr>
            ))}</tbody>
          </table>
          <button className="btn bo bsm" onClick={addItem} style={{ marginTop: 8, borderStyle: 'dashed' }}><Plus size={11} /> Adicionar item</button>

          <div className="fg" style={{ margin: '14px 0 0' }}>
            <label className="fl">📎 Nota Fiscal / Comprovante (PDF ou imagem)</label>
            <input type="file" accept="application/pdf,image/*" onChange={e => setNfFile(e.target.files?.[0] || null)} style={{ fontSize: 12 }} />
            {nfFile && <span style={{ fontSize: 11, color: 'var(--success)', marginLeft: 8 }}>✓ {nfFile.name}</span>}
          </div>
          <div className="fg" style={{ margin: '12px 0 0' }}><label className="fl">Observações</label><textarea className="inp" rows={2} value={obs} onChange={e => setObs(e.target.value)} style={{ resize: 'vertical' }} /></div>
          {err && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 8 }}>{err}</div>}
        </div>
        <div className="mft" style={{ justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 800, color: 'var(--bordo)' }}>Total: {fmtR$(totalItens)}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn bo bsm" onClick={onClose}>Cancelar</button>
            <button className="btn bp bsm" onClick={salvar} disabled={saving}>{saving ? <><Loader size={12} className="spin" /> Salvando…</> : <><Check size={12} /> Salvar caixa</>}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function CaixasPage() {
  const { loja } = useLoja()
  const [caixas, setCaixas] = useState<Caixa[]>([])
  const [itens, setItens] = useState<CaixaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [aba, setAba] = useState<'arquivo' | 'abc' | 'precos'>('arquivo')
  const [sel, setSel] = useState<Caixa | null>(null)
  const [showNovo, setShowNovo] = useState(false)
  const [precoBusca, setPrecoBusca] = useState('')
  const [abcFiltro, setAbcFiltro] = useState<'' | 'A' | 'B' | 'C'>('')
  const [prodSel, setProdSel] = useState<string | null>(null)
  // WhatsApp
  const [showWhats, setShowWhats] = useState(false)
  const [profiles, setProfiles] = useState<any[]>([])
  const [waDest, setWaDest] = useState('')      // número escolhido (só dígitos)
  const [waStatus, setWaStatus] = useState('')
  const [waSending, setWaSending] = useState(false)
  useEffect(() => { fetchProfiles().then(setProfiles).catch(() => {}) }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const [cx, it] = await Promise.all([fetchCaixas(loja), fetchTodosCaixaItens(loja)])
    setCaixas(cx); setItens(it); setLoading(false)
  }, [loja])
  useEffect(() => { load() }, [load])

  const totalGeral = caixas.reduce((s, c) => s + (c.total || 0), 0)

  // ── ABC por fornecedor + por categoria (dos itens) ──
  const abcFornecedor = useMemo(() => {
    const m: Record<string, number> = {}
    itens.forEach(i => { const k = i.fornecedor || 'Não informado'; m[k] = (m[k] || 0) + (i.valor || 0) })
    const arr = Object.entries(m).sort((a, b) => b[1] - a[1])
    const tot = arr.reduce((s, [, v]) => s + v, 0) || 1
    let acum = 0
    return arr.map(([nome, val]) => { acum += val; const pAcum = (acum / tot) * 100; return { nome, val, pct: (val / tot) * 100, pAcum, classe: pAcum <= 80 ? 'A' : pAcum <= 95 ? 'B' : 'C' } })
  }, [itens])

  const porCategoria = useMemo(() => {
    const m: Record<string, number> = {}
    itens.forEach(i => { const k = i.categoria || 'Outros'; m[k] = (m[k] || 0) + (i.valor || 0) })
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [itens])
  const maxCat = Math.max(1, ...porCategoria.map(([, v]) => v))

  // ── Análise de preços: histórico por produto (últimas compras) ──
  const produtosPreco = useMemo(() => {
    const m: Record<string, { nome: string; compras: { data: string | null; forn: string | null; unit: number | null; total: number }[] }> = {}
    itens.forEach(i => {
      const k = normProd(i.descricao); if (!k || k.length < 2) return
      if (!m[k]) m[k] = { nome: i.descricao || k, compras: [] }
      m[k].compras.push({ data: i.data, forn: i.fornecedor, unit: parsePU(i.documento), total: i.valor })
    })
    const arr = Object.values(m).map(p => {
      const comps = p.compras.sort((a, b) => (b.data || '').localeCompare(a.data || ''))
      const comUnit = comps.filter(c => c.unit != null)
      const ultimas5 = comUnit.slice(0, 5)   // 5 últimas compras com preço (mais recente primeiro)
      const ult = ultimas5[0]?.unit ?? null
      const ant = ultimas5[1]?.unit ?? null
      const u5 = ultimas5.map(c => c.unit as number)
      const min = u5.length ? Math.min(...u5) : null   // menor/maior entre as 5 últimas
      const max = u5.length ? Math.max(...u5) : null
      const varPct = (ult != null && ant != null && ant > 0) ? ((ult - ant) / ant) * 100 : null
      return { ...p, comps, ultimas5, n: comps.length, ult, ant, min, max, varPct, gasto: comps.reduce((s, c) => s + c.total, 0) }
    }).sort((a, b) => b.gasto - a.gasto)
    // Classificação ABC por PRODUTO (por gasto acumulado): A ≤80%, B ≤95%, C resto
    const totG = arr.reduce((s, p) => s + p.gasto, 0) || 1
    let ac = 0
    return arr.map(p => { ac += p.gasto; const pA = (ac / totG) * 100; return { ...p, gastoPct: (p.gasto / totG) * 100, classe: (pA <= 80 ? 'A' : pA <= 95 ? 'B' : 'C') as 'A' | 'B' | 'C' } })
  }, [itens])

  const produtosFiltrados = produtosPreco.filter(p => (!precoBusca || normProd(p.nome).includes(normProd(precoBusca))) && (!abcFiltro || p.classe === abcFiltro))
  const abcResumo = useMemo(() => {
    const r = { A: { n: 0, g: 0 }, B: { n: 0, g: 0 }, C: { n: 0, g: 0 } }
    produtosPreco.forEach(p => { r[p.classe].n++; r[p.classe].g += p.gasto })
    return r
  }, [produtosPreco])
  const prodDetalhe = prodSel ? produtosPreco.find(p => normProd(p.nome) === prodSel) : null

  // ── WhatsApp: perfis com número + resumo + envio ──
  const perfisComWhats = useMemo(() => profiles
    .map(p => ({ nome: p.name, num: soDigitos((p?.permissions_override as any)?.__perfil__?.whatsapp) }))
    .filter(p => p.num), [profiles])

  const resumoWhats = () => {
    const cls = (c: string) => c === 'A' ? '🔴' : c === 'B' ? '🟠' : '🟢'
    const topFor = abcFornecedor.slice(0, 6).map(f => `${cls(f.classe)} ${f.classe} · ${f.nome} — ${fmtR$(f.val)} (${f.pct.toFixed(0)}%)`).join('\n')
    const cats = porCategoria.slice(0, 8).map(([c, v]) => `• ${c}: ${fmtR$(v)}`).join('\n')
    return `📊 *Relatório de Caixas — ${loja}*\n💰 Total: ${fmtR$(totalGeral)} · ${caixas.length} caixas · ${itens.length} itens\n\n*Curva ABC (fornecedores):*\n${topFor}\n\n*Gasto por categoria:*\n${cats}\n\n_Amore Gestão_`
  }

  const enviarResumoWhats = async () => {
    const cfg = getZapiCfg()
    if (!cfg.instance || !cfg.token) { setWaStatus('Configure o Z-API em Liz → WhatsApp.'); return }
    if (!waDest) { setWaStatus('Escolha um destinatário.'); return }
    setWaSending(true); setWaStatus('')
    const ok = await enviarWhatsApp(waDest, resumoWhats(), cfg, { tipo: 'relatorio', modulo: 'caixas', titulo: `Relatório de Caixas — ${loja}`, loja })
    setWaSending(false)
    setWaStatus(ok ? '✅ Enviado!' : '⚠ Falha ao enviar (confira o Z-API/número).')
    if (ok) setTimeout(() => { setShowWhats(false); setWaStatus('') }, 1500)
  }

  if (sel) return <CaixaDetalhe caixa={sel} onVoltar={() => setSel(null)} />

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4, background: 'var(--bordo-bg)', padding: 4, borderRadius: 10 }}>
          {(['arquivo', 'abc', 'precos'] as const).map(t => (
            <button key={t} onClick={() => setAba(t)} style={{ border: 'none', cursor: 'pointer', padding: '7px 16px', borderRadius: 7, fontSize: 13, fontWeight: aba === t ? 700 : 500, background: aba === t ? 'var(--bordo)' : 'transparent', color: aba === t ? '#fff' : 'var(--muted)' }}>
              {t === 'arquivo' ? '🗄️ Arquivo de Caixas' : t === 'abc' ? '📊 Análise ABC' : '💲 Preços por Produto'}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button className="btn bo bsm" onClick={() => { setShowWhats(true); setWaStatus('') }} style={{ color: '#16A34A', borderColor: '#16A34A' }}>📲 Enviar WhatsApp</button>
        <button className="btn bp bsm" onClick={() => setShowNovo(true)}><Plus size={13} /> Novo Caixa</button>
        <button className="btn bo bsm" onClick={load} disabled={loading}>{loading ? <Loader size={13} className="spin" /> : <RefreshCw size={13} />} Atualizar</button>
      </div>

      {showNovo && <NovoCaixaForm lojaAtual={loja} onClose={() => setShowNovo(false)} onSalvo={() => { setShowNovo(false); load() }} />}

      {showWhats && (
        <div className="ov open" onClick={e => e.target === e.currentTarget && setShowWhats(false)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div className="mhd"><span className="mtt">📲 Enviar relatório por WhatsApp</span><button className="mx" onClick={() => setShowWhats(false)}>✕</button></div>
            <div className="mbd" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
              <div className="fg" style={{ marginBottom: 12 }}>
                <label className="fl">Destinatário (usuários cadastrados)</label>
                <select className="sel" value={waDest} onChange={e => setWaDest(e.target.value)}>
                  <option value="">— Escolha —</option>
                  {perfisComWhats.map(p => <option key={p.num} value={p.num}>{p.nome} · {p.num}</option>)}
                </select>
              </div>
              <div className="fg" style={{ marginBottom: 12 }}>
                <label className="fl">…ou digite um número (com DDD)</label>
                <input className="inp" value={waDest} onChange={e => setWaDest(soDigitos(e.target.value))} placeholder="5581999999999" />
              </div>
              <label className="fl">Mensagem que será enviada</label>
              <pre style={{ background: 'var(--bordo-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 11.5, lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: '4px 0 0' }}>{resumoWhats()}</pre>
            </div>
            <div className="mft" style={{ justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--bordo)' }}>{waStatus}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn bo bsm" onClick={() => setShowWhats(false)}>Fechar</button>
                <button className="btn bp bsm" onClick={enviarResumoWhats} disabled={waSending || !waDest}>{waSending ? <><Loader size={12} className="spin" /> Enviando…</> : '📲 Enviar'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div className="card" style={{ padding: 16, flex: 1, minWidth: 150 }}><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--bordo)' }}>{caixas.length}</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>Caixas arquivados</div></div>
        <div className="card" style={{ padding: 16, flex: 1, minWidth: 150 }}><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--bordo)' }}>{fmtR$(totalGeral)}</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>Total de despesas</div></div>
        <div className="card" style={{ padding: 16, flex: 1, minWidth: 150 }}><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--bordo)' }}>{itens.length}</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>Itens detalhados</div></div>
      </div>

      {aba === 'arquivo' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {loading && <div style={{ padding: 40, textAlign: 'center' }}><Loader size={20} className="spin" /></div>}
          {!loading && caixas.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}><Archive size={28} style={{ opacity: .4 }} /><br />Nenhum caixa arquivado.</div>}
          {!loading && caixas.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ background: 'var(--bordo-bg)' }}>
                <th style={{ textAlign: 'left', padding: '9px 14px' }}>Caixa</th><th style={{ textAlign: 'left', padding: '9px 14px' }}>Loja</th>
                <th style={{ textAlign: 'left', padding: '9px 14px' }}>Período</th><th style={{ textAlign: 'center', padding: '9px 14px' }}>Itens</th>
                <th style={{ textAlign: 'right', padding: '9px 14px' }}>Total</th><th></th>
              </tr></thead>
              <tbody>{caixas.map(c => (
                <tr key={c.id} style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => setSel(c)}>
                  <td style={{ padding: '9px 14px', fontWeight: 600 }}>{c.titulo}{c.observacoes && <span title={c.observacoes} style={{ color: '#B45309' }}> ⚠</span>}</td>
                  <td style={{ padding: '9px 14px' }}><span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: 'var(--bordo-bg)', color: 'var(--bordo)', fontWeight: 600 }}>{c.loja}</span></td>
                  <td style={{ padding: '9px 14px', color: 'var(--muted)', fontSize: 12 }}>{fmtData(c.periodo_inicio)} — {fmtData(c.periodo_fim)}</td>
                  <td style={{ padding: '9px 14px', textAlign: 'center', color: 'var(--muted)' }}>{c.qtd_itens || '—'}</td>
                  <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 800 }}>{c.total > 0 ? fmtR$(c.total) : <span style={{ color: '#B45309', fontSize: 11 }}>a conferir</span>}</td>
                  <td style={{ padding: '9px 14px', textAlign: 'right' }}>
                    <button className="ib rd" onClick={e => { e.stopPropagation(); if (confirm('Excluir este caixa do arquivo?')) deleteCaixa(c.id).then(load) }}><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}

      {aba === 'abc' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          <div className="card" style={{ padding: 18 }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 800 }}>Curva ABC por fornecedor</h3>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>A = 80% do gasto · B = 15% · C = 5% (base: itens detalhados)</div>
            {abcFornecedor.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 13 }}>Sem itens detalhados ainda. Os caixas com itens alimentam esta análise.</div>}
            {abcFornecedor.slice(0, 15).map(f => (
              <div key={f.nome} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                  <span><b style={{ color: f.classe === 'A' ? '#B91C1C' : f.classe === 'B' ? '#B45309' : '#15803D' }}>{f.classe}</b> · {f.nome}</span>
                  <strong>{fmtR$(f.val)} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({f.pct.toFixed(1)}%)</span></strong>
                </div>
                <Bar pct={f.pct} cor={f.classe === 'A' ? '#B91C1C' : f.classe === 'B' ? '#B45309' : '#15803D'} />
              </div>
            ))}
          </div>
          <div className="card" style={{ padding: 18 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 800 }}>Gasto por categoria</h3>
            {porCategoria.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 13 }}>Sem itens detalhados ainda.</div>}
            {porCategoria.map(([cat, v]) => (
              <div key={cat} style={{ marginBottom: 11 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                  <span>{cat}</span><strong>{fmtR$(v)}</strong>
                </div>
                <Bar pct={(v / maxCat) * 100} cor={corCat(cat)} />
              </div>
            ))}
          </div>
        </div>
      )}

      {aba === 'precos' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: 12, borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input className="inp" value={precoBusca} onChange={e => setPrecoBusca(e.target.value)} placeholder="🔎 Buscar produto (tomate, cebola, alho...)" style={{ maxWidth: 280, fontSize: 13 }} />
            <div style={{ display: 'flex', gap: 6 }}>
              {([['', 'Todos'], ['A', `🔴 A · ${abcResumo.A.n}`], ['B', `🟠 B · ${abcResumo.B.n}`], ['C', `🟢 C · ${abcResumo.C.n}`]] as const).map(([k, lbl]) => (
                <button key={k} onClick={() => setAbcFiltro(k)} style={{ padding: '5px 11px', borderRadius: 20, border: '1px solid var(--border)', cursor: 'pointer', fontSize: 12, fontWeight: 700, background: abcFiltro === k ? 'var(--bordo)' : 'transparent', color: abcFiltro === k ? '#fff' : 'var(--text)' }}>{lbl}</button>
              ))}
            </div>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>{produtosFiltrados.length} produtos · curva ABC por gasto · Classe A = {fmtR$(abcResumo.A.g)} (80% do gasto)</span>
          </div>
          {produtosPreco.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Sem itens com preço unitário ainda.</div>}
          {produtosPreco.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead><tr style={{ background: 'var(--bordo-bg)' }}>
                <th style={{ textAlign: 'center', padding: '8px 12px' }}>ABC</th>
                <th style={{ textAlign: 'left', padding: '8px 12px' }}>Produto</th>
                <th style={{ textAlign: 'right', padding: '8px 12px' }}>Gasto total</th>
                <th style={{ textAlign: 'left', padding: '8px 12px' }}>Últimas 5 compras (unit. · data)</th>
                <th style={{ textAlign: 'right', padding: '8px 12px' }}>Variação</th>
                <th style={{ textAlign: 'right', padding: '8px 12px' }}>Menor–Maior (5)</th>
              </tr></thead>
              <tbody>{produtosFiltrados.slice(0, 150).map(p => {
                const subiu = p.varPct != null && p.varPct > 0.5, caiu = p.varPct != null && p.varPct < -0.5
                const cor = p.classe === 'A' ? '#B91C1C' : p.classe === 'B' ? '#D97706' : '#15803D'
                return (
                  <tr key={p.nome} style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => setProdSel(normProd(p.nome))}>
                    <td style={{ padding: '7px 12px', textAlign: 'center' }}><span style={{ display: 'inline-block', minWidth: 20, padding: '2px 7px', borderRadius: 20, background: cor, color: '#fff', fontWeight: 800, fontSize: 11 }}>{p.classe}</span></td>
                    <td style={{ padding: '7px 12px', fontWeight: 600 }}>{p.nome}<div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 400 }}>{p.n} compras no total</div></td>
                    <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 700 }}>{fmtR$(p.gasto)}<span style={{ fontSize: 10, color: 'var(--muted)' }}> · {p.gastoPct.toFixed(1)}%</span></td>
                    <td style={{ padding: '5px 12px' }}>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {p.ultimas5.length === 0 && <span style={{ color: 'var(--muted)' }}>—</span>}
                        {p.ultimas5.map((c, i) => {
                          const older = p.ultimas5[i + 1]
                          const up = older && older.unit != null && (c.unit as number) > (older.unit as number)
                          const down = older && older.unit != null && (c.unit as number) < (older.unit as number)
                          return (
                            <span key={i} title={c.forn || ''} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.15, padding: '3px 7px', borderRadius: 6, background: i === 0 ? 'var(--bordo-bg)' : 'var(--card2, #f6f6f6)', minWidth: 54 }}>
                              <b style={{ fontSize: 11.5, color: i === 0 ? 'var(--bordo)' : up ? '#B91C1C' : down ? '#15803D' : 'inherit' }}>{c.unit != null ? fmtR$(c.unit as number) : '—'}</b>
                              <small style={{ fontSize: 9.5, color: 'var(--muted)' }}>{fmtData(c.data).slice(0, 5)}</small>
                            </span>
                          )
                        })}
                      </div>
                    </td>
                    <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 700, color: subiu ? '#B91C1C' : caiu ? '#15803D' : 'var(--muted)' }}>
                      {p.varPct == null ? '—' : `${p.varPct > 0 ? '▲' : p.varPct < 0 ? '▼' : ''} ${Math.abs(p.varPct).toFixed(0)}%`}
                    </td>
                    <td style={{ padding: '7px 12px', textAlign: 'right', fontSize: 11, color: 'var(--muted)' }}>{p.min != null ? `${fmtR$(p.min)} – ${fmtR$(p.max)}` : '—'}</td>
                  </tr>
                )
              })}</tbody>
            </table>
          )}
        </div>
      )}

      {prodDetalhe && (
        <div className="ov open" onClick={e => e.target === e.currentTarget && setProdSel(null)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div className="mhd"><span className="mtt">💲 {prodDetalhe.nome}</span><button className="mx" onClick={() => setProdSel(null)}>✕</button></div>
            <div className="mbd" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                <div className="card" style={{ padding: 10, flex: 1, minWidth: 120 }}><div style={{ fontSize: 18, fontWeight: 800, color: 'var(--bordo)' }}>{prodDetalhe.ult != null ? fmtR$(prodDetalhe.ult) : '—'}</div><div style={{ fontSize: 10, color: 'var(--muted)' }}>Último preço unit.</div></div>
                <div className="card" style={{ padding: 10, flex: 1, minWidth: 120 }}><div style={{ fontSize: 18, fontWeight: 800, color: prodDetalhe.varPct != null && prodDetalhe.varPct > 0 ? '#B91C1C' : '#15803D' }}>{prodDetalhe.varPct == null ? '—' : `${prodDetalhe.varPct > 0 ? '+' : ''}${prodDetalhe.varPct.toFixed(0)}%`}</div><div style={{ fontSize: 10, color: 'var(--muted)' }}>vs. compra anterior</div></div>
                <div className="card" style={{ padding: 10, flex: 1, minWidth: 120 }}><div style={{ fontSize: 18, fontWeight: 800, color: 'var(--bordo)' }}>{prodDetalhe.n}×</div><div style={{ fontSize: 10, color: 'var(--muted)' }}>Compras</div></div>
              </div>
              <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Histórico (mais recente primeiro)</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead><tr style={{ background: 'var(--bordo-bg)' }}><th style={{ textAlign: 'left', padding: '6px 8px' }}>Data</th><th style={{ textAlign: 'left', padding: '6px 8px' }}>Fornecedor</th><th style={{ textAlign: 'right', padding: '6px 8px' }}>Preço unit.</th><th style={{ textAlign: 'right', padding: '6px 8px' }}>Total</th></tr></thead>
                <tbody>{prodDetalhe.comps.map((c, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 8px' }}>{fmtData(c.data)}</td>
                    <td style={{ padding: '6px 8px', color: 'var(--muted)' }}>{c.forn || '—'}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700 }}>{c.unit != null ? fmtR$(c.unit) : '—'}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmtR$(c.total)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
