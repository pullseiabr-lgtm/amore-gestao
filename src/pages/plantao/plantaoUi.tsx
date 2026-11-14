import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { uploadAnexo } from '../../lib/db'

export const inp: CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 15, boxSizing: 'border-box' }
export const lbl: CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 4 }
export const card: CSSProperties = { background: 'var(--card, #fff)', border: '1px solid var(--border)', borderRadius: 14, padding: 14 }
export const grid = (min = 260): CSSProperties => ({ display: 'grid', gridTemplateColumns: `repeat(auto-fit,minmax(${min}px,1fr))`, gap: 10 })

export function Btn({ children, onClick, tone = 'primary', disabled, style, small }: { children: ReactNode; onClick?: () => void; tone?: 'primary' | 'ghost' | 'danger' | 'ok'; disabled?: boolean; style?: CSSProperties; small?: boolean }) {
  const cores = { primary: ['var(--bordo)', '#fff', 'var(--bordo)'], ghost: ['transparent', 'var(--text)', 'var(--border)'], danger: ['#dc2626', '#fff', '#dc2626'], ok: ['#16a34a', '#fff', '#16a34a'] }[tone]
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ background: cores[0], color: cores[1], border: `1px solid ${cores[2]}`, borderRadius: 10, padding: small ? '6px 10px' : '11px 16px', fontSize: small ? 12.5 : 14.5, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, minHeight: small ? 0 : 44, ...style }}>
      {children}
    </button>
  )
}

export function Pill({ cor, children }: { cor: string; children: ReactNode }) {
  return <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 99, fontSize: 11.5, fontWeight: 800, color: cor, background: cor + '1f', border: `1px solid ${cor}55` }}>{children}</span>
}

export function Modal({ titulo, onClose, children }: { titulo: string; onClose: () => void; children: ReactNode }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card, #fff)', color: 'var(--text)', width: '100%', maxWidth: 720, maxHeight: '92vh', overflowY: 'auto', borderRadius: '18px 18px 0 0', padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>{titulo}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--muted)' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function MultiCheck({ opcoes, valor, onChange }: { opcoes: string[]; valor: string[]; onChange: (v: string[]) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {opcoes.map(o => {
        const on = valor.includes(o)
        return (
          <button key={o} type="button" onClick={() => onChange(on ? valor.filter(x => x !== o) : [...valor, o])}
            style={{ padding: '8px 12px', borderRadius: 99, border: `1px solid ${on ? 'var(--bordo)' : 'var(--border)'}`, background: on ? 'var(--bordo)' : 'var(--bg)', color: on ? '#fff' : 'var(--text)', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
            {on ? '✓ ' : ''}{o}
          </button>
        )
      })}
    </div>
  )
}

const ehVideo = (u: string) => /\.(mp4|mov|webm|3gp|m4v)(\?|$)/i.test(u)
export function Midias({ urls, onRemove }: { urls: string[]; onRemove?: (u: string) => void }) {
  if (!urls.length) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
      {urls.map(u => (
        <div key={u} style={{ position: 'relative' }}>
          {ehVideo(u)
            ? <video src={u} controls style={{ width: 120, height: 90, borderRadius: 8, background: '#000' }} />
            : <a href={u} target="_blank" rel="noreferrer"><img src={u} alt="evidência" style={{ width: 90, height: 90, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} /></a>}
          {onRemove && <button onClick={() => onRemove(u)} style={{ position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 99, border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer', fontSize: 12 }}>✕</button>}
        </div>
      ))}
    </div>
  )
}

/** Foto/vídeo pelo celular → bucket "anexos" (pasta plantao). */
export function Evidencias({ urls, onChange, rotulo = '📷 Foto / vídeo' }: { urls: string[]; onChange: (u: string[]) => void; rotulo?: string }) {
  const [env, setEnv] = useState(false)
  const enviar = async (files: FileList | null) => {
    if (!files?.length) return
    setEnv(true)
    const novos: string[] = []
    for (const f of Array.from(files)) {
      try { novos.push(await uploadAnexo(f, 'plantao')) } catch (e) { alert('Sem conexão ou falha ao enviar ' + f.name + ': ' + (e as Error).message + '\nTente novamente quando a conexão voltar.') }
    }
    if (novos.length) onChange([...urls, ...novos])
    setEnv(false)
  }
  return (
    <div>
      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, borderRadius: 10, border: '1px dashed var(--bordo)', background: 'var(--bg)', color: 'var(--bordo)', fontWeight: 700, fontSize: 14, cursor: env ? 'wait' : 'pointer' }}>
        {env ? '⏳ Enviando…' : rotulo}
        <input type="file" accept="image/*,video/*" multiple disabled={env} onChange={e => { void enviar(e.target.files); e.target.value = '' }} style={{ display: 'none' }} />
      </label>
      <Midias urls={urls} onRemove={u => onChange(urls.filter(x => x !== u))} />
    </div>
  )
}
