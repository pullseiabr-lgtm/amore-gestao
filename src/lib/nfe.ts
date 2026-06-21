// ── Parser de NF-e (XML) — AmoreFood Supply Intelligence ──────────
// Lê o XML da NF-e (padrão SEFAZ) e extrai cabeçalho, totais e itens.

export interface NFeItem {
  descricao: string
  ncm: string
  cfop: string
  unidade: string
  quantidade: number
  valorUnitario: number
  valorTotal: number
}

export interface NFeParsed {
  chave: string
  numero: string
  serie: string
  dataEmissao: string // YYYY-MM-DD
  fornecedorCnpj: string
  fornecedorNome: string
  valorProdutos: number
  valorImpostos: number
  valorTotal: number
  formaPagamento: string
  itens: NFeItem[]
}

const PAG: Record<string, string> = {
  '01': 'Dinheiro', '02': 'Cheque', '03': 'Cartão de Crédito', '04': 'Cartão de Débito',
  '05': 'Crédito Loja', '10': 'Vale Alimentação', '11': 'Vale Refeição', '15': 'Boleto',
  '17': 'Pix', '90': 'Sem pagamento', '99': 'Outros',
}

const num = (s: string) => parseFloat((s || '0').replace(',', '.')) || 0

export function parseNFeXML(xml: string): NFeParsed {
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  if (doc.getElementsByTagName('parsererror').length) throw new Error('XML inválido')

  const infNFe = doc.getElementsByTagName('infNFe')[0]
  if (!infNFe) throw new Error('Arquivo não é uma NF-e válida (infNFe não encontrado)')

  const t = (parent: Element | null | undefined, tag: string): string => {
    const el = parent?.getElementsByTagName(tag)[0]
    return el?.textContent?.trim() || ''
  }

  const chave = (infNFe.getAttribute('Id') || '').replace(/^NFe/i, '')
  const ide = infNFe.getElementsByTagName('ide')[0]
  const emit = infNFe.getElementsByTagName('emit')[0]
  const total = infNFe.getElementsByTagName('ICMSTot')[0]

  const dh = t(ide, 'dhEmi') || t(ide, 'dEmi')
  const dataEmissao = dh ? dh.slice(0, 10) : ''

  const valorImpostos =
    num(t(total, 'vICMS')) + num(t(total, 'vIPI')) + num(t(total, 'vST')) + num(t(total, 'vII'))

  const itens: NFeItem[] = Array.from(infNFe.getElementsByTagName('det')).map(det => {
    const prod = det.getElementsByTagName('prod')[0]
    return {
      descricao: t(prod, 'xProd'),
      ncm: t(prod, 'NCM'),
      cfop: t(prod, 'CFOP'),
      unidade: t(prod, 'uCom') || 'un',
      quantidade: num(t(prod, 'qCom')),
      valorUnitario: num(t(prod, 'vUnCom')),
      valorTotal: num(t(prod, 'vProd')),
    }
  })

  return {
    chave,
    numero: t(ide, 'nNF'),
    serie: t(ide, 'serie'),
    dataEmissao,
    fornecedorCnpj: t(emit, 'CNPJ'),
    fornecedorNome: t(emit, 'xFant') || t(emit, 'xNome'),
    valorProdutos: num(t(total, 'vProd')),
    valorImpostos,
    valorTotal: num(t(total, 'vNF')),
    formaPagamento: PAG[t(infNFe, 'tPag')] || 'A definir',
    itens,
  }
}
