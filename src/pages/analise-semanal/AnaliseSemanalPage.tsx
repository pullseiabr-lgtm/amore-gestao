import { useState } from 'react'
import { TrendingUp, ExternalLink, Send, X } from 'lucide-react'
import { useLoja } from '../../contexts/LojaContext'
import { useToast } from '../../hooks/useToast'
import { enviarWhatsApp } from '../../lib/notify'
import { siteOrigin } from '../../lib/site'

const canon = (l: string) => (l === 'Amore Costa Dourada' ? 'Amore CD' : l === 'Flow Paiva' ? 'Amore Paiva' : l === 'Flow Costa Dourada' ? 'Flow CD' : (l || ''))
const LOJAS = ['Amore Paiva', 'Amore CD', 'Flow CD']

export default function AnaliseSemanalPage() {
  const { loja } = useLoja()
  const { toast } = useToast()
  const lojaDef = LOJAS.includes(canon(loja)) ? canon(loja) : 'Amore Paiva'
  const [lojaSel, setLojaSel] = useState(lojaDef)
  const [semanas, setSemanas] = useState(8)
  const [mEnviar, setMEnviar] = useState(false)
  const [fones, setFones] = useState(() => localStorage.getItem('analise_sem_fones') || '5581992573535\n5581994135602')
  const [enviando, setEnviando] = useState(false)

  const link = `${siteOrigin()}/relatorio-semanal.html?loja=${encodeURIComponent(lojaSel)}&semanas=${semanas}`
  const abrir = () => window.open(link, '_blank')

  const enviar = async () => {
    const nums = fones.split(/[\n,;]+/).map(s => s.replace(/\D/g, '')).filter(n => n.length >= 10)
    if (!nums.length) { toast('Informe ao menos um WhatsApp com DDD.', 'error'); return }
    setEnviando(true)
    try {
      const msg = `📈 *Análise Semanal de Compra — ${lojaSel}*\n\nCompra × consumo semana a semana (últimas ${semanas} semanas) com a necessidade da próxima semana e sugestão de reposição por prioridade.\n${link}\n— Painel Amore`
      let ok = 0
      for (const n of nums) { if (await enviarWhatsApp(n, msg)) ok++ }
      localStorage.setItem('analise_sem_fones', fones)
      toast(`Enviado para ${ok} de ${nums.length} número(s). ✅`)
      setMEnviar(false)
    } catch { toast('Não foi possível enviar.', 'error') }
    finally { setEnviando(false) }
  }

  return (
    <div>
      <div style={{ background: 'linear-gradient(135deg, #6B1212 0%, #8a2a2a 100%)', borderRadius: 12, padding: '18px 22px', marginBottom: 16, color: '#fff', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ width: 46, height: 46, borderRadius: 12, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><TrendingUp size={24} /></div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Análise Semanal de Compra</h2>
          <div style={{ fontSize: 13, opacity: 0.85 }}>Histórico de compra × consumo semana a semana → necessidade da próxima semana e requisição sugerida</div>
        </div>
      </div>

      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', maxWidth: 560 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Loja</label>
            <select value={lojaSel} onChange={e => setLojaSel(e.target.value)} style={{ padding: '9px 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 14, boxSizing: 'border-box', width: '100%' }}>
              {LOJAS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div style={{ width: 130 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Semanas</label>
            <select value={semanas} onChange={e => setSemanas(Number(e.target.value))} style={{ padding: '9px 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 14, boxSizing: 'border-box', width: '100%' }}>
              {[4, 6, 8, 10, 12].map(n => <option key={n} value={n}>{n} semanas</option>)}
            </select>
          </div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', margin: '10px 0 14px' }}>
          Mostra, por produto, quanto foi <strong>comprado</strong> e <strong>consumido</strong> em cada semana, estima a <strong>necessidade semanal</strong> e sugere a <strong>quantidade a repor</strong> por prioridade (🔴🟠🟡🟢). No relatório dá pra <strong>gerar a requisição sugerida</strong> com um clique.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" onClick={abrir} style={{ padding: '10px 16px' }}><ExternalLink size={16} /> Abrir análise</button>
          <button className="btn" onClick={() => setMEnviar(true)} style={{ padding: '10px 16px', background: '#25D366' }}><Send size={16} /> Enviar por WhatsApp</button>
        </div>
      </div>

      {mEnviar && (
        <div style={{ position: 'fixed', inset: 0, background: '#0008', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setMEnviar(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card)', borderRadius: 14, padding: 20, width: '100%', maxWidth: 460 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <strong style={{ fontSize: 16 }}>📈 Enviar análise — {lojaSel}</strong>
              <button onClick={() => setMEnviar(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={18} /></button>
            </div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Enviar para (um WhatsApp por linha, com DDD)</label>
            <textarea value={fones} onChange={e => setFones(e.target.value)} rows={3} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical' }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button className="btn" onClick={() => setMEnviar(false)} style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', padding: '9px 16px' }}>Cancelar</button>
              <button className="btn" onClick={enviar} disabled={enviando} style={{ background: '#25D366', padding: '9px 16px' }}>{enviando ? 'Enviando…' : '📲 Enviar link'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
