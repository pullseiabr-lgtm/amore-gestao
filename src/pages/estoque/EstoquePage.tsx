import { useState } from 'react'
import { Search, Package, TrendingDown, History, ArrowLeftRight, ClipboardList, Download, Plus, ChevronRight, CheckCircle, XCircle, Calculator } from 'lucide-react'

type NivelStatus = 'Crítico' | 'Repor' | 'Ok' | 'Ideal'
type TipoContagem = 'Contagem regular' | 'Contagem de fechamento' | 'Contagem de abertura'

interface ProdutoEstoque {
  nome: string
  gramatura: string
  filial: string
  nivel: NivelStatus
  minimo: number
  ideal: number
}

interface Movimentacao {
  tipo: 'entrada' | 'saida'
  produto: string
  quantidade: string
  filial: string
  hora: string
}

interface DiaMovimentacao {
  data: string
  dataISO: string
  movs: Movimentacao[]
}

interface ContHistorico {
  data: string
  tipo: string
  filial: string
  produtos: number
}

const PRODUTOS: ProdutoEstoque[] = [
  { nome: 'ABOBRINHA 1 kg', gramatura: 'Quilograma(s)', filial: 'AMORE COSTA DOURADA', nivel: 'Crítico', minimo: 1.51, ideal: 3 },
  { nome: 'ACELGA MOI', gramatura: 'Unidade(s)', filial: 'AMORE COSTA DOURADA', nivel: 'Crítico', minimo: 1, ideal: 2 },
  { nome: 'ADOÇANTE 200 ML', gramatura: 'Unidade(s)', filial: 'AMORE COSTA DOURADA', nivel: 'Crítico', minimo: 2, ideal: 4 },
  { nome: 'ADOÇANTE SACHÉ – UN CAIXINHA', gramatura: 'Unidade(s)', filial: 'AMORE COSTA DOURADA', nivel: 'Repor', minimo: 5, ideal: 10 },
  { nome: 'AGUA COM GAS 500 ML', gramatura: 'Unidade(s)', filial: 'AMORE COSTA DOURADA', nivel: 'Ok', minimo: 10, ideal: 48 },
  { nome: 'AGUA SANTIAGO 1LT', gramatura: 'Unidade(s)', filial: 'AMORE COSTA DOURADA', nivel: 'Ok', minimo: 10, ideal: 48 },
  { nome: 'AGUA SEM GAS 500 ML', gramatura: 'Unidade(s)', filial: 'AMORE COSTA DOURADA', nivel: 'Ok', minimo: 10, ideal: 48 },
  { nome: 'ALCOOL GEL 500 ML', gramatura: 'Unidade(s)', filial: 'AMORE COSTA DOURADA', nivel: 'Crítico', minimo: 2, ideal: 4 },
  { nome: 'ALCOOL LIQUIDO 1LTR', gramatura: 'Unidade(s)', filial: 'AMORE COSTA DOURADA', nivel: 'Crítico', minimo: 2, ideal: 5 },
  { nome: 'ALFACE AMERICANA MOI', gramatura: 'Unidade(s)', filial: 'AMORE COSTA DOURADA', nivel: 'Crítico', minimo: 3, ideal: 8 },
  { nome: 'ALFACE CRESPA MOI', gramatura: 'Unidade(s)', filial: 'AMORE COSTA DOURADA', nivel: 'Crítico', minimo: 3, ideal: 8 },
  { nome: 'ALFACE ROXA MOI', gramatura: 'Unidade(s)', filial: 'AMORE COSTA DOURADA', nivel: 'Crítico', minimo: 2, ideal: 4 },
  { nome: 'ALHO NAIF (8 A 9 FOLHA)', gramatura: 'Unidade(s)', filial: 'AMORE COSTA DOURADA', nivel: 'Repor', minimo: 1, ideal: 3 },
  { nome: 'ALHO 140', gramatura: 'Quilograma(s)', filial: 'AMORE COSTA DOURADA', nivel: 'Crítico', minimo: 1, ideal: 2 },
  { nome: 'AMACANTE DE CARNES NO...', gramatura: 'Unidade(s)', filial: 'AMORE COSTA DOURADA', nivel: 'Crítico', minimo: 1, ideal: 2 },
]

