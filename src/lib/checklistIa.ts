// IA dos Checklists (Operação Padrão) — reusa o proxy /api/gemini (mesma
// infra da Liz). A chave fica server-side (app_config/env); em fallback,
// envia a chave do bundle via ?k=.
import type { ChecklistItem, ChecklistItemTipo } from '../types/database'

const GEMINI_KEY = (import.meta.env.VITE_GEMINI_API_KEY as string) || ''

async function gemini(parts: unknown[], systemPrompt: string): Promise<string> {
  const params = new URLSearchParams({ model: 'gemini-2.5-flash' })
  if (GEMINI_KEY) params.set('k', GEMINI_KEY)
  const resp = await fetch(`/api/gemini?${params}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
    }),
  })
  const data = await resp.json()
  if (!resp.ok) throw new Error(data?.error || `Gemini HTTP ${resp.status}`)
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}

function extrairJson(txt: string): any {
  const m = txt.match(/\[[\s\S]*\]|\{[\s\S]*\}/)
  if (!m) throw new Error('IA não retornou JSON válido.')
  return JSON.parse(m[0])
}

// Gera itens de checklist a partir de um objetivo em texto livre.
export async function gerarItensIA(titulo: string, setor: string, descricao: string): Promise<ChecklistItem[]> {
  const sys = `Você é especialista em operação de restaurantes/food service. ` +
    `Gere itens de checklist objetivos e executáveis pela equipe de chão.`
  const prompt = `Gere os itens de um checklist operacional.
Título: "${titulo}"
Setor: ${setor}
Contexto: ${descricao || '(sem contexto extra)'}

Retorne APENAS um array JSON. Cada item:
{"txt": "ação clara e curta", "tipo": "confirm|numero|foto|avaliacao", "obrigatorio": true|false, "critico": true|false, "peso": 1-3}

Regras:
- "foto" para itens que precisam de evidência visual (limpeza, organização, temperatura de equipamento).
- "numero" para medições (ex.: temperatura, quantidade).
- "avaliacao" para qualidade subjetiva (ex.: aparência do salão).
- "confirm" para o resto.
- Marque "critico": true em itens de segurança alimentar/risco.
- 5 a 10 itens. Apenas o JSON, sem markdown.`
  const txt = await gemini([{ text: prompt }], sys)
  const arr = extrairJson(txt) as any[]
  const tiposOk: ChecklistItemTipo[] = ['confirm', 'numero', 'foto', 'avaliacao']
  return arr.slice(0, 12).map((x) => ({
    id: crypto.randomUUID(),
    txt: String(x.txt || '').slice(0, 200),
    tipo: tiposOk.includes(x.tipo) ? x.tipo : 'confirm',
    obrigatorio: x.obrigatorio !== false,
    critico: !!x.critico,
    peso: Math.max(1, Math.min(3, Number(x.peso) || 1)),
  })).filter(i => i.txt)
}

// Valida uma foto-evidência contra a descrição do item.
// Recebe o File (lido como base64 inline para a visão do Gemini).
export async function validarFotoIA(itemTxt: string, file: File): Promise<{ ok: boolean; motivo: string }> {
  const base64 = await fileToBase64(file)
  const sys = `Você audita evidências fotográficas de checklists de restaurante. ` +
    `Seja rigoroso, mas justo. Responda só com JSON.`
  const prompt = `O item do checklist é: "${itemTxt}".
A foto anexada é a evidência. A foto comprova que o item foi cumprido adequadamente?
Retorne APENAS: {"ok": true|false, "motivo": "curto, em português"}`
  const parts = [
    { text: prompt },
    { inline_data: { mime_type: file.type || 'image/jpeg', data: base64 } },
  ]
  const txt = await gemini(parts, sys)
  const j = extrairJson(txt)
  return { ok: !!j.ok, motivo: String(j.motivo || '').slice(0, 200) }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const res = String(reader.result || '')
      resolve(res.includes(',') ? res.split(',')[1] : res) // remove o prefixo data:...;base64,
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
