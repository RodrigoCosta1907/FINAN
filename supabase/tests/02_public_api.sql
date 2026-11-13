-- ============================================================================
-- API pública: os wrappers `public.fin_*` precisam existir e funcionar com o
-- mesmo RLS do domínio (é o que o app chama via supabase.rpc).
-- ============================================================================
begin;

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;

do $$
declare
  v_count integer;
  v_hh    uuid;
  v_dash  jsonb;
  v_bal   bigint;
begin
  select count(*) into v_count
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'fin\_%';
  if v_count <> 14 then
    raise exception 'esperava 14 funções fin_*, encontrei %', v_count;
  end if;
  insert into t_results values ('wrappers public.fin_*', v_count::text);

  v_hh := public.fin_create_household('Casa API', 'Rodrigo', true);
  if v_hh is null then
    raise exception 'fin_create_household devolveu null';
  end if;

  select count(*) into v_count from public.household_members
   where household_id = v_hh and user_id = auth.uid();
  if v_count <> 1 then
    raise exception 'membership não criada pelo wrapper';
  end if;

  v_dash := public.fin_dashboard_summary(v_hh, 2026, 11, 'cash');
  if (v_dash ->> 'income_cents')::bigint <> 0 then
    raise exception 'dashboard de household vazio deveria ser 0';
  end if;

  select coalesce(sum(balance_cents), 0) into v_bal
    from public.v_account_balances where household_id = v_hh;
  if v_bal <> 0 then
    raise exception 'saldo inicial deveria ser 0, veio %', v_bal;
  end if;

  insert into t_results values ('wrappers criam household + dashboard', 'ok');
end;
$$;

select 'public_api' as bloco, check_name, detail from t_results;
commit;
