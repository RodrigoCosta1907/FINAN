-- ============================================================================
-- Teste da fase 3 (compromissos): contas a pagar (parcial + total),
-- contas a receber, compra parcelada e fechamento de fatura.
-- ============================================================================
begin;

insert into auth.users (id, email) values
  ('33333333-3333-3333-3333-333333333333', 'fase3@teste.local')
on conflict (id) do nothing;

select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
set local role authenticated;

create temp table t3_results (check_name text, detail text);

do $$
declare
  v_hh       uuid;
  v_acc      uuid;
  v_cat      uuid;
  v_bill     uuid;
  v_recv     uuid;
  v_card     uuid;
  v_purchase uuid;
  v_inv      uuid;
  v_status   text;
  v_paid     bigint;
  v_bal      bigint;
  v_cnt      integer;
begin
  v_hh := public.fin_create_household('Casa Fase 3', 'Rodrigo Teste');

  select id into v_acc from public.financial_accounts where household_id = v_hh order by created_at limit 1;
  select id into v_cat from public.categories where household_id = v_hh and kind <> 'income' order by sort_order limit 1;

  -- ------------------------------------------------- conta a pagar (parcial) --
  insert into public.bills (household_id, description, amount_cents, due_date, competence_date, category_id, status)
  values (v_hh, 'Aluguel', 180000, current_date, current_date, v_cat, 'pending')
  returning id into v_bill;

  perform public.fin_pay_bill(v_bill, 80000, current_date, v_acc, 'parcial');

  select status, paid_cents into v_status, v_paid from public.bills where id = v_bill;
  if v_status <> 'partially_paid' or v_paid <> 80000 then
    raise exception 'pagamento parcial errado: % / %', v_status, v_paid;
  end if;

  select balance_cents into v_bal from public.v_account_balances where account_id = v_acc;
  if v_bal <> -80000 then
    raise exception 'saldo após pagamento parcial deveria ser -80000, veio %', v_bal;
  end if;

  perform public.fin_pay_bill(v_bill, 100000, current_date, v_acc, 'resto');

  select status, paid_cents into v_status, v_paid from public.bills where id = v_bill;
  if v_status <> 'paid' or v_paid <> 180000 then
    raise exception 'quitação errada: % / %', v_status, v_paid;
  end if;

  select count(*) into v_cnt from public.account_transactions
   where household_id = v_hh and description = 'Aluguel';
  if v_cnt <> 2 then
    raise exception 'esperava 2 lançamentos do aluguel, veio %', v_cnt;
  end if;

  select balance_cents into v_bal from public.v_account_balances where account_id = v_acc;
  if v_bal <> -180000 then
    raise exception 'saldo final deveria ser -180000, veio %', v_bal;
  end if;

  insert into t3_results values ('conta a pagar (parcial + quitação)', '1800,00 em 2 lançamentos');

  -- ---------------------------------------------- pagamento acima do saldo --
  insert into public.bills (household_id, description, amount_cents, due_date, competence_date, status)
  values (v_hh, 'Internet', 12000, current_date, current_date, 'pending')
  returning id into v_bill;

  begin
    perform public.fin_pay_bill(v_bill, 13000, current_date, v_acc, 'excesso');
    raise exception 'pagamento acima do saldo deveria falhar';
  exception
    when sqlstate '22023' then null;
  end;

  insert into t3_results values ('pagamento acima do saldo', 'rejeitado');

  -- ------------------------------------------------------- conta a receber --
  insert into public.receivables (household_id, description, amount_cents, expected_date, status)
  values (v_hh, 'Empréstimo João', 50000, current_date + 10, 'pending')
  returning id into v_recv;

  perform public.fin_receive_receivable(v_recv, 20000, current_date, v_acc, 'parcial');

  select status, received_cents into v_status, v_paid from public.receivables where id = v_recv;
  if v_status <> 'partially_paid' or v_paid <> 20000 then
    raise exception 'recebimento parcial errado: % / %', v_status, v_paid;
  end if;

  select balance_cents into v_bal from public.v_account_balances where account_id = v_acc;
  if v_bal <> -160000 then
    raise exception 'saldo após receber deveria ser -160000, veio %', v_bal;
  end if;

  begin
    perform public.fin_receive_receivable(v_recv, 40000, current_date, v_acc, 'excesso');
    raise exception 'receber acima do saldo deveria falhar';
  exception
    when sqlstate '22023' then null;
  end;

  insert into t3_results values ('conta a receber', 'parcial 200 + rejeita excesso');

  -- --------------------------------------------------------------- cartão --
  insert into public.credit_cards (household_id, name, limit_cents, closing_day, due_day, payment_account_id)
  values (v_hh, 'Cartão Teste', 300000, 20, 28, v_acc)
  returning id into v_card;

  v_purchase := public.fin_create_installment_purchase(
    v_hh, v_card, 'Notebook', 360000, 12, current_date, current_date, v_cat, null, false, 'Loja', null
  );

  select count(*) into v_cnt from public.installments where purchase_id = v_purchase;
  if v_cnt <> 12 then
    raise exception 'esperava 12 parcelas, veio %', v_cnt;
  end if;

  select sum(amount_cents) into v_paid from public.installments where purchase_id = v_purchase;
  if v_paid <> 360000 then
    raise exception 'soma das parcelas deveria ser 360000, veio %', v_paid;
  end if;

  select id into v_inv from public.credit_card_invoices
   where card_id = v_card and status = 'open' order by due_date limit 1;

  perform public.fin_close_invoice(v_inv);

  select status into v_status from public.credit_card_invoices where id = v_inv;
  if v_status <> 'closed' then
    raise exception 'fatura deveria estar fechada, está %', v_status;
  end if;

  insert into t3_results values ('compra parcelada + fechamento', '12x de 300, fatura fechada');

  -- ------------------------------------------- limite reflete as parcelas --
  select used_cents into v_bal from public.v_card_usage where card_id = v_card;
  if v_bal <> 360000 then
    raise exception 'limite usado deveria ser 360000, veio %', v_bal;
  end if;

  insert into t3_results values ('limite do cartão', '3600,00 comprometidos');
end;
$$;

select 'compromissos' as bloco, check_name, detail from t3_results;
rollback;
