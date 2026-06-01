import { useState } from 'react'
import { uploadAnexo } from '../../lib/db'

// Botão de upload (foto/PDF do celular) + lista editável de links.
// Reutilizável em Atas, Tarefas, OS, Pipeline, etc.
// Os arquivos vão para o bucket "anexos" do Supabase Storage e o link público
// é anexado ao valor (um por linha). Também aceita colar links manualmente.
export function AnexoUploader({
  value,
  onChange,
  pasta = 'geral',
  label = '📎 Anexos',
}: {
  value: string | null
  onChange: (v: string | null) => void
  pasta?: string
  label?: string
}) {
  const [enviando, setEnviando] = useState(false)

  const handle = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setEnviando(true)
    try {
      const urls: string[] = []
      for (const f of Array.from(files)) {
        try { urls.push(await uploadAnexo(f, pasta)) }
        catch (e) { alert('Falha ao enviar ' + f.name + ': ' + (e as Error).message) }
      }
      if (urls.length) onChange([value, urls.join('\n')].filter(Boolean).join('\n'))
    } finally { setEnviando(false) }
  }

  return (
    <div>
      {label && <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>{label}</label>}
      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px', borderRadius: 8, border: '1px dashed var(--bordo)', background: 'var(--bg)', cursor: enviando ? 'wait' : 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--bordo)', marginBottom: 6 }}>
        {enviando ? '⏳ Enviando…' : '📤 Enviar arquivo / foto (do celular)'}
        <input type="file" accept="image/*,application/pdf" multiple capture="environment" disabled={enviando}
          onChange={e => handle(e.target.files)} style={{ display: 'none' }} />
      </label>
      <textarea value={value || ''} onChange={e => onChange(e.target.value || null)} rows={2}
        placeholder="Arquivos enviados aparecem aqui. Também pode colar links (Drive/PDF), um por linha…"
        style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
    </div>
  )
}

// Exibe a lista de anexos como links clicáveis.
export function AnexoLinks({ value, compact }: { value: string | null; compact?: boolean }) {
  if (!value) return null
  const itens = value.split(/\n+/).map(s => s.trim()).filter(Boolean)
  if (itens.length === 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {itens.map((l, i) => (
        /^https?:\/\//.test(l)
          ? <a key={i} href={l} target="_blank" rel="noopener noreferrer" style={{ fontSize: compact ? 11 : 12, color: 'var(--bordo)', wordBreak: 'break-all' }}>🔗 {l}</a>
          : <span key={i} style={{ fontSize: compact ? 11 : 12, color: 'var(--text)', wordBreak: 'break-all' }}>{l}</span>
      ))}
    </div>
  )
}
