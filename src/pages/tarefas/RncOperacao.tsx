import { useState, useEffect, useMemo } from 'react'
import type { CSSProperties } from 'react'
import { supabase } from '../../lib/supabase'
import { uploadAnexo } from '../../lib/db'
import { siteOrigin } from '../../lib/site'

// RNC de OPERAÇÃO (desvios gerados no restaurante) — mesmo cadastro (tabela rnc) da RNC de Recebimento,
// com origem='operacao', categorias/ocorrências da operação, gravidade → prazo, evidências e envio ao responsável.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any

export const CATEGORIAS_OP: { nome: string; emoji: string; itens: string[] }[] = [
  { nome: 'Abertura e fechamento da loja', emoji: '🔑', itens: ['Checklist de abertura incompleto', 'Loja aberta fora do horário', 'Equipamentos não ligados ou testados', 'Falha no fechamento de caixa', 'Equipamentos deixados ligados', 'Falha no desligamento de gás, energia ou equipamentos', 'Ausência de conferência de portas e segurança'] },
  { nome: 'Salão e atendimento', emoji: '🍽️', itens: ['Falha no padrão de atendimento', 'Demora na recepção ou entrega dos pedidos', 'Pedido lançado incorretamente', 'Falta de acompanhamento da mesa', 'Reclamação não tratada', 'Apresentação pessoal fora do padrão', 'Falha na comunicação entre salão e cozinha'] },
  { nome: 'Cozinha e produção', emoji: '👨‍🍳', itens: ['Prato fora do padrão de ficha técnica', 'Erro de montagem ou apresentação', 'Porcionamento incorreto', 'Desperdício de insumos', 'Produto vencido ou armazenado incorretamente', 'Falha de temperatura', 'Atraso na produção', 'Contaminação cruzada ou risco sanitário'] },
  { nome: 'Estrutura e manutenção', emoji: '🛠️', itens: ['Equipamento danificado', 'Falha elétrica ou hidráulica', 'Problemas em coifa e exaustão', 'Ar-condicionado sem funcionamento', 'Mobiliário danificado', 'Iluminação inadequada', 'Infiltração, vazamento ou risco estrutural'] },
  { nome: 'Estoque, recebimento e compras', emoji: '📦', itens: ['Recebimento fora do padrão', 'Divergência entre pedido e nota fiscal', 'Quantidade recebida incorreta', 'Produto avariado', 'Falha de armazenamento', 'Ausência de identificação ou validade', 'Requisição de compras fora do procedimento', 'Transferência de mercadoria sem autorização'] },
  { nome: 'Limpeza e segurança alimentar', emoji: '🧼', itens: ['Falha na higienização', 'Ausência de registro de limpeza', 'Lixeiras fora do padrão', 'Pragas ou indícios de infestação', 'Manipulação inadequada', 'Falta de EPIs', 'Falha no controle de temperatura'] },
  { nome: 'Caixa e controles administrativos', emoji: '💰', itens: ['Divergência de caixa', 'Sangria sem registro', 'Cancelamento indevido de venda', 'Crédito ou desconto sem autorização', 'Falha no fechamento financeiro', 'Ausência de documentação obrigatória'] },
  { nome: 'Gestão e comportamento operacional', emoji: '🧭', itens: ['Descumprimento de orientação gerencial', 'Falha de comunicação', 'Ausência de treinamento', 'Não execução de tarefas atribuídas', 'Falta de acompanhamento da equipe', 'Reincidência de desvios já comunicados'] },
]
export const GRAV_OP = [
  { id: 'baixa', label: 'Baixa', emoji: '🟢', cor: '#16a34a', prazo: 'Até 7 dias', dias: 7, desc: 'desvio pontual, sem impacto relevante' },
  { id: 'media', label: 'Média', emoji: '🟡', cor: '#ca8a04', prazo: 'Até 48 horas', dias: 2, desc: 'compromete o processo ou padrão operacional' },
  { id: 'alta', label: 'Alta', emoji: '🟠', cor: '#ea580c', prazo: 'Até 24 horas', dias: 1, desc: 'impacto na operação, cliente ou resultado' },
  { id: 'critica', label: 'Crítica', emoji: '🔴', cor: '#dc2626', prazo: 'Imediato', dias: 0, desc: 'risco à segurança, saúde ou continuidade da operação' },
]
const SETORES_OP = ['Operação', 'Salão', 'Cozinha', 'Produção', 'Caixa', 'Estoque', 'Compras', 'Manutenção', 'Limpeza', 'Atendimento', 'Gerência', 'Administrativo', 'Financeiro']

