
const COMPRAS = [
  { data: '21/07', forn: 'FornAçaí Ltda', loja: 'Amore Paiva', total: 'R$ 480', nf: '001234', st: 'bg-g', stl: 'Entregue' },
  { data: '20/07', forn: 'AmazonAçaí', loja: 'Amore CD', total: 'R$ 1.200', nf: '001180', st: 'bg-g', stl: 'Entregue' },
  { data: '22/07', forn: 'NorteGel Polpas', loja: 'Flow CD', total: 'R$ 320', nf: '—', st: 'bg-y', stl: 'Pendente' },
]

const ESTOQUE = [
  { nome: 'Açaí base 10kg', categ: 'Açaí', loja: 'Amore Paiva', atual: 2, min: 5, max: 30, preco: 'R$ 43,50', st: 'bg-r', stl: 'Crítico' },
  { nome: 'Polpa de frutas', categ: 'Açaí', loja: 'Amore CD', atual: 8, min: 4, max: 20, preco: 'R$ 11,20', st: 'bg-g', stl: 'Ok' },
  { nome: 'Creme de leite', categ: 'Laticínios', loja: 'Flow CD', atual: 6, min: 4, max: 15, preco: 'R$ 7,90', st: 'bg-g', stl: 'Ok' },
  { nome: 'Granola', categ: 'Ingredientes', loja: 'Amore CD', atual: 3, min: 2, max: 10, preco: 'R$ 12,00', st: 'bg-y', stl: 'Repor' },
]

export default function ComprasPage() {
  return (
    <div>
      <div className="kpi-grid" style={{ marginBottom: 14 }}>
        {[
          { lbl: 'Gasto Mês', val: 'R$ 12.480', sub: '24 compras', col: 'var(--bordo)' },
          { lbl: 'Fornecedores Ativos', val: '4', sub: 'cadastrados', col: 'var(--blue)' },
          { lbl: 'Itens Críticos', val: '1', sub: 'abaixo do mínimo', col: 'var(--danger)' },
          { lbl: 'Economia Cotações', val: 'R$ 840', sub: 'vs. preço mais alto', col: 'var(--success)' },
        ].map((k, i) => (
          <div className="kpi" key={i}><div className="kpi-ac" style={{ background: k.col }} /><div className="kpi-lbl">{k.lbl}</div><div className="kpi-val">{k.val}</div><div className="kpi-sub">{k.sub}</div></div>
        ))}
      </div>

      <div className="g11" style={{ marginBottom: 14 }}>
        <div className="card">
          <div className="card-hd"><span className="card-tt">📋 Últimas Compras</span></div>
          <div className="tw">
            <table>
              <thead><tr><th>Data</th><th>Fornecedor</th><th>Loja</th><th>Total</th><th>NF</th><th>Status</th></tr></thead>
              <tbody>
                {COMPRAS.map((c, i) => (
                  <tr key={i}><td>{c.data}</td><td>{c.forn}</td><td>{c.loja}</td><td><strong>{c.total}</strong></td><td>{c.nf}</td><td><span className={`badge ${c.st}`}>{c.stl}</span></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <div className="card-hd"><span className="card-tt">📦 Estoque Atual</span></div>
          <div className="tw">
            <table>
              <thead><tr><th>Produto</th><th>Loja</th><th>Atual</th><th>Mínimo</th><th>Preço</th><th>Status</th></tr></thead>
              <tbody>
                {ESTOQUE.map((e, i) => (
                  <tr key={i}><td><strong>{e.nome}</strong><div style={{ fontSize: 10, color: 'var(--muted)' }}>{e.categ}</div></td><td>{e.loja}</td><td style={{ fontWeight: 700, color: e.atual <= e.min ? 'var(--danger)' : 'var(--text)' }}>{e.atual}</td><td>{e.min}</td><td>{e.preco}</td><td><span className={`badge ${e.st}`}>{e.stl}</span></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
