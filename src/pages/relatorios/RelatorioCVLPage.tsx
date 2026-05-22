import { useState, useEffect, useCallback } from 'react'
import {
  BarChart2, Plus, Trash2, ChevronLeft, Loader,
  AlertTriangle, XCircle, FileText, Download,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useLoja } from '../../contexts/LojaContext'
import {
  fetchRelatoriosCVL, fetchRelatorioCVLItens, deleteRelatorioCVL,
  insertRelatorioCVL, insertRelatorioCVLItens,
  fetchRequisicoes, fetchRequisicaoItens,
  fetchComprasListas, fetchComprasListaItens,
  type RelatorioCVL, type RelatorioCVLItem,
} from '../../lib/db'

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR')
}
function fmtPct(v: number) {
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  ok:          { label: 'OK',          cls: 'bg-g' },
  acima:       { label: 'Acima',       cls: 'bg-y' },
  abaixo:      { label: 'Abaixo',      cls: 'bg-r' },
  nao_comprado:{ label: 'Não comprado',cls: 'bg-gr' },
}

// ── Modal Gerar Relatório ─────────────────────────────────────

function ModalGerar({
  onClose, onGerado, loja, userName,
}: {
  onClose: () => void
  onGerado: (r: RelatorioCVL) => void
  loja: string
  userName: string
}) {
  const [inicio, setInicio] = useState(() => {
    const d = new Date(); d.setDate(1)
    return d.toISOString().slice(0, 10)
  })
  const [fim, setFim] = useState(new Date().toISOString().slice(0, 10))
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')

  const gerar = async () => {
    if (!inicio || !fim) return
    setLoading(true)
    setErro('')
    try {
      // Busca requisições e compras do período
      const [requisicoes, comprasListas] = await Promise.all([
        fetchRequisicoes(loja !== 'Todas as Lojas' ? loja : undefined),
        fetchComprasListas(loja),
      ])

      // Filtra por período — requisições aprovadas ou em andamento avançado
      const STATUSES_REQ_OK = ['aprovada', 'compra_realizada', 'prestacao_pendente', 'em_auditoria', 'concluida']
      const reqsFiltradas = requisicoes.filter(r => {
        const d = r.created_at.slice(0, 10)
        return d >= inicio && d <= fim && STATUSES_REQ_OK.includes(r.status)
      })
      const comprasFiltradas = comprasListas.filter(c => {
        const d = (c.data_compra || c.created_at).slice(0, 10)
        return d >= inicio && d <= fim && c.status === 'concluido'
      })

      // Busca itens de cada requisição e compra
      const [reqItensArrays, compraItensArrays] = await Promise.all([
        Promise.all(reqsFiltradas.map(r => fetchRequisicaoItens(r.id).catch(() => []))),
        Promise.all(comprasFiltradas.map(c => fetchComprasListaItens(c.id).catch(() => []))),
      ])

      // Agrega itens por produto (solicitado)
      const mapa: Record<string, {
        produto_nome: string; qtd_solicitada: number; valor_previsto: number
        unidade: string | null; requisicao_id: string | null
        responsavel_req: string | null; data_req: string | null
        qtd_comprada: number; valor_realizado: number
        compra_id: string | null; responsavel_comp: string | null; data_comp: string | null
      }> = {}

      reqsFiltradas.forEach((req, i) => {
        reqItensArrays[i].forEach(item => {
          const key = item.produto_nome.toLowerCase().trim()
          const preco = Number(item.preco_referencia) || Number(item.preco_cotado) || 0
          if (!mapa[key]) {
            mapa[key] = {
              produto_nome: item.produto_nome,
              qtd_solicitada: 0, valor_previsto: 0,
              unidade: item.unidade ?? null,
              requisicao_id: req.id,
              responsavel_req: req.responsavel_nome ?? req.created_by ?? null,
              data_req: req.created_at.slice(0, 10),
              qtd_comprada: 0, valor_realizado: 0,
              compra_id: null, responsavel_comp: null, data_comp: null,
            }
          }
          mapa[key].qtd_solicitada += Number(item.quantidade) || 0
          mapa[key].valor_previsto += (Number(item.quantidade) || 0) * preco
        })
      })

      comprasFiltradas.forEach((compra, i) => {
        compraItensArrays[i].forEach(item => {
          const key = item.produto_nome.toLowerCase().trim()
          const preco = Number(item.preco_real) || Number(item.preco_estimado) || 0
          if (!mapa[key]) {
            mapa[key] = {
              produto_nome: item.produto_nome,
              qtd_solicitada: 0, valor_previsto: 0,
              unidade: item.unidade ?? null,
              requisicao_id: null, responsavel_req: null, data_req: null,
              qtd_comprada: 0, valor_realizado: 0,
              compra_id: compra.id,
              responsavel_comp: compra.created_by ?? null,
              data_comp: (compra.data_compra || compra.created_at).slice(0, 10),
            }
          }
          mapa[key].qtd_comprada += Number(item.quantidade) || 0
          mapa[key].valor_realizado += (Number(item.quantidade) || 0) * preco
          if (!mapa[key].compra_id) {
            mapa[key].compra_id = compra.id
            mapa[key].responsavel_comp = compra.created_by ?? null
            mapa[key].data_comp = (compra.data_compra || compra.created_at).slice(0, 10)
          }
        })
      })

      const itens = Object.values(mapa)
      const totalSolicitados = itens.filter(i => i.qtd_solicitada > 0).length
      const totalComprados   = itens.filter(i => i.qtd_comprada > 0).length
      const totalNaoComp     = itens.filter(i => i.qtd_solicitada > 0 && i.qtd_comprada === 0).length
      const valorPrevisto    = itens.reduce((s, i) => s + i.valor_previsto, 0)
      const valorRealizado   = itens.reduce((s, i) => s + i.valor_realizado, 0)
      const economia         = Math.max(0, valorPrevisto - valorRealizado)
      const excesso          = Math.max(0, valorRealizado - valorPrevisto)
      const assertividade    = totalSolicitados > 0
        ? Math.round((itens.filter(i => i.qtd_solicitada > 0 && Math.abs(i.qtd_comprada - i.qtd_solicitada) / i.qtd_solicitada <= 0.1).length / totalSolicitados) * 100)
        : 0

      const relatorio = await insertRelatorioCVL({
        loja, periodo_inicio: inicio, periodo_fim: fim,
        gerado_por: userName,
        total_itens_solicitados: totalSolicitados,
        total_itens_comprados: totalComprados,
        total_itens_nao_comprados: totalNaoComp,
        valor_previsto: valorPrevisto,
        valor_realizado: valorRealizado,
        economia, excesso, assertividade,
      })

      // Salva itens
      const itensParaSalvar = itens.map(i => ({
        relatorio_id: relatorio.id,
        produto_nome: i.produto_nome,
        categoria: null,
        qtd_solicitada: i.qtd_solicitada,
        unidade: i.unidade,
        valor_previsto: i.valor_previsto,
        requisicao_id: i.requisicao_id,
        responsavel_req: i.responsavel_req,
        data_req: i.data_req,
        qtd_comprada: i.qtd_comprada,
        valor_realizado: i.valor_realizado,
        compra_id: i.compra_id,
        responsavel_comp: i.responsavel_comp,
        data_comp: i.data_comp,
        status: (
          i.qtd_solicitada === 0 ? 'ok' :
          i.qtd_comprada === 0 ? 'nao_comprado' :
          i.qtd_comprada > i.qtd_solicitada * 1.05 ? 'acima' :
          i.qtd_comprada < i.qtd_solicitada * 0.95 ? 'abaixo' : 'ok'
        ) as 'ok' | 'acima' | 'abaixo' | 'nao_comprado',
      }))

      await insertRelatorioCVLItens(itensParaSalvar)
      onGerado(relatorio)
    } catch (e) {
      setErro('Erro ao gerar relatório. Verifique se há requisições aprovadas e compras finalizadas no período.')
    }
    setLoading(false)
  }

  return (
    <div className="ov open">
      <div className="modal">
        <div className="mhd">
          <span className="mtt">Gerar Relatório Compra vs Lista</span>
          <button className="mx" onClick={onClose}><XCircle size={13} /></button>
        </div>
        <div className="mbd">
          <div className="al al-b" style={{ marginBottom: 14 }}>
            <FileText size={13} />
            <span>O relatório cruza as <strong>requisições aprovadas</strong> com as <strong>compras finalizadas</strong> do período selecionado.</span>
          </div>
          <div className="g2">
            <div className="fg">
              <label className="fl">Data início <span className="rq">*</span></label>
              <input type="date" className="inp" value={inicio} onChange={e => setInicio(e.target.value)} />
            </div>
            <div className="fg">
              <label className="fl">Data fim <span className="rq">*</span></label>
              <input type="date" className="inp" value={fim} onChange={e => setFim(e.target.value)} />
            </div>
          </div>
          {erro && <div className="al al-r"><AlertTriangle size={13} />{erro}</div>}
        </div>
        <div className="mft">
          <button className="btn bo" onClick={onClose}>Cancelar</button>
          <button className="btn bp" onClick={gerar} disabled={loading}>
            {loading ? <Loader size={11} className="spin" /> : <BarChart2 size={11} />}
            {loading ? 'Gerando…' : 'Gerar Relatório'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Detalhe do Relatório ──────────────────────────────────────

function DetalheRelatorio({ relatorio, onVoltar }: { relatorio: RelatorioCVL; onVoltar: () => void }) {
  const [itens, setItens] = useState<RelatorioCVLItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<'todos' | 'acima' | 'abaixo' | 'nao_comprado' | 'ok'>('todos')

  useEffect(() => {
    setLoading(true)
    fetchRelatorioCVLItens(relatorio.id)
      .then(setItens)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [relatorio.id])

  const filtrados = filtro === 'todos' ? itens : itens.filter(i => i.status === filtro)

  const assertividadeCls = relatorio.assertividade >= 80 ? 'bg-g' : relatorio.assertividade >= 60 ? 'bg-y' : 'bg-r'

  return (
    <div>
      <div className="fb" style={{ marginBottom: 16 }}>
        <button className="btn bo bsm" onClick={onVoltar}><ChevronLeft size={11} /> Voltar</button>
        <div style={{ flex: 1 }}>
          <div className="sec-tt">Relatório: {fmtDate(relatorio.periodo_inicio)} – {fmtDate(relatorio.periodo_fim)}</div>
          <div className="sec-sub">{relatorio.loja} · gerado por {relatorio.gerado_por ?? 'sistema'}</div>
        </div>
        <button className="btn bo bsm" onClick={() => window.print()}><Download size={11} /> PDF</button>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', marginBottom: 16 }}>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: 'var(--bordo)' }} />
          <div className="kpi-lbl">Assertividade</div>
          <div className="kpi-val">{relatorio.assertividade.toFixed(0)}%</div>
          <span className={`badge ${assertividadeCls}`}>{relatorio.assertividade >= 80 ? 'Excelente' : relatorio.assertividade >= 60 ? 'Regular' : 'Crítico'}</span>
        </div>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: 'var(--blue)' }} />
          <div className="kpi-lbl">Itens Solicitados</div>
          <div className="kpi-val">{relatorio.total_itens_solicitados}</div>
          <div className="kpi-sub">{relatorio.total_itens_comprados} comprados</div>
        </div>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: 'var(--danger)' }} />
          <div className="kpi-lbl">Não Comprados</div>
          <div className="kpi-val">{relatorio.total_itens_nao_comprados}</div>
          <div className="kpi-sub">itens em falta</div>
        </div>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: 'var(--success)' }} />
          <div className="kpi-lbl">Economia</div>
          <div className="kpi-val kpi-up">{fmtBRL(relatorio.economia)}</div>
          <div className="kpi-sub">vs previsto</div>
        </div>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: 'var(--warning)' }} />
          <div className="kpi-lbl">Excesso</div>
          <div className="kpi-val kpi-dn">{fmtBRL(relatorio.excesso)}</div>
          <div className="kpi-sub">acima do previsto</div>
        </div>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: 'var(--purple)' }} />
          <div className="kpi-lbl">Valor Realizado</div>
          <div className="kpi-val">{fmtBRL(relatorio.valor_realizado)}</div>
          <div className="kpi-sub">prev. {fmtBRL(relatorio.valor_previsto)}</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="tabs" style={{ marginBottom: 12 }}>
        {(['todos','ok','acima','abaixo','nao_comprado'] as const).map(f => (
          <button key={f} className={`tab${filtro === f ? ' active' : ''}`} onClick={() => setFiltro(f)}>
            {f === 'todos' ? `Todos (${itens.length})` :
             f === 'ok' ? `OK (${itens.filter(i => i.status === 'ok').length})` :
             f === 'acima' ? `Acima (${itens.filter(i => i.status === 'acima').length})` :
             f === 'abaixo' ? `Abaixo (${itens.filter(i => i.status === 'abaixo').length})` :
             `Não comprado (${itens.filter(i => i.status === 'nao_comprado').length})`}
          </button>
        ))}
      </div>

      {/* Tabela */}
      <div className="card">
        {loading ? (
          <div className="empty"><Loader size={18} className="spin" /></div>
        ) : filtrados.length === 0 ? (
          <div className="empty"><BarChart2 size={32} /><div>Nenhum item encontrado</div></div>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Qtd Solicitada</th>
                  <th>Qtd Comprada</th>
                  <th>Diferença</th>
                  <th>Divergência</th>
                  <th>Valor Previsto</th>
                  <th>Valor Realizado</th>
                  <th>Responsável Req</th>
                  <th>Responsável Compra</th>
                  <th>Data Req</th>
                  <th>Data Compra</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(item => {
                  const sb = STATUS_BADGE[item.status]
                  const difCls = item.diferenca_qtd > 0 ? '#059669' : item.diferenca_qtd < 0 ? '#DC2626' : '#6B7280'
                  return (
                    <tr key={item.id}>
                      <td style={{ fontWeight: 600, minWidth: 150 }}>{item.produto_nome}</td>
                      <td>{item.qtd_solicitada} {item.unidade || ''}</td>
                      <td>{item.qtd_comprada} {item.unidade || ''}</td>
                      <td style={{ color: difCls, fontWeight: 700 }}>
                        {item.diferenca_qtd > 0 ? '+' : ''}{item.diferenca_qtd.toFixed(2)}
                      </td>
                      <td style={{ color: difCls, fontWeight: 700 }}>{fmtPct(item.divergencia_pct)}</td>
                      <td>{fmtBRL(item.valor_previsto)}</td>
                      <td>{fmtBRL(item.valor_realizado)}</td>
                      <td style={{ fontSize: 11, color: 'var(--muted)' }}>{item.responsavel_req ?? '—'}</td>
                      <td style={{ fontSize: 11, color: 'var(--muted)' }}>{item.responsavel_comp ?? '—'}</td>
                      <td style={{ fontSize: 11 }}>{item.data_req ? fmtDate(item.data_req) : '—'}</td>
                      <td style={{ fontSize: 11 }}>{item.data_comp ? fmtDate(item.data_comp) : '—'}</td>
                      <td><span className={`badge ${sb.cls}`}>{sb.label}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Página Principal ──────────────────────────────────────────

export default function RelatorioCVLPage() {
  const { user } = useAuth()
  const { loja } = useLoja()
  const [relatorios, setRelatorios] = useState<RelatorioCVL[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'lista' | 'detalhe'>('lista')
  const [selecionado, setSelecionado] = useState<RelatorioCVL | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<RelatorioCVL | null>(null)

  const userName = user?.name ?? user?.email ?? 'Usuário'

  const load = useCallback(async () => {
    setLoading(true)
    try { setRelatorios(await fetchRelatoriosCVL(loja)) } catch {}
    setLoading(false)
  }, [loja])

  useEffect(() => { load() }, [load])

  const handleGerado = (r: RelatorioCVL) => {
    setShowModal(false)
    setSelecionado(r)
    setView('detalhe')
    load()
  }

  const handleDelete = async (r: RelatorioCVL) => {
    try { await deleteRelatorioCVL(r.id); await load() } catch {}
    setConfirmDelete(null)
  }

  if (view === 'detalhe' && selecionado) {
    return <DetalheRelatorio relatorio={selecionado} onVoltar={() => { setView('lista'); setSelecionado(null) }} />
  }

  const assertividadeCls = (a: number) => a >= 80 ? 'bg-g' : a >= 60 ? 'bg-y' : 'bg-r'

  return (
    <div>
      <div className="fb" style={{ marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <div className="sec-tt">Relatório Compra vs Lista</div>
          <div className="sec-sub">Compare o que foi solicitado com o que foi efetivamente comprado</div>
        </div>
        <button className="btn bp bsm" onClick={() => setShowModal(true)}>
          <Plus size={11} /> Gerar Relatório
        </button>
      </div>

      {loading ? (
        <div className="empty"><Loader size={18} className="spin" /></div>
      ) : relatorios.length === 0 ? (
        <div className="empty">
          <BarChart2 size={32} />
          <div style={{ marginTop: 8, fontWeight: 600 }}>Nenhum relatório gerado</div>
          <div style={{ fontSize: 11, marginTop: 4 }}>Clique em "Gerar Relatório" para criar o primeiro</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {relatorios.map(r => (
            <div key={r.id} className="card" style={{ padding: 15, cursor: 'pointer' }}
              onClick={() => { setSelecionado(r); setView('detalhe') }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>
                    {fmtDate(r.periodo_inicio)} → {fmtDate(r.periodo_fim)}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                    {r.loja} · por {r.gerado_por ?? 'sistema'} · {fmtDate(r.created_at)}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span className={`badge ${assertividadeCls(r.assertividade)}`}>
                    {r.assertividade.toFixed(0)}% assertividade
                  </span>
                  <span className="badge bg-b">{r.total_itens_solicitados} solicitados</span>
                  {r.total_itens_nao_comprados > 0 && (
                    <span className="badge bg-r">{r.total_itens_nao_comprados} não comprados</span>
                  )}
                  {r.economia > 0 && (
                    <span className="badge bg-g">economia {fmtBRL(r.economia)}</span>
                  )}
                  {r.excesso > 0 && (
                    <span className="badge bg-y">excesso {fmtBRL(r.excesso)}</span>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                  <button className="ib rd" onClick={() => setConfirmDelete(r)} title="Excluir">
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>

              {/* mini-barra assertividade */}
              <div style={{ marginTop: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>
                  <span>Assertividade da compra</span>
                  <span>{r.assertividade.toFixed(0)}%</span>
                </div>
                <div className="prog">
                  <div className="pb" style={{
                    width: `${r.assertividade}%`,
                    background: r.assertividade >= 80 ? 'var(--success)' : r.assertividade >= 60 ? 'var(--warning)' : 'var(--danger)'
                  }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Botão flutuante mobile */}
      <button
        className="btn bp"
        onClick={() => setShowModal(true)}
        style={{
          position: 'fixed', bottom: 20, right: 16, zIndex: 200,
          borderRadius: 50, padding: '12px 18px',
          boxShadow: '0 4px 16px rgba(107,18,18,.35)',
          display: 'none',
        }}
        id="fab-cvl"
      >
        <Plus size={14} />
      </button>

      {showModal && (
        <ModalGerar
          onClose={() => setShowModal(false)}
          onGerado={handleGerado}
          loja={loja}
          userName={userName}
        />
      )}

      {confirmDelete && (
        <div className="cnf-overlay open">
          <div className="cnf-box">
            <div className="cnf-ico"><Trash2 size={18} color="var(--danger)" /></div>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Excluir relatório?</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                {fmtDate(confirmDelete.periodo_inicio)} → {fmtDate(confirmDelete.periodo_fim)}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button className="btn bo" onClick={() => setConfirmDelete(null)}>Cancelar</button>
              <button className="btn bd" onClick={() => handleDelete(confirmDelete)}>Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
