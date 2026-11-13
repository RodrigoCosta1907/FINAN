-- ============================================================================
-- API pública + onboarding idempotente.
-- O wrapper public.fin_* precisa existir, respeitar RLS e NÃO duplicar espaço
-- financeiro quando chamado duas vezes (bug corrigido na migration 0005).
-- ============================================================================
begin;

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;

do $$
declare
  v_count   integer;
  v_hh1     uuid;
  v_hh2     uuid;
  v_before  integer;
  v_after   integer;
  v_bal     bigint;
begin
  select count(*) into v_count
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'fin\_%';
  if v_count <> 18 then
    raise exception 'esperava 18 funções fin_*, encontrei %', v_count;
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('fin_receive_receivable', 'fin_close_invoice')
  ) then
    raise exception 'faltam as funções de baixa da fase 3';
  end if;

  insert into t_results values ('wrappers public.fin_*', v_count::text);

  select count(*) into v_before from public.households;

  v_hh1 := public.fin_create_household('Casa API', 'Rodrigo', true);
  select count(*) into v_after from public.households;
  if v_after <> v_before then
    raise exception 'segunda chamada criou household novo (% -> %)', v_before, v_after;
  end if;

  v_hh2 := public.fin_create_household('Casa API', 'Rodrigo', true);
  if v_hh2 <> v_hh1 then
    raise exception 'onboarding não é idempotente: % <> %', v_hh1, v_hh2;
  end if;
  insert into t_results values ('onboarding idempotente', 'mesmo household, sem duplicar');

  select count(*) into v_count
    from public.household_members
   where household_id = v_hh1 and user_id = auth.uid();
  if v_count <> 1 then
    raise exception 'membership não criada pelo wrapper';
  end if;

  select count(*) into v_count from public.categories where household_id = v_hh1;
  if v_count < 15 then
    raise exception 'categorias padrão não criadas (tem %)', v_count;
  end if;

  select count(*) into v_count from public.financial_accounts where household_id = v_hh1;
  if v_count < 1 then
    raise exception 'conta principal não criada';
  end if;

  select coalesce(sum(balance_cents), 0) into v_bal
    from public.v_account_balances where household_id = v_hh1;
  if v_bal is null then
    raise exception 'v_account_balances não respondeu';
  end if;

  insert into t_results values ('estrutura do household', 'membership + 15 categorias + conta');
end;
$$;

select 'public_api' as bloco, check_name, detail from t_results;
commit;
