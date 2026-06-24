import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Edit2, Trash2, Loader2, Save, X, FileDown, CheckSquare,
  ArrowLeft, ListChecks, Lightbulb, Phone, FileText,
} from 'lucide-react'
import { useLoja } from '../../contexts/LojaContext'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../hooks/useToast'
import { fetchPautas, insertPauta, updatePauta, deletePauta, insertTarefaDePauta, fetchProfiles, insertAta } from '../../lib/db'
import { enviarWhatsApp, whatsappDoPerfilPorNome } from '../../lib/notify'
import Modal from '../../components/ui/Modal'
import type { PautaReuniao, PautaTema } from '../../types/database'

// ── Constantes (todas personalizáveis: usadas como sugestão em datalist) ──
const TIPOS = ['Operacional', 'Comercial', 'Financeira', 'Marketing', 'Compras', 'Diretoria', 'RH', 'Qualidade', 'Outros']
const PRIORIDADES = ['Alta', 'Média', 'Baixa']
const STATUS_TEMA = ['Pendente', 'Em andamento', 'Concluído']
const STATUS_PAUTA = ['rascunho', 'finalizada', 'realizada']
const SETORES = ['Financeiro', 'Compras', 'Operação', 'Marketing', 'RH', 'Comercial', 'Diretoria', 'Qualidade', 'Geral']

// Sugestões automáticas por setor (editáveis: viram um tema pré-preenchido ao clicar)
const SUGESTOES: Record<string, string[]> = {
  Financeiro: ['Fluxo de caixa', 'Inadimplência', 'Custos e CMV', 'Prestação de contas'],
  Compras: ['Comparativo de fornecedores', 'Rupturas de estoque', 'Aumento de preços', 'Negociações'],
  Operação: ['Manutenções', 'Check-list', 'Escalas', 'Qualidade'],
  Marketing: ['Campanhas', 'Instagram', 'Delivery', 'Eventos', 'Promoções'],
  RH: ['Contratações', 'Treinamentos', 'Avaliações', 'Advertências'],
  Comercial: ['Metas', 'Ticket médio', 'Faturamento', 'Indicadores'],
}

const prioWeight = (p: string) => p === 'Alta' ? 0 : p === 'Média' ? 1 : p === 'Baixa' ? 2 : 1.5
const prioColor = (p: string) => p === 'Alta' ? '#ef4444' : p === 'Baixa' ? '#16a34a' : '#f59e0b'
const hoje = () => new Date().toISOString().slice(0, 10)

function novoTema(p: Partial<PautaTema> = {}): PautaTema {
  return { id: crypto.randomUUID(), tema: '', descricao: '', motivo: '', objetivo: '', setor: '', responsavel: '', prioridade: 'Média', tempo: '', status: 'Pendente', decisao: '', ...p }
}

