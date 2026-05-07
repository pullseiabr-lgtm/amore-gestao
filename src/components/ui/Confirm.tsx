import { AlertTriangle } from 'lucide-react'

interface ConfirmProps {
  open: boolean
  message: string
  onConfirm: () => void
  onCancel: () => void
  confirmLabel?: string
  variant?: 'danger' | 'warning'
}

export default function Confirm({ open, message, onConfirm, onCancel, confirmLabel = 'Excluir', variant = 'danger' }: ConfirmProps) {
  if (!open) return null
  return (
    <div className="cnf-overlay open">
      <div className="cnf-box">
        <div className="cnf-ico"><AlertTriangle size={20} color="#EF4444" /></div>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Confirmar ação</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{message}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn bo" style={{ flex: 1, justifyContent: 'center' }} onClick={onCancel}>Cancelar</button>
          <button
            className={`btn ${variant === 'danger' ? 'bd' : 'bp'}`}
            style={{ flex: 1, justifyContent: 'center' }}
            onClick={() => { onConfirm(); onCancel(); }}
          >{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
