// Barra de atalhos entre as telas de Gestão (navega via evento global 'amore-nav' do App)
const TELAS: { id: string; l: string }[] = [
  { id: 'painel-gestao', l: '📊 Painel' },
  { id: 'custos', l: '💰 Custo' },
  { id: 'compras-consumo', l: '⚖️ Compras × Consumo' },
  { id: 'gestao-perdas', l: '⚠️ Perdas' },
  { id: 'central-alertas', l: '🚨 Alertas' },
]
export default function GestaoNav({ active }: { active: string }) {
  const go = (id: string) => { if (id !== active) document.dispatchEvent(new CustomEvent('amore-nav', { detail: id })) }
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
      {TELAS.map(t => (
        <button key={t.id} onClick={() => go(t.id)} style={{
          padding: '6px 13px', borderRadius: 20, cursor: 'pointer', fontSize: 12.5,
          fontWeight: active === t.id ? 800 : 500,
          border: `1px solid ${active === t.id ? 'var(--bordo)' : 'var(--border)'}`,
          background: active === t.id ? 'var(--bordo)' : 'var(--card)',
          color: active === t.id ? '#fff' : 'var(--text)',
        }}>{t.l}</button>
      ))}
    </div>
  )
}
