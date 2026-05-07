import { AlertTriangle, CheckCircle, AlertCircle } from 'lucide-react'

const COLABS_MOCK = [
  { nome: 'João Ricardo', loja: 'Amore Paiva', cor: '#F59E0B', ini: 'JR', fat: 28400 },
  { nome: 'Maria Clara', loja: 'Amore Paiva', cor: '#10B981', ini: 'MC', fat: 22000 },
  { nome: 'Felipe Santos', loja: 'Amore CD', cor: '#CD7C2F', ini: 'FS', fat: 18500 },
]

export default function DashboardPage() {
  return (
    <div>
      <div className="kpi-grid">
        {[
          { lbl: 'Faturamento Hoje', val: 'R$ 8.420', sub: '▲12% vs. ontem', col: 'var(--success)', up: true },
          { lbl: 'CMV do Dia', val: '28,4%', sub: 'Meta <32%', col: 'var(--warning)', sem: 'sg' },
          { lbl: 'Ticket Médio', val: 'R$ 47,80', sub: '▲5% vs. semana', col: 'var(--blue)', up: true },
          { lbl: 'Pendências', val: '7', sub: '2 urgentes', col: 'var(--danger)', dn: true },
          { lbl: 'Avaliação', val: '4,7 ⭐', sub: '38 avaliações hoje', col: 'var(--purple)' },
          { lbl: 'Tempo Médio', val: '12 min', sub: 'Meta 15min', col: 'var(--teal)', sem: 'sg' },
        ].map((k, i) => (
          <div className="kpi" key={i}>
            <div className="kpi-ac" style={{ background: k.col }} />
            <div className="kpi-lbl">{k.lbl}</div>
            <div className="kpi-val">{k.val}</div>
            <div className="kpi-sub">
              {k.sem ? <span className="sem"><span className={`sem-dot ${k.sem}`} />{k.sub}</span>
                : k.up ? <><span className="kpi-up">▲</span>{k.sub}</>
                : k.dn ? <span className="kpi-dn">{k.sub}</span>
                : k.sub}
            </div>
          </div>
        ))}
      </div>

      <div className="g11" style={{ marginBottom: 14 }}>
        <div className="card">
          <div className="card-hd"><span className="card-tt">Faturamento 7 Dias</span><span className="badge bg-g">▲8%</span></div>
          <div className="card-bd">
            <div className="bc">
              {[['Seg', 65, 'R$ 7.120'], ['Ter', 72, 'R$ 7.890'], ['Qua', 58, 'R$ 6.350'], ['Qui', 80, 'R$ 8.760'], ['Sex', 95, 'R$ 10.420'], ['Sáb', 100, 'R$ 10.940'], ['Dom', 77, 'R$ 8.420']].map(([d, w, v]) => (
                <div className="bc-row" key={d as string}>
                  <span className="bc-lbl">{d}</span>
                  <div className="bc-out"><div className="bc-in" style={{ width: `${w}%`, background: 'var(--bordo)' }} /></div>
                  <span className="bc-val">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-hd"><span className="card-tt">Alertas Críticos</span><span className="badge bg-r">3 novos</span></div>
          <div className="card-bd" style={{ padding: 11 }}>
            <div className="al al-r">
              <AlertTriangle size={13} />
              <div><strong>Freezer 2 com defeito</strong> — Amore Paiva<br /><span style={{ fontSize: 10.5 }}>Temperatura irregular · OS #001</span></div>
            </div>
            <div className="al al-y">
              <AlertCircle size={13} />
              <div><strong>Estoque mínimo</strong> — Açaí base: 2kg</div>
            </div>
            <div className="al al-g">
              <CheckCircle size={13} />
              <div><strong>Meta atingida</strong> — Amore Paiva: R$ 8.420</div>
            </div>
          </div>
        </div>
      </div>

      <div className="g11">
        <div className="card">
          <div className="card-hd"><span className="card-tt">🏆 Ranking do Dia</span></div>
          <div className="card-bd" style={{ padding: '7px 11px' }}>
            {COLABS_MOCK.map((c, i) => (
              <div className="rk" key={c.nome}>
                <span className="rk-n" style={{ color: ['var(--warning)', '#9CA3AF', '#CD7C2F'][i] }}>{i + 1}</span>
                <div className="rk-av" style={{ background: c.cor }}>{c.ini}</div>
                <div className="rk-info">
                  <div className="rk-nm">{c.nome}</div>
                  <div className="rk-rl">{c.loja}</div>
                </div>
                <div className="rk-pts">
                  <div className="rk-pv">R$ {c.fat.toLocaleString('pt-BR')}</div>
                  <div className="rk-pl">faturado</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-hd"><span className="card-tt">Metas por Loja</span></div>
          <div className="card-bd">
            {[
              { loja: 'Amore CD', val: 3120, meta: 4200, pct: 74, col: 'var(--success)' },
              { loja: 'Amore Paiva', val: 3840, meta: 4000, pct: 96, col: 'var(--success)' },
              { loja: 'Flow CD', val: 1460, meta: 2500, pct: 58, col: 'var(--warning)' },
            ].map(m => (
              <div key={m.loja} style={{ marginBottom: 11 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{m.loja}</span>
                  <span className={`badge ${m.pct >= 90 ? 'bg-g' : m.pct >= 70 ? 'bg-y' : 'bg-r'}`}>R$ {m.val.toLocaleString('pt-BR')}</span>
                </div>
                <div className="prog"><div className="pb" style={{ width: `${m.pct}%`, background: m.col }} /></div>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{m.pct}% · meta: R$ {m.meta.toLocaleString('pt-BR')}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
