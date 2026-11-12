-- ============================================================================
-- Finanças+ — 0003 — Domínio: rateios, cartões, compartilhadas, relatórios
-- Regra de ouro: toda escrita composta roda em UMA transação, dentro do banco.
-- ============================================================================

-- ------------------------------------------------------------- utilitários ----
create or replace function app.split_cents(p_total bigint, p_parts integer)
returns bigint[]
language plpgsql
immutable
as $$
declare
  v_base bigint;
  v_rest bigint;
  v_out  bigint[] := '{}';
  i      integer;
begin
  if p_parts is null or p_parts <= 0 then
    raise exception 'número de partes deve ser maior que zero' using errcode = '22023';
  end if;
  if p_total is null or p_total < 0 then
    raise exception 'valor total inválido' using errcode = '22023';
  end if;
  v_base := p_total / p_parts;
  v_rest := p_total % p_parts;
  for i in 1..p_parts loop
    v_out := array_append(v_out, v_base + case when i <= v_rest then 1 else 0 end);
  end loop;
  return v_out;
end;
$$;

create or replace function app.month_start(p_date date)
returns date
language sql
immutable
as $$
  select date_trunc('month', p_date::timestamp)::date;
$$;

create or replace function app.month_end(p_date date)
returns date
language sql
immutable
as $$
  select (date_trunc('month', p_date::timestamp) + interval '1 month - 1 day')::date;
$$;

create or replace function app.add_months(p_date date, p_months integer)
returns date
language sql
immutable
as $$
  select (p_date + (p_months || ' month')::interval)::date;
$$;

-- ================================================================== CARTÕES ==
-- Garante a fatura do período (mês de competência da parcela).
create or replace function app.ensure_invoice(p_household uuid, p_card uuid, p_period date)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_card    public.credit_cards;
  v_period  date := app.month_start(p_period);
  v_closing date;
  v_due     date;
  v_id      uuid;
  v_year    integer := extract(year from v_period)::int;
  v_month   integer := extract(month from v_period)::int;
begin
  select * into v_card
    from public.credit_cards
   where household_id = p_household and id = p_card;
  if not found then
    raise exception 'cartão inexistente' using errcode = 'P0002';
  end if;

  v_closing := make_date(v_year, v_month, v_card.closing_day);
  if v_card.due_day > v_card.closing_day then
    v_due := make_date(v_year, v_month, v_card.due_day);
  else
    v_due := (make_date(v_year, v_month, v_card.due_day) + interval '1 month')::date;
  end if;

  insert into public.credit_card_invoices
    (household_id, card_id, period_year, period_month, closing_date, due_date)
  values (p_household, p_card, v_year, v_month, v_closing, v_due)
  on conflict (household_id, card_id, period_year, period_month) do nothing;

  select id into v_id
    from public.credit_card_invoices
   where household_id = p_household and card_id = p_card
     and period_year = v_year and period_month = v_month;
  return v_id;
end;
$$;

