import { useState } from 'react'
import { CheckCircle, Circle, Plus } from 'lucide-react'

const CHECKLISTS = [
  { id: 'c1', titulo: 'Abertura Cozinha', loja: 'Amore CD', itens: [
    { id: 'i1', txt: 'Verificar temperatura câmara fria', ok: true },
    { id: 'i2', txt: 'Higienizar bancadas', ok: true },
    { id: 'i3', txt: 'Checar estoque açaí base', ok: false },
    { id: 'i4', txt: 'Preparar toppings do dia', ok: false },
  ]},
  { id: 'c2', titulo: 'Fechamento Cozinha', loja: 'Amore Paiva', itens: [
    { id: 'i5', txt: 'Desligar equipamentos', ok: false },
    { id: 'i6', txt: 'Armazenar sobras corretamente', ok: false },
    { id: 'i7', txt: 'Limpeza geral', ok: false },
  ]},
]

const PRODUCAO = [
  { item: 'Açaí base porcionado', qtd: '45 kg', loja: 'Amore CD', resp: 'Carlos', hora: '07:30', st: 'bg-g', stl: 'Concluído' },
  { item: 'Creme de açaí especial', qtd: '20 kg', loja: 'Amore Paiva', resp: 'Ana', hora: '08:00', st: 'bg-b', stl: 'Em preparo' },
  { item: 'Mix de granola caseira', qtd: '15 kg', loja: 'Todas', resp: 'Pedro', hora: '09:00', st: 'bg-y', stl: 'Pendente' },
]

const DESPERDICIO = [
  { data: '22/07', item: 'Polpa de morango', qtd: '2 kg', motivo: 'Vencimento', loja: 'Flow CD', custo: 'R$ 22,40' },
  { data: '21/07', item: 'Creme de leite', qtd: '0,5 kg', motivo: 'Contaminação', loja: 'Amore CD', custo: 'R$ 3,95' },
  { data: '20/07', item: 'Granola', qtd: '1 kg', motivo: 'Umidade', loja: 'Amore Paiva', custo: 'R$ 12,00' },
]

type Tab = 'checklist' | 'producao' | 'desperdicio'

export default function CozinhaPage() {
  const [tab, setTab] = useState<Tab>('checklist')
  const [checks, setChecks] = useState(CHECKLISTS)

  const toggle = (clId: string, itId: string) => {
    setChecks(prev => prev.map(cl => cl.id !== clId ? cl : {
      ...cl, itens: cl.itens.map(it => it.id !== itId ? it : { ...it, ok: !it.ok })
    }))
  }

  return (
    <div>
      <div className="kpi-grid" style={{ marginBottom: 14 }}>
        {[
          { lbl: 'Checklists Hoje', val: '6/8', sub: '75% concluídos', col: 'var(--success)' },
          { lbl: 'Prod. em Andamento', val: '2', sub: 'itens em preparo', col: 'var(--blue)' },
          { lbl: 'Desperdício Mês', val: 'R$ 184', sub: '↓12% vs. mês ant.', col: 'var(--warning)' },
          { lbl: 'Temp. Câmara', val: '-18°C', sub: 'Dentro do padrão', col: 'var(--teal)' },
        ].map((k, i) => (
          <div className="kpi" key={i}><div className="kpi-ac" style={{ background: k.col }} /><div className="kpi-lbl">{k.lbl}</div><div className="kpi-val">{k.val}</div><div className="kpi-sub">{k.sub}</div></div>
        ))}
      </div>

      <div className="tabs" style={{ marginBottom: 14 }}>
        {(['checklist', 'producao', 'desperdicio'] as Tab[]).map(t => (
          <button key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
            {t === 'checklist' ? 'Checklists' : t === 'producao' ? 'Produção' : 'Desperdício'}
          </button>
        ))}
      </div>

      {tab === 'checklist' && (
        <div className="g11">
          {checks.map(cl => {
            const done = cl.itens.filter(i => i.ok).length
            return (
              <div className="card" key={cl.id}>
                <div className="card-hd">
                  <span className="card-tt">{cl.titulo}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{cl.loja}</span>
                    <span className={`badge ${done === cl.itens.length ? 'bg-g' : 'bg-y'}`}>{done}/{cl.itens.length}</span>
                  </div>
                </div>
                <div className="card-bd" style={{ padding: 10 }}>
                  {cl.itens.map(it => (
                    <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => toggle(cl.id, it.id)}>
                      {it.ok
                        ? <CheckCircle size={16} color="var(--success)" />
                        : <Circle size={16} color="var(--muted)" />}
                      <span style={{ fontSize: 13, textDecoration: it.ok ? 'line-through' : 'none', color: it.ok ? 'var(--muted)' : 'var(--text)' }}>{it.txt}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {tab === 'producao' && (
        <div className="card">
          <div className="card-hd"><span className="card-tt">🍧 Produção do Dia</span><button className="btn bp bsm"><Plus size={11} />Registrar</button></div>
          <div className="tw">
            <table>
              <thead><tr><th>Item</th><th>Qtd</th><th>Loja</th><th>Responsável</th><th>Hora</th><th>Status</th></tr></thead>
              <tbody>
                {PRODUCAO.map((p, i) => (
                  <tr key={i}><td><strong>{p.item}</strong></td><td>{p.qtd}</td><td>{p.loja}</td><td>{p.resp}</td><td>{p.hora}</td><td><span className={`badge ${p.st}`}>{p.stl}</span></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'desperdicio' && (
        <div className="card">
          <div className="card-hd"><span className="card-tt">🗑️ Registro de Desperdício</span><button className="btn bp bsm"><Plus size={11} />Registrar</button></div>
          <div className="tw">
            <table>
              <thead><tr><th>Data</th><th>Item</th><th>Qtd</th><th>Motivo</th><th>Loja</th><th>Custo</th></tr></thead>
              <tbody>
                {DESPERDICIO.map((d, i) => (
                  <tr key={i}><td>{d.data}</td><td><strong>{d.item}</strong></td><td>{d.qtd}</td><td>{d.motivo}</td><td>{d.loja}</td><td style={{ color: 'var(--danger)', fontWeight: 700 }}>{d.custo}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
