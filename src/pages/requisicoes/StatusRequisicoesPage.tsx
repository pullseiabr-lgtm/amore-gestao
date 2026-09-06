// Status das Requisições — embutida no painel (usa a página pública requisicoes-status.html)
// Passa o usuário logado: dono vê tudo (dashboard de gestão); colaborador vê só as suas.
import { useAuth } from '../../contexts/AuthContext'

export default function StatusRequisicoesPage() {
  const { user, isOwner } = useAuth()
  const nome = encodeURIComponent(user?.name || '')
  const mode = isOwner ? 'owner' : 'user'
  const src = `/requisicoes-status.html?mode=${mode}&solic=${nome}`
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
