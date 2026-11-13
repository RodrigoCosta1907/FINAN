-- ============================================================================
-- Finanças+ — 0010 — Compra no crédito pelo Telegram
--
-- 1) app.invoice_for_card: em que fatura cai uma compra, pelo fechamento do
--    cartão (compra depois do fechamento vai para o ciclo seguinte).
-- 2) app.add_card_charge: grava compra + parcela na fatura certa, idempotente.
-- 3) telegram_drafts: a compra fica "pendente" enquanto o bot pergunta em que
--    cartão ela foi (botões), e só é gravada depois da resposta.
-- ============================================================================

create or replace function app.invoice_for_card(p_card uuid, p_date date)
returns table (period_year integer, period_month integer, closing_date date, due_date date)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_close_day smallint;
  v_due_day   smallint;
  v_year      integer := extract(year from p_date)::int;
  v_month     integer := extract(month from p_date)::int;
  v_closing   date;
  v_due       date;
begin
  select closing_day, due_day into v_close_day, v_due_day
    from public.credit_cards where id = p_card;

  if not found then
    raise exception 'cartão inexistente' using errcode = 'P0002';
  end if;

  -- compra depois do fechamento entra no ciclo seguinte
  if extract(day from p_date)::int > v_close_day then
    v_month := v_month + 1;
    if v_month = 13 then
      v_month := 1;
      v_year := v_year + 1;
    end if;
  end if;

  v_closing := make_date(v_year, v_month, v_close_day);

  if v_due_day > v_close_day then
    v_due := make_date(v_year, v_month, v_due_day);
  elsif v_month = 12 then
    v_due := make_date(v_year + 1, 1, v_due_day);
  else
    v_due := make_date(v_year, v_month + 1, v_due_day);
  end if;

  return query
    select extract(year from v_due)::int, extract(month from v_due)::int, v_closing, v_due;
end;
$$;

create or replace function app.add_card_charge(
  p_household   uuid,
  p_card        uuid,
  p_description text,
  p_amount      bigint,
  p_date        date,
  p_category    uuid default null,
  p_external_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inv   record;
  v_invoice uuid;
  v_purchase uuid;
  v_existing uuid;
begin
  -- o webhook do bot roda com service role (sem JWT): a autorização já foi
  -- feita pelo allowlist + telegram_links; com sessão de usuário, exige vínculo
  if auth.uid() is not null and not app.can_write(p_household) then
    raise exception 'sem permissão de escrita neste espaço' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'valor inválido' using errcode = '22023';
  end if;
  if not exists (select 1 from public.credit_cards where id = p_card and household_id = p_household) then
    raise exception 'cartão não pertence a este espaço' using errcode = '42501';
  end if;

  if p_external_id is not null then
    select id into v_existing from public.credit_card_purchases
     where household_id = p_household and card_id = p_card and external_id = p_external_id
     limit 1;
    if v_existing is not null then
      return jsonb_build_object('purchase_id', v_existing, 'duplicate', true);
    end if;
  end if;

  select * into v_inv from app.invoice_for_card(p_card, p_date);

  insert into public.credit_card_invoices
    (household_id, card_id, period_year, period_month, closing_date, due_date, status)
  values
    (p_household, p_card, v_inv.period_year, v_inv.period_month, v_inv.closing_date, v_inv.due_date, 'open')
  on conflict (household_id, card_id, period_year, period_month)
  do nothing;

  select id into v_invoice from public.credit_card_invoices
   where household_id = p_household and card_id = p_card
     and period_year = v_inv.period_year and period_month = v_inv.period_month;

  insert into public.credit_card_purchases
    (household_id, card_id, description, total_cents, installments_count,
     purchase_date, first_due_date, category_id, status, notes, external_id)
  values
    (p_household, p_card, p_description, p_amount, 1, p_date, v_inv.due_date,
     p_category, 'active', 'capturada via telegram', p_external_id)
  returning id into v_purchase;

  insert into public.installments
    (household_id, purchase_id, invoice_id, number, amount_cents, due_date, competence_date, status)
  values
    (p_household, v_purchase, v_invoice, 1, p_amount, v_inv.due_date,
     app.month_start(v_inv.due_date), 'pending');

  perform app.recalc_invoice(v_invoice);

  return jsonb_build_object(
    'purchase_id', v_purchase,
    'invoice_id', v_invoice,
    'closing_date', v_inv.closing_date,
    'due_date', v_inv.due_date,
    'period', lpad(v_inv.period_month::text, 2, '0') || '/' || v_inv.period_year,
    'duplicate', false
  );
end;
$$;

-- ------------------------------------------------- bot: compra pendente ---
create table if not exists public.telegram_drafts (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,
  household_id     uuid not null references public.households(id) on delete cascade,
  telegram_user_id bigint not null,
  chat_id          bigint not null,
  description      text not null,
  amount_cents     bigint not null check (amount_cents > 0),
  occurred_on      date not null,
  external_id      text not null,
  status           text not null default 'pending' check (status in ('pending','resolved','canceled')),
  card_id          uuid,
  purchase_id      uuid,
  created_at       timestamptz not null default now(),
  resolved_at      timestamptz
);

create index if not exists telegram_drafts_code_idx on public.telegram_drafts (code) where status = 'pending';
alter table public.telegram_drafts enable row level security;

drop policy if exists telegram_drafts_member on public.telegram_drafts;
create policy telegram_drafts_member on public.telegram_drafts
  for select to authenticated
  using (app.is_member(household_id));

drop policy if exists telegram_drafts_insert on public.telegram_drafts;
create policy telegram_drafts_insert on public.telegram_drafts
  for insert to authenticated
  with check (app.is_member(household_id));

-- resolve o rascunho em uma cobrança no cartão escolhido
create or replace function app.resolve_telegram_draft(p_code text, p_last4 text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_draft public.telegram_drafts;
  v_card  uuid;
  v_card_name text;
  v_result jsonb;
begin
  select * into v_draft from public.telegram_drafts
   where code = p_code and status = 'pending' for update;

  if not found then
    raise exception 'rascunho inexistente ou já resolvido' using errcode = 'P0002';
  end if;

  select id, name into v_card, v_card_name
    from public.credit_cards
   where household_id = v_draft.household_id and last4 = p_last4
   order by created_at
   limit 1;

  if v_card is null then
    raise exception 'cartão com final % não encontrado', p_last4 using errcode = 'P0002';
  end if;

  v_result := app.add_card_charge(
    v_draft.household_id, v_card, v_draft.description, v_draft.amount_cents,
    v_draft.occurred_on, null, v_draft.external_id
  );

  update public.telegram_drafts
     set status = 'resolved', card_id = v_card,
         purchase_id = (v_result ->> 'purchase_id')::uuid, resolved_at = now()
   where id = v_draft.id;

  return v_result || jsonb_build_object('card_name', v_card_name);
end;
$$;

-- ------------------------------------------------------------- API pública ---
create or replace function public.fin_add_card_charge(
  p_household   uuid,
  p_card        uuid,
  p_description text,
  p_amount      bigint,
  p_date        date,
  p_category    uuid default null,
  p_external_id text default null
)
returns jsonb
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app.add_card_charge(p_household, p_card, p_description, p_amount, p_date, p_category, p_external_id);
$$;

create or replace function public.fin_resolve_telegram_draft(p_code text, p_last4 text)
returns jsonb
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app.resolve_telegram_draft(p_code, p_last4);
$$;

grant execute on function public.fin_resolve_telegram_draft(text, text) to authenticated;
grant execute on function public.fin_add_card_charge(uuid, uuid, text, bigint, date, uuid, text) to authenticated;
