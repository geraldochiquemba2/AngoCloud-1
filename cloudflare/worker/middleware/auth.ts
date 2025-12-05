/**
 * JWT Authentication Middleware for Cloudflare Workers
 * 
 * Substitui o Passport.js/express-session por JWT stateless.
 * Mais adequado para ambiente serverless/edge.
 */

import { Context, Next } from 'hono';
import { verify, sign, decode } from 'hono/jwt';

export interface JWTPayload {
  id: string;
  email: string;
  nome: string;
  plano: string;
  storageLimit: number;
  storageUsed: number;
  uploadsCount: number;
  uploadLimit: number;
  isAdmin: boolean;
  iat?: number;
  exp?: number;
}

export async function createToken(payload: Omit<JWTPayload, 'iat' | 'exp'>, secret: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    {
      ...payload,
      iat: now,
      exp: now + 7 * 24 * 60 * 60, // 7 days
    },
    secret
  );
}

function isValidJWTFormat(token: string): boolean {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  for (const part of parts) {
    if (!part || part.length === 0) return false;
    if (!/^[A-Za-z0-9_-]+$/.test(part)) return false;
  }
  return true;
}

function cleanToken(token: string): string {
  if (!token) return '';
  let cleaned = token.trim();
  cleaned = decodeURIComponent(cleaned);
  cleaned = cleaned.replace(/\s+/g, '');
  return cleaned;
}

export async function verifyToken(token: string, secret: string): Promise<JWTPayload | null> {
  try {
    if (!token || !secret) {
      return null;
    }
    
    const cleanedToken = cleanToken(token);
    
    if (!isValidJWTFormat(cleanedToken)) {
      console.log('Invalid JWT format detected');
      return null;
    }
    
    const payload = await verify(cleanedToken, secret);
    return payload as unknown as JWTPayload;
  } catch (error: any) {
    const errorMessage = error?.message || String(error);
    if (errorMessage.includes('pattern') || errorMessage.includes('expired') || errorMessage.includes('invalid')) {
      console.log('JWT verification failed:', errorMessage);
    } else {
      console.error('Unexpected JWT error:', errorMessage);
    }
    return null;
  }
}

export function getTokenFromHeader(c: Context): string | null {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.substring(7).trim();
  return token || null;
}

export function getTokenFromCookie(c: Context): string | null {
  const cookieHeader = c.req.header('Cookie') || '';
  const cookies = cookieHeader.split(';');
  
  for (const cookie of cookies) {
    const trimmed = cookie.trim();
    if (trimmed.startsWith('auth_token=')) {
      const token = trimmed.substring('auth_token='.length).trim();
      if (token && token.length > 0) {
        try {
          return decodeURIComponent(token);
        } catch {
          return token;
        }
      }
    }
  }
  
  return null;
}

export function getToken(c: Context): string | null {
  return getTokenFromHeader(c) || getTokenFromCookie(c);
}

export async function authMiddleware(c: Context, next: Next) {
  const token = getToken(c);
  
  if (!token) {
    return c.json({ message: 'Token de autenticação não fornecido' }, 401);
  }

  const payload = await verifyToken(token, c.env.JWT_SECRET);
  
  if (!payload) {
    return c.json({ message: 'Token inválido ou expirado' }, 401);
  }

  c.set('user', payload);
  await next();
}

export async function optionalAuthMiddleware(c: Context, next: Next) {
  const token = getToken(c);
  
  if (token) {
    const payload = await verifyToken(token, c.env.JWT_SECRET);
    if (payload) {
      c.set('user', payload);
    }
  }
  
  await next();
}

export async function adminMiddleware(c: Context, next: Next) {
  const user = c.get('user') as JWTPayload | undefined;
  
  if (!user) {
    return c.json({ message: 'Não autorizado' }, 401);
  }
  
  if (!user.isAdmin) {
    return c.json({ message: 'Acesso negado - requer privilégios de administrador' }, 403);
  }
  
  await next();
}
