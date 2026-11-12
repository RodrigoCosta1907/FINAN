-- ============================================================================
-- Finanças+ — 0001 — Schema base
-- Convenções:
--   * dinheiro em centavos (BIGINT), sufixo _cents
--   * toda tabela privada tem household_id NOT NULL (RLS usa esse campo)
--   * tabelas filhas usam FK composta (household_id, parent_id) para não
--     permitir ligar linha a registro de outro household
-- ============================================================================

create extension if not exists pgcrypto;
create extension if not exists citext;

create schema if not exists app;

-- ---------------------------------------------------------------- enums ----
create type membership_role      as enum ('owner','admin','member','viewer');
create type account_type         as enum ('checking','savings','cash','digital','joint','investment');
create type category_kind        as enum ('income','expense','both');
create type txn_kind             as enum ('income','expense','transfer','card_invoice_payment',
                                          'investment_contribution','investment_withdrawal',
                                          'balance_adjustment','reimbursement','reversal');
create type txn_status           as enum ('pending','posted','reconciled','canceled');
create type payment_method       as enum ('cash','pix','debit','credit','transfer','boleto','automatic_debit','other');
create type invoice_status       as enum ('open','closed','partially_paid','paid','overdue');
create type purchase_status      as enum ('active','canceled','refunded');
create type installment_status   as enum ('pending','invoiced','paid','anticipated','canceled');
create type commitment_status    as enum ('pending','partially_paid','paid','overdue','canceled');
create type recurrence_frequency as enum ('daily','weekly','biweekly','monthly','bimonthly','quarterly','semiannual','yearly');
create type goal_status          as enum ('active','achieved','paused','canceled');
create type investment_class     as enum ('fixed_income','treasury','cdb','lci_lca','fund','stock','etf','fii','pension','crypto','other');
create type investment_txn_kind  as enum ('contribution','withdrawal','dividend','interest','fee','amortization');
create type liquidity_type       as enum ('daily','d_plus_1','d_plus_30','on_maturity','illiquid');
create type asset_type           as enum ('real_estate','vehicle','equipment','other');
create type liability_type       as enum ('financing','loan','personal_debt','credit_card','other');
create type budget_scope         as enum ('household','person');
create type notification_severity as enum ('info','warning','critical');
create type import_file_type     as enum ('csv','ofx','xlsx');
create type import_status        as enum ('draft','reviewing','imported','failed','canceled');
create type import_row_status    as enum ('pending','imported','duplicate','skipped','error');
create type audit_action         as enum ('insert','update','delete');

-- -------------------------------------------------------------- profiles ----
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  full_name    text,
  avatar_url   text,
  timezone     text not null default 'America/Sao_Paulo',
  locale       text not null default 'pt-BR',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ------------------------------------------------------------ households ----
create table public.households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  currency    char(3) not null default 'BRL',
  timezone    text not null default 'America/Sao_Paulo',
  is_demo     boolean not null default false,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         membership_role not null default 'member',
  invited_by   uuid references auth.users(id) on delete set null,
  joined_at    timestamptz not null default now(),
  primary key (household_id, user_id)
);
create index household_members_user_idx on public.household_members (user_id);

-- Pessoas do household: quem paga, quem deve, quem participa da divisão.
-- user_id preenchido quando a pessoa também tem login.
create table public.people (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete set null,
  name         text not null,
  email        citext,
  color        text not null default '#2563EB',
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (household_id, id)
);
create unique index people_household_user_uidx on public.people (household_id, user_id) where user_id is not null;
create index people_household_idx on public.people (household_id, is_active);

-- --------------------------------------------------------------- contas ----
create table public.financial_accounts (
  id                   uuid primary key default gen_random_uuid(),
  household_id         uuid not null references public.households(id) on delete cascade,
  name                 text not null,
  institution          text,
  type                 account_type not null default 'checking',
  currency             char(3) not null default 'BRL',
  opening_balance_cents bigint not null default 0,
  opening_date         date not null default current_date,
  color                text not null default '#2563EB',
  icon                 text not null default 'wallet',
  owner_person_id      uuid,
  is_active            boolean not null default true,
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (household_id, id)
);
create unique index financial_accounts_name_uidx
  on public.financial_accounts (household_id, lower(name)) where is_active;
create index financial_accounts_household_idx on public.financial_accounts (household_id, is_active);

