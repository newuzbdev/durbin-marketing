const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

const ACCESS_KEY = 'durbin.accessToken';
const REFRESH_KEY = 'durbin.refreshToken';
const SCHOOL_KEY = 'durbin.schoolId';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
  }
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // private rejim va h.k. — e'tiborsiz
  }
}

export const session = {
  get schoolId() {
    return read(SCHOOL_KEY);
  },
  setSchoolId(id: string | null) {
    write(SCHOOL_KEY, id);
  },
  hasTokens() {
    return !!read(REFRESH_KEY);
  },
  setTokens(t: { accessToken: string; refreshToken: string } | null) {
    write(ACCESS_KEY, t?.accessToken ?? null);
    write(REFRESH_KEY, t?.refreshToken ?? null);
  },
  refreshToken() {
    return read(REFRESH_KEY);
  },
};

// Bir vaqtda bir nechta 401 kelsa, faqat bitta refresh so'rovi yuboriladi
let refreshing: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  const refreshToken = read(REFRESH_KEY);
  if (!refreshToken) return false;
  refreshing ??= fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })
    .then(async (res) => {
      if (!res.ok) {
        session.setTokens(null);
        return false;
      }
      session.setTokens(await res.json());
      return true;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  const access = read(ACCESS_KEY);
  if (access) headers.set('Authorization', `Bearer ${access}`);
  const schoolId = read(SCHOOL_KEY);
  if (schoolId) headers.set('X-School-Id', schoolId);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(init.json);
  }

  const res = await fetch(`${API_URL}${path}`, { ...init, headers, body });

  if (res.status === 401 && retry && (await refreshTokens())) {
    return api<T>(path, init, false);
  }
  if (!res.ok) {
    const data = await res.json().catch(() => undefined);
    const message = (data as { message?: string } | undefined)?.message ?? res.statusText;
    throw new ApiError(res.status, message, data);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
