# PROMPT MASTER — SISTEMA DE GESTÃO FINANCEIRA PESSOAL

## 1. OBJETIVO DO PROJETO

Desenvolva uma aplicação web completa de gestão financeira pessoal, moderna, intuitiva, responsiva e altamente funcional, com foco em controle de receitas, despesas, cartões de crédito, contas a pagar, compras parceladas, orçamento, metas, patrimônio e planejamento financeiro.

O sistema deverá combinar três conceitos:

1. **Controle financeiro detalhado:** acompanhamento individual de cada despesa, incluindo quem pagou, quem deve, valores compartilhados e saldos disponíveis.
2. **Dashboard financeiro inteligente:** visualização clara de receitas, despesas, saldo, investimentos, faturas e indicadores de saúde financeira.
3. **Planejamento financeiro estratégico:** projeções futuras, metas, reserva de emergência, patrimônio e recomendações financeiras.

O projeto deve ser uma aplicação funcional, com persistência real dos dados, cálculos consistentes e navegação fluida.

**Nome provisório:** Finanças+.

**Idioma:** Português do Brasil.

**Moeda padrão:** Real brasileiro (BRL).

**Formato de data:** DD/MM/AAAA.

**Fuso horário padrão:** America/Sao_Paulo.

---

# 2. DESIGN E EXPERIÊNCIA DO USUÁRIO

Utilize as três imagens fornecidas como referências visuais.

O design deve transmitir modernidade, organização, confiabilidade e sofisticação.

### Identidade visual

