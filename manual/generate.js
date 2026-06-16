const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType,
  BorderStyle, ShadingType, PageBreak, Header
} = require('docx');

const DIR = __dirname;
const BORDO = '7A1F2B';
const BORDO_L = 'A83A48';
const INK = '26201F';
const MUTED = '8A807E';
const CREAMBG = 'FBEEF0';

const img = (file, w, h) => new Paragraph({
  alignment: AlignmentType.CENTER, spacing: { before: 120, after: 120 },
  children: [ new ImageRun({ type: 'png', data: fs.readFileSync(path.join(DIR, file)), transformation: { width: w, height: h } }) ],
});
const h1 = (t) => new Paragraph({
  spacing: { before: 320, after: 120 }, keepNext: true,
  border: { bottom: { color: BORDO, space: 6, style: BorderStyle.SINGLE, size: 18 } },
  children: [ new TextRun({ text: t, bold: true, size: 30, color: BORDO, font: 'Calibri' }) ],
});
const h2 = (t) => new Paragraph({
  spacing: { before: 200, after: 70 }, keepNext: true,
  children: [ new TextRun({ text: t, bold: true, size: 23, color: BORDO_L, font: 'Calibri' }) ],
});
const p = (t) => new Paragraph({
  spacing: { after: 100, line: 300 }, alignment: AlignmentType.JUSTIFIED,
  children: [ new TextRun({ text: t, size: 21, color: INK, font: 'Calibri' }) ],
});
const bullet = (lead, rest) => new Paragraph({
  bullet: { level: 0 }, spacing: { after: 55, line: 285 },
  children: [
    ...(lead ? [ new TextRun({ text: lead + ' ', bold: true, size: 21, color: BORDO, font: 'Calibri' }) ] : []),
    new TextRun({ text: rest, size: 21, color: INK, font: 'Calibri' }),
  ],
});
const step = (n, t) => new Paragraph({
  spacing: { after: 55, line: 285 }, indent: { left: 120 },
  children: [
    new TextRun({ text: ` ${n} `, bold: true, size: 20, color: 'FFFFFF', font: 'Calibri', shading: { type: ShadingType.SOLID, color: BORDO, fill: BORDO } }),
    new TextRun({ text: '  ' + t, size: 21, color: INK, font: 'Calibri' }),
  ],
});
const tip = (t) => new Paragraph({
  spacing: { before: 90, after: 120 }, shading: { type: ShadingType.SOLID, color: CREAMBG, fill: CREAMBG },
  border: { left: { color: BORDO, space: 10, style: BorderStyle.SINGLE, size: 24 } }, indent: { left: 160 },
  children: [ new TextRun({ text: '💡 Dica: ', bold: true, size: 20, color: BORDO, font: 'Calibri' }), new TextRun({ text: t, size: 20, color: INK, font: 'Calibri' }) ],
});
const pageBreak = () => new Paragraph({ children: [ new PageBreak() ] });
const spacer = (after = 120) => new Paragraph({ spacing: { after }, children: [ new TextRun('') ] });

const C = [];

// ---------- CAPA (sem logo, padrão bordô) ----------
C.push(spacer(480));
C.push(new Paragraph({
  alignment: AlignmentType.CENTER, spacing: { after: 0 },
  shading: { type: ShadingType.SOLID, color: BORDO, fill: BORDO },
  children: [ new TextRun({ text: '  MANUAL DO USUÁRIO  ', bold: true, size: 48, color: 'FFFFFF', font: 'Calibri' }) ],
}));
C.push(new Paragraph({
  alignment: AlignmentType.CENTER, spacing: { before: 280, after: 40 },
  children: [ new TextRun({ text: 'Amore Gestão', bold: true, size: 64, color: BORDO, font: 'Calibri' }) ],
}));
C.push(new Paragraph({
  alignment: AlignmentType.CENTER, spacing: { after: 30 },
  children: [ new TextRun({ text: 'Guia completo do painel', size: 28, color: BORDO_L, font: 'Calibri' }) ],
}));
C.push(new Paragraph({
  alignment: AlignmentType.CENTER, spacing: { after: 360 },
  children: [ new TextRun({ text: 'painel.amorefood.com.br', italics: true, bold: true, size: 26, color: MUTED, font: 'Calibri' }) ],
}));
C.push(new Paragraph({
  alignment: AlignmentType.CENTER, spacing: { before: 200 },
  border: { top: { color: BORDO_L, space: 8, style: BorderStyle.SINGLE, size: 8 }, bottom: { color: BORDO_L, space: 8, style: BorderStyle.SINGLE, size: 8 } },
  children: [ new TextRun({ text: 'Sistema de Gestão Operacional para os Restaurantes Amore Food', size: 20, color: INK, font: 'Calibri' }) ],
}));
C.push(pageBreak());

