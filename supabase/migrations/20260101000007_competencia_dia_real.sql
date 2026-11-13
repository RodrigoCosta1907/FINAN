-- ============================================================================
-- Finanças+ — 0007 — Competência com o dia real
-- Bug: app.create_transaction / app.ingest_transaction gravavam
-- competence_date = primeiro dia do mês, perdendo o dia. Com filtro por
-- intervalo de datas (ex.: 05/11 a 13/11) nada aparecia.
-- Correção: competence_date = a própria data do lançamento. O agrupamento
-- mensal continua funcionando (as views usam app.month_start na leitura).
-- ============================================================================

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
  v_id     uuid;
  v_shared boolean := coalesce(p_is_shared, false) or (p_splits is not null and jsonb_array_length(p_splits) > 0);
  v_sum    bigint := 0;
  v_item   jsonb;
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
     p_subcategory, p_payment, p_date, p_date, p_due_date,
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

create or replace function app.ingest_transaction(
  p_household   uuid,
  p_kind        txn_kind,
  p_description text,
  p_amount      bigint,
  p_date        date,
  p_category    text    default null,
  p_external_id text    default null,
  p_person      uuid    default null,
  p_source      text    default 'telegram'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_account  uuid;
  v_category uuid;
  v_id       uuid;
  v_existing uuid;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'valor inválido para lançamento' using errcode = '22023';
  end if;
  if p_kind not in ('income', 'expense') then
    raise exception 'tipo inválido para captura externa' using errcode = '22023';
  end if;

  if p_external_id is not null then
    select id into v_existing
      from public.account_transactions
     where household_id = p_household and external_id = p_external_id
     limit 1;
    if v_existing is not null then
      return v_existing;
    end if;
  end if;

  select id into v_account
    from public.financial_accounts
   where household_id = p_household and is_active
   order by created_at
   limit 1;
  if v_account is null then
    raise exception 'household sem conta financeira ativa' using errcode = 'P0002';
  end if;

  if p_category is not null then
    select id into v_category
      from public.categories
     where household_id = p_household
       and parent_id is null
       and lower(name) = lower(p_category)
     limit 1;
  end if;

  insert into public.account_transactions
    (household_id, kind, status, description, amount_cents, account_id, category_id,
     occurred_on, competence_date, paid_at, paid_by_person_id, external_id, notes)
  values
    (p_household, p_kind, 'posted', p_description, p_amount, v_account, v_category,
     p_date, p_date, p_date::timestamptz, p_person, p_external_id,
     format('capturado via %s', coalesce(p_source, 'externo')))
  returning id into v_id;

  return v_id;
end;
$$;

-- Corrige o que já foi gravado por create_transaction / ingest_transaction.
-- Não toca em lançamentos de pagamento de conta (esses mantêm a competência
-- do mês da obrigação) — eles estão vinculados em bill_payments.
update public.account_transactions t
   set competence_date = t.occurred_on
 where t.occurred_on is not null
   and t.competence_date <> t.occurred_on
   and t.competence_date = date_trunc('month', t.occurred_on)::date
   and t.kind in ('income', 'expense')
   and not exists (
     select 1 from public.bill_payments bp where bp.transaction_id = t.id
   );
