-- ============================================================================
-- Finanças+ — 0009 — Importação de fatura de cartão
--
-- Uma linha de fatura é uma cobrança do cartão, não uma despesa: entra como
-- compra de 1 parcela amarrada à fatura do ciclo. Projetar as parcelas futuras
-- seria inventar o que o PDF não afirma — a próxima fatura traz as suas.
--
-- Idempotência: external_id (fingerprint calculado no parser) + índice único
-- parcial. Reimportar o mesmo PDF não duplica nada.
-- ============================================================================

alter table public.credit_card_purchases add column if not exists external_id text;

create unique index if not exists credit_card_purchases_external_uidx
  on public.credit_card_purchases (household_id, card_id, external_id)
  where external_id is not null;

create or replace function app.import_invoice_rows(
  p_household uuid,
  p_issuer    text,
  p_due_date  date,
  p_rows      jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row         jsonb;
  v_ending      text;
  v_card        uuid;
  v_card_name   text;
  v_invoice     uuid;
  v_purchase    uuid;
  v_period_year integer := extract(year from p_due_date)::int;
  v_period_mon  integer := extract(month from p_due_date)::int;
  v_amount      bigint;
  v_closing_day smallint;
  v_due_day     smallint;
  v_gap         integer;
  v_closing     date;
  v_inserted    integer := 0;
  v_skipped     integer := 0;
  v_total       bigint := 0;
  v_cards       text[] := '{}';
  v_created     integer := 0;
begin
  if not app.can_write(p_household) then
    raise exception 'sem permissão de escrita neste espaço' using errcode = '42501';
  end if;
  if p_due_date is null then
    raise exception 'fatura sem data de vencimento' using errcode = '22023';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_amount := coalesce((v_row ->> 'amount_cents')::bigint, 0);
    if v_amount <= 0 then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    -- um cartão por final, como o banco trata: cada final é um pagamento próprio
    v_ending := nullif(btrim(coalesce(v_row ->> 'card_end', '')), '');

    select id into v_card
      from public.credit_cards
     where household_id = p_household
       and (v_ending is null or last4 = v_ending)
     order by (last4 = v_ending) desc nulls last, created_at
     limit 1;

    if v_card is null then
      v_card_name := initcap(coalesce(p_issuer, 'Cartão')) || coalesce(' •' || v_ending, '');
      insert into public.credit_cards
        (household_id, name, institution, last4, limit_cents, closing_day, due_day)
      values
        (p_household, v_card_name, initcap(coalesce(p_issuer, 'Cartão')), v_ending, 0, 28, 5)
      returning id into v_card;
      v_created := v_created + 1;
      v_cards := array_append(v_cards, v_card_name);
    end if;

    -- fechamento derivado da configuração do cartão (o PDF nem sempre traz)
    select closing_day, due_day into v_closing_day, v_due_day
      from public.credit_cards where id = v_card;
    v_gap := v_due_day - v_closing_day;
    if v_gap <= 0 then
      v_gap := v_gap + 30;
    end if;
    v_closing := p_due_date - v_gap;

    insert into public.credit_card_invoices
      (household_id, card_id, period_year, period_month, closing_date, due_date, status)
    values
      (p_household, v_card, v_period_year, v_period_mon, v_closing, p_due_date, 'open')
    on conflict (household_id, card_id, period_year, period_month)
    do update set due_date = excluded.due_date, closing_date = excluded.closing_date
    returning id into v_invoice;

    insert into public.credit_card_purchases
      (household_id, card_id, description, total_cents, installments_count,
       purchase_date, first_due_date, status, notes, external_id)
    values
      (p_household, v_card, v_row ->> 'description', v_amount, 1,
       coalesce((v_row ->> 'date')::date, p_due_date), p_due_date, 'active',
       case
         when (v_row ->> 'installment_number') is not null
           then format('parcela %s/%s (importada da fatura %s/%s)',
                       v_row ->> 'installment_number', v_row ->> 'installment_total',
                       lpad(v_period_mon::text, 2, '0'), v_period_year)
         else format('importada da fatura %s/%s', lpad(v_period_mon::text, 2, '0'), v_period_year)
       end,
       v_row ->> 'fingerprint')
    on conflict (household_id, card_id, external_id) where external_id is not null
    do nothing
    returning id into v_purchase;

    if v_purchase is null then
      v_skipped := v_skipped + 1;   -- já importada antes
      continue;
    end if;

    insert into public.installments
      (household_id, purchase_id, invoice_id, number, amount_cents, due_date, competence_date, status)
    values
      (p_household, v_purchase, v_invoice, 1, v_amount, p_due_date, app.month_start(p_due_date), 'pending');

    v_inserted := v_inserted + 1;
    v_total := v_total + v_amount;
  end loop;

  if v_invoice is not null then
    perform app.recalc_invoice(v_invoice);
  end if;

  return jsonb_build_object(
    'inserted', v_inserted,
    'skipped', v_skipped,
    'total_cents', v_total,
    'created_cards', v_created,
    'cards', to_jsonb(v_cards)
  );
end;
$$;

-- ------------------------------------------------------------- API pública ---
create or replace function public.fin_import_invoice_rows(
  p_household uuid,
  p_issuer    text,
  p_due_date  date,
  p_rows      jsonb
)
returns jsonb
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app.import_invoice_rows(p_household, p_issuer, p_due_date, p_rows);
$$;

grant execute on function public.fin_import_invoice_rows(uuid, text, date, jsonb) to authenticated;
