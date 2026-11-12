# Modelo de dados — Finanças+

A fonte da verdade é `supabase/migrations/0001_schema.sql`. Este documento é o
mapa mental: o que existe, por que existe e quais invariantes o banco garante.

## Convenções

- `id uuid` (gen_random_uuid) em todas as tabelas.
- Dinheiro: `*_cents bigint`; sinal derivado de `kind` (`amount_signed_cents`,
  coluna gerada) — nunca gravado à mão.
- Toda tabela privada tem `household_id not null` (RLS) e as filhas usam **FK
  composta** `(household_id, parent_id)` para não pendurar linha em outro espaço.
- `created_at`/`updated_at timestamptz` com trigger de atualização.
- Exclusão: status (`canceled`/`refunded`) + `audit_logs`; nada de `DELETE`
  silencioso em dado financeiro.

## Domínios

### Identidade e acesso
| Tabela | Papel |
|---|---|
| `profiles` | dados do usuário (`auth.users` 1:1) |
| `households` | espaço financeiro (pessoal ou família) |
| `household_members` | acesso: `owner`, `admin`, `member`, `viewer` |
| `people` | participantes (com ou sem login) — quem paga, quem deve |
| `user_settings` | tema, household ativo, preferências |

### Contas e lançamentos
| Tabela | Papel |
|---|---|
| `financial_accounts` | conta corrente, poupança, carteira, digital… (`opening_balance_cents` + `opening_date`) |
| `categories` | árvore de 1 nível (`parent_id`) com `kind` receita/despesa |
| `account_transactions` | um fato financeiro: `kind` (income, expense, transfer, card_invoice_payment, investment_*, balance_adjustment, reimbursement, reversal), 4 datas (fato, competência, vencimento, pagamento), `status` |
| `transaction_splits` | divisão da despesa entre pessoas (soma = total, validada por trigger diferido) |
| `reimbursements` | acerto de contas entre pessoas |
| `bill_payments` / `receivable_payments` | pagamentos parciais vinculados ao lançamento gerado |

Saldo por conta = `opening_balance_cents + Σ amount_signed_cents` (view
`v_account_balances`), com a perna de entrada da transferência somada
separadamente.

### Cartões e parcelamentos
| Tabela | Papel |
|---|---|
| `credit_cards` | limite, fechamento, vencimento, conta pagadora |
| `credit_card_invoices` | uma por (cartão, ano, mês); `total_cents` recalculado por trigger |
| `credit_card_purchases` | compra (fato comercial) com `installments_count` |
| `installments` | cada parcela, vinculada à fatura do mês de competência |

`app.recalc_invoice()` deriva status: `open → closed → partially_paid → paid`.
`app.pay_card_invoice()` cria `card_invoice_payment` (não é despesa) e baixa o
passivo.

### Compromissos
| Tabela | Papel |
|---|---|
| `bills` | conta a pagar (obrigação). Pagar gera a despesa real |
| `receivables` | conta a receber |
| `recurring_rules` | regra de recorrência (frequência, intervalo, fim opcional) |
| `recurring_occurrences` | ocorrências materializadas — `unique (rule, due_date)` impede duplicidade |

### Planejamento
| Tabela | Papel |
|---|---|
| `budgets` + `budget_categories` | limite geral e por categoria, com limiares de aviso |
| `financial_goals` + `goal_contributions` | metas e aportes |
| `investment_assets` / `investment_transactions` / `investment_valuations` | carteira, movimentos e marcação a mercado |
| `assets` / `asset_valuations` | bens com histórico de avaliação |
| `liabilities` / `liability_payments` | dívidas com juros e amortização |

Patrimônio líquido (view `v_net_worth`) = contas + investimentos + bens +
recebíveis − (faturas em aberto + contas a pagar + dívidas). O cartão entra uma
única vez, pela fatura em aberto.

### Suporte
`notifications`, `import_batches` / `import_rows` (dedupe por `external_id`),
`attachments` (Storage `attachments/<household>/…`), `audit_logs`.

## Invariantes verificadas por teste

1. `split_cents(total, n)` soma exatamente `total` (resto distribuído).
2. Soma das parcelas = total da compra.
3. Soma das divisões de uma despesa = valor total.
4. Transferência exige origem ≠ destino e não altera receita/despesa.
5. Pagar fatura reduz conta e passivo, sem criar despesa.
6. Despesa de competência não duplica com despesa de caixa.
7. Acerto entre pessoas zera o saldo e não vira receita.
8. Usuário sem vínculo não lê nenhuma linha do household.
