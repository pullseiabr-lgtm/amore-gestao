import { useState } from 'react'
import { Sparkles, Loader2, ChevronLeft, Copy, Save, Search } from 'lucide-react'
import { insertMktCampanha } from '../../lib/db'
import type { MktCampanha } from '../../lib/db'

interface CampanhaIA {
  nome?: string; descricao?: string; objetivo?: string; publico?: string
  canais?: string[]; orcamento_sugerido?: number; slogan?: string
  post_instagram?: string; post_whatsapp?: string; hashtags?: string[]; aprendizado?: string
}
interface Ref { title: string; url: string }

const TIPOS = [
  { v: 'promocao', l: '🏷️ Promoção' }, { v: 'evento', l: '🎉 Evento' },
  { v: 'digital', l: '📱 Digital' }, { v: 'redes_sociais', l: '📸 Redes Sociais' },
  { v: 'acao_rua', l: '📣 Ação de Rua' }, { v: 'parceria', l: '🤝 Parceria' },
]

async function gerarCampanhaIA(tema: string, tipo: string): Promise<CampanhaIA> {
  const apiKey = localStorage.getItem('gemini_api_key') || ''
  const params = new URLSearchParams({ model: 'gemini-2.5-flash' })
  if (apiKey) params.set('k', apiKey)
  const prompt = `Você é estrategista de marketing de um restaurante/delivery brasileiro (Amore Food).
Crie uma campanha completa para o tema "${tema}" (tipo: ${tipo}).
Responda em JSON ESTRITO, sem texto fora do JSON:
{"nome":"","descricao":"","objetivo":"","publico":"","canais":[],"orcamento_sugerido":0,"slogan":"","post_instagram":"","post_whatsapp":"","hashtags":[],"aprendizado":""}
- post_instagram: legenda pronta para o Instagram, com emojis e chamada para ação.
- post_whatsapp: mensagem curta e direta para disparo no WhatsApp.
- orcamento_sugerido: número em reais (estimativa).
- canais: lista de canais (ex: Instagram, WhatsApp, iFood, panfleto).
Responda APENAS o JSON.`
  const resp = await fetch(`/api/gemini?${params}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.85, maxOutputTokens: 2048 } }),
  })
  const data = await resp.json()
  if (!resp.ok) throw new Error(data?.error || 'Falha ao gerar com a IA')
  let txt: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  txt = txt.replace(/```json/gi, '').replace(/```/g, '').trim()
  const s = txt.indexOf('{'); const e = txt.lastIndexOf('}')
  if (s >= 0 && e > s) txt = txt.slice(s, e + 1)
  return JSON.parse(txt)
}

async function buscarReferencias(tema: string): Promise<Ref[]> {
  const braveKey = localStorage.getItem('brave_api_key') || ''
  const params = new URLSearchParams({ q: `ideias campanha marketing ${tema} restaurante delivery` })
  if (braveKey) params.set('t', braveKey)
  try {
    const r = await fetch(`/api/brave-search?${params}`)
    const data = await r.json()
    if (!r.ok) return []
    return (data?.web?.results || []).slice(0, 5).map((x: { title: string; url: string }) => ({ title: x.title, url: x.url }))
  } catch { return [] }
}

export default function AssistenteCampanhaIA({ lojaAtual, onSalvo, onVoltar }: {
  lojaAtual: string
  onSalvo: (c: MktCampanha) => void
  onVoltar: () => void
}) {
  const [tema, setTema] = useState('')
  const [tipo, setTipo] = useState('promocao')
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState('')
  const [ia, setIa] = useState<CampanhaIA | null>(null)
  const [refs, setRefs] = useState<Ref[]>([])
  const [salvando, setSalvando] = useState(false)

  const gerar = async () => {
    if (!tema.trim()) return
    setErro(''); setGerando(true); setIa(null); setRefs([])
    try {
      const [c, r] = await Promise.all([gerarCampanhaIA(tema.trim(), tipo), buscarReferencias(tema.trim())])
      setIa(c); setRefs(r)
    } catch (e) { setErro((e as Error).message || 'Não foi possível gerar a campanha.') }
    finally { setGerando(false) }
  }

  const copiar = (t: string) => { navigator.clipboard?.writeText(t) }

  const salvar = async () => {
    if (!ia) return
    setSalvando(true)
    try {
      const hashtags = (ia.hashtags || []).map(h => (h.startsWith('#') ? h : '#' + h)).join(' ')
      const aprendizado = [
        ia.slogan ? `Slogan: ${ia.slogan}` : '',
        ia.post_instagram ? `\n📸 Instagram:\n${ia.post_instagram}` : '',
        ia.post_whatsapp ? `\n💬 WhatsApp:\n${ia.post_whatsapp}` : '',
        hashtags ? `\n${hashtags}` : '',
      ].filter(Boolean).join('\n')
      const objetivo = [ia.objetivo, ia.publico ? `Público: ${ia.publico}` : '', (ia.canais || []).length ? `Canais: ${(ia.canais || []).join(', ')}` : '']
        .filter(Boolean).join(' · ')
      const payload: Omit<MktCampanha, 'id' | 'created_at' | 'updated_at'> = {
        loja: lojaAtual,
        nome: ia.nome || tema,
        descricao: ia.descricao || null,
        tipo,
        objetivo: objetivo || null,
        intensidade: 'media',
        status: 'planejamento',
        data_inicio: null, data_fim: null,
        investimento: Number(ia.orcamento_sugerido) || 0,
        receita_estimada: 0, receita_real: 0,
        aprendizado: aprendizado || null,
        responsavel: null,
        created_by: null,
      }
      const saved = await insertMktCampanha(payload)
      onSalvo(saved)
    } finally { setSalvando(false) }
  }

  const Bloco = ({ titulo, children }: { titulo: string; children: React.ReactNode }) => (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>{titulo}</div>
      {children}
    </div>
  )

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button className="ib" onClick={onVoltar}><ChevronLeft size={16} /></button>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}><Sparkles size={18} style={{ color: 'var(--bordo)' }} /> Criar Campanha com IA</h2>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>A Liz pesquisa referências e gera a campanha pronta (ideia, post, canais, orçamento).</div>
        </div>
      </div>

      {/* Input */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Tema / objetivo da campanha</label>
        <input value={tema} onChange={e => setTema(e.target.value)} onKeyDown={e => e.key === 'Enter' && gerar()}
          placeholder="Ex: Dia dos Namorados delivery · Combo família fim de semana · Reels Arena Amore"
          style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 14, boxSizing: 'border-box', marginBottom: 10 }} />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={tipo} onChange={e => setTipo(e.target.value)} style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13 }}>
            {TIPOS.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
          </select>
          <button onClick={gerar} disabled={gerando || !tema.trim()}
            style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: gerando ? 'var(--border)' : 'var(--bordo)', color: '#fff', cursor: gerando ? 'wait' : 'pointer', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
            {gerando ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Gerando…</> : <><Sparkles size={15} /> Gerar com IA</>}
          </button>
        </div>
        {erro && <div style={{ fontSize: 12.5, color: '#dc2626', marginTop: 10 }}>⚠ {erro}</div>}
      </div>

      {/* Resultado */}
      {ia && (
        <>
          <Bloco titulo="🎯 Campanha">
            <div style={{ fontSize: 16, fontWeight: 800 }}>{ia.nome}</div>
            {ia.slogan && <div style={{ fontSize: 13, fontStyle: 'italic', color: 'var(--bordo)', marginTop: 2 }}>“{ia.slogan}”</div>}
            {ia.descricao && <div style={{ fontSize: 13, lineHeight: 1.6, marginTop: 8, whiteSpace: 'pre-wrap' }}>{ia.descricao}</div>}
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>
              {ia.publico && <span>👥 {ia.publico}</span>}
              {!!(ia.canais || []).length && <span>📡 {(ia.canais || []).join(', ')}</span>}
              {ia.orcamento_sugerido ? <span>💰 R$ {Number(ia.orcamento_sugerido).toLocaleString('pt-BR')}</span> : null}
            </div>
          </Bloco>

          {ia.post_instagram && (
            <Bloco titulo="📸 Post Instagram">
              <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{ia.post_instagram}</div>
              {!!(ia.hashtags || []).length && <div style={{ fontSize: 12, color: 'var(--bordo)', marginTop: 8 }}>{(ia.hashtags || []).map(h => (h.startsWith('#') ? h : '#' + h)).join(' ')}</div>}
              <button onClick={() => copiar(ia.post_instagram + '\n\n' + (ia.hashtags || []).map(h => (h.startsWith('#') ? h : '#' + h)).join(' '))}
                style={{ marginTop: 8, padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Copy size={12} /> Copiar</button>
            </Bloco>
          )}

          {ia.post_whatsapp && (
            <Bloco titulo="💬 Mensagem WhatsApp">
              <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{ia.post_whatsapp}</div>
              <button onClick={() => copiar(ia.post_whatsapp || '')}
                style={{ marginTop: 8, padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Copy size={12} /> Copiar</button>
            </Bloco>
          )}

          {!!refs.length && (
            <Bloco titulo="🔎 Referências da web">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {refs.map((r, i) => (
                  <a key={i} href={r.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, color: 'var(--bordo)', display: 'flex', alignItems: 'center', gap: 5, wordBreak: 'break-all' }}><Search size={12} /> {r.title}</a>
                ))}
              </div>
            </Bloco>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
            <button onClick={salvar} disabled={salvando}
              style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: salvando ? 'var(--border)' : '#16a34a', color: '#fff', cursor: salvando ? 'wait' : 'pointer', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
              {salvando ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={15} />} Salvar como campanha
            </button>
            <button onClick={gerar} disabled={gerando} style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', cursor: 'pointer', fontSize: 13 }}>🔄 Gerar outra</button>
          </div>
        </>
      )}

      <style>{`@keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }`}</style>
    </div>
  )
}
