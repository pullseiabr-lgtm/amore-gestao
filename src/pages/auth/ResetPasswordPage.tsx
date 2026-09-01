import { useState } from 'react'
import { KeyRound, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { supabase } from '../../lib/supabase'

// Tela de definir nova senha — abre quando o link de recuperação do e-mail é acessado (evento PASSWORD_RECOVERY)
export default function ResetPasswordPage() {
  const { endPasswordRecovery } = useAuth()
  const { theme } = useTheme()
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (p1.length < 6) { setError('A senha precisa ter ao menos 6 caracteres.'); return }
    if (p1 !== p2) { setError('As senhas não conferem.'); return }
    setLoading(true)
    const { error: err } = await supabase.auth.updateUser({ password: p1 })
    setLoading(false)
    if (err) { setError('Não foi possível: ' + (err.message || 'link expirado, peça outro.')); return }
    try { await supabase.auth.signOut() } catch { /* ignore */ }
    setDone(true)
  }

  const voltar = () => { endPasswordRecovery(); try { history.replaceState(null, '', location.pathname) } catch { /* ignore */ }; location.href = '/' }

  return (
    <div className="login-page">
      <div className="login-card">
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ width: 50, height: 50, background: done ? '#15803D' : 'var(--bordo)', borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 11px', color: '#fff' }}>
            {done ? <span style={{ fontSize: 24 }}>✓</span> : <KeyRound size={22} />}
          </div>
          <h1 style={{ fontSize: 18, fontWeight: 800 }}>{done ? 'Senha alterada!' : 'Redefinir senha'}</h1>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{done ? 'Faça login com a nova senha.' : `Crie uma nova senha para sua conta ${theme.company_name}.`}</p>
        </div>

        {done ? (
          <button className="btn bp" onClick={voltar} style={{ width: '100%', justifyContent: 'center' }}>Ir para o login</button>
        ) : (
        <form onSubmit={salvar}>
          <div className="fg">
            <label className="fl">Nova senha</label>
            <div style={{ position: 'relative' }}>
              <input className="inp" type={show ? 'text' : 'password'} value={p1} onChange={e => setP1(e.target.value)} placeholder="mínimo 6 caracteres" required style={{ paddingRight: 36 }} autoFocus />
              <button type="button" onClick={() => setShow(v => !v)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', display: 'flex' }}>
                {show ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
          <div className="fg">
            <label className="fl">Confirmar nova senha</label>
            <input className="inp" type={show ? 'text' : 'password'} value={p2} onChange={e => setP2(e.target.value)} placeholder="repita a senha" required />
          </div>
          {error && (<div className="al al-r" style={{ marginBottom: 10 }}><AlertCircle size={13} /><span>{error}</span></div>)}
          <button className="btn bp" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
            <KeyRound size={12} /> {loading ? 'Salvando...' : 'Salvar nova senha'}
          </button>
          <button type="button" onClick={voltar} style={{ width: '100%', marginTop: 10, background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>Cancelar</button>
        </form>
        )}
      </div>
    </div>
  )
}
