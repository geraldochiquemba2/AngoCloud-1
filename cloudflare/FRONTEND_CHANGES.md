# Alterações Necessárias no Frontend

Para funcionar com Cloudflare Workers (JWT em vez de sessões), o frontend precisa de algumas adaptações.

## 1. Armazenar Token JWT

Em vez de depender de cookies de sessão, o frontend deve armazenar o token JWT.

### Ficheiro: `client/src/contexts/AuthContext.tsx`

Adicione o armazenamento do token:

```typescript
// Adicionar no início do ficheiro
const TOKEN_KEY = 'angocloud_token';

// Na função de login, guardar o token
const login = async (email: string, password: string) => {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  
  const data = await response.json();
  
  if (data.token) {
    localStorage.setItem(TOKEN_KEY, data.token);
    setUser(data.user);
  }
  
  return data;
};

// Na função de logout, remover o token
const logout = async () => {
  localStorage.removeItem(TOKEN_KEY);
  setUser(null);
};
```

## 2. Adicionar Token às Requisições

Crie um wrapper para fetch que adiciona automaticamente o token:

### Ficheiro: `client/src/lib/api.ts` (novo ficheiro)

```typescript
const TOKEN_KEY = 'angocloud_token';

export async function apiRequest(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = localStorage.getItem(TOKEN_KEY);
  
  const headers = new Headers(options.headers);
  
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  
  return fetch(url, {
    ...options,
    headers,
  });
}

export async function apiGet(url: string) {
  return apiRequest(url);
}

export async function apiPost(url: string, data: any) {
  return apiRequest(url, {
    method: 'POST',
    body: data instanceof FormData ? data : JSON.stringify(data),
  });
}

export async function apiPatch(url: string, data: any) {
  return apiRequest(url, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function apiDelete(url: string) {
  return apiRequest(url, {
    method: 'DELETE',
  });
}
```

## 3. Atualizar QueryClient

### Ficheiro: `client/src/lib/queryClient.ts`

```typescript
import { QueryClient } from '@tanstack/react-query';
import { apiRequest } from './api';

export async function apiRequest(
  method: string,
  url: string,
  data?: any
): Promise<Response> {
  const token = localStorage.getItem('angocloud_token');
  
  const headers: HeadersInit = {};
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  if (data && !(data instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  
  const response = await fetch(url, {
    method,
    headers,
    body: data instanceof FormData ? data : data ? JSON.stringify(data) : undefined,
    credentials: 'include',
  });
  
  // Se receber 401, limpar token e redirecionar para login
  if (response.status === 401) {
    localStorage.removeItem('angocloud_token');
    window.location.href = '/login';
  }
  
  return response;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5 * 60 * 1000,
    },
  },
});
```

## 4. Verificar Autenticação no Carregamento

### Ficheiro: `client/src/contexts/AuthContext.tsx`

```typescript
useEffect(() => {
  const token = localStorage.getItem(TOKEN_KEY);
  
  if (token) {
    // Verificar se o token ainda é válido
    fetch('/api/auth/me', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })
      .then(res => res.json())
      .then(data => {
        if (data.id) {
          setUser(data);
        } else {
          localStorage.removeItem(TOKEN_KEY);
        }
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
      })
      .finally(() => {
        setLoading(false);
      });
  } else {
    setLoading(false);
  }
}, []);
```

## 5. Configurar URL da API

Para produção, crie um ficheiro de configuração:

### Ficheiro: `client/src/config.ts`

```typescript
export const config = {
  apiUrl: import.meta.env.VITE_API_URL || '',
};

// Em produção, VITE_API_URL seria algo como:
// https://angocloud-api.username.workers.dev
```

## Resumo das Alterações

| Ficheiro | Alteração |
|----------|-----------|
| `AuthContext.tsx` | Armazenar/remover token JWT |
| `lib/api.ts` | Novo wrapper para requisições |
| `lib/queryClient.ts` | Adicionar header Authorization |
| `config.ts` | URL da API para produção |

## Nota Importante

Estas alterações são **retrocompatíveis** com a versão atual que usa sessões.
O código pode funcionar com ambos os sistemas:
- Se o backend responder com `token`, usa JWT
- Se não, continua usando sessões (Render/Replit)
