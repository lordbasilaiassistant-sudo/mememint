"use client";
import { useState, useEffect, useCallback } from "react";
import {
  getStoredAuth, clearStoredAuth, checkSubscription, isPro, isOwnerWallet,
  startWalletDiscovery, getWalletProvider, connectAuth, DiscoveredWallet,
} from "@/lib/thryx-auth";

export function useThryxAuth() {
  const [wallet, setWallet] = useState<string | null>(null);
  const [pro, setPro] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [walletOptions, setWalletOptions] = useState<DiscoveredWallet[]>([]);

  useEffect(() => { startWalletDiscovery(); }, []);

  // On mount: restore session from stored auth
  useEffect(() => {
    const auth = getStoredAuth();
    if (auth) {
      setWallet(auth.wallet);
      if (isOwnerWallet(auth.wallet)) setPro(true);
      checkSubscription(auth.token).then(status => {
        if (status.expired) { setWallet(null); setPro(false); }
        else setPro(isPro(status, auth.wallet));
      }).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  // Connect with a specific wallet provider (from EIP-6963 picker)
  const connectWithProvider = useCallback(async (prov: any) => {
    try {
      const accounts = await prov.request({ method: "eth_requestAccounts" });
      const addr = accounts[0];
      if (!addr) return;
      setShowPicker(false);
      setWallet(addr);

      // Owner wallets get instant Pro
      if (isOwnerWallet(addr)) { setPro(true); }

      // Get auth token from thryx.mom/api/auth/connect
      try {
        const authData = await connectAuth(addr);
        // Check subscription status with new token
        const status = await checkSubscription(authData.token);
        setPro(isPro(status, addr));
      } catch (e) {
        console.error("Auth token error:", e);
        // Wallet connected but auth failed — still usable, just no Pro check
      }
    } catch (e) {
      console.error("Wallet connect error:", e);
    }
  }, []);

  // Show wallet picker
  const connect = useCallback(async () => {
    const { wallets } = getWalletProvider();
    setWalletOptions(wallets);
    setShowPicker(true);
  }, []);

  const disconnect = () => {
    clearStoredAuth();
    setWallet(null);
    setPro(false);
    setShowPicker(false);
  };

  return { wallet, pro, loading, connect, disconnect, showPicker, setShowPicker, walletOptions, connectWithProvider };
}

// --- Reusable Components ---

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
