import { lookupSolanaTokenByAddress, searchSolanaTokens, formatUsd } from "../../lib/dexscreener.server";
import { safeEqual, sendMessage, answerCallbackQuery } from "../../lib/telegram.server";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_IDS = (process.env.BOT_ADMIN_TELEGRAM_IDS ?? "")
  .split(",")
  .map((id) => Number(id.trim()))
  .filter(Boolean);
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
const RECEIVING_WALLET = process.env.SOLANA_RECEIVING_WALLET ?? "";

interface OrderRow {
  id: string;
  order_number: number;
  telegram_user_id: number;
  telegram_chat_id: number;
  token_symbol: string;
  token_contract: string;
  token_name?: string;
  token_mc_usd?: number | null;
  token_liquidity_usd?: number | null;
  token_volume_24h_usd?: number | null;
  package_name: string;
  campaign_tier_label: string;
  price_sol: number;
  status: string;
  payment_tx_signature?: string | null;
  created_at: string;
}

async function supabaseFetch<T>(
  path: string,
  method: "GET" | "POST" | "PATCH" = "GET",
  body?: Record<string, unknown>,
): Promise<T | null> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  const url = `${SUPABASE_URL}/rest/v1${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    console.error("Supabase fetch failed", path, res.status, await res.text());
    return null;
  }

  return (await res.json()) as T;
}

async function isUpdateProcessed(updateId: number): Promise<boolean> {
  const rows = await supabaseFetch<Array<{ update_id: number }>>(
    `/telegram_updates?update_id=eq.${updateId}`,
  );
  return !!rows?.length;
}

async function markUpdateProcessed(updateId: number): Promise<void> {
  await supabaseFetch(
    "/telegram_updates",
    "POST",
    { update_id: updateId, processed_at: new Date().toISOString() },
  );
}

async function getPackages() {
  return (await supabaseFetch<any[]>("/packages?select=*&is_active=eq.true&order=sort_order.asc")) ?? [];
}

async function createOrder(input: {
  telegramUserId: number;
  telegramChatId: number;
  telegramUsername?: string;
  tokenSymbol: string;
  tokenName?: string;
  tokenContract: string;
  tokenMcUsd?: number | null;
  tokenLiquidityUsd?: number | null;
  tokenVolume24hUsd?: number | null;
  packageId?: string;
  packageName: string;
  campaignTierLabel: string;
  priceSol: number;
}): Promise<OrderRow | null> {
  const rows = await supabaseFetch<OrderRow[]>(
    "/orders",
    "POST",
    {
      telegram_user_id: input.telegramUserId,
      telegram_chat_id: input.telegramChatId,
      telegram_username: input.telegramUsername ?? null,
      token_symbol: input.tokenSymbol,
      token_name: input.tokenName ?? input.tokenSymbol,
      token_contract: input.tokenContract,
      token_mc_usd: input.tokenMcUsd ?? null,
      token_liquidity_usd: input.tokenLiquidityUsd ?? null,
      token_volume_24h_usd: input.tokenVolume24hUsd ?? null,
      package_id: input.packageId ?? null,
      package_name: input.packageName,
      campaign_tier_label: input.campaignTierLabel,
      price_sol: input.priceSol,
      status: "pending",
    },
  );

  return rows?.[0] ?? null;
}

async function getOrderById(id: string): Promise<OrderRow | null> {
  const rows = await supabaseFetch<OrderRow[]>(`/orders?id=eq.${id}&select=*`);
  return rows?.[0] ?? null;
}

async function getOrderByNumber(orderNumber: number): Promise<OrderRow | null> {
  const rows = await supabaseFetch<OrderRow[]>(`/orders?order_number=eq.${orderNumber}&select=*`);
  return rows?.[0] ?? null;
}

async function setOrderStatus(id: string, status: string, paymentTxSignature?: string | null) {
  const body: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (paymentTxSignature) body.payment_tx_signature = paymentTxSignature;
  if (status === "paid") body.payment_confirmed_at = new Date().toISOString();
  return supabaseFetch<OrderRow[]>(`/orders?id=eq.${id}`, "PATCH", body);
}

async function getRecentOrders(limit = 10): Promise<OrderRow[]> {
  const rows = await supabaseFetch<OrderRow[]>(`/orders?select=*&order=created_at.desc&limit=${limit}`);
  return rows ?? [];
}

async function getPendingOrders(): Promise<OrderRow[]> {
  const rows = await supabaseFetch<OrderRow[]>(`/orders?select=*&status=in.(pending,awaiting_verification,paid)&order=created_at.desc`);
  return rows ?? [];
}

async function getLatestPendingOrderForUser(telegramUserId: number): Promise<OrderRow | null> {
  const rows = await supabaseFetch<OrderRow[]>(
    `/orders?telegram_user_id=eq.${telegramUserId}&status=eq.pending&select=*&order=created_at.desc&limit=1`,
  );
  return rows?.[0] ?? null;
}

async function getAdminIds(): Promise<number[]> {
  return ADMIN_IDS;
}

function isAdminChat(chatId: number): boolean {
  return ADMIN_IDS.includes(chatId);
}

function formatTokenResult(token: Awaited<ReturnType<typeof lookupSolanaTokenByAddress>>) {
  if (!token) return null;
  return `🟢 <b>${token.symbol}</b> — ${token.name}\n\n📄 Contract: <code>${token.address}</code>\n💰 MC: ${token.mcUsd ? formatUsd(token.mcUsd) : "—"}\n💧 Liquidity: ${token.liquidityUsd ? formatUsd(token.liquidityUsd) : "—"}\n📊 24H Volume: ${token.volume24hUsd ? formatUsd(token.volume24hUsd) : "—"}`;
}

function buildPackageKeyboard(packages: any[], tokenAddress: string) {
  return packages.map((pkg) => [{
    text: `${pkg.name} • ${pkg.price_sol} SOL`,
    callback_data: `pkg_${pkg.id}_${tokenAddress}`,
  }]);
}

function buildTokenSelectionKeyboard(tokens: Awaited<ReturnType<typeof searchSolanaTokens>>) {
  return tokens.map((token) => [{
    text: `${token.symbol} • ${formatUsd(token.mcUsd)}`,
    callback_data: `token_${token.address}`,
  }]);
}

function welcomeMessage() {
  return [
    "🚀 <b>Welcome to Boostify SOL!</b>",
    "",
    "Send a Solana token mint / contract address to begin.",
    "We'll validate it, show the token stats, and create your order.",
    "",
    "This is a <b>visibility / promotion campaign</b>, not a guaranteed market-cap outcome.",
  ].join("\n");
}

function formatPaymentText(order: OrderRow) {
  return [
    `🚀 <b>BOOST ORDER #${order.order_number}</b>`,
    "",
    `Token: $${order.token_symbol}`,
    `Contract: <code>${order.token_contract}</code>`,
    "",
    `📦 Package: ${order.package_name}`,
    `🎯 Campaign Tier: ${order.campaign_tier_label}`,
    `💰 Price: ${order.price_sol} SOL`,
    "",
    "━━━━━━━━━━━━━━",
    "",
    "Send exactly this amount to:",
    `<code>${RECEIVING_WALLET}</code>`,
    "",
    "After sending, reply with your transaction hash (TX signature).",
  ].join("\n");
}

