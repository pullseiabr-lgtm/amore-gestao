-- Amplia os tipos aceitos em estoque_movimentacoes para o módulo Transferências/Vendas internas
alter table estoque_movimentacoes drop constraint estoque_movimentacoes_tipo_check;
alter table estoque_movimentacoes add constraint estoque_movimentacoes_tipo_check check (tipo = any (array['entrada','saida','ajuste','estorno','transferencia','perda','beneficiamento','transferencia_saida','transferencia_entrada','venda_interna_saida','venda_interna_entrada','entrada_manual','estorno_saida','estorno_entrada']));
