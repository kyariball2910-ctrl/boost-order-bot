import { lookupSolanaTokenByAddress } from "../../lib/dexscreener.server";

export interface CampaignBriefData {
  objective: string;
  targetAudience: string[];
  marketingHooks: string[];
  executionPlan: string[];
  disclaimer: string;
}

export interface CampaignBriefResponse {
  ok: boolean;
  tokenSymbol?: string;
  tokenContract?: string;
  marketData?: {
    marketCap?: string;
    liquidity?: string;
    volume24h?: string;
  };
  brief?: CampaignBriefData;
  error?: string;
}

export async function generateCampaignBrief(
  tokenAddress: string,
): Promise<CampaignBriefResponse> {
  if (!tokenAddress?.trim()) {
    return { ok: false, error: "Token contract address is required." };
  }

  const token = await lookupSolanaTokenByAddress(tokenAddress.trim());
  if (!token) {
    return { ok: false, error: "Token not found on Solana or DexScreener rejected the contract." };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "OPENAI_API_KEY is not configured." };
  }

  const prompt = `
You are a crypto growth strategist. Create a realistic promotional visibility brief for this Solana token.

Required rules:
- Frame this as a visibility/promotion campaign, not a guaranteed market-cap or price increase.
- Do not promise guaranteed returns or a market-cap target.
- Focus on realistic audience targeting, community fit, and action plan.
- Keep output valid JSON only.

Token data:
- Symbol: ${token.symbol}
- Name: ${token.name}
- Contract: ${token.address}
- Market Cap: ${token.mcUsd ?? "N/A"}
- Liquidity: ${token.liquidityUsd ?? "N/A"}
- 24h Volume: ${token.volume24hUsd ?? "N/A"}

Return JSON with this exact structure:
{
  "objective": "brief sentence",
  "targetAudience": ["audience 1", "audience 2", "audience 3"],
  "marketingHooks": ["hook 1", "hook 2", "hook 3"],
  "executionPlan": ["step 1", "step 2", "step 3"],
  "disclaimer": "clear disclaimer that price or market-cap growth is not guaranteed"
}
`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 1200,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return {
        ok: false,
        error: `AI request failed: ${response.status} ${errorText}`,
      };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = data.choices?.[0]?.message?.content ?? "";
    const cleaned = content.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned) as CampaignBriefData;

    return {
      ok: true,
      tokenSymbol: token.symbol,
      tokenContract: token.address,
      marketData: {
        marketCap: token.mcUsd ? `$${token.mcUsd.toLocaleString()}` : "N/A",
        liquidity: token.liquidityUsd ? `$${token.liquidityUsd.toLocaleString()}` : "N/A",
        volume24h: token.volume24hUsd ? `$${token.volume24hUsd.toLocaleString()}` : "N/A",
      },
      brief: parsed,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: `Failed to generate campaign brief: ${message}` };
  }
}