-- ----------------------------------------------------------- categorias ----
create table public.categories (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  parent_id    uuid,
  name         text not null,
  kind         category_kind not null default 'expense',
  color        text not null default '#64748B',
  icon         text not null default 'tag',
  is_system    boolean not null default false,
  sort_order   integer not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (household_id, id),
  constraint categories_parent_fk
    foreign key (household_id, parent_id) references public.categories (household_id, id) on delete cascade,
  constraint categories_no_self_parent check (parent_id is null or parent_id <> id)
);
create unique index categories_name_uidx
  on public.categories (household_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
create index categories_household_idx on public.categories (household_id, kind, is_active);

-- ---------------------------------------------------------- transações ----
create table public.account_transactions (
  id                    uuid primary key default gen_random_uuid(),
  household_id          uuid not null references public.households(id) on delete cascade,
  kind                  txn_kind not null,
  status                txn_status not null default 'posted',
  description           text not null,
  amount_cents          bigint not null check (amount_cents > 0),
  currency              char(3) not null default 'BRL',
  direction             smallint not null default 1 check (direction in (-1, 1)),
  amount_signed_cents   bigint generated always as (
                          case
                            when kind in ('income','investment_withdrawal','reimbursement') then amount_cents * direction
                            when kind in ('balance_adjustment','reversal') then amount_cents * direction
                            else -amount_cents
                          end
                        ) stored,
  account_id            uuid,
  transfer_account_id   uuid,
  category_id           uuid,
  subcategory_id        uuid,
  payment_method        payment_method,
  occurred_on           date not null default current_date,
  competence_date       date not null,
  due_date              date,
  paid_at               timestamptz,
  reconciled_at         timestamptz,
  paid_by_person_id     uuid,
  is_shared             boolean not null default false,
  card_invoice_id       uuid,
  card_purchase_id      uuid,
  installment_id        uuid,
  recurring_id          uuid,
  reversal_of_id        uuid,
  external_id           text,
  notes                 text,
  tags                  text[] not null default '{}',
  is_demo               boolean not null default false,
  created_by            uuid references auth.users(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (household_id, id),
  constraint txn_account_fk
    foreign key (household_id, account_id) references public.financial_accounts (household_id, id),
  constraint txn_transfer_account_fk
    foreign key (household_id, transfer_account_id) references public.financial_accounts (household_id, id),
  constraint txn_category_fk
    foreign key (household_id, category_id) references public.categories (household_id, id),
  constraint txn_subcategory_fk
    foreign key (household_id, subcategory_id) references public.categories (household_id, id),
  constraint txn_paid_by_fk
    foreign key (household_id, paid_by_person_id) references public.people (household_id, id),
  constraint txn_reversal_fk
    foreign key (household_id, reversal_of_id) references public.account_transactions (household_id, id),
  constraint txn_requires_account check (kind in ('expense','income','transfer','card_invoice_payment','investment_contribution','investment_withdrawal','balance_adjustment','reimbursement','reversal') and account_id is not null),
  constraint txn_transfer_pair check ((kind = 'transfer') = (transfer_account_id is not null)),
  constraint txn_transfer_distinct check (transfer_account_id is null or transfer_account_id <> account_id),
  constraint txn_invoice_payment_shape check (kind <> 'card_invoice_payment' or card_invoice_id is not null),
  constraint txn_amount_positive check (amount_cents > 0)
);
create index txn_household_competence_idx on public.account_transactions (household_id, competence_date desc);
create index txn_household_cash_idx on public.account_transactions (household_id, paid_at desc);
create index txn_account_idx on public.account_transactions (household_id, account_id, occurred_on desc);
create index txn_category_idx on public.account_transactions (household_id, category_id, competence_date desc);
create index txn_status_idx on public.account_transactions (household_id, status);
create index txn_person_idx on public.account_transactions (household_id, paid_by_person_id);
create unique index txn_external_uidx
  on public.account_transactions (household_id, account_id, external_id) where external_id is not null;

-- -------------------------------------------------------------- cartões ----
create table public.credit_cards (
  id                  uuid primary key default gen_random_uuid(),
  household_id        uuid not null references public.households(id) on delete cascade,
  name                text not null,
  institution         text,
  brand               text,
  last4               char(4),
  limit_cents         bigint not null check (limit_cents >= 0),
  closing_day         smallint not null check (closing_day between 1 and 28),
  due_day             smallint not null check (due_day between 1 and 28),
  payment_account_id  uuid,
  holder_person_id    uuid,
  color               text not null default '#111827',
  is_active           boolean not null default true,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (household_id, id),
  constraint card_account_fk
    foreign key (household_id, payment_account_id) references public.financial_accounts (household_id, id),
  constraint card_holder_fk
    foreign key (household_id, holder_person_id) references public.people (household_id, id)
);
create index credit_cards_household_idx on public.credit_cards (household_id, is_active);

create table public.credit_card_invoices (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households(id) on delete cascade,
  card_id        uuid not null,
  period_year    smallint not null check (period_year between 2000 and 2100),
  period_month   smallint not null check (period_month between 1 and 12),
  closing_date   date not null,
  due_date       date not null,
  total_cents    bigint not null default 0 check (total_cents >= 0),
  paid_cents     bigint not null default 0 check (paid_cents >= 0),
  status         invoice_status not null default 'open',
  closed_at      timestamptz,
  paid_at        timestamptz,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (household_id, id),
  unique (household_id, card_id, period_year, period_month),
  constraint invoice_card_fk
    foreign key (household_id, card_id) references public.credit_cards (household_id, id) on delete cascade,
  constraint invoice_paid_not_above_total check (paid_cents <= total_cents)
);
create index invoices_due_idx on public.credit_card_invoices (household_id, due_date, status);

create table public.credit_card_purchases (
  id                    uuid primary key default gen_random_uuid(),
  household_id          uuid not null references public.households(id) on delete cascade,
  card_id               uuid not null,
  description           text not null,
  merchant              text,
  total_cents           bigint not null check (total_cents > 0),
  installments_count    smallint not null default 1 check (installments_count between 1 and 120),
  purchase_date         date not null default current_date,
  first_due_date        date not null,
  category_id           uuid,
  subcategory_id        uuid,
  responsible_person_id uuid,
  is_shared             boolean not null default false,
  status                purchase_status not null default 'active',
  notes                 text,
  is_demo               boolean not null default false,
  created_by            uuid references auth.users(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (household_id, id),
  constraint purchase_card_fk
    foreign key (household_id, card_id) references public.credit_cards (household_id, id) on delete cascade,
  constraint purchase_category_fk
    foreign key (household_id, category_id) references public.categories (household_id, id),
  constraint purchase_subcategory_fk
    foreign key (household_id, subcategory_id) references public.categories (household_id, id),
  constraint purchase_responsible_fk
    foreign key (household_id, responsible_person_id) references public.people (household_id, id)
);
create index purchases_card_idx on public.credit_card_purchases (household_id, card_id, purchase_date desc);

create table public.installments (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references public.households(id) on delete cascade,
  purchase_id      uuid not null,
  invoice_id       uuid,
  number           smallint not null check (number >= 1),
  amount_cents     bigint not null check (amount_cents > 0),
  due_date         date not null,
  competence_date  date not null,
  status           installment_status not null default 'pending',
  paid_at          timestamptz,
  anticipated_at   timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (household_id, id),
  unique (household_id, purchase_id, number),
  constraint installment_purchase_fk
    foreign key (household_id, purchase_id) references public.credit_card_purchases (household_id, id) on delete cascade,
  constraint installment_invoice_fk
    foreign key (household_id, invoice_id) references public.credit_card_invoices (household_id, id)
);
create index installments_invoice_idx on public.installments (household_id, invoice_id);
create index installments_due_idx on public.installments (household_id, due_date, status);

-- ------------------------------------------------ contas a pagar/receber ----
create table public.bills (
  id                 uuid primary key default gen_random_uuid(),
  household_id       uuid not null references public.households(id) on delete cascade,
  description        text not null,
  amount_cents       bigint not null check (amount_cents > 0),
  due_date           date not null,
  competence_date    date not null,
  category_id        uuid,
  subcategory_id     uuid,
  account_id         uuid,
  paid_by_person_id  uuid,
  is_shared          boolean not null default false,
  recurrence_id      uuid,
  status             commitment_status not null default 'pending',
  paid_cents         bigint not null default 0 check (paid_cents >= 0),
  paid_at            timestamptz,
  notes              text,
  attachment_url     text,
  is_demo            boolean not null default false,
  created_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (household_id, id),
  constraint bill_category_fk
    foreign key (household_id, category_id) references public.categories (household_id, id),
  constraint bill_subcategory_fk
    foreign key (household_id, subcategory_id) references public.categories (household_id, id),
  constraint bill_account_fk
    foreign key (household_id, account_id) references public.financial_accounts (household_id, id),
  constraint bill_person_fk
    foreign key (household_id, paid_by_person_id) references public.people (household_id, id),
  constraint bill_paid_not_above check (paid_cents <= amount_cents)
);
create index bills_due_idx on public.bills (household_id, due_date, status);

create table public.bill_payments (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households(id) on delete cascade,
  bill_id        uuid not null,
  transaction_id uuid,
  amount_cents   bigint not null check (amount_cents > 0),
  paid_on        date not null default current_date,
  notes          text,
  created_at     timestamptz not null default now(),
  constraint bill_payment_bill_fk
    foreign key (household_id, bill_id) references public.bills (household_id, id) on delete cascade,
  constraint bill_payment_txn_fk
    foreign key (household_id, transaction_id) references public.account_transactions (household_id, id)
);
create index bill_payments_bill_idx on public.bill_payments (household_id, bill_id);

create table public.receivables (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households(id) on delete cascade,
  description    text not null,
  amount_cents   bigint not null check (amount_cents > 0),
  expected_date  date not null,
  person_id      uuid,
  category_id    uuid,
  account_id     uuid,
  received_cents bigint not null default 0 check (received_cents >= 0),
  status         commitment_status not null default 'pending',
  received_at    timestamptz,
  notes          text,
  is_demo        boolean not null default false,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (household_id, id),
  constraint receivable_person_fk
    foreign key (household_id, person_id) references public.people (household_id, id),
  constraint receivable_category_fk
    foreign key (household_id, category_id) references public.categories (household_id, id),
  constraint receivable_account_fk
    foreign key (household_id, account_id) references public.financial_accounts (household_id, id),
  constraint receivable_received_not_above check (received_cents <= amount_cents)
);
create index receivables_expected_idx on public.receivables (household_id, expected_date, status);

create table public.receivable_payments (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households(id) on delete cascade,
  receivable_id  uuid not null,
  transaction_id uuid,
  amount_cents   bigint not null check (amount_cents > 0),
  received_on    date not null default current_date,
  notes          text,
  created_at     timestamptz not null default now(),
  constraint receivable_payment_fk
    foreign key (household_id, receivable_id) references public.receivables (household_id, id) on delete cascade,
  constraint receivable_payment_txn_fk
    foreign key (household_id, transaction_id) references public.account_transactions (household_id, id)
);
create index receivable_payments_idx on public.receivable_payments (household_id, receivable_id);

-- --------------------------------------------------------- recorrências ----
create table public.recurring_rules (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid not null references public.households(id) on delete cascade,
  description       text not null,
  kind              txn_kind not null check (kind in ('income','expense')),
  amount_cents      bigint not null check (amount_cents > 0),
  frequency         recurrence_frequency not null default 'monthly',
  interval_count    smallint not null default 1 check (interval_count between 1 and 60),
  start_date        date not null,
  end_date          date,
  category_id       uuid,
  subcategory_id    uuid,
  account_id        uuid,
  payment_method    payment_method,
  paid_by_person_id uuid,
  is_shared         boolean not null default false,
  adjustment_note   text,
  is_active         boolean not null default true,
  last_run_on       date,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (household_id, id),
  constraint recurring_category_fk
    foreign key (household_id, category_id) references public.categories (household_id, id),
  constraint recurring_subcategory_fk
    foreign key (household_id, subcategory_id) references public.categories (household_id, id),
  constraint recurring_account_fk
    foreign key (household_id, account_id) references public.financial_accounts (household_id, id),
  constraint recurring_person_fk
    foreign key (household_id, paid_by_person_id) references public.people (household_id, id),
  constraint recurring_period check (end_date is null or end_date >= start_date)
);
create index recurring_rules_active_idx on public.recurring_rules (household_id, is_active);

create table public.recurring_occurrences (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households(id) on delete cascade,
  rule_id        uuid not null,
  due_date       date not null,
  amount_cents   bigint not null check (amount_cents > 0),
  bill_id        uuid,
  receivable_id  uuid,
  transaction_id uuid,
  status         commitment_status not null default 'pending',
  generated_at   timestamptz not null default now(),
  unique (household_id, rule_id, due_date),
  constraint occurrence_rule_fk
    foreign key (household_id, rule_id) references public.recurring_rules (household_id, id) on delete cascade,
  constraint occurrence_bill_fk
    foreign key (household_id, bill_id) references public.bills (household_id, id),
  constraint occurrence_receivable_fk
    foreign key (household_id, receivable_id) references public.receivables (household_id, id),
  constraint occurrence_txn_fk
    foreign key (household_id, transaction_id) references public.account_transactions (household_id, id)
);
create index occurrences_due_idx on public.recurring_occurrences (household_id, due_date, status);

-- ----------------------------------------------------------- orçamentos ----
create table public.budgets (
  id                    uuid primary key default gen_random_uuid(),
  household_id          uuid not null references public.households(id) on delete cascade,
  period_year           smallint not null check (period_year between 2000 and 2100),
  period_month          smallint not null check (period_month between 1 and 12),
  scope                 budget_scope not null default 'household',
  person_id             uuid,
  total_limit_cents     bigint not null default 0 check (total_limit_cents >= 0),
  warning_pct           smallint not null default 70 check (warning_pct between 1 and 100),
  critical_pct          smallint not null default 90 check (critical_pct between 1 and 100),
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (household_id, id),
  constraint budget_person_fk
    foreign key (household_id, person_id) references public.people (household_id, id),
  constraint budget_scope_shape check ((scope = 'person') = (person_id is not null)),
  constraint budget_thresholds check (warning_pct < critical_pct)
);
create unique index budgets_period_uidx
  on public.budgets (household_id, period_year, period_month, coalesce(person_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table public.budget_categories (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households(id) on delete cascade,
  budget_id      uuid not null,
  category_id    uuid not null,
  subcategory_id uuid,
  limit_cents    bigint not null check (limit_cents >= 0),
  created_at     timestamptz not null default now(),
  unique (budget_id, category_id, subcategory_id),
  constraint budget_category_budget_fk
    foreign key (household_id, budget_id) references public.budgets (household_id, id) on delete cascade,
  constraint budget_category_cat_fk
    foreign key (household_id, category_id) references public.categories (household_id, id) on delete cascade,
  constraint budget_category_sub_fk
    foreign key (household_id, subcategory_id) references public.categories (household_id, id) on delete cascade
);

-- ---------------------------------------------------------------- metas ----
create table public.financial_goals (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references public.households(id) on delete cascade,
  name             text not null,
  description      text,
  target_cents     bigint not null check (target_cents > 0),
  target_date      date,
  priority         smallint not null default 3 check (priority between 1 and 5),
  account_id       uuid,
  icon             text not null default 'target',
  image_url        text,
  status           goal_status not null default 'active',
  is_emergency_fund boolean not null default false,
  is_demo          boolean not null default false,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (household_id, id),
  constraint goal_account_fk
    foreign key (household_id, account_id) references public.financial_accounts (household_id, id)
);

create table public.goal_contributions (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households(id) on delete cascade,
  goal_id        uuid not null,
  amount_cents   bigint not null check (amount_cents <> 0),
  contributed_on date not null default current_date,
  from_account_id uuid,
  transaction_id uuid,
  notes          text,
  created_at     timestamptz not null default now(),
  constraint contribution_goal_fk
    foreign key (household_id, goal_id) references public.financial_goals (household_id, id) on delete cascade,
  constraint contribution_account_fk
    foreign key (household_id, from_account_id) references public.financial_accounts (household_id, id),
  constraint contribution_txn_fk
    foreign key (household_id, transaction_id) references public.account_transactions (household_id, id)
);
create index goal_contributions_goal_idx on public.goal_contributions (household_id, goal_id, contributed_on desc);

-- ---------------------------------------------------------- investimentos ----
create table public.investment_assets (
  id                  uuid primary key default gen_random_uuid(),
  household_id        uuid not null references public.households(id) on delete cascade,
  name                text not null,
  institution         text,
  asset_class         investment_class not null default 'fixed_income',
  ticker              text,
  quantity            numeric(24,8) not null default 0,
  invested_cents      bigint not null default 0,
  current_value_cents bigint not null default 0,
  liquidity           liquidity_type not null default 'daily',
  maturity_date       date,
  owner_person_id     uuid,
  notes               text,
  is_active           boolean not null default true,
  is_demo             boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (household_id, id),
  constraint asset_owner_fk
    foreign key (household_id, owner_person_id) references public.people (household_id, id)
);

create table public.investment_transactions (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households(id) on delete cascade,
  asset_id       uuid not null,
  kind           investment_txn_kind not null,
  amount_cents   bigint not null check (amount_cents > 0),
  quantity       numeric(24,8),
  unit_price_cents bigint,
  occurred_on    date not null default current_date,
  transaction_id uuid,
  notes          text,
  created_at     timestamptz not null default now(),
  constraint investment_txn_asset_fk
    foreign key (household_id, asset_id) references public.investment_assets (household_id, id) on delete cascade,
  constraint investment_txn_cash_fk
    foreign key (household_id, transaction_id) references public.account_transactions (household_id, id)
);
create index investment_txn_asset_idx on public.investment_transactions (household_id, asset_id, occurred_on desc);

create table public.investment_valuations (
  id                 uuid primary key default gen_random_uuid(),
  household_id       uuid not null references public.households(id) on delete cascade,
  asset_id           uuid not null,
  reference_date     date not null,
  unit_price_cents   bigint,
  market_value_cents bigint not null check (market_value_cents >= 0),
  source             text not null default 'manual',
  created_at         timestamptz not null default now(),
  unique (asset_id, reference_date),
  constraint valuation_asset_fk
    foreign key (household_id, asset_id) references public.investment_assets (household_id, id) on delete cascade
);

-- ----------------------------------------------------- patrimônio/dívidas ----
create table public.assets (
  id                  uuid primary key default gen_random_uuid(),
  household_id        uuid not null references public.households(id) on delete cascade,
  name                text not null,
  type                asset_type not null default 'other',
  acquisition_date    date,
  acquisition_cents   bigint not null default 0 check (acquisition_cents >= 0),
  current_value_cents bigint not null default 0 check (current_value_cents >= 0),
  owner_person_id     uuid,
  notes               text,
  is_active           boolean not null default true,
  is_demo             boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (household_id, id),
  constraint asset_owner_person_fk
    foreign key (household_id, owner_person_id) references public.people (household_id, id)
);

create table public.asset_valuations (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  asset_id     uuid not null,
  reference_date date not null,
  value_cents  bigint not null check (value_cents >= 0),
  notes        text,
  created_at   timestamptz not null default now(),
  unique (asset_id, reference_date),
  constraint asset_valuation_fk
    foreign key (household_id, asset_id) references public.assets (household_id, id) on delete cascade
);

create table public.liabilities (
  id                  uuid primary key default gen_random_uuid(),
  household_id        uuid not null references public.households(id) on delete cascade,
  name                text not null,
  type                liability_type not null default 'loan',
  creditor            text,
  principal_cents     bigint not null check (principal_cents >= 0),
  outstanding_cents   bigint not null check (outstanding_cents >= 0),
  interest_rate_pct   numeric(9,6) not null default 0,
  start_date          date,
  end_date            date,
  installments_total  smallint,
  installments_paid   smallint not null default 0,
  notes               text,
  is_active           boolean not null default true,
  is_demo             boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (household_id, id)
);

create table public.liability_payments (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.households(id) on delete cascade,
  liability_id    uuid not null,
  amount_cents    bigint not null check (amount_cents > 0),
  interest_cents  bigint not null default 0 check (interest_cents >= 0),
  principal_cents bigint not null default 0 check (principal_cents >= 0),
  paid_on         date not null default current_date,
  transaction_id  uuid,
  notes           text,
  created_at      timestamptz not null default now(),
  constraint liability_payment_fk
    foreign key (household_id, liability_id) references public.liabilities (household_id, id) on delete cascade,
  constraint liability_payment_txn_fk
    foreign key (household_id, transaction_id) references public.account_transactions (household_id, id)
);

-- ------------------------------------------------ despesas compartilhadas ----
create table public.transaction_splits (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households(id) on delete cascade,
  transaction_id uuid not null,
  person_id      uuid not null,
  share_cents    bigint not null check (share_cents >= 0),
  share_pct      numeric(9,6),
  is_settled     boolean not null default false,
  created_at     timestamptz not null default now(),
  unique (transaction_id, person_id),
  constraint split_txn_fk
    foreign key (household_id, transaction_id) references public.account_transactions (household_id, id) on delete cascade,
  constraint split_person_fk
    foreign key (household_id, person_id) references public.people (household_id, id)
);
create index splits_txn_idx on public.transaction_splits (household_id, transaction_id);
create index splits_person_idx on public.transaction_splits (household_id, person_id);

create table public.reimbursements (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households(id) on delete cascade,
  from_person_id uuid not null,
  to_person_id   uuid not null,
  amount_cents   bigint not null check (amount_cents > 0),
  paid_on        date not null default current_date,
  transaction_id uuid,
  notes          text,
  created_at     timestamptz not null default now(),
  constraint reimbursement_from_fk
    foreign key (household_id, from_person_id) references public.people (household_id, id),
  constraint reimbursement_to_fk
    foreign key (household_id, to_person_id) references public.people (household_id, id),
  constraint reimbursement_distinct check (from_person_id <> to_person_id),
  constraint reimbursement_txn_fk
    foreign key (household_id, transaction_id) references public.account_transactions (household_id, id)
);
create index reimbursements_pair_idx on public.reimbursements (household_id, from_person_id, to_person_id);

-- ---------------------------------------------------------- notificações ----
create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete cascade,
  kind         text not null,
  title        text not null,
  body         text,
  severity     notification_severity not null default 'info',
  entity_table text,
  entity_id    uuid,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index notifications_unread_idx on public.notifications (household_id, read_at);

create table public.user_settings (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  active_household_id uuid references public.households(id) on delete set null,
  theme              text not null default 'system' check (theme in ('light','dark','system')),
  first_day_of_week  smallint not null default 0 check (first_day_of_week between 0 and 6),
  notification_prefs jsonb not null default '{}'::jsonb,
  module_prefs       jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ------------------------------------------------------------ importação ----
create table public.import_batches (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households(id) on delete cascade,
  account_id     uuid,
  file_name      text not null,
  file_type      import_file_type not null,
  status         import_status not null default 'draft',
  total_rows     integer not null default 0,
  imported_rows  integer not null default 0,
  duplicate_rows integer not null default 0,
  error_message  text,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (household_id, id),
  constraint import_batch_account_fk
    foreign key (household_id, account_id) references public.financial_accounts (household_id, id)
);

create table public.import_rows (
  id                    uuid primary key default gen_random_uuid(),
  household_id          uuid not null references public.households(id) on delete cascade,
  batch_id              uuid not null,
  row_number            integer not null,
  raw                   jsonb not null default '{}'::jsonb,
  occurred_on           date,
  amount_cents          bigint,
  description           text,
  external_id           text,
  suggested_category_id uuid,
  status                import_row_status not null default 'pending',
  transaction_id        uuid,
  error_message         text,
  created_at            timestamptz not null default now(),
  unique (batch_id, row_number),
  constraint import_row_batch_fk
    foreign key (household_id, batch_id) references public.import_batches (household_id, id) on delete cascade,
  constraint import_row_category_fk
    foreign key (household_id, suggested_category_id) references public.categories (household_id, id),
  constraint import_row_txn_fk
    foreign key (household_id, transaction_id) references public.account_transactions (household_id, id)
);
create index import_rows_batch_idx on public.import_rows (household_id, batch_id, status);

create table public.attachments (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  entity_table text not null,
  entity_id    uuid not null,
  storage_path text not null,
  file_name    text not null,
  mime_type    text,
  size_bytes   bigint check (size_bytes is null or size_bytes >= 0),
  uploaded_by  uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index attachments_entity_idx on public.attachments (household_id, entity_table, entity_id);

-- ------------------------------------------------------------- auditoria ----
create table public.audit_logs (
  id           bigserial primary key,
  household_id uuid,
  actor_id     uuid,
  table_name   text not null,
  record_id    uuid,
  action       audit_action not null,
  diff         jsonb,
  created_at   timestamptz not null default now()
);
create index audit_logs_household_idx on public.audit_logs (household_id, created_at desc);

-- ------------------------- FKs que fecham ciclos (criadas após as tabelas) ----
alter table public.account_transactions
  add constraint txn_card_invoice_fk
    foreign key (household_id, card_invoice_id) references public.credit_card_invoices (household_id, id),
  add constraint txn_card_purchase_fk
    foreign key (household_id, card_purchase_id) references public.credit_card_purchases (household_id, id),
  add constraint txn_installment_fk
    foreign key (household_id, installment_id) references public.installments (household_id, id),
  add constraint txn_recurring_fk
    foreign key (household_id, recurring_id) references public.recurring_rules (household_id, id);

alter table public.bills
  add constraint bill_recurring_fk
    foreign key (household_id, recurrence_id) references public.recurring_rules (household_id, id);

alter table public.financial_accounts
  add constraint account_owner_fk
    foreign key (household_id, owner_person_id) references public.people (household_id, id);
