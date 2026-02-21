"use client";
import { useState, useCallback, useRef } from "react";
import ConnectWallet, { useThryxAuth, WalletPickerModal } from "@/components/ConnectWallet";
import { getDailyUsage, incrementDailyUsage } from "@/lib/thryx-auth";

interface TokenData {
  name: string;
  symbol: string;
  description: string;
  tagline: string;
  twitterBio: string;
}

interface DeployResult {
  contractAddress: string | null;
  dopplerUrl: string | null;
  basescanUrl: string | null;
  bankrUrl: string | null;
  feeRecipient: string;
}

type Step = "build" | "success";
type ImageMode = "upload" | "url";
type FeeRecipient = "thryx" | "wallet" | "twitter";

const THRYX_BANKR_WALLET = "0x8f9ec800972258e48d7ebc2640ea0b5e245c2cf5";

const themes = [
  { label: "🐕 Dog Coin", idea: "a funny dog-themed meme coin" },
  { label: "🐱 Cat Token", idea: "a mysterious cat overlord crypto" },
  { label: "🌙 Moon Shot", idea: "a moon-themed rocket fuel token" },
  { label: "🍔 Food Coin", idea: "a delicious fast food meme token" },
  { label: "🤖 AI Agent", idea: "an AI agent that trades for you" },
  { label: "💀 Degen", idea: "the most degen token on Base" },
  { label: "🎮 Gaming", idea: "a retro gaming meme token" },
  { label: "👽 Alien", idea: "an alien invasion crypto meme" },
];

const FREE_GEN_LIMIT = 3;       // free: 3 AI text gens/day
const PRO_GEN_LIMIT = 999;      // pro ($19/mo): unlimited

const emptyToken = (): TokenData => ({
  name: "", symbol: "", description: "", tagline: "", twitterBio: "",
});

