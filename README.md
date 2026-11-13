# Finanças+

Aplicação de gestão financeira pessoal (PT-BR, BRL) construída sobre
**Next.js 16 + React 19 + TypeScript + Tailwind 4 + Supabase**.

O projeto está na **fase 1 (fundação)**: modelo de dados, segurança e motor de
cálculo prontos e testados em PostgreSQL real; interface do dashboard pronta com
dados de demonstração identificados. Os demais módulos estão mapeados e navegáveis.

## Estrutura

```
docs/                          arquitetura, modelo de dados, plano, prompt original
supabase/migrations/           schema (0001), segurança/RLS (0002), domínio (0003)
supabase/tests/                bootstrap do Supabase local + testes SQL
scripts/db-check.mjs           sobe Postgres descartável, aplica migrations, roda testes
src/app/(app)/                 shell autenticado + dashboard + páginas de módulo
src/components/                ui/, layout/, charts/, dashboard/
src/lib/                       money (centavos), demo-data, modules, utils
```

## Comandos

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # build de produção
npm run check        # typecheck + eslint
npm run test:db      # aplica as migrations num Postgres real e roda os testes SQL
npm run db:push      # aplica as migrations no banco do Supabase (lê SUPABASE_DB_URL)
```

`npm run test:db` usa `embedded-postgres` (PostgreSQL 18 local, descartável,
sem Docker) e valida de fato: rateio de centavos, saldo por conta,
transferência neutra, fatura de cartão, pagamento de fatura sem duplicar
despesa, divisão de despesas compartilhadas, acerto mínimo de contas, RLS com
dois usuários distintos.

## Variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha com as chaves do **projeto
Supabase novo** (não reutilize o projeto do CRM IPARTES). Segredos nunca vão
para o chat nem para o repositório.

## Regras financeiras implementadas no banco

- Dinheiro em centavos (`bigint`), zero ponto flutuante.
- Transferência entre contas próprias não é receita nem despesa.
- Compra no cartão entra na competência de cada parcela; pagar a fatura não cria
  despesa nova (só liquida o passivo e reduz o caixa).
- Rateio de parcelas e de despesas compartilhadas fecha no centavo.
- Reembolso não infla receita; acerto usa o menor número de transferências.
- RLS por espaço financeiro (`households`) com papéis owner/admin/member/viewer.
- Trilha de auditoria em `audit_logs` (append-only, gravada por trigger).
