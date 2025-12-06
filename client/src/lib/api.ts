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

function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) {
    const message = error.message.toLowerCase();
    return message.includes('network') || 
           message.includes('failed to fetch') || 
           message.includes('load failed') ||
           message.includes('networkerror');
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }
  return false;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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

interface RetryConfig {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  retryOn401?: boolean;
  timeout?: number;
}

export async function apiFetch(
  url: string, 
  options: RequestInit = {}, 
  config: RetryConfig | boolean = true
): Promise<Response> {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 10000,
    retryOn401 = typeof config === 'boolean' ? config : true,
    timeout = 30000,
  } = typeof config === 'boolean' ? { retryOn401: config } : config;

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

  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
        console.log(`[API] Retry attempt ${attempt}/${maxRetries} after ${delay}ms for ${url}`);
        await sleep(delay);
        
        if (!navigator.onLine) {
          console.log('[API] Device is offline, waiting for connection...');
          await new Promise<void>(resolve => {
            const onOnline = () => {
              window.removeEventListener('online', onOnline);
              resolve();
            };
            window.addEventListener('online', onOnline);
            setTimeout(() => {
              window.removeEventListener('online', onOnline);
              resolve();
            }, 5000);
          });
        }
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      let response: Response;
      try {
        response = await fetch(url, {
          ...options,
          headers,
          credentials: "include",
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
      } catch (err) {
        clearTimeout(timeoutId);
        throw err;
      }
      
      if (response.status === 401 && retryOn401 && token) {
        const refreshedToken = await tryRefreshSession();
        if (refreshedToken) {
          headers["Authorization"] = `Bearer ${refreshedToken}`;
          
          const retryController = new AbortController();
          const retryTimeoutId = setTimeout(() => retryController.abort(), timeout);
          
          try {
            const retryResponse = await fetch(url, {
              ...options,
              headers,
              credentials: "include",
              signal: retryController.signal,
            });
            clearTimeout(retryTimeoutId);
            return retryResponse;
          } catch (retryErr) {
            clearTimeout(retryTimeoutId);
            if (isNetworkError(retryErr)) {
              console.warn('[API] Network error on retry after token refresh:', retryErr);
            }
            throw retryErr;
          }
        }
      }
      
      return response;
    } catch (err) {
      lastError = err as Error;
      
      if (!isNetworkError(err)) {
        throw err;
      }
      
      if (attempt === maxRetries) {
        console.error(`[API] All ${maxRetries + 1} attempts failed for ${url}:`, err);
        throw lastError;
      }
      
      console.warn(`[API] Network error on attempt ${attempt + 1}/${maxRetries + 1} for ${url}:`, err);
    }
  }
  
  throw lastError || new Error('Fetch failed after retries');
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
