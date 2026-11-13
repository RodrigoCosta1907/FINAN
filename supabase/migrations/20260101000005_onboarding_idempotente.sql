-- ============================================================================
-- Finanças+ — 0005 — Onboarding idempotente
-- Bug encontrado em produção: o layout e a página chamam ensureHousehold em
-- paralelo; sem trava, duas requisições concorrentes criavam DOIS households
-- para o mesmo usuário (cada um com categorias e conta própria).
-- Correção: trava por usuário + retorno do espaço existente.
-- ============================================================================

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

  -- Serializa chamadas concorrentes do mesmo usuário (transação inteira).
  perform pg_advisory_xact_lock(hashtextextended('fin:household:' || auth.uid()::text, 0));

  -- Já tem espaço? Devolve o mais antigo em vez de criar outro.
  select m.household_id into v_household
    from public.household_members m
   where m.user_id = auth.uid()
   order by m.joined_at
   limit 1;

  if v_household is not null then
    update public.user_settings
       set active_household_id = v_household
     where user_id = auth.uid();
    return v_household;
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
