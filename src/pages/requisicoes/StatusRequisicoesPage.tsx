// Status das Requisições — embutida no painel (usa a página pública requisicoes-status.html).
// Donos + Wagner + Aline + Eduarda veem TODAS as lojas; os demais veem só a sua loja.
import { useAuth } from '../../contexts/AuthContext'
import { useLoja } from '../../contexts/LojaContext'
import { canSeeAllStores } from '../../lib/permissions'

export default function StatusRequisicoesPage() {
  const { user } = useAuth()
  const { loja } = useLoja()
  const verTudo = canSeeAllStores(user)
  const nome = encodeURIComponent(user?.name || '')
  const lojaAtual = (loja && !['Todas', 'Todas as Lojas', ''].includes(loja)) ? loja : ''
  const src = verTudo
    ? `/requisicoes-status.html?mode=owner&solic=${nome}`
    : `/requisicoes-status.html?mode=owner&loja=${encodeURIComponent(lojaAtual)}&solic=${nome}`
  return (
    <div style={{ height: 'calc(100vh - 96px)', margin: '-6px 0 0' }}>
      <iframe
        src={src}
        title="Status das Requisições"
        style={{ width: '100%', height: '100%', border: '1px solid var(--border,#e5e7eb)', borderRadius: 12, background: '#fff' }}
      />
    </div>
  )
}