const MOVIMENTACOES_DIAS: DiaMovimentacao[] = [
  {
    data: '09/05/2026',
    dataISO: '2026-05-09',
    movs: [
      { tipo: 'entrada', produto: 'ARROZ INTEGRAL 1KG – PCT', quantidade: '1 un', filial: 'AMORE COSTA DOURADA', hora: '08:12' },
      { tipo: 'saida', produto: 'AÇUCAR CRISTAL PCT 1 KG', quantidade: '2 un', filial: 'AMORE COSTA DOURADA', hora: '08:15' },
      { tipo: 'entrada', produto: 'ARROZ BIRO 1KG', quantidade: '3 un', filial: 'AMORE COSTA DOURADA', hora: '09:00' },
      { tipo: 'entrada', produto: 'BOBINA TERM STYXTEH ÉTCON', quantidade: '16 un', filial: 'AMORE COSTA DOURADA', hora: '09:30' },
      { tipo: 'entrada', produto: 'BOBINA PORCINHA GRANDE 1 UNIDADE', quantidade: '5 un', filial: 'AMORE COSTA DOURADA', hora: '09:45' },
      { tipo: 'saida', produto: 'ARROZ BRANCO TIRO – GRÃO DE OURO', quantidade: '8 un', filial: 'AMORE COSTA DOURADA', hora: '10:00' },
      { tipo: 'entrada', produto: 'BOBINA BRANCO TIRO 1KG', quantidade: '8 un', filial: 'AMORE COSTA DOURADA', hora: '10:15' },
      { tipo: 'saida', produto: 'BOBINA BRANCO MÉDIA 1 UNIDADE', quantidade: '19 un', filial: 'AMORE COSTA DOURADA', hora: '10:30' },
      { tipo: 'saida', produto: '1 AMACANTE DE CARNES NO...', quantidade: '7 un', filial: 'AMORE COSTA DOURADA', hora: '11:00' },
    ]
  },
  {
    data: '06/05/2026',
    dataISO: '2026-05-06',
    movs: [
      { tipo: 'entrada', produto: 'ALFACE AMERICANA MOI', quantidade: '5 un', filial: 'AMORE COSTA DOURADA', hora: '07:45' },
      { tipo: 'saida', produto: 'ABOBRINHA 1 kg', quantidade: '2 un', filial: 'AMORE COSTA DOURADA', hora: '08:00' },
      { tipo: 'entrada', produto: 'ALCOOL GEL 500 ML', quantidade: '4 un', filial: 'AMORE COSTA DOURADA', hora: '08:30' },
    ]
  },
  {
    data: '05/05/2026',
    dataISO: '2026-05-05',
    movs: [
      { tipo: 'entrada', produto: 'AGUA SANTIAGO 1LT', quantidade: '48 un', filial: 'AMORE COSTA DOURADA', hora: '09:00' },
      { tipo: 'saida', produto: 'ALCOOL LIQUIDO 1LTR', quantidade: '1 un', filial: 'AMORE COSTA DOURADA', hora: '13:00' },
    ]
  },
  {
    data: '04/05/2026',
    dataISO: '2026-05-04',
    movs: [
      { tipo: 'saida', produto: 'ALFACE CRESPA MOI', quantidade: '8 un', filial: 'AMORE COSTA DOURADA', hora: '07:30' },
      { tipo: 'entrada', produto: 'ADOÇANTE 200 ML', quantidade: '6 un', filial: 'AMORE COSTA DOURADA', hora: '08:00' },
    ]
  },
  {
    data: '30/04/2026',
    dataISO: '2026-04-30',
    movs: [
      { tipo: 'entrada', produto: 'AGUA COM GAS 500 ML', quantidade: '24 un', filial: 'AMORE COSTA DOURADA', hora: '10:00' },
      { tipo: 'saida', produto: 'ALHO 140', quantidade: '1 un', filial: 'AMORE COSTA DOURADA', hora: '11:30' },
    ]
  },
  {
    data: '28/04/2026',
    dataISO: '2026-04-28',
    movs: [
      { tipo: 'entrada', produto: 'ALFACE ROXA MOI', quantidade: '4 un', filial: 'AMORE COSTA DOURADA', hora: '08:00' },
      { tipo: 'saida', produto: 'ACELGA MOI', quantidade: '3 un', filial: 'AMORE COSTA DOURADA', hora: '12:00' },
    ]
  },
]

