import { useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, Sparkles } from 'lucide-react'
import type { MktCampanha } from '../../lib/db'

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const DIAS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB']

// Datas comemorativas relevantes para food/delivery (dia/mês fixos; variáveis sinalizadas)
const COMEMORATIVAS: { dia: number; mes: number; nome: string; emoji: string }[] = [
  { dia: 1, mes: 0, nome: 'Ano Novo', emoji: '🎆' },
  { dia: 8, mes: 2, nome: 'Dia da Mulher', emoji: '💐' },
  { dia: 12, mes: 5, nome: 'Dia dos Namorados', emoji: '❤️' },
  { dia: 12, mes: 9, nome: 'Dia das Crianças', emoji: '🧸' },
  { dia: 15, mes: 9, nome: 'Dia do Professor', emoji: '🍎' },
  { dia: 2, mes: 10, nome: 'Finados', emoji: '🕯️' },
  { dia: 25, mes: 11, nome: 'Natal', emoji: '🎄' },
  { dia: 31, mes: 11, nome: 'Réveillon', emoji: '🥂' },
]
// Variáveis (mês aproximado) — apenas referência
const VARIAVEIS: { mes: number; nome: string; emoji: string }[] = [
  { mes: 1, nome: 'Carnaval', emoji: '🎭' },
  { mes: 4, nome: 'Dia das Mães (2º dom)', emoji: '🌷' },
  { mes: 7, nome: 'Dia dos Pais (2º dom)', emoji: '👔' },
  { mes: 10, nome: 'Black Friday (últ. sexta)', emoji: '🛍️' },
]

const TIPO_COR: Record<string, string> = {
  promocao: '#ea580c', evento: '#9333ea', digital: '#2563eb',
  redes_sociais: '#db2777', acao_rua: '#16a34a', parceria: '#0891b2',
}

function ymd(d: Date) { return d.toISOString().slice(0, 10) }

export default function CalendarioCampanhas({ campanhas, onNova, onVoltar }: {
  campanhas: MktCampanha[]
  onNova: () => void
  onVoltar: () => void
}) {
  const hoje = new Date()
  const [ano, setAno] = useState(hoje.getFullYear())
  const [mes, setMes] = useState(hoje.getMonth())

  const primeiroDia = new Date(ano, mes, 1)
  const diasNoMes = new Date(ano, mes + 1, 0).getDate()
  const offset = primeiroDia.getDay()
  const celulas: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: diasNoMes }, (_, i) => i + 1)]

  // campanhas que cobrem um dia específico
  const campNoDia = (dia: number) => {
    const dStr = ymd(new Date(ano, mes, dia))
    return campanhas.filter(c => {
      const ini = c.data_inicio || ''
      const fim = c.data_fim || c.data_inicio || ''
      if (!ini) return false
      return dStr >= ini.slice(0, 10) && dStr <= (fim ? fim.slice(0, 10) : ini.slice(0, 10))
    })
  }

  const navega = (delta: number) => {
    let m = mes + delta, a = ano
    if (m < 0) { m = 11; a-- } else if (m > 11) { m = 0; a++ }
    setMes(m); setAno(a)
  }

  const comemNoMes = COMEMORATIVAS.filter(c => c.mes === mes).sort((a, b) => a.dia - b.dia)
  const variaveisNoMes = VARIAVEIS.filter(c => c.mes === mes)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <button className="ib" onClick={onVoltar}><ChevronLeft size={16} /></button>
        <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>📅 Calendário de Campanhas</h2>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="ib" onClick={() => navega(-1)}><ChevronLeft size={16} /></button>
          <strong style={{ minWidth: 150, textAlign: 'center' }}>{MESES[mes]} {ano}</strong>
          <button className="ib" onClick={() => navega(1)}><ChevronRight size={16} /></button>
          <button className="btn bp bsm" onClick={onNova} style={{ marginLeft: 6 }}><Plus size={11} /> Nova</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, alignItems: 'start' }}>
        {/* Grade */}
        <div className="card" style={{ padding: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
            {DIAS.map(d => <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'var(--muted)', padding: 4 }}>{d}</div>)}
            {celulas.map((dia, i) => {
              if (dia === null) return <div key={`e${i}`} />
              const camps = campNoDia(dia)
              const comem = COMEMORATIVAS.find(c => c.mes === mes && c.dia === dia)
              const ehHoje = dia === hoje.getDate() && mes === hoje.getMonth() && ano === hoje.getFullYear()
              return (
                <div key={dia} style={{ minHeight: 72, border: `1px solid ${ehHoje ? 'var(--bordo)' : 'var(--border)'}`, borderRadius: 7, padding: 4, background: ehHoje ? 'var(--bordo-bg,#fff5f5)' : 'var(--bg)', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, fontWeight: ehHoje ? 800 : 600 }}>{dia}</span>
                    {comem && <span title={comem.nome} style={{ fontSize: 12 }}>{comem.emoji}</span>}
                  </div>
                  {comem && <div style={{ fontSize: 8.5, color: 'var(--bordo)', fontWeight: 600, lineHeight: 1.1, marginTop: 1 }}>{comem.nome}</div>}
                  {camps.slice(0, 3).map(c => (
                    <div key={c.id} title={c.nome} style={{ fontSize: 9, marginTop: 2, padding: '1px 4px', borderRadius: 4, background: (TIPO_COR[c.tipo] || '#64748b') + '22', color: TIPO_COR[c.tipo] || '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 }}>
                      {c.nome}
                    </div>
                  ))}
                  {camps.length > 3 && <div style={{ fontSize: 8, color: 'var(--muted)' }}>+{camps.length - 3}</div>}
                </div>
              )
            })}
          </div>
        </div>

        {/* Datas comemorativas do mês */}
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>🎯 Datas para planejar — {MESES[mes]}</div>
          {comemNoMes.length === 0 && variaveisNoMes.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Sem datas comemorativas fixas neste mês.</div>
          )}
          {comemNoMes.map(c => (
            <div key={c.nome} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 18 }}>{c.emoji}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{c.nome}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{String(c.dia).padStart(2, '0')}/{String(mes + 1).padStart(2, '0')}</div>
              </div>
              <button onClick={onNova} title="Criar campanha com IA" style={{ background: 'linear-gradient(135deg,#7c3aed,#a855f7)', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}><Sparkles size={11} /> IA</button>
            </div>
          ))}
          {variaveisNoMes.map(c => (
            <div key={c.nome} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--border)', opacity: 0.85 }}>
              <span style={{ fontSize: 18 }}>{c.emoji}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{c.nome}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>data variável</div>
              </div>
              <button onClick={onNova} style={{ background: 'linear-gradient(135deg,#7c3aed,#a855f7)', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}><Sparkles size={11} /> IA</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
