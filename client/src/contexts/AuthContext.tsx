import { createContext, useContext, useState, useEffect } from "react";
import { 
  generateSalt, 
  deriveAndExportKey, 
  storeEncryptionKey, 
  getStoredEncryptionKey,
  clearEncryptionKey,
  isEncryptionSupported
} from "@/lib/encryption";

interface User {
  id: string;
  email: string;
  nome: string;
  plano: string;
  storageLimit: number;
  storageUsed: number;
  encryptionSalt?: string | null;
}

interface AuthContextType {
  isLoggedIn: boolean;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, nome: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  loading: boolean;
  error: string | null;
  hasEncryptionKey: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasEncryptionKey, setHasEncryptionKey] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    setHasEncryptionKey(!!getStoredEncryptionKey());
  }, [isLoggedIn]);

  const checkAuth = async () => {
    try {
      const response = await fetch("/api/auth/me", {
        credentials: "include",
      });

      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
        setIsLoggedIn(true);
        
        const storedKey = getStoredEncryptionKey();
        setHasEncryptionKey(!!storedKey);
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

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Erro ao criar conta");
      }

      const userData = await response.json();
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

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Email ou senha incorretos");
      }

      const userData = await response.json();
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
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
      
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
      const response = await fetch("/api/auth/me", {
        credentials: "include",
      });

      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
      }
    } catch (err) {
      console.error("Error refreshing user:", err);
    }
  };

  return (
    <AuthContext.Provider value={{ 
      isLoggedIn, 
      user, 
      login, 
      signup, 
      logout, 
      refreshUser, 
      loading, 
      error,
      hasEncryptionKey 
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
