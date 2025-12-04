const AUTH_TOKEN_KEY = 'angocloud_auth_token';

let isRefreshingToken = false;
let refreshPromise: Promise<string | null> | null = null;

function getStoredToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

function storeToken(token: string): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

async function tryRefreshSession(): Promise<string | null> {
  if (isRefreshingToken && refreshPromise) {
    return refreshPromise;
  }
  
  isRefreshingToken = true;
  refreshPromise = (async () => {
    try {
      const currentToken = getStoredToken();
      if (!currentToken) {
        return null;
      }
      
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${currentToken}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.token) {
          storeToken(data.token);
          return data.token;
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error refreshing session:', error);
      return null;
    } finally {
      isRefreshingToken = false;
      refreshPromise = null;
    }
  })();
  
  return refreshPromise;
}

export async function apiFetch(url: string, options: RequestInit = {}, retryOn401: boolean = true): Promise<Response> {
  const token = getStoredToken();
  
  const headers: Record<string, string> = {};
  
  if (options.headers) {
    if (options.headers instanceof Headers) {
      options.headers.forEach((value, key) => {
        headers[key] = value;
      });
    } else if (Array.isArray(options.headers)) {
      options.headers.forEach(([key, value]) => {
        headers[key] = value;
      });
    } else {
      Object.assign(headers, options.headers);
    }
  }
  
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  
  const response = await fetch(url, {
    ...options,
    headers,
    credentials: "include",
  });
  
  if (response.status === 401 && retryOn401 && token) {
    const refreshedToken = await tryRefreshSession();
    if (refreshedToken) {
      headers["Authorization"] = `Bearer ${refreshedToken}`;
      return fetch(url, {
        ...options,
        headers,
        credentials: "include",
      });
    }
  }
  
  return response;
}

export function getAuthHeaders(includeContentType: boolean = true): HeadersInit {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  
  if (includeContentType) {
    headers["Content-Type"] = "application/json";
  }
  
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

export function getAuthToken(): string | null {
  return getStoredToken();
}