// ── Componente principal ─────────────────────────────────────
export default function PautaReuniaoPage() {
  const { loja } = useLoja()
  const { user } = useAuth()
  const { toast } = useToast()

  const [pautas, setPautas] = useState<PautaReuniao[]>([])
  const [loading, setLoading] = useState(true)
  const [edit, setEdit] = useState<PautaReuniao | null>(null) // pauta em edição (null = lista)

  const load = useCallback(async () => {
    setLoading(true)
    try { setPautas(await fetchPautas(loja)) } finally { setLoading(false) }
  }, [loja])
  useEffect(() => { load() }, [load])

  const nova = (): PautaReuniao => ({
    id: '', loja: loja === 'Todas as Lojas' ? null : loja, titulo: '', data: hoje(), horario: '',
    tipo: 'Operacional', status: 'rascunho', temas: [], observacoes: null,
    created_by: user?.name || null, created_at: '', updated_at: '',
  })

  if (edit) return <PautaEditor pauta={edit} onSaved={() => { setEdit(null); load() }} toast={toast} />

  return (
    <div>
      <div style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #2d5a8a 100%)', borderRadius: 12, padding: '18px 22px', marginBottom: 16, color: '#fff', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ListChecks size={26} /></div>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Sugestão de Pauta de Reunião</h2>
          <div style={{ fontSize: 13, opacity: 0.85 }}>Organize os assuntos por setor, gere a pauta e transforme em tarefas · Loja <strong>{loja}</strong></div>
        </div>
      </div>

      <button onClick={() => setEdit(nova())} style={btnPrimary}><Plus size={15} /> Nova pauta</button>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Loader2 className="spin" size={28} /></div>
      ) : pautas.length === 0 ? (
        <Empty texto="Nenhuma pauta ainda. Crie a primeira (ex.: Reunião Operacional Semanal)." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
          {pautas.map(p => (
            <div key={p.id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{p.titulo || '(sem título)'}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                  {p.tipo || '—'} · {p.data ? new Date(p.data + 'T12:00:00').toLocaleDateString('pt-BR') : 's/ data'}{p.horario ? ` ${p.horario}` : ''} · {p.temas.length} tema(s) · <em>{p.status}</em>
                </div>
              </div>
              <button onClick={() => setEdit(p)} style={iconBtn}><Edit2 size={15} /></button>
              <button onClick={async () => { if (confirm(`Excluir a pauta "${p.titulo}"?`)) { await deletePauta(p.id); toast('Pauta excluída.', 'success'); load() } }} style={{ ...iconBtn, color: '#ef4444' }}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Editor de pauta ──────────────────────────────────────────
function PautaEditor({ pauta, onSaved, toast }: {
  pauta: PautaReuniao
  onSaved: () => void
  toast: (m: string, t?: 'success' | 'error' | 'warning' | 'info') => void
}) {
  const [pautaId, setPautaId] = useState(pauta.id)
  const [titulo, setTitulo] = useState(pauta.titulo)
  const [data, setData] = useState(pauta.data || hoje())
  const [horario, setHorario] = useState(pauta.horario || '')
  const [tipo, setTipo] = useState(pauta.tipo || 'Operacional')
  const [status, setStatus] = useState(pauta.status || 'rascunho')
  const [obs, setObs] = useState(pauta.observacoes || '')
  const [temas, setTemas] = useState<PautaTema[]>(pauta.temas || [])
  const [salvando, setSalvando] = useState(false)
  const [convertendo, setConvertendo] = useState(false)
  const [enviandoWa, setEnviandoWa] = useState(false)
  const [profiles, setProfiles] = useState<any[]>([])
  const [ataDraft, setAtaDraft] = useState<{ titulo: string; participantes: string; pauta: string; decisoes: string; proximos: string } | null>(null)
  const [salvandoAta, setSalvandoAta] = useState(false)
  useEffect(() => { fetchProfiles().then(setProfiles).catch(() => {}) }, [])

  const setTema = (id: string, patch: Partial<PautaTema>) => setTemas(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t))
  const addTema = (p: Partial<PautaTema> = {}) => setTemas(prev => [...prev, novoTema(p)])
  const delTema = (id: string) => setTemas(prev => prev.filter(t => t.id !== id))

  const payload = () => ({
    loja: pauta.loja, titulo: titulo.trim(), data: data || null, horario: horario || null,
    tipo: tipo || null, status, temas, observacoes: obs.trim() || null, created_by: pauta.created_by,
  })

  const salvar = async (): Promise<string | null> => {
    if (!titulo.trim()) { toast('Informe o título da reunião.', 'warning'); return null }
    setSalvando(true)
    try {
      if (pautaId) { await updatePauta(pautaId, payload()); toast('Pauta salva.', 'success'); return pautaId }
      const nova = await insertPauta(payload()); setPautaId(nova.id); toast('Pauta criada.', 'success'); return nova.id
    } catch (e) { toast('Erro ao salvar: ' + (e as Error).message, 'error'); return null }
    finally { setSalvando(false) }
  }

  const exportarPDF = () => {
    const ordenados = [...temas].sort((a, b) => prioWeight(a.prioridade) - prioWeight(b.prioridade))
    const dataBR = data ? new Date(data + 'T12:00:00').toLocaleDateString('pt-BR') : ''
    const linhasTemas = ordenados.map((t, i) => `
      <div class="tema">
        <div class="th"><span class="num">${i + 1}</span> <strong>${esc(t.tema)}</strong>
          <span class="prio" style="background:${prioColor(t.prioridade)}">${esc(t.prioridade)}</span></div>
        ${t.descricao ? `<p><b>Descrição:</b> ${esc(t.descricao)}</p>` : ''}
        ${t.motivo ? `<p><b>Por quê:</b> ${esc(t.motivo)}</p>` : ''}
        ${t.objetivo ? `<p><b>Objetivo:</b> ${esc(t.objetivo)}</p>` : ''}
        <p class="meta">${[t.setor && `Setor: ${esc(t.setor)}`, t.responsavel && `Responsável: ${esc(t.responsavel)}`, t.tempo && `Tempo: ${esc(t.tempo)}`, t.status && `Status: ${esc(t.status)}`].filter(Boolean).join(' &nbsp;|&nbsp; ')}</p>
      </div>`).join('')
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(titulo)}</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;padding:32px;max-width:800px;margin:auto}
        h1{color:#6B1212;margin:0 0 4px} .sub{color:#666;font-size:13px;margin-bottom:20px}
        .tema{border:1px solid #ddd;border-radius:8px;padding:12px 14px;margin-bottom:10px}
        .th{font-size:15px;margin-bottom:6px;display:flex;align-items:center;gap:8px}
        .num{background:#6B1212;color:#fff;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px}
        .prio{color:#fff;font-size:11px;padding:2px 8px;border-radius:10px;margin-left:auto}
        p{margin:3px 0;font-size:13px} .meta{color:#555;font-size:12px;margin-top:6px}
        @media print{.noprint{display:none}}
      </style></head><body>
      <h1>${esc(titulo) || 'Pauta de Reunião'}</h1>
      <div class="sub">${esc(tipo || '')} &nbsp;|&nbsp; ${dataBR}${horario ? ' ' + esc(horario) : ''} &nbsp;|&nbsp; ${ordenados.length} tema(s)</div>
      ${linhasTemas || '<p>Sem temas.</p>'}
      ${obs ? `<p style="margin-top:16px"><b>Observações:</b> ${esc(obs)}</p>` : ''}
      <button class="noprint" onclick="window.print()" style="margin-top:20px;padding:8px 16px;background:#6B1212;color:#fff;border:none;border-radius:6px;cursor:pointer">Imprimir / Salvar PDF</button>
      </body></html>`
    const w = window.open('', '_blank')
    if (!w) { toast('Permita pop-ups para exportar o PDF.', 'warning'); return }
    w.document.write(html); w.document.close()
  }

  const transformarEmTarefas = async () => {
    const validos = temas.filter(t => t.tema.trim())
    if (!validos.length) { toast('Nenhum tema para transformar.', 'warning'); return }
    if (!confirm(`Criar ${validos.length} tarefa(s) na Central de Tarefas a partir dos temas?`)) return
    setConvertendo(true)
    try {
      const id = await salvar() // garante que a pauta está salva
      if (!id) return
      const prioMap: Record<string, string> = { Alta: 'alta', 'Média': 'media', Media: 'media', Baixa: 'baixa' }
      let ok = 0
      for (const t of validos) {
        const desc = [t.descricao, t.motivo && `Motivo: ${t.motivo}`, t.objetivo && `Objetivo: ${t.objetivo}`].filter(Boolean).join('\n')
        try {
          await insertTarefaDePauta({
            loja: pauta.loja || 'Todas as Lojas', titulo: t.tema,
            descricao: desc || null, setor: t.setor || null,
            prioridade: prioMap[t.prioridade] || 'media',
            responsavel_nome: t.responsavel || null,
            solicitante_nome: `Pauta: ${titulo}`.slice(0, 80),
            created_by: pauta.created_by,
          })
          ok++
        } catch { /* segue */ }
      }
      toast(`${ok}/${validos.length} tarefa(s) criada(s) na Central de Tarefas.`, ok ? 'success' : 'error')
    } finally { setConvertendo(false) }
  }

  // Envia a pauta por WhatsApp aos responsáveis (1 msg por responsável, só seus temas) — padrão da Central de Tarefas.
  const enviarWhatsAppResponsaveis = async () => {
    const validos = temas.filter(t => t.tema.trim())
    if (!validos.length) { toast('Adicione temas primeiro.', 'warning'); return }
    const semResp = validos.filter(t => !t.responsavel.trim())
    if (semResp.length) { toast(`${semResp.length} tema(s) sem responsável. O responsável é obrigatório para enviar a pauta.`, 'warning'); return }
    setEnviandoWa(true)
    try {
      await salvar()
      const porResp: Record<string, PautaTema[]> = {}
      validos.forEach(t => { (porResp[t.responsavel.trim()] ||= []).push(t) })
      const dataBR = data ? new Date(data + 'T12:00:00').toLocaleDateString('pt-BR') : ''
      let ok = 0; const semFone: string[] = []
      for (const [resp, lista] of Object.entries(porResp)) {
        const fone = whatsappDoPerfilPorNome(profiles, resp)
        if (!fone) { semFone.push(resp); continue }
        const linhas = lista.map((t, i) => `${i + 1}. *${t.tema}*${t.prioridade ? ` [${t.prioridade}]` : ''}${t.tempo ? ` (${t.tempo})` : ''}${t.objetivo ? `\n   🎯 ${t.objetivo}` : ''}`).join('\n')
        const msg = `📋 *PAUTA — ${titulo}*\n📅 ${dataBR}${horario ? ` ${horario}` : ''}${tipo ? `\n🏷️ ${tipo}` : ''}\n\nOlá, ${resp.split(' ')[0]}! Seus temas para a reunião:\n\n${linhas}\n\n_Amore Gestão · Pauta de Reunião_`
        if (await enviarWhatsApp(fone, msg, undefined, { tipo: 'tarefa', modulo: 'pauta-reuniao', titulo, loja: pauta.loja || null, destinatario_nome: resp, created_by: pauta.created_by })) ok++
      }
      let m = `Pauta enviada a ${ok} responsável(is).`
      if (semFone.length) m += ` Sem WhatsApp no cadastro: ${semFone.join(', ')}.`
      toast(m, ok ? 'success' : 'warning')
    } finally { setEnviandoWa(false) }
  }

  // Gera o rascunho da ata a partir dos temas/decisões e abre para edição.
  const abrirGerarAta = () => {
    const validos = temas.filter(t => t.tema.trim())
    if (!validos.length) { toast('Adicione temas primeiro.', 'warning'); return }
    const participantes = [...new Set(validos.map(t => t.responsavel.trim()).filter(Boolean))].join(', ')
    const pautaTxt = validos.map((t, i) => `${i + 1}. ${t.tema}${t.setor ? ` (${t.setor})` : ''}${t.responsavel ? ` — ${t.responsavel}` : ''}`).join('\n')
    const decisoesTxt = validos.map((t, i) => `${i + 1}. ${t.tema}: ${t.decisao?.trim() || '(definir decisão)'}`).join('\n')
    const proximos = validos.filter(t => t.responsavel.trim()).map(t => `• ${t.tema} → ${t.responsavel}${t.status ? ` [${t.status}]` : ''}`).join('\n')
    setAtaDraft({ titulo: `Ata — ${titulo}`, participantes, pauta: pautaTxt, decisoes: decisoesTxt, proximos })
  }

  const salvarAta = async () => {
    if (!ataDraft) return
    if (!ataDraft.titulo.trim()) { toast('Informe o título da ata.', 'warning'); return }
    setSalvandoAta(true)
    try {
      await insertAta({
        loja: pauta.loja || 'Todas as Lojas', titulo: ataDraft.titulo.trim(),
        data_reuniao: data || hoje(), hora_inicio: horario || null, hora_fim: null, local_reuniao: null,
        tipo: 'operacional',
        participantes: ataDraft.participantes ? ataDraft.participantes.split(',').map(s => s.trim()).filter(Boolean) : null,
        pauta: ataDraft.pauta || null, decisoes: ataDraft.decisoes || null, proximos_passos: ataDraft.proximos || null,
        observacoes: null, status: 'rascunho', aprovada_por: null, aprovada_at: null,
        arquivo_url: null, arquivo_nome: null, created_by: pauta.created_by,
      })
      toast('Ata gerada e salva em "Atas de Reunião".', 'success')
      setAtaDraft(null)
    } catch (e) { toast('Erro ao salvar ata: ' + (e as Error).message, 'error') }
    finally { setSalvandoAta(false) }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button onClick={onSaved} style={iconBtn} title="Voltar"><ArrowLeft size={16} /></button>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{pautaId ? 'Editar pauta' : 'Nova pauta'}</h2>
      </div>

      {/* Informações da reunião */}
      <div style={card}>
        <SecTitle>📅 Informações da Reunião</SecTitle>
        <Field label="Título da reunião *"><input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ex.: Reunião Operacional Semanal" style={inp} /></Field>
        <div style={grid3}>
          <Field label="Data"><input type="date" value={data} onChange={e => setData(e.target.value)} style={inp} /></Field>
          <Field label="Horário previsto"><input type="time" value={horario} onChange={e => setHorario(e.target.value)} style={inp} /></Field>
          <Field label="Tipo (personalizável)">
            <input list="tipos-reuniao" value={tipo} onChange={e => setTipo(e.target.value)} style={inp} placeholder="Operacional…" />
            <datalist id="tipos-reuniao">{TIPOS.map(t => <option key={t} value={t} />)}</datalist>
          </Field>
        </div>
        <Field label="Status da pauta">
          <input list="status-pauta" value={status} onChange={e => setStatus(e.target.value)} style={inp} />
          <datalist id="status-pauta">{STATUS_PAUTA.map(s => <option key={s} value={s} />)}</datalist>
        </Field>
      </div>

      {/* Sugestões automáticas por setor */}
      <div style={card}>
        <SecTitle><Lightbulb size={15} style={{ verticalAlign: -2 }} /> Sugestões automáticas por setor <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 12 }}>(clique para adicionar como tema — editável)</span></SecTitle>
        {Object.entries(SUGESTOES).map(([setor, lista]) => (
          <div key={setor} style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>{setor}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {lista.map(s => (
                <button key={s} onClick={() => addTema({ tema: s, setor })} style={chip}>+ {s}</button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Temas */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <SecTitle>📝 Temas da reunião ({temas.length})</SecTitle>
          <button onClick={() => addTema()} style={btnGhost}><Plus size={13} /> Tema em branco</button>
        </div>
        {temas.length === 0 && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Nenhum tema. Use as sugestões acima ou adicione um tema em branco.</div>}
        {temas.map((t, idx) => (
          <div key={t.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, marginBottom: 8, background: 'var(--bg)' }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700, minWidth: 18 }}>{idx + 1}.</span>
              <input value={t.tema} onChange={e => setTema(t.id, { tema: e.target.value })} placeholder="Tema" style={{ ...inp, flex: 1, fontWeight: 600 }} />
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: prioColor(t.prioridade) }} />
              <button onClick={() => delTema(t.id)} style={{ ...iconBtn, color: '#ef4444' }}><X size={14} /></button>
            </div>
            <div style={grid2}>
              <Field label="Descrição do assunto"><input value={t.descricao} onChange={e => setTema(t.id, { descricao: e.target.value })} style={inp} /></Field>
              <Field label="Motivo (Por quê?)"><input value={t.motivo} onChange={e => setTema(t.id, { motivo: e.target.value })} style={inp} /></Field>
              <Field label="Objetivo esperado"><input value={t.objetivo} onChange={e => setTema(t.id, { objetivo: e.target.value })} style={inp} /></Field>
              <Field label="Responsável pelo tema *"><input value={t.responsavel} onChange={e => setTema(t.id, { responsavel: e.target.value })} placeholder="Obrigatório p/ gerar/enviar" style={{ ...inp, borderColor: t.responsavel.trim() ? 'var(--border)' : '#ef4444' }} /></Field>
            </div>
            <div style={grid4}>
              <Field label="Setor responsável">
                <input list="setores-pauta" value={t.setor} onChange={e => setTema(t.id, { setor: e.target.value })} style={inp} />
                <datalist id="setores-pauta">{SETORES.map(s => <option key={s} value={s} />)}</datalist>
              </Field>
              <Field label="Prioridade">
                <input list="prioridades-pauta" value={t.prioridade} onChange={e => setTema(t.id, { prioridade: e.target.value })} style={inp} />
                <datalist id="prioridades-pauta">{PRIORIDADES.map(s => <option key={s} value={s} />)}</datalist>
              </Field>
              <Field label="Tempo estimado"><input value={t.tempo} onChange={e => setTema(t.id, { tempo: e.target.value })} placeholder="15 min" style={inp} /></Field>
              <Field label="Status">
                <input list="status-tema" value={t.status} onChange={e => setTema(t.id, { status: e.target.value })} style={inp} />
                <datalist id="status-tema">{STATUS_TEMA.map(s => <option key={s} value={s} />)}</datalist>
              </Field>
            </div>
            <Field label="Decisão tomada (preencha após a reunião → gera a ata)">
              <input value={t.decisao || ''} onChange={e => setTema(t.id, { decisao: e.target.value })} placeholder="Ex.: Aprovado; renegociar com fornecedor X até dia 30" style={inp} />
            </Field>
          </div>
        ))}
      </div>

      <Field label="Observações gerais"><textarea value={obs} onChange={e => setObs(e.target.value)} rows={2} style={{ ...inp, resize: 'vertical' }} /></Field>

      {/* Ações */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
        <button onClick={salvar} disabled={salvando} style={btnPrimary}>{salvando ? <Loader2 className="spin" size={14} /> : <Save size={14} />} Salvar pauta</button>
        <button onClick={exportarPDF} style={btnGhost}><FileDown size={14} /> Gerar / Exportar PDF</button>
        <button onClick={enviarWhatsAppResponsaveis} disabled={enviandoWa} style={btnGhost}>{enviandoWa ? <Loader2 className="spin" size={14} /> : <Phone size={14} />} Enviar pauta no WhatsApp</button>
        <button onClick={abrirGerarAta} style={btnGhost}><FileText size={14} /> Gerar Ata</button>
        <button onClick={transformarEmTarefas} disabled={convertendo} style={btnGhost}>{convertendo ? <Loader2 className="spin" size={14} /> : <CheckSquare size={14} />} Transformar temas em tarefas</button>
      </div>

      {/* Modal de geração de ata (editável) */}
      {ataDraft && (
        <Modal open onClose={() => setAtaDraft(null)} title="Gerar Ata da Reunião" size="lg"
          footer={
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setAtaDraft(null)} style={btnGhost}>Cancelar</button>
              <button onClick={salvarAta} disabled={salvandoAta} style={btnPrimary}>{salvandoAta ? <Loader2 className="spin" size={14} /> : <Save size={14} />} Salvar em Atas de Reunião</button>
            </div>
          }>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>Gerada a partir dos temas e decisões. Edite à vontade antes de salvar — fica registrada no módulo <strong>Atas de Reunião</strong>.</div>
          <Field label="Título da ata"><input value={ataDraft.titulo} onChange={e => setAtaDraft({ ...ataDraft, titulo: e.target.value })} style={inp} /></Field>
          <Field label="Participantes (separados por vírgula)"><input value={ataDraft.participantes} onChange={e => setAtaDraft({ ...ataDraft, participantes: e.target.value })} style={inp} /></Field>
          <Field label="Pauta (temas discutidos)"><textarea value={ataDraft.pauta} onChange={e => setAtaDraft({ ...ataDraft, pauta: e.target.value })} rows={4} style={{ ...inp, resize: 'vertical' }} /></Field>
          <Field label="Decisões tomadas"><textarea value={ataDraft.decisoes} onChange={e => setAtaDraft({ ...ataDraft, decisoes: e.target.value })} rows={4} style={{ ...inp, resize: 'vertical' }} /></Field>
          <Field label="Próximos passos / responsáveis"><textarea value={ataDraft.proximos} onChange={e => setAtaDraft({ ...ataDraft, proximos: e.target.value })} rows={3} style={{ ...inp, resize: 'vertical' }} /></Field>
        </Modal>
      )}
    </div>
  )
}

// ── UI helpers ───────────────────────────────────────────────
function esc(s: string) { return String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string)) }
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ marginBottom: 8 }}><label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>{label}</label>{children}</div>
}
function SecTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>{children}</div>
}
function Empty({ texto }: { texto: string }) {
  return <div style={{ textAlign: 'center', padding: 32, color: 'var(--muted)', fontSize: 13, background: 'var(--card)', borderRadius: 10, border: '1px dashed var(--border)', marginTop: 14 }}>{texto}</div>
}

// ── Estilos ──────────────────────────────────────────────────
const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }
const card: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 14 }
const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }
const grid3: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }
const grid4: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }
const btnPrimary: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 8, border: 'none', background: 'var(--bordo)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const btnGhost: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const iconBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', cursor: 'pointer' }
const chip: React.CSSProperties = { padding: '5px 10px', borderRadius: 16, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12, cursor: 'pointer' }
