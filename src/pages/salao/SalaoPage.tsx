import { useState } from 'react'
import { Plus, Star } from 'lucide-react'

const MESAS = [
  { id: 1, num: '01', status: 'ocupada', clientes: 3, inicio: '11:42', pedido: 'R$ 127,50' },
  { id: 2, num: '02', status: 'livre', clientes: 0, inicio: '', pedido: '' },
  { id: 3, num: '03', status: 'ocupada', clientes: 2, inicio: '12:05', pedido: 'R$ 84,20' },
  { id: 4, num: '04', status: 'reservada', clientes: 4, inicio: '13:00', pedido: '' },
  { id: 5, num: '05', status: 'livre', clientes: 0, inicio: '', pedido: '' },
  { id: 6, num: '06', status: 'ocupada', clientes: 5, inicio: '11:30', pedido: 'R$ 210,00' },
  { id: 7, num: '07', status: 'livre', clientes: 0, inicio: '', pedido: '' },
  { id: 8, num: '08', status: 'aguardando', clientes: 2, inicio: '12:20', pedido: 'R$ 63,00' },
]

const AVALIACOES = [
  { nome: 'Camila R.', nota: 5, coment: 'Atendimento impecável e açaí delicioso!', data: '22/07', loja: 'Amore Paiva' },
  { nome: 'Lucas M.', nota: 4, coment: 'Ótimo ambiente, um pouco demorado no pico.', data: '22/07', loja: 'Amore CD' },
  { nome: 'Fernanda S.', nota: 5, coment: 'Melhor açaí da cidade sem dúvida!', data: '21/07', loja: 'Flow CD' },
]

const STATUS_COLOR: Record<string, string> = {
  livre: 'var(--success)',
  ocupada: 'var(--bordo)',
  reservada: 'var(--blue)',
  aguardando: 'var(--warning)',
}

const STATUS_LABEL: Record<string, string> = {
  livre: 'Livre',
  ocupada: 'Ocupada',
  reservada: 'Reservada',
  aguardando: 'Aguardando',
}

type Tab = 'mesas' | 'atendimento' | 'avaliacoes'

export default function SalaoPage() {
  const [tab, setTab] = useState<Tab>('mesas')

  const ocupadas = MESAS.filter(m => m.status === 'ocupada').length
  const livres = MESAS.filter(m => m.status === 'livre').length

  return (
    <div>
      <div className="kpi-grid" style={{ marginBottom: 14 }}>
        {[
          { lbl: 'Mesas Ocupadas', val: `${ocupadas}/${MESAS.length}`, sub: `${livres} disponíveis`, col: 'var(--bordo)' },
          { lbl: 'Clientes no Salão', val: MESAS.filter(m => m.status === 'ocupada').reduce((a, m) => a + m.clientes, 0).toString(), sub: 'agora', col: 'var(--blue)' },
          { lbl: 'Avaliação Hoje', val: '4,8 ⭐', sub: '12 avaliações', col: 'var(--warning)' },
          { lbl: 'Tempo Médio Mesa', val: '38 min', sub: 'Meta: <45min', col: 'var(--teal)' },
        ].map((k, i) => (
          <div className="kpi" key={i}><div className="kpi-ac" style={{ background: k.col }} /><div className="kpi-lbl">{k.lbl}</div><div className="kpi-val">{k.val}</div><div className="kpi-sub">{k.sub}</div></div>
        ))}
      </div>

      <div className="tabs" style={{ marginBottom: 14 }}>
        {(['mesas', 'atendimento', 'avaliacoes'] as Tab[]).map(t => (
          <button key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
            {t === 'mesas' ? 'Mapa de Mesas' : t === 'atendimento' ? 'Atendimento' : 'Avaliações'}
          </button>
        ))}
      </div>

      {tab === 'mesas' && (
        <div className="card">
          <div className="card-hd">
            <span className="card-tt">🪑 Mapa de Mesas — Amore CD</span>
            <div style={{ display: 'flex', gap: 8 }}>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: STATUS_COLOR[k], display: 'inline-block' }} />{v}
                </span>
              ))}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10, padding: 12 }}>
            {MESAS.map(m => (
              <div key={m.id} style={{ border: `2px solid ${STATUS_COLOR[m.status]}`, borderRadius: 10, padding: 12, textAlign: 'center', cursor: 'pointer', background: m.status === 'livre' ? 'transparent' : `${STATUS_COLOR[m.status]}18` }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: STATUS_COLOR[m.status] }}>M{m.num}</div>
                <div style={{ fontSize: 11, color: STATUS_COLOR[m.status], fontWeight: 600 }}>{STATUS_LABEL[m.status]}</div>
                {m.clientes > 0 && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{m.clientes} pax</div>}
                {m.inicio && <div style={{ fontSize: 10, color: 'var(--muted)' }}>{m.inicio}</div>}
                {m.pedido && <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', marginTop: 4 }}>{m.pedido}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'atendimento' && (
        <div className="card">
          <div className="card-hd"><span className="card-tt">🧾 Pedidos em Aberto</span><button className="btn bp bsm"><Plus size={11} />Novo Pedido</button></div>
          <div className="tw">
            <table>
              <thead><tr><th>Mesa</th><th>Clientes</th><th>Início</th><th>Tempo</th><th>Total</th><th>Status</th></tr></thead>
              <tbody>
                {MESAS.filter(m => m.status === 'ocupada' || m.status === 'aguardando').map(m => (
                  <tr key={m.id}>
                    <td><strong>Mesa {m.num}</strong></td>
                    <td>{m.clientes} pax</td>
                    <td>{m.inicio}</td>
                    <td>~{Math.floor(Math.random() * 30 + 10)} min</td>
                    <td><strong>{m.pedido}</strong></td>
                    <td><span className={`badge ${m.status === 'aguardando' ? 'bg-y' : 'bg-b'}`}>{STATUS_LABEL[m.status]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'avaliacoes' && (
        <div className="card">
          <div className="card-hd"><span className="card-tt">⭐ Avaliações Recentes</span></div>
          <div className="card-bd" style={{ padding: 12 }}>
            {AVALIACOES.map((a, i) => (
              <div key={i} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <strong style={{ fontSize: 13 }}>{a.nome}</strong>
                  <div style={{ display: 'flex', gap: 2 }}>
                    {Array.from({ length: 5 }).map((_, s) => (
                      <Star key={s} size={12} fill={s < a.nota ? 'var(--warning)' : 'none'} color={s < a.nota ? 'var(--warning)' : 'var(--muted)'} />
                    ))}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text)', marginBottom: 4 }}>{a.coment}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{a.data} · {a.loja}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
