import { createHash, timingSafeEqual } from "crypto";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

export interface TgInlineButton {
  text: string;
  callback_data?: string;
  url?: string;
}

interface TgApiResponse<T> {
  ok?: boolean;
  result?: T;
  description?: string;
}

export async function tgCall<T = unknown>(
  method: string,
  payload: Record<string, unknown>,
): Promise<T | null> {
  // Can be called via gateway or direct bot token:
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (token) {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json().catch(() => null)) as TgApiResponse<T> | null;
    return data?.ok ? (data.result ?? null) : null;
  }

  const lovablyKey = process.env["LOVABLE_API_KEY"];
  const telegramKey = process.env["TELEGRAM_API_KEY"];
  if (!lovablyKey || !telegramKey) {
    throw new Error("Telegram connection is not configured");
  }
  const res = await fetch(`${GATEWAY_URL}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovablyKey}`,
      "X-Connection-Api-Key": telegramKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => null)) as TgApiResponse<T> | null;
  return data?.ok ? (data.result ?? null) : null;
}

export function sendMessage(
  chatId: number | string,
  text: string,
  buttons?: TgInlineButton[][],
) {
  return tgCall("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
  });
}

export function answerCallbackQuery(callbackQueryId: string, text?: string) {
  return tgCall("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text ? { text } : {}),
  });
}

export function deriveTelegramWebhookSecret(secret: string): string {
  return createHash("sha256")
    .update(`telegram-webhook:${secret}`)
    .digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}