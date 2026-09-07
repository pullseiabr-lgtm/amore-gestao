import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useLoja } from '../../contexts/LojaContext'
import { useToast } from '../../hooks/useToast'
import { insertFornecedor } from '../../lib/db'

const sb = supabase as any

type Aba = 'franquia' | 'fornecedor' | 'reclamacao' | 'clube' | 'contato'

interface Registro {
  chave: string
  tipo?: string
  situacao?: string
  acao?: string
  em?: string
  cadastrado?: boolean
  [k: string]: any
}

const ABAS: { id: Aba; label: string; prefixo: string; icone: string }[] = [
  { id: 'franquia', label: 'Franquias (Leads)', prefixo: 'site_franquia_', icone: '🏪' },
  { id: 'fornecedor', label: 'Fornecedores', prefixo: 'site_fornecedor_', icone: '📦' },
  { id: 'reclamacao', label: 'Reclame Aqui', prefixo: 'site_reclama_', icone: '📣' },
  { id: 'clube', label: 'Clube de Benefício', prefixo: 'site_clube_', icone: '💚' },
  { id: 'contato', label: 'Contato', prefixo: 'site_contato_', icone: '✉️' },
]

const STATUS_LEAD = ['novo', 'em_contato', 'qualificado', 'concluido', 'descartado']
const STATUS_RECLAMA = ['aberto', 'em_tratativa', 'resolvido', 'arquivado']

const STATUS_LABEL: Record<string, string> = {
  novo: 'Novo', em_contato: 'Em contato', qualificado: 'Qualificado', concluido: 'Concluído', descartado: 'Descartado',
  aberto: 'Aberto', em_tratativa: 'Em tratativa', resolvido: 'Resolvido', arquivado: 'Arquivado',
}
const STATUS_COR: Record<string, string> = {
  novo: '#2563eb', em_contato: '#d97706', qualificado: '#7c3aed', concluido: '#16a34a', descartado: '#6b7280',
  aberto: '#dc2626', em_tratativa: '#d97706', resolvido: '#16a34a', arquivado: '#6b7280',
}

function fmtData(iso?: string) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) } catch { return '—' }
}
function soDigitos(v?: string) { return (v || '').replace(/\D/g, '') }
function waLink(tel?: string) {
  const d = soDigitos(tel)
  if (!d) return ''
  const full = d.length <= 11 ? '55' + d : d
  return 'https://wa.me/' + full
}

