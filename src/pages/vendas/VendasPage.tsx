import { useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

const MOCK = [
  { id: 'v1', data: '22/07', loja: 'Amore Paiva', colab: 'João Ricardo', canal: 'Salão', total: 'R$ 94,70', pag: 'PIX', aval: '⭐⭐⭐⭐⭐', tempo: '11 min' },
  { id: 'v2', data: '22/07', loja: 'Amore CD', colab: 'Felipe Santos', canal: 'Balcão', total: 'R$ 51,80', pag: 'Débito', aval: '⭐⭐⭐⭐', tempo: '9 min' },
  { id: 'v3', data: '22/07', loja: 'Amore Paiva', colab: 'Maria Clara', canal: 'Salão', total: 'R$ 73,20', pag: 'Crédito', aval: '⭐⭐⭐⭐⭐', tempo: '13 min' },
]

export default function VendasPage() {
  const { can } = useAuth()
  const [search, setSearch] = useState('')
  const filtered = MOCK.filter(v => !search || v.colab.toLowerCase().includes(search.toLowerCase()) || v.loja.toLowerCase().includes(search.toLowerCase()))

  return (
    <div>
      <div className="kpi-grid" style={{ marginBottom: 14 }}>
        {[
          { lbl: 'Vendas Hoje', val: '176', sub: '+12% vs. ontem', col: 'var(--bordo)' },
          { lbl: 'Faturamento', val: 'R$ 8.420', sub: '▲8%', col: 'var(--success)' },
          { lbl: 'Ticket Médio', val: 'R$ 47,80', sub: 'Meta: R$ 45', col: 'var(--blue)' },
          { lbl: 'Avaliação Média', val: '4,7 ⭐', sub: '38 avaliações', col: 'var(--warning)' },
        ].map((k, i) => (
          <div className="kpi" key={i}><div className="kpi-ac" style={{ background: k.col }} /><div className="kpi-lbl">{k.lbl}</div><div className="kpi-val">{k.val}</div><div className="kpi-sub">{k.sub}</div></div>
        ))}
      </div>
      <div className="fb">
        <div className="sw-wrap">
          <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
          <input className="srch" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="flt"><option>Todas Lojas</option><option>Amore CD</option><option>Amore Paiva</option><option>Flow CD</option></select>
        <input type="date" className="flt" />
        {can('vendas', 'create') && <button className="btn bp bsm"><Plus size={11} />Nova Venda</button>}
      </div>
      <div className="card">
        <div className="tw">
          <table>
            <thead><tr><th>Data</th><th>Loja</th><th>Colaborador</th><th>Canal</th><th>Total</th><th>Pagamento</th><th>Avaliação</th><th>Tempo</th></tr></thead>
            <tbody>
              {filtered.map(v => (
                <tr key={v.id}><td>{v.data}</td><td>{v.loja}</td><td>{v.colab}</td><td>{v.canal}</td><td><strong>{v.total}</strong></td><td>{v.pag}</td><td>{v.aval}</td><td>{v.tempo}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
