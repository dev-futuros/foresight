import axios from 'axios';

const TOKEN_KEY = 'fs_token';
const isDev = import.meta.env.DEV;

let accessToken: string | null = isDev
  ? localStorage.getItem(TOKEN_KEY)
  : null;

export function setToken(token: string | null) {
  accessToken = token;
  if (isDev) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  }
}

export function getToken() {
  return accessToken;
}

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401 && !window.location.pathname.includes('/login')) {
      setToken(null);
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
