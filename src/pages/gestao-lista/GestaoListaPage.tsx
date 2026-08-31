// Gestão da Lista de Compras — embutida no painel (usa a página pública montar-pedido.html)
export default function GestaoListaPage() {
  return (
    <div style={{ height: 'calc(100vh - 96px)', margin: '-6px 0 0' }}>
      <iframe
        src="/montar-pedido.html"
        title="Gestão da Lista de Compras"
        style={{ width: '100%', height: '100%', border: '1px solid var(--border,#e5e7eb)', borderRadius: 12, background: '#fff' }}
      />
    </div>
  )
}
