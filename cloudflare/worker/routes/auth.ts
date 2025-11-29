/**
 * Authentication Routes for Cloudflare Workers
 * 
 * Uses PBKDF2 for secure password hashing (Web Crypto compatible).
 * Maintains backward compatibility with existing bcrypt hashes.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { createDb } from '../db';
import { createToken, authMiddleware, JWTPayload } from '../middleware/auth';
import { users } from '../../../shared/schema';
import { eq } from 'drizzle-orm';

interface Env {
  DATABASE_URL: string;
  JWT_SECRET: string;
}

export const authRoutes = new Hono<{ Bindings: Env }>();

const PBKDF2_ITERATIONS = 100000;
const HASH_LENGTH = 32;

async function generateSecureSalt(): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return btoa(String.fromCharCode(...salt));
}

async function hashPasswordPBKDF2(password: string, salt?: string): Promise<string> {
  const actualSalt = salt || await generateSecureSalt();
  const encoder = new TextEncoder();
  
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: encoder.encode(actualSalt),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    HASH_LENGTH * 8
  );
  
  const hashArray = Array.from(new Uint8Array(derivedBits));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return `pbkdf2:${actualSalt}:${hashHex}`;
}

async function verifyPasswordPBKDF2(password: string, storedHash: string): Promise<boolean> {
  const [prefix, salt, hash] = storedHash.split(':');
  
  if (prefix !== 'pbkdf2' || !salt || !hash) {
    return false;
  }
  
  const computedHash = await hashPasswordPBKDF2(password, salt);
  const [, , computedHashValue] = computedHash.split(':');
  
  return computedHashValue === hash;
}

function isBcryptHash(hash: string): boolean {
  return hash.startsWith('$2a$') || hash.startsWith('$2b$') || hash.startsWith('$2y$');
}

async function verifyBcryptHash(password: string, hash: string): Promise<boolean> {
  return false;
}

async function hashPassword(password: string): Promise<string> {
  return hashPasswordPBKDF2(password);
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (storedHash.startsWith('pbkdf2:')) {
    return verifyPasswordPBKDF2(password, storedHash);
  }
  
  if (isBcryptHash(storedHash)) {
    console.warn('⚠️ Bcrypt hash detected. User needs to reset password or migrate hash.');
    return false;
  }
  
  return false;
}

function generateSalt(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array));
}

authRoutes.post('/register', async (c) => {
  try {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(6),
      nome: z.string().min(2),
      encryptionSalt: z.string().optional(),
    });

    const body = await c.req.json();
    const { email, password, nome, encryptionSalt } = schema.parse(body);

    const db = createDb(c.env.DATABASE_URL);
    
    const [existingUser] = await db.select().from(users).where(eq(users.email, email));
    if (existingUser) {
      return c.json({ message: 'Email já está em uso' }, 400);
    }

    const salt = encryptionSalt || generateSalt();
    const hashedPassword = await hashPassword(password);
    
    const [user] = await db.insert(users).values({
      email,
      passwordHash: hashedPassword,
      nome,
      plano: 'gratis',
      encryptionSalt: salt,
    }).returning();

    const token = await createToken({
      id: user.id,
      email: user.email,
      nome: user.nome,
      plano: user.plano,
      storageLimit: Number(user.storageLimit),
      storageUsed: Number(user.storageUsed),
      uploadsCount: user.uploadsCount,
      uploadLimit: user.uploadLimit,
      isAdmin: user.isAdmin,
    }, c.env.JWT_SECRET);

    return c.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        nome: user.nome,
        plano: user.plano,
        storageLimit: Number(user.storageLimit),
        storageUsed: Number(user.storageUsed),
        uploadsCount: user.uploadsCount,
        uploadLimit: user.uploadLimit,
        isAdmin: user.isAdmin,
        encryptionSalt: salt,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ message: 'Dados inválidos', errors: error.errors }, 400);
    }
    console.error('Register error:', error);
    return c.json({ message: 'Erro ao criar conta' }, 500);
  }
});

authRoutes.post('/login', async (c) => {
  try {
    const schema = z.object({
      email: z.string().email(),
      password: z.string(),
    });

    const body = await c.req.json();
    const { email, password } = schema.parse(body);

    const db = createDb(c.env.DATABASE_URL);
    
    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (!user) {
      return c.json({ message: 'Email ou senha incorretos' }, 401);
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return c.json({ message: 'Email ou senha incorretos' }, 401);
    }

    const token = await createToken({
      id: user.id,
      email: user.email,
      nome: user.nome,
      plano: user.plano,
      storageLimit: Number(user.storageLimit),
      storageUsed: Number(user.storageUsed),
      uploadsCount: user.uploadsCount,
      uploadLimit: user.uploadLimit,
      isAdmin: user.isAdmin,
    }, c.env.JWT_SECRET);

    return c.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        nome: user.nome,
        plano: user.plano,
        storageLimit: Number(user.storageLimit),
        storageUsed: Number(user.storageUsed),
        uploadsCount: user.uploadsCount,
        uploadLimit: user.uploadLimit,
        isAdmin: user.isAdmin,
        encryptionSalt: user.encryptionSalt,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ message: 'Dados inválidos', errors: error.errors }, 400);
    }
    console.error('Login error:', error);
    return c.json({ message: 'Erro ao fazer login' }, 500);
  }
});

authRoutes.post('/logout', (c) => {
  return c.json({ message: 'Logout realizado com sucesso' });
});

authRoutes.get('/me', authMiddleware, async (c) => {
  const user = c.get('user') as JWTPayload;
  
  const db = createDb(c.env.DATABASE_URL);
  const [fullUser] = await db.select().from(users).where(eq(users.id, user.id));
  
  if (!fullUser) {
    return c.json({ message: 'Utilizador não encontrado' }, 404);
  }

  return c.json({
    id: fullUser.id,
    email: fullUser.email,
    nome: fullUser.nome,
    plano: fullUser.plano,
    storageLimit: Number(fullUser.storageLimit),
    storageUsed: Number(fullUser.storageUsed),
    uploadsCount: fullUser.uploadsCount,
    uploadLimit: fullUser.uploadLimit,
    isAdmin: fullUser.isAdmin,
    encryptionSalt: fullUser.encryptionSalt,
  });
});

authRoutes.post('/enable-encryption', authMiddleware, async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const { encryptionSalt, password } = await c.req.json();
    
    if (!encryptionSalt || typeof encryptionSalt !== 'string') {
      return c.json({ message: 'Salt de encriptação é obrigatório' }, 400);
    }
    
    if (!password || typeof password !== 'string') {
      return c.json({ message: 'Password é obrigatória para verificação' }, 400);
    }
    
    const db = createDb(c.env.DATABASE_URL);
    const [fullUser] = await db.select().from(users).where(eq(users.id, user.id));
    
    if (!fullUser) {
      return c.json({ message: 'Utilizador não encontrado' }, 404);
    }
    
    if (fullUser.encryptionSalt) {
      return c.json({ message: 'Encriptação já está ativa para esta conta' }, 400);
    }
    
    const isPasswordValid = await verifyPassword(password, fullUser.passwordHash);
    if (!isPasswordValid) {
      return c.json({ message: 'Password incorreta' }, 401);
    }
    
    await db.update(users)
      .set({ encryptionSalt })
      .where(eq(users.id, user.id));
    
    return c.json({ 
      message: 'Encriptação ativada com sucesso',
      encryptionSalt 
    });
  } catch (error) {
    console.error('Enable encryption error:', error);
    return c.json({ message: 'Erro ao ativar encriptação' }, 500);
  }
});
