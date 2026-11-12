-- ============================================================================
-- Finanças+ — 0002 — Segurança: helpers, RLS e triggers de manutenção
-- Modelo: households é o espaço financeiro; household_members define acesso.
--   owner/admin -> administra membros e configurações
--   member      -> lê e escreve dados financeiros
--   viewer      -> apenas leitura
-- ============================================================================

-- --------------------------------------------------------------- helpers ----
create or replace function app.is_member(p_household uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.household_members m
     where m.household_id = p_household
       and m.user_id = auth.uid()
  );
$$;

create or replace function app.role_in(p_household uuid)
returns membership_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.role
    from public.household_members m
   where m.household_id = p_household
     and m.user_id = auth.uid()
   limit 1;
$$;

create or replace function app.can_write(p_household uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.household_members m
     where m.household_id = p_household
       and m.user_id = auth.uid()
       and m.role in ('owner','admin','member')
  );
$$;

create or replace function app.is_admin(p_household uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.household_members m
     where m.household_id = p_household
       and m.user_id = auth.uid()
       and m.role in ('owner','admin')
  );
$$;

revoke all on function app.is_member(uuid)  from public;
revoke all on function app.role_in(uuid)    from public;
revoke all on function app.can_write(uuid)  from public;
revoke all on function app.is_admin(uuid)   from public;
grant usage on schema app to authenticated;
grant execute on function app.is_member(uuid), app.role_in(uuid),
                     app.can_write(uuid), app.is_admin(uuid) to authenticated;

-- ------------------------------------------------------- updated_at auto ----
create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_profiles_updated      before update on public.profiles                 for each row execute function app.set_updated_at();
create trigger trg_households_updated    before update on public.households               for each row execute function app.set_updated_at();
create trigger trg_people_updated        before update on public.people                   for each row execute function app.set_updated_at();
create trigger trg_accounts_updated      before update on public.financial_accounts       for each row execute function app.set_updated_at();
create trigger trg_categories_updated    before update on public.categories               for each row execute function app.set_updated_at();
create trigger trg_txn_updated           before update on public.account_transactions     for each row execute function app.set_updated_at();
create trigger trg_cards_updated         before update on public.credit_cards             for each row execute function app.set_updated_at();
create trigger trg_invoices_updated      before update on public.credit_card_invoices     for each row execute function app.set_updated_at();
create trigger trg_purchases_updated     before update on public.credit_card_purchases    for each row execute function app.set_updated_at();
create trigger trg_installments_updated  before update on public.installments             for each row execute function app.set_updated_at();
create trigger trg_bills_updated         before update on public.bills                    for each row execute function app.set_updated_at();
create trigger trg_receivables_updated   before update on public.receivables              for each row execute function app.set_updated_at();
create trigger trg_recurring_updated     before update on public.recurring_rules          for each row execute function app.set_updated_at();
create trigger trg_budgets_updated       before update on public.budgets                  for each row execute function app.set_updated_at();
create trigger trg_goals_updated         before update on public.financial_goals          for each row execute function app.set_updated_at();
create trigger trg_inv_assets_updated    before update on public.investment_assets        for each row execute function app.set_updated_at();
create trigger trg_assets_updated        before update on public.assets                   for each row execute function app.set_updated_at();
create trigger trg_liabilities_updated   before update on public.liabilities              for each row execute function app.set_updated_at();
create trigger trg_settings_updated      before update on public.user_settings            for each row execute function app.set_updated_at();
create trigger trg_import_updated        before update on public.import_batches           for each row execute function app.set_updated_at();

-- --------------------------------------------------------------- auditoria ----
-- Append-only: gravado por trigger SECURITY DEFINER; ninguém escreve direto.
create or replace function app.audit_row()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_household uuid;
  v_record    uuid;
  v_diff      jsonb;
