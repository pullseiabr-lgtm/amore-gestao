# Inteligência de Compras

Fonte de dados: view `v_ic_compras` (itens da Prestação de Contas — `caixa_itens`/`caixas` + responsável via `fin_prestacoes`), com nomes normalizados, duplicidades removidas, unidade-base convertida e origem (`caixa_id`, `prestacao_id`) em cada linha.

| Fase | Onde | Banco |
|---|---|---|
| Base (dashboard, produtos, fornecedores, variações, frequência, relatório) | `InteligenciaComprasPage.tsx`, `engine.ts` | view `v_ic_compras`, `app_config.ic_config` |
| A — preços na aprovação | `PrecosRequisicao.tsx` (modal de aprovação) e `public/requisicao-editar.html` | RPC `ic_analise_requisicao`, tabela `ic_req_analises` (snapshots `envio` e `aprovacao`) |
| B — Comprador | `CompradorTab.tsx` | `ic_cotacoes`, `ic_compras_plano`; recebido lido de `pedido_compra_itens` |
| C — Semanal por loja | `SemanalTab.tsx`, `semanal.ts` | consolidado gravado em `app_config.ic_semanal_<loja>_<segunda>` |

## Relatório semanal de segunda-feira 8h — NÃO está agendado (de propósito)

O envio automático por WhatsApp está pausado (número bloqueado em 11/11/2026). O consolidado da semana fechada é calculado e gravado
quando a aba **Semanal por loja** é aberta; o botão **Enviar resumo no WhatsApp** é manual e só habilita quando o Esdras liberar em
*Configurações* (`ic_config.semanalWhatsApp = true`) com os números em `semanalFones`.

Quando o Esdras liberar o agendamento: criar uma rotina **no VPS** (cron `0 11 * * 1` UTC = segunda 8h BRT) que chame o consolidado e envie via
`/api/evolution-send` (não criar função nova em `api/` nem cron na Vercel — limites do plano Hobby: 12 funções e 3 crons).