-- Recalcula total da fatura e status a partir das parcelas.
create or replace function app.recalc_invoice(p_invoice uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total bigint;
  v_inv   public.credit_card_invoices;
  v_stat  invoice_status;
begin
  if p_invoice is null then
    return;
  end if;

  select coalesce(sum(i.amount_cents), 0) into v_total
    from public.installments i
   where i.invoice_id = p_invoice and i.status <> 'canceled';

  select * into v_inv from public.credit_card_invoices where id = p_invoice;
  if not found then
    return;
  end if;

  if v_total > 0 and v_inv.paid_cents >= v_total then
    v_stat := 'paid';
  elsif v_inv.paid_cents > 0 then
    v_stat := 'partially_paid';
  elsif v_inv.closed_at is not null then
    v_stat := 'closed';
  else
    v_stat := 'open';
  end if;

  update public.credit_card_invoices
     set total_cents = v_total,
         status      = v_stat,
         paid_at     = case when v_stat = 'paid' then coalesce(paid_at, now()) else paid_at end
   where id = p_invoice;
end;
$$;

-- Parcela sempre nasce vinculada a uma fatura.
create or replace function app.assign_installment_invoice()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_card uuid;
begin
  if new.invoice_id is null then
    select card_id into v_card
      from public.credit_card_purchases
     where household_id = new.household_id and id = new.purchase_id;
    new.invoice_id := app.ensure_invoice(new.household_id, v_card, new.competence_date);
  end if;
  return new;
end;
$$;

create or replace function app.installments_touch_invoice()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform app.recalc_invoice(old.invoice_id);
    return old;
  end if;
  if tg_op = 'UPDATE' and old.invoice_id is distinct from new.invoice_id then
    perform app.recalc_invoice(old.invoice_id);
  end if;
  perform app.recalc_invoice(new.invoice_id);
  return new;
end;
$$;

create trigger trg_installment_assign
  before insert or update of competence_date, purchase_id on public.installments
  for each row execute function app.assign_installment_invoice();

create trigger trg_installment_recalc
  after insert or update or delete on public.installments
  for each row execute function app.installments_touch_invoice();

-- Compra parcelada: gera as parcelas com rateio exato de centavos.
create or replace function app.create_installment_purchase(
  p_household        uuid,
  p_card             uuid,
  p_description      text,
  p_total_cents      bigint,
  p_installments     integer,
  p_purchase_date    date,
  p_first_due_date   date,
  p_category         uuid    default null,
  p_responsible      uuid    default null,
  p_is_shared        boolean default false,
  p_merchant         text    default null,
  p_notes            text    default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_purchase uuid;
  v_amounts  bigint[];
  v_due      date;
  i          integer;
begin
  if not app.can_write(p_household) then
    raise exception 'sem permissão de escrita neste espaço' using errcode = '42501';
  end if;
  if p_installments is null or p_installments < 1 or p_installments > 120 then
    raise exception 'número de parcelas inválido' using errcode = '22023';
  end if;
  if p_total_cents is null or p_total_cents <= 0 then
    raise exception 'valor total inválido' using errcode = '22023';
  end if;
  if p_first_due_date < app.add_months(p_purchase_date, -1) then
    raise exception 'primeiro vencimento anterior à compra' using errcode = '22023';
  end if;

  v_amounts := app.split_cents(p_total_cents, p_installments);

  insert into public.credit_card_purchases
    (household_id, card_id, description, merchant, total_cents, installments_count,
     purchase_date, first_due_date, category_id, responsible_person_id, is_shared,
     notes, created_by)
  values
    (p_household, p_card, p_description, p_merchant, p_total_cents, p_installments,
     p_purchase_date, p_first_due_date, p_category, p_responsible, p_is_shared,
     p_notes, auth.uid())
  returning id into v_purchase;

  for i in 1..p_installments loop
    v_due := app.add_months(p_first_due_date, i - 1);
    insert into public.installments
      (household_id, purchase_id, number, amount_cents, due_date, competence_date, status)
    values
      (p_household, v_purchase, i, v_amounts[i], v_due, app.month_start(v_due), 'pending');
  end loop;

  return v_purchase;
end;
$$;

-- Pagamento de fatura: saída de caixa + baixa do passivo, SEM nova despesa.
create or replace function app.pay_card_invoice(
  p_invoice    uuid,
  p_account    uuid,
  p_amount     bigint,
  p_paid_on    date    default current_date,
  p_notes      text    default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inv  public.credit_card_invoices;
  v_open bigint;
  v_txn  uuid;
begin
  select * into v_inv from public.credit_card_invoices where id = p_invoice for update;
  if not found then
    raise exception 'fatura inexistente' using errcode = 'P0002';
  end if;
  if not app.can_write(v_inv.household_id) then
    raise exception 'sem permissão de escrita neste espaço' using errcode = '42501';
  end if;

  v_open := v_inv.total_cents - v_inv.paid_cents;
  if p_amount is null or p_amount <= 0 then
    raise exception 'valor de pagamento inválido' using errcode = '22023';
  end if;
  if p_amount > v_open then
    raise exception 'pagamento (%) maior que o saldo da fatura (%)', p_amount, v_open
      using errcode = '22003';
  end if;

  insert into public.account_transactions
    (household_id, kind, status, description, amount_cents, account_id, payment_method,
     occurred_on, competence_date, paid_at, card_invoice_id, notes, created_by)
  values
    (v_inv.household_id, 'card_invoice_payment', 'posted',
     format('Pagamento fatura %s/%s', lpad(v_inv.period_month::text, 2, '0'), v_inv.period_year),
     p_amount, p_account, 'transfer', p_paid_on, app.month_start(v_inv.due_date),
     p_paid_on::timestamptz, p_invoice, p_notes, auth.uid())
  returning id into v_txn;

  update public.credit_card_invoices
     set paid_cents = paid_cents + p_amount
   where id = p_invoice;

  perform app.recalc_invoice(p_invoice);

  return v_txn;
end;
$$;

-- ================================================================== CONTAS ==
create or replace function app.create_transfer(
  p_household  uuid,
  p_from       uuid,
  p_to         uuid,
  p_amount     bigint,
  p_date       date default current_date,
  p_description text default 'Transferência entre contas',
  p_notes      text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if not app.can_write(p_household) then
    raise exception 'sem permissão de escrita neste espaço' using errcode = '42501';
  end if;
  if p_from = p_to then
    raise exception 'origem e destino devem ser diferentes' using errcode = '22023';
  end if;

  insert into public.account_transactions
    (household_id, kind, status, description, amount_cents, account_id, transfer_account_id,
     payment_method, occurred_on, competence_date, paid_at, notes, created_by)
  values
    (p_household, 'transfer', 'posted', p_description, p_amount, p_from, p_to,
     'transfer', p_date, app.month_start(p_date), p_date::timestamptz, p_notes, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- Despesa/receita com rateio opcional entre pessoas do household.
-- p_splits: '[{"person_id":"...","share_cents":90000}, ...]'
create or replace function app.create_transaction(
  p_household   uuid,
  p_kind        txn_kind,
  p_description text,
  p_amount      bigint,
  p_date        date,
  p_account     uuid    default null,
  p_category    uuid    default null,
  p_subcategory uuid    default null,
  p_paid_by     uuid    default null,
  p_payment     payment_method default null,
  p_splits      jsonb   default null,
  p_is_shared   boolean default false,
  p_due_date    date    default null,
  p_notes       text    default null,
  p_tags        text[]  default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id       uuid;
  v_shared   boolean := coalesce(p_is_shared, false) or (p_splits is not null and jsonb_array_length(p_splits) > 0);
  v_sum      bigint := 0;
  v_item     jsonb;
begin
  if not app.can_write(p_household) then
    raise exception 'sem permissão de escrita neste espaço' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'valor inválido' using errcode = '22023';
  end if;
  if p_kind not in ('income','expense') then
    raise exception 'use create_transfer para transferências' using errcode = '22023';
  end if;

  if v_shared then
    if p_paid_by is null then
      raise exception 'despesa compartilhada exige quem pagou' using errcode = '22023';
    end if;
    if p_splits is null or jsonb_array_length(p_splits) = 0 then
      raise exception 'despesa compartilhada exige divisão entre participantes' using errcode = '22023';
    end if;
    select coalesce(sum((s ->> 'share_cents')::bigint), 0) into v_sum
      from jsonb_array_elements(p_splits) s;
    if v_sum <> p_amount then
      raise exception 'soma das partes (%) difere do valor total (%)', v_sum, p_amount
        using errcode = '22003';
    end if;
  end if;

  insert into public.account_transactions
    (household_id, kind, status, description, amount_cents, account_id, category_id,
     subcategory_id, payment_method, occurred_on, competence_date, due_date, paid_at,
     paid_by_person_id, is_shared, notes, tags, created_by)
  values
    (p_household, p_kind, 'posted', p_description, p_amount, p_account, p_category,
     p_subcategory, p_payment, p_date, app.month_start(p_date), p_due_date,
     case when p_kind = 'expense' or p_date <= current_date then p_date::timestamptz else null end,
     p_paid_by, v_shared, p_notes, coalesce(p_tags, '{}'), auth.uid())
  returning id into v_id;

  if v_shared then
    for v_item in select * from jsonb_array_elements(p_splits) loop
      insert into public.transaction_splits
        (household_id, transaction_id, person_id, share_cents, share_pct)
      values
        (p_household, v_id, (v_item ->> 'person_id')::uuid, (v_item ->> 'share_cents')::bigint,
         case when p_amount > 0 then round(((v_item ->> 'share_cents')::numeric / p_amount) * 100, 6) end);
    end loop;
  end if;

  return v_id;
end;
$$;

-- Contas a pagar: o compromisso vive em bills; o pagamento gera a despesa real.
create or replace function app.pay_bill(
  p_bill       uuid,
  p_amount     bigint,
  p_paid_on    date default current_date,
  p_account    uuid default null,
  p_notes      text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_bill  public.bills;
  v_open  bigint;
  v_txn   uuid;
begin
  select * into v_bill from public.bills where id = p_bill for update;
  if not found then
    raise exception 'conta inexistente' using errcode = 'P0002';
  end if;
  if not app.can_write(v_bill.household_id) then
    raise exception 'sem permissão de escrita neste espaço' using errcode = '42501';
  end if;

  v_open := v_bill.amount_cents - v_bill.paid_cents;
  if p_amount is null or p_amount <= 0 or p_amount > v_open then
    raise exception 'valor de pagamento inválido (em aberto: %)', v_open using errcode = '22023';
  end if;

  insert into public.account_transactions
    (household_id, kind, status, description, amount_cents, account_id, category_id,
     subcategory_id, occurred_on, competence_date, paid_at, paid_by_person_id,
     is_shared, notes, created_by)
  values
    (v_bill.household_id, 'expense', 'posted', v_bill.description, p_amount,
     coalesce(p_account, v_bill.account_id), v_bill.category_id, v_bill.subcategory_id,
     p_paid_on, v_bill.competence_date, p_paid_on::timestamptz,
     v_bill.paid_by_person_id, v_bill.is_shared, p_notes, auth.uid())
  returning id into v_txn;

  insert into public.bill_payments (household_id, bill_id, transaction_id, amount_cents, paid_on, notes)
  values (v_bill.household_id, p_bill, v_txn, p_amount, p_paid_on, p_notes);

  update public.bills
     set paid_cents = paid_cents + p_amount,
         paid_at    = case when paid_cents + p_amount >= amount_cents then p_paid_on::timestamptz else paid_at end,
         status     = case when paid_cents + p_amount >= amount_cents then 'paid'::commitment_status
                           when paid_cents + p_amount > 0 then 'partially_paid'::commitment_status
                           else status end
   where id = p_bill;

  return v_txn;
end;
$$;

-- Estorno: cancela o lançamento e grava contrapartida rastreável.
create or replace function app.cancel_transaction(p_txn uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_txn public.account_transactions;
begin
  select * into v_txn from public.account_transactions where id = p_txn for update;
  if not found then
    raise exception 'lançamento inexistente' using errcode = 'P0002';
  end if;
  if not app.can_write(v_txn.household_id) then
    raise exception 'sem permissão de escrita neste espaço' using errcode = '42501';
  end if;
  if v_txn.status = 'canceled' then
    return;
  end if;

  update public.account_transactions set status = 'canceled' where id = p_txn;

  insert into public.account_transactions
    (household_id, kind, status, description, amount_cents, direction, account_id,
     category_id, occurred_on, competence_date, paid_at, reversal_of_id, notes, created_by)
  values
    (v_txn.household_id, 'reversal', 'posted',
     format('Estorno: %s', v_txn.description), v_txn.amount_cents,
     case when v_txn.amount_signed_cents > 0 then -1 else 1 end,
     v_txn.account_id, v_txn.category_id, current_date, v_txn.competence_date,
     current_date::timestamptz, p_txn,
     coalesce(p_reason, 'estorno solicitado'), auth.uid());

  if v_txn.card_invoice_id is not null then
    update public.credit_card_invoices
       set paid_cents = greatest(0, paid_cents - v_txn.amount_cents)
     where id = v_txn.card_invoice_id;
    perform app.recalc_invoice(v_txn.card_invoice_id);
  end if;
end;
$$;

-- ===================================================== DESPESAS COMPARTILHADAS ==
create or replace function app.person_balances(p_household uuid)
returns table (
  person_id     uuid,
  person_name   text,
  paid_cents    bigint,
  share_cents   bigint,
  reimbursed_out bigint,
  reimbursed_in bigint,
  net_cents     bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with base as (
    select p.id, p.name
      from public.people p
     where p.household_id = p_household and p.is_active
  ),
  paid as (
    select t.paid_by_person_id as person_id, sum(t.amount_cents) as total
      from public.account_transactions t
     where t.household_id = p_household
       and t.is_shared
       and t.status in ('posted','reconciled')
       and t.kind = 'expense'
     group by 1
  ),
  shares as (
    select s.person_id, sum(s.share_cents) as total
      from public.transaction_splits s
      join public.account_transactions t
        on t.id = s.transaction_id and t.household_id = s.household_id
     where s.household_id = p_household
       and t.status in ('posted','reconciled')
     group by 1
  ),
  out_paid as (
    select r.from_person_id as person_id, sum(r.amount_cents) as total
      from public.reimbursements r
     where r.household_id = p_household
     group by 1
  ),
  in_paid as (
    select r.to_person_id as person_id, sum(r.amount_cents) as total
      from public.reimbursements r
     where r.household_id = p_household
     group by 1
  )
  select b.id, b.name,
         coalesce(pd.total, 0),
         coalesce(sh.total, 0),
         coalesce(op.total, 0),
         coalesce(ip.total, 0),
         coalesce(pd.total, 0) - coalesce(sh.total, 0) + coalesce(op.total, 0) - coalesce(ip.total, 0)
    from base b
    left join paid pd     on pd.person_id = b.id
    left join shares sh   on sh.person_id = b.id
    left join out_paid op on op.person_id = b.id
    left join in_paid ip  on ip.person_id = b.id;
$$;

-- Acerto mínimo de contas (guloso devedor -> credor).
create or replace function app.simplify_debts(p_household uuid)
returns table (
  from_person uuid,
  from_name   text,
  to_person   uuid,
  to_name     text,
  amount_cents bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_debtors   record;
  v_creditors record;
  v_pay       bigint;
  v_debt      bigint[];
  v_credit    bigint[];
  v_dnames    text[];
  v_cnames    text[];
  v_dids      uuid[];
  v_cids      uuid[];
  i           integer := 1;
  j           integer := 1;
begin
  select array_agg(person_id), array_agg(person_name), array_agg(-net_cents)
    into v_dids, v_dnames, v_debt
    from app.person_balances(p_household)
   where net_cents < 0;

  select array_agg(person_id), array_agg(person_name), array_agg(net_cents)
    into v_cids, v_cnames, v_credit
    from app.person_balances(p_household)
   where net_cents > 0;

  if v_dids is null or v_cids is null then
    return;
  end if;

  while i <= array_length(v_dids, 1) and j <= array_length(v_cids, 1) loop
    v_pay := least(v_debt[i], v_credit[j]);
    if v_pay > 0 then
      from_person := v_dids[i];
      from_name   := v_dnames[i];
      to_person   := v_cids[j];
      to_name     := v_cnames[j];
      amount_cents := v_pay;
      return next;
      v_debt[i]   := v_debt[i] - v_pay;
      v_credit[j] := v_credit[j] - v_pay;
    end if;
    if v_debt[i] <= 0 then i := i + 1; end if;
    if v_credit[j] <= 0 then j := j + 1; end if;
  end loop;
end;
$$;

create or replace function app.settle_people(
  p_household uuid,
  p_payer     uuid,
  p_receiver  uuid,
  p_amount    bigint,
  p_date      date default current_date,
  p_account   uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id  uuid;
  v_txn uuid;
begin
  if not app.can_write(p_household) then
    raise exception 'sem permissão de escrita neste espaço' using errcode = '42501';
  end if;
  if p_payer = p_receiver then
    raise exception 'pagador e recebedor devem ser diferentes' using errcode = '22023';
  end if;

  insert into public.reimbursements
    (household_id, from_person_id, to_person_id, amount_cents, paid_on, notes)
  values (p_household, p_payer, p_receiver, p_amount, p_date, 'acerto de contas')
  returning id into v_id;

  -- O acerto move dinheiro entre pessoas; se sair de uma conta do household,
  -- entra como movimentação de caixa sem virar receita/despesa.
  if p_account is not null then
    insert into public.account_transactions
      (household_id, kind, status, description, amount_cents, account_id, occurred_on,
       competence_date, paid_at, notes, created_by)
    values
      (p_household, 'reimbursement', 'posted',
       'Acerto entre participantes', p_amount, p_account, p_date,
       app.month_start(p_date), p_date::timestamptz, 'acerto de contas', auth.uid())
    returning id into v_txn;

    update public.reimbursements set transaction_id = v_txn where id = v_id;
  end if;

  return v_id;
end;
$$;

-- ================================================================== RECORRÊNCIA ==
create or replace function app.materialize_recurring(p_household uuid, p_until date default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rule     public.recurring_rules;
  v_until    date := coalesce(p_until, current_date + 60);
  v_due      date;
  v_created  integer := 0;
  v_step     interval;
  v_bill     uuid;
  v_receivable uuid;
begin
  if not app.can_write(p_household) then
    raise exception 'sem permissão de escrita neste espaço' using errcode = '42501';
  end if;

  for v_rule in
    select * from public.recurring_rules
     where household_id = p_household and is_active
  loop
    v_step := case v_rule.frequency
                when 'daily' then interval '1 day'
                when 'weekly' then interval '7 days'
                when 'biweekly' then interval '14 days'
                when 'monthly' then interval '1 month'
                when 'bimonthly' then interval '2 months'
                when 'quarterly' then interval '3 months'
                when 'semiannual' then interval '6 months'
                else interval '12 months'
              end;
    v_step := v_step * v_rule.interval_count;

    v_due := greatest(v_rule.start_date, coalesce(v_rule.last_run_on, v_rule.start_date));
    while v_due <= v_until loop
      if v_due >= v_rule.start_date
         and (v_rule.end_date is null or v_due <= v_rule.end_date)
         and not exists (
              select 1 from public.recurring_occurrences o
               where o.household_id = p_household and o.rule_id = v_rule.id and o.due_date = v_due)
      then
        if v_rule.kind = 'expense' then
          insert into public.bills
            (household_id, description, amount_cents, due_date, competence_date, category_id,
             subcategory_id, account_id, paid_by_person_id, is_shared, recurrence_id, status, created_by)
          values
            (p_household, v_rule.description, v_rule.amount_cents, v_due, app.month_start(v_due),
             v_rule.category_id, v_rule.subcategory_id, v_rule.account_id, v_rule.paid_by_person_id,
             v_rule.is_shared, v_rule.id, 'pending', auth.uid())
          returning id into v_bill;

          insert into public.recurring_occurrences
            (household_id, rule_id, due_date, amount_cents, bill_id)
          values (p_household, v_rule.id, v_due, v_rule.amount_cents, v_bill);
        else
          insert into public.receivables
            (household_id, description, amount_cents, expected_date, category_id, account_id,
             status, created_by)
          values
            (p_household, v_rule.description, v_rule.amount_cents, v_due, v_rule.category_id,
             v_rule.account_id, 'pending', auth.uid())
          returning id into v_receivable;

          insert into public.recurring_occurrences
            (household_id, rule_id, due_date, amount_cents, receivable_id)
          values (p_household, v_rule.id, v_due, v_rule.amount_cents, v_receivable);
        end if;
        v_created := v_created + 1;
      end if;
      v_due := (v_due + v_step)::date;
    end loop;

    update public.recurring_rules
       set last_run_on = greatest(coalesce(last_run_on, start_date), v_until)
     where id = v_rule.id;
  end loop;

  return v_created;
end;
$$;

-- ==================================================================== VIEWS ==
create or replace view public.v_account_balances
with (security_invoker = true)
as
with movements as (
  -- saídas/entradas do próprio lançamento
  select t.household_id, t.account_id as account_ref, t.amount_signed_cents as delta
    from public.account_transactions t
   where t.status in ('posted','reconciled') and t.account_id is not null
  union all
  -- perna de entrada da transferência (a saída já está acima)
  select t.household_id, t.transfer_account_id, t.amount_cents
    from public.account_transactions t
   where t.status in ('posted','reconciled')
     and t.kind = 'transfer' and t.transfer_account_id is not null
),
totals as (
  select household_id, account_ref, sum(delta) as delta
    from movements
   group by 1, 2
)
select a.household_id,
       a.id as account_id,
       a.name,
       a.type,
       a.currency,
       a.is_active,
       a.opening_balance_cents,
       a.opening_balance_cents + coalesce(t.delta, 0) as balance_cents
  from public.financial_accounts a
  left join totals t on t.account_ref = a.id and t.household_id = a.household_id;

create or replace view public.v_card_usage
with (security_invoker = true)
as
select c.household_id,
       c.id as card_id,
       c.name,
       c.limit_cents,
       coalesce(sum(i.amount_cents) filter (
         where inv.status in ('open','closed','partially_paid','overdue') and i.status <> 'canceled'
       ), 0) as used_cents,
       c.limit_cents - coalesce(sum(i.amount_cents) filter (
         where inv.status in ('open','closed','partially_paid','overdue') and i.status <> 'canceled'
       ), 0) as available_cents,
       coalesce(sum(i.amount_cents) filter (where i.status = 'pending' and i.due_date > current_date), 0) as future_cents
  from public.credit_cards c
  left join public.credit_card_invoices inv on inv.card_id = c.id and inv.household_id = c.household_id
  left join public.installments i on i.invoice_id = inv.id and i.household_id = c.household_id
 where c.is_active
 group by c.household_id, c.id, c.name, c.limit_cents;

create or replace view public.v_net_worth
with (security_invoker = true)
as
with acc as (
  select household_id, sum(balance_cents) as total from public.v_account_balances group by 1
), inv as (
  select household_id, sum(current_value_cents) as total from public.investment_assets where is_active group by 1
), ass as (
  select household_id, sum(current_value_cents) as total from public.assets where is_active group by 1
), rec as (
  select household_id, sum(amount_cents - received_cents) as total
    from public.receivables where status in ('pending','partially_paid','overdue') group by 1
), bills_open as (
  select household_id, sum(amount_cents - paid_cents) as total
    from public.bills where status in ('pending','partially_paid','overdue') group by 1
), cards_open as (
  select household_id, sum(total_cents - paid_cents) as total
    from public.credit_card_invoices where status in ('open','closed','partially_paid','overdue') group by 1
), liab as (
  select household_id, sum(outstanding_cents) as total from public.liabilities where is_active group by 1
)
select h.id as household_id,
       coalesce(acc.total, 0)                                   as accounts_cents,
       coalesce(inv.total, 0)                                   as investments_cents,
       coalesce(ass.total, 0)                                   as assets_cents,
       coalesce(rec.total, 0)                                   as receivables_cents,
       coalesce(acc.total, 0) + coalesce(inv.total, 0) + coalesce(ass.total, 0) + coalesce(rec.total, 0) as total_assets_cents,
       coalesce(cards_open.total, 0) + coalesce(bills_open.total, 0) + coalesce(liab.total, 0) as total_liabilities_cents,
       coalesce(acc.total, 0) + coalesce(inv.total, 0) + coalesce(ass.total, 0) + coalesce(rec.total, 0)
         - coalesce(cards_open.total, 0) - coalesce(bills_open.total, 0) - coalesce(liab.total, 0) as net_worth_cents
  from public.households h
  left join acc        on acc.household_id = h.id
  left join inv        on inv.household_id = h.id
  left join ass        on ass.household_id = h.id
  left join rec        on rec.household_id = h.id
  left join bills_open on bills_open.household_id = h.id
  left join cards_open on cards_open.household_id = h.id
  left join liab       on liab.household_id = h.id;

-- Despesa por competência: lançamentos à vista/débito + parcelas de cartão.
-- Uma compra no cartão aparece aqui uma única vez, no mês de cada parcela.
create or replace view public.v_accrual_expenses
with (security_invoker = true)
as
select t.household_id,
       t.competence_date,
       t.category_id,
       t.subcategory_id,
       t.amount_cents,
       'transaction'::text as source
  from public.account_transactions t
 where t.status in ('posted','reconciled') and t.kind = 'expense'
union all
select i.household_id,
       i.competence_date,
       p.category_id,
       p.subcategory_id,
       i.amount_cents,
       'installment'::text as source
  from public.installments i
  join public.credit_card_purchases p
    on p.id = i.purchase_id and p.household_id = i.household_id
 where i.status <> 'canceled' and p.status = 'active';

create or replace view public.v_monthly_summary
with (security_invoker = true)
as
select base.household_id,
       base.period,
       base.income_cents,
       base.expense_cents,
       base.income_cents - base.expense_cents as result_cents,
       base.invested_cents
  from (
    select inc.household_id,
           inc.period,
           inc.income_cents,
           coalesce(exp.expense_cents, 0) as expense_cents,
           inc.invested_cents
      from (
        select t.household_id,
               app.month_start(t.competence_date) as period,
               sum(t.amount_cents) filter (where t.kind = 'income') as income_cents,
               sum(t.amount_cents) filter (where t.kind = 'investment_contribution') as invested_cents
          from public.account_transactions t
         where t.status in ('posted','reconciled')
         group by 1, 2
      ) inc
      left join (
        select e.household_id,
               app.month_start(e.competence_date) as period,
               sum(e.amount_cents) as expense_cents
          from public.v_accrual_expenses e
         group by 1, 2
      ) exp on exp.household_id = inc.household_id and exp.period = inc.period
  ) base;

create or replace view public.v_category_spending
with (security_invoker = true)
as
select e.household_id,
       app.month_start(e.competence_date) as period,
       c.id as category_id,
       c.name as category_name,
       c.color,
       coalesce(sum(e.amount_cents), 0) as spent_cents
  from public.v_accrual_expenses e
  join public.categories c on c.id = coalesce(e.subcategory_id, e.category_id)
 group by 1, 2, 3, 4, 5;

create or replace view public.v_budget_status
with (security_invoker = true)
as
select bc.household_id,
       b.id as budget_id,
       b.period_year,
       b.period_month,
       bc.category_id,
       coalesce(c.name, 'Categoria') as category_name,
       bc.limit_cents,
       coalesce(sp.spent_cents, 0) as spent_cents,
       bc.limit_cents - coalesce(sp.spent_cents, 0) as remaining_cents,
       case when bc.limit_cents = 0 then 0
            else round(coalesce(sp.spent_cents, 0)::numeric / bc.limit_cents * 100, 2) end as used_pct,
       case when bc.limit_cents = 0 then 'ok'
            when coalesce(sp.spent_cents, 0) >= bc.limit_cents then 'over'
            when coalesce(sp.spent_cents, 0)::numeric / bc.limit_cents * 100 >= b.critical_pct then 'critical'
            when coalesce(sp.spent_cents, 0)::numeric / bc.limit_cents * 100 >= b.warning_pct then 'warning'
            else 'ok' end as status
  from public.budget_categories bc
  join public.budgets b on b.id = bc.budget_id and b.household_id = bc.household_id
  left join public.categories c on c.id = bc.category_id and c.household_id = bc.household_id
  left join lateral (
    select sum(t.amount_cents) as spent_cents
      from public.account_transactions t
     where t.household_id = bc.household_id
       and t.kind = 'expense'
       and t.status in ('posted','reconciled')
       and extract(year from t.competence_date) = b.period_year
       and extract(month from t.competence_date) = b.period_month
       and (t.category_id = bc.category_id or t.subcategory_id = bc.category_id)
  ) sp on true;

-- ============================================================== DASHBOARD ==
create or replace function app.dashboard_summary(
  p_household uuid,
  p_year      integer,
  p_month     integer,
  p_regime    text default 'cash'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_start  date := make_date(p_year, p_month, 1);
  v_end    date := (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date;
  v_prev   date := (v_start - interval '1 month')::date;
  v_income bigint;
  v_expense bigint;
  v_income_prev bigint;
  v_expense_prev bigint;
  v_balance bigint;
  v_bills  bigint;
  v_cards  bigint;
  v_invest bigint;
  v_net    bigint;
  v_pending_installments bigint;
  v_fixed  bigint;
  v_var    bigint;
begin
  if not app.is_member(p_household) then
    raise exception 'sem acesso a este espaço' using errcode = '42501';
  end if;

  if p_regime = 'cash' then
    -- caixa: o que efetivamente saiu/entrou da conta (inclui pagamento de fatura,
    -- que é liquidação de passivo e não uma nova despesa de consumo)
    select coalesce(sum(amount_cents) filter (where kind = 'income'), 0),
           coalesce(sum(amount_cents) filter (where kind in ('expense','card_invoice_payment')), 0)
      into v_income, v_expense
      from public.account_transactions
     where household_id = p_household and status in ('posted','reconciled')
       and paid_at::date between v_start and v_end;

    select coalesce(sum(amount_cents) filter (where kind = 'income'), 0),
           coalesce(sum(amount_cents) filter (where kind in ('expense','card_invoice_payment')), 0)
      into v_income_prev, v_expense_prev
      from public.account_transactions
     where household_id = p_household and status in ('posted','reconciled')
       and paid_at::date between v_prev and (v_start - 1);
  else
    -- competência: despesa = lançamentos + parcelas de cartão do mês
    select coalesce(sum(amount_cents), 0) into v_income
      from public.account_transactions
     where household_id = p_household and kind = 'income' and status in ('posted','reconciled')
       and competence_date between v_start and v_end;

    select coalesce(sum(amount_cents), 0) into v_expense
      from public.v_accrual_expenses
     where household_id = p_household and competence_date between v_start and v_end;

    select coalesce(sum(amount_cents), 0) into v_income_prev
      from public.account_transactions
     where household_id = p_household and kind = 'income' and status in ('posted','reconciled')
       and competence_date between v_prev and (v_start - 1);

    select coalesce(sum(amount_cents), 0) into v_expense_prev
      from public.v_accrual_expenses
     where household_id = p_household and competence_date between v_prev and (v_start - 1);
  end if;

  select coalesce(sum(balance_cents), 0) into v_balance
    from public.v_account_balances where household_id = p_household and is_active;

  select coalesce(sum(amount_cents - paid_cents), 0) into v_bills
    from public.bills
   where household_id = p_household and status in ('pending','partially_paid','overdue');

  select coalesce(sum(total_cents - paid_cents), 0) into v_cards
    from public.credit_card_invoices
   where household_id = p_household and status in ('open','closed','partially_paid','overdue');

  select coalesce(sum(current_value_cents), 0) into v_invest
    from public.investment_assets where household_id = p_household and is_active;

  select net_worth_cents into v_net
    from public.v_net_worth where household_id = p_household;

  select coalesce(sum(i.amount_cents), 0) into v_pending_installments
    from public.installments i
   where i.household_id = p_household and i.status = 'pending' and i.due_date > v_end;

  select
    coalesce(sum(case when r.frequency in ('monthly','bimonthly','quarterly','semiannual','yearly') then r.amount_cents else 0 end), 0),
    coalesce(sum(case when r.frequency in ('daily','weekly','biweekly') then r.amount_cents else 0 end), 0)
    into v_fixed, v_var
    from public.recurring_rules r
   where r.household_id = p_household and r.is_active and r.kind = 'expense';

  return jsonb_build_object(
    'period', to_char(v_start, 'YYYY-MM'),
    'regime', p_regime,
    'balance_cents', v_balance,
    'income_cents', v_income,
    'expense_cents', v_expense,
    'result_cents', v_income - v_expense,
    'income_prev_cents', v_income_prev,
    'expense_prev_cents', v_expense_prev,
    'income_change_pct', case when v_income_prev > 0
        then round((v_income - v_income_prev)::numeric / v_income_prev * 100, 2) else null end,
    'expense_change_pct', case when v_expense_prev > 0
        then round((v_expense - v_expense_prev)::numeric / v_expense_prev * 100, 2) else null end,
    'bills_open_cents', v_bills,
    'card_invoices_open_cents', v_cards,
    'investments_cents', v_invest,
    'net_worth_cents', coalesce(v_net, 0),
    'future_installments_cents', v_pending_installments,
    'fixed_expenses_cents', v_fixed,
    'variable_expenses_cents', v_var,
    'savings_rate_pct', case when v_income > 0
        then round((v_income - v_expense)::numeric / v_income * 100, 2) else null end,
    'income_commitment_pct', case when v_income > 0
        then round(v_expense::numeric / v_income * 100, 2) else null end
  );
end;
$$;

-- Projeção de caixa: saldo atual + compromissos conhecidos.
create or replace function app.project_cashflow(p_household uuid, p_days integer default 30)
returns table (
  day               date,
  inflow_cents      bigint,
  outflow_cents     bigint,
  projected_balance bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_balance bigint;
begin
  if not app.is_member(p_household) then
    raise exception 'sem acesso a este espaço' using errcode = '42501';
  end if;

  select coalesce(sum(balance_cents), 0) into v_balance
    from public.v_account_balances where household_id = p_household and is_active;

  return query
  with days as (
    select generate_series(current_date, current_date + (p_days - 1), interval '1 day')::date as d
  ),
  flows as (
    -- contas a pagar (atrasadas entram hoje)
    select greatest(b.due_date, current_date) as d,
           0::bigint as inflow,
           (b.amount_cents - b.paid_cents)::bigint as outflow
      from public.bills b
     where b.household_id = p_household
       and b.status in ('pending','partially_paid','overdue')
    union all
    -- faturas de cartão em aberto
    select greatest(inv.due_date, current_date),
           0::bigint,
           (inv.total_cents - inv.paid_cents)::bigint
      from public.credit_card_invoices inv
     where inv.household_id = p_household
       and inv.status in ('open','closed','partially_paid','overdue')
    union all
    -- contas a receber
    select greatest(r.expected_date, current_date),
           (r.amount_cents - r.received_cents)::bigint,
           0::bigint
      from public.receivables r
     where r.household_id = p_household
       and r.status in ('pending','partially_paid','overdue')
  ),
  agg as (
    select d, sum(inflow) as inflow, sum(outflow) as outflow
      from flows
     group by 1
  )
  select days.d,
         coalesce(a.inflow, 0)::bigint  as inflow_cents,
         coalesce(a.outflow, 0)::bigint as outflow_cents,
         (v_balance + sum(coalesce(a.inflow, 0) - coalesce(a.outflow, 0))
                      over (order by days.d))::bigint as projected_balance
    from days
    left join agg a on a.d = days.d
   order by days.d;
end;
$$;

-- ========================================================= SAÚDE FINANCEIRA ==
-- Pesos documentados: comprometimento 30, poupança 25, reserva 20,
-- endividamento 15, atrasos 10.
create or replace function app.health_score(p_household uuid, p_year integer, p_month integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_dash     jsonb;
  v_income   bigint;
  v_expense  bigint;
  v_cash     bigint;
  v_liab     bigint;
  v_commit   numeric;
  v_saving   numeric;
  v_reserve  numeric;
  v_debt     numeric;
  v_late     integer;
  v_p_commit numeric;
  v_p_save   numeric;
  v_p_res    numeric;
  v_p_debt   numeric;
  v_p_late   numeric;
  v_score    numeric;
begin
  if not app.is_member(p_household) then
    raise exception 'sem acesso a este espaço' using errcode = '42501';
  end if;

  v_dash := app.dashboard_summary(p_household, p_year, p_month, 'competence');
  v_income  := (v_dash ->> 'income_cents')::bigint;
  v_expense := (v_dash ->> 'expense_cents')::bigint;

  v_commit := case when v_income > 0 then v_expense::numeric / v_income else 1 end;
  v_saving := case when v_income > 0 then greatest(0, (v_income - v_expense)::numeric / v_income) else 0 end;

  select coalesce(sum(balance_cents), 0) into v_cash
    from public.v_account_balances
   where household_id = p_household and is_active;

  -- meses de despesa cobertos pela reserva (limitado a 12)
  v_reserve := case when v_expense > 0 then v_cash::numeric / v_expense else 0 end;
  v_reserve := least(12, greatest(0, coalesce(v_reserve, 0)));

  select coalesce(total_liabilities_cents, 0) into v_liab
    from public.v_net_worth where household_id = p_household;

  v_debt := case when v_cash > 0 then coalesce(v_liab, 0)::numeric / v_cash else 0 end;

  select count(*) into v_late
    from public.bills
   where household_id = p_household
     and status in ('pending','partially_paid','overdue')
     and due_date < current_date;

  v_p_commit := greatest(0, least(30, 30 * (1 - least(v_commit, 1)) / 0.5));
  v_p_save   := greatest(0, least(25, 25 * least(v_saving / 0.2, 1)));
  v_p_res    := greatest(0, least(20, 20 * least(coalesce(v_reserve, 0) / 6, 1)));
  v_p_debt   := greatest(0, least(15, 15 * (1 - least(coalesce(v_debt, 0), 2) / 2)));
  v_p_late   := greatest(0, least(10, 10 - v_late * 2));

  v_score := round(v_p_commit + v_p_save + v_p_res + v_p_debt + v_p_late, 0);

  return jsonb_build_object(
    'score', greatest(0, least(100, v_score)),
    'components', jsonb_build_object(
      'commitment', jsonb_build_object('weight', 30, 'points', round(v_p_commit, 1), 'ratio', round(coalesce(v_commit, 0), 4)),
      'savings', jsonb_build_object('weight', 25, 'points', round(v_p_save, 1), 'rate', round(coalesce(v_saving, 0), 4)),
      'emergency_fund', jsonb_build_object('weight', 20, 'points', round(v_p_res, 1), 'months', round(coalesce(v_reserve, 0), 1)),
      'debt', jsonb_build_object('weight', 15, 'points', round(v_p_debt, 1), 'ratio', round(coalesce(v_debt, 0), 4)),
      'late_payments', jsonb_build_object('weight', 10, 'points', round(v_p_late, 1), 'count', v_late)
    ),
    'disclaimer', 'Indicador interno de organização financeira; não é avaliação de crédito.'
  );
end;
$$;

-- ============================================================ HOUSEHOLD/RPC ==
create or replace function app.seed_categories(p_household uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_parent uuid;
begin
  insert into public.categories (household_id, name, kind, color, icon, is_system, sort_order)
  values
    (p_household, 'Moradia',        'expense', '#2563EB', 'home',          true, 10),
    (p_household, 'Alimentação',    'expense', '#F59E0B', 'utensils',      true, 20),
    (p_household, 'Transporte',     'expense', '#0EA5E9', 'car',           true, 30),
    (p_household, 'Saúde',          'expense', '#EF4444', 'heart-pulse',   true, 40),
    (p_household, 'Educação',       'expense', '#8B5CF6', 'graduation-cap',true, 50),
    (p_household, 'Lazer',          'expense', '#EC4899', 'popcorn',       true, 60),
    (p_household, 'Assinaturas',    'expense', '#6366F1', 'repeat',        true, 70),
    (p_household, 'Vestuário',      'expense', '#14B8A6', 'shirt',         true, 80),
    (p_household, 'Despesas da casa','expense','#64748B', 'house',         true, 90),
    (p_household, 'Outros',         'expense', '#94A3B8', 'ellipsis',      true, 999),
    (p_household, 'Salário',        'income',  '#16A34A', 'banknote',      true, 10),
    (p_household, 'Freelance',      'income',  '#22C55E', 'laptop',        true, 20),
    (p_household, 'Investimentos',  'income',  '#7C3AED', 'trending-up',   true, 30),
    (p_household, 'Reembolso',      'income',  '#0D9488', 'undo-2',        true, 40),
    (p_household, 'Outras receitas', 'income', '#65A30D', 'plus-circle',   true, 999);

  -- subcategorias de Moradia e Alimentação
  select id into v_parent from public.categories
   where household_id = p_household and name = 'Moradia' and parent_id is null;
  insert into public.categories (household_id, parent_id, name, kind, color, icon, is_system, sort_order)
  values
    (p_household, v_parent, 'Aluguel',     'expense', '#2563EB', 'key',        true, 11),
    (p_household, v_parent, 'Condomínio',  'expense', '#2563EB', 'building',   true, 12),
    (p_household, v_parent, 'Energia',     'expense', '#2563EB', 'zap',        true, 13),
    (p_household, v_parent, 'Água',        'expense', '#2563EB', 'droplets',   true, 14),
    (p_household, v_parent, 'Internet',    'expense', '#2563EB', 'wifi',       true, 15);

  select id into v_parent from public.categories
   where household_id = p_household and name = 'Alimentação' and parent_id is null;
  insert into public.categories (household_id, parent_id, name, kind, color, icon, is_system, sort_order)
  values
    (p_household, v_parent, 'Supermercado', 'expense', '#F59E0B', 'shopping-cart', true, 21),
    (p_household, v_parent, 'Restaurantes', 'expense', '#F59E0B', 'chef-hat',      true, 22),
    (p_household, v_parent, 'Delivery',     'expense', '#F59E0B', 'bike',          true, 23);
end;
$$;

create or replace function app.create_household(
  p_name       text,
  p_user_name  text default null,
  p_is_demo    boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_household uuid;
  v_person    uuid;
begin
  if auth.uid() is null then
    raise exception 'sessão inválida' using errcode = '42501';
  end if;

  insert into public.households (name, created_by, is_demo)
  values (coalesce(nullif(trim(p_name), ''), 'Meu espaço'), auth.uid(), p_is_demo)
  returning id into v_household;

  insert into public.household_members (household_id, user_id, role)
  values (v_household, auth.uid(), 'owner');

  insert into public.people (household_id, user_id, name)
  values (v_household, auth.uid(), coalesce(nullif(trim(p_user_name), ''), 'Eu'))
  returning id into v_person;

  insert into public.user_settings (user_id, active_household_id)
  values (auth.uid(), v_household)
  on conflict (user_id) do update set active_household_id = excluded.active_household_id;

  perform app.seed_categories(v_household);

  insert into public.financial_accounts (household_id, name, type, color, icon, owner_person_id)
  values (v_household, 'Conta principal', 'checking', '#2563EB', 'wallet', v_person);

  return v_household;
end;
$$;

-- Novo usuário ganha profile automaticamente.
create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Perfil criado automaticamente no cadastro (trigger em auth.users).
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- ================================================================ GRANTS ====
grant execute on function
  app.split_cents(bigint, integer),
  app.month_start(date),
  app.month_end(date),
  app.add_months(date, integer),
  app.create_installment_purchase(uuid, uuid, text, bigint, integer, date, date, uuid, uuid, boolean, text, text),
  app.pay_card_invoice(uuid, uuid, bigint, date, text),
  app.create_transfer(uuid, uuid, uuid, bigint, date, text, text),
  app.create_transaction(uuid, txn_kind, text, bigint, date, uuid, uuid, uuid, uuid, payment_method, jsonb, boolean, date, text, text[]),
  app.pay_bill(uuid, bigint, date, uuid, text),
  app.cancel_transaction(uuid, text),
  app.person_balances(uuid),
  app.simplify_debts(uuid),
  app.settle_people(uuid, uuid, uuid, bigint, date, uuid),
  app.materialize_recurring(uuid, date),
  app.dashboard_summary(uuid, integer, integer, text),
  app.project_cashflow(uuid, integer),
  app.health_score(uuid, integer, integer),
  app.create_household(text, text, boolean)
  to authenticated;

-- Funções internas: usadas apenas por outras funções (SECURITY DEFINER) ou
-- pelo painel administrativo. Não ficam expostas ao cliente.
revoke all on function app.seed_categories(uuid) from public;
revoke all on function app.ensure_invoice(uuid, uuid, date) from public;
revoke all on function app.recalc_invoice(uuid) from public;
