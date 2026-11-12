import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bot, RefreshCw, ShieldCheck, MessageSquare, ListChecks, Users, Settings2, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { fetchAppConfig, saveAppConfig, fetchProfiles } from '../../lib/db'
import { useToast } from '../../hooks/useToast'
import { useAuth } from '../../contexts/AuthContext'

// CENTRAL DE COMANDO — AMORE IA (WhatsApp). Etapa 0: estrutura, auditoria e cadastro de números autorizados.
// Só LÊ ia_conversas / ia_comandos (gravados pelo serviço da Amore IA, que ainda será ligado) e
// guarda a configuração em app_config 'amore_ia_config'. Nada aqui envia mensagem nem executa comando.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any
const CFG_KEY = 'amore_ia_config'

const card: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }
const inp: React.CSSProperties = { padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, boxSizing: 'border-box', width: '100%' }
const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 3 }
const grid = (min: number): React.CSSProperties => ({ display: 'grid', gridTemplateColumns: `repeat(auto-fit,minmax(${min}px,1fr))`, gap: 10 })
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: 11, color: 'var(--muted)', fontWeight: 700, borderBottom: '1px solid var(--border)' }
const td: React.CSSProperties = { padding: '7px 10px', fontSize: 12.5, borderBottom: '1px solid var(--border)', verticalAlign: 'top' }
const btn = (bg = 'var(--bordo)', off = false): React.CSSProperties => ({ padding: '8px 14px', borderRadius: 8, border: 'none', background: off ? 'var(--border)' : bg, color: '#fff', cursor: off ? 'not-allowed' : 'pointer', fontSize: 12.5, fontWeight: 600 })

export const MODULOS_IA: { id: string; label: string }[] = [
  { id: 'compras', label: 'Compras' }, { id: 'inteligencia-compras', label: 'Inteligência de compras' }, { id: 'estoque', label: 'Estoque' },
  { id: 'prestacao-contas', label: 'Prestação de contas' }, { id: 'recebimento', label: 'Recebimento' }, { id: 'tarefas', label: 'Central de tarefas' },
  { id: 'rnc', label: 'RNC' }, { id: 'financeiro', label: 'Financeiro' }, { id: 'relatorios', label: 'Relatórios' }, { id: 'operacao', label: 'Operação' }, { id: 'gestao', label: 'Gestão' },
]
const LOJAS = ['Amore Paiva', 'Amore CD', 'Flow CD']

type Numero = { nome: string; fone: string; lojas: string[]; modulos: string[]; escrita: boolean }
type Cfg = { ativo: boolean; numeros: Numero[]; checklist: Record<string, boolean> }
const CFG0: Cfg = { ativo: false, numeros: [], checklist: {} }

// Pré-requisitos da integração (marcados manualmente por quem configurar cada etapa)
const CHECK: { id: string; txt: string; quem: string }[] = [
  { id: 'meta_conta', txt: 'Conta Meta Business criada e verificada', quem: 'Esdras' },
  { id: 'numero', txt: 'Número NOVO e dedicado cadastrado na API oficial do WhatsApp (não pode estar no WhatsApp comum)', quem: 'Esdras' },
  { id: 'token', txt: 'Token permanente e ID do número gerados (guardados só no servidor)', quem: 'Esdras + dev' },
  { id: 'webhook', txt: 'Webhook do serviço Amore IA registrado na Meta (com verificação de assinatura)', quem: 'Dev' },
  { id: 'service_key', txt: 'Chave de serviço do Supabase guardada somente no VPS (nunca no navegador)', quem: 'Esdras' },
  { id: 'usuarios', txt: 'Números autorizados cadastrados na aba "Usuários autorizados"', quem: 'Esdras' },
  { id: 'servico', txt: 'Serviço Amore IA publicado no VPS (Etapa 1)', quem: 'Dev' },
]

