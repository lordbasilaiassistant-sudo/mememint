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

const PAGE_SIZE = 20;

export default function Trending() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchPage = async (p: number) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`https://thryx.mom/api/mememint/trending?page=${p}&limit=${PAGE_SIZE}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setTokens(data.tokens || []);
      setTotalPages(data.totalPages || 1);
      setTotal(data.total || 0);
      setPage(data.page || p);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load trending tokens");
      setTokens([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPage(1);
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-center mb-2 glow-text">🔥 Trending on Base</h1>
        <p className="text-center text-gray-400 text-sm">
          Top boosted tokens on Base — scan any with{" "}
          <a href="https://scanner.thryx.mom" target="_blank" className="text-[#39ff14] hover:underline">
            BaseScan AI
          </a>
        </p>
        {total > 0 && (
          <p className="text-center text-gray-600 text-xs mt-1">
            {total} tokens · Page {page} of {totalPages}
          </p>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="w-8 h-8 border-2 border-[#39ff14] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500">Loading trending tokens...</p>
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-red-400 mb-4">{error}</p>
          <button onClick={() => fetchPage(page)} className="btn-secondary text-sm px-4 py-2">
            Retry
          </button>
        </div>
      ) : tokens.length === 0 ? (
        <p className="text-center text-gray-500 py-12">No trending Base tokens found right now. Check back later!</p>
      ) : (
        <>
          <div className="grid gap-3">
            {tokens.map((t, i) => {
              const rank = (page - 1) * PAGE_SIZE + i + 1;
              return (
                <div
                  key={`${t.tokenAddress}-${i}`}
                  className="glass p-4 flex items-center gap-4 hover:border-[#39ff14]/30 transition-colors"
                >
                  <span className="text-2xl font-bold text-gray-600 w-8 text-right">#{rank}</span>
                  {t.icon ? (
                    <img src={t.icon} alt="" className="w-10 h-10 rounded-full bg-white/5" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-gray-600 text-sm">
                      {(t.symbol || "?")[0]}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold truncate">{t.name || "Unknown"}</span>
                      {t.symbol && <span className="text-sm neon-purple font-mono">${t.symbol}</span>}
                    </div>
                    {t.description && (
                      <p className="text-xs text-gray-500 truncate">{t.description}</p>
                    )}
                    <p className="text-xs text-gray-600 font-mono mt-0.5 truncate">{t.tokenAddress}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <a
                      href={`https://scanner.thryx.mom?token=${t.tokenAddress}`}
                      target="_blank"
                      className="btn-secondary text-xs py-2 px-3"
                    >
                      🔍 Scan
                    </a>
                    {t.url && (
                      <a href={t.url} target="_blank" className="btn-secondary text-xs py-2 px-3">
                        📊 Chart
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-8">
              <button
                onClick={() => fetchPage(page - 1)}
                disabled={page <= 1}
                className="btn-secondary text-sm px-4 py-2 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                ← Previous
              </button>
              <span className="text-sm text-gray-500">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => fetchPage(page + 1)}
                disabled={page >= totalPages}
                className="btn-secondary text-sm px-4 py-2 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}

      {/* Back to MemeMint */}
      <div className="text-center mt-10 pt-6 border-t border-white/5">
        <p className="text-gray-500 text-sm mb-3">Want to launch your own token?</p>
        <a href="/" className="btn-primary text-sm px-6 py-2.5">
          🚀 Launch on MemeMint — Free
        </a>
      </div>
    </div>
  );
}
