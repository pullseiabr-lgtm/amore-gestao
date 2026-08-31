// Nova Requisição de Compra — embutida no painel (usa a página pública requisicao-nova.html)
export default function RequisicaoNovaPage() {
  return (
    <div style={{ height: 'calc(100vh - 96px)', margin: '-6px 0 0' }}>
      <iframe
        src="/requisicao-nova.html"
        title="Nova Requisição de Compra"
        style={{ width: '100%', height: '100%', border: '1px solid var(--border,#e5e7eb)', borderRadius: 12, background: '#fff' }}
      />
    </div>
  )
}
