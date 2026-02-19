"use client";
import { useState, useCallback } from "react";
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

type Step = "idea" | "review" | "deploy" | "success";

const themes = [
  { label: "🐕 Dog Coin", idea: "a funny dog-themed meme coin" },
  { label: "🐱 Cat Token", idea: "a mysterious cat overlord crypto" },
  { label: "🌙 Moon Shot", idea: "a moon-themed rocket fuel token" },
  { label: "🍔 Food Coin", idea: "a delicious fast food meme token" },
  { label: "🤖 AI Agent", idea: "an AI agent that trades for you" },
  { label: "💀 Degen Play", idea: "the most degen token on Base" },
  { label: "🎮 Gaming", idea: "a retro gaming meme token" },
  { label: "👽 Alien", idea: "an alien invasion crypto meme" },
];

const FREE_GEN_LIMIT = 5;

export default function Home() {
  const [step, setStep] = useState<Step>("idea");
  const [idea, setIdea] = useState("");

  // Token data (editable)
  const [tokenData, setTokenData] = useState<TokenData | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imagePublicUrl, setImagePublicUrl] = useState<string | null>(null);

  // Loading states
  const [genLoading, setGenLoading] = useState(false);
  const [imgLoading, setImgLoading] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deployStatus, setDeployStatus] = useState("");

  // Results and errors
  const [error, setError] = useState("");
  const [deployResult, setDeployResult] = useState<DeployResult | null>(null);

  // Image source mode: "ai" | "upload" | "url"
  const [imageMode, setImageMode] = useState<"ai" | "upload" | "url">("ai");
  const [imageUrlInput, setImageUrlInput] = useState("");
  const [uploadLoading, setUploadLoading] = useState(false);

  // Wallet
  const { wallet, pro, connect, disconnect, showPicker, setShowPicker, walletOptions, connectWithProvider } = useThryxAuth();
  const [manualWallet, setManualWallet] = useState("");

  const effectiveWallet = wallet || manualWallet;

  // Handle file upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadLoading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload-image", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setImageBase64(data.base64);
      setImagePublicUrl(data.publicUrl);
      if (data.warning) console.warn(data.warning);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadLoading(false);
      e.target.value = "";
    }
  };

  // Handle manual URL input
  const applyImageUrl = () => {
    if (!imageUrlInput.trim()) return;
    setImageBase64(imageUrlInput.trim());
    setImagePublicUrl(imageUrlInput.trim());
  };

  const updateField = useCallback((field: keyof TokenData, value: string) => {
    setTokenData((prev) => prev ? { ...prev, [field]: value } : prev);
  }, []);

  // Step 1: Generate token concept
  const generate = async (inputIdea?: string) => {
    const concept = inputIdea || idea;
    if (!concept.trim()) return;

    if (!pro) {
      const usage = getDailyUsage("mememint_gens");
      if (usage >= FREE_GEN_LIMIT) {
        setError(`Daily limit reached (${FREE_GEN_LIMIT}/day). Connect as Pro for unlimited!`);
        return;
      }
    }

    setGenLoading(true);
    setError("");
    setTokenData(null);
    setImageBase64(null);
    setImagePublicUrl(null);
    setDeployResult(null);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea: concept }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Generation failed");
      }
      const data = await res.json();
      setTokenData(data);
      if (!pro) incrementDailyUsage("mememint_gens");
      setStep("review");

      // Auto-generate image
      generateImage(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setGenLoading(false);
    }
  };

  // Step 2: Generate image
  const generateImage = async (data?: TokenData) => {
    const token = data || tokenData;
    if (!token) return;

    setImgLoading(true);
    setImageBase64(null);
    setImagePublicUrl(null);

    try {
      const res = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: token.name,
          symbol: token.symbol,
          description: token.description,
        }),
      });

      if (res.status === 503) {
        // Model loading, retry once after delay
        await new Promise((r) => setTimeout(r, 15000));
        const retry = await fetch("/api/generate-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: token.name,
            symbol: token.symbol,
            description: token.description,
          }),
        });
        if (!retry.ok) throw new Error("Image model still loading. Try regenerating in a moment.");
        const retryData = await retry.json();
        setImageBase64(retryData.base64);
        setImagePublicUrl(retryData.publicUrl);
        return;
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Image generation failed");
      }

      const imgData = await res.json();
      setImageBase64(imgData.base64);
      setImagePublicUrl(imgData.publicUrl);
    } catch (e) {
      console.error("Image gen error:", e);
      // Non-blocking — user can still deploy without image
    } finally {
      setImgLoading(false);
    }
  };

  // Step 3: Deploy token (async: submit → poll status)
  const deployToken = async () => {
    if (!tokenData) return;
    if (!effectiveWallet || !/^0x[a-fA-F0-9]{40}$/.test(effectiveWallet)) {
      setError("Please enter or connect a valid wallet address (0x...)");
      return;
    }

    setDeploying(true);
    setError("");
    setDeployStatus("Submitting to Bankr...");

    try {
      // Step 1: Submit deploy job
      const res = await fetch("/api/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: tokenData.name,
          symbol: tokenData.symbol,
          description: tokenData.description,
          imageUrl: imagePublicUrl || undefined,
          walletAddress: effectiveWallet,
        }),
      });

      const submitData = await res.json();
      if (!res.ok) throw new Error(submitData.error || "Deploy failed");

      if (!submitData.jobId) throw new Error("No job ID returned");

      // Step 2: Poll for completion
      setDeployStatus("Deploying on Base... (this takes ~60s)");
      const jobId = submitData.jobId;
      const params = new URLSearchParams({
        jobId,
        wallet: effectiveWallet,
        name: tokenData.name,
        symbol: tokenData.symbol || "",
      });

      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        
        try {
          const pollRes = await fetch(`/api/deploy/status?${params}`);
          const pollData = await pollRes.json();

          if (pollData.status === "completed") {
            setDeployResult({
              contractAddress: pollData.contractAddress,
              dopplerUrl: pollData.dopplerUrl,
              basescanUrl: pollData.basescanUrl,
              bankrUrl: pollData.bankrUrl,
              feeRecipient: pollData.feeRecipient || effectiveWallet,
            });
            setStep("success");
            setDeployStatus("");
            return;
          }

          if (pollData.status === "failed") {
            throw new Error(pollData.error || "Deploy failed on-chain");
          }

          // Still pending
          const elapsed = (i + 1) * 3;
          setDeployStatus(`Deploying on Base... (${elapsed}s)`);
        } catch (pollErr) {
          if (pollErr instanceof Error && pollErr.message.includes("failed")) throw pollErr;
          // Network hiccup, keep polling
        }
      }

      throw new Error("Deploy timed out. Your token may still be deploying — check back in a minute.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Deploy failed");
      setDeployStatus("");
    } finally {
      setDeploying(false);
    }
  };

  const reset = () => {
    setStep("idea");
    setIdea("");
    setTokenData(null);
    setImageBase64(null);
    setImagePublicUrl(null);
    setDeployResult(null);
    setError("");
    setDeployStatus("");
  };

  const shareOnTwitter = () => {
    if (!tokenData) return;
    const ca = deployResult?.contractAddress ? `\nCA: ${deployResult.contractAddress}` : "";
    const text = `I just launched $${tokenData.symbol} (${tokenData.name}) on Base for FREE! 🚀\n\n"${tokenData.tagline}"\n\nI earn 57% of all trading fees forever 💰${ca}\n\nLaunch yours 👉 mint.thryx.mom\n\nPowered by @THRYXAGI x @bankaborhood`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank");
  };

  const gensUsed = getDailyUsage("mememint_gens");

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

      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* ========== STEP: IDEA ========== */}
        {step === "idea" && (
          <>
            {/* Hero */}
            <div className="text-center mb-10">
              <h1 className="text-4xl md:text-5xl font-bold mb-3 glow-text">Launch a Token ⚡</h1>
              <p className="text-lg text-gray-400 mb-1">Generate & deploy meme tokens on Base — for free</p>
              <p className="text-sm text-[#39ff14]">You earn 57% of all trading fees forever</p>
              <p className="text-xs text-gray-500 mt-2">
                {pro ? "⚡ Pro — Unlimited" : `${FREE_GEN_LIMIT - gensUsed}/${FREE_GEN_LIMIT} free generations left today`}
              </p>
            </div>

            {/* Quick Themes */}
            <div className="mb-6">
              <p className="text-xs text-gray-500 text-center mb-3">Quick start with a theme:</p>
              <div className="flex flex-wrap justify-center gap-2">
                {themes.map((t) => (
                  <button
                    key={t.label}
                    onClick={() => { setIdea(t.idea); generate(t.idea); }}
                    className="px-3 py-1.5 text-sm rounded-lg bg-white/5 border border-white/10 hover:border-[#39ff14]/40 hover:bg-[#39ff14]/5 transition-all"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Input */}
            <div className="glass p-6 animate-glow">
              <textarea
                className="w-full bg-transparent border border-white/20 rounded-xl p-4 text-lg resize-none focus:outline-none focus:border-[#39ff14]/50 placeholder-gray-600"
                rows={3}
                placeholder="Describe your meme token idea... (e.g. 'a cat that trades crypto while sleeping')"
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); generate(); } }}
              />
              <div className="mt-4 flex justify-center">
                <button className="btn-primary" onClick={() => generate()} disabled={genLoading || !idea.trim()}>
                  {genLoading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                      Generating...
                    </span>
                  ) : "⚡ Generate Token"}
                </button>
              </div>
            </div>

            {error && <div className="text-red-400 text-center mt-4 glass p-4">{error}</div>}

            {/* How it works */}
            <div className="mt-12">
              <h3 className="text-center text-lg font-semibold text-gray-300 mb-6">How It Works</h3>
              <div className="grid md:grid-cols-3 gap-4">
                <div className="glass p-5 text-center">
                  <div className="text-3xl mb-2">💡</div>
                  <h4 className="font-bold mb-1">1. Describe</h4>
                  <p className="text-sm text-gray-400">Enter your meme concept. AI generates name, symbol, and logo.</p>
                </div>
                <div className="glass p-5 text-center">
                  <div className="text-3xl mb-2">🎨</div>
                  <h4 className="font-bold mb-1">2. Customize</h4>
                  <p className="text-sm text-gray-400">Edit any field, regenerate the logo, make it yours.</p>
                </div>
                <div className="glass p-5 text-center">
                  <div className="text-3xl mb-2">🚀</div>
                  <h4 className="font-bold mb-1">3. Deploy Free</h4>
                  <p className="text-sm text-gray-400">Launch on Base for free. Earn 57% of swap fees forever.</p>
                </div>
              </div>
            </div>

            {/* Fee explainer */}
            <div className="mt-8 glass p-5 border border-[#39ff14]/20">
              <div className="text-center">
                <h4 className="font-bold text-[#39ff14] mb-2">💰 Earn Forever</h4>
                <p className="text-sm text-gray-400 mb-3">
                  Every token deployed through MemeMint earns <strong className="text-white">1.2% on every swap</strong>. 
                  As the creator, <strong className="text-[#39ff14]">you receive 57% of those fees</strong> directly to your wallet — forever.
                </p>
                <p className="text-xs text-gray-500">
                  Powered by <a href="https://bankr.bot" target="_blank" rel="noopener" className="text-purple-400 hover:underline">Bankr</a> · 
                  Gas sponsored by Bankr Club · Free (100 deploys/day limit)
                </p>
              </div>
            </div>
          </>
        )}

        {/* ========== STEP: REVIEW ========== */}
        {step === "review" && tokenData && (
          <>
            <div className="flex items-center justify-between mb-6">
              <button onClick={reset} className="text-sm text-gray-500 hover:text-white transition">← Back</button>
              <h2 className="text-lg font-semibold text-gray-300">Review & Deploy</h2>
              <div className="w-12" />
            </div>

            <div className="glass p-6 mb-6">
              {/* Token Preview Header */}
              <div className="flex items-start gap-5 mb-6">
                {/* Image preview */}
                <div className="shrink-0">
                  {(imgLoading || uploadLoading) ? (
                    <div className="w-24 h-24 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                      <div className="w-8 h-8 border-2 border-[#39ff14] border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : imageBase64 ? (
                    <div className="relative group">
                      <img src={imageBase64} alt={tokenData.name} className="w-24 h-24 rounded-2xl object-cover border border-white/10" />
                      <button
                        onClick={() => { setImageBase64(null); setImagePublicUrl(null); }}
                        className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl flex items-center justify-center text-xs font-medium"
                      >
                        ✕ Remove
                      </button>
                    </div>
                  ) : (
                    <div className="w-24 h-24 rounded-2xl bg-white/5 border border-dashed border-white/20 flex flex-col items-center justify-center text-xs text-gray-500">
                      <span className="text-2xl mb-1">🖼️</span>
                      No logo
                    </div>
                  )}
                </div>

                {/* Name & Symbol */}
                <div className="flex-1 min-w-0">
                  <input
                    type="text"
                    value={tokenData.name}
                    onChange={(e) => updateField("name", e.target.value)}
                    className="w-full bg-transparent text-2xl font-bold focus:outline-none border-b border-transparent hover:border-white/20 focus:border-[#39ff14]/50 transition pb-1 mb-1"
                    placeholder="Token Name"
                  />
                  <div className="flex items-center gap-1">
                    <span className="text-gray-500">$</span>
                    <input
                      type="text"
                      value={tokenData.symbol}
                      onChange={(e) => updateField("symbol", e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5))}
                      className="bg-transparent text-lg font-mono neon-purple focus:outline-none border-b border-transparent hover:border-white/20 focus:border-[#39ff14]/50 transition pb-1 w-24"
                      placeholder="SYM"
                    />
                  </div>
                </div>
              </div>

              {/* Image Source Selector */}
              <div className="mb-5">
                <label className="text-xs text-gray-500 mb-2 block">Token Logo</label>
                <div className="flex gap-2 mb-3">
                  {(["upload", "ai", "url"] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setImageMode(mode)}
                      className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium border transition-all ${
                        imageMode === mode
                          ? "border-[#39ff14]/60 bg-[#39ff14]/10 text-[#39ff14]"
                          : "border-white/10 bg-white/5 text-gray-400 hover:border-white/20"
                      }`}
                    >
                      {mode === "upload" ? "📁 Upload" : mode === "ai" ? "🤖 AI Generate" : "🔗 Paste URL"}
                    </button>
                  ))}
                </div>

                {/* Upload */}
                {imageMode === "upload" && (
                  <label className={`flex items-center justify-center gap-3 w-full p-4 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
                    uploadLoading ? "border-white/10 opacity-50" : "border-white/20 hover:border-[#39ff14]/40 hover:bg-[#39ff14]/5"
                  }`}>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      className="hidden"
                      onChange={handleImageUpload}
                      disabled={uploadLoading}
                    />
                    {uploadLoading ? (
                      <span className="text-sm text-gray-400">Uploading...</span>
                    ) : (
                      <>
                        <span className="text-2xl">📁</span>
                        <div>
                          <p className="text-sm font-medium">Click to upload your logo</p>
                          <p className="text-xs text-gray-500">JPG, PNG, GIF, WEBP — max 5MB</p>
                        </div>
                      </>
                    )}
                  </label>
                )}

                {/* AI Generate */}
                {imageMode === "ai" && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => generateImage()}
                      disabled={imgLoading}
                      className="flex-1 py-2.5 px-4 rounded-xl bg-white/5 border border-white/10 hover:border-[#39ff14]/40 text-sm transition-all disabled:opacity-50"
                    >
                      {imgLoading ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="w-4 h-4 border-2 border-[#39ff14] border-t-transparent rounded-full animate-spin" />
                          Generating...
                        </span>
                      ) : imageBase64 ? "🔄 Regenerate Logo" : "🤖 Generate Logo with AI"}
                    </button>
                  </div>
                )}

                {/* URL paste */}
                {imageMode === "url" && (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={imageUrlInput}
                      onChange={(e) => setImageUrlInput(e.target.value)}
                      placeholder="https://example.com/logo.png"
                      className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#39ff14]/50 transition placeholder-gray-600"
                    />
                    <button
                      onClick={applyImageUrl}
                      disabled={!imageUrlInput.trim()}
                      className="px-4 py-2 rounded-lg bg-[#39ff14]/10 border border-[#39ff14]/30 text-[#39ff14] text-sm hover:bg-[#39ff14]/20 transition disabled:opacity-40"
                    >
                      Use
                    </button>
                  </div>
                )}
              </div>

              {/* Editable Fields */}
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Tagline</label>
                  <input
                    type="text"
                    value={tokenData.tagline}
                    onChange={(e) => updateField("tagline", e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#39ff14]/50 transition"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Description</label>
                  <textarea
                    value={tokenData.description}
                    onChange={(e) => updateField("description", e.target.value)}
                    rows={2}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-[#39ff14]/50 transition"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Twitter Bio</label>
                  <input
                    type="text"
                    value={tokenData.twitterBio}
                    onChange={(e) => updateField("twitterBio", e.target.value.slice(0, 160))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#39ff14]/50 transition"
                  />
                  <p className="text-xs text-gray-600 mt-1 text-right">{tokenData.twitterBio.length}/160</p>
                </div>
              </div>

              {/* Regenerate text only */}
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => generate(idea)}
                  className="btn-secondary text-xs py-2 px-3"
                  disabled={genLoading}
                >
                  {genLoading ? "..." : "🔄 Regenerate Text"}
                </button>
              </div>
            </div>

            {/* Wallet Section */}
            <div className="glass p-6 mb-6">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <span>👛</span> Fee Recipient Wallet
              </h3>
              <p className="text-xs text-gray-400 mb-3">
                This wallet will earn <strong className="text-[#39ff14]">57% of all trading fees</strong> from your token forever.
              </p>

              {wallet ? (
                <div className="flex items-center gap-3 bg-white/5 rounded-lg p-3 border border-white/10">
                  <span className="text-green-400 text-lg">✓</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono truncate">{wallet}</p>
                    <p className="text-xs text-gray-500">Connected wallet — fees go here</p>
                  </div>
                  <button onClick={disconnect} className="text-xs text-gray-500 hover:text-white">Change</button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={manualWallet}
                      onChange={(e) => setManualWallet(e.target.value.trim())}
                      placeholder="0x... your wallet address"
                      className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#39ff14]/50 transition placeholder-gray-600"
                    />
                    <button onClick={connect} className="btn-secondary text-xs py-2 px-3 whitespace-nowrap">
                      Or Connect
                    </button>
                  </div>
                  {manualWallet && !/^0x[a-fA-F0-9]{40}$/.test(manualWallet) && (
                    <p className="text-xs text-red-400">Enter a valid Ethereum address (0x + 40 hex characters)</p>
                  )}
                </div>
              )}
            </div>

            {error && <div className="text-red-400 text-center mb-4 glass p-4 text-sm">{error}</div>}

            {/* Deploy Button */}
            <div className="text-center">
              <button
                className="btn-primary text-lg px-10 py-4"
                onClick={deployToken}
                disabled={deploying || !effectiveWallet || !/^0x[a-fA-F0-9]{40}$/.test(effectiveWallet)}
              >
                {deploying ? (
                  <span className="flex items-center gap-3">
                    <span className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    {deployStatus || "Deploying..."}
                  </span>
                ) : "🚀 Deploy on Base — Free"}
              </button>
              <p className="text-xs text-gray-600 mt-2">Gas sponsored by Bankr Club · No cost to you</p>
            </div>
          </>
        )}

        {/* ========== STEP: SUCCESS ========== */}
        {step === "success" && tokenData && deployResult && (
          <>
            <div className="text-center mb-8">
              <div className="text-6xl mb-4">🎉</div>
              <h1 className="text-3xl font-bold glow-text mb-2">Token Launched!</h1>
              <p className="text-gray-400">{tokenData.name} (${tokenData.symbol}) is live on Base</p>
            </div>

            <div className="glass p-6 mb-6">
              {/* Token info */}
              <div className="flex items-center gap-4 mb-6">
                {imageBase64 && (
                  <img src={imageBase64} alt={tokenData.name} className="w-16 h-16 rounded-xl object-cover border border-white/10" />
                )}
                <div>
                  <h2 className="text-2xl font-bold">{tokenData.name}</h2>
                  <p className="neon-purple font-mono">${tokenData.symbol}</p>
                </div>
              </div>

              {/* Contract details */}
              {deployResult.contractAddress && (
                <div className="bg-white/5 rounded-xl p-4 mb-4 border border-[#39ff14]/20">
                  <p className="text-xs text-gray-500 mb-1">Contract Address</p>
                  <p className="font-mono text-sm break-all text-[#39ff14]">{deployResult.contractAddress}</p>
                </div>
              )}

              {/* Fee recipient */}
              <div className="bg-white/5 rounded-xl p-4 mb-4 border border-purple-500/20">
                <p className="text-xs text-gray-500 mb-1">💰 Fee Recipient (You)</p>
                <p className="font-mono text-sm break-all text-purple-400">{deployResult.feeRecipient}</p>
                <p className="text-xs text-gray-500 mt-1">You earn 57% of 1.2% on every swap — forever</p>
              </div>

              {/* Links */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                {deployResult.dopplerUrl && (
                  <a href={deployResult.dopplerUrl} target="_blank" rel="noopener"
                    className="flex items-center gap-2 bg-white/5 rounded-xl p-3 border border-white/10 hover:border-[#39ff14]/30 transition">
                    <span className="text-xl">📊</span>
                    <div>
                      <p className="text-sm font-semibold">Trade on Doppler</p>
                      <p className="text-xs text-gray-500">Buy, sell, provide liquidity</p>
                    </div>
                  </a>
                )}
                {deployResult.basescanUrl && (
                  <a href={deployResult.basescanUrl} target="_blank" rel="noopener"
                    className="flex items-center gap-2 bg-white/5 rounded-xl p-3 border border-white/10 hover:border-blue-500/30 transition">
                    <span className="text-xl">🔍</span>
                    <div>
                      <p className="text-sm font-semibold">View on BaseScan</p>
                      <p className="text-xs text-gray-500">Verify contract & txns</p>
                    </div>
                  </a>
                )}
                {deployResult.bankrUrl && (
                  <a href={deployResult.bankrUrl} target="_blank" rel="noopener"
                    className="flex items-center gap-2 bg-white/5 rounded-xl p-3 border border-white/10 hover:border-purple-500/30 transition">
                    <span className="text-xl">🏦</span>
                    <div>
                      <p className="text-sm font-semibold">Bankr Page</p>
                      <p className="text-xs text-gray-500">Manage & claim fees</p>
                    </div>
                  </a>
                )}
                <a href="https://bankr.bot" target="_blank" rel="noopener"
                  className="flex items-center gap-2 bg-white/5 rounded-xl p-3 border border-white/10 hover:border-yellow-500/30 transition">
                  <span className="text-xl">💰</span>
                  <div>
                    <p className="text-sm font-semibold">Claim Fees</p>
                    <p className="text-xs text-gray-500">Learn how to claim your earnings</p>
                  </div>
                </a>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-3 justify-center">
              <button className="btn-primary" onClick={shareOnTwitter}>🐦 Share on Twitter</button>
              <button className="btn-secondary" onClick={reset}>🔄 Launch Another Token</button>
              <a href="https://mysocial.mom/bulletins" target="_blank" rel="noopener" className="btn-secondary">
                📣 Share on MySocial
              </a>
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