begin
  if tg_op = 'DELETE' then
    v_household := (to_jsonb(old) ->> 'household_id')::uuid;
    v_record    := (to_jsonb(old) ->> 'id')::uuid;
    v_diff      := jsonb_build_object('before', to_jsonb(old));
  elsif tg_op = 'UPDATE' then
    v_household := (to_jsonb(new) ->> 'household_id')::uuid;
    v_record    := (to_jsonb(new) ->> 'id')::uuid;
    v_diff      := jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new));
  else
    v_household := (to_jsonb(new) ->> 'household_id')::uuid;
    v_record    := (to_jsonb(new) ->> 'id')::uuid;
    v_diff      := jsonb_build_object('after', to_jsonb(new));
  end if;

  insert into public.audit_logs (household_id, actor_id, table_name, record_id, action, diff)
  values (v_household, auth.uid(), tg_table_name, v_record,
          case tg_op when 'INSERT' then 'insert'::audit_action
                     when 'UPDATE' then 'update'::audit_action
                     else 'delete'::audit_action end,
          v_diff);
  return null;
end;
$$;

create trigger trg_audit_txn        after insert or update or delete on public.account_transactions  for each row execute function app.audit_row();
create trigger trg_audit_bills      after insert or update or delete on public.bills                 for each row execute function app.audit_row();
create trigger trg_audit_invoices   after insert or update or delete on public.credit_card_invoices  for each row execute function app.audit_row();
create trigger trg_audit_accounts   after insert or update or delete on public.financial_accounts    for each row execute function app.audit_row();
create trigger trg_audit_goals      after insert or update or delete on public.financial_goals       for each row execute function app.audit_row();
create trigger trg_audit_liability  after insert or update or delete on public.liabilities           for each row execute function app.audit_row();
create trigger trg_audit_budgets    after insert or update or delete on public.budgets               for each row execute function app.audit_row();

-- =========================================================== RLS: ativação ==
alter table public.profiles               enable row level security;
alter table public.households             enable row level security;
alter table public.household_members      enable row level security;
alter table public.people                 enable row level security;
alter table public.financial_accounts     enable row level security;
alter table public.categories             enable row level security;
alter table public.account_transactions   enable row level security;
alter table public.credit_cards           enable row level security;
alter table public.credit_card_invoices   enable row level security;
alter table public.credit_card_purchases  enable row level security;
alter table public.installments           enable row level security;
alter table public.bills                  enable row level security;
alter table public.bill_payments          enable row level security;
alter table public.receivables            enable row level security;
alter table public.receivable_payments    enable row level security;
alter table public.recurring_rules        enable row level security;
alter table public.recurring_occurrences  enable row level security;
alter table public.budgets                enable row level security;
alter table public.budget_categories      enable row level security;
alter table public.financial_goals        enable row level security;
alter table public.goal_contributions     enable row level security;
alter table public.investment_assets      enable row level security;
alter table public.investment_transactions enable row level security;
alter table public.investment_valuations  enable row level security;
alter table public.assets                 enable row level security;
alter table public.asset_valuations       enable row level security;
alter table public.liabilities            enable row level security;
alter table public.liability_payments     enable row level security;
alter table public.transaction_splits     enable row level security;
alter table public.reimbursements         enable row level security;
alter table public.notifications          enable row level security;
alter table public.user_settings          enable row level security;
alter table public.import_batches         enable row level security;
alter table public.import_rows            enable row level security;
alter table public.attachments            enable row level security;
alter table public.audit_logs             enable row level security;

-- ================================================== RLS: políticas padrão ==
-- Leitura: qualquer membro. Escrita: owner/admin/member.
create policy people_select on public.people for select to authenticated using (app.is_member(household_id));
create policy people_write  on public.people for all    to authenticated using (app.can_write(household_id)) with check (app.can_write(household_id));

create policy accounts_select on public.financial_accounts for select to authenticated using (app.is_member(household_id));
create policy accounts_write  on public.financial_accounts for all    to authenticated using (app.can_write(household_id)) with check (app.can_write(household_id));

