import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const [contract, setContract] = useState("");
  const [brief, setBrief] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/public/campaign-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokenAddress: contract }),
      });
      const data = await res.json();
      setBrief(data);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ minHeight: "100vh", background: "#07150d", color: "#e5fff2", padding: 32 }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <h1 style={{ fontSize: 42, color: "#7ef9b0", marginBottom: 12 }}>BOOSTIFY SOL</h1>
        <p style={{ color: "#b9f9cf", marginBottom: 24 }}>
          Visibility & promotion campaigns for Solana tokens — no guaranteed market-cap promises.
        </p>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 28 }}>
          <input
            value={contract}
            onChange={(e) => setContract(e.target.value)}
            placeholder="Paste Solana token mint / contract address"
            style={{
              flex: 1,
              minWidth: 280,
              padding: 14,
              borderRadius: 10,
              border: "1px solid #1e8d52",
              background: "#0c1f15",
              color: "#ebfff2",
            }}
          />
          <button
            onClick={handleGenerate}
            disabled={loading || !contract.trim()}
            style={{
              background: "#22c55e",
              color: "#04160a",
              border: "none",
              borderRadius: 10,
              padding: "14px 22px",
              fontWeight: 800,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Generating..." : "Generate AI Campaign Brief"}
          </button>
        </div>

        {brief && !brief.ok && (
          <div
            style={{
              background: "#1f0e11",
              border: "1px solid #7a2a2a",
              borderRadius: 12,
              padding: 16,
              color: "#ffd7d7",
            }}
          >
            {brief.error}
          </div>
        )}

        {brief && brief.ok && (
          <section
            style={{
              background: "#0d1b12",
              border: "1px solid #24553a",
              borderRadius: 18,
              padding: 24,
            }}
          >
            <h2 style={{ color: "#8df7b8" }}>{brief.tokenSymbol}</h2>
            <p>
              <strong>Contract:</strong> {brief.tokenContract}
            </p>
            <p>
              <strong>Market Cap:</strong> {brief.marketData?.marketCap}
            </p>
            <p>
              <strong>Liquidity:</strong> {brief.marketData?.liquidity}
            </p>
            <p>
              <strong>24h Volume:</strong> {brief.marketData?.volume24h}
            </p>

            <h3 style={{ color: "#8df7b8", marginTop: 20 }}>Objective</h3>
            <p>{brief.brief.objective}</p>

            <h3 style={{ color: "#8df7b8", marginTop: 20 }}>Target audience</h3>
            <ul>
              {brief.brief.targetAudience.map((item: string) => (
                <li key={item}>{item}</li>
              ))}
            </ul>

            <h3 style={{ color: "#8df7b8", marginTop: 20 }}>Marketing hooks</h3>
            <ul>
              {brief.brief.marketingHooks.map((item: string) => (
                <li key={item}>{item}</li>
              ))}
            </ul>

            <h3 style={{ color: "#8df7b8", marginTop: 20 }}>Execution plan</h3>
            <ul>
              {brief.brief.executionPlan.map((item: string) => (
                <li key={item}>{item}</li>
              ))}
            </ul>

            <h3 style={{ color: "#8df7b8", marginTop: 20 }}>Disclaimer</h3>
            <p>{brief.brief.disclaimer}</p>
          </section>
        )}
      </div>
    </main>
  );
}
