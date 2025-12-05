import { createContext, useContext, useState, useEffect } from "react";
import { 
  generateSalt, 
  deriveAndExportKey, 
  storeEncryptionKey, 
  getStoredEncryptionKey,
  clearEncryptionKey,
  isEncryptionSupported
} from "@/lib/encryption";
import { safeJsonParse, handleHtmlResponse } from "@/lib/api";

const AUTH_TOKEN_KEY = 'angocloud_auth_token';

interface User {
  id: string;
  email: string;
  nome: string;
  plano: string;
  storageLimit: number;
  storageUsed: number;
  uploadsCount: number;
  uploadLimit: number;
  isAdmin: boolean;
  encryptionSalt?: string | null;
}

interface AuthContextType {
  isLoggedIn: boolean;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, nome: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  enableEncryption: (password: string) => Promise<void>;
  revalidateSession: () => Promise<boolean>;
  loading: boolean;
  error: string | null;
  hasEncryptionKey: boolean;
  needsEncryptionSetup: boolean;
  getAuthHeaders: () => HeadersInit;
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function getStoredToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

function storeToken(token: string): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

function clearToken(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasEncryptionKey, setHasEncryptionKey] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    setHasEncryptionKey(!!getStoredEncryptionKey());
  }, [isLoggedIn]);

  useEffect(() => {
    let lastActiveTime = Date.now();
    const INACTIVE_THRESHOLD = 5 * 60 * 1000; // 5 minutes

    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        const timeAway = Date.now() - lastActiveTime;
        
        if (timeAway > INACTIVE_THRESHOLD && isLoggedIn) {
          console.log('[Auth] User returned after being away, checking session...');
          
          try {
            const currentToken = token || getStoredToken();
            if (!currentToken) {
              console.log('[Auth] No token found, forcing logout and reload');
              handleSessionExpired();
              return;
            }

            const response = await fetch("/api/auth/me", {
              credentials: "include",
              headers: { "Authorization": `Bearer ${currentToken}` },
            });

            if (!response.ok) {
              console.log('[Auth] Session expired while away, logging out and refreshing...');
              handleSessionExpired();
            } else {
              const userData = await response.json();
              setUser(userData);
              console.log('[Auth] Session still valid');
            }
          } catch (err) {
            console.error('[Auth] Error checking session:', err);
            handleSessionExpired();
          }
        }
        
        lastActiveTime = Date.now();
      } else {
        lastActiveTime = Date.now();
      }
    };

    const handleSessionExpired = () => {
      clearToken();
      setToken(null);
      clearEncryptionKey();
      setHasEncryptionKey(false);
      setUser(null);
      setIsLoggedIn(false);
      
      setTimeout(() => {
        window.location.reload();
      }, 100);
    };

    const handleOnline = async () => {
      if (isLoggedIn) {
        console.log('[Auth] Device came online, revalidating session...');
        const isValid = await revalidateSession();
        if (!isValid) {
          handleSessionExpired();
        }
      }
    };

    const handleFocus = () => {
      lastActiveTime = Date.now();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('focus', handleFocus);
    };
  }, [isLoggedIn, token]);

  const getAuthHeaders = (includeContentType: boolean = true): HeadersInit => {
    const headers: Record<string, string> = {};
    
    if (includeContentType) {
      headers["Content-Type"] = "application/json";
    }
    
    const currentToken = token || getStoredToken();
    if (currentToken) {
      headers["Authorization"] = `Bearer ${currentToken}`;
    }
    return headers;
  };

  const authFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
    const currentToken = token || getStoredToken();
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string> || {}),
    };
    
    if (currentToken) {
      headers["Authorization"] = `Bearer ${currentToken}`;
    }
    
    return fetch(url, {
      ...options,
      headers,
      credentials: "include",
    });
  };

  const checkAuth = async () => {
    try {
      const storedToken = getStoredToken();
      
      const headers: HeadersInit = {};
      if (storedToken) {
        headers["Authorization"] = `Bearer ${storedToken}`;
      }
      
      const response = await fetch("/api/auth/me", {
        credentials: "include",
        headers,
      });

      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
        setIsLoggedIn(true);
        if (storedToken) {
          setToken(storedToken);
        }
        
        const storedKey = getStoredEncryptionKey();
        setHasEncryptionKey(!!storedKey);
      } else {
        clearToken();
        setToken(null);
      }
    } catch (err) {
      console.error("Error checking auth:", err);
    } finally {
      setLoading(false);
    }
  };

  const setupEncryptionKey = async (password: string, salt: string) => {
    if (!isEncryptionSupported()) {
      console.warn("Encryption not supported in this browser");
      return;
    }
    
    try {
      const exportedKey = await deriveAndExportKey(password, salt);
      storeEncryptionKey(exportedKey);
      setHasEncryptionKey(true);
    } catch (err) {
      console.error("Error setting up encryption key:", err);
    }
  };

  const signup = async (email: string, password: string, nome: string) => {
    setError(null);
    setLoading(true);
    
    try {
      const encryptionSalt = generateSalt();
      
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password, nome, encryptionSalt }),
      });

      const { data, isHtml, error: parseError } = await safeJsonParse(response);
      
      if (isHtml) {
        handleHtmlResponse();
        throw new Error("Erro de conexão. A página será recarregada.");
      }
      
      if (parseError && !data) {
        throw new Error(parseError);
      }
      
      if (!response.ok) {
        throw new Error(data?.message || "Erro ao criar conta");
      }

      const userData = data.user || data;
      const newToken = data.token;
      
      if (newToken) {
        storeToken(newToken);
        setToken(newToken);
      }
      
      setUser(userData);
      setIsLoggedIn(true);
      
      await setupEncryptionKey(password, encryptionSalt);
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    setError(null);
    setLoading(true);
    
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      const { data, isHtml, error: parseError } = await safeJsonParse(response);
      
      if (isHtml) {
        handleHtmlResponse();
        throw new Error("Erro de conexão. A página será recarregada.");
      }
      
      if (parseError && !data) {
        throw new Error(parseError);
      }
      
      if (!response.ok) {
        throw new Error(data?.message || "Email ou senha incorretos");
      }

      const userData = data.user || data;
      const newToken = data.token;
      
      if (newToken) {
        storeToken(newToken);
        setToken(newToken);
      }
      
      setUser(userData);
      setIsLoggedIn(true);
      
      if (userData.encryptionSalt) {
        await setupEncryptionKey(password, userData.encryptionSalt);
      } else {
        console.warn("User has no encryption salt - legacy account");
      }
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      const currentToken = token || getStoredToken();
      const headers: HeadersInit = {};
      if (currentToken) {
        headers["Authorization"] = `Bearer ${currentToken}`;
      }
      
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
        headers,
      });
      
      clearToken();
      setToken(null);
      clearEncryptionKey();
      setHasEncryptionKey(false);
      setUser(null);
      setIsLoggedIn(false);
    } catch (err) {
      console.error("Error logging out:", err);
    }
  };

  const refreshUser = async () => {
    try {
      const currentToken = token || getStoredToken();
      const headers: HeadersInit = {};
      if (currentToken) {
        headers["Authorization"] = `Bearer ${currentToken}`;
      }
      
      const response = await fetch("/api/auth/me", {
        credentials: "include",
        headers,
      });

      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
      }
    } catch (err) {
      console.error("Error refreshing user:", err);
    }
  };

  const revalidateSession = async (): Promise<boolean> => {
    try {
      const currentToken = token || getStoredToken();
      const headers: HeadersInit = {};
      if (currentToken) {
        headers["Authorization"] = `Bearer ${currentToken}`;
      }
      
      const response = await fetch("/api/auth/me", {
        credentials: "include",
        headers,
      });

      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
        setIsLoggedIn(true);
        
        const storedKey = getStoredEncryptionKey();
        setHasEncryptionKey(!!storedKey);
        
        console.log("[Auth] Session revalidated successfully");
        return true;
      } else {
        console.log("[Auth] Session invalid, clearing auth state");
        clearToken();
        setToken(null);
        setUser(null);
        setIsLoggedIn(false);
        return false;
      }
    } catch (err) {
      console.error("[Auth] Error revalidating session:", err);
      return false;
    }
  };

  const enableEncryption = async (password: string) => {
    if (!isEncryptionSupported()) {
      throw new Error("Encriptação não suportada neste browser");
    }
    
    if (!user) {
      throw new Error("Utilizador não autenticado");
    }
    
    try {
      const encryptionSalt = generateSalt();
      const currentToken = token || getStoredToken();
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (currentToken) {
        headers["Authorization"] = `Bearer ${currentToken}`;
      }
      
      const response = await fetch("/api/auth/enable-encryption", {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({ encryptionSalt, password }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Erro ao ativar encriptação");
      }

      await setupEncryptionKey(password, encryptionSalt);
      setUser({ ...user, encryptionSalt });
    } catch (err: any) {
      console.error("Error enabling encryption:", err);
      throw err;
    }
  };

  const needsEncryptionSetup = isLoggedIn && user && !user.encryptionSalt && !hasEncryptionKey;

  return (
    <AuthContext.Provider value={{ 
      isLoggedIn, 
      user, 
      login, 
      signup, 
      logout, 
      refreshUser,
      enableEncryption,
      revalidateSession,
      loading, 
      error,
      hasEncryptionKey,
      needsEncryptionSetup: !!needsEncryptionSetup,
      getAuthHeaders,
      authFetch,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
