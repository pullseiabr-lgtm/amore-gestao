import { useState } from 'react'
import { Home, LogIn, Eye, EyeOff, AlertCircle, KeyRound, ArrowLeft } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { supabase } from '../../lib/supabase'

export default function LoginPage() {
  const { login, demoUsers } = useAuth()
  const { theme } = useTheme()
  const [email, setEmail] = useState('admin@amore.com.br')
  const [pass, setPass] = useState('admin123')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [modo, setModo] = useState<'login' | 'recuperar'>('login')
  const [okMsg, setOkMsg] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const err = await login(email, pass)
    if (err) setError(err)
    setLoading(false)
  }

  const enviarReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setOkMsg('')
    const em = email.trim().toLowerCase()
    if (!em) { setError('Informe o e-mail cadastrado.'); return }
    setLoading(true)
    try {
      await supabase.auth.resetPasswordForEmail(em, { redirectTo: `${location.origin}/redefinir-senha.html` })
      setOkMsg('Se este e-mail estiver cadastrado, enviamos um link para redefinir a senha. Confira sua caixa de entrada (e o spam).')
    } catch {
      setOkMsg('Se este e-mail estiver cadastrado, enviamos um link para redefinir a senha.')
    }
    setLoading(false)
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <div style={{ width: 50, height: 50, background: 'var(--bordo)', borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 11px' }}>
            {theme.logo_url
              ? <img src={theme.logo_url} alt="logo" style={{ width: 28, height: 28, objectFit: 'contain' }} />
              : <Home size={24} color="#fff" />
            }
          </div>
          <h1 style={{ fontSize: 18, fontWeight: 800 }}>{theme.company_name}</h1>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Sistema Integrado v5.2</p>
        </div>

        {modo === 'login' ? (
        <form onSubmit={handleSubmit}>
          <div className="fg">
            <label className="fl">E-mail</label>
            <input className="inp" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" required autoFocus />
          </div>
          <div className="fg">
            <label className="fl">Senha</label>
            <div style={{ position: 'relative' }}>
              <input className="inp" type={showPass ? 'text' : 'password'} value={pass} onChange={e => setPass(e.target.value)} placeholder="••••••••" required style={{ paddingRight: 36 }} />
              <button type="button" onClick={() => setShowPass(v => !v)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', display: 'flex' }}>
                {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="al al-r" style={{ marginBottom: 10 }}>
              <AlertCircle size={13} />
              <span>{error}</span>
            </div>
          )}

          <button className="btn bp" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
            <LogIn size={11} />
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
          <button type="button" onClick={() => { setModo('recuperar'); setError(''); setOkMsg('') }} style={{ width: '100%', marginTop: 10, background: 'none', border: 'none', color: 'var(--bordo)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
            <KeyRound size={13} /> Esqueci minha senha
          </button>
        </form>
        ) : (
        <form onSubmit={enviarReset}>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 12 }}>Digite o e-mail cadastrado. Enviaremos um link para você redefinir a senha.</div>
          <div className="fg">
            <label className="fl">E-mail cadastrado</label>
            <input className="inp" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" required autoFocus />
          </div>
          {error && (<div className="al al-r" style={{ marginBottom: 10 }}><AlertCircle size={13} /><span>{error}</span></div>)}
          {okMsg && (<div className="al" style={{ marginBottom: 10, background: '#DCFCE7', color: '#15803D', border: '1px solid #86EFAC', borderRadius: 8, padding: '9px 11px', display: 'flex', gap: 6, fontSize: 12.5 }}><span>✅</span><span>{okMsg}</span></div>)}
          <button className="btn bp" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
            <KeyRound size={12} /> {loading ? 'Enviando...' : 'Enviar link de recuperação'}
          </button>
          <button type="button" onClick={() => { setModo('login'); setError(''); setOkMsg('') }} style={{ width: '100%', marginTop: 10, background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
            <ArrowLeft size={13} /> Voltar ao login
          </button>
        </form>
        )}

        <div style={{ marginTop: 16, padding: '10px 12px', background: 'var(--cream)', borderRadius: 7, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, marginBottom: 6, textTransform: 'uppercase' }}>Contas demo</div>
          {Object.entries(demoUsers).map(([em, d]) => (
            <div key={em} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, marginBottom: 3 }}>
              <button type="button" onClick={() => { setEmail(em); setPass(d.pass); }} style={{ background: 'none', border: 'none', color: 'var(--bordo)', cursor: 'pointer', fontWeight: 600, textAlign: 'left' }}>
                {em}
              </button>
              <span style={{ color: 'var(--muted)' }}>{d.pass} · {d.profile.role}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
