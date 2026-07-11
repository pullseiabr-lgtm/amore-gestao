import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

// lê env
const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
const get = k => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim()
const url = get('VITE_SUPABASE_URL')
const key = get('VITE_SUPABASE_SERVICE_ROLE_KEY')
const db = createClient(url, key, { auth: { persistSession: false } })

const LOJA = 'Amore Paiva'

const pauta = `OBJETIVO: Analisar a operação da Unidade Paiva, avaliar indicadores comerciais e operacionais, e definir estratégias de vendas, marca, custos, experiência do cliente, delivery e novos projetos.

1. MARKETING E AÇÕES COMERCIAIS
- Novo calendário promocional aprovado.
- Campanha 05/07 (Jogo do Brasil): Chopp R$2,90; Heineken/Pure Gold R$14,90; Combo Caldinho 1/R$19,90, 3/R$29,90.
- Sushi: manter promoção dom-a-dom, TV promocional exclusiva. Meta +25% em julho.
- Pizza (Clone Pizza qua-dom): Tradicional R$59,90, Napolitana R$69,90. Meta +30%.
- Happy Hour (todos os dias 12h-22h): Chopp R$4,90; petiscos Camarão Imperial R$59,90, KFC R$49,90, Sertão R$52,90.

2. SUGESTÃO DO CHEF — pratos do dia seg-sex (Individual R$32,90 / Dupla R$59,90).
3. ALMOÇOS DE FIM DE SEMANA — Moqueca, Feijoada, Churrascada, Peixe Inteiro: R$159,90 → R$129,90. Meta +20%.
4. FESTIVAL DE MASSAS (sábados à noite) — música ao vivo, ambientação italiana, vinhos R$69,90; tradicionais R$59,90/109,90; lagosta R$79,90/149,90.
5. PADRONIZAÇÃO — Picanha importada (180g/360g), Petisco KFC (receita oficial), projeto massa própria de pizza.
6. CONTROLE OPERACIONAL/ESTOQUE — estoque mínimo, inventário semanal, checklist diário. Meta -20% desperdícios até set/2026.
7. FINANCEIRO/CMV — acompanhamento semanal (CMV, ticket médio, margem, giro); auditorias quinzenais.
8. DELIVERY — iFood, WhatsApp, Google Maps; combos, patrocinados, fidelização. Meta +30% até dez/2026.
9. MARKETING/MARCA — offline (outdoor, panfletagem, parcerias) e digital (tráfego pago, Google Meu Negócio, influenciadores, remarketing).
10. FIDELIZAÇÃO — Programa Cliente Amore (cashback, pontos, aniversário).
11. QUALIDADE — treinamentos, cliente oculto, meta 4,8★.
12. RH — treinamentos, funcionário destaque, premiações.
13. NOVOS PROJETOS — Café da Manhã, Clube Corporativo, Cartão Presente, Indique e Ganhe, CRM Inteligente.`

const decisoes = `APROVADOS: novo calendário promocional; Campanha Jogo do Brasil (05/07); Festival de Massas (sábados); Programa Cliente Amore (fidelização/cashback); padronização de Picanha importada e Petisco KFC.

METAS GERAIS APROVADAS:
- +20% faturamento até dez/2026
- +15% ticket médio
- +30% delivery
- -20% perdas operacionais
- Nota mínima 4,8★ nas avaliações
- +25% vendas de sushi | +30% vendas de pizza`

const proximos = `CRONOGRAMA DE EXECUÇÃO:
01/07 Início das campanhas promocionais — Esdras
01/07 Telão + Samba (EMN) para 05/07 Jogo do Brasil — Esdras
03/07 Padronização KFC e Picanha — Ana Beatriz
05/07 Ação especial Chopp e Caldinho — Ana Beatriz e Esdras
06/07 Plano de Marketing final — Esdras e Eduarda
15/07 Programa Fidelidade e Cashback — Esdras e Eduarda
15/07 Estrutura completa do Delivery — Esdras e Eduarda
31/07 Implantação do CRM — Wagner
Agosto/2026 Revisão de metas e redução de perdas — Wagner
Agosto/2026 Avaliação geral dos resultados — Wagner`

const ata = {
  loja: LOJA,
  titulo: 'Ata 001/2026 — Comitê Gestor · Unidade Paiva',
  data_reuniao: '2026-06-30',
  hora_inicio: '17:00', hora_fim: '18:30',
  local_reuniao: 'Restaurante Amore – Unidade Paiva',
  tipo: 'estrategica',
  participantes: ['Wagner Santana', 'Eduarda Santana', 'Bana Beatriz'],
  pauta, decisoes, proximos_passos: proximos,
  observacoes: 'Ausentes: Esdras Santana, Aline Santana. Ata importada do PDF "ATA 01".',
  status: 'finalizada',
  created_by: 'Importação (PDF ATA 01)',
}

const acoes = [
  ['Início das campanhas promocionais', 'Esdras Santana', '2026-07-01'],
  ['Telão + Samba (EMN) para 05/07 — Jogo do Brasil', 'Esdras Santana', '2026-07-01'],
  ['Padronização KFC e Picanha', 'Ana Beatriz', '2026-07-03'],
  ['Ação especial Chopp e Caldinho', 'Ana Beatriz e Esdras Santana', '2026-07-05'],
  ['Plano de Marketing final', 'Esdras Santana e Eduarda Santana', '2026-07-06'],
  ['Programa Fidelidade e Cashback', 'Esdras Santana e Eduarda Santana', '2026-07-15'],
  ['Estrutura completa do Delivery', 'Esdras Santana e Eduarda Santana', '2026-07-15'],
  ['Implantação do CRM', 'Wagner Santana', '2026-07-31'],
  ['Revisão das metas e redução de perdas (Agosto/2026)', 'Wagner Santana', null],
  ['Avaliação geral dos resultados (Agosto/2026)', 'Wagner Santana', null],
]

const { data: novaAta, error } = await db.from('atas_reuniao').insert(ata).select().single()
if (error) { console.error('ERRO ATA:', error); process.exit(1) }
console.log('ATA criada:', novaAta.id)

const acoesRows = acoes.map(([descricao, responsavel, prazo]) => ({
  loja: LOJA, ata_id: novaAta.id, descricao, responsavel, prazo, status: 'pendente', tarefa_id: null, observacoes: null,
}))
const { error: e2 } = await db.from('atas_acoes').insert(acoesRows)
if (e2) { console.error('ERRO AÇÕES:', e2); process.exit(1) }
console.log('Ações inseridas:', acoesRows.length)
console.log('OK')
