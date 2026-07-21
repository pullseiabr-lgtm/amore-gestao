// Catálogo compartilhado de unidades e categorias de produto.
// Fonte única para Produtos, Estoque, Requisições e Cotação — evita listas divergentes.

/** Unidades de medida (mesma lista do cadastro de produto). */
export const UNIDADES = [
  'Miligrama', 'Grama', 'Quilograma', 'Tonelada',
  'Mililitro', 'Litro',
  'Unidade', 'Caixa', 'Peça', 'Dúzia', 'Garrafa', 'Frasco',
  'Galão', 'Pote', 'Rolo', 'Pacote', 'Lata', 'Saco',
  'Metro', 'Centímetro', 'Par', 'Barrica', 'Tambor', 'Fardo',
  'Bisnaga', 'Maço', 'Bandeja', 'Embalagem', 'Display', 'Pente', 'Balde',
]

/** Categorias de produto (mesma lista do estoque). */
export const CATEGORIAS = [
  'Açaí', 'Bebidas', 'Carnes', 'Condimentos', 'Embalagens', 'Frutas',
  'Graos', 'Higiene', 'Laticínios', 'Legumes', 'Limpeza', 'Proteínas',
]
