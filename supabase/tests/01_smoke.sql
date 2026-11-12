-- ============================================================================
-- Teste de fumaça do domínio (roda em PostgreSQL real via scripts/db-check.mjs)
-- Cobre: rateio exato, saldo, transferência, fatura, pagamento de fatura sem
-- duplicar despesa, despesa compartilhada, acerto entre pessoas, RLS.
-- Qualquer divergência levanta exceção e derruba o teste.
-- ============================================================================
begin;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'rodrigo@teste.local'),
  ('22222222-2222-2222-2222-222222222222', 'parceira@teste.local')
on conflict (id) do nothing;

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;

create temp table t_results (check_name text, detail text);

do $$
declare
  v_hh        uuid;
  v_acc1      uuid;
  v_acc2      uuid;
  v_cat_mor   uuid;
  v_cat_ali   uuid;
  v_cat_sal   uuid;
  v_pa        uuid;
  v_pb        uuid;
  v_card      uuid;
  v_purchase  uuid;
  v_inv_dec   uuid;
  v_amounts   bigint[];
  v_sum       bigint;
  v_cnt       integer;
  v_bal1      bigint;
  v_bal2      bigint;
  v_dash      jsonb;
  v_health    jsonb;
  v_used      bigint;
  v_open_inv  bigint;
  v_rows      integer;