// ---------- 1. SOBRE ----------
C.push(h1('1. Sobre o Amore Gestão'));
C.push(p('O Amore Gestão é a plataforma central de operação das lojas Amore Food. Em um único painel, a equipe controla estoque, compras, finanças, operação de salão e cozinha, marketing e desempenho — com dados em tempo real, automações e a assistente de IA Liz.'));
C.push(p('Este manual cobre todos os módulos do painel, com passo a passo de uso. Acesse sempre por painel.amorefood.com.br.'));
C.push(h2('Mapa de módulos'));
C.push(bullet('Visão Geral —', 'Dashboard, Vendas, Dashboard de Suprimentos.'));
C.push(bullet('Estoque & Produtos —', 'Estoque, Produtos, Categorias, Ruptura, Enxoval, Alertas & Rastreabilidade.'));
C.push(bullet('Compras & Suprimentos —', 'Compras, Requisições, Requisições Automáticas, Pipeline, Lista Padronizada, Compra vs Lista, Fornecedores, Agente de Compras.'));
C.push(bullet('Financeiro —', 'Financeiro e Central de Boletos.'));
C.push(bullet('Operação —', 'Cozinha, Salão e PDV.'));
C.push(bullet('Tarefas & Planejamento —', 'Central de Tarefas, Pendências & OS, Planejamento, Atas de Reunião.'));
C.push(bullet('Marketing & IA —', 'Marketing, Agente Liz, Market Analytics.'));
C.push(bullet('Gestão —', 'Gamificação, Usuários e Configurações.'));

// ---------- 2. PRIMEIROS PASSOS ----------
C.push(h1('2. Primeiros Passos'));
C.push(h2('Acesso'));
C.push(step('1', 'Abra painel.amorefood.com.br no navegador.'));
C.push(step('2', 'Informe e-mail e senha e clique em Entrar.'));
C.push(step('3', 'No topo, escolha a loja (ex.: Amore CD, Amore Paiva). Administradores alternam entre lojas; demais usuários veem apenas a sua.'));
C.push(h2('Navegação'));
C.push(bullet('Menu lateral —', 'acessa todos os módulos, agrupados por área.'));
C.push(bullet('Seletor de loja —', 'filtra todos os dados pela unidade selecionada.'));
C.push(bullet('Busca e filtros —', 'presentes em cada listagem para localizar itens rápido.'));
C.push(tip('Selecione a loja correta ANTES de cadastrar ou consultar — cada loja tem seus próprios dados.'));
C.push(pageBreak());

// ---------- 3. DASHBOARD & VISÃO GERAL ----------
C.push(h1('3. Dashboard & Visão Geral'));
C.push(img('02_dashboard.png', 600, 404));
C.push(p('O Dashboard reúne os indicadores da operação no período: valor em estoque, pedidos, economia em cotações e itens críticos, além de gráficos por categoria e alertas recentes.'));
C.push(h2('Vendas'));
C.push(p('Painel gerencial de vendas com faturamento, ticket médio e evolução por período — visão de resultado sem operar PDV.'));
C.push(h2('Dashboard de Suprimentos'));
C.push(p('Indicadores da cadeia de compras: requisições em aberto, pedidos, recebimentos, economia e boletos a vencer.'));

// ---------- 4. ESTOQUE ----------
C.push(h1('4. Estoque'));
C.push(img('03_estoque.png', 600, 404));
C.push(p('Mostra todos os produtos da loja com nível atual, status (Crítico, Repor, Ok, Ideal), mínimo e ideal. As cores facilitam a leitura: vermelho exige reposição, amarelo é atenção, verde está saudável.'));
C.push(h2('Passo a passo'));
C.push(step('1', 'Selecione a loja e use busca/categoria para localizar produtos.'));
C.push(step('2', 'Clique em "Adicionar Produto" (nome, gramatura, categoria, mínimo, ideal, preço).'));
C.push(step('3', 'Use "Edição em Massa" para ajustar vários níveis de uma vez.'));
C.push(step('4', 'Em Movimentações, registre entradas/saídas — o nível é atualizado automaticamente.'));
C.push(step('5', 'Em Contagem, faça a contagem física; o sistema atualiza o estoque com o valor contado.'));
C.push(h2('Recursos relacionados'));
C.push(bullet('Alertas & Rastreabilidade —', 'itens críticos, lotes e validade.'));
C.push(bullet('Ruptura de Pedidos —', 'identifica faltas que impactam o pedido.'));
C.push(bullet('Controle de Enxoval —', 'gestão de itens de enxoval/utensílios.'));
C.push(tip('Os Alertas Críticos geram mensagens prontas (WhatsApp/e-mail) com a sugestão de reposição.'));
C.push(pageBreak());

