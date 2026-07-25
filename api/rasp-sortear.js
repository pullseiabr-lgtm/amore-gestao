// Vercel Serverless Function — MOTOR do sorteio das raspadinhas (cronograma por posição).
//
// Substitui a decisão que antes era feita na função Postgres rasp_sortear. Roda no backend
// do próprio site (HTTPS, mesma origem), sem precisar de chave de SQL. Usa a anon key (RLS off).
//
// Regra principal: CRONOGRAMA POR POSIÇÃO. Cada participação recebe uma posição (ordinal na fila
// de avaliações da campanha). A configuração (app_config chave `rasp_config`) define qual prêmio
// sai em cada posição; posições não listadas = "Não foi dessa vez". Opcional: `ciclo` repete o
// padrão a cada N posições (ex.: ciclo=50 → posição 60 age como a 10).
//
// Segurança (§6/§13 do escopo): se não houver cronograma configurado, se a campanha estiver
// bloqueada, se o prêmio estiver pausado ou sem estoque → cai automaticamente em "Não foi dessa vez".
// Nunca ultrapassa o estoque programado de cada prêmio.
//
// Env (Vercel): VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY.

const SB = () => process.env.VITE_SUPABASE_URL
const KEY = () => process.env.VITE_SUPABASE_ANON_KEY
const H = () => ({ apikey: KEY(), Authorization: 'Bearer ' + KEY(), 'Content-Type': 'application/json' })

async function rest(path, opts = {}) {
  const r = await fetch(SB() + '/rest/v1/' + path, { ...opts, headers: { ...H(), ...(opts.headers || {}) } })
  return r
}
const getJson = async (path) => { try { return await (await rest(path)).json() } catch { return null } }
async function count(path) {
  const r = await rest(path, { headers: { Prefer: 'count=exact', Range: '0-0' } })
  const cr = r.headers.get('content-range') || '*/0'
  return parseInt(cr.split('/')[1] || '0', 10) || 0
}
async function appCfg(chave) {
  const rows = await getJson('app_config?select=valor&chave=eq.' + encodeURIComponent(chave))
  return rows?.[0]?.valor ?? null
}
const soDig = (s) => String(s || '').replace(/\D/g, '')
const hojeISO = () => new Date().toISOString().slice(0, 10)
function gerarCupom() {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const r = (n) => Array.from({ length: n }, () => a[Math.floor(Math.random() * a.length)]).join('')
  return 'AMR-' + r(3) + '-' + r(4)
}

