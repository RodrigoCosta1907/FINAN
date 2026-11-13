# Deploy — Vercel + Supabase

Projeto Vercel: `finan-2ayz` (Settings em vercel.com/digocsd1907-1568s-projects/finan-2ayz)
Repositório: `github.com/RodrigoCosta1907/FINAN` → branch `main`
Supabase: `qthssfqztsqttqiwtjzz`

## 1. Variáveis de ambiente na Vercel (obrigatório)

Project → **Settings → Environment Variables**. Adicione as duas, marcando
**Production**, **Preview** e **Development**:

| Nome | Valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://qthssfqztsqttqiwtjzz.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | a chave *anon public* do painel Supabase |

> Os valores são os mesmos do `.env.local`. A `service_role` e a senha do banco
> **não** entram na Vercel: só scripts locais usam.

Sem essas variáveis o build passa, mas toda requisição responde 500 com a
mensagem `Variável de ambiente ausente: NEXT_PUBLIC_SUPABASE_URL`.

## 2. URLs de autenticação no Supabase

Authentication → **URL Configuration**:

- **Site URL**: `https://finan-2ayz.vercel.app`
- **Redirect URLs** (adicione as duas):
  - `https://finan-2ayz.vercel.app/auth/callback`
  - `http://localhost:3000/auth/callback`

Sem isso, os links de confirmação de e-mail e de redefinição de senha voltam
para o endereço errado.

## 3. Deploy

Com o repositório conectado, todo push em `main` dispara um deploy. Para o
primeiro deploy depois de configurar as variáveis: **Deployments → Redeploy**
(ou `git commit --allow-empty -m "chore: redeploy" && git push`).

O app não é estático: usa cookies/sessão, então todas as rotas autenticadas são
renderizadas no servidor (`ƒ Dynamic` no build).

## 4. Verificação depois do deploy

```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://finan-2ayz.vercel.app/
# esperado: 307 com Location para /entrar

curl -s -o /dev/null -w "%{http_code}\n" https://finan-2ayz.vercel.app/entrar
# esperado: 200
```

Se vier 500, o problema é variável de ambiente; se vier 404
`DEPLOYMENT_NOT_FOUND`, o deploy não chegou a ser promovido a produção.

## 5. Node

`package.json` fixa `engines.node >= 20.9` (exigência do Next 16). A Vercel usa a
maior versão compatível disponível.
