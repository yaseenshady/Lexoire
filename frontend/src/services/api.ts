import type { AppState } from '../types';

const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
const DEFAULT_DEV_ENDPOINT = 'http://localhost:3000';

const getWindowOrigin = () => (typeof window === 'undefined' ? undefined : window.location.origin);

export const DEFAULT_APP_ENDPOINT = viteEnv?.VITE_API_URL?.trim() || getWindowOrigin() || DEFAULT_DEV_ENDPOINT;

export const normalizeEndpoint = (value?: string) => value?.trim() || DEFAULT_APP_ENDPOINT;

const buildApiUrl = (endpoint: string, pathname: string) => `${endpoint.replace(/\/$/, '')}${pathname}`;

export async function fetchAppState(endpoint?: string): Promise<AppState> {
  const resolvedEndpoint = normalizeEndpoint(endpoint);
  const response = await fetch(buildApiUrl(resolvedEndpoint, '/api/app-state'));

  if (!response.ok) {
    throw new Error(`Failed to load app state (${response.status})`);
  }

  return response.json() as Promise<AppState>;
}
