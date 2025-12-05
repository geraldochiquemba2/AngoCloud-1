const AUTH_TOKEN_KEY = 'angocloud_auth_token';

let isRefreshingToken = false;
let refreshPromise: Promise<string | null> | null = null;

function getStoredToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

function storeToken(token: string): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

function clearStoredToken(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

export async function safeJsonParse(response: Response): Promise<{ data: any; isHtml: boolean; error?: string }> {
  const contentType = response.headers.get('content-type') || '';
  
  if (contentType.includes('text/html')) {
    console.warn('[API] Received HTML instead of JSON, session may be expired');
    return { 
      data: null, 
      isHtml: true, 
      error: 'O servidor retornou uma página HTML. Por favor, faça login novamente.' 
    };
  }
  
  try {
    const text = await response.text();
    
    if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
      console.warn('[API] Response body is HTML, session may be expired');
      return { 
        data: null, 
        isHtml: true, 
        error: 'O servidor retornou uma página HTML. Por favor, faça login novamente.' 
      };
    }
    
    const data = JSON.parse(text);
    return { data, isHtml: false };
  } catch (e) {
    console.error('[API] Failed to parse JSON response:', e);
    return { 
      data: null, 
      isHtml: false, 
      error: 'Erro ao processar resposta do servidor. Tente novamente.' 
    };
  }
}

export function handleHtmlResponse(): void {
  console.log('[API] Handling HTML response - clearing session and reloading');
  clearStoredToken();
  localStorage.removeItem('angocloud_encryption_key');
  
  setTimeout(() => {
    window.location.reload();
  }, 100);
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
      
      const { data, isHtml, error } = await safeJsonParse(response);
      
      if (isHtml) {
        handleHtmlResponse();
        return null;
      }
      
      if (response.ok && data?.token) {
        storeToken(data.token);
        return data.token;
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