const HISTORICO_CONTAGENS: ContHistorico[] = []

const NIVEL_BADGE: Record<NivelStatus, string> = {
  'Crítico': 'bg-r',
  'Repor': 'bg-y',
  'Ok': 'bg-g',
  'Ideal': 'bg-b',
}

const CATEGORIAS = ['Açaí', 'Bebidas', 'Carnes', 'Condimentos', 'Frutas', 'Higiene', 'Laticínios', 'Legumes', 'Limpeza', 'Proteínas']

function TabLista() {
  const [busca, setBusca] = useState('')
  const [ordenar, setOrdenar] = useState('Nome (A-Z)')
  const [categoria, setCategoria] = useState('')

  const filtrados = PRODUTOS.filter(p =>
    p.nome.toLowerCase().includes(busca.toLowerCase())
  )

  const criticos = PRODUTOS.filter(p => p.nivel === 'Crítico').length
  const repor = PRODUTOS.filter(p => p.nivel === 'Repor').length

  return (
    <div>
      <div className="kpi-grid" style={{ marginBottom: 14 }}>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: 'var(--bordo)' }} />
          <div className="kpi-lbl">Valor em Estoque (mês)</div>
          <div className="kpi-val">R$ 0,00</div>
          <div className="kpi-sub">AMORE COSTA DOURADA</div>
        </div>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: 'var(--blue)' }} />
          <div className="kpi-lbl">Total de Produtos</div>
          <div className="kpi-val">273</div>
          <div className="kpi-sub">cadastrados no estoque</div>
        </div>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: 'var(--danger)' }} />
          <div className="kpi-lbl">Nível Crítico</div>
          <div className="kpi-val" style={{ color: 'var(--danger)' }}>{criticos}</div>
          <div className="kpi-sub">produtos abaixo do mínimo</div>
        </div>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: 'var(--warning)' }} />
          <div className="kpi-lbl">Repor</div>
          <div className="kpi-val" style={{ color: 'var(--warning)' }}>{repor}</div>
          <div className="kpi-sub">produtos para repor</div>
        </div>
      </div>

      <div className="card">
        <div className="card-hd">
          <span className="card-tt">📦 Lista de Estoque</span>
          <button className="btn bp bsm">
            <Plus size={11} /> Configurar Estoque de Produto
          </button>
        </div>

        <div style={{ padding: '10px 15px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="sw-wrap" style={{ flex: 1, minWidth: 200 }}>
            <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
            <input
              className="srch"
              placeholder="Buscar por nome..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
            />
          </div>
          <select className="flt" value={ordenar} onChange={e => setOrdenar(e.target.value)}>
            <option>Nome (A-Z)</option>
            <option>Nome (Z-A)</option>
            <option>Nível Crítico primeiro</option>
            <option>Estoque Mínimo</option>
          </select>
          <select className="flt" value={categoria} onChange={e => setCategoria(e.target.value)}>
            <option value="">Selecione as categorias</option>
            {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
          </select>
          {(busca || categoria) && (
            <button className="btn bo bsm" onClick={() => { setBusca(''); setCategoria('') }}>
              Limpar filtros
            </button>
          )}
        </div>

        <div className="tw">
          <table>
            <thead>
              <tr>
                <th><input type="checkbox" /></th>
                <th>Produto</th>
                <th>Gramatura</th>
                <th>Filial</th>
                <th>Nível de Estoque</th>
                <th>Estoque Mínimo</th>
                <th>Estoque Ideal</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((p, i) => (
                <tr key={i}>
                  <td><input type="checkbox" /></td>
                  <td><strong>{p.nome}</strong></td>
                  <td style={{ color: 'var(--blue)', fontWeight: 500 }}>{p.gramatura}</td>
                  <td>{p.filial}</td>
                  <td><span className={`badge ${NIVEL_BADGE[p.nivel]}`}>{p.nivel}</span></td>
                  <td>{p.minimo.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
                  <td>{p.ideal}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtrados.length === 0 && (
            <div className="empty">
              <Package size={36} />
              <div>Nenhum produto encontrado</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function TabCMV() {
  const [estoqueInicial, setEstoqueInicial] = useState('')
  const [faturamento, setFaturamento] = useState('')

  const cmvCalc = () => {
    const ei = parseFloat(estoqueInicial.replace(',', '.') || '0')
    const fat = parseFloat(faturamento.replace(',', '.') || '0')
    if (!fat) return '—'
    const perc = ((ei / fat) * 100).toFixed(1)
    return `${perc}%`
  }

  const todasMovs = MOVIMENTACOES_DIAS.flatMap(d =>
    d.movs.map(m => ({ ...m, data: d.data }))
  ).slice(0, 20)

  return (
    <div>
      <div className="kpi-grid" style={{ marginBottom: 14 }}>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: 'var(--blue)' }} />
          <div className="kpi-lbl">Estoque Inicial</div>
          <div className="kpi-val">R$ 0,00</div>
          <div className="kpi-sub">início do período</div>
        </div>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: 'var(--success)' }} />
          <div className="kpi-lbl">Total em Compras</div>
          <div className="kpi-val">R$ 0,00</div>
          <div className="kpi-sub">compras do período</div>
        </div>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: 'var(--warning)' }} />
          <div className="kpi-lbl">Estoque Final</div>
          <div className="kpi-val">R$ 0,00</div>
          <div className="kpi-sub">fim do período</div>
        </div>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: 'var(--bordo)' }} />
          <div className="kpi-lbl">Custo da Mercadoria Vendida</div>
          <div className="kpi-val">R$ 0,00</div>
          <div className="kpi-sub" style={{ display: 'flex', gap: 5, alignItems: 'center', marginTop: 6 }}>
            <input
              className="inp"
              style={{ flex: 1, padding: '4px 8px', fontSize: 11 }}
              placeholder="Digite o faturamento"
              value={faturamento}
              onChange={e => setFaturamento(e.target.value)}
            />
            <button className="btn bp bsm" onClick={() => {}}>
              <Calculator size={10} /> Calcular
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-hd">
          <span className="card-tt">↕ Movimentações do Período</span>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>1 de mai de 2026 – 31 de mai de 2026</span>
        </div>
        <div style={{ padding: '12px 15px' }}>
          {todasMovs.map((m, i) => (
            <div key={i} className="sl-i">
              <div className="sl-ico" style={{ background: m.tipo === 'entrada' ? '#D1FAE5' : '#FEE2E2' }}>
                {m.tipo === 'entrada'
                  ? <CheckCircle size={11} style={{ color: 'var(--success)' }} />
                  : <XCircle size={11} style={{ color: 'var(--danger)' }} />
                }
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12 }}>
                  No dia <strong>{m.data}</strong>, foi{' '}
                  <span style={{ color: m.tipo === 'entrada' ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                    {m.tipo === 'entrada' ? 'adicionado' : 'removido'}
                  </span>{' '}
                  <strong>{m.quantidade}</strong> <strong>{m.produto}</strong> na filial{' '}
                  <a style={{ color: 'var(--blue)', fontWeight: 500 }}>{m.filial}</a>.
                </div>
              </div>
            </div>
          ))}
          {todasMovs.length === 0 && (
            <div className="empty"><ArrowLeftRight size={28} /><div>Nenhuma movimentação no período</div></div>
          )}
        </div>
      </div>
    </div>
  )
}

