-- ============================================================================
-- Finanças+ — 0006 — Captura por Telegram
-- * telegram_links: qual usuário/household recebe as mensagens do bot
-- * telegram_updates: idempotência do webhook (Telegram reenvia update)
-- * app.ingest_transaction / public.fin_ingest_transaction: lançamento vindo
--   de fora (sem sessão), idempotente por external_id.
-- Só o service_role executa a função pública — anon/authenticated não.
-- ============================================================================

create table if not exists public.telegram_links (
  telegram_user_id bigint primary key,
  user_id          uuid not null references auth.users(id) on delete cascade,
  household_id     uuid not null references public.households(id) on delete cascade,
  person_id        uuid,
  created_at       timestamptz not null default now(),
  constraint telegram_link_person_fk
    foreign key (household_id, person_id) references public.people (household_id, id) on delete set null
);

alter table public.telegram_links enable row level security;
-- Sem policy: nenhuma sessão de usuário lê/escreve aqui. Apenas service_role
-- (que ignora RLS) usa esta tabela pelo webhook.

create table if not exists public.telegram_updates (
  update_id    bigint primary key,
  received_at  timestamptz not null default now()
);

alter table public.telegram_updates enable row level security;

-- ---------------------------------------------------------------- domínio ----
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

  -- idempotência: mesma mensagem entregue duas vezes não duplica
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
     p_date, app.month_start(p_date), p_date::timestamptz, p_person, p_external_id,
     format('capturado via %s', coalesce(p_source, 'externo')))
  returning id into v_id;

  return v_id;
end;
$$;

-- ------------------------------------------------------------- API pública ---
create or replace function public.fin_ingest_transaction(
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
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app.ingest_transaction(p_household, p_kind, p_description, p_amount, p_date,
                                p_category, p_external_id, p_person, p_source);
$$;

grant usage on schema app to service_role;
revoke all on function public.fin_ingest_transaction(uuid, txn_kind, text, bigint, date, text, text, uuid, text) from public;
revoke all on function public.fin_ingest_transaction(uuid, txn_kind, text, bigint, date, text, text, uuid, text) from anon;
revoke all on function public.fin_ingest_transaction(uuid, txn_kind, text, bigint, date, text, text, uuid, text) from authenticated;
grant execute on function public.fin_ingest_transaction(uuid, txn_kind, text, bigint, date, text, text, uuid, text) to service_role;
