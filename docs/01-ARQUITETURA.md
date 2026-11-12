# Arquitetura — Finanças+

> Documento de decisão técnica. Base para as migrations em `supabase/migrations`.
> Versão 1 — fase 0 (arquitetura), antes de qualquer linha de código de produto.

## 1. Princípios que governam o projeto

1. **O banco é a autoridade.** Todo saldo, fatura, orçamento e patrimônio é
   derivado de dados persistidos — nunca "calculado no componente" e nunca
   digitado à mão. A UI só exibe o que uma view/RPC devolve.
2. **Dinheiro é inteiro.** Todo valor monetário é `BIGINT` em **centavos**
   (`*_cents`). Nenhum `float`, `real` ou `double` em caminho financeiro. A
   formatação para BRL acontece apenas na borda (UI/exportação).
3. **Um fato, um registro.** Cada evento econômico é gravado uma única vez e
   os relatórios escolhem *como* lê-lo (regime de caixa ou de competência).
   Nunca se cria um segundo lançamento para "refletir" o primeiro.
4. **Escrita atômica.** Operações compostas (pagar fatura, criar compra
   parcelada, acertar dívida entre pessoas) são funções `plpgsql` em uma única
   transação. O cliente nunca orquestra várias escritas.
5. **Isolamento por espaço financeiro (`household`).** Toda linha privada
   carrega `household_id` e é protegida por RLS. Nenhum filtro de segurança
   depende do frontend.
6. **Rastreabilidade.** Cancelamento não apaga: muda status, gera estorno e
   grava `audit_logs`. Exclusão física só em rascunhos e importações.

## 2. Stack

| Camada | Escolha | Nota |
|---|---|---|
| Framework | Next.js (App Router, RSC) | Server Components para leitura, Server Actions para escrita |
| Linguagem | TypeScript `strict` | `noUncheckedIndexedAccess` ligado |
| Estilo | Tailwind CSS + design tokens CSS vars | tokens em `src/styles/tokens.css` |
| Componentes | Base própria no padrão shadcn/ui (Radix + CVA) | copiados para o repo, não dependência caixa-preta |
| Ícones | Lucide React | — |
| Gráficos | Recharts | client components isolados |
| Formulários | React Hook Form + Zod | mesmo schema Zod usado na Server Action |
| Banco/Auth/Storage | Supabase (PostgreSQL 15+, Auth, RLS, Storage) | projeto **novo**, separado do CRM IPARTES |
| Datas | `date-fns` + `date-fns-tz` | tudo normalizado em `America/Sao_Paulo` |
| Testes | Vitest (unidade de domínio) + Playwright (fluxos críticos) | ver §10 |

**Não** usamos `float` em TypeScript para dinheiro: a camada de domínio
(`src/lib/money.ts`) trabalha com `bigint`/`number` inteiro de centavos e uma
única função de formatação.

## 3. Estrutura de pastas

```
financas-plus/
├─ docs/                      # este pacote (arquitetura, modelo, plano)
├─ supabase/
│  ├─ migrations/             # migrations versionadas (fonte da verdade do schema)
│  └─ seed.sql                # dados de demonstração MARCADOS (is_demo = true)
├─ src/
│  ├─ app/
│  │  ├─ (auth)/              # login, cadastro, recuperar senha
│  │  ├─ (app)/               # shell autenticado (sidebar + topbar)
│  │  │  ├─ page.tsx          # visão geral
│  │  │  ├─ transacoes/  receitas/  despesas/
│  │  │  ├─ contas/  cartoes/  parcelamentos/  recorrencias/
│  │  │  ├─ contas-a-pagar/  contas-a-receber/
│  │  │  ├─ orcamentos/  metas/  investimentos/  patrimonio/
│  │  │  ├─ dividas/  fluxo-de-caixa/  relatorios/  configuracoes/
│  │  ├─ api/                 # apenas webhooks/importação em streaming
│  ├─ components/
│  │  ├─ ui/                  # primitivas (button, card, dialog, table…)
│  │  ├─ charts/              # wrappers Recharts
│  │  ├─ layout/              # sidebar, topbar, command palette
│  │  └─ domain/              # componentes de domínio (money-input, bill-row…)
│  ├─ lib/
│  │  ├─ money.ts  dates.ts  format.ts
│  │  ├─ supabase/{client,server,middleware}.ts
│  │  ├─ auth/                # sessão, guardas, household ativo
│  │  └─ domain/              # regras puras e testáveis (rateio, juros, score)
│  ├─ server/
│  │  ├─ actions/             # Server Actions por módulo (validação Zod + RPC)
│  │  └─ queries/             # leituras tipadas (views/RPC)
│  └─ styles/
└─ tests/  (unit/ e e2e/)
```

