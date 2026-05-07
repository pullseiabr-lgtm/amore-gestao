import { useState } from 'react'
import { Palette, Store, Bell, CheckCircle, Upload, Plus, Trash2 } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'
import { useToast } from '../../hooks/useToast'
import { useAuth } from '../../contexts/AuthContext'
import type { TenantSettings } from '../../types/database'

type SettingsTab = 'branding' | 'stores' | 'features' | 'advanced'

const FONT_OPTIONS = [
  'Inter', 'Plus Jakarta Sans', 'Poppins', 'Roboto', 'Nunito',
  'Lato', 'Montserrat', 'Open Sans', 'DM Sans', 'Outfit',
]

const COLOR_FIELDS: { key: keyof TenantSettings; label: string }[] = [
  { key: 'primary_color', label: 'Cor principal' },
  { key: 'primary_light', label: 'Cor principal clara' },
  { key: 'primary_dark', label: 'Cor principal escura' },
  { key: 'sidebar_color', label: 'Sidebar fundo' },
  { key: 'accent_color', label: 'Cor de destaque' },
]

const FEATURE_LIST = [
  { id: 'dashboard', label: 'Dashboard', desc: 'Painel principal com KPIs' },
  { id: 'pendencias', label: 'Pendências & OS', desc: 'Ordens de serviço e manutenção' },
  { id: 'gamificacao', label: 'Gamificação', desc: 'Score e ranking de colaboradores' },
  { id: 'marketing', label: 'Marketing 360°', desc: 'Ações e campanhas' },
  { id: 'vendas', label: 'Vendas', desc: 'Registro de vendas e atendimentos' },
  { id: 'compras', label: 'Compras & Estoque', desc: 'Fornecedores, cotações e estoque' },
  { id: 'financeiro', label: 'Financeiro', desc: 'DRE, CMV e ponto de equilíbrio' },
  { id: 'cozinha', label: 'Cozinha', desc: 'Checklists, produção e desperdício' },
  { id: 'salao', label: 'Salão', desc: 'Atendimentos e caixa' },
]

const PLANS = [
  { value: 'starter', label: 'Starter', features: 3, color: '#6B7280' },
  { value: 'pro', label: 'Pro', features: 7, color: '#3B82F6' },
  { value: 'enterprise', label: 'Enterprise', features: 9, color: '#8B5CF6' },
]

