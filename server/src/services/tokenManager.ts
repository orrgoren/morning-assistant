import { config } from '../config/index.js';

interface TokenState {
  accessToken: string;
  expiresAt: number; // unix seconds
}

let state: TokenState | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

async function fetchToken(): Promise<TokenState> {
  const clientId = config.greeninvoice.clientId;
  const clientSecret = config.greeninvoice.clientSecret;
  console.log('[TokenManager] Fetching token, client_id:', clientId, 'secret length:', clientSecret.length);

  // OAuth 2.0 spec uses application/x-www-form-urlencoded for client_credentials
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(config.greeninvoice.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GreenInvoice auth failed ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { accessToken: string; expiresAt: number };
  return { accessToken: data.accessToken, expiresAt: data.expiresAt };
}

function scheduleRefresh(expiresAt: number) {
  if (refreshTimer) clearTimeout(refreshTimer);
  const msUntilExpiry = expiresAt * 1000 - Date.now();
  const refreshIn = Math.max(msUntilExpiry - 10 * 60 * 1000, 5000); // 10 min before expiry
  refreshTimer = setTimeout(async () => {
    try {
      state = await fetchToken();
      console.log('[TokenManager] Token refreshed, expires', new Date(state.expiresAt * 1000).toISOString());
      scheduleRefresh(state.expiresAt);
    } catch (err) {
      console.error('[TokenManager] Refresh failed:', err);
      // retry in 60s
      refreshTimer = setTimeout(() => scheduleRefresh(expiresAt), 60_000);
    }
  }, refreshIn);
}

export async function initTokenManager() {
  state = await fetchToken();
  console.log('[TokenManager] Initialized, expires', new Date(state.expiresAt * 1000).toISOString());
  scheduleRefresh(state.expiresAt);
}

export async function getValidToken(): Promise<string> {
  if (!state) throw new Error('TokenManager not initialized');
  // if within 2 min of expiry, refresh eagerly
  if (state.expiresAt * 1000 - Date.now() < 2 * 60 * 1000) {
    state = await fetchToken();
    scheduleRefresh(state.expiresAt);
  }
  return state.accessToken;
}

export function isTokenValid(): boolean {
  return state !== null && state.expiresAt * 1000 > Date.now();
}
