"use client";
import { useState } from "react";
import ConnectWallet, { useThryxAuth, ProBanner, WalletPickerModal } from "@/components/ConnectWallet";
import { getDailyUsage, incrementDailyUsage } from "@/lib/thryx-auth";

interface TokenResult {
  name: string;
  symbol: string;
  description: string;
  tagline: string;
  twitterBio: string;
}

const examples: TokenResult[] = [
  { name: "Dogefather", symbol: "DGFR", description: "The OG meme energy reborn on Base. If you know, you know.", tagline: "Such father. Much wow.", twitterBio: "🐕 $DGFR — The Dogefather watches over all memes on Base" },
  { name: "RugPullSafe", symbol: "RUGS", description: "The anti-rug token that rugs the ruggers. Irony is our moat.", tagline: "Can't rug the unruggable.", twitterBio: "🧹 $RUGS — We rug the ruggers so you don't have to" },
  { name: "CatWifHat", symbol: "CWH", description: "Cats + hats = unstoppable memetic force. The internet's favorite combo.", tagline: "Every cat deserves a hat.", twitterBio: "🐱🎩 $CWH — The hat stays ON" },
];

const FREE_GEN_LIMIT = 3;

export default function Home() {
  const [idea, setIdea] = useState("");
  const [result, setResult] = useState<TokenResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [count] = useState(847);
  const { wallet, pro, connect, disconnect, showPicker, setShowPicker, walletOptions, connectWithProvider } = useThryxAuth();

  const generate = async () => {
    if (!idea.trim()) return;

    if (!pro) {
      const usage = getDailyUsage("mememint_gens");
      if (usage >= FREE_GEN_LIMIT) {
        setError(`Free tier: ${FREE_GEN_LIMIT} generations/day reached. Upgrade to Pro for unlimited!`);
        return;
      }
    }

    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Generation failed");
      }
      const data = await res.json();
      setResult(data);
      if (!pro) incrementDailyUsage("mememint_gens");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const shareOnTwitter = () => {
    if (!result) return;
    const text = `I just generated $${result.symbol} (${result.name}) on MemeMint! ⚡\n\n"${result.tagline}"\n\nGenerate your meme token 👉 ${window.location.origin}\n\nPowered by @THRYXAGI`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank");
  };

  const gensUsed = getDailyUsage("mememint_gens");

  return (
    <div>
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <a href="/" className="text-xl font-bold glow-text">⚡ MemeMint</a>
        <div className="flex gap-4 text-sm items-center">
          <a href="/" className="hover:text-[#39ff14] transition-colors">Home</a>
          <a href="/trending" className="hover:text-[#39ff14] transition-colors">Trending</a>
          <ConnectWallet wallet={wallet} pro={pro} connect={connect} disconnect={disconnect} />
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Hero */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 glow-text">MemeMint ⚡</h1>
          <p className="text-xl text-gray-400 mb-2">AI-Powered Meme Token Generator</p>
          <p className="text-sm text-gray-500">
            {pro ? "⚡ Pro — Unlimited generations, custom styles, batch mode" : `${count.toLocaleString()}+ tokens generated · ${FREE_GEN_LIMIT - gensUsed}/${FREE_GEN_LIMIT} free generations left today`}
          </p>
        </div>

        <ProBanner pro={pro} feature="Unlimited generations, custom styles, batch mode" />

        {/* Input */}
        <div className="glass p-6 mb-8 animate-glow">
          <textarea
            className="w-full bg-transparent border border-white/20 rounded-xl p-4 text-lg resize-none focus:outline-none focus:border-[#39ff14]/50 placeholder-gray-600"
            rows={3}
            placeholder="Describe your meme token idea... (e.g. 'a cat that trades crypto while sleeping')"
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); generate(); } }}
          />
          <div className="mt-4 flex justify-center">
            <button className="btn-primary" onClick={generate} disabled={loading || !idea.trim()}>
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  Generating...
                </span>
              ) : "⚡ Generate Token"}
            </button>
          </div>
        </div>

        {error && <div className="text-red-400 text-center mb-6 glass p-4">{error}</div>}

        {/* Result */}
        {result && (
          <div className="glass p-6 mb-8">
            <div className="text-center mb-6">
              <h2 className="text-3xl font-bold neon-green">{result.name}</h2>
              <p className="text-xl neon-purple font-mono">${result.symbol}</p>
            </div>
            <div className="space-y-4 mb-6">
              <div className="glass p-4">
                <p className="text-xs text-gray-500 mb-1">Description</p>
                <p>{result.description}</p>
              </div>
              <div className="glass p-4">
                <p className="text-xs text-gray-500 mb-1">Tagline</p>
                <p className="text-lg font-semibold">&ldquo;{result.tagline}&rdquo;</p>
              </div>
              <div className="glass p-4">
                <p className="text-xs text-gray-500 mb-1">Twitter Bio</p>
                <p>{result.twitterBio}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 justify-center">
              <a href="https://www.clanker.world" target="_blank" className="btn-primary text-sm">🚀 Deploy on Base via Clanker</a>
              <button className="btn-secondary text-sm" onClick={shareOnTwitter}>🐦 Share on Twitter</button>
              <a href={`https://mysocial.mom/bulletins`} target="_blank" rel="noopener" className="btn-secondary text-sm">📣 Share on MySocial</a>
              <a href="https://scanner.thryx.mom" target="_blank" rel="noopener" className="btn-secondary text-sm">🔍 Scan similar tokens</a>
              <button className="btn-secondary text-sm" onClick={() => { setResult(null); setIdea(""); }}>🔄 Generate Another</button>
            </div>
          </div>
        )}

        {/* Examples */}
        <div className="mt-12">
          <h3 className="text-center text-lg text-gray-400 mb-6">✨ Example Generations</h3>
          <div className="grid md:grid-cols-3 gap-4">
            {examples.map((ex) => (
              <div key={ex.symbol} className="glass p-5 hover:border-[#39ff14]/30 transition-colors cursor-pointer" onClick={() => { setResult(ex); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                <h4 className="font-bold neon-green text-lg">{ex.name}</h4>
                <p className="text-sm neon-purple font-mono mb-2">${ex.symbol}</p>
                <p className="text-sm text-gray-400">{ex.description}</p>
                <p className="text-xs text-gray-500 mt-2 italic">&ldquo;{ex.tagline}&rdquo;</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-16 text-center text-xs text-gray-600 border-t border-white/10 pt-6">
        <div className="mb-3">
          <span className="inline-flex items-center gap-1 px-3 py-1 bg-[#39ff14]/20 text-[#39ff14] rounded-full text-xs font-medium">
            Built by THRYX ⚡
          </span>
        </div>
        <p>MemeMint — AI-Powered Meme Token Generator</p>
      </footer>
      {showPicker && <WalletPickerModal wallets={walletOptions} onSelect={connectWithProvider} onClose={() => setShowPicker(false)} />}
    </div>
  );
}
