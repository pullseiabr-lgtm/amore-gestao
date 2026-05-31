# 📲 Disparo Diário via WhatsApp — Guia de Configuração

O backend já está **100% pronto e deployado**. Para ativar o envio automático, basta
preencher as variáveis de ambiente na Vercel. Nenhuma alteração de código é necessária.

---

## O que o disparo faz

Todo dia (08:00 BRT, via Vercel Cron) a função `/api/disparo-diario` monta e envia
no WhatsApp o **Relatório Operacional Diário** com:

- 💸 Boletos vencendo em até **2 dias** + vencidos
- 📦 Recebimentos confirmados no dia (entrada no estoque)
- 📄 Pedidos de compra em aberto
- ✅ Entregas de tarefas com prazo hoje / atrasadas

---

## Passo 1 — Conseguir as credenciais do WhatsApp (grátis)

Use a **Meta Cloud API** (número de teste = grátis, envia para até 5 números):

1. https://developers.facebook.com → criar conta de desenvolvedor
2. Criar **App** tipo *Business* → adicionar produto **WhatsApp**
3. Na tela aparece: **Phone Number ID** + **token temporário**
4. Cadastrar os números que vão **receber** (até 5) e confirmar cada um
5. Token permanente: https://business.facebook.com/settings → **Usuários do sistema**
   → gerar token com permissão `whatsapp_business_messaging`
6. (Para envio agendado) criar um **template** aprovado categoria *Utilitário*

Chave do Gemini (já usada pela Liz): https://aistudio.google.com/app/apikey

---

## Passo 2 — Variáveis de ambiente na Vercel

Vercel → projeto **amore** → **Settings → Environment Variables** (marque **Production**):

| Variável | Valor | Obrigatória |
|---|---|---|
| `WHATSAPP_TOKEN` | token permanente da Meta Cloud API | ✅ |
| `WHATSAPP_PHONE_ID` | Phone Number ID do número | ✅ |
| `WHATSAPP_RECIPIENTS` | números com DDI, separados por vírgula. Ex: `5581999998888,5581988887777` | ✅ |
| `CRON_SECRET` | um segredo qualquer (protege o endpoint). Ex: `amore-2026-xyz` | recomendada |
| `WHATSAPP_LOJA` | nome da loja para filtrar. Vazio = todas as lojas | opcional |
| `WHATSAPP_TEMPLATE` | nome do template aprovado (para envio fora da janela de 24h) | opcional |

Já devem existir (não mexer): `VITE_GEMINI_API_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

Depois de salvar → **Deployments → Redeploy**.

---

## Passo 3 — Testar

**Ver o relatório SEM enviar** (funciona só com o Supabase, antes de configurar o WhatsApp):

```
https://SEU-DOMINIO/api/disparo-diario?preview=1
```

Retorna o texto do relatório com os dados reais. Se aparecer o relatório, a parte de
dados está 100%.

**Disparo real** (depois de configurar o WhatsApp): a Vercel chama sozinha às 08:00.
Para testar manualmente:

```
https://SEU-DOMINIO/api/disparo-diario?secret=SEU_CRON_SECRET
```

---

## Agendamento

Já configurado em `vercel.json`:

```json
"crons": [{ "path": "/api/disparo-diario", "schedule": "0 11 * * *" }]
```

`0 11 * * *` = 11:00 UTC = **08:00 horário de Brasília**. Para mudar o horário, altere
o campo `schedule` (formato cron, em UTC).

> Observação: Vercel Cron Jobs exigem que o projeto esteja num plano que suporte crons.
> No plano Hobby roda 1x/dia (suficiente para este relatório).

---

## Observação sobre o template (envio agendado)

Para a Meta permitir **iniciar** a conversa (enviar às 08h sem a pessoa ter mandado
mensagem antes), é preciso um **template aprovado**. Se `WHATSAPP_TEMPLATE` estiver
definido, a função envia via template (resumo curto). Sem template, envia texto livre —
que só é entregue se houver uma janela de conversa aberta nas últimas 24h.