function TabHistorico() {
  const [showForm, setShowForm] = useState(false)

  return (
    <div>
      <div className="sec-tt">Histórico de Contagens</div>
      <div className="sec-sub">Visualize todos os históricos de contagens que você já fez</div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16 }}>
        <div className="card" style={{ padding: 15 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Seu histórico</div>
          <button className="btn bp" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setShowForm(true)}>
            <Plus size={11} /> Criar histórico
          </button>
          {HISTORICO_CONTAGENS.length > 0 && (
            <div style={{ marginTop: 10 }}>
              {HISTORICO_CONTAGENS.map((h, i) => (
                <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{h.data}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>{h.tipo} · {h.produtos} produtos</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
          <div className="empty">
            <History size={36} />
            <div style={{ marginTop: 8, fontWeight: 600 }}>Selecione uma data para ver o histórico</div>
            <div style={{ fontSize: 11, marginTop: 4 }}>Crie um histórico para começar a registrar contagens</div>
          </div>
        </div>
      </div>

      {showForm && (
        <div className="ov open" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="mhd">
              <span className="mtt">Criar Histórico de Contagem</span>
              <button className="mx" onClick={() => setShowForm(false)}>✕</button>
            </div>
            <div className="mbd">
              <div className="fg">
                <label className="fl">Data da Contagem</label>
                <input type="date" className="inp" defaultValue={new Date().toISOString().split('T')[0]} />
              </div>
              <div className="fg">
                <label className="fl">Filial</label>
                <select className="sel">
                  <option>AMORE COSTA DOURADA</option>
                </select>
              </div>
              <div className="fg">
                <label className="fl">Tipo</label>
                <select className="sel">
                  <option>Contagem regular</option>
                  <option>Contagem de fechamento</option>
                  <option>Contagem de abertura</option>
                </select>
              </div>
            </div>
            <div className="mft">
              <button className="btn bo" onClick={() => setShowForm(false)}>Cancelar</button>
              <button className="btn bp" onClick={() => setShowForm(false)}>Criar histórico</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TabMovimentacoes() {
  const [diaSelecionado, setDiaSelecionado] = useState<DiaMovimentacao | null>(null)

  return (
    <div>
      <div className="sec-tt">Suas movimentações</div>
      <div className="sec-sub">Aqui você pode ver o histórico de todos os produtos que foram atualizados.</div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16 }}>
        <div className="card" style={{ padding: 15 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Movimentações</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {MOVIMENTACOES_DIAS.map((d, i) => (
              <button
                key={i}
                onClick={() => setDiaSelecionado(d)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '9px 12px', borderRadius: 7, border: '1px solid var(--border)',
                  background: diaSelecionado?.dataISO === d.dataISO ? 'var(--bordo-bg)' : '#fff',
                  color: diaSelecionado?.dataISO === d.dataISO ? 'var(--bordo)' : 'var(--text)',
                  fontWeight: 600, fontSize: 12.5, cursor: 'pointer', transition: '.15s',
                  borderColor: diaSelecionado?.dataISO === d.dataISO ? 'var(--bordo-l)' : 'var(--border)',
                }}
              >
                {d.data}
                <ChevronRight size={13} />
              </button>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 15 }}>
          {diaSelecionado ? (
            <>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>
                Histórico de {diaSelecionado.data}
              </div>
              {diaSelecionado.movs.map((m, i) => (
                <div key={i} className="sl-i">
                  <div className="sl-ico" style={{ background: m.tipo === 'entrada' ? '#D1FAE5' : '#FEE2E2' }}>
                    {m.tipo === 'entrada'
                      ? <CheckCircle size={11} style={{ color: 'var(--success)' }} />
                      : <XCircle size={11} style={{ color: 'var(--danger)' }} />
                    }
                  </div>
                  <div>
                    <div style={{ fontSize: 12 }}>
                      No dia <strong>{diaSelecionado.data}</strong>, foi{' '}
                      <span style={{ color: m.tipo === 'entrada' ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                        {m.tipo === 'entrada' ? 'adicionado' : 'removido'}
                      </span>{' '}
                      <strong>{m.quantidade}</strong> <strong>{m.produto}</strong> na filial{' '}
                      <span style={{ color: 'var(--blue)', fontWeight: 500 }}>{m.filial}</span>.
                    </div>
                  </div>
                </div>
              ))}
              {diaSelecionado.movs.length === 0 && (
                <div className="empty"><ArrowLeftRight size={28} /><div>Nenhuma movimentação neste dia</div></div>
              )}
            </>
          ) : (
            <div className="empty" style={{ padding: '60px 0' }}>
              <ArrowLeftRight size={36} />
              <div style={{ marginTop: 8, fontWeight: 600 }}>Selecione uma data para ver o histórico</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function TabContagem() {
  const [tipoContagem, setTipoContagem] = useState<TipoContagem>('Contagem regular')
  const [filial, setFilial] = useState('AMORE COSTA DOURADA')
  const [categoria, setCategoria] = useState('')
  const [ordenar, setOrdenar] = useState('Nome (A-Z)')
  const [contagens, setContagens] = useState<Record<string, number>>(
    Object.fromEntries(PRODUTOS.map(p => [p.nome, 0]))
  )

  const handleContagem = (nome: string, val: string) => {
    const n = parseFloat(val)
    setContagens(prev => ({ ...prev, [nome]: isNaN(n) ? 0 : n }))
  }

  const handlePrint = () => window.print()

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div className="sec-tt">Contagem de Estoque</div>
          <div className="sec-sub">Preencha os campos abaixo para fazer uma contagem de estoque</div>
        </div>
        <button className="btn bo" onClick={handlePrint}>
          <Download size={11} /> Baixar PDF
        </button>
      </div>

      <div className="card" style={{ padding: 15, marginBottom: 14 }}>
        <div className="g2" style={{ marginBottom: 11 }}>
          <div className="fg" style={{ marginBottom: 0 }}>
            <label className="fl">Tipo de contagem</label>
            <select className="sel" value={tipoContagem} onChange={e => setTipoContagem(e.target.value as TipoContagem)}>
              <option>Contagem regular</option>
              <option>Contagem de fechamento</option>
              <option>Contagem de abertura</option>
            </select>
          </div>
          <div className="fg" style={{ marginBottom: 0 }}>
            <label className="fl">Ordenar por</label>
            <select className="sel" value={ordenar} onChange={e => setOrdenar(e.target.value)}>
              <option>Nome (A-Z)</option>
              <option>Nome (Z-A)</option>
              <option>Categoria</option>
            </select>
          </div>
        </div>
        <div className="g2">
          <div className="fg" style={{ marginBottom: 0 }}>
            <label className="fl">Filial</label>
            <select className="sel" value={filial} onChange={e => setFilial(e.target.value)}>
              <option>AMORE COSTA DOURADA</option>
            </select>
          </div>
          <div className="fg" style={{ marginBottom: 0 }}>
            <label className="fl">Categoria</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <select className="sel" value={categoria} onChange={e => setCategoria(e.target.value)} style={{ flex: 1 }}>
                <option value="">Selecione uma categoria</option>
                {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
              </select>
              {categoria && (
                <button className="btn bo bsm" onClick={() => setCategoria('')}>Limpar</button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Produto</th>
                <th>Unidade de Medida</th>
                <th style={{ width: 160 }}>Contagem</th>
              </tr>
            </thead>
            <tbody>
              {PRODUTOS.map((p, i) => (
                <tr key={i}>
                  <td><strong>{p.nome}</strong></td>
                  <td style={{ color: 'var(--muted)' }}>{p.gramatura.replace('(s)', '')}</td>
                  <td>
                    <input
                      type="number"
                      className="inp"
                      style={{ padding: '4px 8px', fontSize: 12 }}
                      min={0}
                      value={contagens[p.nome] ?? 0}
                      onChange={e => handleContagem(p.nome, e.target.value)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '12px 15px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn bp">
            <ClipboardList size={11} /> Salvar Contagem
          </button>
        </div>
      </div>
    </div>
  )
}

type EstoqueTab = 'lista' | 'cmv' | 'historico' | 'movimentacoes' | 'contagem'

const TABS: { id: EstoqueTab; label: string; icon: React.ReactNode }[] = [
  { id: 'lista', label: 'Lista', icon: <Package size={12} /> },
  { id: 'cmv', label: 'CMV', icon: <TrendingDown size={12} /> },
  { id: 'historico', label: 'Histórico', icon: <History size={12} /> },
  { id: 'movimentacoes', label: 'Movimentações', icon: <ArrowLeftRight size={12} /> },
  { id: 'contagem', label: 'Contagem', icon: <ClipboardList size={12} /> },
]

export default function EstoquePage() {
  const [tab, setTab] = useState<EstoqueTab>('lista')

  return (
    <div>
      <div className="tabs" style={{ marginBottom: 16 }}>
        {TABS.map(t => (
          <button
            key={t.id}
            className={`tab${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 5 }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === 'lista' && <TabLista />}
      {tab === 'cmv' && <TabCMV />}
      {tab === 'historico' && <TabHistorico />}
      {tab === 'movimentacoes' && <TabMovimentacoes />}
      {tab === 'contagem' && <TabContagem />}
    </div>
  )
}
