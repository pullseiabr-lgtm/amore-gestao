import { useState } from 'react'
import { Brain, ExternalLink, Send, X } from 'lucide-react'
import { useLoja } from '../../contexts/LojaContext'
import { useToast } from '../../hooks/useToast'
import { enviarWhatsApp } from '../../lib/notify'

const canon = (l: string) => (l === 'Amore Costa Dourada' ? 'Amore CD' : l === 'Flow Paiva' ? 'Amore Paiva' : (l || ''))
const LOJAS = ['Amore Paiva', 'Amore CD', 'Flow CD']

export default function RequisicaoInteligentePage() {
  const { loja } = useLoja()
  const { toast } = useToast()
  const lojaDef = LOJAS.includes(canon(loja)) ? canon(loja) : 'Amore Paiva'
  const [lojaSel, setLojaSel] = useState(lojaDef)
  const [mEnviar, setMEnviar] = useState(false)
  const [fones, setFones] = useState(() => localStorage.getItem('req_intel_fones') || '5581992573535\n5581994135602')
  const [enviando, setEnviando] = useState(false)

  const link = `${window.location.origin}/relatorio-requisicao.html?loja=${encodeURIComponent(lojaSel)}`
  const abrir = () => window.open(link, '_blank')

  const enviar = async () => {
    const nums = fones.split(/[\n,;]+/).map(s => s.replace(/\D/g, '')).filter(n => n.length >= 10)
    if (!nums.length) { toast('Informe ao menos um WhatsApp com DDD.', 'error'); return }
    setEnviando(true)
    try {
      const msg = `🧠 *Requisição Inteligente de Compra — ${lojaSel}*\n\nAnálise estoque × consumo: sugestão de reposição por prioridade (crítico/alto/médio) com quantidade recomendada e justificativa automática.\n${link}\n— Painel Amore`
      let ok = 0
      for (const n of nums) { if (await enviarWhatsApp(n, msg)) ok++ }
      localStorage.setItem('req_intel_fones', fones)
      toast(`Enviado para ${ok} de ${nums.length} número(s). ✅`)
      setMEnviar(false)
    } catch { toast('Não foi possível enviar.', 'error') }
    finally { setEnviando(false) }
  }

  return (
    <div>
      <div style={{ background: 'linear-gradient(135deg, #6B1212 0%, #8a2a2a 100%)', borderRadius: 12, padding: '18px 22px', marginBottom: 16, color: '#fff', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ width: 46, height: 46, borderRadius: 12, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Brain size={24} /></div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Requisição Inteligente de Compra</h2>
          <div style={{ fontSize: 13, opacity: 0.85 }}>Justifica cada compra com dados: estoque × consumo × dias de autonomia × quantidade sugerida × prioridade</div>
        </div>
      </div>

      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', maxWidth: 520 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Loja</label>
        <select value={lojaSel} onChange={e => setLojaSel(e.target.value)} style={{ padding: '9px 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 14, boxSizing: 'border-box' }}>
          {LOJAS.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <div style={{ fontSize: 12, color: 'var(--muted)', margin: '8px 0 14px' }}>
          Gera a análise de reposição da loja: para cada produto abaixo da necessidade projetada, calcula a <strong>quantidade sugerida</strong>, os <strong>dias de autonomia</strong>, a <strong>prioridade</strong> (🔴🟠🟡🟢) e uma <strong>justificativa automática</strong>. Base: consumo dos últimos 30 dias (ou mínimo/ideal quando não há histórico).
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
              <strong style={{ fontSize: 16 }}>🧠 Enviar análise — {lojaSel}</strong>
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
