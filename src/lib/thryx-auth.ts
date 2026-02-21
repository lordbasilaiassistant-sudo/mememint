/**
 * THRYX Unified Auth + EIP-6963 Wallet Discovery
 * Standardized across ALL ecosystem subdomain apps.
 * All auth goes through thryx.mom/api — single source of truth.
 *
 * Flow: EIP-6963 discover wallets → eth_requestAccounts → /api/auth/connect → token → /api/user/status
 */

const AUTH_API = 'https://thryx.mom';

// Owner wallets always get Pro (client-side fast check)
const OWNER_WALLETS = [
  '0x7a3e312ec6e20a9f62fe2405938eb9060312e334', // treasury
  '0x718d6142fb15f95f43fac6f70498d8da130240bc', // dev
].map(w => w.toLowerCase());

export function isOwnerWallet(wallet: string | null): boolean {
  if (!wallet) return false;
  return OWNER_WALLETS.includes(wallet.toLowerCase());
}

// --- Auth API (all calls go to thryx.mom) ---

/** Lightweight connect — get a 30-day token immediately (no signature needed) */
export async function connectAuth(walletAddress: string): Promise<{ token: string; wallet: string }> {
  const res = await fetch(`${AUTH_API}/api/auth/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Auth failed' }));
    throw new Error(err.error || 'Failed to authenticate');
  }
  const data = await res.json();
  // Store immediately
  setStoredAuth(data.token, data.wallet);
  return data;
}

/** Check subscription status — returns { activeTiers, pro, wallet, isOwner } */
export async function checkSubscription(token: string) {
  try {
    const res = await fetch(`${AUTH_API}/api/user/status`, {
      headers: { Authorization: `Bearer ${token}` },
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

// --- Local Storage + Cookies ---

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
  // Also set cookie for server-side API routes
  if (typeof document !== 'undefined') {
    document.cookie = `thryx_token=${token}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
    document.cookie = `thryx_wallet=${wallet}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
  }
}

export function clearStoredAuth() {
  localStorage.removeItem('thryx_auth_token');
  localStorage.removeItem('thryx_wallet');
  if (typeof document !== 'undefined') {
    document.cookie = 'thryx_token=; path=/; max-age=0';
    document.cookie = 'thryx_wallet=; path=/; max-age=0';
  }
}

export function isPro(status: { activeTiers?: string[] }, wallet?: string | null): boolean {
  if (wallet && isOwnerWallet(wallet)) return true;
  return status?.activeTiers?.some((t: string) => t !== 'free') ?? false;
}

/** Authenticated fetch — auto-attaches Bearer token */
export async function authFetch(url: string, opts: RequestInit = {}): Promise<Response> {
  const auth = getStoredAuth();
  const headers = new Headers(opts.headers);
  if (auth?.token) {
    headers.set('Authorization', `Bearer ${auth.token}`);
  }
  return fetch(url, { ...opts, headers });
}

// --- Usage Tracking (client-side daily limits) ---

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
 * - If EIP-6963 found wallets, return them for picker UI
 * - Fallback to window.ethereum
 */
export function getWalletProvider(): { provider: any | null; wallets: DiscoveredWallet[] } {
  if (_discoveredWallets.length >= 1) {
    return { provider: null, wallets: _discoveredWallets };
  }
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