const inp: CSSProperties = { width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 14, boxSizing: 'border-box' }
const lbl: CSSProperties = { fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 3 }
const sec = (t: string) => <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--bordo)', margin: '16px 0 8px', borderBottom: '1px solid var(--border)', paddingBottom: 4 }}>{t}</div>
const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
const prazoPorGravidade = (g: string) => { const d = new Date(); d.setDate(d.getDate() + (GRAV_OP.find(x => x.id === g)?.dias ?? 2)); return iso(d) }
const fmtD = (s: string) => s ? s.slice(0, 10).split('-').reverse().join('/') : '—'
const sleepMs = (ms: number) => new Promise(r => setTimeout(r, ms))

type Evid = { file: File; tipo: string; descricao: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function NovaRncOperacao({ profiles, lojas, lojaAtual, userName, notificar, onClose, onSaved }: any) {
  const lojasOk: string[] = (lojas || []).filter((l: string) => l && l !== 'Todas as Lojas')
  const [loja, setLoja] = useState<string>(lojaAtual && lojaAtual !== 'Todas as Lojas' ? lojaAtual : (lojasOk[0] || ''))
  const [categoria, setCategoria] = useState(CATEGORIAS_OP[0].nome)
  const [ocorr, setOcorr] = useState<string[]>([])
  const [setor, setSetor] = useState('Operação')
  const [gravidade, setGravidade] = useState('media')
  const [titulo, setTitulo] = useState('')
  const [desc, setDesc] = useState('')
  const [contencao, setContencao] = useState('')
  const [responsavel, setResponsavel] = useState('')
  const [validador, setValidador] = useState(userName || '')
  const [prazo, setPrazo] = useState(prazoPorGravidade('media'))
  const [prazoManual, setPrazoManual] = useState(false)
  const [acao, setAcao] = useState('')
  const [reinc, setReinc] = useState('')
  const [anteriores, setAnteriores] = useState<{ id: string; numero: string; titulo: string | null; desvio_txt: string | null }[]>([])
  const [evid, setEvid] = useState<Evid[]>([])
  const [evTipo, setEvTipo] = useState('Foto do problema')
  const [salvando, setSalvando] = useState(false)
  const [erros, setErros] = useState<string[]>([])

  useEffect(() => { const prev = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = prev } }, [])
  useEffect(() => { if (!prazoManual) setPrazo(prazoPorGravidade(gravidade)) }, [gravidade, prazoManual])
  // RNCs anteriores da mesma loja+categoria (90 dias) para vincular como reincidência
  useEffect(() => {
    const ini = new Date(Date.now() - 90 * 86400000).toISOString()
    sb.from('rnc').select('id,numero,titulo,desvio_txt').eq('loja', loja).eq('categoria', categoria).gte('created_at', ini).order('seq', { ascending: false }).limit(20)
      .then((r: { data: typeof anteriores | null }) => setAnteriores(r.data || []))
  }, [loja, categoria])

  const cat = useMemo(() => CATEGORIAS_OP.find(c => c.nome === categoria) || CATEGORIAS_OP[0], [categoria])
  const usuarios = useMemo(() => (profiles || []).filter((p: { name?: string }) => (p.name || '').trim()).map((p: { name: string; permissions_override?: unknown }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const perfil = (p.permissions_override as any)?.__perfil__ || {}
    return { nome: p.name.trim(), setor: String(perfil.setor || '').trim(), fone: !!String(perfil.whatsapp || '').replace(/\D/g, '') }
  }).sort((a: { setor: string; nome: string }, b: { setor: string; nome: string }) => {
    const ra = Number(!!setor && a.setor.toLowerCase() === setor.toLowerCase()), rb = Number(!!setor && b.setor.toLowerCase() === setor.toLowerCase())
    return (rb - ra) || a.nome.localeCompare(b.nome)
  }), [profiles, setor])

  const toggleOcorr = (t: string) => setOcorr(o => o.includes(t) ? o.filter(x => x !== t) : [...o, t])
  const addFiles = (files: FileList | null) => {
    if (!files) return
    const novos: Evid[] = [...files].map(f => ({ file: f, tipo: f.type.startsWith('video') ? 'Vídeo' : f.type.startsWith('image') ? evTipo : 'Documento', descricao: '' }))
    setEvid(a => [...a, ...novos])
  }

  const salvar = async () => {
    const faltas: string[] = []
    if (!loja) faltas.push('Loja')
    if (!titulo.trim()) faltas.push('Título da RNC')
    if (!desc.trim()) faltas.push('Descrição do desvio')
    if (!responsavel) faltas.push('Responsável pelo tratamento')
    if (!prazo) faltas.push('Prazo para resolução')
    if (gravidade === 'critica' && !contencao.trim()) faltas.push('Ação imediata / contenção (obrigatória em ocorrência crítica)')
    setErros(faltas)
    if (faltas.length) return
    setSalvando(true)
    try {
      const nomeResp = responsavel
      const { data: nova, error } = await sb.from('rnc').insert({
        origem: 'operacao', loja, setor, categoria, tipos: ['Operação', ...ocorr, ...(reinc ? ['Reincidência'] : [])], gravidade, status: 'aberta',
        titulo: titulo.trim(), desvio_txt: desc.trim(), tratativa_obs: contencao.trim() || null, acao_imediata: contencao.trim() || null,
        acao_corretiva: acao.trim() || null, responsavel: nomeResp, responsavel_area: setor, prazo, aberto_por: userName, validador: validador || null,
        reincidente_de: reinc || null, produto: null,
      }).select('id, numero').single()
      if (error || !nova) { setErros(['Falha ao gravar a RNC: ' + (error?.message || 'sem resposta do servidor')]); setSalvando(false); return }
      const log = (acao_: string, detalhe: string) => sb.from('rnc_historico').insert({ rnc_id: nova.id, acao: acao_, detalhe, usuario: userName })
      const g = GRAV_OP.find(x => x.id === gravidade)!
      await log('RNC de operação aberta', `${categoria} · ${setor} · ${loja} · gravidade ${g.label} (${g.prazo}) · ${titulo.trim()}`)
      await log('Responsável designado', `${nomeResp} · prazo ${fmtD(prazo)}${validador ? ' · validação: ' + validador : ''}`)
      if (reinc) { const a = anteriores.find(x => x.id === reinc); await log('Marcada como reincidência', `Vinculada à ${a?.numero || 'RNC anterior'}`) }
      for (const ev of evid) {
        try {
          const url = await uploadAnexo(ev.file, 'rnc')
          await sb.from('rnc_evidencias').insert({ rnc_id: nova.id, tipo: ev.tipo, arquivo_url: url, descricao: ev.descricao || null, usuario: userName })
          await log('Evidência anexada', `${ev.tipo}${ev.descricao ? ' — ' + ev.descricao : ''}`)
        } catch (e) { console.error(e) }
      }
      // Envio ao responsável pelo tratamento (WhatsApp) com link da RNC; validador/gestão recebe cópia
      const link = `${siteOrigin()}/?page=tarefas&rnc=${nova.id}`
      const corpo = `${nova.numero} · ${loja}\n${cat.emoji} ${categoria} · setor ${setor}\n${g.emoji} Gravidade ${g.label} — prazo ${g.dias === 0 ? 'IMEDIATO' : fmtD(prazo)}\n📌 ${titulo.trim()}\n${desc.trim().slice(0, 300)}${acao.trim() ? `\n🔧 Ação solicitada: ${acao.trim().slice(0, 200)}` : ''}${contencao.trim() ? `\n⚡ Contenção: ${contencao.trim().slice(0, 200)}` : ''}\nAberta por: ${userName}`
      const ok1 = await notificar(nomeResp, `${g.id === 'critica' ? '🚨' : '🔴'} *Nova RNC de operação direcionada a você*\n\n${corpo}\n\n${link}\n_Amore Gestão_`, `RNC ${nova.numero}`, nova.id)
      await log('Disparo WhatsApp', ok1 ? `Aviso enviado a ${nomeResp}` : `Não foi possível avisar ${nomeResp} (sem WhatsApp cadastrado?)`)
      if (validador && validador !== nomeResp && validador !== userName) {
        await sleepMs(2500 + Math.random() * 3000)
        await notificar(validador, `📣 *RNC de operação — você valida o encerramento*\n\nResponsável: ${nomeResp}\n${corpo}\n\n${link}\n_Amore Gestão_`, `RNC ${nova.numero}`, nova.id)
      }
      onSaved(nova.id, ok1, nomeResp)
    } catch (e) { setErros(['Erro: ' + ((e as Error).message || 'tente novamente')]) }
    setSalvando(false)
  }

  const gSel = GRAV_OP.find(x => x.id === gravidade)!
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 10 }}>
      <div style={{ background: 'var(--card)', color: 'var(--text)', borderRadius: 14, padding: 18, width: '100%', maxWidth: 800, maxHeight: '95vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--bordo)', letterSpacing: '.08em' }}>CENTRAL DE TAREFAS · AMORE FOOD</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>🚩 RNC de Operação — nova ocorrência</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Desvios na operação do restaurante. Corretivo e preventivo — não é punição ao colaborador.</div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--muted)' }}>×</button>
        </div>

        {erros.length > 0 && <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: 8, padding: '8px 12px', marginTop: 10, fontSize: 13 }}>
          <b>Falta preencher:</b><ul style={{ margin: '4px 0 0 18px', padding: 0 }}>{erros.map(e => <li key={e}>{e}</li>)}</ul></div>}

        {sec('1. Identificação')}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
          <div><label style={lbl}>Loja *</label><select style={inp} value={loja} onChange={e => setLoja(e.target.value)}>{lojasOk.map((l: string) => <option key={l}>{l}</option>)}</select></div>
          <div><label style={lbl}>Setor envolvido</label><select style={inp} value={setor} onChange={e => setSetor(e.target.value)}>{SETORES_OP.map(s => <option key={s}>{s}</option>)}</select></div>
        </div>
        <div style={{ marginTop: 10 }}>
          <label style={lbl}>Categoria da ocorrência</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {CATEGORIAS_OP.map(c => (
              <button key={c.nome} type="button" onClick={() => { setCategoria(c.nome); setOcorr([]); setReinc('') }} style={{ padding: '7px 11px', borderRadius: 20, fontSize: 12.5, cursor: 'pointer', border: '1px solid var(--bordo)', background: categoria === c.nome ? 'var(--bordo)' : 'transparent', color: categoria === c.nome ? '#fff' : 'var(--bordo)', fontWeight: 600 }}>{c.emoji} {c.nome}</button>
            ))}
          </div>
          <label style={{ ...lbl, marginTop: 10 }}>Ocorrências comuns nesta categoria (marque o que se aplica)</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 4 }}>
            {cat.itens.map(t => (
              <label key={t} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', fontSize: 13, cursor: 'pointer' }}><input type="checkbox" checked={ocorr.includes(t)} onChange={() => toggleOcorr(t)} style={{ marginTop: 3 }} />{t}</label>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={lbl}>Gravidade</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8 }}>
            {GRAV_OP.map(g => (
              <button key={g.id} type="button" onClick={() => setGravidade(g.id)} style={{ textAlign: 'left', padding: '8px 10px', borderRadius: 10, cursor: 'pointer', border: `2px solid ${gravidade === g.id ? g.cor : 'var(--border)'}`, background: gravidade === g.id ? g.cor + '18' : 'var(--bg)', color: 'var(--text)' }}>
                <div style={{ fontWeight: 800, color: g.cor, fontSize: 13 }}>{g.emoji} {g.label} · {g.prazo}</div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{g.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {sec('2. Descrição da ocorrência')}
        <div><label style={lbl}>Título da RNC *</label><input style={inp} value={titulo} onChange={e => setTitulo(e.target.value)} placeholder={ocorr[0] || 'Ex.: Coifa desligada durante o serviço'} /></div>
        <div style={{ marginTop: 8 }}><label style={lbl}>Descreva o desvio identificado *</label><textarea style={{ ...inp, minHeight: 90, resize: 'vertical' }} value={desc} onChange={e => setDesc(e.target.value)} placeholder="O que aconteceu, onde, quando, quem viu e qual o impacto. Seja objetivo." /></div>
        <div style={{ marginTop: 8 }}><label style={lbl}>Ação imediata / contenção {gravidade === 'critica' ? '*' : '(se já tomada)'}</label><textarea style={{ ...inp, minHeight: 56, resize: 'vertical' }} value={contencao} onChange={e => setContencao(e.target.value)} placeholder="O que foi feito na hora para conter o problema" /></div>

        {sec('3. Tratamento')}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          <div><label style={lbl}>Responsável pelo tratamento * (recebe no WhatsApp)</label>
            <select style={inp} value={responsavel} onChange={e => setResponsavel(e.target.value)}><option value="">Selecione…</option>
              {usuarios.map((u: { nome: string; setor: string; fone: boolean }) => <option key={u.nome} value={u.nome}>{u.nome}{u.setor ? ' · ' + u.setor : ''}{u.fone ? '' : ' (sem WhatsApp)'}</option>)}</select></div>
          <div><label style={lbl}>Prazo para resolução * ({gSel.prazo})</label>
            <input type="date" style={inp} value={prazo} onChange={e => { setPrazo(e.target.value); setPrazoManual(true) }} /></div>
          <div><label style={lbl}>Quem valida o encerramento</label>
            <select style={inp} value={validador} onChange={e => setValidador(e.target.value)}><option value="">Quem abriu a RNC</option>
              {usuarios.map((u: { nome: string }) => <option key={u.nome} value={u.nome}>{u.nome}</option>)}</select></div>
        </div>
        <div style={{ marginTop: 8 }}><label style={lbl}>Ação corretiva solicitada</label><textarea style={{ ...inp, minHeight: 56, resize: 'vertical' }} value={acao} onChange={e => setAcao(e.target.value)} placeholder="O que o responsável precisa fazer para corrigir" /></div>
        {anteriores.length > 0 && (
          <div style={{ marginTop: 8 }}><label style={lbl}>Já aconteceu antes? Vincular a RNC anterior (reincidência)</label>
            <select style={inp} value={reinc} onChange={e => setReinc(e.target.value)}><option value="">Não é reincidência</option>
              {anteriores.map(a => <option key={a.id} value={a.id}>{a.numero} — {(a.titulo || a.desvio_txt || '').slice(0, 70)}</option>)}</select></div>
        )}

        {sec('4. Evidências (fotos, vídeos e documentos)')}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select style={{ ...inp, width: 'auto' }} value={evTipo} onChange={e => setEvTipo(e.target.value)}>{['Foto do problema', 'Foto da contenção', 'Documento', 'Nota Fiscal'].map(t => <option key={t}>{t}</option>)}</select>
          <label style={{ padding: '9px 14px', borderRadius: 8, border: '1px dashed var(--bordo)', color: 'var(--bordo)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>📷 Tirar foto / anexar arquivos
            <input type="file" accept="image/*,video/*,application/pdf" multiple capture="environment" style={{ display: 'none' }} onChange={e => { addFiles(e.target.files); e.target.value = '' }} /></label>
        </div>
        {evid.map((e, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, fontSize: 12.5 }}>
            <span style={{ flex: 1 }}>📎 {e.tipo} · {e.file.name.slice(0, 32)}</span>
            <input style={{ ...inp, width: 170 }} placeholder="Descrição (opcional)" value={e.descricao} onChange={ev => setEvid(a => a.map((x, k) => k === i ? { ...x, descricao: ev.target.value } : x))} />
            <button onClick={() => setEvid(a => a.filter((_, k) => k !== i))} style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer' }}>remover</button>
          </div>
        ))}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <button onClick={onClose} style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', cursor: 'pointer' }}>Cancelar</button>
          <button onClick={salvar} disabled={salvando} style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: 'var(--bordo)', color: '#fff', fontWeight: 700, cursor: salvando ? 'wait' : 'pointer' }}>{salvando ? 'Registrando…' : '🚩 Abrir RNC e avisar o responsável'}</button>
        </div>
      </div>
    </div>
  )
}
