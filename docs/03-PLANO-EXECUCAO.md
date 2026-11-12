# Plano de execução — Finanças+

Cada fase só é declarada concluída quando o critério de aceite é verificável por
comando (`npm run check`, `npm test`, `node scripts/db-check.mjs`) ou por
verificação em navegador real. Nada é "concluído" por aparência.

## Fase 0 — Arquitetura (concluída)

- [x] `docs/00-PROMPT-MASTER.md` (escopo)
- [x] `docs/01-ARQUITETURA.md` (decisões)
- [x] `docs/02-MODELO-DADOS.md` + migrations
- [x] `docs/03-PLANO-EXECUCAO.md` (este arquivo)

## Fase 1 — Fundação (em andamento)

| Entrega | Estado | Evidência |
|---|---|---|
| Projeto Next.js 16 + TS + Tailwind 4 | feito | `npm run build` verde |
| Design tokens claro/escuro | feito | `body` = `rgb(245,247,251)`, fonte Inter |
| Shell (sidebar 17 módulos, topbar, busca, tema) | feito | screenshot + sem overflow horizontal |
| Schema 36 tabelas + índices + constraints | feito | `db-check` aplica as 3 migrations |
| RLS por household | feito | teste com 2 usuários: 0 vs 1 household |
| Funções financeiras (fatura, rateio, acerto, dashboard) | feito | 15 asserções do `01_smoke.sql` |
| Dashboard ligado ao Supabase | pendente | precisa do projeto Supabase |

**Critério de saída:** `npm run build`, `npm run db:check` e `npm test` verdes, e
dashboard lendo dados reais de um household criado via UI.

## Fase 2 — Controle financeiro

1. Auth (login, cadastro, recuperação, sessão) + onboarding do household.
2. CRUD de contas e categorias.
3. Transações: lista com filtros combináveis, criação, edição, duplicação,
   exclusão lógica, ações em lote, paginação keyset.
4. Receitas e despesas com visão por categoria.
5. Dashboard passando a usar `app.dashboard_summary` (regime caixa/competência).

**Aceite:** criar despesa na UI → aparece no dashboard → sobrevive a logout/login.

## Fase 3 — Compromissos

1. Cartões e faturas (abrir, fechar, pagar total/parcial).
2. Compras parceladas (geração automática + antecipação).
3. Recorrências (materialização idempotente).
4. Contas a pagar e a receber + calendário.

**Aceite:** compra 12x gera 12 parcelas somando o total; pagar a fatura reduz o
saldo da conta e não aumenta a despesa do mês (teste já automatizado no banco).

## Fase 4 — Compartilhado

Participantes, divisão por percentual/valor, painel da casa, reembolsos e acerto
mínimo de contas (`app.simplify_debts`).

**Aceite:** despesa de 1.800 dividida em 900/900 → A +900, B −900; acerto zera.

## Fase 5 — Planejamento

Orçamentos com alertas configuráveis, metas com aportes, investimentos com
valoração, patrimônio, dívidas.

**Aceite:** orçamento em 95% fica "crítico"; meta reflete apenas aportes
registrados; patrimônio não conta o cartão duas vezes.

## Fase 6 — Inteligência

Fluxo de caixa (7/30/90/180/365 dias), projeções com cenários, relatórios (12),
notificações e importação CSV/OFX/XLSX com deduplicação.

**Aceite:** projeção mostra saldo negativo no dia correto; importação do mesmo
arquivo duas vezes não duplica lançamento (`external_id` único).

## Fase 7 — Produção

Testes E2E dos caminhos críticos, acessibilidade por teclado, revisão de RLS,
performance (paginação/índices), deploy.

## Dependências do Rodrigo

1. Projeto Supabase **novo** (URL + anon key) e `service_role` apenas em
   `.env.local`.
2. Repositório GitHub privado para o projeto.
3. As três imagens de referência visual citadas no prompt.
