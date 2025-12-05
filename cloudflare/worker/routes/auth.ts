/**
 * Authentication Routes for Cloudflare Workers
 * 
 * Uses PBKDF2 for secure password hashing (Web Crypto compatible).
 * Maintains backward compatibility with existing bcrypt hashes using bcryptjs.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import bcryptModule from 'bcryptjs';
import { createDb } from '../db';
import { createToken, authMiddleware, JWTPayload } from '../middleware/auth';
import { users, User } from '../schema';
import { eq } from 'drizzle-orm';

const bcrypt = (bcryptModule as any).default || bcryptModule;

interface Env {
  DATABASE_URL: string;
  JWT_SECRET: string;
}

interface Variables {
  user: JWTPayload;
}

export const authRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

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
  try {
    const result = bcrypt.compareSync(password, hash);
    return result;
  } catch (error) {
    console.error('Bcrypt verification error:', error);
    return false;
  }
}

async function hashPassword(password: string): Promise<string> {
  return hashPasswordPBKDF2(password);
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (storedHash.startsWith('pbkdf2:')) {
    return verifyPasswordPBKDF2(password, storedHash);
  }
  
  if (isBcryptHash(storedHash)) {
    return verifyBcryptHash(password, storedHash);
  }
  
  console.error('Unknown hash format:', storedHash.substring(0, 10));
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
    
    const existingUsers = await db.select().from(users).where(eq(users.email, email));
    const existingUser = existingUsers[0];
    if (existingUser) {
      return c.json({ message: 'Email já está em uso' }, 400);
    }

    const salt = encryptionSalt || generateSalt();
    const hashedPassword = await hashPassword(password);
    
    const insertedUsers = await db.insert(users).values({
      email,
      passwordHash: hashedPassword,
      nome,
      plano: 'gratis',
      encryptionSalt: salt,
    }).returning();
    
    const user = insertedUsers[0] as User;

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
    return c.json({ message: 'Erro ao criar conta', error: String(error) }, 500);
  }
});

authRoutes.post('/login', async (c) => {
  try {
    if (!c.env.DATABASE_URL) {
      console.error('DATABASE_URL is not configured');
      return c.json({ message: 'Erro de configuração do servidor', code: 'NO_DATABASE_URL' }, 500);
    }
    if (!c.env.JWT_SECRET) {
      console.error('JWT_SECRET is not configured');
      return c.json({ message: 'Erro de configuração do servidor', code: 'NO_JWT_SECRET' }, 500);
    }

    const loginSchema = z.object({
      email: z.string().email(),
      password: z.string(),
    });

    const body = await c.req.json();
    const { email, password } = loginSchema.parse(body);

    console.log('Login attempt for:', email);
    console.log('DATABASE_URL configured:', !!c.env.DATABASE_URL);

    let db;
    try {
      db = createDb(c.env.DATABASE_URL);
    } catch (dbError) {
      console.error('Database connection error:', dbError);
      return c.json({ message: 'Erro ao conectar à base de dados', code: 'DB_CONNECTION_ERROR' }, 500);
    }
    
    let foundUsers;
    try {
      foundUsers = await db.select().from(users).where(eq(users.email, email));
    } catch (queryError) {
      console.error('Database query error:', queryError);
      return c.json({ message: 'Erro ao consultar base de dados', code: 'DB_QUERY_ERROR', detail: String(queryError) }, 500);
    }
    
    const user = foundUsers[0] as User | undefined;
    
    if (!user) {
      console.log('User not found:', email);
      return c.json({ message: 'Email ou senha incorretos' }, 401);
    }

    console.log('User found, verifying password. Hash type:', user.passwordHash.substring(0, 10));

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      console.log('Password verification failed for:', email);
      return c.json({ message: 'Email ou senha incorretos' }, 401);
    }

    console.log('Password verified, creating token');

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

    console.log('Login successful for:', email);

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
    return c.json({ message: 'Erro ao fazer login', error: String(error) }, 500);
  }
});

authRoutes.post('/logout', (c) => {
  return new Response(JSON.stringify({ message: 'Logout realizado com sucesso' }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': 'auth_token=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/'
    }
  });
});

authRoutes.get('/me', authMiddleware, async (c) => {
  const userPayload = c.get('user') as JWTPayload;
  
  const db = createDb(c.env.DATABASE_URL);
  const foundUsers = await db.select().from(users).where(eq(users.id, userPayload.id));
  const fullUser = foundUsers[0] as User | undefined;
  
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

authRoutes.post('/refresh', authMiddleware, async (c) => {
  try {
    const userPayload = c.get('user') as JWTPayload;
    
    const db = createDb(c.env.DATABASE_URL);
    const foundUsers = await db.select().from(users).where(eq(users.id, userPayload.id));
    const fullUser = foundUsers[0] as User | undefined;
    
    if (!fullUser) {
      return c.json({ message: 'Utilizador não encontrado' }, 404);
    }

    const newToken = await createToken({
      id: fullUser.id,
      email: fullUser.email,
      nome: fullUser.nome,
      plano: fullUser.plano,
      storageLimit: Number(fullUser.storageLimit),
      storageUsed: Number(fullUser.storageUsed),
      uploadsCount: fullUser.uploadsCount,
      uploadLimit: fullUser.uploadLimit,
      isAdmin: fullUser.isAdmin,
    }, c.env.JWT_SECRET);

    return c.json({
      token: newToken,
      user: {
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
      },
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    return c.json({ message: 'Erro ao renovar token' }, 500);
  }
});

authRoutes.post('/enable-encryption', authMiddleware, async (c) => {
  try {
    const userPayload = c.get('user') as JWTPayload;
    const { encryptionSalt, password } = await c.req.json();
    
    if (!encryptionSalt || typeof encryptionSalt !== 'string') {
      return c.json({ message: 'Salt de encriptação é obrigatório' }, 400);
    }
    
    if (!password || typeof password !== 'string') {
      return c.json({ message: 'Password é obrigatória para verificação' }, 400);
    }
    
    const db = createDb(c.env.DATABASE_URL);
    const foundUsers = await db.select().from(users).where(eq(users.id, userPayload.id));
    const fullUser = foundUsers[0] as User | undefined;
    
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
      .where(eq(users.id, userPayload.id));
    
    return c.json({ 
      message: 'Encriptação ativada com sucesso',
      encryptionSalt 
    });
  } catch (error) {
    console.error('Enable encryption error:', error);
    return c.json({ message: 'Erro ao ativar encriptação' }, 500);
  }
});

authRoutes.post('/change-password', authMiddleware, async (c) => {
  try {
    const userPayload = c.get('user') as JWTPayload;
    
    const schema = z.object({
      currentPassword: z.string().min(1, 'Senha atual é obrigatória'),
      newPassword: z.string().min(6, 'Nova senha deve ter pelo menos 6 caracteres'),
    });

    const body = await c.req.json();
    const { currentPassword, newPassword } = schema.parse(body);

    const db = createDb(c.env.DATABASE_URL);
    const foundUsers = await db.select().from(users).where(eq(users.id, userPayload.id));
    const fullUser = foundUsers[0] as User | undefined;

    if (!fullUser) {
      return c.json({ message: 'Utilizador não encontrado' }, 404);
    }

    const isCurrentPasswordValid = await verifyPassword(currentPassword, fullUser.passwordHash);
    if (!isCurrentPasswordValid) {
      return c.json({ message: 'Senha atual incorreta' }, 401);
    }

    const newHashedPassword = await hashPassword(newPassword);

    await db.update(users)
      .set({ passwordHash: newHashedPassword })
      .where(eq(users.id, userPayload.id));

    return c.json({ message: 'Senha alterada com sucesso' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ message: 'Dados inválidos', errors: error.errors }, 400);
    }
    console.error('Change password error:', error);
    return c.json({ message: 'Erro ao alterar senha' }, 500);
  }
});
