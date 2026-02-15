"use client";
import { useState, useEffect, useCallback } from "react";
import { getStoredAuth, clearStoredAuth, checkSubscription, isPro, isOwnerWallet, startWalletDiscovery, getWalletProvider, DiscoveredWallet } from "@/lib/thryx-auth";

export function useThryxAuth() {
  const [wallet, setWallet] = useState<string | null>(null);
  const [pro, setPro] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [walletOptions, setWalletOptions] = useState<DiscoveredWallet[]>([]);

  useEffect(() => { startWalletDiscovery(); }, []);

  const checkStatus = useCallback(async (token: string, addr?: string | null) => {
    const status = await checkSubscription(token);
    if (status.expired) { setWallet(null); setPro(false); return; }
    setPro(isPro(status, addr));
  }, []);

  useEffect(() => {
    const auth = getStoredAuth();
    if (auth) {
      setWallet(auth.wallet);
      checkStatus(auth.token, auth.wallet).finally(() => setLoading(false));
    } else { setLoading(false); }
  }, [checkStatus]);

  const connectWithProvider = useCallback(async (prov: any) => {
    try {
      const accounts = await prov.request({ method: "eth_requestAccounts" });
      const addr = accounts[0];
      if (!addr) return;
      setShowPicker(false);
      // Connect immediately — ONE popup only, no sign-in challenge
      setWallet(addr);
      if (isOwnerWallet(addr)) setPro(true);
      // Check stored token for Pro status (no new sign-in needed)
      const stored = getStoredAuth();
      if (stored && stored.wallet.toLowerCase() === addr.toLowerCase()) {
        await checkStatus(stored.token, addr);
      }
    } catch (e) { console.error("Wallet connect error:", e); }
  }, [checkStatus]);

  const connect = useCallback(async () => {
    const { wallets } = getWalletProvider();
    if (wallets.length >= 1) {
      setWalletOptions(wallets);
      setShowPicker(true);
      return;
    }
    // No wallets at all — show picker with install links
    setWalletOptions([]);
    setShowPicker(true);
  }, []);

  const disconnect = () => { clearStoredAuth(); setWallet(null); setPro(false); setShowPicker(false); };

  return { wallet, pro, loading, connect, disconnect, showPicker, setShowPicker, walletOptions, connectWithProvider };
}

export default function ConnectWallet({ wallet, pro, connect, disconnect }: {
  wallet: string | null; pro: boolean; connect: () => void; disconnect: () => void;
}) {
  if (wallet) {
    return (
      <div className="flex items-center gap-2">
        {pro && <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full border border-yellow-500/30">⚡ Pro</span>}
        <button onClick={disconnect} className="text-xs text-gray-400 hover:text-white bg-white/5 px-3 py-1.5 rounded-lg border border-white/10 transition">
          {wallet.slice(0, 6)}...{wallet.slice(-4)}
        </button>
      </div>
    );
  }
  return (
    <button onClick={connect} className="text-xs bg-purple-600 hover:bg-purple-500 px-3 py-1.5 rounded-lg font-semibold transition text-white">
      Connect Wallet
    </button>
  );
}

export function WalletPickerModal({ wallets, onSelect, onClose }: {
  wallets: DiscoveredWallet[]; onSelect: (provider: any) => void; onClose: () => void;
}) {
  const isMobile = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const currentUrl = typeof window !== 'undefined' ? window.location.href : 'https://thryx.mom';
  const hostPath = typeof window !== 'undefined' ? window.location.host + window.location.pathname : 'thryx.mom';
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#12121a] border border-gray-800 rounded-2xl p-6 mx-4 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-white text-lg font-bold mb-1">Connect Wallet</h3>
        <p className="text-gray-500 text-sm mb-4">{wallets.length > 0 ? "Choose your wallet" : "Install a wallet to get started"}</p>
        <div className="space-y-2">
          {wallets.map(w => (
            <button key={w.uuid} onClick={() => onSelect(w.provider)}
              className="w-full flex items-center gap-3 p-3 rounded-xl bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 transition">
              {w.icon ? <img src={w.icon} alt={w.name} className="w-8 h-8 rounded-lg" /> : <div className="w-8 h-8 rounded-lg bg-gray-700 flex items-center justify-center text-sm">🔗</div>}
              <span className="text-white font-medium">{w.name}</span>
            </button>
          ))}
          {wallets.length === 0 && (
            <>
              <a href={isMobile ? `https://metamask.app.link/dapp/${hostPath}` : "https://metamask.io/download/"} target="_blank" rel="noopener"
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 transition">
                <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center text-lg">🦊</div>
                <span className="text-white font-medium">MetaMask</span>
              </a>
              <a href={isMobile ? `https://rnbwapp.com/dapp?url=${encodeURIComponent(currentUrl)}` : "https://rainbow.me/download"} target="_blank" rel="noopener"
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 transition">
                <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-lg">🌈</div>
                <span className="text-white font-medium">Rainbow</span>
              </a>
              <a href={isMobile ? `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(currentUrl)}` : "https://www.coinbase.com/wallet/downloads"} target="_blank" rel="noopener"
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 transition">
                <div className="w-8 h-8 rounded-lg bg-blue-600/20 flex items-center justify-center text-lg">🔵</div>
                <span className="text-white font-medium">Coinbase Wallet</span>
              </a>
            </>
          )}
        </div>
        <button onClick={onClose} className="w-full mt-4 py-2.5 text-gray-500 hover:text-white text-sm transition">Cancel</button>
      </div>
    </div>
  );
}

export function ProBanner({ pro, feature }: { pro: boolean; feature?: string }) {
  if (pro) return (
    <div className="mb-4 p-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 text-center text-sm">
      <span className="text-yellow-400 font-semibold">⚡ Pro Active</span>
      {feature && <span className="text-gray-400 ml-2">— {feature}</span>}
    </div>
  );
  return (
    <div className="mb-4 p-3 rounded-lg border border-gray-700/50 bg-gray-900/30 text-center text-sm">
      <span className="text-gray-400">Free Tier</span>
      <a href="https://thryx.mom/subscribe" target="_blank" rel="noopener" className="text-cyan-400 hover:text-cyan-300 ml-2">Upgrade →</a>
    </div>
  );
}

export function AccountSection({ wallet, pro }: { wallet: string | null; pro: boolean }) {
  if (!wallet) return null;
  return (
    <div className="glass p-6 text-center">
      <h3 className="text-lg font-bold mb-3 gradient-text">My Account</h3>
      <p className="text-sm text-gray-400 font-mono mb-3">{wallet}</p>
      <div className="inline-block px-4 py-2 rounded-lg border mb-4" style={{
        borderColor: pro ? 'rgba(234,179,8,0.3)' : 'rgba(255,255,255,0.1)',
        background: pro ? 'rgba(234,179,8,0.1)' : 'rgba(255,255,255,0.05)'
      }}>
        {pro ? <span className="text-yellow-400 font-semibold">⚡ Pro Subscriber</span> : <span className="text-gray-400">Free Tier</span>}
      </div>
      {!pro && (
        <div className="mt-3">
          <a href="https://thryx.mom/subscribe" target="_blank" rel="noopener" className="btn-primary text-sm">Upgrade to Pro — Pay with $THRYX</a>
        </div>
      )}
    </div>
  );
}