// ---------- 5. PRODUTOS ----------
C.push(h1('5. Produtos & Categorias'));
C.push(p('O módulo Produtos é o catálogo central: cadastro, código interno, unidade, preço, fornecedor padrão e status de homologação. As Categorias organizam os produtos por tipo.'));
C.push(h2('Passo a passo'));
C.push(step('1', 'Selecione a loja (não use "Todas as Lojas" para criar).'));
C.push(step('2', 'Clique em "Criar Produto" e preencha nome, unidade e categoria.'));
C.push(step('3', 'Defina fornecedor padrão e preço de referência, se houver.'));
C.push(step('4', 'Em Categorias, crie/edite as categorias usadas no cadastro.'));
C.push(tip('Se o botão de criar não aparecer, verifique se há uma loja específica selecionada (não "Todas as Lojas").'));

// ---------- 6. COMPRAS & SUPRIMENTOS ----------
C.push(h1('6. Compras & Suprimentos'));
C.push(img('04_compras.png', 600, 404));
C.push(p('O fluxo de suprimentos acompanha cada pedido: Requisição → Cotação → Aprovação → Pedido → Recebimento. O comparativo evidencia o melhor preço e prazo de cada fornecedor.'));
C.push(h2('Passo a passo'));
C.push(step('1', 'Crie uma Requisição com os itens por setor.'));
C.push(step('2', 'Gere a Cotação e registre as respostas dos fornecedores (ou use a Liz para prospectar).'));
C.push(step('3', 'Envie para Aprovação — aplica a régua de alçada e o limite orçamentário.'));
C.push(step('4', 'Aprovado, vira Pedido de Compra (PC) automático.'));
C.push(step('5', 'No Recebimento, valide a Nota Fiscal e confirme — o estoque é atualizado com o recebido.'));
C.push(h2('Ferramentas de apoio'));
C.push(bullet('Requisições Automáticas —', 'geram pedidos com base no nível mínimo.'));
C.push(bullet('Lista de Compras Padronizada —', 'modelo fixo de itens recorrentes.'));
C.push(bullet('Compra vs Lista —', 'compara o que foi comprado com a lista padrão.'));
C.push(bullet('Agente Analítico de Compras —', 'análises e sugestões de economia.'));
C.push(pageBreak());

// ---------- 7. FORNECEDORES ----------
C.push(h1('7. Fornecedores'));
C.push(p('Cadastro e gestão dos fornecedores: dados de contato, CNPJ, prazos e histórico de cotações. Integra-se às Requisições e ao comparativo de preços.'));
C.push(h2('Passo a passo'));
C.push(step('1', 'Clique em "Novo Fornecedor" e preencha nome, CNPJ e contato.'));
C.push(step('2', 'Vincule categorias/produtos que ele fornece.'));
C.push(step('3', 'Use a Liz para prospectar novos fornecedores na web por produto/região.'));

// ---------- 8. FINANCEIRO ----------
C.push(h1('8. Financeiro & Boletos'));
C.push(img('05_financeiro.png', 600, 404));
C.push(p('Consolida contas a pagar/receber, saldo e a Central de Boletos. Boletos próximos do vencimento são destacados, evitando atrasos.'));
C.push(h2('Como usar'));
C.push(bullet('Novo Lançamento —', 'registre receitas e despesas com categoria e vencimento.'));
C.push(bullet('Central de Boletos —', 'cadastre o boleto (inclusive por foto/IA) e acompanhe o status.'));
C.push(bullet('Prestação de Contas —', 'organize comprovantes e fechamentos por período.'));
C.push(tip('A Liz envia relatório diário no WhatsApp com boletos a vencer em 2 dias, recebimentos do dia e pedidos em aberto.'));
C.push(pageBreak());

// ---------- 9. OPERAÇÃO ----------
C.push(h1('9. Operação: Cozinha, Salão e PDV'));
C.push(h2('Cozinha'));
C.push(p('Acompanha os pedidos da cozinha em tempo real (estilo KDS): itens a preparar, em produção e prontos, organizando o fluxo do preparo.'));
C.push(h2('Salão'));
C.push(p('Gestão do atendimento no salão: mesas/comandas, status de atendimento e acompanhamento do serviço.'));
C.push(h2('PDV — Ponto de Venda'));
C.push(p('Frente de caixa para registro de vendas, quando habilitado para a loja.'));
C.push(tip('Cozinha e Salão funcionam melhor em telas dedicadas (tablet/monitor) no ambiente de operação.'));

// ---------- 10. TAREFAS & PLANEJAMENTO ----------
C.push(h1('10. Tarefas & Planejamento'));
C.push(h2('Central de Tarefas'));
C.push(p('Crie, atribua e acompanhe tarefas da equipe, com prazo, responsável e status. Anexos (foto/PDF) podem ser adicionados como evidência.'));
C.push(h2('Pendências & OS'));
C.push(p('Registro de pendências e ordens de serviço (manutenção/operação), com evidências e acompanhamento até a conclusão.'));
C.push(h2('Planejamento Operacional'));
C.push(p('Organização das ações e metas operacionais do período.'));
C.push(h2('Atas de Reunião'));
C.push(p('Registre as atas com participantes, decisões e anexos de documentos/imagens.'));
C.push(pageBreak());

