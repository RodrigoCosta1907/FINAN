-- ============================================================================
-- Finanças+ — 0004 — API pública (PostgREST/Supabase)
-- O domínio vive no schema `app` (interno). O cliente chama apenas estas
-- funções em `public`, que é o schema exposto por padrão pelo Supabase.
-- Assim não é preciso alterar "Exposed schemas" no painel.
-- ============================================================================

create or replace function public.fin_create_household(
  p_name      text,
  p_user_name text    default null,
  p_is_demo   boolean default false
)
returns uuid
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app.create_household(p_name, p_user_name, p_is_demo);
$$;

create or replace function public.fin_create_transaction(
  p_household   uuid,
  p_kind        txn_kind,
  p_description text,
  p_amount      bigint,
  p_date        date,
  p_account     uuid            default null,
  p_category    uuid            default null,
  p_subcategory uuid            default null,
  p_paid_by     uuid            default null,
  p_payment     payment_method  default null,
  p_splits      jsonb           default null,
  p_is_shared   boolean         default false,
  p_due_date    date            default null,
  p_notes       text            default null,
  p_tags        text[]          default '{}'
)
returns uuid
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app.create_transaction(p_household, p_kind, p_description, p_amount, p_date,
                                p_account, p_category, p_subcategory, p_paid_by, p_payment,
                                p_splits, p_is_shared, p_due_date, p_notes, p_tags);
$$;

create or replace function public.fin_create_transfer(
  p_household   uuid,
  p_from        uuid,
  p_to          uuid,
  p_amount      bigint,
  p_date        date default current_date,
  p_description text default 'Transferência entre contas',
  p_notes       text default null
)
returns uuid
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app.create_transfer(p_household, p_from, p_to, p_amount, p_date, p_description, p_notes);
$$;

create or replace function public.fin_create_installment_purchase(
  p_household      uuid,
  p_card           uuid,
  p_description    text,
  p_total_cents    bigint,
  p_installments   integer,
  p_purchase_date  date,
  p_first_due_date date,
  p_category       uuid    default null,
  p_responsible    uuid    default null,
  p_is_shared      boolean default false,
  p_merchant       text    default null,
  p_notes          text    default null
)
returns uuid
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app.create_installment_purchase(p_household, p_card, p_description, p_total_cents,
                                         p_installments, p_purchase_date, p_first_due_date,
                                         p_category, p_responsible, p_is_shared, p_merchant, p_notes);
$$;

create or replace function public.fin_pay_card_invoice(
  p_invoice uuid,
  p_account uuid,
  p_amount  bigint,
  p_paid_on date default current_date,
  p_notes   text default null
)
returns uuid
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app.pay_card_invoice(p_invoice, p_account, p_amount, p_paid_on, p_notes);
$$;

create or replace function public.fin_pay_bill(
  p_bill    uuid,
  p_amount  bigint,
  p_paid_on date default current_date,
  p_account uuid default null,
  p_notes   text default null
)
returns uuid
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app.pay_bill(p_bill, p_amount, p_paid_on, p_account, p_notes);
$$;

create or replace function public.fin_cancel_transaction(p_txn uuid, p_reason text default null)
returns void
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app.cancel_transaction(p_txn, p_reason);
$$;

create or replace function public.fin_settle_people(
  p_household uuid,
  p_payer     uuid,
  p_receiver  uuid,
  p_amount    bigint,
  p_date      date default current_date,
  p_account   uuid default null
)
returns uuid
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app.settle_people(p_household, p_payer, p_receiver, p_amount, p_date, p_account);
$$;

create or replace function public.fin_materialize_recurring(p_household uuid, p_until date default null)
returns integer
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app.materialize_recurring(p_household, p_until);
$$;

create or replace function public.fin_dashboard_summary(
  p_household uuid,
  p_year      integer,
  p_month     integer,
  p_regime    text default 'cash'
)
returns jsonb
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app.dashboard_summary(p_household, p_year, p_month, p_regime);
$$;

create or replace function public.fin_project_cashflow(p_household uuid, p_days integer default 30)
returns table (day date, inflow_cents bigint, outflow_cents bigint, projected_balance bigint)
language sql
security invoker
set search_path = public, pg_temp
as $$
  select * from app.project_cashflow(p_household, p_days);
$$;

create or replace function public.fin_health_score(p_household uuid, p_year integer, p_month integer)
returns jsonb
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app.health_score(p_household, p_year, p_month);
$$;

create or replace function public.fin_person_balances(p_household uuid)
returns table (
  person_id      uuid,
  person_name    text,
  paid_cents     bigint,
  share_cents    bigint,
  reimbursed_out bigint,
  reimbursed_in  bigint,
  net_cents      bigint
)
language sql
security invoker
set search_path = public, pg_temp
as $$
  select * from app.person_balances(p_household);
$$;

create or replace function public.fin_simplify_debts(p_household uuid)
returns table (
  from_person  uuid,
  from_name    text,
  to_person    uuid,
  to_name      text,
  amount_cents bigint
)
language sql
security invoker
set search_path = public, pg_temp
as $$
  select * from app.simplify_debts(p_household);
$$;

-- ---------------------------------------------------------------- grants ----
grant execute on function
  public.fin_create_household(text, text, boolean),
  public.fin_create_transaction(uuid, txn_kind, text, bigint, date, uuid, uuid, uuid, uuid, payment_method, jsonb, boolean, date, text, text[]),
  public.fin_create_transfer(uuid, uuid, uuid, bigint, date, text, text),
  public.fin_create_installment_purchase(uuid, uuid, text, bigint, integer, date, date, uuid, uuid, boolean, text, text),
  public.fin_pay_card_invoice(uuid, uuid, bigint, date, text),
  public.fin_pay_bill(uuid, bigint, date, uuid, text),
  public.fin_cancel_transaction(uuid, text),
  public.fin_settle_people(uuid, uuid, uuid, bigint, date, uuid),
  public.fin_materialize_recurring(uuid, date),
  public.fin_dashboard_summary(uuid, integer, integer, text),
  public.fin_project_cashflow(uuid, integer),
  public.fin_health_score(uuid, integer, integer),
  public.fin_person_balances(uuid),
  public.fin_simplify_debts(uuid)
  to authenticated;

revoke all on function public.fin_create_household(text, text, boolean) from anon;