// Decide o prêmio programado para uma posição, considerando ciclo (repetição) e "desde" (offset já aplicado antes).
function premioIdNaPosicao(cfg, pos) {
  if (!cfg || !Array.isArray(cfg.cronograma) || !cfg.cronograma.length) return null
  const ciclo = Number(cfg.ciclo) || 0
  const k = ciclo > 0 ? ((pos - 1) % ciclo) + 1 : pos
  const entry = cfg.cronograma.find((e) => Number(e.pos) === k)
  return entry && entry.premio_id ? String(entry.premio_id) : null
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ erro: 'metodo' })
  if (!SB() || !KEY()) return res.status(503).json({ erro: 'config' })

  let body = req.body
  if (typeof body === 'string') { try { body = JSON.parse(body) } catch { body = {} } }
  const slug = (body?.slug || '').trim()
  const nome = (body?.nome || '').trim()
  const telefone = soDig(body?.telefone)
  const unidade = (body?.unidade || '').trim()
  const nascimento = body?.nascimento || null
  const consent = body?.consent === true || body?.consent === 'true'
  const origem = body?.origem || null
  const garcom = body?.garcom || null
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || null

  // ── Validações básicas ──
  if (!nome) return res.status(200).json({ erro: 'nome' })
  if (telefone.length < 10) return res.status(200).json({ erro: 'telefone_invalido' })
  if (!consent) return res.status(200).json({ erro: 'consent' })

  // ── Campanha ──
  const camps = await getJson('rasp_campanhas?select=*&slug=eq.' + encodeURIComponent(slug) + '&limit=1')
  const camp = camps?.[0]
  if (!camp) return res.status(200).json({ erro: 'campanha_inexistente' })
  if (camp.status && !['ativa', 'ativo'].includes(String(camp.status))) return res.status(200).json({ erro: 'campanha_indisponivel' })
  const hoje = hojeISO()
  if (camp.data_inicio && hoje < camp.data_inicio) return res.status(200).json({ erro: 'nao_iniciada' })
  if (camp.data_fim && hoje > camp.data_fim) return res.status(200).json({ erro: 'encerrada' })

  // ── Limite por telefone (1 participação por telefone/campanha por padrão) ──
  const limite = Number(camp.limite_por_telefone) || 1
  const jaExiste = await getJson('rasp_participacoes?select=id,ganhou,premio_nome,cupom,validade,status&campanha_id=eq.' + camp.id + '&telefone=eq.' + telefone + '&order=created_at.asc')
  if (Array.isArray(jaExiste) && jaExiste.length >= limite) {
    const p = jaExiste[0]
    return res.status(200).json({ ja_participou: true, ganhou: p.ganhou, premio: p.premio_nome, cupom: p.cupom, validade: p.validade, status: p.status })
  }

  // ── Config do sorteio + bloqueio/pausa ──
  const cfgAll = (await appCfg('rasp_config')) || {}
  const cfg = cfgAll[camp.id] || null
  const bloq = (await appCfg('rasp_bloqueio')) || {}
  const premios = (await getJson('rasp_premios?select=*&campanha_id=eq.' + camp.id)) || []
  const naoFoi = premios.find((p) => p.is_premio === false) || null

  // ── Posição na fila (ordinal) ──
  // Conta participações da campanha a partir de `desde` (se configurado) — permite "zerar a fila".
  const desde = cfg?.desde ? String(cfg.desde) : null
  let posFilter = 'rasp_participacoes?select=id&campanha_id=eq.' + camp.id
  if (desde) posFilter += '&created_at=gte.' + encodeURIComponent(desde)
  const anteriores = await count(posFilter)
  const posicao = anteriores + 1 // esta participação

  // ── Decide o prêmio ──
  let premio = null
  let motivo = ''
  const alvoId = premioIdNaPosicao(cfg, posicao)
  if (!cfg || !Array.isArray(cfg.cronograma) || !cfg.cronograma.length) motivo = 'sem_config'
  else if (bloq.bloqueada) motivo = 'bloqueada'
  else if (!alvoId) motivo = 'posicao_sem_premio'
  else {
    const alvo = premios.find((p) => String(p.id) === alvoId)
    if (!alvo || alvo.is_premio === false) motivo = 'premio_invalido'
    else if (bloq?.prizes?.[alvo.id]?.pausado) motivo = 'pausado'
    else {
      const programada = bloq?.prizes?.[alvo.id]?.programada
      const cap = programada != null ? Number(programada) : Number(alvo.quantidade) || 0
      if ((Number(alvo.distribuidos) || 0) >= cap) motivo = 'esgotado'
      else premio = alvo
    }
  }
  const ganhou = !!premio
  const premioRow = premio || naoFoi

  // ── Grava a participação ──
  const cupom = ganhou ? gerarCupom() : null
  const validade = ganhou && camp.validade_dias
    ? new Date(Date.now() + Number(camp.validade_dias) * 86400000).toISOString().slice(0, 10)
    : null
  const insert = {
    campanha_id: camp.id,
    premio_id: premioRow ? premioRow.id : null,
    nome, telefone, nascimento, unidade, consent,
    cupom, premio_nome: premioRow ? premioRow.nome : 'Não foi dessa vez!',
    ganhou, validade, status: 'disponivel', origem, garcom, ip,
  }
  const ins = await rest('rasp_participacoes', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(insert) })
  if (!ins.ok) {
    // conflito de telefone (corrida) → trata como já participou
    const txt = await ins.text().catch(() => '')
    if (ins.status === 409 || /duplicate|unique/i.test(txt)) return res.status(200).json({ ja_participou: true })
    return res.status(200).json({ erro: 'falha' })
  }

  // ── Baixa de estoque (best-effort) ──
  if (ganhou && premio) {
    await rest('rasp_premios?id=eq.' + premio.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ distribuidos: (Number(premio.distribuidos) || 0) + 1 }) }).catch(() => {})
  }

  return res.status(200).json({
    ganhou,
    premio: premioRow ? premioRow.nome : 'Não foi dessa vez!',
    descricao: premioRow ? (premioRow.descricao || '') : 'Não foi dessa vez, mas volte sempre! 💛',
    cupom, validade,
    posicao, motivo: ganhou ? 'premiado' : motivo, // motivo ajuda no debug do painel; não é mostrado ao cliente
  })
}
