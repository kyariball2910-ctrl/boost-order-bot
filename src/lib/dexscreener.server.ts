export interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  priceUsd?: number | undefined;
  mcUsd?: number | undefined;
  liquidityUsd?: number | undefined;
  volume24hUsd?: number | undefined;
  pairUrl?: string | undefined;
}

interface DexPair {
  chainId?: string;
  baseToken?: { address?: string; symbol?: string; name?: string };
  priceUsd?: string;
  marketCap?: number;
  fdv?: number;
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  url?: string;
}

const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isLikelySolanaAddress(input: string): boolean {
  return SOLANA_ADDRESS_RE.test(input.trim());
}

function pairToToken(pair: DexPair): TokenInfo | null {
  const address = pair.baseToken?.address;
  const symbol = pair.baseToken?.symbol;
  if (!address || !symbol) return null;
  return {
    address,
    symbol,
    name: pair.baseToken?.name ?? symbol,
    priceUsd: pair.priceUsd ? Number(pair.priceUsd) : undefined,
    mcUsd: pair.marketCap ?? pair.fdv,
    liquidityUsd: pair.liquidity?.usd,
    volume24hUsd: pair.volume?.h24,
    pairUrl: pair.url,
  };
}

/** Exact contract-address lookup, Solana chain only. */
export async function lookupSolanaTokenByAddress(
  address: string,
): Promise<TokenInfo | null> {
  const res = await fetch(
    `https://api.dexscreener.com/tokens/v1/solana/${encodeURIComponent(address)}`,
  );
  if (!res.ok) return null;
  const pairs = (await res.json().catch(() => null)) as DexPair[] | null;
  if (!Array.isArray(pairs) || pairs.length === 0) return null;
  const solanaPairs = pairs.filter((p) => p.chainId === "solana");
  const best = solanaPairs.sort(
    (a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0),
  )[0];
  return best ? pairToToken(best) : null;
}

/** Symbol/name search restricted to Solana pairs, deduped by contract. */
export async function searchSolanaTokens(query: string): Promise<TokenInfo[]> {
  const res = await fetch(
    `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`,
  );
  if (!res.ok) return [];
  const data = (await res.json().catch(() => null)) as {
    pairs?: DexPair[];
  } | null;
  const pairs = data?.pairs ?? [];
  const seen = new Set<string>();
  const tokens: TokenInfo[] = [];
  for (const pair of pairs) {
    if (pair.chainId !== "solana") continue;
    const token = pairToToken(pair);
    if (!token || seen.has(token.address)) continue;
    seen.add(token.address);
    tokens.push(token);
    if (tokens.length >= 5) break;
  }
  return tokens;
}

export function formatUsd(value?: number): string {
  if (value == null || Number.isNaN(value)) return "—";
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
}