## 4. Fluxo de uma escrita

```
Form (RHF + Zod)
  └─ Server Action  ── valida schema ──> supabase.rpc('app.create_expense', {...})
        │                                      │
        │                                      └─ transação única no Postgres
        └─ revalidatePath / revalidateTag      └─ triggers recalculam derivados
```

- Toda Server Action: `requireSession()` → valida `household` do usuário →
  Zod `safeParse` → RPC → `revalidateTag('hh:<id>:<módulo>')`.
- Regras de negócio **não** ficam na action: ficam na RPC (autoridade) e, quando
  puras, em `src/lib/domain` (testadas).
- Erros do Postgres (`RAISE EXCEPTION` com `SQLSTATE` 23xxx/P0001) são mapeados
  para mensagens PT-BR em `src/lib/errors.ts`.

## 5. Modelo de dinheiro

- `amount_cents BIGINT NOT NULL CHECK (amount_cents > 0)`.
- Sinal **não** é armazenado: é consequência do `kind` da transação.
  `transfer` e `card_invoice_payment` não são receita nem despesa.
- Arredondamento: `split_cents(total, n)` distribui `total % n` centavos nas
  primeiras parcelas, garantindo `sum(parcelas) == total` **exatamente**.
- Percentuais em `NUMERIC(9,6)` (0–100) e sempre convertidos para centavos no
  momento da materialização, com a sobra distribuída pelo resto.

## 6. Regime de caixa × regime de competência

Cada transação guarda quatro datas: `occurred_at` (fato), `competence_date`
(a que período o gasto pertence), `due_date` e `paid_at` (quando o dinheiro
saiu/entrou). Isso permite as duas leituras sem duplicar linhas:

| Evento | Competência | Caixa |
|---|---|---|
| Despesa à vista no débito/PIX | `competence_date` | `paid_at` |
| Compra no cartão | mês da fatura da parcela | `paid_at` da fatura |
| Pagamento de fatura | **não gera despesa** | saída da conta |
| Transferência entre contas | não é receita/despesa | neutro (só muda saldo) |
| Aporte em investimento | não é despesa | saída da conta (vira ativo) |
| Resgate | não é receita | entrada na conta (deixa de ser ativo) |
| Reembolso recebido | reduz a despesa da pessoa | entrada de caixa |
| Estorno | anula a competência | anula o caixa |

Implementação: `transactions.kind` restrito a um enum fechado + views
`v_cash_movements` e `v_accrual_expenses` que enumeram explicitamente quais
`kind` entram em cada soma. Nenhum relatório usa `SUM(valor)` sem `kind`.

## 7. Cartão de crédito: por que não duplica

O ciclo é: **compra → parcela → fatura → pagamento**.

- `credit_card_purchases` (fato comercial) gera `installments`, uma por mês.
- Cada `installment` cai em uma `credit_card_invoices` (cartão + ano + mês).
- O total da fatura é `SUM(installments.amount_cents)` — coluna `total_cents`
  mantida por trigger, nunca digitada.
- **Pagar a fatura** cria uma transação `kind = 'card_invoice_payment'`, que:
  1. reduz o saldo da conta pagadora (caixa);
  2. reduz o passivo `credit_card_invoices.paid_cents`;
  3. **não** entra em `v_accrual_expenses` (a despesa já foi reconhecida na
     parcela) nem em `v_cash_flows.despesas` (é liquidação de passivo).
