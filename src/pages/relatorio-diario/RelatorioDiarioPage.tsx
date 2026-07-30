import { useState } from 'react'
import { CalendarDays, ExternalLink, Send, X } from 'lucide-react'
import { useLoja } from '../../contexts/LojaContext'
import { useToast } from '../../hooks/useToast'
import { enviarWhatsApp } from '../../lib/notify'

const canon = (l: string) => (l === 'Amore Costa Dourada' ? 'Amore CD' : l === 'Flow Paiva' ? 'Flow CD' : (l || ''))
const dDMY = (d: string) => { const p = d.split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d }

export default function RelatorioDiarioPage() {
  const { loja } = useLoja()
  const { toast } = useToast()
  const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10)
  const [data, setData] = useState(hoje)
  const lojaEsp = loja && loja !== 'Todas as Lojas' ? canon(loja) : ''
  const [mEnviar, setMEnviar] = useState(false)
  const [fones, setFones] = useState(() => localStorage.getItem('rel_diario_fones') || '5581992573535\n5581994135602')
  const [enviando, setEnviando] = useState(false)

  const link = `${window.location.origin}/relatorio-diario.html?d=${data}${lojaEsp ? `&loja=${encodeURIComponent(lojaEsp)}` : ''}`
  const abrir = () => window.open(link, '_blank')

  const enviar = async () => {
    const nums = fones.split(/[\n,;]+/).map(s => s.replace(/\D/g, '')).filter(n => n.length >= 10)
    if (!nums.length) { toast('Informe ao menos um WhatsApp com DDD.', 'error'); return }
    setEnviando(true)
    try {
      const msg = `📅 *Relatório Diário — Compras & Estoque*\n${dDMY(data)}${lojaEsp ? ` · ${lojaEsp}` : ' · Todas as lojas'}\n\nResumo do dia (compras, cotações, recebimentos, estoque, produtos críticos):\n${link}\n— Painel Amore`
      let ok = 0
      for (const n of nums) { if (await enviarWhatsApp(n, msg)) ok++ }
      localStorage.setItem('rel_diario_fones', fones)
      toast(`Relatório enviado para ${ok} de ${nums.length} número(s). ✅`)
      setMEnviar(false)
    } catch { toast('Não foi possível enviar.', 'error') }
    finally { setEnviando(false) }
  }

  return (
    <div>
      <div style={{ background: 'linear-gradient(135deg, #6B1212 0%, #8a2a2a 100%)', borderRadius: 12, padding: '18px 22px', marginBottom: 16, color: '#fff', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ width: 46, height: 46, borderRadius: 12, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CalendarDays size={24} /></div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Relatório Diário Inteligente</h2>
          <div style={{ fontSize: 13, opacity: 0.85 }}>Consolida compras, cotações, recebimentos e estoque do dia — Loja <strong>{loja}</strong></div>
        </div>
      </div>

      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', maxWidth: 520 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Data do relatório</label>
        <input type="date" value={data} onChange={e => setData(e.target.value)} style={{ padding: '9px 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 14, boxSizing: 'border-box' }} />
        <div style={{ fontSize: 12, color: 'var(--muted)', margin: '8px 0 14px' }}>
          {lojaEsp ? <>Loja: <strong>{lojaEsp}</strong></> : 'Todas as lojas (selecione uma loja específica no topo para filtrar)'}. O relatório mostra: resumo executivo, compras do dia, recebimentos, cotações pendentes, movimentações de estoque e produtos críticos, com resumo do dia.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" onClick={abrir} style={{ padding: '10px 16px' }}><ExternalLink size={16} /> Abrir relatório</button>
          <button className="btn" onClick={() => setMEnviar(true)} style={{ padding: '10px 16px', background: '#25D366' }}><Send size={16} /> Enviar por WhatsApp</button>
        </div>
      </div>

      {mEnviar && (
        <div style={{ position: 'fixed', inset: 0, background: '#0008', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setMEnviar(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card)', borderRadius: 14, padding: 20, width: '100%', maxWidth: 460 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <strong style={{ fontSize: 16 }}>📅 Enviar relatório diário</strong>
              <button onClick={() => setMEnviar(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={18} /></button>
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 10 }}>{dDMY(data)}{lojaEsp ? ` · ${lojaEsp}` : ' · Todas as lojas'} — envia o link do relatório do dia.</div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Enviar para (um WhatsApp por linha, com DDD)</label>
            <textarea value={fones} onChange={e => setFones(e.target.value)} rows={3} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical' }} />
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6 }}>Comprador e gestor já preenchidos — pode editar. Ficam salvos.</div>
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
