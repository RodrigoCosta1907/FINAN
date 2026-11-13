import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseMessage, formatEntry } from "@/lib/ingest/parse";
import { detectPayment } from "@/lib/ingest/payment";
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
  "<b>No cartão de crédito</b> — o bot pergunta o cartão:",
  "• <code>25 padaria credito</code>",
  "• <code>25 padaria credito nubank</code>",
  "• <code>25 padaria credito 8481</code>",
  "",
  "Comandos: /saldo · /cartoes · /ajuda",
].join("\n");

type Keyboard = { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> };
type Card = { id: string; name: string; last4: string | null; institution: string | null };

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const token = () => process.env.TELEGRAM_BOT_TOKEN;

async function sendMessage(chatId: number | string, text: string, keyboard?: Keyboard) {
  const botToken = token();
  if (!botToken) {
    console.error("[telegram] TELEGRAM_BOT_TOKEN ausente");
    return null;
  }
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...(keyboard ? { reply_markup: keyboard } : {}),
    }),
  });
  if (!res.ok) console.error("[telegram] sendMessage falhou:", res.status);
  return (await res.json().catch(() => null)) as { result?: { message_id?: number } } | null;
}

async function editMessage(chatId: number, messageId: number, text: string, keyboard?: Keyboard) {
  const botToken = token();
  if (!botToken) return;
  await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: keyboard ?? { inline_keyboard: [] },
    }),
  }).catch(() => null);
}

async function answerCallback(id: string, text?: string) {
  const botToken = token();
  if (!botToken) return;
  await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ callback_query_id: id, ...(text ? { text } : {}) }),
  }).catch(() => null);
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

const brDate = (iso: string) => iso.split("-").reverse().join("/");

const slug = (value: string | null) =>
  (value ?? "outros")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 12) || "outros";

const bankLabel = (card: Card) => card.institution ?? card.name;
const code = () => Math.random().toString(36).slice(2, 10);