// ---------- 11. MARKETING & LIZ ----------
C.push(h1('11. Marketing & Agente Liz (IA)'));
C.push(img('06_liz.png', 600, 404));
C.push(p('A Liz é a assistente de IA do Amore Gestão. Ela prospecta fornecedores, cria campanhas e responde perguntas sobre a operação. O Calendário de Campanhas sugere datas comemorativas e cria peças com um clique.'));
C.push(h2('O que a Liz faz'));
C.push(bullet('Prospecção —', 'busca fornecedores reais por produto/região.'));
C.push(bullet('Campanhas com IA —', 'gera posts para Instagram e WhatsApp e ideias de combos.'));
C.push(bullet('Calendário —', 'planeje ações nas datas (Namorados, Mães, Natal, Black Friday).'));
C.push(bullet('Consultas —', 'pergunte sobre estoque, pedidos e tarefas em linguagem natural.'));
C.push(h2('Market Analytics'));
C.push(p('Inteligência de mercado e de fornecedores para apoiar decisões de compra.'));

// ---------- 12. GAMIFICAÇÃO ----------
C.push(h1('12. Gamificação'));
C.push(img('07_gamificacao.png', 600, 404));
C.push(p('Engaja a equipe com ranking, metas e pontos. Cada ação importante (contagem de estoque, recebimento validado, cotação concluída, tarefa no prazo) gera pontos configuráveis pela gestão.'));
C.push(bullet('Ranking —', 'desempenho individual e progresso rumo à meta.'));
C.push(bullet('Metas e pesos —', 'a gestão define os pontos de cada atividade.'));
C.push(bullet('Reconhecimento —', 'use o ranking para premiar e motivar o time.'));
C.push(pageBreak());

// ---------- 13. ADMINISTRAÇÃO ----------
C.push(h1('13. Administração'));
C.push(h2('Usuários'));
C.push(p('Cadastro de usuários, definição de papel (admin, gestor, operador) e da loja de cada um, controlando o que cada pessoa acessa.'));
C.push(h2('Configurações'));
C.push(p('Ajustes do sistema: lojas disponíveis, identidade visual, módulos ativos e chaves de integração (ex.: a chave da Liz para IA e prospecção).'));
C.push(tip('Mantenha cada usuário na sua loja e papel corretos — isso garante segurança e dados organizados.'));

// ---------- 14. PADRÃO ----------
C.push(h1('14. O Padrão Amore Gestão'));
C.push(bullet('Tempo real —', 'tudo que você cadastra aparece imediatamente para a equipe.'));
C.push(bullet('Automação —', 'recebimento atualiza estoque, cotação calcula economia, boletos avisam vencimento.'));
C.push(bullet('Inteligência —', 'a Liz acelera compras e marketing com IA.'));
C.push(bullet('Multiloja —', 'cada unidade com seus dados, sob uma visão central.'));
C.push(bullet('Consistência —', 'interface padronizada e fácil de aprender.'));
C.push(spacer(220));
C.push(new Paragraph({
  alignment: AlignmentType.CENTER, spacing: { before: 200 },
  border: { top: { color: BORDO, space: 8, style: BorderStyle.SINGLE, size: 12 } },
  children: [ new TextRun({ text: 'Amore Gestão — painel.amorefood.com.br', bold: true, size: 20, color: BORDO, font: 'Calibri' }) ],
}));

// ---------- HEADER (texto bordô, sem logo) ----------
const txtHeader = new Header({ children: [ new Paragraph({
  alignment: AlignmentType.RIGHT, spacing: { after: 40 },
  border: { bottom: { color: BORDO, space: 4, style: BorderStyle.SINGLE, size: 6 } },
  children: [ new TextRun({ text: 'Amore Gestão  ·  Manual do Usuário', bold: true, size: 16, color: BORDO, font: 'Calibri' }) ],
}) ] });
const emptyHeader = new Header({ children: [ new Paragraph({ children: [ new TextRun('') ] }) ] });

const doc = new Document({
  creator: 'Amore Gestão', title: 'Manual do Usuário — Amore Gestão',
  sections: [ {
    properties: { titlePage: true, page: { margin: { top: 1100, bottom: 900, left: 1000, right: 1000 } } },
    headers: { default: txtHeader, first: emptyHeader },
    children: C,
  } ],
});
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(path.join(DIR, 'Manual_Amore_Gestao.docx'), buf);
  console.log('OK gerado (' + Math.round(buf.length / 1024) + ' KB)');
});