- Limite disponível = `limit_cents − (faturas abertas + fechadas não pagas)`.
  Parcelas futuras já reservam limite, mas não são fatura ainda: entram no
  cálculo de "comprometimento futuro", não no limite utilizado.

## 8. Parcelamento

`create_installment_purchase(total, n, first_due)`:
`base = total / n` e `resto = total % n`; parcelas 1..resto recebem `base+1`.
`SUM == total` garantido por constraint diferida. Antecipação = pagar N
parcelas antes do vencimento, gerando um único pagamento e marcando as
parcelas como `antecipada`, sem alterar o valor original da compra.

## 9. Despesas compartilhadas

- `people` = participantes (com ou sem login). Um `household_member` sempre tem
  um `person` correspondente.
- `expense_splits(transaction_id, person_id, share_cents)`: constraint diferida
  `SUM(share_cents) == transaction.amount_cents`.
- "Quem pagou" é `transactions.paid_by_person_id`.
- Saldo de cada pessoa =
  `SUM(pago por ela) − SUM(parte dela) + SUM(reembolsos que ela pagou) −
   SUM(reembolsos que ela recebeu)`.
- Acerto: `app.settle_people(a, b)` calcula o líquido entre duas pessoas;
  `app.simplify_debts(household)` gera a lista mínima de transferências
  (algoritmo guloso devedor↔credor) para o painel "quem deve a quem".
- Reembolso **não** é receita operacional: `kind = 'reimbursement'`, excluído de
  `v_accrual_expenses` e somado apenas no saldo entre pessoas.

## 10. Segurança

- Supabase Auth (e-mail/senha + magic link). Sem senha em texto no banco.
- `households` é o espaço financeiro; `household_members(user_id, household_id,
  role)` define acesso. Papéis: `owner`, `admin`, `member`, `viewer`.
- RLS em **todas** as tabelas com dados privados:
  `USING (app.is_member(household_id))`, e `WITH CHECK` equivalente na escrita;
  `viewer` só lê. Funções `app.is_member`/`app.can_write` são
  `SECURITY DEFINER` com `search_path` fixo.
- Tabelas filhas carregam `household_id` desnormalizado + FK composta para o
  pai, impedindo "pendurar" linha em household alheio.
- Storage: bucket `attachments`, caminho `household_id/yyyy/mm/uuid.ext`,
  política por prefixo do household.
- `audit_logs` append-only (sem policy de UPDATE/DELETE), gravado por trigger.
- Service role key **nunca** no client. Apenas `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  no browser; operações administrativas só em rota de servidor.

## 11. Performance

- Índices: todo filtro de tela tem índice composto começando por
  `(household_id, <data>)` ou `(household_id, <status>)`.
- Listas com paginação **keyset** (`created_at, id`), não `OFFSET`.
- Dashboard em uma RPC só (`app.dashboard_summary`) — evita 8 idas ao banco.
- RSC + `revalidateTag` por household/módulo; mutações otimistas só em ações
  idempotentes com rollback em erro (React `useOptimistic`).
- Gráficos carregam agregados do servidor (nunca somam 10k linhas no browser).

## 12. Testes

| Nível | Ferramenta | Cobre |
|---|---|---|
| Domínio puro | Vitest | rateio de centavos, juros, score, projeção, simplificação de dívidas |
| Banco | Vitest + RPC real (projeto de teste) | constraints, triggers, RLS (com 2 usuários distintos), idempotência |
| E2E | Playwright | login → criar despesa → aparece no dashboard; compra parcelada → fatura → pagamento sem duplicar |

Regra de aceite: nenhuma fase é dada por concluída sem teste do caminho
financeiro crítico daquela fase verde.

## 13. Pendências de infraestrutura (dependem do Rodrigo)

1. **Projeto Supabase novo** (não reutilizar o do CRM IPARTES): URL + anon key.
2. Chave de serviço apenas no arquivo local `.env.local` do repo.
3. Repositório GitHub do projeto (privado).
4. As três imagens de referência visual citadas no prompt (não chegaram).