function buildBankKeyboard(cards: Card[], draftCode: string, withCancel = true): Keyboard {
  const banks = new Map<string, string>();
  for (const card of cards) {
    const key = slug(bankLabel(card));
    if (!banks.has(key)) banks.set(key, bankLabel(card));
  }

  const entries = [...banks.entries()];
  const rows: Array<Array<{ text: string; callback_data: string }>> = [];
  for (let index = 0; index < entries.length; index += 2) {
    rows.push(
      entries.slice(index, index + 2).map(([key, label]) => ({
        text: label.toUpperCase(),
        callback_data: `b|${draftCode}|${key}`,
      })),
    );
  }
  if (withCancel) rows.push([{ text: "✖ cancelar", callback_data: `x|${draftCode}|-` }]);
  return { inline_keyboard: rows };
}

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  if (!process.env.TELEGRAM_WEBHOOK_SECRET || secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const update = (await request.json().catch(() => null)) as {
    update_id?: number;
    message?: { text?: string; chat?: { id?: number }; from?: { id?: number } };
    callback_query?: {
      id: string;
      from?: { id?: number };
      data?: string;
      message?: { message_id?: number; chat?: { id?: number } };
    };
  } | null;

  if (!update?.update_id) return NextResponse.json({ ok: true, skipped: "sem update" });

  const ownerId = process.env.TELEGRAM_OWNER_ID;
  const supabase = adminClient();

  // idempotência (o Telegram reenvia se não receber 200 a tempo)
  const { error: dupError } = await supabase.from("telegram_updates").insert({ update_id: update.update_id });
  if (dupError?.code === "23505") return NextResponse.json({ ok: true, skipped: "update repetido" });

  // --------------------------------------------------------------- botões --
  if (update.callback_query) {
    const cq = update.callback_query;
    const fromId = cq.from?.id;
    const chatId = cq.message?.chat?.id;
    const messageId = cq.message?.message_id;
    const data = cq.data ?? "";

    if (!ownerId || String(fromId) !== ownerId) {
      await answerCallback(cq.id, "Bot privado.");
      return NextResponse.json({ ok: true, skipped: "não autorizado" });
    }
    if (!chatId || !messageId) {
      await answerCallback(cq.id);
      return NextResponse.json({ ok: true, skipped: "sem mensagem" });
    }

    const [action, draftCode, param] = data.split("|");

    const { data: draft } = await supabase
      .from("telegram_drafts")
      .select("id, household_id, description, amount_cents, occurred_on, status")
      .eq("code", draftCode)
      .maybeSingle();

    if (!draft || draft.status !== "pending") {
      await answerCallback(cq.id, "Esse lançamento já foi resolvido.");
      await editMessage(chatId, messageId, "Este lançamento já foi resolvido.");
      return NextResponse.json({ ok: true });
    }

    const { data: cards } = await supabase
      .from("credit_cards")
      .select("id, name, last4, institution")
      .eq("household_id", draft.household_id)
      .eq("is_active", true)
      .order("name");

    const list = (cards ?? []) as Card[];
    const header = `<b>${formatBRL(Number(draft.amount_cents))}</b> · ${escapeHtml(draft.description)}\n`;

    if (action === "b") {
      if (param === "*") {
        await answerCallback(cq.id);
        await editMessage(chatId, messageId, header + "De qual cartão?", buildBankKeyboard(list, draftCode));
        return NextResponse.json({ ok: true });
      }

      const bankCards = list.filter((card) => slug(bankLabel(card)) === param);
      const rows = bankCards.map((card) => [
        { text: `•••• ${card.last4 ?? "—"}`, callback_data: `d|${draftCode}|${card.last4 ?? ""}` },
      ]);
      rows.push([{ text: "« trocar banco", callback_data: `b|${draftCode}|*` }]);

      await answerCallback(cq.id);
      await editMessage(chatId, messageId, header + `Qual o final do cartão <b>${escapeHtml(param.toUpperCase())}</b>?`, {
        inline_keyboard: rows,
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "d") {
      const { data: result, error } = await supabase.rpc("fin_resolve_telegram_draft", {
        p_code: draftCode,
        p_last4: param,
      });

      if (error) {
        await answerCallback(cq.id, "Não consegui lançar.");
        await editMessage(chatId, messageId, `⚠️ ${escapeHtml(error.message)}`);
        return NextResponse.json({ ok: true, error: error.message });
      }

      const info = result as { due_date?: string; card_name?: string; duplicate?: boolean };
      await answerCallback(cq.id, "Lançado");
      await editMessage(
        chatId,
        messageId,
        [
          `✅ <b>${formatBRL(Number(draft.amount_cents))}</b> · ${escapeHtml(draft.description)}`,
          `Cartão: <b>${escapeHtml(info.card_name ?? param)}</b>`,
          `Fatura: <b>${info.due_date ? brDate(info.due_date) : "—"}</b>`,
          info.duplicate ? "<i>já estava lançado — não dupliquei</i>" : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
      return NextResponse.json({ ok: true });
    }

    if (action === "x") {
      await supabase.from("telegram_drafts").update({ status: "canceled" }).eq("id", draft.id);
      await answerCallback(cq.id, "Cancelado");
      await editMessage(chatId, messageId, "Lançamento cancelado.");
      return NextResponse.json({ ok: true });
    }

    await answerCallback(cq.id);
    return NextResponse.json({ ok: true, skipped: "ação desconhecida" });
  }

  // ------------------------------------------------------------- mensagens --
  const message = update.message;
  const text = message?.text?.trim();
  const chatId = message?.chat?.id;
  const fromId = message?.from?.id;

  if (!text || chatId == null || fromId == null) {
    return NextResponse.json({ ok: true, skipped: "sem texto" });
  }
  if (!ownerId || String(fromId) !== ownerId) {
    await sendMessage(chatId, "⛔ Este bot é privado.");
    return NextResponse.json({ ok: true, skipped: "não autorizado" });
  }

  if (text === "/start" || text === "/ajuda" || text === "/help") {
    await sendMessage(chatId, HELP);
    return NextResponse.json({ ok: true });
  }

  const { data: link } = await supabase
    .from("telegram_links")
    .select("household_id, person_id")
    .eq("telegram_user_id", Number(ownerId))
    .maybeSingle();

  if (!link) {
    await sendMessage(chatId, "Conta não vinculada. Peça para o administrador rodar o vínculo do Telegram.");
    return NextResponse.json({ ok: true, skipped: "sem vínculo" });
  }

  if (text === "/cartoes") {
    const { data: cards } = await supabase
      .from("credit_cards")
      .select("id, name, last4, institution")
      .eq("household_id", link.household_id)
      .eq("is_active", true)
      .order("name");

    const list = (cards ?? []) as Card[];
    await sendMessage(
      chatId,
      list.length
        ? "<b>Seus cartões</b>\n" + list.map((card) => `• ${escapeHtml(card.name)} · final ${card.last4 ?? "—"}`).join("\n")
        : "Nenhum cartão cadastrado. Cadastre em /cartoes no sistema.",
    );
    return NextResponse.json({ ok: true });
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

    await sendMessage(
      chatId,
      `<b>Mês atual</b>\nReceitas: ${formatBRL(income)}\nDespesas: ${formatBRL(expense)}\nResultado: ${formatBRL(income - expense)}`,
    );
    return NextResponse.json({ ok: true });
  }

  const today = todayInSaoPaulo();
  const payment = detectPayment(text);
  const { entries, failures } = parseMessage(payment.cleaned || text, today);

  if (!entries.length) {
    await sendMessage(
      chatId,
      `Não entendi nenhuma linha. Exemplos:\n<code>25 casa de bolos</code>\n<code>atacadão 69,28</code>\n\n${HELP}`,
    );
    return NextResponse.json({ ok: true, skipped: "nada parseado" });
  }

  // ------------------------------------------------------ compra no crédito --
  if (payment.method === "credit") {
    if (entries.length > 1) {
      await sendMessage(chatId, "No crédito, mande <b>uma compra por mensagem</b> — assim eu pergunto o cartão certo.");
      return NextResponse.json({ ok: true, skipped: "crédito com múltiplas linhas" });
    }

    const entry = entries[0];
    const { data: cards } = await supabase
      .from("credit_cards")
      .select("id, name, last4, institution")
      .eq("household_id", link.household_id)
      .eq("is_active", true)
      .order("name");

    const list = (cards ?? []) as Card[];
    if (!list.length) {
      await sendMessage(chatId, "Nenhum cartão cadastrado ainda. Cadastre em <b>/cartoes</b> no sistema e mande de novo.");
      return NextResponse.json({ ok: true, skipped: "sem cartão" });
    }

    // final informado na mensagem: lança direto, sem perguntar
    if (payment.cardEnd) {
      const card = list.find((item) => item.last4 === payment.cardEnd);
      if (!card) {
        const finals = [...new Set(list.map((item) => item.last4).filter(Boolean))].join(", ");
        await sendMessage(
          chatId,
          `Não achei o cartão final <b>${escapeHtml(payment.cardEnd)}</b>. Finais cadastrados: ${finals}.`,
        );
        return NextResponse.json({ ok: true, skipped: "final desconhecido" });
      }

      const { data: result, error } = await supabase.rpc("fin_add_card_charge", {
        p_household: link.household_id,
        p_card: card.id,
        p_description: entry.description,
        p_amount: entry.amountCents,
        p_date: entry.date,
        p_category: null,
        p_external_id: `tg:${update.update_id}:0`,
      });

      if (error) {
        await sendMessage(chatId, `⚠️ ${escapeHtml(error.message)}`);
        return NextResponse.json({ ok: true, error: error.message });
      }

      const info = result as { due_date?: string; duplicate?: boolean };
      await sendMessage(
        chatId,
        [
          `✅ <b>${formatBRL(entry.amountCents)}</b> · ${escapeHtml(entry.description)}`,
          `Cartão: <b>${escapeHtml(card.name)}</b>`,
          `Fatura: <b>${info.due_date ? brDate(info.due_date) : "—"}</b>`,
          info.duplicate ? "<i>já estava lançado — não dupliquei</i>" : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
      return NextResponse.json({ ok: true, created: 1 });
    }

    // sem final: abre o rascunho e pergunta com botões
    const draftCode = code();
    const { error: draftError } = await supabase.from("telegram_drafts").insert({
      code: draftCode,
      household_id: link.household_id,
      telegram_user_id: Number(ownerId),
      chat_id: chatId,
      description: entry.description,
      amount_cents: entry.amountCents,
      occurred_on: entry.date,
      external_id: `tg:${update.update_id}:0`,
    });

    if (draftError) {
      await sendMessage(chatId, `⚠️ ${escapeHtml(draftError.message)}`);
      return NextResponse.json({ ok: true, error: draftError.message });
    }

    // banco citado na mensagem: mostra os finais dele direto
    if (payment.bankHint) {
      const ofBank = list.filter((card) => slug(bankLabel(card)) === slug(payment.bankHint));
      if (ofBank.length) {
        const rows = ofBank.map((card) => [
          { text: `•••• ${card.last4 ?? "—"}`, callback_data: `d|${draftCode}|${card.last4 ?? ""}` },
        ]);
        rows.push([{ text: "« trocar banco", callback_data: `b|${draftCode}|*` }]);
        await sendMessage(
          chatId,
          `<b>${formatBRL(entry.amountCents)}</b> · ${escapeHtml(entry.description)}\nQual o final do cartão?`,
          { inline_keyboard: rows },
        );
        return NextResponse.json({ ok: true, draft: true });
      }
    }

    await sendMessage(
      chatId,
      `<b>${formatBRL(entry.amountCents)}</b> · ${escapeHtml(entry.description)}\nEm qual cartão foi?`,
      buildBankKeyboard(list, draftCode),
    );
    return NextResponse.json({ ok: true, draft: true });
  }

  // ------------------------------------------------------------ débito/PIX --
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

    if (error) erros.push(`✖ ${escapeHtml(entry.description)}: ${escapeHtml(error.message)}`);
    else if (data) ok.push(`✅ ${escapeHtml(formatEntry(entry, formatBRL))}`);
  }

  for (const failure of failures) {
    erros.push(`⚠️ "${escapeHtml(failure.raw)}" — ${escapeHtml(failure.error)}`);
  }

  await sendMessage(chatId, [...ok, ...erros].join("\n") || "Nada para lançar.");

  return NextResponse.json({ ok: true, created: ok.length, failed: erros.length });
}