create policy categories_select on public.categories for select to authenticated using (app.is_member(household_id));
create policy categories_write  on public.categories for all    to authenticated using (app.can_write(household_id)) with check (app.can_write(household_id));

create policy txn_select on public.account_transactions for select to authenticated using (app.is_member(household_id));
create policy txn_write  on public.account_transactions for all    to authenticated using (app.can_write(household_id)) with check (app.can_write(household_id));

create policy cards_select on public.credit_cards for select to authenticated using (app.is_member(household_id));
create policy cards_write  on public.credit_cards for all    to authenticated using (app.can_write(household_id)) with check (app.can_write(household_id));

create policy invoices_select on public.credit_card_invoices for select to authenticated using (app.is_member(household_id));
create policy invoices_write  on public.credit_card_invoices for all    to authenticated using (app.can_write(household_id)) with check (app.can_write(household_id));

create policy purchases_select on public.credit_card_purchases for select to authenticated using (app.is_member(household_id));
create policy purchases_write  on public.credit_card_purchases for all    to authenticated using (app.can_write(household_id)) with check (app.can_write(household_id));

create policy installments_select on public.installments for select to authenticated using (app.is_member(household_id));
create policy installments_write  on public.installments for all    to authenticated using (app.can_write(household_id)) with check (app.can_write(household_id));

create policy bills_select on public.bills for select to authenticated using (app.is_member(household_id));
create policy bills_write  on public.bills for all    to authenticated using (app.can_write(household_id)) with check (app.can_write(household_id));

create policy bill_payments_select on public.bill_payments for select to authenticated using (app.is_member(household_id));
create policy bill_payments_write  on public.bill_payments for all    to authenticated using (app.can_write(household_id)) with check (app.can_write(household_id));

create policy receivables_select on public.receivables for select to authenticated using (app.is_member(household_id));
create policy receivables_write  on public.receivables for all    to authenticated using (app.can_write(household_id)) with check (app.can_write(household_id));

create policy receivable_payments_select on public.receivable_payments for select to authenticated using (app.is_member(household_id));
create policy receivable_payments_write  on public.receivable_payments for all    to authenticated using (app.can_write(household_id)) with check (app.can_write(household_id));

create policy recurring_select on public.recurring_rules for select to authenticated using (app.is_member(household_id));
create policy recurring_write  on public.recurring_rules for all    to authenticated using (app.can_write(household_id)) with check (app.can_write(household_id));

create policy occurrences_select on public.recurring_occurrences for select to authenticated using (app.is_member(household_id));
create policy occurrences_write  on public.recurring_occurrences for all    to authenticated using (app.can_write(household_id)) with check (app.can_write(household_id));

create policy budgets_select on public.budgets for select to authenticated using (app.is_member(household_id));
create policy budgets_write  on public.budgets for all    to authenticated using (app.can_write(household_id)) with check (app.can_write(household_id));

create policy budget_categories_select on public.budget_categories for select to authenticated using (app.is_member(household_id));
create policy budget_categories_write  on public.budget_categories for all    to authenticated using (app.can_write(household_id)) with check (app.can_write(household_id));

create policy goals_select on public.financial_goals for select to authenticated using (app.is_member(household_id));
create policy goals_write  on public.financial_goals for all    to authenticated using (app.can_write(household_id)) with check (app.can_write(household_id));

create policy goal_contrib_select on public.goal_contributions for select to authenticated using (app.is_member(household_id));
create policy goal_contrib_write  on public.goal_contributions for all    to authenticated using (app.can_write(household_id)) with check (app.can_write(household_id));

create policy inv_assets_select on public.investment_assets for select to authenticated using (app.is_member(household_id));
create policy inv_assets_write  on public.investment_assets for all    to authenticated using (app.can_write(household_id)) with check (app.can_write(household_id));

create policy inv_txn_select on public.investment_transactions for select to authenticated using (app.is_member(household_id));
create policy inv_txn_write  on public.investment_transactions for all    to authenticated using (app.can_write(household_id)) with check (app.can_write(household_id));

