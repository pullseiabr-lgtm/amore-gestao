// Status das Requisições — embutida no painel (usa a página pública requisicoes-status.html).
// Donos + Wagner + Aline + Eduarda veem TODAS as lojas; os demais veem só a sua loja.
// O botão "💰 Estimativa de gasto" aparece SOMENTE para o comprador (Setor de Compras).
import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useLoja } from '../../contexts/LojaContext'
import { canSeeAllStores, canComprador } from '../../lib/permissions'
import EstimativaGasto from './EstimativaGasto'

export default function StatusRequisicoesPage() {
  const { user } = useAuth()
  const { loja } = useLoja()
  const [aberto, setAberto] = useState(false)
  const verTudo = canSeeAllStores(user)
  const comprador = canComprador(user)
  const nome = encodeURIComponent(user?.name || '')
  const lojaAtual = (loja && !['Todas', 'Todas as Lojas', ''].includes(loja)) ? loja : ''
  const src = verTudo
    ? `/requisicoes-status.html?mode=owner&solic=${nome}`
    : `/requisicoes-status.html?mode=owner&loja=${encodeURIComponent(lojaAtual)}&solic=${nome}`
  return (
    <div style={{ height: 'calc(100vh - 96px)', margin: '-6px 0 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {comprador && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={() => setAberto(true)} style={{ background: 'var(--bordo)', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 16px', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>💰 Estimativa de gasto (Compras)</button>
        </div>
      )}
      <iframe
        src={src}
        title="Status das Requisições"
        style={{ width: '100%', flex: 1, minHeight: 0, border: '1px solid var(--border,#e5e7eb)', borderRadius: 12, background: '#fff' }}
      />
      {aberto && comprador && <EstimativaGasto quem={(user?.name || 'Comprador').trim()} loja={lojaAtual} onClose={() => setAberto(false)} />}
    </div>
  )
}
