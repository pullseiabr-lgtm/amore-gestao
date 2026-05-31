// Vercel Serverless Function — Disparo diário operacional via WhatsApp (Meta Cloud API)
// Roda pelo Vercel Cron (ver vercel.json) ou pode ser chamada manualmente com o secret.
//
// Variáveis de ambiente necessárias (configurar no painel da Vercel — Settings > Environment Variables):
//   WHATSAPP_TOKEN       = token permanente da Meta Cloud API (System User)
//   WHATSAPP_PHONE_ID    = Phone Number ID do número (de teste ou oficial)
//   WHATSAPP_RECIPIENTS  = números destinatários separados por vírgula, com DDI. Ex: 5581999998888,5581988887777
//   CRON_SECRET          = segredo para proteger o endpoint (a Vercel envia no header Authorization do cron)
//   WHATSAPP_LOJA        = (opcional) nome da loja para filtrar. Vazio = todas.
//   WHATSAPP_TEMPLATE    = (opcional) nome de um template aprovado. Se definido, envia template em vez de texto livre.
//   VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY  (já existem — usados para ler os dados)

const GRAPH = 'https://graph.facebook.com/v21.0'

function diasAte(dateStr) {
  if (!dateStr) return null
  const d = new Date(String(dateStr).slice(0, 10) + 'T00:00:00')
  const hoje = new Date(new Date().toDateString())
  return Math.round((d.getTime() - hoje.getTime()) / 86400000)
}
function fmtData(d) {
  if (!d) return '—'
  const s = String(d).slice(0, 10)
  const [a, m, dia] = s.split('-')
  return `${dia}/${m}/${a}`
}
function fmtRl(v) {
  return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

async function sb(table, query) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 7000)
  try {
    const url = `${process.env.VITE_SUPABASE_URL}/rest/v1/${table}?${query}`
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        apikey: process.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${process.env.VITE_SUPABASE_ANON_KEY}`,
      },
    })
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  } finally {
    clearTimeout(timer)
  }
}

function montarRelatorio(loja, boletos, reqs, tarefas) {
  const hojeISO = new Date().toISOString().slice(0, 10)
  const hojeBR = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })

  const boletoPend = (b) => b.status !== 'pago' && b.status !== 'cancelado'
  const boletosAvisar = boletos.filter(b => { const d = diasAte(b.data_vencimento); return boletoPend(b) && d != null && d >= 0 && d <= 2 })
  const boletosVencidos = boletos.filter(b => { const d = diasAte(b.data_vencimento); return boletoPend(b) && d != null && d < 0 })
  const recebidosHoje = reqs.filter(r => r.status === 'concluida' && String(r.updated_at || '').slice(0, 10) === hojeISO)
  const pedidosAbertos = reqs.filter(r => r.pedido_numero && r.pedido_status && r.pedido_status !== 'entregue' && r.pedido_status !== 'finalizado')
  const tarefasPrazo = tarefas.filter(t => t.status !== 'concluido' && t.status !== 'cancelado' && t.prazo && (diasAte(t.prazo) ?? 1) <= 0)

  const linhas = [
    `🤖 *LIZ — RELATÓRIO OPERACIONAL DIÁRIO*`,
    `📅 ${hojeBR}`,
    `🏪 ${loja || 'Amore'}`,
    `━━━━━━━━━━━━━━━`,
    ``,
    `💸 *BOLETOS*`,
    boletosVencidos.length ? `  🔴 ${boletosVencidos.length} vencido(s): ${fmtRl(boletosVencidos.reduce((a, b) => a + Number(b.valor || 0), 0))}` : null,
    boletosAvisar.length
      ? `  ⏳ Vencem em até 2 dias:\n${boletosAvisar.slice(0, 6).map(b => `    • ${b.fornecedor || b.beneficiario || 'Boleto'} — ${fmtRl(b.valor)} (venc. ${fmtData(b.data_vencimento)})`).join('\n')}`
      : (boletosVencidos.length ? null : `  ✅ Nenhum boleto vencendo nos próximos 2 dias`),
    ``,
    `📦 *RECEBIMENTOS DE HOJE*`,
    recebidosHoje.length
      ? recebidosHoje.slice(0, 8).map(r => `    • REQ-${String(r.numero).padStart(4, '0')}: ${r.titulo}`).join('\n')
      : `  — Nenhum recebimento confirmado hoje`,
    ``,
    `📄 *PEDIDOS EM ABERTO* (${pedidosAbertos.length})`,
    pedidosAbertos.length
      ? pedidosAbertos.slice(0, 8).map(r => `    • ${r.pedido_numero}: ${r.titulo} — ${fmtRl(r.total_final || r.total_estimado || 0)}`).join('\n')
      : `  ✅ Nenhum pedido pendente`,
    ``,
    `✅ *ENTREGAS DE TAREFAS* (prazo hoje/atrasadas: ${tarefasPrazo.length})`,
    tarefasPrazo.length
      ? tarefasPrazo.slice(0, 8).map(t => { const d = diasAte(t.prazo); return `    • ${t.titulo}${t.responsavel_nome ? ` (${t.responsavel_nome})` : ''}${d != null && d < 0 ? ` ⚠ ${-d}d atrás` : ' · hoje'}` }).join('\n')
      : `  ✅ Sem tarefas em atraso`,
    ``,
    `━━━━━━━━━━━━━━━`,
    `_Gerado automaticamente pela Liz · Amore Gestão_`,
  ]
  return linhas.filter(l => l !== null && l !== undefined).join('\n')
}

async function enviarWhatsApp(to, texto) {
  const phoneId = process.env.WHATSAPP_PHONE_ID
  const token = process.env.WHATSAPP_TOKEN
  const template = process.env.WHATSAPP_TEMPLATE

  // Se um template aprovado foi configurado, envia template (necessário p/ disparo fora da janela de 24h).
  // O template deve ter 1 parâmetro de corpo {{1}}. Obs: a Meta não aceita quebras de linha em parâmetro,
  // então enviamos um resumo curto. Para o relatório completo, use a janela de 24h (mensagem de texto).
  const body = template
    ? {
        messaging_product: 'whatsapp', to, type: 'template',
        template: {
          name: template, language: { code: 'pt_BR' },
          components: [{ type: 'body', parameters: [{ type: 'text', text: texto.replace(/\n+/g, ' · ').slice(0, 1000) }] }],
        },
      }
    : { messaging_product: 'whatsapp', to, type: 'text', text: { body: texto } }

  const res = await fetch(`${GRAPH}/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}

