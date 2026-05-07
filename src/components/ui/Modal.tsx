import React, { useEffect } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  size?: 'default' | 'lg' | 'xl'
  children: React.ReactNode
  footer?: React.ReactNode
}

export default function Modal({ open, onClose, title, size = 'default', children, footer }: ModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (open) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="ov open" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`modal${size === 'lg' ? ' lg' : size === 'xl' ? ' xl' : ''}`}>
        <div className="mhd">
          <span className="mtt">{title}</span>
          <button className="mx" onClick={onClose}><X size={13} /></button>
        </div>
        <div className="mbd">{children}</div>
        {footer && <div className="mft">{footer}</div>}
      </div>
    </div>
  )
}