create policy inv_val_select on public.investment_valuations for select to authenticated using (app.is_member(household_id));
create policy inv_val_write  on public.investment_valuations for all    to authenticated using (app.can_write(household_id)) with check (app.can_write(household_id));

create policy assets_select on public.assets for select to authenticated using (app.is_member(household_id));
create policy assets_write  on public.assets for all    to authenticated using (app.can_write(household_id)) with check (app.can_write(household_id));

create policy asset_val_select on public.asset_valuations for select to authenticated using (app.is_member(household_id));
create policy asset_val_write  on public.asset_valuations for all    to authenticated using (app.can_write(household_id)) with check (app.can_write(household_id));

create policy liabilities_select on public.liabilities for select to authenticated using (app.is_member(household_id));
create policy liabilities_write  on public.liabilities for all    to authenticated using (app.can_write(household_id)) with check (app.can_write(household_id));

create policy liability_pay_select on public.liability_payments for select to authenticated using (app.is_member(household_id));
create policy liability_pay_write  on public.liability_payments for all    to authenticated using (app.can_write(household_id)) with check (app.can_write(household_id));

create policy splits_select on public.transaction_splits for select to authenticated using (app.is_member(household_id));
create policy splits_write  on public.transaction_splits for all    to authenticated using (app.can_write(household_id)) with check (app.can_write(household_id));

create policy reimbursements_select on public.reimbursements for select to authenticated using (app.is_member(household_id));
create policy reimbursements_write  on public.reimbursements for all    to authenticated using (app.can_write(household_id)) with check (app.can_write(household_id));

create policy notifications_select on public.notifications for select to authenticated
  using (app.is_member(household_id) and (user_id is null or user_id = auth.uid()));
create policy notifications_write on public.notifications for update to authenticated
  using (app.is_member(household_id) and (user_id is null or user_id = auth.uid()))
  with check (app.is_member(household_id));

create policy import_batches_select on public.import_batches for select to authenticated using (app.is_member(household_id));
create policy import_batches_write  on public.import_batches for all    to authenticated using (app.can_write(household_id)) with check (app.can_write(household_id));

create policy import_rows_select on public.import_rows for select to authenticated using (app.is_member(household_id));
create policy import_rows_write  on public.import_rows for all    to authenticated using (app.can_write(household_id)) with check (app.can_write(household_id));

create policy attachments_select on public.attachments for select to authenticated using (app.is_member(household_id));
create policy attachments_write  on public.attachments for all    to authenticated using (app.can_write(household_id)) with check (app.can_write(household_id));

-- Auditoria: leitura para membros, escrita apenas pelo trigger (sem policy).
create policy audit_logs_select on public.audit_logs for select to authenticated using (app.is_member(household_id));

-- ================================================= RLS: tabelas especiais ==
create policy profiles_select on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_insert on public.profiles for insert to authenticated with check (id = auth.uid());

create policy settings_select on public.user_settings for select to authenticated using (user_id = auth.uid());
create policy settings_write  on public.user_settings for all    to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy households_select on public.households for select to authenticated using (app.is_member(id));
create policy households_update on public.households for update to authenticated
  using (app.is_admin(id)) with check (app.is_admin(id));

create policy members_select on public.household_members for select to authenticated
  using (user_id = auth.uid() or app.is_member(household_id));
create policy members_write on public.household_members for all to authenticated
  using (app.is_admin(household_id)) with check (app.is_admin(household_id));

-- Storage (bucket privado "attachments", caminho household_id/...)
-- A policy de storage é criada no painel/SQL do Supabase (schema storage);
-- mantida aqui como referência executável:
--   create policy "attachments_rw" on storage.objects for all to authenticated
--     using (bucket_id = 'attachments' and app.is_member((storage.foldername(name))[1]::uuid))
--     with check (bucket_id = 'attachments' and app.can_write((storage.foldername(name))[1]::uuid));
