export type SessionTokens = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: number;
  scope?: 'global' | 'condominio';
};

const KEY = 'liven-session-v1';
let current: SessionTokens | null = null;
let initialized = false;
let revision = 0;
const listeners = new Set<() => void>();

export function validTokens(value: unknown): value is Omit<SessionTokens, 'expires_at'> {
  if (!value || typeof value !== 'object') return false;
  const token = value as Record<string, unknown>;
  return typeof token.access_token === 'string' && token.access_token.length > 0
    && typeof token.refresh_token === 'string' && token.refresh_token.length >= 32
    && token.refresh_token.length <= 512 && typeof token.expires_in === 'number'
    && Number.isFinite(token.expires_in) && token.expires_in > 0;
}

export function getSession(): SessionTokens | null {
  if (!initialized) {
    initialized = true;
    try {
      const saved: unknown = JSON.parse(sessionStorage.getItem(KEY) ?? 'null');
      if (validTokens(saved) && 'expires_at' in saved && typeof saved.expires_at === 'number'
        && Number.isFinite(saved.expires_at) && (!( 'scope' in saved) || saved.scope === 'global' || saved.scope === 'condominio')) current = saved as SessionTokens;
      else sessionStorage.removeItem(KEY);
    } catch {
      try { sessionStorage.removeItem(KEY); } catch { /* Storage may be unavailable. */ }
    }
    // Discard the legacy identity-only/demo session. Never trust a stored profile.
    try {
      localStorage.removeItem('liven-usuario');
      localStorage.removeItem('liven-access-token');
    } catch { /* The in-memory session still works when storage is blocked. */ }
  }
  return current;
}

export function sessionRevision() { getSession(); return revision; }

export function setSession(tokens: Omit<SessionTokens, 'expires_at'> | null) {
  initialized = true;
  revision += 1;
  current = tokens ? { access_token: tokens.access_token, refresh_token: tokens.refresh_token,
    expires_in: tokens.expires_in, expires_at: Date.now() + tokens.expires_in * 1000,
    ...(tokens.scope ? { scope: tokens.scope } : {}) } : null;
  try {
    if (current) sessionStorage.setItem(KEY, JSON.stringify(current));
    else sessionStorage.removeItem(KEY);
  } catch { /* Fall back to memory; never fall back to localStorage. */ }
  listeners.forEach((listener) => listener());
}

export function subscribeSession(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
