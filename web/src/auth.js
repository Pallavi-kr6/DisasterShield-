import { api } from './api.js';

const TOKEN_KEY = 'ds_token';
const USER_KEY = 'ds_user';

export function getStoredAuth() {
  const token = localStorage.getItem(TOKEN_KEY);
  const userRaw = localStorage.getItem(USER_KEY);
  const user = userRaw ? safeJsonParse(userRaw) : null;
  return { token, user };
}

export function storeAuth({ token, user }) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function setApiToken(token) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}

export async function login(email, password) {
  const r = await api.post('/api/auth/login', { email, password });
  return r.data;
}

export async function register(payload) {
  const r = await api.post('/api/auth/register', payload);
  return r.data;
}

function safeJsonParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

