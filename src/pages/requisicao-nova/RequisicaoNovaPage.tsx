// Nova Requisição de Compra — embutida no painel (usa a página pública requisicao-nova.html)
// Passa o nome do usuário logado para travar o "Solicitante" (cai no painel certo).
import { useAuth } from '../../contexts/AuthContext'

export default function RequisicaoNovaPage() {
  const { user } = useAuth()
  const solic = encodeURIComponent(user?.name || '')
  return (
    <div style={{ height: 'calc(100vh - 96px)', margin: '-6px 0 0' }}>
      <iframe
        src={`/requisicao-nova.html?solic=${solic}`}
        title="Nova Requisição de Compra"
        style={{ width: '100%', height: '100%', border: '1px solid var(--border,#e5e7eb)', borderRadius: 12, background: '#fff' }}
      />
    </div>
  )
}
