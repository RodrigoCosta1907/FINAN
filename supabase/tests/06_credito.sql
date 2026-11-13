-- ============================================================================
-- Teste do roteamento de fatura (0010): fechamento, virada de mês e ano.
-- Nubank: fecha dia 9, vence dia 16.
-- Cartão "fecha 28, vence 5" (vencimento no mês seguinte).
-- ============================================================================
begin;

insert into auth.users (id, email) values
  ('55555555-5555-5555-5555-555555555555', 'credito@teste.local')
on conflict (id) do nothing;

select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', true);
set local role authenticated;

create temp table t5_results (check_name text, detail text);

do $$
declare
  v_hh    uuid;
  v_card  uuid;
  v_card2 uuid;
  v_inv   record;
  v_result jsonb;
  v_cnt   integer;
  v_code  text := 'abc12345';
begin
  v_hh := public.fin_create_household('Casa Crédito', 'Rodrigo Crédito');

  insert into public.credit_cards (household_id, name, institution, last4, limit_cents, closing_day, due_day)
  values (v_hh, 'Nubank •8481', 'Nubank', '8481', 1000000, 9, 16)
  returning id into v_card;

  insert into public.credit_cards (household_id, name, institution, last4, limit_cents, closing_day, due_day)
  values (v_hh, 'Cartão 5033', 'Itau', '5033', 500000, 28, 5)
  returning id into v_card2;

  -- 05/11: antes do fechamento (dia 9) -> fatura de 16/11
  select * into v_inv from app.invoice_for_card(v_card, '2026-11-05');
  if v_inv.due_date <> '2026-11-16' or v_inv.closing_date <> '2026-11-09' then
    raise exception '05/11 deveria fechar 09/11 e vencer 16/11, veio % / %', v_inv.closing_date, v_inv.due_date;
  end if;

  -- 09/11 (o próprio dia do fechamento) ainda entra na fatura de 16/11
  select * into v_inv from app.invoice_for_card(v_card, '2026-11-09');
  if v_inv.due_date <> '2026-11-16' then
    raise exception '09/11 deveria vencer 16/11, veio %', v_inv.due_date;
  end if;

  -- 10/11: passou o fechamento -> 16/12
  select * into v_inv from app.invoice_for_card(v_card, '2026-11-10');
  if v_inv.due_date <> '2026-12-16' then
    raise exception '10/11 deveria vencer 16/12, veio %', v_inv.due_date;
  end if;

  -- 20/12: depois do fechamento de dezembro -> 16/01/2027 (vira o ano)
  select * into v_inv from app.invoice_for_card(v_card, '2026-12-20');
  if v_inv.due_date <> '2027-01-16' then
    raise exception '20/12 deveria vencer 16/01/2027, veio %', v_inv.due_date;
  end if;

  insert into t5_results values ('fechamento do Nubank', '05/11->16/11 · 10/11->16/12 · 20/12->16/01/27');

  -- cartão que fecha 28 e vence 5 do mês seguinte
  select * into v_inv from app.invoice_for_card(v_card2, '2026-11-10');
  if v_inv.closing_date <> '2026-11-28' or v_inv.due_date <> '2026-12-05' then
    raise exception 'cartão 28/5: esperava 28/11 -> 05/12, veio % / %', v_inv.closing_date, v_inv.due_date;
  end if;

  -- compra em 29/11 (depois do fechamento) -> 28/12 -> 05/01/2027
  select * into v_inv from app.invoice_for_card(v_card2, '2026-11-29');
  if v_inv.due_date <> '2027-01-05' then
    raise exception '29/11 deveria vencer 05/01/2027, veio %', v_inv.due_date;
  end if;

  insert into t5_results values ('vencimento no mês seguinte', '28/11->05/12 · 29/11->05/01/27');

  -- cobrança no cartão cria fatura, compra e parcela
  v_result := public.fin_add_card_charge(v_hh, v_card, 'Padaria', 2500, '2026-11-13', null, 'tg:1');
  if (v_result ->> 'due_date') <> '2026-12-16' then
    raise exception 'cobrança de 13/11 deveria cair em 16/12, veio %', v_result ->> 'due_date';
  end if;

  select count(*) into v_cnt from public.installments
   where purchase_id = (v_result ->> 'purchase_id')::uuid;
  if v_cnt <> 1 then
    raise exception 'esperava 1 parcela, veio %', v_cnt;
  end if;

  insert into t5_results values ('cobrança no cartão', '13/11 -> fatura 16/12');

  -- rascunho do bot: pergunta o cartão e resolve pelo final
  insert into public.telegram_drafts
    (code, household_id, telegram_user_id, chat_id, description, amount_cents, occurred_on, external_id)
  values
    (v_code, v_hh, 1178227260, 1178227260, 'Cantina', 12345, '2026-11-13', 'tg:2');

  v_result := public.fin_resolve_telegram_draft(v_code, '8481');
  if (v_result ->> 'due_date') <> '2026-12-16' then
    raise exception 'rascunho deveria cair em 16/12, veio %', v_result ->> 'due_date';
  end if;

  select count(*) into v_cnt from public.telegram_drafts where code = v_code and status = 'resolved';
  if v_cnt <> 1 then
    raise exception 'rascunho não foi marcado como resolvido';
  end if;

  insert into t5_results values ('rascunho do bot', 'resolve pelo final 8481 -> fatura 16/12');

  -- resolver de novo falha (não duplica)
  begin
    perform public.fin_resolve_telegram_draft(v_code, '8481');
    raise exception 'resolver duas vezes deveria falhar';
  exception
    when sqlstate 'P0002' then null;
  end;

  insert into t5_results values ('rascunho não duplica', 'segunda resolução rejeitada');
end;
$$;

select 'credito' as bloco, check_name, detail from t5_results;
rollback;
