import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseMessage, formatEntry } from "@/lib/ingest/parse";
import { formatBRL } from "@/lib/money";
import { supabaseUrl } from "@/lib/env";

const HELP = [
  "<b>Como lançar</b>",
  "Uma linha por compra — valor no começo ou no fim:",
  "• <code>25 casa de bolos</code>",
  "• <code>atacadão 69,28</code>",
  "• <code>238,37 cantina 11/11</code>",
  "• <code>-12,50 café ontem</code>",
  "• <code>+1500 salário</code> (receita)",
  "",
  "Comandos: /saldo · /ajuda",
].join("\n");

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function reply(chatId: number | string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error("[telegram] TELEGRAM_BOT_TOKEN ausente — não consegui responder");
    return;
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    console.error("[telegram] sendMessage falhou:", res.status, await res.text().catch(() => ""));
  }
}

function adminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY ausente");
  return createClient(supabaseUrl(), serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function todayInSaoPaulo() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  if (!process.env.TELEGRAM_WEBHOOK_SECRET || secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const update = (await request.json().catch(() => null)) as {
    update_id?: number;
    message?: { text?: string; chat?: { id?: number }; from?: { id?: number } };
  } | null;

  const message = update?.message;
  const text = message?.text?.trim();
  const chatId = message?.chat?.id;
  const fromId = message?.from?.id;

  // Sempre 200 para o Telegram não reenviar em loop.
  if (!update?.update_id || !text || chatId == null || fromId == null) {
    return NextResponse.json({ ok: true, skipped: "sem texto" });
  }

  const ownerId = process.env.TELEGRAM_OWNER_ID;
  if (!ownerId || String(fromId) !== ownerId) {
    await reply(chatId, "⛔ Este bot é privado.");
    return NextResponse.json({ ok: true, skipped: "não autorizado" });
  }

  const supabase = adminClient();

  // idempotência do webhook (Telegram pode reenviar o mesmo update)
  const { error: dupError } = await supabase
    .from("telegram_updates")
    .insert({ update_id: update.update_id });
  if (dupError?.code === "23505") {
    return NextResponse.json({ ok: true, skipped: "update repetido" });
  }

  if (text === "/start" || text === "/ajuda" || text === "/help") {
    await reply(chatId, HELP);
    return NextResponse.json({ ok: true });
  }

  const { data: link } = await supabase
    .from("telegram_links")
    .select("household_id, person_id")
    .eq("telegram_user_id", Number(ownerId))
    .maybeSingle();

  if (!link) {
    await reply(
      chatId,
      "Conta não vinculada. Peça para o administrador rodar o vínculo do Telegram no banco.",
    );
    return NextResponse.json({ ok: true, skipped: "sem vínculo" });
  }

  if (text === "/saldo") {
    const today = todayInSaoPaulo();
    const { data: rows } = await supabase
      .from("account_transactions")
      .select("kind, amount_cents")
      .eq("household_id", link.household_id)
      .eq("status", "posted")
      .gte("competence_date", `${today.slice(0, 7)}-01`);

    const income = (rows ?? []).filter((r) => r.kind === "income").reduce((a, r) => a + Number(r.amount_cents), 0);
    const expense = (rows ?? []).filter((r) => r.kind === "expense").reduce((a, r) => a + Number(r.amount_cents), 0);

    await reply(
      chatId,
      `<b>Mês atual</b>\nReceitas: ${formatBRL(income)}\nDespesas: ${formatBRL(expense)}\nResultado: ${formatBRL(income - expense)}`,
    );
    return NextResponse.json({ ok: true });
  }

  const today = todayInSaoPaulo();
  const { entries, failures } = parseMessage(text, today);

  if (!entries.length) {
    await reply(
      chatId,
      `Não entendi nenhuma linha. Exemplos:\n<code>25 casa de bolos</code>\n<code>atacadão 69,28</code>\n\n${HELP}`,
    );
    return NextResponse.json({ ok: true, skipped: "nada parseado" });
  }

  const ok: string[] = [];
  const erros: string[] = [];

  for (const [index, entry] of entries.entries()) {
    const externalId = `tg:${update.update_id}:${index}`;
    const { data, error } = await supabase.rpc("fin_ingest_transaction", {
      p_household: link.household_id,
      p_kind: entry.kind,
      p_description: entry.description,
      p_amount: entry.amountCents,
      p_date: entry.date,
      p_category: entry.categoryHint,
      p_external_id: externalId,
      p_person: link.person_id,
      p_source: "telegram",
    });

    if (error) {
      erros.push(`✖ ${escapeHtml(entry.description)}: ${escapeHtml(error.message)}`);
    } else if (data) {
      ok.push(`✅ ${escapeHtml(formatEntry(entry, formatBRL))}`);
    }
  }

  for (const failure of failures) {
    erros.push(`⚠️ "${escapeHtml(failure.raw)}" — ${escapeHtml(failure.error)}`);
  }

  const body = [...ok, ...erros].join("\n");
  await reply(chatId, body || "Nada para lançar.");

  return NextResponse.json({ ok: true, created: ok.length, failed: erros.length });
}
