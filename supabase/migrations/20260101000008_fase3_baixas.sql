-- ============================================================================
-- Finanças+ — 0008 — Fase 3 (compromissos): baixa de recebível e fechamento
-- de fatura. O resto da fase usa funções já existentes:
--   app.create_installment_purchase / app.pay_card_invoice / app.pay_bill /
--   app.materialize_recurring
-- ============================================================================

-- Receber de uma conta a receber: gera a receita e baixa o saldo devedor.
create or replace function app.receive_receivable(
  p_receivable  uuid,
  p_amount      bigint,
  p_received_on date default current_date,
  p_account     uuid default null,
  p_notes       text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rec  public.receivables;
  v_open bigint;
  v_txn  uuid;
begin
  select * into v_rec from public.receivables where id = p_receivable for update;
  if not found then
    raise exception 'conta a receber inexistente' using errcode = 'P0002';
  end if;
  if not app.can_write(v_rec.household_id) then
    raise exception 'sem permissão de escrita neste espaço' using errcode = '42501';
  end if;

  v_open := v_rec.amount_cents - v_rec.received_cents;
  if p_amount is null or p_amount <= 0 or p_amount > v_open then
    raise exception 'valor de recebimento inválido (em aberto: %)', v_open using errcode = '22023';
  end if;

  insert into public.account_transactions
    (household_id, kind, status, description, amount_cents, account_id, category_id,
     occurred_on, competence_date, paid_at, is_shared, notes, created_by)
  values
    (v_rec.household_id, 'income', 'posted', v_rec.description, p_amount,
     coalesce(p_account, v_rec.account_id), v_rec.category_id,
     p_received_on, p_received_on, p_received_on::timestamptz, false,
     coalesce(p_notes, 'recebimento de conta a receber'), auth.uid())
  returning id into v_txn;

  insert into public.receivable_payments
    (household_id, receivable_id, transaction_id, amount_cents, received_on, notes)
  values (v_rec.household_id, p_receivable, v_txn, p_amount, p_received_on, p_notes);

  update public.receivables
     set received_cents = received_cents + p_amount,
         received_at = case when received_cents + p_amount >= amount_cents then p_received_on::timestamptz else received_at end,
         status = case when received_cents + p_amount >= amount_cents then 'paid'::commitment_status
                       when received_cents + p_amount > 0 then 'partially_paid'::commitment_status
                       else status end
   where id = p_receivable;

  return v_txn;
end;
$$;

-- Fecha a fatura do cartão (a partir daí não recebe novas parcelas do ciclo).
create or replace function app.close_invoice(p_invoice uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inv public.credit_card_invoices;
begin
  select * into v_inv from public.credit_card_invoices where id = p_invoice for update;
  if not found then
    raise exception 'fatura inexistente' using errcode = 'P0002';
  end if;
  if not app.can_write(v_inv.household_id) then
    raise exception 'sem permissão de escrita neste espaço' using errcode = '42501';
  end if;
  if v_inv.status <> 'open' then
    return;
  end if;

  update public.credit_card_invoices
     set closed_at = now()
   where id = p_invoice;

  perform app.recalc_invoice(p_invoice);
end;
$$;

-- ------------------------------------------------------------- API pública ---
create or replace function public.fin_receive_receivable(
  p_receivable  uuid,
  p_amount      bigint,
  p_received_on date default current_date,
  p_account     uuid default null,
  p_notes       text default null
)
returns uuid
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app.receive_receivable(p_receivable, p_amount, p_received_on, p_account, p_notes);
$$;

create or replace function public.fin_close_invoice(p_invoice uuid)
returns void
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app.close_invoice(p_invoice);
$$;

grant execute on function public.fin_receive_receivable(uuid, bigint, date, uuid, text) to authenticated;
grant execute on function public.fin_close_invoice(uuid) to authenticated;