async function sendUserOrder(order: OrderRow, chatId: number) {
  const text = formatPaymentText(order);
  await sendMessage(chatId, text);
}

export async function handleTelegramWebhookRequest(req: Request) {
  const secretHeader = req.headers.get("x-telegram-bot-api-secret-token");
  if (!SECRET || !secretHeader || !safeEqual(secretHeader, SECRET)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const update = await req.json();
  const updateId = Number(update?.update_id);
  if (!updateId) {
    return new Response("ok", { status: 200 });
  }

  if (await isUpdateProcessed(updateId)) {
    return new Response("ok", { status: 200 });
  }

  await markUpdateProcessed(updateId);

  const message = update?.message;
  const callback = update?.callback_query;

  if (callback) {
    const callbackId = callback.id;
    const data = callback.data ?? "";
    const userId = Number(callback.from?.id ?? 0);

    if (data === "start_boost") {
      await sendMessage(userId, welcomeMessage());
      await answerCallbackQuery(callbackId, "Ready to start your boost order.");
      return new Response("ok", { status: 200 });
    }

    if (data.startsWith("token_")) {
      const tokenAddress = data.replace("token_", "");
      const token = await lookupSolanaTokenByAddress(tokenAddress);
      if (!token) {
        await answerCallbackQuery(callbackId, "Token lookup failed.");
        return new Response("ok", { status: 200 });
      }

      const packages = await getPackages();
      const text = formatTokenResult(token) ?? "Token unavailable";
      await sendMessage(userId, text, buildPackageKeyboard(packages, token.address));
      await answerCallbackQuery(callbackId, "Token selected.");
      return new Response("ok", { status: 200 });
    }

    if (data.startsWith("pkg_")) {
      const match = data.match(/^pkg_([a-f0-9-]+)_([1-9A-HJ-NP-Za-km-z]+)$/i);
      if (!match) {
        await answerCallbackQuery(callbackId, "Invalid package selection.");
        return new Response("ok", { status: 200 });
      }

      const [, packageId, tokenAddress] = match;
      const packages = await getPackages();
      const pkg = packages.find((row) => row.id === packageId);
      if (!pkg) {
        await answerCallbackQuery(callbackId, "Package not found.");
        return new Response("ok", { status: 200 });
      }

      const token = await lookupSolanaTokenByAddress(tokenAddress);
      if (!token) {
        await answerCallbackQuery(callbackId, "Could not validate token.");
        return new Response("ok", { status: 200 });
      }

      const order = await createOrder({
        telegramUserId: userId,
        telegramChatId: userId,
        telegramUsername: callback.from?.username ?? undefined,
        tokenSymbol: token.symbol,
        tokenName: token.name,
        tokenContract: token.address,
        tokenMcUsd: token.mcUsd,
        tokenLiquidityUsd: token.liquidityUsd,
        tokenVolume24hUsd: token.volume24hUsd,
        packageId,
        packageName: pkg.name,
        campaignTierLabel: pkg.campaign_tier_label,
        priceSol: Number(pkg.price_sol),
      });

      if (!order) {
        await answerCallbackQuery(callbackId, "Failed to create order.");
        return new Response("ok", { status: 200 });
      }

      await sendUserOrder(order, userId);
      await answerCallbackQuery(callbackId, `Order #${order.order_number} created.`);
      return new Response("ok", { status: 200 });
    }

    return new Response("ok", { status: 200 });
  }

  if (message) {
    const chatId = Number(message.chat?.id ?? 0);
    const userId = Number(message.from?.id ?? 0);
    const text = String(message.text ?? "").trim();

    if (!chatId || !userId) {
      return new Response("ok", { status: 200 });
    }

    if (text === "/start") {
      await sendMessage(chatId, welcomeMessage(), [[{ text: "🚀 Start Boost", callback_data: "start_boost" }]]);
      return new Response("ok", { status: 200 });
    }

    if (text.startsWith("/orders") && isAdminChat(userId)) {
      const orders = await getRecentOrders(10);
      const formatted = orders.length
        ? orders.map((order) => `#${order.order_number} | ${order.status} | $${order.token_symbol} | ${order.price_sol} SOL`).join("\n")
        : "No orders yet";
      await sendMessage(chatId, `📋 Recent orders:\n\n<code>\n${formatted}\n</code>`);
      return new Response("ok", { status: 200 });
    }

    if (text.startsWith("/pending") && isAdminChat(userId)) {
      const orders = await getPendingOrders();
      const formatted = orders.length
        ? orders.map((order) => `#${order.order_number} | ${order.status} | $${order.token_symbol}`).join("\n")
        : "No pending orders";
      await sendMessage(chatId, `⏳ Pending orders:\n\n<code>\n${formatted}\n</code>`);
      return new Response("ok", { status: 200 });
    }

    if (text.startsWith("/complete") && isAdminChat(userId)) {
      const match = text.match(/\/complete\s+(\d+)/i);
      if (!match) {
        await sendMessage(chatId, "Usage: /complete ORDER_NUMBER");
        return new Response("ok", { status: 200 });
      }
      const orderNumber = Number(match[1]);
      const order = await getOrderByNumber(orderNumber);
      if (!order) {
        await sendMessage(chatId, `Order #${orderNumber} not found.`);
        return new Response("ok", { status: 200 });
      }
      await setOrderStatus(order.id, "completed");
      await sendMessage(chatId, `✅ Order #${orderNumber} marked as completed.`);
      await sendMessage(order.telegram_user_id, `✅ Your order #${order.order_number} is now complete. Your boost has been fulfilled.`);
      return new Response("ok", { status: 200 });
    }

    // Manual TX submission flow — only notify after successful Supabase update
    const isTxSignature = /^[1-9A-HJ-NP-Za-km-z]{86,88}$/.test(text);
    if (isTxSignature) {
      const pendingOrder = await getLatestPendingOrderForUser(userId);
      if (!pendingOrder) {
        await sendMessage(chatId, "No pending order found. Create an order first, then paste the TX signature.");
        return new Response("ok", { status: 200 });
      }

      const updated = await setOrderStatus(pendingOrder.id, "awaiting_verification", text);

      if (!updated || !updated.length) {
        await sendMessage(
          chatId,
          "❌ Could not save your TX. Please try again in a moment, or contact an admin if the problem persists.",
        );
        return new Response("ok", { status: 200 });
      }

      await sendMessage(
        chatId,
        `✅ TX received for order #${pendingOrder.order_number}.\n\n<code>${text}</code>\n\nAn admin will verify it shortly.`,
      );

      const txLink = `https://solscan.io/tx/${text}`;

      for (const adminId of await getAdminIds()) {
        await sendMessage(
          adminId,
          `📋 <b>TX RECEIVED</b>\n\nOrder #${pendingOrder.order_number}\nToken: $${pendingOrder.token_symbol}\nPackage: ${pendingOrder.package_name}\nAmount: ${pendingOrder.price_sol} SOL\nTX: <code>${text}</code>\n\n⚠️ Manual verification required.`,
          [[{ text: "🔗 View on Solscan", url: txLink }]],
        );
      }

      return new Response("ok", { status: 200 });
    }

    const tokenQuery = text.trim();
    const validAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(tokenQuery);

    if (validAddress) {
      const token = await lookupSolanaTokenByAddress(tokenQuery);
      if (!token) {
        await sendMessage(chatId, "❌ No Solana token found for that mint address.");
        return new Response("ok", { status: 200 });
      }

      const packages = await getPackages();
      await sendMessage(chatId, formatTokenResult(token) ?? "Token unavailable", buildPackageKeyboard(packages, token.address));
      return new Response("ok", { status: 200 });
    }

    const tokens = await searchSolanaTokens(tokenQuery);
    if (!tokens.length) {
      await sendMessage(chatId, "❌ No Solana matches found. Try a different token symbol or mint address.");
      return new Response("ok", { status: 200 });
    }

    await sendMessage(chatId, `🔎 Found these Solana matches for <b>${tokenQuery}</b>:`, buildTokenSelectionKeyboard(tokens));
    return new Response("ok", { status: 200 });
  }

  return new Response("ok", { status: 200 });
}

export async function POST(request: Request) {
  return handleTelegramWebhookRequest(request);
}

export async function GET() {
  return new Response("Telegram webhook endpoint is active.", { status: 200 });
}