- Estilo SaaS financeiro premium.
- Interface minimalista e elegante.
- Fundo geral cinza muito claro (#F5F7FB).
- Cards brancos com bordas discretas.
- Cor principal azul (#2563EB).
- Verde para receitas e indicadores positivos.
- Vermelho para despesas, atrasos e alertas.
- Laranja para compromissos futuros.
- Roxo para investimentos e patrimônio.
- Tipografia Inter ou similar.
- Bordas arredondadas de 12 a 16 pixels.
- Sombras suaves.
- Ícones Lucide.
- Animações discretas e rápidas.

### Estrutura principal

Criar um layout com:

**Barra lateral esquerda:**

- Visão geral
- Transações
- Receitas
- Despesas
- Contas a pagar
- Contas a receber
- Cartões de crédito
- Compras parceladas
- Recorrências
- Orçamentos
- Metas financeiras
- Investimentos
- Patrimônio
- Dívidas
- Fluxo de caixa
- Relatórios
- Configurações

**Barra superior:**

- Saudação personalizada.
- Seletor de mês e ano.
- Pesquisa global.
- Notificações.
- Botão de adicionar lançamento.
- Alternância entre tema claro e escuro.
- Perfil do usuário.

A navegação deve funcionar sem recarregamentos desnecessários.

Priorize excelente experiência em computadores, tablets e smartphones.

---

# 3. DASHBOARD PRINCIPAL

A página inicial deverá apresentar uma visão financeira completa do mês selecionado.

## 3.1 Indicadores superiores

Criar cards com:

**Saldo disponível**

Valor disponível nas contas financeiras, considerando os lançamentos efetivamente realizados.

**Receitas do mês**

Total de receitas recebidas no período.

**Despesas do mês**

Total de despesas realizadas no período, seguindo o regime de visualização selecionado.

**Resultado mensal**

Receitas menos despesas do período.

**Contas a pagar**

Valor total de obrigações pendentes.

**Faturas de cartão**

Valor das faturas abertas, fechadas e vencidas.

**Investimentos**

Valor total da carteira de investimentos.

**Patrimônio líquido**

Ativos menos passivos.

Cada card deve apresentar:

- Valor principal.
- Variação percentual em relação ao mês anterior.
- Indicador visual de tendência.
- Ícone representativo.
- Informação complementar.
- Possibilidade de abrir o detalhamento.

Não confundir saldo bancário com resultado mensal ou limite disponível do cartão.

## 3.2 Gráfico de evolução financeira

Criar um gráfico interativo contendo:

- Receitas.
- Despesas.
- Investimentos.
- Resultado líquido.

Permitir alternar entre visualizações mensais e anuais.

Ao passar o cursor, apresentar valores detalhados.

## 3.3 Distribuição de despesas

Criar gráfico de rosca com despesas agrupadas por categoria.

Exibir ao lado:

- Nome da categoria.
- Valor gasto.
- Participação percentual.
- Comparação com o orçamento.
- Indicador de excesso de gastos.

Ao clicar em uma categoria, filtrar automaticamente as transações correspondentes.

## 3.4 Próximos vencimentos

Exibir lista de contas com:

- Descrição.
- Valor.
- Data de vencimento.
- Dias restantes.
- Status.
- Botão de marcar como pago.

Destacar contas vencidas e próximas do vencimento.

## 3.5 Indicadores complementares

Incluir:

- Economia do mês.
- Taxa de poupança.
- Percentual da renda comprometida.
- Total de despesas fixas.
- Total de despesas variáveis.
- Valor de parcelas futuras.
- Reserva de emergência.
- Evolução do patrimônio.

---

# 4. MÓDULO DE TRANSAÇÕES

Criar um sistema completo de lançamentos financeiros.

### Tipos de transação

- Receita.
- Despesa.
- Transferência entre contas.
- Investimento.
- Resgate.
- Ajuste de saldo.
- Reembolso.
- Estorno.

### Campos dos lançamentos

- Descrição.
- Valor.
- Tipo.
- Categoria.
- Subcategoria.
- Conta financeira.
- Forma de pagamento.
- Data da transação.
- Data de competência.
- Data de vencimento.
- Data de pagamento.
- Status.
- Responsável.
- Observações.
- Tags.
- Comprovante ou anexo.
- Indicação de despesa compartilhada.
- Indicação de recorrência.
- Indicação de parcelamento.

### Funcionalidades

Permitir:

- Criar.
- Editar.
- Duplicar.
- Excluir.
- Pesquisar.
- Filtrar.
- Ordenar.
- Importar.
- Exportar.

Implementar filtros combináveis por período, categoria, conta, responsável, status e forma de pagamento.

A tabela deverá apresentar paginação e permitir seleção múltipla.

Criar ações em lote, como alteração de categoria, exclusão e marcação de pagamento.

Todas as ações devem atualizar imediatamente os indicadores afetados.

---

# 5. CONTAS BANCÁRIAS E CARTEIRAS

Permitir cadastrar múltiplas contas financeiras.

Exemplos:

- Conta corrente.
- Conta poupança.
- Carteira física.
- Conta digital.
- Conta conjunta.
- Conta de investimentos.

### Informações

- Nome da instituição.
- Nome personalizado da conta.
- Tipo.
- Saldo inicial.
- Saldo atual.
- Cor e ícone.
- Titular.
- Status ativo/inativo.

### Regras importantes

Transferências entre contas próprias não devem ser contabilizadas como receita ou despesa.

O saldo de cada conta deve ser calculado corretamente a partir do saldo inicial e das movimentações efetivadas.

O sistema deve permitir conciliação bancária e identificação de diferenças entre saldo registrado e saldo informado.

---

# 6. CARTÕES DE CRÉDITO

Desenvolver um módulo específico e completo para cartões de crédito.

Cada cartão deve possuir:

- Nome.
- Instituição.
- Bandeira.
- Quatro últimos dígitos.
- Limite total.
- Limite utilizado.
- Limite disponível.
- Dia de fechamento.
- Dia de vencimento.
- Conta utilizada para pagamento.
- Cor personalizada.
- Status.

### Dashboard dos cartões

Exibir cartões visuais semelhantes aos cartões bancários.

Cada cartão deverá apresentar:

- Limite.
- Fatura atual.
- Próxima fatura.
- Melhor dia de compra.
- Parcelamentos ativos.
- Histórico de faturas.

### Faturas

Criar estados:

- Aberta.
- Fechada.
- Parcialmente paga.
- Paga.
- Vencida.

Permitir pagamento total ou parcial, registrando a saída da conta financeira correspondente.

**Regra fundamental:** uma compra no cartão não pode ser contabilizada novamente como despesa quando a fatura for paga.

Separar claramente despesa por competência e movimentação de caixa.

O pagamento da fatura deve reduzir o saldo da conta bancária e a obrigação do cartão, sem duplicar a despesa.

---

# 7. COMPRAS PARCELADAS

Criar um módulo avançado de parcelamentos.

Ao cadastrar uma compra, permitir informar:

- Descrição.
- Valor total.
- Quantidade de parcelas.
- Valor das parcelas.
- Data da compra.
- Primeiro vencimento.
- Cartão ou forma de pagamento.
- Categoria.
- Responsável.
- Participantes.

### Exemplo

Compra de R$ 3.600,00 em 12 parcelas.

O sistema deverá gerar automaticamente as 12 parcelas de R$ 300,00, vinculadas à compra original.

Exibir:

- Parcela atual.
- Total de parcelas.
- Parcelas pagas.
- Parcelas pendentes.
- Saldo restante.
- Data de conclusão.

Criar uma linha de progresso visual.

### Funcionalidades adicionais

- Antecipar parcelas.
- Registrar pagamento parcial.
- Consultar parcelas futuras.
- Filtrar compras por cartão.
- Identificar mês de término.
- Visualizar comprometimento futuro.
- Cancelar compras e registrar estornos.

Os valores devem ser distribuídos com precisão de centavos, sem diferenças no somatório final.

---

# 8. DESPESAS COMPARTILHADAS

Este módulo é essencial.

O sistema deverá permitir administrar despesas individuais e compartilhadas entre duas ou mais pessoas.

### Perfis de responsabilidade

- Pessoal.
- Compartilhado.
- Pago por outra pessoa.
- Reembolsável.
- Dividido proporcionalmente.

### Exemplo

Uma despesa de aluguel de R$ 1.800,00 é dividida entre duas pessoas.

O sistema deve registrar:

Valor total: R$ 1.800,00.

Parte da pessoa A: R$ 900,00.

Parte da pessoa B: R$ 900,00.

Se a pessoa A pagar integralmente, o sistema deverá identificar automaticamente R$ 900,00 a receber da pessoa B.

### Funcionalidades

- Cadastrar participantes.
- Definir percentuais individuais.
- Dividir igualmente.
- Definir valores personalizados.
- Registrar quem realizou o pagamento.
- Registrar reembolsos.
- Acompanhar saldos entre participantes.
- Identificar quem deve a quem.
- Gerar resumo mensal compartilhado.

### Painel compartilhado

Apresentar:

- Total de despesas da casa.
- Quanto cada pessoa pagou.
- Quanto cabia a cada participante.
- Quanto cada pessoa deve receber.
- Quanto cada pessoa deve pagar.
- Saldo líquido entre participantes.

Implementar compensação de dívidas para evitar transferências desnecessárias.

Não contabilizar reembolsos como novas receitas operacionais nem duplicar despesas compartilhadas.

---

# 9. CONTAS A PAGAR E A RECEBER

Criar uma central de compromissos financeiros.

### Contas a pagar

Permitir:

- Cadastrar obrigações.
- Definir vencimento.
- Definir recorrência.
- Marcar pagamento.
- Registrar pagamento parcial.
- Identificar atrasos.
- Reagendar vencimentos.
- Anexar comprovantes.

### Contas a receber

Permitir controlar:

- Valores emprestados.
- Reembolsos.
- Receitas pendentes.
- Pagamentos de terceiros.
- Recebimentos parcelados.

### Calendário financeiro

Criar calendário mensal com vencimentos e recebimentos previstos.

Exibir total previsto para cada dia e destacar períodos com maior concentração de despesas.

---

# 10. DESPESAS RECORRENTES

Permitir cadastrar despesas que se repetem automaticamente.

Exemplos:

- Aluguel.
- Condomínio.
- Internet.
- Energia.
- Água.
- Academia.
- Streaming.
- Seguros.
- Assinaturas.

### Configurações

- Valor.
- Frequência.
- Data inicial.
- Data final opcional.
- Categoria.
- Conta.
- Forma de pagamento.
- Reajuste previsto.
- Status.

Frequências disponíveis:

- Diária.
- Semanal.
- Quinzenal.
- Mensal.
- Bimestral.
- Trimestral.
- Semestral.
- Anual.

O sistema deve gerar os próximos compromissos sem duplicidade.

Permitir editar somente uma ocorrência ou toda a série.

---

# 11. ORÇAMENTO MENSAL

Criar um módulo para definição de limites de gastos.

O usuário poderá estabelecer:

- Orçamento geral.
- Orçamento por categoria.
- Orçamento por subcategoria.
- Orçamento compartilhado.
- Orçamento por pessoa.

### Exemplo

Alimentação: R$ 1.200,00.

Gasto atual: R$ 840,00.

Disponível: R$ 360,00.

Utilização: 70%.

Exibir barras de progresso e alertas:

- Até 70%: normal.
- Entre 70% e 90%: atenção.
- Acima de 90%: alerta.
- Acima de 100%: orçamento excedido.

Esses limites deverão ser configuráveis.

Permitir copiar o orçamento do mês anterior e comparar planejado versus realizado.

---

# 12. METAS FINANCEIRAS

Criar um módulo de planejamento de objetivos.

Exemplos:

- Viagem internacional.
- Reserva de emergência.
- Compra de veículo.
- Entrada de imóvel.
- Reforma.
- Educação.
- Aposentadoria.

### Campos

- Nome da meta.
- Descrição.
- Valor desejado.
- Valor acumulado.
- Data de conclusão.
- Prioridade.
- Conta ou investimento vinculado.
- Imagem ou ícone.
- Aportes planejados.

### Indicadores

- Percentual concluído.
- Valor restante.
- Meses restantes.
- Aporte mensal necessário.
- Projeção de conclusão.

Criar gráficos de evolução e permitir aportes individuais.

Não contabilizar transferências para metas como despesas quando o dinheiro continuar pertencendo ao usuário.

---

# 13. INVESTIMENTOS

Criar uma visão consolidada de investimentos.

### Categorias

- Renda fixa.
- Tesouro Direto.
- CDB.
- LCI/LCA.
- Fundos.
- Ações.
- ETFs.
- FIIs.
- Previdência.
- Criptomoedas.
- Outros.

### Informações

- Instituição.
- Ativo.
- Quantidade.
- Valor investido.
- Valor atual.
- Rentabilidade nominal.
- Rentabilidade percentual.
- Data de aplicação.
- Liquidez.
- Vencimento.

### Dashboard

Exibir:

- Patrimônio investido.
- Total aportado.
- Ganhos e perdas.
- Evolução histórica.
- Distribuição por classe.
- Rendimentos recebidos.

Permitir atualização manual de cotações e preços.

Integrações automáticas somente quando existirem provedores autorizados e disponíveis.

Distinguir aportes, resgates e rendimentos para evitar distorções nos relatórios.

---

# 14. PATRIMÔNIO E DÍVIDAS

Criar um módulo de patrimônio líquido.

### Ativos

- Dinheiro em contas.
- Investimentos.
- Imóveis.
- Veículos.
- Outros bens.

### Passivos

- Financiamentos.
- Empréstimos.
- Dívidas pessoais.
- Obrigações financeiras.
- Saldo devedor de cartões.

### Indicadores

Patrimônio líquido = ativos − passivos.

Exibir gráfico de evolução mensal e composição patrimonial.

Permitir registrar valor estimado de bens, histórico de avaliações e amortização de dívidas.

Evitar dupla contagem entre cartões, empréstimos, contas a pagar e outros passivos.

---

# 15. FLUXO DE CAIXA E PROJEÇÕES

Desenvolver um módulo de previsão financeira.

O sistema deverá considerar:

- Saldo atual.
- Receitas futuras confirmadas.
- Receitas previstas.
- Contas a pagar.
- Faturas futuras.
- Parcelamentos.
- Despesas recorrentes.
- Transferências programadas.

### Projeções

Permitir visualizar:

- Próximos 7 dias.
- Próximos 30 dias.
- Próximos 3 meses.
- Próximos 6 meses.
- Próximos 12 meses.

Criar gráfico de saldo projetado.

Diferenciar valores confirmados de estimativas.

Identificar possíveis saldos negativos e períodos de maior comprometimento financeiro.

Permitir simular cenários:

- Redução de despesas.
- Aumento de receitas.
- Nova compra parcelada.
- Antecipação de dívida.
- Aporte em investimentos.

---

# 16. RELATÓRIOS E ANÁLISES

Criar relatórios interativos contendo:

1. Receitas versus despesas.
2. Gastos por categoria.
3. Evolução mensal.
4. Comparativo anual.
5. Despesas fixas e variáveis.
6. Compras parceladas.
7. Utilização de cartões.
8. Orçamento versus realizado.
9. Fluxo de caixa.
10. Evolução patrimonial.
11. Despesas compartilhadas.
12. Progresso das metas.

Permitir selecionar períodos personalizados.

### Exportação

- Excel (.xlsx).
- CSV.
- PDF.

Os relatórios devem utilizar os mesmos critérios contábeis e filtros do dashboard.

---

# 17. INDICADOR DE SAÚDE FINANCEIRA

Criar um indicador visual de saúde financeira de 0 a 100 pontos.

O índice deverá considerar:

- Comprometimento da renda.
- Taxa de poupança.
- Reserva de emergência.
- Endividamento.
- Pagamentos em atraso.
- Consistência orçamentária.

Exibir a pontuação e explicar quais fatores contribuíram para o resultado.

Os pesos deverão ser documentados e configuráveis.

Não apresentar a pontuação como avaliação de crédito oficial.

---

# 18. ASSISTENTE FINANCEIRO INTELIGENTE

Criar uma área de análises e recomendações.

O sistema deverá identificar automaticamente situações como:

- Aumento de gastos em determinada categoria.
- Assinaturas recorrentes com custo elevado.
- Meses com muitas parcelas.
- Redução da taxa de poupança.
- Aproximação de vencimentos.
- Orçamentos excedidos.
- Risco de saldo negativo.

### Exemplos de mensagens

"Seus gastos com alimentação aumentaram 18% em relação ao mês anterior."

"Você possui R$ 2.450,00 em parcelas previstas para o próximo mês."

"Reduzindo R$ 200,00 mensais em despesas variáveis, você poderá acumular R$ 2.400,00 adicionais em 12 meses, sem considerar rendimentos."

"Três despesas recorrentes vencem nos próximos cinco dias."

As recomendações devem ser baseadas em cálculos verificáveis, sem inventar informações.

Uma integração com IA generativa poderá ser implementada posteriormente, utilizando apenas dados autorizados.

---

# 19. NOTIFICAÇÕES

Criar central de notificações com:

- Contas próximas do vencimento.
- Contas atrasadas.
- Faturas fechadas.
- Limite de cartão comprometido.
- Orçamento próximo do limite.
- Meta atingida.
- Parcelamento concluído.
- Saldo projetado insuficiente.

Permitir configurar antecedência e ativar ou desativar cada categoria.

Notificações externas por e-mail ou push deverão depender de integração e autorização específicas.

---

# 20. IMPORTAÇÃO DE EXTRATOS

Implementar importação de arquivos:

- CSV.
- OFX.
- XLSX.

### Fluxo de importação

1. Selecionar arquivo.
2. Identificar colunas.
3. Pré-visualizar lançamentos.
4. Escolher conta de destino.
5. Detectar possíveis duplicidades.
6. Sugerir categorias.
7. Confirmar importação.
8. Apresentar resultado.

O sistema deve permitir revisar cada lançamento antes da confirmação.

Implementar prevenção de duplicidade usando identificadores de origem e critérios de conciliação.

---

# 21. AUTENTICAÇÃO E SEGURANÇA

Criar autenticação segura.

### Funcionalidades

- Cadastro.
- Login.
- Recuperação de senha.
- Alteração de senha.
- Perfil do usuário.
- Encerramento de sessão.
- Exclusão de conta.
- Exportação dos dados pessoais.

Implementar isolamento de dados por usuário e por grupo familiar.

Nenhum usuário poderá acessar dados de outro usuário sem autorização explícita.

Registrar operações financeiras importantes em trilha de auditoria.

Não armazenar senhas ou credenciais bancárias em texto puro.

---

# 22. TECNOLOGIAS

Utilizar preferencialmente:

**Frontend**

- Next.js.
- React.
- TypeScript.
- Tailwind CSS.
- shadcn/ui.
- Lucide React.
- Recharts.

**Backend**

- Next.js Server Actions ou API Routes.
- Supabase.
- PostgreSQL.
- Supabase Auth.
- Row Level Security (RLS).
- Supabase Storage para comprovantes.

**Validação**

- Zod.
- React Hook Form.

**Qualidade**

- ESLint.
- Testes automatizados.
- Tratamento de erros.
- Estados de carregamento.
- Componentes reutilizáveis.

### Requisitos técnicos

Utilizar valores monetários em centavos inteiros ou tipo decimal exato no banco de dados.

Nunca utilizar operações de ponto flutuante sem tratamento para cálculos financeiros.

Criar migrations versionadas.

Aplicar políticas RLS em todas as tabelas com dados privados.

Não expor chaves administrativas no frontend.

---

# 23. ESTRUTURA DO BANCO DE DADOS

Projetar um banco relacional consistente.

Tabelas principais sugeridas:

- profiles
- households
- household_members
- financial_accounts
- account_transactions
- categories
- subcategories
- credit_cards
- credit_card_invoices
- credit_card_purchases
- installments
- recurring_rules
- recurring_occurrences
- bills
- receivables
- transaction_splits
- reimbursements
- budgets
- budget_categories
- financial_goals
- goal_contributions
- investment_assets
- investment_transactions
- investment_valuations
- assets
- liabilities
- liability_payments
- notifications
- import_batches
- import_rows
- attachments
- audit_logs
- user_settings

Definir chaves primárias, estrangeiras, índices e restrições de integridade.

Criar relacionamentos que permitam rastrear cada parcela, fatura, pagamento e reembolso até sua origem.

### Regras de integridade

- Uma parcela deve pertencer a uma compra válida.
- Uma fatura deve pertencer a um cartão válido.
- O somatório das divisões de uma despesa deve corresponder ao valor total.
- Um pagamento não pode exceder o saldo devido sem tratamento explícito de crédito.
- Uma transferência deve possuir origem e destino distintos.
- Uma operação não pode gerar lançamentos duplicados.
- Operações financeiras compostas devem utilizar transações atômicas no banco.

---

# 24. FUNCIONALIDADES DE EXPERIÊNCIA

Implementar:

- Tema claro e escuro.
- Interface responsiva.
- Menu lateral recolhível.
- Pesquisa global.
- Atalhos de teclado.
- Filtros persistentes durante a navegação.
- Confirmação de exclusões.
- Feedback visual após operações.
- Estados vazios bem desenhados.
- Skeleton loading.
- Tooltips explicativos.
- Máscaras monetárias.
- Seletores de datas.
- Acessibilidade por teclado.
- Layout adaptado para smartphones.

### Performance

As interações devem ser rápidas.

Ao salvar, editar ou excluir um lançamento, atualizar somente os componentes afetados, sem recarregar a página inteira.

Aplicar atualização otimista quando apropriado, com reversão em caso de erro.

Utilizar paginação e consultas eficientes.

Evitar renderizações desnecessárias e consultas repetidas.

---

# 25. REGRAS FINANCEIRAS FUNDAMENTAIS

O sistema deverá trabalhar com dois conceitos distintos:

**Regime de competência:** identifica quando uma receita ou despesa pertence economicamente a um período.

**Regime de caixa:** identifica quando o dinheiro efetivamente entra ou sai das contas.

O usuário deverá conseguir alternar entre essas visualizações nos relatórios aplicáveis.

Regras obrigatórias:

1. Transferências entre contas próprias não são receitas nem despesas.
2. Pagamentos de faturas não duplicam despesas.
3. Parcelamentos não podem gerar valores superiores ao total da compra.
4. Reembolsos não podem inflar artificialmente as receitas.
5. Investimentos e resgates não devem ser confundidos com consumo.
6. Despesas compartilhadas devem manter o valor total e a responsabilidade individual separados.
7. Saldos realizados e projetados devem ser identificados claramente.
8. Cancelamentos e estornos devem preservar a rastreabilidade.
9. Alterações em transações devem recalcular indicadores e projeções.
10. Dados financeiros devem permanecer consistentes mesmo após exclusões, edições e importações.

---

# 26. IMPLEMENTAÇÃO EM ETAPAS

Desenvolva o sistema progressivamente, mantendo cada módulo funcional antes de avançar.

### Fase 1 — Estrutura

- Configuração do projeto.
- Banco de dados.
- Autenticação.
- Layout.
- Navegação.
- Tema claro e escuro.

### Fase 2 — Controle financeiro

- Contas.
- Categorias.
- Receitas.
- Despesas.
- Transações.
- Dashboard básico.

### Fase 3 — Compromissos

- Cartões.
- Faturas.
- Parcelamentos.
- Recorrências.
- Contas a pagar e receber.

### Fase 4 — Gestão compartilhada

- Participantes.
- Divisão de despesas.
- Reembolsos.
- Acerto de contas.

### Fase 5 — Planejamento

- Orçamentos.
- Metas.
- Investimentos.
- Patrimônio.
- Dívidas.

### Fase 6 — Inteligência e relatórios

- Fluxo de caixa.
- Projeções.
- Indicadores financeiros.
- Relatórios.
- Notificações.
- Importação e exportação.

### Fase 7 — Finalização

- Testes.
- Segurança.
- Otimização.
- Responsividade.
- Correção de erros.
- Preparação para produção.

---

# 27. CRITÉRIOS DE ACEITAÇÃO

O sistema somente será considerado funcional quando:

- O usuário conseguir cadastrar e editar dados financeiros.
- Os dados permanecerem salvos após sair e entrar novamente.
- O dashboard refletir os lançamentos reais.
- Os gráficos utilizarem dados do banco.
- Os cartões calcularem corretamente limites e faturas.
- Os parcelamentos forem gerados e distribuídos corretamente.
- As despesas compartilhadas calcularem os saldos individuais.
- Os pagamentos não gerarem duplicidades.
- Os orçamentos atualizarem automaticamente.
- As metas refletirem os aportes registrados.
- O fluxo de caixa considerar compromissos futuros.
- Os relatórios forem exportados corretamente.
- A interface funcionar em desktop e celular.
- As permissões impedirem acesso indevido.
- Não existirem botões decorativos sem funcionalidade.
- Os fluxos financeiros críticos possuírem testes automatizados.

---

# 28. INSTRUÇÕES FINAIS AO AGENTE DE PROGRAMAÇÃO

Você deverá atuar como arquiteto de software, desenvolvedor full-stack sênior, especialista em experiência do usuário e analista de sistemas financeiros.

Não desenvolva apenas uma página demonstrativa.

Construa uma aplicação real, modular, segura, escalável e preparada para utilização diária.

**Prioridades absolutas:**

1. Precisão dos cálculos financeiros.
2. Integridade e segurança dos dados.
3. Excelente experiência visual.
4. Rapidez das interações.
5. Organização e manutenção do código.
6. Funcionalidades completas.
7. Responsividade.
8. Facilidade de evolução.

Antes de implementar, apresente a arquitetura proposta, o modelo de dados e o plano de desenvolvimento.

Depois, execute as etapas de forma organizada.

Não utilize dados fictícios como se fossem informações reais do usuário.

Caso sejam necessários dados de demonstração, identifique-os claramente e mantenha-os separados dos dados reais.

Não declare uma funcionalidade como concluída sem implementar sua lógica, persistência, validação e testes essenciais.

**Resultado esperado:** uma plataforma de finanças pessoais com qualidade visual de um produto SaaS premium, profundidade funcional de um sistema de gestão financeira e simplicidade suficiente para ser utilizada diariamente por pessoas sem conhecimento técnico.