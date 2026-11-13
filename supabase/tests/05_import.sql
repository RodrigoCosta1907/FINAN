-- ============================================================================
-- Teste da importação de fatura (0009): cartão por final, fatura por ciclo,
-- idempotência por fingerprint e soma correta.
-- ============================================================================
begin;

insert into auth.users (id, email) values
  ('44444444-4444-4444-4444-444444444444', 'importa@teste.local')
on conflict (id) do nothing;

select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
set local role authenticated;

create temp table t4_results (check_name text, detail text);

do $$
declare
  v_hh      uuid;
  v_rows    jsonb;
  v_result  jsonb;
  v_result2 jsonb;
  v_total   bigint;
  v_n       integer;
  v_cards   integer;
  v_inv     uuid;
begin
  v_hh := public.fin_create_household('Casa Import', 'Rodrigo Import');

  -- três linhas, dois finais de cartão diferentes
  v_rows := '[
    {"fingerprint":"fp1","card_end":"8481","date":"2026-10-09","description":"KINGHOST","amount_cents":1528,"installment_number":8,"installment_total":11},
    {"fingerprint":"fp2","card_end":"5871","date":"2026-10-09","description":"BOOKING","amount_cents":79068,"installment_number":2,"installment_total":10},
    {"fingerprint":"fp3","card_end":"4809","date":"2026-11-02","description":"GOOGLE ONE","amount_cents":450,"installment_number":null,"installment_total":null}
  ]'::jsonb;

  v_result := public.fin_import_invoice_rows(v_hh, 'nubank', '2026-11-16', v_rows);

  if (v_result ->> 'inserted')::int <> 3 then
    raise exception 'esperava 3 linhas importadas, veio %', v_result ->> 'inserted';
  end if;
  if (v_result ->> 'total_cents')::bigint <> 81046 then
    raise exception 'total importado errado: %', v_result ->> 'total_cents';
  end if;
  if (v_result ->> 'created_cards')::int <> 3 then
    raise exception 'esperava 3 cartões (um por final), veio %', v_result ->> 'created_cards';
  end if;

  select count(*) into v_cards from public.credit_cards where household_id = v_hh;
  if v_cards <> 3 then
    raise exception 'cartões no banco: %', v_cards;
  end if;

  insert into t4_results values ('importa 3 linhas em 3 cartões', (v_result ->> 'total_cents') || ' centavos');

  -- reimportar o mesmo arquivo: nada duplica
  v_result2 := public.fin_import_invoice_rows(v_hh, 'nubank', '2026-11-16', v_rows);
  if (v_result2 ->> 'inserted')::int <> 0 or (v_result2 ->> 'skipped')::int <> 3 then
    raise exception 'reimportação deveria pular tudo: %', v_result2;
  end if;

  select count(*) into v_n from public.credit_card_purchases where household_id = v_hh;
  if v_n <> 3 then
    raise exception 'compras duplicadas: %', v_n;
  end if;

  insert into t4_results values ('reimportação idempotente', 'inserted=0 skipped=3');

  -- a fatura do ciclo soma o que foi importado
  select id into v_inv from public.credit_card_invoices
   where household_id = v_hh and period_year = 2026 and period_month = 11
   order by due_date limit 1;

  select total_cents into v_total from public.credit_card_invoices where id = v_inv;
  if v_total <= 0 then
    raise exception 'fatura sem total após importação: %', v_total;
  end if;

  select count(*) into v_n from public.installments where invoice_id = v_inv;
  if v_n <> 1 then
    raise exception 'a fatura de 11/2026 deveria ter 1 parcela, tem %', v_n;
  end if;

  insert into t4_results values ('fatura do ciclo', 'parcela alocada e total recalculado');

  -- parcela 8/11 fica registrada no histórico
  select count(*) into v_n from public.credit_card_purchases
   where household_id = v_hh and notes like '%parcela 8/11%';
  if v_n <> 1 then
    raise exception 'a parcela 8/11 não foi registrada';
  end if;

  insert into t4_results values ('parcela de origem', 'nota "parcela 8/11"');
end;
$$;

select 'import' as bloco, check_name, detail from t4_results;
rollback;
