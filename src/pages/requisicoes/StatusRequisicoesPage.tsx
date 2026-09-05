// Status das Requisições — embutida no painel (usa a página pública requisicoes-status.html)
export default function StatusRequisicoesPage() {
  return (
    <div style={{ height: 'calc(100vh - 96px)', margin: '-6px 0 0' }}>
      <iframe
        src="/requisicoes-status.html"
        title="Status das Requisições"
        style={{ width: '100%', height: '100%', border: '1px solid var(--border,#e5e7eb)', borderRadius: 12, background: '#fff' }}
      />
    </div>
  )
}
