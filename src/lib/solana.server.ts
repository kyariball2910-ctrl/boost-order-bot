const LAMPORTS_PER_SOL = 1_000_000_000;

interface SignatureInfo {
  signature: string;
  err: unknown;
  blockTime?: number | null;
}

interface ParsedInstruction {
  program?: string;
  parsed?: {
    type?: string;
    info?: { destination?: string; lamports?: number };
  };
}

interface ParsedTransaction {
  blockTime?: number | null;
  meta?: {
    err?: unknown;
    innerInstructions?: Array<{ instructions?: ParsedInstruction[] }>;
  } | null;
  transaction?: {
    message?: { instructions?: ParsedInstruction[] };
  };
}

async function rpc<T>(method: string, params: unknown[]): Promise<T | null> {
  const url =
    process.env["SOLANA_RPC_URL"] ?? "https://api.mainnet-beta.solana.com";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) {
    console.error(`Solana RPC ${method} failed [${res.status}]`);
    return null;
  }
  const data = (await res.json().catch(() => null)) as {
    result?: T;
    error?: unknown;
  } | null;
  if (!data || data.error) {
    console.error(`Solana RPC ${method} error: ${JSON.stringify(data?.error)}`);
    return null;
  }
  return data.result ?? null;
}

function lamportsToWallet(tx: ParsedTransaction, wallet: string): number {
  if (!tx.meta || tx.meta.err) return 0;
  const instructions: ParsedInstruction[] = [
    ...(tx.transaction?.message?.instructions ?? []),
    ...(tx.meta.innerInstructions ?? []).flatMap((i) => i.instructions ?? []),
  ];
  let total = 0;
  for (const ix of instructions) {
    if (ix.program !== "system" || ix.parsed?.type !== "transfer") continue;
    const info = ix.parsed.info;
    if (info?.destination === wallet && typeof info.lamports === "number") {
      total += info.lamports;
    }
  }
  return total;
}

export function solToLamports(sol: number): number {
  return Math.round(sol * LAMPORTS_PER_SOL);
}

/**
 * Finds a recent SOL transfer to the receiving wallet matching the expected
 * amount (0.5% tolerance), sent after the order was created.
 */
export async function findPaymentSignature(args: {
  receivingWallet: string;
  expectedLamports: number;
  sinceUnix: number;
  usedSignatures: string[];
}): Promise<string | null> {
  const { receivingWallet, expectedLamports, sinceUnix, usedSignatures } = args;
  const used = new Set(usedSignatures);
  const tolerance = Math.max(5000, Math.round(expectedLamports * 0.005));

  const signatures = await rpc<SignatureInfo[]>("getSignaturesForAddress", [
    receivingWallet,
    { limit: 40 },
  ]);
  if (!signatures) return null;

  for (const sig of signatures) {
    if (sig.err) continue;
    if (typeof sig.blockTime === "number" && sig.blockTime < sinceUnix) {
      break;
    }
    if (used.has(sig.signature)) continue;

    const tx = await rpc<ParsedTransaction | null>("getTransaction", [
      sig.signature,
      { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
    ]);
    if (!tx || tx.meta?.err) continue;

    const received = lamportsToWallet(tx, receivingWallet);
    if (received > 0 && Math.abs(received - expectedLamports) <= tolerance) {
      return sig.signature;
    }
  }
  return null;
}