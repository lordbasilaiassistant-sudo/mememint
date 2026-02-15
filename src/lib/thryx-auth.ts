/**
 * THRYX Unified Auth + EIP-6963 Wallet Discovery
 * Drop into any ecosystem site at src/lib/thryx-auth.ts
 * All auth goes through thryx.mom central API
 * All wallet connection uses EIP-6963 (Rainbow, MetaMask, Coinbase, etc.)
 */

const AUTH_API = 'https://thryx.mom';

// Owner wallets always get Pro (client-side fast check)
const OWNER_WALLETS = [
  '0x7a3e312ec6e20a9f62fe2405938eb9060312e334',
  '0x718d6142fb15f95f43fac6f70498d8da130240bc',
].map(w => w.toLowerCase());

export function isOwnerWallet(wallet: string | null): boolean {
  if (!wallet) return false;
  return OWNER_WALLETS.includes(wallet.toLowerCase());
}

// --- Auth API ---

export async function checkSubscription(token: string) {
  try {
    const res = await fetch(`${AUTH_API}/api/user/status`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.status === 401) {
      clearStoredAuth();
      return { activeTiers: ['free'], expired: true };
    }
    if (!res.ok) return { activeTiers: ['free'] };
    return res.json();
  } catch {
    return { activeTiers: ['free'] };
  }
}

export async function getChallenge(walletAddress: string) {
  const res = await fetch(`${AUTH_API}/api/auth/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress })
  });
  return res.json();
}

export async function verifySignature(walletAddress: string, signature: string, nonce: string) {
  const res = await fetch(`${AUTH_API}/api/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress, signature, nonce })
  });
  return res.json();
}

// --- Local Storage ---

export function getStoredAuth(): { token: string; wallet: string } | null {
  if (typeof window === 'undefined') return null;
  const token = localStorage.getItem('thryx_auth_token');
  const wallet = localStorage.getItem('thryx_wallet');
  if (token && wallet) return { token, wallet };
  return null;
}

export function setStoredAuth(token: string, wallet: string) {
  localStorage.setItem('thryx_auth_token', token);
  localStorage.setItem('thryx_wallet', wallet);
}

export function clearStoredAuth() {
  localStorage.removeItem('thryx_auth_token');
  localStorage.removeItem('thryx_wallet');
}

export function isPro(status: { activeTiers?: string[] }, wallet?: string | null): boolean {
  if (wallet && isOwnerWallet(wallet)) return true;
  return status?.activeTiers?.some((t: string) => t !== 'free') ?? false;
}

// --- Usage Tracking ---

export function getDailyUsage(key: string): number {
  if (typeof window === 'undefined') return 0;
  const today = new Date().toISOString().slice(0, 10);
  const stored = localStorage.getItem(`thryx_usage_${key}`);
  if (stored) {
    const parsed = JSON.parse(stored);
    if (parsed.date === today) return parsed.count;
  }
  return 0;
}

export function incrementDailyUsage(key: string): number {
  const today = new Date().toISOString().slice(0, 10);
  const current = getDailyUsage(key);
  const newCount = current + 1;
  localStorage.setItem(`thryx_usage_${key}`, JSON.stringify({ date: today, count: newCount }));
  return newCount;
}

// --- EIP-6963 Wallet Discovery ---

export interface DiscoveredWallet {
  uuid: string;
  name: string;
  icon: string;
  provider: any;
}

let _discoveredWallets: DiscoveredWallet[] = [];
let _discoveryStarted = false;

/** Start listening for EIP-6963 wallet announcements. Call once on app load. */
export function startWalletDiscovery() {
  if (typeof window === 'undefined' || _discoveryStarted) return;
  _discoveryStarted = true;
  _discoveredWallets = [];
  window.addEventListener('eip6963:announceProvider', (event: any) => {
    const { info, provider } = event.detail;
    if (!_discoveredWallets.find(w => w.uuid === info.uuid)) {
      _discoveredWallets.push({ uuid: info.uuid, name: info.name, icon: info.icon, provider });
    }
  });
  window.dispatchEvent(new Event('eip6963:requestProvider'));
}

/** Get all discovered wallets */
export function getDiscoveredWallets(): DiscoveredWallet[] {
  return _discoveredWallets;
}

/**
 * Get the best available provider:
 * - If EIP-6963 found exactly 1 wallet, return it
 * - If EIP-6963 found multiple, return null (caller should show picker)
 * - Fallback to window.ethereum
 * Returns { provider, wallets } where wallets.length > 1 means show picker
 */
export function getWalletProvider(): { provider: any | null; wallets: DiscoveredWallet[] } {
  // Always return wallets for picker — never auto-connect (user should confirm)
  if (_discoveredWallets.length >= 1) {
    return { provider: null, wallets: _discoveredWallets };
  }
  // Fallback to window.ethereum but still show in picker
  const eth = typeof window !== 'undefined' ? (window as any).ethereum : null;
  if (eth) {
    return { provider: null, wallets: [{ uuid: 'fallback', name: 'Browser Wallet', icon: '', provider: eth }] };
  }
  return { provider: null, wallets: [] };
}

/** Redirect to wallet install/dApp browser if no wallet found */
export function redirectToWallet() {
  if (typeof window === 'undefined') return;
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  if (isMobile) {
    window.location.href = `https://rnbwapp.com/dapp?url=${encodeURIComponent(window.location.href)}`;
  } else {
    window.open('https://metamask.io/download/', '_blank');
  }
}
