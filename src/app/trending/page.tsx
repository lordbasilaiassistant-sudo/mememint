"use client";
import { useEffect, useState } from "react";

interface Token {
  chainId: string;
  tokenAddress: string;
  icon?: string;
  name?: string;
  symbol?: string;
  description?: string;
  amount: number;
  totalAmount: number;
  url?: string;
}

export default function Trending() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("https://api.dexscreener.com/token-boosts/top/v1")
      .then((r) => r.json())
      .then((data: Token[]) => {
        const baseTokens = data.filter((t) => t.chainId === "base").slice(0, 20);
        setTokens(baseTokens.length > 0 ? baseTokens : data.slice(0, 20));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className="text-3xl font-bold text-center mb-2 glow-text">🔥 Trending Tokens</h1>
      <p className="text-center text-gray-400 mb-8">Top boosted tokens — scan with <a href="https://basescan.ai" target="_blank" className="neon-green underline">BaseScan AI</a></p>

      {loading ? (
        <div className="text-center py-12">
          <div className="w-8 h-8 border-2 border-[#39ff14] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500">Loading trending tokens...</p>
        </div>
      ) : tokens.length === 0 ? (
        <p className="text-center text-gray-500 py-12">No trending tokens found right now. Check back later!</p>
      ) : (
        <div className="grid gap-3">
          {tokens.map((t, i) => (
            <div key={`${t.tokenAddress}-${i}`} className="glass p-4 flex items-center gap-4 hover:border-[#39ff14]/30 transition-colors">
              <span className="text-2xl font-bold text-gray-600 w-8">#{i + 1}</span>
              {t.icon && <img src={t.icon} alt="" className="w-10 h-10 rounded-full" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold">{t.name || "Unknown"}</span>
                  {t.symbol && <span className="text-sm neon-purple font-mono">${t.symbol}</span>}
                </div>
                {t.description && <p className="text-xs text-gray-500 truncate">{t.description}</p>}
              </div>
              <div className="flex gap-2 shrink-0">
                <a
                  href={`https://basescan.ai/token/${t.tokenAddress}`}
                  target="_blank"
                  className="btn-secondary text-xs py-2 px-3"
                >
                  🔍 Scan
                </a>
                {t.url && (
                  <a href={t.url} target="_blank" className="btn-secondary text-xs py-2 px-3">📊 Chart</a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
