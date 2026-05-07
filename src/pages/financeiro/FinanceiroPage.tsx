export default function FinanceiroPage() {
  return (
    <div>
      <div className="kpi-grid">
        {[
          { lbl: 'Receita Mês', val: 'R$ 142.800', sub: '▲8%', col: 'var(--success)', up: true },
          { lbl: 'Despesas', val: 'R$ 98.420', sub: '▲4%', col: 'var(--danger)' },
          { lbl: 'Lucro Líquido', val: 'R$ 44.380', sub: 'Margem 31%', col: 'var(--blue)' },
          { lbl: 'CMV Mensal', val: '29,2%', sub: 'Meta <32%', col: 'var(--warning)' },
        ].map((k, i) => (
          <div className="kpi" key={i}><div className="kpi-ac" style={{ background: k.col }} /><div className="kpi-lbl">{k.lbl}</div><div className="kpi-val">{k.val}</div><div className="kpi-sub">{k.up ? <span className="kpi-up">▲ </span> : ''}{k.sub}</div></div>
        ))}
      </div>
      <div className="card">
        <div className="card-hd"><span className="card-tt">Ponto de Equilíbrio por Loja</span></div>
        <div className="tw">
          <table>
            <thead><tr><th>Loja</th><th>Custos Fixos</th><th>PE Diário</th><th>Fat. Hoje</th><th>Cobertura</th><th>Status</th></tr></thead>
            <tbody>
              {[
                { loja: 'Amore CD', cf: 'R$ 22.000', pe: 'R$ 1.000/dia', fat: 'R$ 3.120', cob: '312%', st: 'bg-g', stl: '✓ Superado' },
                { loja: 'Amore Paiva', cf: 'R$ 28.000', pe: 'R$ 1.273/dia', fat: 'R$ 3.840', cob: '302%', st: 'bg-g', stl: '✓ Superado' },
                { loja: 'Flow CD', cf: 'R$ 18.400', pe: 'R$ 836/dia', fat: 'R$ 1.460', cob: '175%', st: 'bg-y', stl: 'Atenção' },
              ].map((r, i) => (
                <tr key={i}><td>{r.loja}</td><td>{r.cf}</td><td>{r.pe}</td><td>{r.fat}</td><td>{r.cob}</td><td><span className={`badge ${r.st}`}>{r.stl}</span></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