export default function Home() {
  const [step, setStep] = useState<Step>("build");

  // Token data — user edits directly
  const [token, setToken] = useState<TokenData>(emptyToken());
  const [imagePreview, setImagePreview] = useState<string | null>(null); // always a displayable src (data URI or https URL)
  const [imagePublicUrl, setImagePublicUrl] = useState<string | null>(null); // public https URL for Bankr

  // Fee recipient
  const [feeMode, setFeeMode] = useState<FeeRecipient>("thryx");
  const [twitterHandle, setTwitterHandle] = useState("");

  // Optional advanced fields
  const [website, setWebsite] = useState("");
  const [tweet, setTweet] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Image mode
  const [imageMode, setImageMode] = useState<ImageMode>("upload");
  const [imageUrlInput, setImageUrlInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Loading states
  const [aiLoading, setAiLoading] = useState(false);    // AI text gen
  const [uploadLoading, setUploadLoading] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deployStatus, setDeployStatus] = useState("");

  // Errors + result
  const [error, setError] = useState("");
  const [deployResult, setDeployResult] = useState<DeployResult | null>(null);

  // Wallet
  const { wallet, pro, connect, disconnect, showPicker, setShowPicker, walletOptions, connectWithProvider } = useThryxAuth();
  const [manualWallet, setManualWallet] = useState("");
  const effectiveWallet = wallet || manualWallet;

  const updateField = useCallback((field: keyof TokenData, value: string) => {
    setToken((prev) => ({ ...prev, [field]: value }));
  }, []);

  // ── AI text fill (OPTIONAL) ──────────────────────────────
  const aiGenerate = async (inputIdea?: string) => {
    const concept = inputIdea || `${token.name} ${token.description}`.trim();
    if (!concept) { setError("Enter a name or description first, or pick a theme"); return; }

    if (!pro) {
      const usage = getDailyUsage("mememint_gens");
      if (usage >= FREE_GEN_LIMIT) {
        setError(`Free limit: ${FREE_GEN_LIMIT} AI fills/day. Upgrade to Pro at thryx.mom/subscribe for unlimited.`);
        return;
      }
    } else {
      // Pro: 50 gens/month hard cap
      const usage = getDailyUsage("mememint_gens_pro");
      if (usage >= PRO_GEN_LIMIT) {
        setError(`Monthly limit reached. Visit thryx.mom/subscribe to manage your plan.`);
        return;
      }
    }

    setAiLoading(true);
    setError("");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea: concept }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI generation failed");
      setToken(data);
      if (!pro) incrementDailyUsage("mememint_gens");
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI fill failed");
    } finally {
      setAiLoading(false);
    }
  };

  // ── File upload ──────────────────────────────────────────
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadLoading(true);
    setImagePreview(null);
    setImagePublicUrl(null);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload-image", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setImagePreview(data.base64);       // data URI for instant preview
      setImagePublicUrl(data.publicUrl);  // CDN URL for Bankr
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadLoading(false);
      e.target.value = "";
    }
  };

  // ── URL paste ────────────────────────────────────────────
  const applyImageUrl = () => {
    const url = imageUrlInput.trim();
    if (!url.startsWith("http")) { setError("Enter a valid https:// URL"); return; }
    setImagePreview(url);   // use URL directly as preview src
    setImagePublicUrl(url);
    setError("");
  };

  // ── Clear image ──────────────────────────────────────────
  const clearImage = () => {
    setImagePreview(null);
    setImagePublicUrl(null);
    setImageUrlInput("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Deploy ───────────────────────────────────────────────
  const deploy = async () => {
    if (!token.name.trim()) { setError("Token name is required"); return; }

    // Determine wallet + twitter for fee routing
    let deployWallet = THRYX_BANKR_WALLET; // default: fees to THRYX treasury
    let deployTwitter: string | undefined;

    if (feeMode === "wallet") {
      if (!effectiveWallet || !/^0x[a-fA-F0-9]{40}$/.test(effectiveWallet)) {
        setError("Connect or enter a valid wallet address (0x...) for fee routing");
        return;
      }
      deployWallet = effectiveWallet;
    } else if (feeMode === "twitter") {
      if (!twitterHandle.trim()) {
        setError("Enter your Twitter/X handle for fee routing");
        return;
      }
      deployTwitter = twitterHandle.trim();
      // Still need a wallet for Bankr — use treasury as fallback
      deployWallet = effectiveWallet || THRYX_BANKR_WALLET;
    }

    setDeploying(true);
    setError("");
    setDeployStatus("Submitting to Bankr...");

    try {
      const res = await fetch("/api/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: token.name.trim(),
          symbol: token.symbol.trim() || undefined,
          description: token.description || token.tagline || undefined,
          imageUrl: imagePublicUrl || undefined,
          walletAddress: deployWallet,
          website: website.trim() || undefined,
          tweet: tweet.trim() || undefined,
          twitter: deployTwitter || undefined,
        }),
      });
      const submitData = await res.json();
      if (!res.ok) throw new Error(submitData.error || "Deploy failed");
      if (!submitData.jobId) throw new Error("No job ID returned");

      setDeployStatus("Deploying on Base... (~60s)");
      const params = new URLSearchParams({
        jobId: submitData.jobId,
        wallet: deployWallet,
        name: token.name,
        symbol: token.symbol || "",
      });

      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        try {
          const poll = await fetch(`/api/deploy/status?${params}`);
          const pd = await poll.json();
          if (pd.status === "completed") {
            setDeployResult({
              contractAddress: pd.contractAddress,
              dopplerUrl: pd.dopplerUrl,
              basescanUrl: pd.basescanUrl,
              bankrUrl: pd.bankrUrl,
              feeRecipient: pd.feeRecipient || deployWallet,
            });
            setStep("success");
            setDeployStatus("");
            return;
          }
          if (pd.status === "failed") throw new Error(pd.error || "Deploy failed on-chain");
          setDeployStatus(`Deploying on Base... (${(i + 1) * 3}s)`);
        } catch (pollErr) {
          if (pollErr instanceof Error && pollErr.message.includes("failed")) throw pollErr;
        }
      }
      throw new Error("Timed out — your token may still be deploying. Check back in a minute.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Deploy failed");
      setDeployStatus("");
    } finally {
      setDeploying(false);
    }
  };

  const reset = () => {
    setStep("build");
    setToken(emptyToken());
    setImagePreview(null);
    setImagePublicUrl(null);
    setImageUrlInput("");
    setDeployResult(null);
    setError("");
    setDeployStatus("");
  };

  const shareOnTwitter = () => {
    const ca = deployResult?.contractAddress ? `\nCA: ${deployResult.contractAddress}` : "";
    const text = `I just launched $${token.symbol || token.name} on Base for FREE! 🚀\n\n"${token.tagline || token.description}"\n\nEarning 40% of trading fees (via Clanker) forever 💰${ca}\n\nLaunch yours 👉 mint.thryx.mom\n\nPowered by @THRYXAGI`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank");
  };

  const isLoading = uploadLoading;
  const canDeploy = token.name.trim().length >= 2 && (
    feeMode === "thryx" ||
    (feeMode === "wallet" && !!effectiveWallet && /^0x[a-fA-F0-9]{40}$/.test(effectiveWallet)) ||
    (feeMode === "twitter" && !!twitterHandle.trim())
  );

  // ── RENDER ────────────────────────────────────────────────
  return (
    <div>
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <a href="/" className="text-xl font-bold glow-text" onClick={(e) => { e.preventDefault(); reset(); }}>
          ⚡ MemeMint
        </a>
        <div className="flex gap-4 text-sm items-center">
          <a href="/trending" className="hover:text-[#39ff14] transition-colors">Trending</a>
          <ConnectWallet wallet={wallet} pro={pro} connect={connect} disconnect={disconnect} />
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-4 py-8">

        {/* ══════════ BUILD STEP ══════════ */}
        {step === "build" && (
          <>
            <div className="text-center mb-8">
              <h1 className="text-4xl font-bold mb-2 glow-text">Launch a Token ⚡</h1>
              <p className="text-gray-400">Deploy on Base free — you earn 40% of swap fees via Clanker</p>
            </div>

            {/* ── Quick themes ── */}
            <div className="flex flex-wrap justify-center gap-2 mb-6">
              {themes.map((t) => (
                <button
                  key={t.label}
                  onClick={() => aiGenerate(t.idea)}
                  disabled={aiLoading}
                  className="px-3 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 hover:border-[#39ff14]/40 hover:bg-[#39ff14]/5 transition-all disabled:opacity-40"
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── Token fields ── */}
            <div className="glass p-6 mb-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Token Details</h2>
                <button
                  onClick={() => aiGenerate()}
                  disabled={aiLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs hover:border-[#39ff14]/40 hover:bg-[#39ff14]/5 transition-all disabled:opacity-40"
                >
                  {aiLoading ? (
                    <><span className="w-3 h-3 border border-[#39ff14] border-t-transparent rounded-full animate-spin" /> AI filling...</>
                  ) : (
                    <><span>🤖</span> AI Fill (optional)</>
                  )}
                </button>
              </div>

              <div className="space-y-3">
                {/* Name + Symbol row */}
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 mb-1 block">Token Name *</label>
                    <input
                      type="text"
                      value={token.name}
                      onChange={(e) => updateField("name", e.target.value)}
                      placeholder="e.g. Doge but cooler"
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#39ff14]/50 transition placeholder-gray-600"
                    />
                  </div>
                  <div className="w-28">
                    <label className="text-xs text-gray-500 mb-1 block">Symbol</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                      <input
                        type="text"
                        value={token.symbol}
                        onChange={(e) => updateField("symbol", e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5))}
                        placeholder="COOL"
                        className="w-full bg-white/5 border border-white/10 rounded-lg pl-6 pr-3 py-2.5 text-sm font-mono focus:outline-none focus:border-[#39ff14]/50 transition placeholder-gray-600"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Description</label>
                  <textarea
                    value={token.description}
                    onChange={(e) => updateField("description", e.target.value)}
                    placeholder="What's this token about?"
                    rows={2}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-[#39ff14]/50 transition placeholder-gray-600"
                  />
                </div>

                {token.tagline || aiLoading ? (
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Tagline</label>
                    <input
                      type="text"
                      value={token.tagline}
                      onChange={(e) => updateField("tagline", e.target.value)}
                      placeholder="One punchy line"
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#39ff14]/50 transition placeholder-gray-600"
                    />
                  </div>
                ) : null}
              </div>
            </div>

            {/* ── Logo ── */}
            <div className="glass p-6 mb-4">
              <div className="flex items-start gap-4">
                {/* Preview */}
                <div className="shrink-0">
                  {isLoading ? (
                    <div className="w-20 h-20 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                      <div className="w-7 h-7 border-2 border-[#39ff14] border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : imagePreview ? (
                    <div className="relative group">
                      <img
                        src={imagePreview}
                        alt="Token logo"
                        className="w-20 h-20 rounded-2xl object-cover border border-white/10"
                        onError={() => { setImagePreview(null); setError("Image failed to load — try a different URL or upload"); }}
                      />
                      <button
                        onClick={clearImage}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-black/80 border border-white/20 rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >✕</button>
                    </div>
                  ) : (
                    <div className="w-20 h-20 rounded-2xl bg-white/5 border border-dashed border-white/20 flex items-center justify-center text-gray-600 text-2xl">
                      🖼️
                    </div>
                  )}
                </div>

                {/* Controls */}
                <div className="flex-1 min-w-0">
                  <label className="text-xs text-gray-500 mb-2 block">Token Logo <span className="text-gray-600">(optional)</span></label>

                  {/* Mode tabs */}
                  <div className="flex gap-1.5 mb-3">
                    {(["upload", "url"] as ImageMode[]).map((m) => (
                      <button
                        key={m}
                        onClick={() => setImageMode(m)}
                        className={`px-3 py-1 rounded-md text-xs font-medium border transition-all ${
                          imageMode === m
                            ? "border-[#39ff14]/50 bg-[#39ff14]/10 text-[#39ff14]"
                            : "border-white/10 bg-white/5 text-gray-400 hover:text-white"
                        }`}
                      >
                        {m === "upload" ? "📁 Upload" : "🔗 URL"}
                      </button>
                    ))}
                  </div>

                  {/* Upload mode */}
                  {imageMode === "upload" && (
                    <label className={`flex items-center gap-2 w-full py-2 px-3 rounded-lg border border-dashed cursor-pointer transition-all text-xs ${
                      uploadLoading
                        ? "border-white/10 opacity-50 cursor-not-allowed"
                        : "border-white/20 hover:border-[#39ff14]/40 hover:bg-[#39ff14]/5 text-gray-400 hover:text-white"
                    }`}>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/gif,image/webp"
                        className="hidden"
                        onChange={handleUpload}
                        disabled={uploadLoading}
                      />
                      {uploadLoading ? "Uploading..." : "📁 Click to upload (JPG, PNG, GIF, WEBP · max 5MB)"}
                    </label>
                  )}

                  {/* URL mode */}
                  {imageMode === "url" && (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={imageUrlInput}
                        onChange={(e) => setImageUrlInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") applyImageUrl(); }}
                        placeholder="https://example.com/logo.png"
                        className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-[#39ff14]/50 transition placeholder-gray-600"
                      />
                      <button
                        onClick={applyImageUrl}
                        disabled={!imageUrlInput.trim()}
                        className="px-3 py-1.5 rounded-lg bg-[#39ff14]/10 border border-[#39ff14]/30 text-[#39ff14] text-xs hover:bg-[#39ff14]/20 transition disabled:opacity-40"
                      >
                        Use
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── Fee Recipient ── */}
            <div className="glass p-6 mb-4">
              <div className="mb-3">
                <h3 className="text-sm font-semibold text-gray-300">Fee Recipient</h3>
                <p className="text-xs text-gray-500 mt-0.5">Creators earn <span className="text-[#39ff14] font-medium">40% of trading fees (via Clanker)</span> forever</p>
              </div>

              {/* Fee mode selector */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                {([
                  { mode: "thryx" as FeeRecipient, icon: "⚡", label: "THRYX Team", sub: "Default — supports the ecosystem" },
                  { mode: "wallet" as FeeRecipient, icon: "👛", label: "My Wallet", sub: "Fees go to your wallet" },
                  { mode: "twitter" as FeeRecipient, icon: "𝕏", label: "Twitter / X", sub: "Claim via your X account" },
                ]).map((opt) => (
                  <button
                    key={opt.mode}
                    onClick={() => setFeeMode(opt.mode)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      feeMode === opt.mode
                        ? "border-[#39ff14]/50 bg-[#39ff14]/5"
                        : "border-white/10 bg-white/5 hover:border-white/20"
                    }`}
                  >
                    <div className="text-lg mb-1">{opt.icon}</div>
                    <p className={`text-xs font-semibold ${feeMode === opt.mode ? "text-[#39ff14]" : "text-gray-300"}`}>{opt.label}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">{opt.sub}</p>
                  </button>
                ))}
              </div>

              {/* Wallet input (only when "My Wallet" selected) */}
              {feeMode === "wallet" && (
                <div className="space-y-2">
                  {wallet ? (
                    <div className="flex items-center gap-3 bg-white/5 rounded-lg p-3 border border-white/10">
                      <span className="text-green-400">✓</span>
                      <p className="text-sm font-mono truncate flex-1">{wallet}</p>
                      <button onClick={disconnect} className="text-xs text-gray-500 hover:text-white transition">Change</button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={manualWallet}
                        onChange={(e) => setManualWallet(e.target.value.trim())}
                        placeholder="0x... paste your wallet"
                        className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#39ff14]/50 transition placeholder-gray-600"
                      />
                      <button onClick={connect} className="btn-secondary text-xs py-2 px-3 whitespace-nowrap">Connect</button>
                    </div>
                  )}
                  {manualWallet && !wallet && !/^0x[a-fA-F0-9]{40}$/.test(manualWallet) && (
                    <p className="text-xs text-red-400">Must be a valid 0x address</p>
                  )}
                </div>
              )}

              {/* Twitter input (only when "Twitter / X" selected) */}
              {feeMode === "twitter" && (
                <div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">@</span>
                    <input
                      type="text"
                      value={twitterHandle}
                      onChange={(e) => setTwitterHandle(e.target.value.replace(/^@/, ""))}
                      placeholder="yourhandle"
                      className="w-full bg-white/5 border border-white/10 rounded-lg pl-7 pr-3 py-2 text-sm font-mono focus:outline-none focus:border-[#39ff14]/50 transition placeholder-gray-600"
                    />
                  </div>
                  <p className="text-xs text-gray-600 mt-1.5">Claim fees at <a href="https://bankr.bot" target="_blank" className="text-[#39ff14] hover:underline">bankr.bot</a> using your X account</p>
                </div>
              )}

              {/* Treasury info */}
              {feeMode === "thryx" && (
                <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                  <p className="text-xs text-gray-400">Fees will go to the THRYX team Bankr wallet and be used for development, staking rewards, and burns.</p>
                </div>
              )}
            </div>

            {/* ── Advanced (optional) ── */}
            <div className="mb-4">
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl border border-white/10 bg-white/5 text-xs text-gray-400 hover:text-white transition-all"
              >
                <span>⚙️ Advanced options <span className="text-gray-600">(website, tweet)</span></span>
                <span className={`transition-transform ${showAdvanced ? "rotate-180" : ""}`}>▾</span>
              </button>

              {showAdvanced && (
                <div className="glass p-4 mt-1 space-y-3 rounded-xl border border-white/10">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">🌐 Project Website <span className="text-gray-600">(optional — shows on Bankr launch page)</span></label>
                    <input
                      type="text"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      placeholder="https://yoursite.com"
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-[#39ff14]/50 transition placeholder-gray-600"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">🐦 Associated Tweet URL <span className="text-gray-600">(optional — adds social proof)</span></label>
                    <input
                      type="text"
                      value={tweet}
                      onChange={(e) => setTweet(e.target.value)}
                      placeholder="https://x.com/you/status/..."
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-[#39ff14]/50 transition placeholder-gray-600"
                    />
                  </div>
                </div>
              )}
            </div>

            {error && <div className="text-red-400 text-sm glass p-3 rounded-xl mb-4">{error}</div>}

            {/* ── Deploy ── */}
            <button
              onClick={deploy}
              disabled={deploying || !canDeploy}
              className="btn-primary w-full text-base py-4"
            >
              {deploying ? (
                <span className="flex items-center justify-center gap-3">
                  <span className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  {deployStatus || "Deploying..."}
                </span>
              ) : "🚀 Deploy on Base — Free"}
            </button>
            <p className="text-xs text-gray-600 text-center mt-2">Gas sponsored by Bankr Club · No cost to you</p>

            {/* ── How it works (collapsed below fold) ── */}
            <div className="mt-10 pt-8 border-t border-white/5">
              <p className="text-xs text-gray-600 text-center mb-4 uppercase tracking-widest">How it works</p>
              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  { icon: "✏️", label: "Fill in details", sub: "Name, symbol, description — or let AI do it" },
                  { icon: "🎨", label: "Add a logo", sub: "Upload your image or paste a URL" },
                  { icon: "🚀", label: "Deploy free", sub: "Live on Base. Creator earns 40% of swap fees via Clanker." },
                ].map((s) => (
                  <div key={s.label} className="glass p-3">
                    <div className="text-2xl mb-1">{s.icon}</div>
                    <p className="text-xs font-medium">{s.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{s.sub}</p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ══════════ SUCCESS STEP ══════════ */}
        {step === "success" && deployResult && (
          <>
            <div className="text-center mb-8">
              <div className="text-6xl mb-3">🎉</div>
              <h1 className="text-3xl font-bold glow-text mb-1">Token Launched!</h1>
              <p className="text-gray-400">{token.name} {token.symbol ? `($${token.symbol})` : ""} is live on Base</p>
            </div>

            <div className="glass p-6 mb-6">
              <div className="flex items-center gap-4 mb-5">
                {imagePreview && (
                  <img src={imagePreview} alt={token.name} className="w-14 h-14 rounded-xl object-cover border border-white/10" />
                )}
                <div>
                  <h2 className="text-xl font-bold">{token.name}</h2>
                  {token.symbol && <p className="font-mono text-sm neon-purple">${token.symbol}</p>}
                </div>
              </div>

              {deployResult.contractAddress && (
                <div className="bg-white/5 rounded-xl p-4 mb-4 border border-[#39ff14]/20">
                  <p className="text-xs text-gray-500 mb-1">Contract Address</p>
                  <p className="font-mono text-sm break-all text-[#39ff14]">{deployResult.contractAddress}</p>
                </div>
              )}

              <div className="bg-white/5 rounded-xl p-4 mb-4 border border-purple-500/20">
                <p className="text-xs text-gray-500 mb-1">💰 Fee Recipient</p>
                {deployResult.feeRecipient.toLowerCase() === THRYX_BANKR_WALLET.toLowerCase() ? (
                  <>
                    <p className="text-sm font-semibold text-purple-400">⚡ THRYX Team</p>
                    <p className="text-xs text-gray-600 mt-1">Fees support ecosystem development, staking rewards, and burns</p>
                  </>
                ) : (
                  <>
                    <p className="font-mono text-sm break-all text-purple-400">{deployResult.feeRecipient}</p>
                    <p className="text-xs text-gray-600 mt-1">40% of swap fees via Clanker/Bankr — forever</p>
                  </>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                {deployResult.dopplerUrl && (
                  <a href={deployResult.dopplerUrl} target="_blank" rel="noopener"
                    className="flex items-center gap-2 bg-white/5 rounded-xl p-3 border border-white/10 hover:border-[#39ff14]/30 transition">
                    <span>📊</span>
                    <div><p className="text-xs font-semibold">Trade</p><p className="text-xs text-gray-500">Doppler</p></div>
                  </a>
                )}
                {deployResult.basescanUrl && (
                  <a href={deployResult.basescanUrl} target="_blank" rel="noopener"
                    className="flex items-center gap-2 bg-white/5 rounded-xl p-3 border border-white/10 hover:border-blue-500/30 transition">
                    <span>🔍</span>
                    <div><p className="text-xs font-semibold">Contract</p><p className="text-xs text-gray-500">BaseScan</p></div>
                  </a>
                )}
                {deployResult.bankrUrl && (
                  <a href={deployResult.bankrUrl} target="_blank" rel="noopener"
                    className="flex items-center gap-2 bg-white/5 rounded-xl p-3 border border-white/10 hover:border-purple-500/30 transition">
                    <span>🏦</span>
                    <div><p className="text-xs font-semibold">Manage</p><p className="text-xs text-gray-500">Bankr</p></div>
                  </a>
                )}
                <a href="https://bankr.bot" target="_blank" rel="noopener"
                  className="flex items-center gap-2 bg-white/5 rounded-xl p-3 border border-white/10 hover:border-yellow-500/30 transition">
                  <span>💰</span>
                  <div><p className="text-xs font-semibold">Claim Fees</p><p className="text-xs text-gray-500">bankr.bot</p></div>
                </a>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 justify-center">
              <button className="btn-primary" onClick={shareOnTwitter}>🐦 Share on Twitter</button>
              <button className="btn-secondary" onClick={reset}>🔄 Launch Another</button>
            </div>
          </>
        )}
      </main>

      {showPicker && (
        <WalletPickerModal wallets={walletOptions} onSelect={connectWithProvider} onClose={() => setShowPicker(false)} />
      )}
    </div>
  );
}