export default async function handler(req, res) {
  // Proteção: a Vercel envia "Authorization: Bearer <CRON_SECRET>" nos crons.
  // Permite também ?secret= para teste manual.
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.authorization || ''
    const qs = req.query?.secret || ''
    if (auth !== `Bearer ${secret}` && qs !== secret) {
      return res.status(401).json({ error: 'Não autorizado' })
    }
  }

  // Ping: confirma que a função carrega/executa, sem tocar em nada externo.
  if (req.query?.ping === '1') {
    return res.status(200).json({ ok: true, ts: Date.now() })
  }
  // Diag: mostra QUAIS variáveis de ambiente estão presentes (sem revelar valores).
  if (req.query?.diag === '1') {
    return res.status(200).json({
      VITE_SUPABASE_URL: !!process.env.VITE_SUPABASE_URL,
      VITE_SUPABASE_ANON_KEY: !!process.env.VITE_SUPABASE_ANON_KEY,
      WHATSAPP_TOKEN: !!process.env.WHATSAPP_TOKEN,
      WHATSAPP_PHONE_ID: !!process.env.WHATSAPP_PHONE_ID,
      WHATSAPP_RECIPIENTS: !!process.env.WHATSAPP_RECIPIENTS,
      CRON_SECRET: !!process.env.CRON_SECRET,
    })
  }

  // Modo pré-visualização: monta o relatório a partir do Supabase e retorna SEM enviar.
  // Funciona só com VITE_SUPABASE_* (não precisa das credenciais do WhatsApp).
  const preview = req.query?.preview === '1' || req.query?.preview === 'true'

  if (!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_ANON_KEY) {
    return res.status(500).json({ error: 'Variáveis VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY não disponíveis no runtime da função. Verifique no projeto Vercel (Settings > Environment Variables, marcadas para Production).' })
  }

  const loja = process.env.WHATSAPP_LOJA || ''
  const filtroLoja = loja ? `loja=eq.${encodeURIComponent(loja)}&` : ''

  try {
    const [boletos, reqs, tarefas] = await Promise.all([
      sb('boletos', `${filtroLoja}select=*`),
      sb('requisicoes', `${filtroLoja}select=*`),
      sb('tarefas', `${filtroLoja}select=*`),
    ])

    const texto = montarRelatorio(loja, boletos, reqs, tarefas)

    if (preview) {
      return res.status(200).json({ preview: true, loja: loja || 'todas', relatorio: texto })
    }

    // Envio real: exige as credenciais do WhatsApp
    if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_ID || !process.env.WHATSAPP_RECIPIENTS) {
      return res.status(503).json({
        error: 'Disparo pronto, mas falta configurar o WhatsApp. Adicione WHATSAPP_TOKEN, WHATSAPP_PHONE_ID e WHATSAPP_RECIPIENTS nas variáveis de ambiente da Vercel.',
        dica: 'Use ?preview=1 para ver o relatório sem enviar.',
        previa: texto.slice(0, 600),
      })
    }

    const destinatarios = process.env.WHATSAPP_RECIPIENTS.split(',').map(s => s.trim().replace(/\D/g, '')).filter(Boolean)
    const resultados = []
    for (const to of destinatarios) {
      const r = await enviarWhatsApp(to, texto)
      resultados.push({ to, ok: r.ok, status: r.status, erro: r.ok ? undefined : (r.data?.error?.message || r.data) })
    }

    return res.status(200).json({ enviados: resultados.filter(r => r.ok).length, total: destinatarios.length, resultados, previa: texto.slice(0, 400) })
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Erro no disparo diário' })
  }
}