export default function SettingsPage() {
  const { theme, updateTheme } = useTheme()
  const { toast } = useToast()
  const { user } = useAuth()
  const isSuperAdmin = user?.role === 'super_admin'

  const [tab, setTab] = useState<SettingsTab>('branding')
  const [form, setForm] = useState({ ...theme })
  const [newStore, setNewStore] = useState('')
  const [storeList, setStoreList] = useState([...theme.stores])
  const [features, setFeatures] = useState({ ...theme.features })
  const [saved, setSaved] = useState(false)

  const set = <K extends keyof TenantSettings>(key: K, val: TenantSettings[K]) => {
    setForm(p => ({ ...p, [key]: val }))
  }

  const preview = () => {
    updateTheme({ ...form, stores: storeList, features })
    toast('Preview aplicado! Reverta com "Cancelar" se necessário.')
  }

  const save = () => {
    updateTheme({ ...form, stores: storeList, features })
    setSaved(true)
    toast('Configurações salvas com sucesso!')
    setTimeout(() => setSaved(false), 2500)
  }

  const addStore = () => {
    if (!newStore.trim()) return
    if (storeList.includes(newStore.trim())) { toast('Loja já cadastrada.', 'error'); return }
    setStoreList(prev => [...prev, newStore.trim()])
    setNewStore('')
    toast(`Loja "${newStore}" adicionada!`)
  }

  const removeStore = (s: string) => {
    setStoreList(prev => prev.filter(x => x !== s))
  }

  if (!isSuperAdmin) {
    return (
      <div className="empty" style={{ paddingTop: 60 }}>
        <Store size={36} style={{ margin: '0 auto 8px', display: 'block', opacity: .2 }} />
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Acesso restrito</div>
        <div style={{ fontSize: 12 }}>Apenas Super Admins podem acessar as configurações White Label.</div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div className="sec-tt">⚙️ Configurações White Label</div>
          <div className="sec-sub">Personalize a aparência e os módulos disponíveis para seu cliente</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn bo" onClick={preview}><Palette size={11} />Preview</button>
          <button className={`btn ${saved ? 'bs' : 'bp'}`} onClick={save}>
            {saved ? <><CheckCircle size={11} />Salvo!</> : 'Salvar tudo'}
          </button>
        </div>
      </div>

      <div className="tabs">
        {([['branding', '🎨 Branding'], ['stores', '🏪 Lojas'], ['features', '🧩 Módulos'], ['advanced', '⚙️ Avançado']] as [SettingsTab, string][]).map(([id, lbl]) => (
          <button key={id} className={`tab${tab === id ? ' active' : ''}`} onClick={() => setTab(id)}>{lbl}</button>
        ))}
      </div>

      {/* ── BRANDING ── */}
      {tab === 'branding' && (
        <div className="g12">
          <div>
            <div className="card" style={{ marginBottom: 14 }}>
              <div className="card-hd"><span className="card-tt">Identidade Visual</span></div>
              <div className="card-bd">
                <div className="fg">
                  <label className="fl">Nome da empresa / sistema</label>
                  <input className="inp" value={form.company_name} onChange={e => set('company_name', e.target.value)} />
                </div>
                <div className="fg">
                  <label className="fl">Texto do rodapé</label>
                  <input className="inp" value={form.footer_text || ''} onChange={e => set('footer_text', e.target.value)} placeholder="© 2025 Empresa" />
                </div>
                <div className="fg">
                  <label className="fl">Logo URL</label>
                  <input className="inp" value={form.logo_url || ''} onChange={e => set('logo_url', e.target.value)} placeholder="https://..." />
                  <span className="fhint">URL de imagem PNG/SVG. Ideal: 200×200px.</span>
                </div>
                <div className="fg">
                  <label className="fl">Favicon URL</label>
                  <input className="inp" value={form.favicon_url || ''} onChange={e => set('favicon_url', e.target.value)} placeholder="https://..." />
                </div>
                <div className="fg">
                  <label className="fl">Domínio personalizado</label>
                  <input className="inp" value={form.custom_domain || ''} onChange={e => set('custom_domain', e.target.value)} placeholder="gestao.suaempresa.com.br" />
                  <span className="fhint">Configure o CNAME no seu DNS apontando para o sistema.</span>
                </div>
              </div>
            </div>

            <div className="card" style={{ marginBottom: 14 }}>
              <div className="card-hd"><span className="card-tt">Tipografia</span></div>
              <div className="card-bd">
                <div className="g2">
                  <div className="fg">
                    <label className="fl">Fonte dos títulos</label>
                    <select className="sel" value={form.font_heading} onChange={e => set('font_heading', e.target.value)}>
                      {FONT_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                  <div className="fg">
                    <label className="fl">Fonte do corpo</label>
                    <select className="sel" value={form.font_body} onChange={e => set('font_body', e.target.value)}>
                      {FONT_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ padding: 12, background: 'var(--cream)', borderRadius: 7, border: '1px solid var(--border)' }}>
                  <div style={{ fontFamily: form.font_heading, fontWeight: 800, fontSize: 16, marginBottom: 4 }}>Exemplo de título — {form.company_name}</div>
                  <div style={{ fontFamily: form.font_body, fontSize: 12, color: 'var(--muted)' }}>Exemplo de texto corpo com a fonte selecionada.</div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="card" style={{ marginBottom: 14 }}>
              <div className="card-hd"><span className="card-tt">Paleta de Cores</span></div>
              <div className="card-bd">
                {COLOR_FIELDS.map(f => (
                  <div className="color-row" key={f.key}>
                    <label>{f.label}</label>
                    <input
                      type="color"
                      value={(form[f.key] as string) || '#6B1212'}
                      onChange={e => set(f.key, e.target.value)}
                      style={{ width: 36, height: 28, border: '2px solid var(--border)', borderRadius: 6, cursor: 'pointer', padding: 0 }}
                    />
                    <input
                      className="inp"
                      value={(form[f.key] as string) || ''}
                      onChange={e => set(f.key, e.target.value)}
                      style={{ width: 100, flex: 'none' }}
                      placeholder="#000000"
                    />
                    <div style={{ width: 32, height: 28, borderRadius: 6, background: (form[f.key] as string) || '#6B1212', border: '2px solid var(--border)', flexShrink: 0 }} />
                  </div>
                ))}

                <div className="dv" />
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>Preview da barra lateral:</div>
                <div style={{ background: form.sidebar_color, borderRadius: 8, padding: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <div style={{ width: 24, height: 24, background: form.primary_light, borderRadius: 5 }} />
                    <span style={{ color: '#E8D5D5', fontSize: 12, fontWeight: 700 }}>{form.company_name}</span>
                  </div>
                  {['Dashboard', 'Vendas', 'Financeiro'].map((item, i) => (
                    <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', borderRadius: 5, marginBottom: 2, background: i === 0 ? form.primary_color + '33' : 'transparent', borderLeft: `3px solid ${i === 0 ? form.primary_light : 'transparent'}` }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: i === 0 ? form.primary_light : '#5A2828' }} />
                      <span style={{ color: i === 0 ? '#fff' : '#B08888', fontSize: 11 }}>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-hd"><span className="card-tt">Preview de Botões</span></div>
              <div className="card-bd" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn" style={{ background: form.primary_color, color: '#fff', borderColor: form.primary_color }}>Botão Principal</button>
                <button className="btn bo">Botão Secundário</button>
                <span className="badge" style={{ background: form.primary_color + '22', color: form.primary_color }}>Badge personalizado</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── LOJAS ── */}
      {tab === 'stores' && (
        <div className="g11">
          <div className="card">
            <div className="card-hd"><span className="card-tt">Lojas / Unidades</span><span className="badge bg-b">{storeList.length} cadastradas</span></div>
            <div className="card-bd">
              <div className="al al-b" style={{ marginBottom: 12 }}>
                <Store size={13} />
                <span>As lojas aparecerão nos filtros e seletores de todo o sistema.</span>
              </div>
              <div style={{ marginBottom: 11 }}>
                {storeList.map((s, i) => (
                  <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--cream)', borderRadius: 7, marginBottom: 5, border: '1px solid var(--border)' }}>
                    <div style={{ width: 28, height: 28, background: 'var(--bordo-bg)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 11, color: 'var(--bordo)', flexShrink: 0 }}>{i + 1}</div>
                    <span style={{ flex: 1, fontWeight: 600, fontSize: 12.5 }}>{s}</span>
                    {storeList.length > 1 && (
                      <button className="ib rd" onClick={() => removeStore(s)}><Trash2 size={11} /></button>
                    )}
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 7 }}>
                <input className="inp" value={newStore} onChange={e => setNewStore(e.target.value)} placeholder="Nome da nova loja" onKeyDown={e => e.key === 'Enter' && addStore()} style={{ flex: 1 }} />
                <button className="btn bp" onClick={addStore}><Plus size={11} />Adicionar</button>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-hd"><span className="card-tt">Plano & Suporte</span></div>
            <div className="card-bd">
              <div className="fg">
                <label className="fl">Plano ativo</label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  {PLANS.map(p => (
                    <button
                      key={p.value}
                      onClick={() => set('plan', p.value as TenantSettings['plan'])}
                      style={{
                        flex: 1, padding: '10px 8px', borderRadius: 8, border: `2px solid ${form.plan === p.value ? p.color : 'var(--border)'}`,
                        background: form.plan === p.value ? p.color + '18' : '#fff', cursor: 'pointer', transition: '.15s',
                      }}
                    >
                      <div style={{ fontWeight: 800, fontSize: 13, color: p.color }}>{p.label}</div>
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{p.features} módulos</div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="g2">
                <div className="fg">
                  <label className="fl">E-mail de suporte</label>
                  <input className="inp" type="email" value={form.support_email || ''} onChange={e => set('support_email', e.target.value)} placeholder="suporte@empresa.com" />
                </div>
                <div className="fg">
                  <label className="fl">WhatsApp de suporte</label>
                  <input className="inp" value={form.support_whatsapp || ''} onChange={e => set('support_whatsapp', e.target.value)} placeholder="+55 81 9xxxx-xxxx" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MÓDULOS / FEATURES ── */}
      {tab === 'features' && (
        <div>
          <div className="al al-b" style={{ marginBottom: 14 }}>
            <Bell size={13} />
            <span>Ative ou desative módulos para seus usuários. Módulos desativados não aparecem no menu de ninguém.</span>
          </div>
          <div className="cc-grid">
            {FEATURE_LIST.map(f => {
              const enabled = Boolean(features[f.id])
              return (
                <div className="card" key={f.id} style={{ borderLeft: `4px solid ${enabled ? 'var(--success)' : 'var(--border)'}` }}>
                  <div className="card-bd" style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 3 }}>{f.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{f.desc}</div>
                    </div>
                    <label className="sw">
                      <input type="checkbox" checked={enabled} onChange={e => setFeatures(prev => ({ ...prev, [f.id]: e.target.checked }))} />
                      <span className="sw-tr" />
                      <span className="sw-th" />
                    </label>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── AVANÇADO ── */}
      {tab === 'advanced' && (
        <div className="g11">
          <div className="card">
            <div className="card-hd"><span className="card-tt">Integrações</span><span className="badge bg-y">Em breve</span></div>
            <div className="card-bd">
              {[
                { name: 'WhatsApp Business API', icon: '📲', desc: 'Envio automático de pedidos e alertas' },
                { name: 'Mercado Pago', icon: '💳', desc: 'Integração financeira e pagamentos' },
                { name: 'iFood / Rappi', icon: '🛵', desc: 'Sincronização de pedidos delivery' },
                { name: 'Google Analytics', icon: '📊', desc: 'Rastreamento de uso do sistema' },
              ].map(int => (
                <div key={int.name} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 20, width: 36, textAlign: 'center' }}>{int.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 12.5 }}>{int.name}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{int.desc}</div>
                  </div>
                  <span className="badge bg-gr">Em breve</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-hd"><span className="card-tt">Exportar / Importar Config</span></div>
            <div className="card-bd">
              <div className="al al-y" style={{ marginBottom: 12 }}>
                <Upload size={13} />
                <span>Exporte as configurações atuais para fazer backup ou importar em outro ambiente.</span>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn bo" onClick={() => {
                  const blob = new Blob([JSON.stringify({ ...form, stores: storeList, features }, null, 2)], { type: 'application/json' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a'); a.href = url; a.download = 'white-label-config.json'; a.click()
                  toast('Configurações exportadas!')
                }}>
                  Exportar JSON
                </button>
                <button className="btn bo" onClick={() => {
                  const input = document.createElement('input'); input.type = 'file'; input.accept = '.json'
                  input.onchange = (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0]
                    if (!file) return
                    const reader = new FileReader()
                    reader.onload = (ev) => {
                      try {
                        const data = JSON.parse(ev.target?.result as string)
                        setForm(prev => ({ ...prev, ...data }))
                        if (data.stores) setStoreList(data.stores)
                        if (data.features) setFeatures(data.features)
                        toast('Configurações importadas! Clique em "Salvar tudo".')
                      } catch { toast('Arquivo inválido.', 'error') }
                    }
                    reader.readAsText(file)
                  }
                  input.click()
                }}>
                  Importar JSON
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sticky save bar */}
      <div style={{ position: 'sticky', bottom: 16, display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
        <button className={`btn ${saved ? 'bs' : 'bp'}`} onClick={save} style={{ padding: '9px 20px', fontSize: 13 }}>
          {saved ? <><CheckCircle size={13} />Configurações salvas!</> : '💾 Salvar todas as configurações'}
        </button>
      </div>
    </div>
  )
}