const STATUS_COR: Record<string, string> = { recebido: '#6B7280', executado: '#16A34A', aguardando_confirmacao: '#CA8A04', confirmado: '#2563EB', cancelado: '#6B7280', negado: '#DC2626', erro: '#DC2626' }
const STATUS_TXT: Record<string, string> = { recebido: 'Recebido', executado: 'Executado', aguardando_confirmacao: 'Aguardando confirmação', confirmado: 'Confirmado', cancelado: 'Cancelado', negado: 'Negado', erro: 'Erro' }
const Badge = ({ s }: { s: string }) => <span style={{ background: (STATUS_COR[s] || '#6B7280') + '22', color: STATUS_COR[s] || '#6B7280', border: `1px solid ${(STATUS_COR[s] || '#6B7280')}55`, borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{STATUS_TXT[s] || s}</span>
const fmtDH = (s?: string | null) => s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'
const mascara = (f: string) => { const d = String(f || '').replace(/\D/g, ''); return d.length >= 8 ? d.slice(0, 4) + '•••••' + d.slice(-3) : d }
const soDig = (v: string) => String(v || '').replace(/\D/g, '')
const normFone = (v: string) => { const d = soDig(v).replace(/^0+/, ''); return d.startsWith('55') && d.length >= 12 ? d : (d.length === 10 || d.length === 11) ? '55' + d : d }

type Aba = 'visao' | 'conversas' | 'comandos' | 'usuarios' | 'config'
const ABAS: [Aba, string, React.ReactNode][] = [
  ['visao', 'Visão geral', <ShieldCheck size={14} key="a" />], ['conversas', 'Conversas', <MessageSquare size={14} key="b" />],
  ['comandos', 'Comandos', <ListChecks size={14} key="c" />], ['usuarios', 'Usuários autorizados', <Users size={14} key="d" />], ['config', 'Configuração', <Settings2 size={14} key="e" />],
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function CentralComandoPage() {
  const { toast } = useToast()
  const { isOwner } = useAuth()
  const [aba, setAba] = useState<Aba>('visao')
  const [cfg, setCfg] = useState<Cfg>(CFG0)
  const [conv, setConv] = useState<any[]>([])
  const [cmds, setCmds] = useState<any[]>([])
  const [profiles, setProfiles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [fStatus, setFStatus] = useState('')
  const [fFone, setFFone] = useState('')

  const carregar = useCallback(async () => {
    setLoading(true)
    const desde = new Date(Date.now() - 30 * 86400000).toISOString()
    const [c, m, p, conf] = await Promise.all([
      sb.from('ia_conversas').select('*').gte('created_at', desde).order('created_at', { ascending: false }).limit(300),
      sb.from('ia_comandos').select('*').gte('created_at', desde).order('created_at', { ascending: false }).limit(300),
      fetchProfiles().catch(() => []),
      fetchAppConfig<Cfg>(CFG_KEY).catch(() => null),
    ])
    setConv(c.data || []); setCmds(m.data || []); setProfiles(p || [])
    setCfg({ ...CFG0, ...(conf || {}), numeros: (conf?.numeros || []), checklist: (conf?.checklist || {}) })
    setLoading(false)
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const salvarCfg = async (novo: Cfg, msg = 'Configuração salva ✅') => {
    setSalvando(true)
    try { await saveAppConfig(CFG_KEY, novo); setCfg(novo); toast(msg) }
    catch (e) { toast('Não foi possível salvar: ' + ((e as Error).message || 'erro'), 'error') }
    setSalvando(false)
  }

  const k = useMemo(() => {
    const hoje = new Date().toISOString().slice(0, 10)
    const por = (s: string) => cmds.filter(c => c.status === s).length
    const usoPorUsuario: Record<string, number> = {}
    for (const c of cmds) usoPorUsuario[c.usuario_nome || mascara(c.fone)] = (usoPorUsuario[c.usuario_nome || mascara(c.fone)] || 0) + 1
    return {
      msgsHoje: conv.filter(c => String(c.created_at).slice(0, 10) === hoje && c.direcao === 'entrada').length,
      cmds30: cmds.length, aguardando: por('aguardando_confirmacao'), erros: por('erro') + por('negado'), exec: por('executado'),
      uso: Object.entries(usoPorUsuario).sort((a, b) => b[1] - a[1]).slice(0, 6),
    }
  }, [conv, cmds])

  const perfisComFone = useMemo(() => profiles.filter(p => (p.name || '').trim() && soDig(p?.permissions_override?.__perfil__?.whatsapp)).sort((a, b) => a.name.localeCompare(b.name)), [profiles])

  if (!isOwner) return <div style={{ ...card, margin: 16 }}>Acesso restrito aos administradores do painel.</div>

  const feitos = CHECK.filter(c => cfg.checklist[c.id]).length
  const cmdsFiltrados = cmds.filter(c => (!fStatus || c.status === fStatus) && (!fFone || String(c.fone).includes(soDig(fFone))))
  const convFiltradas = conv.filter(c => !fFone || String(c.fone).includes(soDig(fFone)))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '4px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 19, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}><Bot size={22} /> Central de Comando — Amore IA</div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Tudo que for pedido à Amore IA pelo WhatsApp fica registrado aqui: conversas, comandos, confirmações e erros.</div>
        </div>
        <button onClick={carregar} style={{ ...btn('var(--bordo)', loading), display: 'flex', alignItems: 'center', gap: 6 }} disabled={loading}><RefreshCw size={14} /> Atualizar</button>
      </div>

      <div style={{ ...card, borderLeft: `4px solid ${cfg.ativo ? '#16A34A' : '#CA8A04'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <b>{cfg.ativo ? '🟢 Amore IA ligada' : '🟡 Amore IA desligada (em preparação — Etapa 0)'}</b>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>O serviço do WhatsApp ainda não foi ligado: esta tela apenas prepara a estrutura e o cadastro. {feitos}/{CHECK.length} pré-requisitos concluídos.</div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
          <input type="checkbox" checked={cfg.ativo} disabled={salvando} onChange={e => {
            if (e.target.checked && feitos < CHECK.length && !confirm('Ainda há pré-requisitos pendentes. Marcar como ligada só deixa a chave pronta — o serviço do WhatsApp só responde quando for publicado. Continuar?')) return
            salvarCfg({ ...cfg, ativo: e.target.checked }, e.target.checked ? 'Chave geral ligada' : 'Chave geral desligada')
          }} /> Chave geral
        </label>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {ABAS.map(([id, nome, ic]) => (
          <button key={id} onClick={() => setAba(id)} style={{ padding: '7px 14px', borderRadius: 20, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', border: '1px solid var(--bordo)', background: aba === id ? 'var(--bordo)' : 'transparent', color: aba === id ? '#fff' : 'var(--bordo)', display: 'flex', alignItems: 'center', gap: 6 }}>{ic} {nome}</button>
        ))}
      </div>

      {aba === 'visao' && (
        <>
          <div style={grid(170)}>
            {[['Mensagens recebidas hoje', k.msgsHoje, '#2563EB'], ['Comandos (30 dias)', k.cmds30, 'var(--bordo)'], ['Executados', k.exec, '#16A34A'], ['Aguardando confirmação', k.aguardando, '#CA8A04'], ['Erros / negados', k.erros, '#DC2626'], ['Números autorizados', cfg.numeros.length, '#7C3AED']].map(([t, v, c]) => (
              <div key={String(t)} style={{ ...card, borderLeft: `4px solid ${c}` }}><div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{t}</div><div style={{ fontSize: 26, fontWeight: 800, color: String(c) }}>{v}</div></div>
            ))}
          </div>
          <div style={grid(320)}>
            <div style={card}>
              <b style={{ fontSize: 13 }}>Pré-requisitos da integração</b>
              {CHECK.map(c => (
                <label key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, padding: '5px 0', borderTop: '1px solid var(--border)', cursor: 'pointer' }}>
                  <input type="checkbox" style={{ marginTop: 2 }} checked={!!cfg.checklist[c.id]} disabled={salvando} onChange={e => salvarCfg({ ...cfg, checklist: { ...cfg.checklist, [c.id]: e.target.checked } }, 'Pré-requisito atualizado')} />
                  <span style={{ flex: 1 }}>{c.txt}</span><span style={{ color: 'var(--muted)', fontSize: 11 }}>{c.quem}</span>
                </label>
              ))}
            </div>
            <div style={card}>
              <b style={{ fontSize: 13 }}>Uso por pessoa (30 dias)</b>
              {k.uso.length === 0 ? <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 8 }}>Ainda sem comandos registrados.</div> : k.uso.map(([n, q]) => (
                <div key={n} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '5px 0', borderTop: '1px solid var(--border)' }}><span>{n}</span><b>{q}</b></div>
              ))}
            </div>
          </div>
        </>
      )}

      {aba === 'conversas' && (
        <div style={card}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}><input style={{ ...inp, maxWidth: 240 }} placeholder="Filtrar por telefone" value={fFone} onChange={e => setFFone(e.target.value)} /><span style={{ fontSize: 12, color: 'var(--muted)' }}>{convFiltradas.length} mensagem(ns) nos últimos 30 dias</span></div>
          {convFiltradas.length === 0 ? <div style={{ padding: 18, color: 'var(--muted)', fontSize: 13 }}>Nenhuma conversa registrada ainda. As mensagens aparecem aqui quando o serviço da Amore IA for ligado.</div> : (
            <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{['Quando', 'Pessoa', 'Sentido', 'Tipo', 'Conteúdo'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>{convFiltradas.map(c => <tr key={c.id}><td style={td}>{fmtDH(c.created_at)}</td><td style={td}>{c.usuario_nome || mascara(c.fone)}</td><td style={td}>{c.direcao === 'entrada' ? '⬇️ recebida' : '⬆️ enviada'}</td><td style={td}>{c.tipo}</td><td style={{ ...td, maxWidth: 420 }}>{String(c.transcricao || c.conteudo || '').slice(0, 220)}</td></tr>)}</tbody></table></div>
          )}
        </div>
      )}

      {aba === 'comandos' && (
        <div style={card}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select style={{ ...inp, maxWidth: 220 }} value={fStatus} onChange={e => setFStatus(e.target.value)}><option value="">Todos os status</option>{Object.entries(STATUS_TXT).map(([id, t]) => <option key={id} value={id}>{t}</option>)}</select>
            <input style={{ ...inp, maxWidth: 220 }} placeholder="Filtrar por telefone" value={fFone} onChange={e => setFFone(e.target.value)} />
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{cmdsFiltrados.length} comando(s)</span>
          </div>
          {cmdsFiltrados.length === 0 ? <div style={{ padding: 18, color: 'var(--muted)', fontSize: 13 }}>Nenhum comando registrado ainda.</div> : (
            <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{['Protocolo', 'Quando', 'Pessoa', 'Módulo', 'Intenção', 'Nível', 'Status', 'Resultado / erro'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>{cmdsFiltrados.map(c => <tr key={c.id}><td style={td}><b>{c.protocolo}</b></td><td style={td}>{fmtDH(c.created_at)}</td><td style={td}>{c.usuario_nome || mascara(c.fone)}</td><td style={td}>{c.modulo || '—'}</td><td style={td}>{c.intencao || '—'}</td><td style={td}>{c.nivel}</td><td style={td}><Badge s={c.status} /></td><td style={{ ...td, maxWidth: 340 }}>{String(c.erro || c.resposta_resumo || '').slice(0, 200)}</td></tr>)}</tbody></table></div>
          )}
        </div>
      )}

      {aba === 'usuarios' && <UsuariosAutorizados cfg={cfg} perfis={perfisComFone} salvando={salvando} onSave={salvarCfg} />}

      {aba === 'config' && (
        <div style={{ ...card, fontSize: 13, lineHeight: 1.6 }}>
          <b>Como a Amore IA vai funcionar</b>
          <ol style={{ margin: '8px 0 0 18px', padding: 0 }}>
            <li>A pessoa manda texto ou áudio para o número oficial da Amore IA (API oficial do WhatsApp Business).</li>
            <li>O serviço identifica quem é pelo telefone e só continua se o número estiver na aba <b>Usuários autorizados</b>.</li>
            <li>O áudio é transcrito, a IA entende o pedido e escolhe uma <b>função autorizada</b> (a IA nunca acessa o banco diretamente).</li>
            <li>Consultas rodam direto; criar/alterar exige confirmação por botão no WhatsApp; pagamentos, transferências, exclusões e aprovações exigem confirmação e permissão.</li>
            <li>Cada mensagem e comando fica registrado aqui (protocolo IA-000001…), com resultado ou erro.</li>
          </ol>
          <div style={{ marginTop: 10, color: 'var(--muted)', fontSize: 12 }}>Etapas: 0 · estrutura e cadastro (esta tela) → 1 · assistente (texto e áudio) → 2 · consultas e relatórios → 3 · criar tarefas/RNC com confirmação → 4 · alertas proativos.</div>
        </div>
      )}
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function UsuariosAutorizados({ cfg, perfis, salvando, onSave }: { cfg: Cfg; perfis: any[]; salvando: boolean; onSave: (c: Cfg, m?: string) => void }) {
  const [sel, setSel] = useState('')
  const [lojas, setLojas] = useState<string[]>(LOJAS)
  const [modulos, setModulos] = useState<string[]>(['tarefas', 'compras', 'relatorios'])
  const [escrita, setEscrita] = useState(false)
  const tog = (arr: string[], v: string) => arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]

  const adicionar = () => {
    const p = perfis.find(x => x.id === sel); if (!p) return
    const fone = normFone(p.permissions_override.__perfil__.whatsapp)
    if (cfg.numeros.some(n => normFone(n.fone) === fone)) { alert('Esse número já está autorizado.'); return }
    if (!lojas.length || !modulos.length) { alert('Escolha ao menos uma loja e um módulo.'); return }
    onSave({ ...cfg, numeros: [...cfg.numeros, { nome: p.name.trim(), fone, lojas, modulos, escrita }] }, `${p.name.trim()} autorizado(a)`)
    setSel('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={card}>
        <b style={{ fontSize: 13 }}>Autorizar um número</b>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>Só aparecem usuários do painel que já têm WhatsApp no cadastro. A IA nunca dá mais acesso do que o perfil da pessoa já tem no painel.</div>
        <div style={grid(220)}>
          <div><label style={lbl}>Usuário</label><select style={inp} value={sel} onChange={e => setSel(e.target.value)}><option value="">Selecione…</option>{perfis.map(p => <option key={p.id} value={p.id}>{p.name} · {mascara(p.permissions_override.__perfil__.whatsapp)}</option>)}</select></div>
        </div>
        <div style={{ marginTop: 8 }}><label style={lbl}>Lojas liberadas</label><div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{LOJAS.map(l => <label key={l} style={{ fontSize: 12.5, display: 'flex', gap: 5, alignItems: 'center' }}><input type="checkbox" checked={lojas.includes(l)} onChange={() => setLojas(tog(lojas, l))} />{l}</label>)}</div></div>
        <div style={{ marginTop: 8 }}><label style={lbl}>Módulos liberados</label><div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{MODULOS_IA.map(m => <label key={m.id} style={{ fontSize: 12.5, display: 'flex', gap: 5, alignItems: 'center' }}><input type="checkbox" checked={modulos.includes(m.id)} onChange={() => setModulos(tog(modulos, m.id))} />{m.label}</label>)}</div></div>
        <label style={{ fontSize: 12.5, display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}><input type="checkbox" checked={escrita} onChange={e => setEscrita(e.target.checked)} /> Pode pedir criação/alteração (tarefas, RNC…) — sempre com confirmação</label>
        <button onClick={adicionar} disabled={!sel || salvando} style={{ ...btn('var(--bordo)', !sel || salvando), marginTop: 10 }}>+ Autorizar</button>
      </div>
      <div style={card}>
        <b style={{ fontSize: 13 }}>Números autorizados ({cfg.numeros.length})</b>
        {cfg.numeros.length === 0 ? <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 8 }}>Nenhum número autorizado. Enquanto a lista estiver vazia, a Amore IA não responde a ninguém.</div> : (
          <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}><thead><tr>{['Pessoa', 'Número', 'Lojas', 'Módulos', 'Escrita', ''].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{cfg.numeros.map(n => <tr key={n.fone}><td style={td}><b>{n.nome}</b></td><td style={td}>{mascara(n.fone)}</td><td style={td}>{n.lojas.join(', ')}</td><td style={td}>{n.modulos.map(m => MODULOS_IA.find(x => x.id === m)?.label || m).join(', ')}</td><td style={td}>{n.escrita ? 'Sim (com confirmação)' : 'Só consulta'}</td>
              <td style={td}><button title="Remover" onClick={() => { if (confirm(`Remover a autorização de ${n.nome}?`)) onSave({ ...cfg, numeros: cfg.numeros.filter(x => x.fone !== n.fone) }, 'Autorização removida') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626' }}><X size={15} /></button></td></tr>)}</tbody></table></div>
        )}
      </div>
    </div>
  )
}
