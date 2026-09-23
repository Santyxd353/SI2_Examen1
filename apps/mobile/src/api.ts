import * as SecureStore from 'expo-secure-store';
import type { Identity } from './types';

const ACCESS_KEY = 'vestidor18.access';
const REFRESH_KEY = 'vestidor18.refresh';
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:3018/api').replace(
  /\/$/,
  '',
);
export const REALTIME_URL = API_URL.replace(/\/api$/, '');

let accessToken = '';
let refreshToken = '';
let refreshPromise: Promise<void> | null = null;

async function saveTokens(access: string, refresh: string) {
  accessToken = access;
  refreshToken = refresh;
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_KEY, access),
    SecureStore.setItemAsync(REFRESH_KEY, refresh),
  ]);
}

export async function clearSession() {
  accessToken = '';
  refreshToken = '';
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_KEY),
    SecureStore.deleteItemAsync(REFRESH_KEY),
  ]);
}

async function rotate() {
  if (!refreshToken) throw new Error('Inicia sesión para continuar.');
  if (!refreshPromise)
    refreshPromise = fetch(`${API_URL}/auth/mobile/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('La sesión venció.');
        const data = await response.json();
        await saveTokens(data.accessToken, data.refreshToken);
      })
      .finally(() => {
        refreshPromise = null;
      });
  return refreshPromise;
}

export async function api(path: string, options: RequestInit = {}, retry = true): Promise<any> {
  const headers = new Headers(options.headers);
  headers.set('X-Client-Channel', 'APP');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  if (options.body) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (response.status === 401 && retry && !path.startsWith('/auth/mobile/')) {
    await rotate();
    return api(path, options, false);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || 'No se pudo conectar con el servidor.');
  }
  return response.json();
}

export async function restoreSession(): Promise<Identity | null> {
  const [savedAccess, savedRefresh] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_KEY),
    SecureStore.getItemAsync(REFRESH_KEY),
  ]);
  accessToken = savedAccess || '';
  refreshToken = savedRefresh || '';
  if (!refreshToken) return null;
  try {
    return await api('/auth/me');
  } catch {
    await clearSession();
    return null;
  }
}

export async function login(correo: string, clave: string): Promise<Identity> {
  const response = await fetch(`${API_URL}/auth/mobile/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ correo, clave }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Correo o contraseña incorrectos.');
  await saveTokens(data.accessToken, data.refreshToken);
  return data.user;
}

export async function logout() {
  const currentRefresh = refreshToken;
  await clearSession();
  if (currentRefresh)
    await fetch(`${API_URL}/auth/mobile/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: currentRefresh }),
    }).catch(() => {});
}

export const getAccessToken = () => accessToken;
