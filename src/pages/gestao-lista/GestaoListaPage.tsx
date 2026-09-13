// Gestão da Lista de Compras — embutida no painel (usa a página pública montar-pedido.html).
// Abre já na loja selecionada no painel (evita "sumir" requisição por estar em outra loja).
import { useState } from 'react'
import { useLoja } from '../../contexts/LojaContext'

export default function GestaoListaPage() {
  const { loja } = useLoja()
  // cache-bust: força o iframe a pegar a versão nova de montar-pedido.html a cada vez que a tela
  // é aberta (o arquivo estático era cacheado e rodava a versão antiga, sem as atualizações de status).
  const [bust] = useState(() => Date.now())
  const slug = ({ 'Flow CD': 'flow', 'Amore CD': 'amore-cd', 'Amore Paiva': 'amore-paiva' } as Record<string, string>)[loja] || ''
  const src = '/montar-pedido.html?' + (slug ? `loja=${slug}&` : '') + `_=${bust}`
  return (
    <div style={{ height: 'calc(100vh - 96px)', margin: '-6px 0 0' }}>
      <iframe
        key={slug}
        src={src}
        title="Gestão da Lista de Compras"
        style={{ width: '100%', height: '100%', border: '1px solid var(--border,#e5e7eb)', borderRadius: 12, background: '#fff' }}
      />
    </div>
  )
}