begin
  -- ---------------------------------------------------------------- rateio --
  v_amounts := app.split_cents(100, 3);
  if v_amounts <> array[34, 33, 33]::bigint[] then
    raise exception 'split_cents(100,3) = % (esperado {34,33,33})', v_amounts;
  end if;
  v_amounts := app.split_cents(360000, 12);
  select sum(x) into v_sum from unnest(v_amounts) x;
  if v_sum <> 360000 then
    raise exception 'soma das 12 parcelas = % (esperado 360000)', v_sum;
  end if;
  insert into t_results values ('rateio de centavos', 'ok (100/3 e 360000/12 exatos)');

  -- ------------------------------------------------------------- household --
  v_hh := app.create_household('Casa Teste', 'Rodrigo');
  if v_hh is null then raise exception 'household não criado'; end if;

  select id into v_acc1 from public.financial_accounts
   where household_id = v_hh order by created_at limit 1;
  update public.financial_accounts set opening_balance_cents = 100000 where id = v_acc1;

  insert into public.financial_accounts (household_id, name, type)
  values (v_hh, 'Poupança', 'savings') returning id into v_acc2;

  select id into v_pa from public.people
   where household_id = v_hh and user_id = auth.uid();
  insert into public.people (household_id, name)
  values (v_hh, 'Parceira') returning id into v_pb;

  select id into v_cat_mor from public.categories
   where household_id = v_hh and name = 'Moradia' and parent_id is null;
  select id into v_cat_ali from public.categories
   where household_id = v_hh and name = 'Alimentação' and parent_id is null;
  select id into v_cat_sal from public.categories
   where household_id = v_hh and name = 'Salário' and parent_id is null;

  if v_cat_mor is null or v_cat_ali is null or v_cat_sal is null then
    raise exception 'categorias padrão não foram criadas';
  end if;
  insert into t_results values ('household + categorias + pessoas', 'ok');

  -- ------------------------------------------------- receita e despesa ------
  perform app.create_transaction(v_hh, 'income', 'Salário', 500000, '2026-11-01',
                                 v_acc1, v_cat_sal, null, v_pa, 'pix');

  perform app.create_transaction(
    v_hh, 'expense', 'Aluguel', 180000, '2026-11-05', v_acc1, v_cat_mor, null,
    v_pa, 'pix',
    jsonb_build_array(
      jsonb_build_object('person_id', v_pa, 'share_cents', 90000),
      jsonb_build_object('person_id', v_pb, 'share_cents', 90000)
    ), true);

  select balance_cents into v_bal1 from public.v_account_balances where account_id = v_acc1;
  if v_bal1 <> 420000 then
    raise exception 'saldo após receita/despesa = % (esperado 420000)', v_bal1;
  end if;
  insert into t_results values ('saldo da conta (1000 + 5000 - 1800)', v_bal1::text);

  -- divisão 900/900 exata
  select coalesce(sum(share_cents), 0), count(*) into v_sum, v_cnt
    from public.transaction_splits s
    join public.account_transactions t on t.id = s.transaction_id
   where s.household_id = v_hh and t.description = 'Aluguel';
  if v_sum <> 180000 or v_cnt <> 2 then
    raise exception 'divisão do aluguel: soma=% partes=%', v_sum, v_cnt;
  end if;
  insert into t_results values ('divisão compartilhada (2 x 900)', v_sum::text);

  -- saldo entre pessoas
  select net_cents into v_sum from app.person_balances(v_hh) where person_id = v_pa;
  if v_sum <> 90000 then
    raise exception 'saldo de A = % (esperado +90000)', v_sum;
  end if;
  select net_cents into v_bal1 from app.person_balances(v_hh) where person_id = v_pb;
  if v_bal1 <> -90000 then
    raise exception 'saldo de B = % (esperado -90000)', v_bal1;
  end if;
  insert into t_results values ('quem deve a quem', 'A +900 / B -900');

  select count(*), coalesce(sum(amount_cents), 0) into v_rows, v_sum
    from app.simplify_debts(v_hh);
  if v_rows <> 1 or v_sum <> 90000 then
    raise exception 'simplify_debts: linhas=% valor=%', v_rows, v_sum;
  end if;
  insert into t_results values ('acerto mínimo', '1 transferência de 900');

  -- ------------------------------------------------------------ transferência
  perform app.create_transfer(v_hh, v_acc1, v_acc2, 50000, '2026-11-10');
  select balance_cents into v_bal1 from public.v_account_balances where account_id = v_acc1;
  select balance_cents into v_bal2 from public.v_account_balances where account_id = v_acc2;
  if v_bal1 <> 370000 or v_bal2 <> 50000 then
    raise exception 'após transferência: acc1=% acc2=% (esperado 370000/50000)', v_bal1, v_bal2;
  end if;
  select count(*) into v_cnt from public.account_transactions
   where household_id = v_hh and kind = 'transfer';
  if v_cnt <> 1 then
    raise exception 'transferência deveria gerar 1 lançamento, gerou %', v_cnt;
  end if;
  insert into t_results values ('transferência neutra', '3700 / 500, total preservado');

  -- ---------------------------------------------------------------- cartão --
  insert into public.credit_cards
    (household_id, name, institution, brand, last4, limit_cents, closing_day, due_day,
     payment_account_id, holder_person_id)
  values (v_hh, 'Cartão Teste', 'Banco', 'visa', '1234', 600000, 20, 28, v_acc1, v_pa)
  returning id into v_card;

  v_purchase := app.create_installment_purchase(
    v_hh, v_card, 'Compra parcelada', 360000, 12, '2026-11-05', '2026-12-05',
    v_cat_ali, v_pa, false, 'Loja', null);

  select count(*), coalesce(sum(amount_cents), 0) into v_cnt, v_sum
    from public.installments where purchase_id = v_purchase;
  if v_cnt <> 12 or v_sum <> 360000 then
    raise exception 'parcelas: count=% soma=%', v_cnt, v_sum;
  end if;

  select id into v_inv_dec
    from public.credit_card_invoices
   where household_id = v_hh and card_id = v_card
     and period_year = 2026 and period_month = 12;

  select total_cents into v_sum from public.credit_card_invoices where id = v_inv_dec;
  if v_sum <> 30000 then
    raise exception 'fatura dez/2026 = % (esperado 30000)', v_sum;
  end if;

  select used_cents into v_used from public.v_card_usage where card_id = v_card;
  if v_used <> 360000 then
    raise exception 'limite usado = % (esperado 360000)', v_used;
  end if;
  insert into t_results values ('compra 12x + fatura', '12 x 300, fatura dez = 300');

  -- ------------------------------------------- pagamento de fatura sem duplicar
  select balance_cents into v_bal1 from public.v_account_balances where account_id = v_acc1;

  perform app.pay_card_invoice(v_inv_dec, v_acc1, 30000, '2026-12-05', 'pagamento teste');

  select balance_cents into v_bal2 from public.v_account_balances where account_id = v_acc1;
  if v_bal2 <> v_bal1 - 30000 then
    raise exception 'pagamento da fatura não reduziu o saldo corretamente (% -> %)', v_bal1, v_bal2;
  end if;

  select count(*) into v_cnt from public.credit_card_invoices
   where id = v_inv_dec and status = 'paid';
  if v_cnt <> 1 then
    raise exception 'fatura não foi marcada como paga';
  end if;

  -- despesa de competência de dezembro = apenas a parcela (300), nunca 600
  v_dash := app.dashboard_summary(v_hh, 2026, 12, 'competence');
  if (v_dash ->> 'expense_cents')::bigint <> 30000 then
    raise exception 'despesa competência dez = % (esperado 30000; duplicou?)', v_dash ->> 'expense_cents';
  end if;

  -- despesa de caixa de dezembro = pagamento da fatura (300)
  v_dash := app.dashboard_summary(v_hh, 2026, 12, 'cash');
  if (v_dash ->> 'expense_cents')::bigint <> 30000 then
    raise exception 'despesa caixa dez = % (esperado 30000)', v_dash ->> 'expense_cents';
  end if;

  select used_cents into v_used from public.v_card_usage where card_id = v_card;
  if v_used <> 330000 then
    raise exception 'limite usado após pagamento = % (esperado 330000)', v_used;
  end if;
  insert into t_results values ('fatura paga', 'saldo -300, despesa não duplicou, limite liberado');
  raise notice 'checkpoint';

  -- -------------------------------------------------------------- dashboard --
  v_dash := app.dashboard_summary(v_hh, 2026, 11, 'cash');
  if (v_dash ->> 'income_cents')::bigint <> 500000 then
    raise exception 'receita nov = %', v_dash ->> 'income_cents';
  end if;
  if (v_dash ->> 'expense_cents')::bigint <> 180000 then
    raise exception 'despesa nov = %', v_dash ->> 'expense_cents';
  end if;
  if (v_dash ->> 'result_cents')::bigint <> 320000 then
    raise exception 'resultado nov = %', v_dash ->> 'result_cents';
  end if;
  insert into t_results values ('dashboard nov/2026', 'receita 5000 / despesa 1800 / resultado 3200');

  -- ---------------------------------------------------------------- saúde ---
  v_health := app.health_score(v_hh, 2026, 11);
  if (v_health ->> 'score')::numeric < 0 or (v_health ->> 'score')::numeric > 100 then
    raise exception 'health score fora de 0..100: %', v_health ->> 'score';
  end if;
  insert into t_results values ('health score', v_health ->> 'score');

  -- ------------------------------------------------------------ projeção ----
  select count(*) into v_cnt from app.project_cashflow(v_hh, 30);
  if v_cnt <> 30 then
    raise exception 'project_cashflow devolveu % linhas (esperado 30)', v_cnt;
  end if;
  insert into t_results values ('projeção de caixa', v_cnt || ' dias');

  -- ------------------------------------------------------ patrimônio líquido
  select net_worth_cents into v_bal1 from public.v_net_worth where household_id = v_hh;
  -- ativos: 340000 (conta1) + 50000 (conta2) = 390000
  -- passivos: fatura em aberto 330000
  if v_bal1 <> 60000 then
    raise exception 'patrimônio líquido = % (esperado 60000)', v_bal1;
  end if;
  insert into t_results values ('patrimônio líquido', v_bal1::text);
end;
$$;

commit;

-- ---------------------------------------------------------------------------
-- RLS: segundo usuário não enxerga nada do household do primeiro
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
set local role authenticated;
create temp table t_rls as
select (select count(*) from public.households)            as households,
       (select count(*) from public.account_transactions)  as transacoes,
       (select count(*) from public.financial_accounts)    as contas;
commit;

begin;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;
create temp table t_rls_owner as
select (select count(*) from public.households)            as households,
       (select count(*) from public.account_transactions)  as transacoes,
       (select count(*) from public.financial_accounts)    as contas;
commit;

select 'checks' as bloco, check_name, detail from t_results
union all
select 'rls', 'usuário sem vínculo', format('households=%s transacoes=%s contas=%s',
       (select households from t_rls), (select transacoes from t_rls), (select contas from t_rls))
union all
select 'rls', 'dono do espaço', format('households=%s transacoes=%s contas=%s',
       (select households from t_rls_owner), (select transacoes from t_rls_owner), (select contas from t_rls_owner));
