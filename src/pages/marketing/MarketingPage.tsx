import { AlertCircle, CheckCircle } from 'lucide-react'

const ACOES = [
  { id: 'a1', nome: 'Quarta do Combo', desc: '10% off nos combos toda quarta', loja: 'Todas', tipo: 'Promoção', tipoCls: 'bg-br', obj: 'Aumentar faturamento', intensidade: 'Agressiva', intCls: 'bg-r', status: 'Em execução', stCls: 'bg-b', roi: '+480%', learn: 'Quarta virou o dia mais forte. Manter e expandir.' },
  { id: 'a2', nome: 'Stories Bastidores', desc: 'Conteúdo de processo no Instagram', loja: 'Amore Paiva', tipo: 'Digital', tipoCls: 'bg-b', obj: 'Atrair novos clientes', intensidade: 'Média', intCls: 'bg-y', status: 'Finalizada', stCls: 'bg-g', roi: '+120%', learn: '+40% seguidores. Manter 3x/semana.' },
  { id: 'a3', nome: 'Festival Temaki', desc: 'Evento rodízio especial · Amore CD', loja: 'Amore CD', tipo: 'Evento', tipoCls: 'bg-p', obj: 'Aumentar faturamento', intensidade: 'Agressiva', intCls: 'bg-r', status: 'Planejamento', stCls: 'bg-y', roi: '—', learn: 'Aguardando execução' },
]

export default function MarketingPage() {
  return (
    <div>
      <div className="kpi-grid">
        {[
          { lbl: 'ROI Médio Ações', val: '+348%', sub: '▲22% vs. mês anterior', col: 'var(--bordo)', up: true },
          { lbl: 'Investimento Mês', val: 'R$ 3.240', sub: '3 campanhas ativas', col: 'var(--warning)' },
          { lbl: 'Receita via Marketing', val: 'R$ 14.480', sub: '▲18% vs. sem ação', col: 'var(--success)', up: true },
          { lbl: 'Ações Ativas', val: '5', sub: '2 planejamento · 3 execução', col: 'var(--blue)' },
          { lbl: 'Próx. Evento', val: '30/Jul', sub: 'Festival Temaki', col: 'var(--purple)' },
          { lbl: 'Custo/Pedido', val: 'R$ 4,20', sub: 'Meta: R$ 5,00', col: 'var(--teal)' },
        ].map((k, i) => (
          <div className="kpi" key={i}>
            <div className="kpi-ac" style={{ background: k.col }} />
            <div className="kpi-lbl">{k.lbl}</div>
            <div className="kpi-val">{k.val}</div>
            <div className="kpi-sub">{k.up ? <><span className="kpi-up">▲</span></> : ''}{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="g11" style={{ marginBottom: 14 }}>
        <div className="card">
          <div className="card-hd"><span className="card-tt">🔥 Análise Inteligente</span><span className="badge bg-b">Live</span></div>
          <div className="card-bd" style={{ padding: 10 }}>
            <div className="al al-g"><CheckCircle size={13} /><div><strong>Melhor ação:</strong> Quarta do Combo — ROI 480%, ticket médio +R$12 vs. outros dias</div></div>
            <div className="al al-r"><AlertCircle size={13} /><div><strong>Pior performance:</strong> Anúncio Seg/Ter — Custo/pedido R$14,80 · Encerrar ou ajustar segmentação</div></div>
            <div className="al al-y"><AlertCircle size={13} /><div><strong>Tipo que mais converte:</strong> Promoção (+68%) supera campanha digital paga (+22%)</div></div>
            <div className="al al-b"><AlertCircle size={13} /><div><strong>Flow CD</strong> abaixo da meta por 2 semanas. Ação local urgente recomendada.</div></div>
          </div>
        </div>
        <div className="card">
          <div className="card-hd"><span className="card-tt">📊 ROI por Tipo de Estratégia</span></div>
          <div className="card-bd">
            <div className="bc">
              {[['Promoção', 88, '+348%', 'var(--bordo)'], ['Evento', 75, '+220%', 'var(--purple)'], ['Digital Pago', 60, '+180%', 'var(--blue)'], ['Ação de Rua', 45, '+120%', 'var(--teal)'], ['Parceria', 38, '+98%', 'var(--warning)']].map(([l, w, v, c]) => (
                <div className="bc-row" key={l as string}><span className="bc-lbl">{l}</span><div className="bc-out"><div className="bc-in" style={{ width: `${w}%`, background: c as string }} /></div><span className="bc-val">{v}</span></div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-hd"><span className="card-tt">📋 Ações de Marketing</span><span className="badge bg-br">{ACOES.length} ações</span></div>
        <div className="tw">
          <table>
            <thead><tr><th>Ação</th><th>Loja</th><th>Tipo</th><th>Objetivo</th><th>Intensidade</th><th>Status</th><th>ROI Est.</th><th>Aprendizado</th></tr></thead>
            <tbody>
              {ACOES.map(a => (
                <tr key={a.id}>
                  <td><strong>{a.nome}</strong><div style={{ fontSize: 10, color: 'var(--muted)' }}>{a.desc}</div></td>
                  <td>{a.loja}</td>
                  <td><span className={`badge ${a.tipoCls}`}>{a.tipo}</span></td>
                  <td style={{ fontSize: 11 }}>{a.obj}</td>
                  <td><span className={`badge ${a.intCls}`}>{a.intensidade}</span></td>
                  <td><span className={`badge ${a.stCls}`}>{a.status}</span></td>
                  <td style={{ color: a.roi === '—' ? 'var(--muted)' : 'var(--success)', fontWeight: 700 }}>{a.roi}</td>
                  <td style={{ fontSize: 10.5, color: 'var(--muted)', maxWidth: 140 }}>{a.learn}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
