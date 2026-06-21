import { useState, useEffect, useCallback, useRef } from 'react'
import {
  FileText, Upload, Loader, CheckCircle2, AlertTriangle, ChevronDown, ChevronRight,
  Package, DollarSign, ClipboardCheck, Clock,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useLoja } from '../../contexts/LojaContext'
import { useToast } from '../../hooks/useToast'
import {
  fetchNotasFiscais, fetchNotaItens, importarNotaFiscal, receberNotaConforme,
  registrarDivergenciaNota, fetchContasPagar,
  type NotaFiscal, type NotaItem, type ContaPagar,
} from '../../lib/db'
import { parseNFeXML } from '../../lib/nfe'

const brl = (n: number) => 'R$ ' + (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })

const STATUS: Record<string, { label: string; bg: string; color: string }> = {
  pendente_recebimento: { label: '⏳ Aguardando recebimento', bg: '#FEF3C7', color: '#92400E' },
  recebido:             { label: '✅ Recebido',                bg: '#D1FAE5', color: '#065F46' },
  divergencia:          { label: '⚠️ Divergência',            bg: '#FEE2E2', color: '#991B1B' },
  cancelada:            { label: 'Cancelada',                  bg: '#E5E7EB', color: '#374151' },
}

export default function NotasFiscaisPage() {
  const { user } = useAuth()
  const { loja } = useLoja()
  const { toast } = useToast()
  const [notas, setNotas] = useState<NotaFiscal[]>([])
  const [contas, setContas] = useState<ContaPagar[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [expandida, setExpandida] = useState<string | null>(null)
  const [itens, setItens] = useState<NotaItem[]>([])
  const [acao, setAcao] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const lojaAtiva = loja && loja !== 'Todas as Lojas' ? loja
    : (user?.loja && user.loja !== 'Todas' ? user.loja : 'Amore Paiva')

  const load = useCallback(async () => {
    setLoading(true)
    const [n, c] = await Promise.all([fetchNotasFiscais(loja), fetchContasPagar(loja)])
    setNotas(n); setContas(c); setLoading(false)
  }, [loja])
  useEffect(() => { load() }, [load])

  async function onFiles(files: FileList | null) {
    if (!files?.length) return
    setImporting(true)
    let ok = 0, erros = 0
    for (const f of Array.from(files)) {
      try {
        const xml = await f.text()
        const parsed = parseNFeXML(xml)
        await importarNotaFiscal(parsed, lojaAtiva, user?.name || 'Sistema')
        ok++
      } catch (e) { erros++; toast((e instanceof Error ? e.message : 'Erro') + ` (${f.name})`, 'error') }
    }
    if (ok) toast(`${ok} nota(s) importada(s) → contas a pagar + histórico de preços gerados`, 'success')
    setImporting(false)
    if (fileRef.current) fileRef.current.value = ''
    load()
  }

  async function abrir(n: NotaFiscal) {
    if (expandida === n.id) { setExpandida(null); return }
    setExpandida(n.id); setItens([])
    setItens(await fetchNotaItens(n.id))
  }

  async function receber(n: NotaFiscal) {
    setAcao(n.id)
    try {
      await receberNotaConforme(n, user?.name || 'Sistema')
      toast('Recebido conforme NF — itens lançados no estoque ✅', 'success')
      load(); if (expandida === n.id) setItens(await fetchNotaItens(n.id))
    } catch { toast('Erro ao receber a nota', 'error') } finally { setAcao(null) }
  }

  async function divergencia(n: NotaFiscal) {
    const desc = window.prompt('Descreva a divergência (falta, quantidade divergente, produto avariado):')
    if (!desc) return
    setAcao(n.id)
    try {
      await registrarDivergenciaNota(n, 'divergencia', desc, user?.name || 'Sistema')
      toast('Divergência registrada — nota NÃO lançada no estoque', 'warning')
      load()
    } catch { toast('Erro ao registrar divergência', 'error') } finally { setAcao(null) }
  }

  const mesAtual = new Date().toISOString().slice(0, 7)
  const kpi = {
    pendentes: notas.filter(n => n.status === 'pendente_recebimento').length,
    valorMes: notas.filter(n => (n.data_emissao || '').startsWith(mesAtual)).reduce((s, n) => s + (n.valor_total || 0), 0),
    contasAbertas: contas.filter(c => c.status === 'aberto').reduce((s, c) => s + (c.valor || 0), 0),
    qtdContas: contas.filter(c => c.status === 'aberto').length,
  }

  const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <FileText size={22} color="#6B1212" />
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Notas Fiscais</h1>
        <span style={{ fontSize: 11, background: '#6B121215', color: '#6B1212', padding: '3px 10px', borderRadius: 20, fontWeight: 700 }}>ASI · Supply Intelligence</span>
      </div>
      <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 18 }}>Importe o XML da NF-e → vira <b>conta a pagar</b>, <b>histórico de preços</b> e <b>entrada de estoque</b> (após conferência). · Loja: <b>{lojaAtiva}</b></p>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginBottom: 18 }}>
        {[
          { i: <Clock size={18} />, v: kpi.pendentes, l: 'Aguardando recebimento' },
          { i: <DollarSign size={18} />, v: brl(kpi.valorMes), l: 'Comprado no mês' },
          { i: <ClipboardCheck size={18} />, v: brl(kpi.contasAbertas), l: `Contas a pagar (${kpi.qtdContas})` },
          { i: <Package size={18} />, v: notas.length, l: 'Notas registradas' },
        ].map((k, idx) => (
          <div key={idx} style={card}>
            <div style={{ color: '#6B1212' }}>{k.i}</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{k.v}</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>{k.l}</div>
          </div>
        ))}
      </div>

      {/* Upload */}
      <div style={{ ...card, marginBottom: 18, borderStyle: 'dashed', textAlign: 'center', borderColor: '#6B1212' }}>
        <input ref={fileRef} type="file" accept=".xml,text/xml" multiple style={{ display: 'none' }} onChange={e => onFiles(e.target.files)} />
        <button onClick={() => fileRef.current?.click()} disabled={importing}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#6B1212', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 22px', fontWeight: 700, cursor: 'pointer' }}>
          {importing ? <Loader size={16} className="spin" /> : <Upload size={16} />}
          {importing ? 'Importando…' : 'Importar XML de NF-e'}
        </button>
        <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 8 }}>Selecione um ou vários arquivos .xml (o XML que o fornecedor envia em cada nota)</p>
      </div>

      {/* Lista */}
      <div style={card}>
        {loading ? <p style={{ color: '#6b7280', textAlign: 'center', padding: 20 }}><Loader size={16} className="spin" /> Carregando…</p>
          : notas.length === 0 ? <p style={{ color: '#6b7280', textAlign: 'center', padding: 20 }}>Nenhuma nota importada ainda. Comece importando um XML acima. 📄</p>
            : notas.map(n => {
              const st = STATUS[n.status] || STATUS.pendente_recebimento
              const aberta = expandida === n.id
              return (
                <div key={n.id} style={{ borderBottom: '1px solid #f1f1f1', padding: '10px 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => abrir(n)}>
                    {aberta ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>NF {n.numero || '—'} · {n.fornecedor_nome || 'Fornecedor'}</div>
                      <div style={{ fontSize: 12, color: '#6b7280' }}>{n.data_emissao || '—'} · {n.forma_pagamento || ''}</div>
                    </div>
                    <div style={{ fontWeight: 800, fontSize: 14 }}>{brl(n.valor_total)}</div>
                    <span style={{ fontSize: 11, fontWeight: 700, background: st.bg, color: st.color, padding: '4px 10px', borderRadius: 20, whiteSpace: 'nowrap' }}>{st.label}</span>
                  </div>

                  {aberta && (
                    <div style={{ paddingLeft: 26, marginTop: 10 }}>
                      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                        <thead><tr style={{ color: '#9ca3af', textAlign: 'left' }}>
                          <th style={{ padding: '4px 0' }}>Produto</th><th>Qtd</th><th>Un.</th><th>Vlr unit.</th><th>Total</th>
                        </tr></thead>
                        <tbody>
                          {itens.map(it => (
                            <tr key={it.id} style={{ borderTop: '1px solid #f6f6f6' }}>
                              <td style={{ padding: '5px 0' }}>{it.descricao}</td>
                              <td>{it.quantidade}</td><td>{it.unidade}</td>
                              <td>{brl(it.valor_unitario)}</td><td>{brl(it.valor_total)}</td>
                            </tr>
                          ))}
                          {itens.length === 0 && <tr><td colSpan={5} style={{ color: '#9ca3af', padding: 8 }}>Carregando itens…</td></tr>}
                        </tbody>
                      </table>

                      {n.status === 'pendente_recebimento' && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                          <button onClick={() => receber(n)} disabled={acao === n.id}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#065F46', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                            {acao === n.id ? <Loader size={14} className="spin" /> : <CheckCircle2 size={14} />} Recebido conforme NF
                          </button>
                          <button onClick={() => divergencia(n)} disabled={acao === n.id}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', color: '#991B1B', border: '1px solid #991B1B', borderRadius: 8, padding: '8px 14px', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                            <AlertTriangle size={14} /> Divergência encontrada
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
      </div>
    </div>
  )
}
