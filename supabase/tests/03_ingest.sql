-- Testa a captura externa (Telegram): idempotência e criação real.
begin;

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;

create temp table t_ingest as select household_id from public.household_members limit 1;

reset role;

do $$
declare
  v_hh    uuid;
  v_first uuid;
  v_again uuid;
  v_count integer;
  v_sum   bigint;
begin
  select household_id into v_hh from t_ingest limit 1;

  v_first := public.fin_ingest_transaction(v_hh, 'expense', 'Casa de bolos', 2500, current_date, 'Alimentação', 'tg:teste:1', null, 'telegram');
  if v_first is null then raise exception 'não criou o lançamento'; end if;

  -- mesma mensagem entregue de novo (Telegram reenvia)
  v_again := public.fin_ingest_transaction(v_hh, 'expense', 'Casa de bolos', 2500, current_date, 'Alimentação', 'tg:teste:1', null, 'telegram');
  if v_again <> v_first then
    raise exception 'external_id repetido criou outro lançamento (% <> %)', v_first, v_again;
  end if;

  select count(*) into v_count from public.account_transactions where external_id = 'tg:teste:1';
  if v_count <> 1 then
    raise exception 'esperava 1 linha para o external_id, achei %', v_count;
  end if;

  select coalesce(sum(amount_cents), 0) into v_sum
    from public.account_transactions where external_id = 'tg:teste:1';
  if v_sum <> 2500 then
    raise exception 'valor gravado errado: %', v_sum;
  end if;

  insert into t_results values ('captura via telegram', 'idempotente, 1 lançamento de 2500');
end;
$$;

select 'ingest' as bloco, check_name, detail from t_results;
commit;