export default function SiteLeadsPage() {
  const { loja } = useLoja()
  const { toast } = useToast()
  const [aba, setAba] = useState<Aba>('franquia')
  const [dados, setDados] = useState<Record<Aba, Registro[]>>({ franquia: [], fornecedor: [], reclamacao: [], clube: [], contato: [] })
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [expandido, setExpandido] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const results = await Promise.all(
        ABAS.map(a => sb.from('app_config').select('chave,valor').like('chave', a.prefixo + '%').limit(5000))
      )
      const novo: Record<Aba, Registro[]> = { franquia: [], fornecedor: [], reclamacao: [], clube: [], contato: [] }
      ABAS.forEach((a, i) => {
        const rows = (results[i].data || []).map((r: any) => ({ chave: r.chave, ...(r.valor || {}) })) as Registro[]
        rows.sort((x, y) => (y.em || '').localeCompare(x.em || ''))
        novo[a.id] = rows
      })
      setDados(novo)
    } catch (e) {
      toast('Erro ao carregar os registros do site.', 'error')
    } finally { setLoading(false) }
  }, [toast])

  useEffect(() => { carregar() }, [carregar])

  async function salvarRegistro(reg: Registro, patch: Partial<Registro>) {
    setSalvando(reg.chave)
    const atualizado = { ...reg, ...patch, atualizado_em: new Date().toISOString() }
    const { chave, ...valor } = atualizado
    try {
      const { error } = await sb.from('app_config').update({ valor }).eq('chave', reg.chave)
      if (error) throw error
      setDados(prev => {
        const lista = prev[aba].map(r => r.chave === reg.chave ? atualizado : r)
        return { ...prev, [aba]: lista }
      })
    } catch (e) {
      toast('Não consegui salvar. Tente novamente.', 'error')
    } finally { setSalvando(null) }
  }

  async function cadastrarFornecedor(reg: Registro) {
    const lojaAlvo = (loja && !['Todas', 'Todas as Lojas', ''].includes(loja)) ? loja : 'Amore Paiva'
    try {
      await insertFornecedor({
        loja: lojaAlvo,
        nome: (reg.empresa || reg.responsavel || 'Sem nome').toString().trim().toUpperCase(),
        razao_social: reg.empresa || null,
        cnpj: reg.cnpj || null,
        ie: null,
        email: reg.email || null,
        telefone: reg.telefone || null,
        whatsapp: soDigitos(reg.telefone) || null,
        logo_url: null,
        cep: null, logradouro: null, numero: null, complemento: null, bairro: null,
        cidade: reg.atendimento || null, estado: null,
        forma_pagamento: 'Boleto', chave_pix: null, banco: null, agencia: null, conta: null,
        prazo_pagamento: 30,
        categorias: reg.categoria ? [reg.categoria] : null,
        prazo_entrega_dias: null, pedido_minimo: null, desconto_pct: null,
        contato_nome: reg.responsavel || null,
        contato_email: reg.email || null,
        contato_telefone: reg.telefone || null,
        observacoes: reg.produtos ? ('Produtos: ' + reg.produtos) : null,
        nota_avaliacao: null, total_pedidos: 0, obs_avaliacao: null,
        ativo: true, created_by: null,
      } as any)
      await salvarRegistro(reg, { cadastrado: true, situacao: 'concluido' })
      toast('✅ Cadastrado em Fornecedores (menu Fornecedores).')
    } catch (e) {
      toast('Erro ao cadastrar como fornecedor.', 'error')
    }
  }

  const abaAtual = ABAS.find(a => a.id === aba)!
  const opcoesStatus = aba === 'reclamacao' ? STATUS_RECLAMA : STATUS_LEAD
  const lista = (dados[aba] || []).filter(r => {
    if (filtroStatus && (r.situacao || (aba === 'reclamacao' ? 'aberto' : 'novo')) !== filtroStatus) return false
    if (!busca) return true
    const b = busca.toLowerCase()
    return JSON.stringify(r).toLowerCase().includes(b)
  })

  const contagem = (id: Aba) => (dados[id] || []).length
  const novos = (id: Aba) => (dados[id] || []).filter(r => {
    const s = r.situacao || (id === 'reclamacao' ? 'aberto' : 'novo')
    return s === 'novo' || s === 'aberto'
  }).length

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#800000', margin: 0 }}>🌐 Site — Leads & Reclame Aqui</h1>
        <p style={{ color: '#6b7280', marginTop: 4, fontSize: 14 }}>
          Tudo que chega pelo site amorefood.com.br: interesses de franquia, cadastros de fornecedor,
          reclamações, membros do clube e mensagens de contato. Gerencie o status e as ações aqui.
        </p>
      </div>

      {/* Abas */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {ABAS.map(a => {
          const ativo = a.id === aba
          const n = novos(a.id)
          return (
            <button key={a.id} onClick={() => { setAba(a.id); setFiltroStatus(''); setExpandido(null) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 12,
                border: ativo ? '1.5px solid #800000' : '1px solid #e5e7eb',
                background: ativo ? '#800000' : '#fff', color: ativo ? '#fff' : '#374151',
                fontWeight: 600, fontSize: 13.5, cursor: 'pointer',
              }}>
              <span>{a.icone}</span>{a.label}
              <span style={{ fontSize: 11, background: ativo ? 'rgba(255,255,255,.22)' : '#f3f4f6', color: ativo ? '#fff' : '#6b7280', padding: '2px 7px', borderRadius: 20 }}>{contagem(a.id)}</span>
              {n > 0 && <span style={{ fontSize: 10, background: '#dc2626', color: '#fff', padding: '2px 6px', borderRadius: 20 }}>{n} novo{n > 1 ? 's' : ''}</span>}
            </button>
          )
        })}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome, cidade, e-mail…"
          style={{ flex: '1 1 260px', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 14 }} />
        <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}
          style={{ padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 14 }}>
          <option value="">Todos os status</option>
          {opcoesStatus.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <button onClick={carregar} style={{ padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: 10, background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13.5 }}>↻ Atualizar</button>
        {aba === 'fornecedor' && (
          <span style={{ fontSize: 12.5, color: '#6b7280' }}>Cadastre para enviar direto ao menu <b>Fornecedores</b>.</span>
        )}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Carregando…</div>
      ) : lista.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', border: '1px dashed #e5e7eb', borderRadius: 14 }}>
          {abaAtual.icone} Nenhum registro em <b>{abaAtual.label}</b> ainda.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {lista.map(reg => {
            const st = reg.situacao || (aba === 'reclamacao' ? 'aberto' : 'novo')
            const nome = reg.nome || reg.empresa || reg.responsavel || 'Sem nome'
            const aberto = expandido === reg.chave
            return (
              <div key={reg.chave} style={{ border: '1px solid #e5e7eb', borderRadius: 14, background: '#fff', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', flexWrap: 'wrap' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 20, background: STATUS_COR[st] || '#6b7280', flex: 'none' }} />
                  <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: '#111827' }}>{nome}</div>
                    <div style={{ fontSize: 12.5, color: '#6b7280' }}>
                      {reg.protocolo ? reg.protocolo + ' · ' : ''}{fmtData(reg.em)}
                      {reg.cidade || reg.uf ? ' · ' + [reg.cidade, reg.uf].filter(Boolean).join('/') : ''}
                      {reg.loja ? ' · ' + reg.loja : ''}
                    </div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: STATUS_COR[st], background: (STATUS_COR[st] || '#6b7280') + '18', padding: '4px 10px', borderRadius: 20 }}>
                    {STATUS_LABEL[st] || st}
                  </span>
                  {(reg.telefone || reg.whatsapp || reg.contato) && waLink(reg.telefone || reg.whatsapp || reg.contato) && (
                    <a href={waLink(reg.telefone || reg.whatsapp || reg.contato)} target="_blank" rel="noopener"
                      style={{ fontSize: 12.5, fontWeight: 600, color: '#16a34a', textDecoration: 'none' }}>💬 WhatsApp</a>
                  )}
                  <button onClick={() => setExpandido(aberto ? null : reg.chave)}
                    style={{ padding: '6px 12px', border: '1px solid #e5e7eb', borderRadius: 9, background: '#fff', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>
                    {aberto ? 'Fechar' : 'Ver / tratar'}
                  </button>
                </div>

                {aberto && (
                  <div style={{ borderTop: '1px solid #f3f4f6', padding: 16, background: '#fafafa' }}>
                    {/* Detalhes */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10, marginBottom: 14 }}>
                      {Object.entries(reg).filter(([k]) => !['chave', 'tipo', 'situacao', 'acao', 'em', 'origem', 'atualizado_em', 'cadastrado', 'protocolo', 'consentimento'].includes(k)).map(([k, v]) => (
                        <div key={k} style={{ fontSize: 13 }}>
                          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: '#9ca3af', fontWeight: 700 }}>{k}</div>
                          <div style={{ color: '#374151', whiteSpace: 'pre-wrap' }}>{String(v ?? '—')}</div>
                        </div>
                      ))}
                    </div>

                    {/* Ações */}
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Status</label>
                        <select value={st} onChange={e => salvarRegistro(reg, { situacao: e.target.value })}
                          style={{ padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 13.5 }}>
                          {opcoesStatus.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                        </select>
                      </div>
                      <div style={{ flex: '1 1 280px' }}>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                          {aba === 'reclamacao' ? 'Ação / tratativa' : 'Observação'}
                        </label>
                        <textarea defaultValue={reg.acao || ''} placeholder={aba === 'reclamacao' ? 'O que foi feito para resolver…' : 'Anotações do atendimento…'}
                          onBlur={e => { if (e.target.value !== (reg.acao || '')) salvarRegistro(reg, { acao: e.target.value }) }}
                          style={{ width: '100%', minHeight: 60, padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 13.5, resize: 'vertical', fontFamily: 'inherit' }} />
                      </div>
                    </div>

                    {aba === 'fornecedor' && (
                      <div style={{ marginTop: 12 }}>
                        {reg.cadastrado ? (
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#16a34a' }}>✅ Já cadastrado em Fornecedores</span>
                        ) : (
                          <button onClick={() => cadastrarFornecedor(reg)}
                            style={{ padding: '10px 16px', border: 'none', borderRadius: 10, background: '#800000', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13.5 }}>
                            ➕ Cadastrar como fornecedor (verificado)
                          </button>
                        )}
                      </div>
                    )}

                    {salvando === reg.chave && <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>Salvando…</div>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
