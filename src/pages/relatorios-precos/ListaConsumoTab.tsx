import { useState } from 'react'
import { ExternalLink, Copy } from 'lucide-react'
import { useLoja } from '../../contexts/LojaContext'

// A lista de consumo por produto vive na página pública relatorio-consumo.html
// (pedidos de compra + caixas das prestações); a aba apenas a incorpora e gera o link.
const LOJAS = ['Todas', 'Amore Paiva', 'Amore CD', 'Flow CD']

export default function ListaConsumoTab() {
  const { loja: lojaCtx } = useLoja() as any
  const [loja, setLoja] = useState(LOJAS.includes(lojaCtx) ? lojaCtx : 'Todas')
  const [copiado, setCopiado] = useState(false)
  const path = `/relatorio-consumo.html?loja=${encodeURIComponent(loja)}&dias=90`
  const link = location.origin + path

  return (
    <div>
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '.8rem 1.2rem', marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <b style={{ fontSize: 15 }}>🧾 Consumo por Produto</b>
        <select value={loja} onChange={e => setLoja(e.target.value)} style={{ padding: '.45rem .7rem', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13 }}>
          {LOJAS.map(l => <option key={l}>{l}</option>)}
        </select>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className="btn bo" style={{ display: 'flex', gap: 5, alignItems: 'center' }} onClick={() => { navigator.clipboard?.writeText(link); setCopiado(true); setTimeout(() => setCopiado(false), 1800) }}><Copy size={14} />{copiado ? 'Copiado!' : 'Copiar link'}</button>
          <a className="btn bo" href={path} target="_blank" rel="noreferrer" style={{ display: 'flex', gap: 5, alignItems: 'center', textDecoration: 'none' }}><ExternalLink size={14} />Abrir</a>
        </div>
      </div>
      <iframe key={loja} src={path} title="Consumo por produto" style={{ width: '100%', height: '80vh', border: '1px solid #e5e7eb', borderRadius: 14, background: '#fff' }} />
    </div>
  )
}
