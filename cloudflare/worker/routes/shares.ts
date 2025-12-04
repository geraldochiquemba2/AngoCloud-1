/**
 * Share Routes for Cloudflare Workers
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { createDb } from '../db';
import { authMiddleware, optionalAuthMiddleware, JWTPayload } from '../middleware/auth';
import { TelegramService } from '../services/telegram';
import { files, shares, fileChunks, users, filePermissions } from '../../../shared/schema';
import { eq, and } from 'drizzle-orm';

interface Env {
  DATABASE_URL: string;
  JWT_SECRET: string;
  TELEGRAM_BOT_1_TOKEN?: string;
  TELEGRAM_BOT_2_TOKEN?: string;
  TELEGRAM_BOT_3_TOKEN?: string;
  TELEGRAM_BOT_4_TOKEN?: string;
  TELEGRAM_BOT_5_TOKEN?: string;
  TELEGRAM_STORAGE_CHAT_ID?: string;
}

export const shareRoutes = new Hono<{ Bindings: Env }>();

function generateLinkCode(): string {
  const array = new Uint8Array(12);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

const PBKDF2_ITERATIONS = 100000;
const HASH_LENGTH = 32;

async function generateSecureSalt(): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return btoa(String.fromCharCode(...salt));
}

async function hashPassword(password: string, salt?: string): Promise<string> {
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

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!storedHash.startsWith('pbkdf2:')) {
    return false;
  }
  
  const [, salt, hash] = storedHash.split(':');
  if (!salt || !hash) return false;
  
  const computedHash = await hashPassword(password, salt);
  const [, , computedHashValue] = computedHash.split(':');
  
  return computedHashValue === hash;
}

shareRoutes.post('/', authMiddleware, async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const { fileId } = await c.req.json();
    
    const db = createDb(c.env.DATABASE_URL);
    
    const [file] = await db.select().from(files).where(eq(files.id, fileId));
    if (!file || file.userId !== user.id) {
      return c.json({ message: 'Arquivo não encontrado' }, 404);
    }
    
    const linkCode = generateLinkCode();
    
    const [share] = await db.insert(shares).values({
      fileId,
      linkCode,
    }).returning();
    
    return c.json(share);
  } catch (error) {
    console.error('Create share error:', error);
    return c.json({ message: 'Erro ao criar link de compartilhamento' }, 500);
  }
});

shareRoutes.post('/send-email', authMiddleware, async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const { email, shareLink, fileName, fileId, sharedEncryptionKey } = z.object({
      email: z.string().email(),
      shareLink: z.string(),
      fileName: z.string(),
      fileId: z.string(),
      sharedEncryptionKey: z.string().optional()
    }).parse(await c.req.json());
    
    const db = createDb(c.env.DATABASE_URL);
    
    const [file] = await db.select().from(files).where(eq(files.id, fileId));
    if (!file || file.userId !== user.id) {
      return c.json({ message: 'Ficheiro não encontrado ou acesso negado' }, 404);
    }
    
    const [targetUser] = await db.select().from(users).where(eq(users.email, email));
    if (!targetUser) {
      return c.json({ message: 'Email inválido' }, 404);
    }
    
    if (targetUser.id === user.id) {
      return c.json({ message: 'Não pode partilhar ficheiros consigo mesmo' }, 400);
    }
    
    const [existingPermission] = await db.select().from(filePermissions)
      .where(and(
        eq(filePermissions.fileId, fileId),
        eq(filePermissions.userId, targetUser.id)
      ));
    
    if (existingPermission) {
      return c.json({ message: 'Ficheiro já partilhado com este utilizador' }, 400);
    }
    
    await db.insert(filePermissions).values({
      fileId,
      userId: targetUser.id,
      role: 'viewer',
      grantedBy: user.id,
      sharedEncryptionKey: sharedEncryptionKey || null,
    });
    
    console.log(`[Share] File ${fileName} shared with ${email} by user ${user.id}${sharedEncryptionKey ? ' (with encryption key)' : ''}`);
    
    return c.json({ 
      success: true, 
      message: `Ficheiro partilhado com ${targetUser.nome || targetUser.username}`
    });
  } catch (error) {
    console.error('Send share email error:', error);
    if (error instanceof z.ZodError) {
      return c.json({ message: 'Dados inválidos' }, 400);
    }
    return c.json({ message: 'Erro ao partilhar ficheiro' }, 500);
  }
});

shareRoutes.get('/:linkCode', async (c) => {
  try {
    const linkCode = c.req.param('linkCode');
    
    const db = createDb(c.env.DATABASE_URL);
    
    const [share] = await db.select().from(shares).where(eq(shares.linkCode, linkCode));
    if (!share) {
      return c.json({ message: 'Link não encontrado' }, 404);
    }
    
    if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
      return c.json({ message: 'Link expirado' }, 410);
    }
    
    const [file] = await db.select().from(files).where(eq(files.id, share.fileId));
    if (!file) {
      return c.json({ message: 'Arquivo não encontrado' }, 404);
    }
    
    return c.json({
      id: share.id,
      linkCode: share.linkCode,
      hasPassword: !!share.passwordHash,
      expiresAt: share.expiresAt,
      downloadCount: share.downloadCount,
      file: {
        id: file.id,
        nome: file.nome,
        tamanho: file.tamanho,
        tipoMime: file.tipoMime,
        isEncrypted: file.isEncrypted,
      },
    });
  } catch (error) {
    console.error('Get share error:', error);
    return c.json({ message: 'Erro ao buscar link' }, 500);
  }
});

shareRoutes.get('/:linkCode/download', async (c) => {
  try {
    const linkCode = c.req.param('linkCode');
    
    const db = createDb(c.env.DATABASE_URL);
    
    const [share] = await db.select().from(shares).where(eq(shares.linkCode, linkCode));
    if (!share) {
      return c.json({ message: 'Link não encontrado' }, 404);
    }
    
    if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
      return c.json({ message: 'Link expirado' }, 410);
    }
    
    if (share.passwordHash) {
      return c.json({ message: 'Este link requer senha' }, 401);
    }
    
    const [file] = await db.select().from(files).where(eq(files.id, share.fileId));
    if (!file || !file.telegramFileId || !file.telegramBotId) {
      return c.json({ message: 'Arquivo não disponível' }, 404);
    }
    
    const telegram = new TelegramService(c.env);
    if (!telegram.isAvailable()) {
      return c.json({ message: 'Sistema de armazenamento não configurado' }, 503);
    }
    
    let buffer: ArrayBuffer;
    
    if (file.isChunked && file.totalChunks > 1) {
      const chunks = await db.select().from(fileChunks)
        .where(eq(fileChunks.fileId, file.id))
        .orderBy(fileChunks.chunkIndex);
      
      const buffers: ArrayBuffer[] = [];
      for (const chunk of chunks) {
        const chunkBuffer = await telegram.downloadFile(chunk.telegramFileId, chunk.telegramBotId);
        buffers.push(chunkBuffer);
      }
      
      const totalLength = buffers.reduce((acc, buf) => acc + buf.byteLength, 0);
      const combined = new Uint8Array(totalLength);
      let offset = 0;
      for (const b of buffers) {
        combined.set(new Uint8Array(b), offset);
        offset += b.byteLength;
      }
      buffer = combined.buffer;
    } else {
      buffer = await telegram.downloadFile(file.telegramFileId, file.telegramBotId);
    }
    
    await db.update(shares)
      .set({ downloadCount: share.downloadCount + 1 })
      .where(eq(shares.id, share.id));
    
    return new Response(buffer, {
      headers: {
        'Content-Type': file.originalMimeType || file.tipoMime,
        'Content-Disposition': `attachment; filename="${file.nome}"`,
      },
    });
  } catch (error) {
    console.error('Download share error (GET):', error);
    return c.json({ message: 'Erro ao fazer download' }, 500);
  }
});

shareRoutes.post('/:linkCode/download', async (c) => {
  try {
    const linkCode = c.req.param('linkCode');
    const body = await c.req.json().catch(() => ({}));
    const { password } = body;
    
    const db = createDb(c.env.DATABASE_URL);
    
    const [share] = await db.select().from(shares).where(eq(shares.linkCode, linkCode));
    if (!share) {
      return c.json({ message: 'Link não encontrado' }, 404);
    }
    
    if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
      return c.json({ message: 'Link expirado' }, 410);
    }
    
    if (share.passwordHash) {
      if (!password) {
        return c.json({ message: 'Senha necessária' }, 401);
      }
      const isValid = await verifyPassword(password, share.passwordHash);
      if (!isValid) {
        return c.json({ message: 'Senha incorreta' }, 401);
      }
    }
    
    const [file] = await db.select().from(files).where(eq(files.id, share.fileId));
    if (!file || !file.telegramFileId || !file.telegramBotId) {
      return c.json({ message: 'Arquivo não disponível' }, 404);
    }
    
    const telegram = new TelegramService(c.env);
    
    let buffer: ArrayBuffer;
    
    if (file.isChunked && file.totalChunks > 1) {
      const chunks = await db.select().from(fileChunks)
        .where(eq(fileChunks.fileId, file.id))
        .orderBy(fileChunks.chunkIndex);
      
      const buffers: ArrayBuffer[] = [];
      for (const chunk of chunks) {
        const chunkBuffer = await telegram.downloadFile(chunk.telegramFileId, chunk.telegramBotId);
        buffers.push(chunkBuffer);
      }
      
      const totalLength = buffers.reduce((acc, buf) => acc + buf.byteLength, 0);
      const combined = new Uint8Array(totalLength);
      let offset = 0;
      for (const b of buffers) {
        combined.set(new Uint8Array(b), offset);
        offset += b.byteLength;
      }
      buffer = combined.buffer;
    } else {
      buffer = await telegram.downloadFile(file.telegramFileId, file.telegramBotId);
    }
    
    await db.update(shares)
      .set({ downloadCount: share.downloadCount + 1 })
      .where(eq(shares.id, share.id));
    
    return new Response(buffer, {
      headers: {
        'Content-Type': file.originalMimeType || file.tipoMime,
        'Content-Disposition': `attachment; filename="${file.nome}"`,
      },
    });
  } catch (error) {
    console.error('Download share error:', error);
    return c.json({ message: 'Erro ao fazer download' }, 500);
  }
});

shareRoutes.post('/:linkCode/download-data', async (c) => {
  try {
    const linkCode = c.req.param('linkCode');
    const body = await c.req.json().catch(() => ({}));
    const { password } = body;
    
    const db = createDb(c.env.DATABASE_URL);
    
    const [share] = await db.select().from(shares).where(eq(shares.linkCode, linkCode));
    if (!share) {
      return c.json({ message: 'Link não encontrado' }, 404);
    }
    
    if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
      return c.json({ message: 'Link expirado' }, 410);
    }
    
    if (share.passwordHash) {
      if (!password) {
        return c.json({ message: 'Senha necessária' }, 401);
      }
      const isValid = await verifyPassword(password, share.passwordHash);
      if (!isValid) {
        return c.json({ message: 'Senha incorreta' }, 401);
      }
    }
    
    const [file] = await db.select().from(files).where(eq(files.id, share.fileId));
    if (!file) {
      return c.json({ message: 'Arquivo não encontrado' }, 404);
    }
    
    return c.json({
      id: file.id,
      nome: file.nome,
      tamanho: file.tamanho,
      tipoMime: file.tipoMime,
      createdAt: file.createdAt,
      isEncrypted: file.isEncrypted || false,
      encryptionVersion: file.encryptionVersion || 1,
      isOwner: false,
      originalMimeType: file.originalMimeType || file.tipoMime,
      originalSize: file.originalSize || file.tamanho,
      downloadUrl: `/api/shares/${linkCode}/download`,
      previewUrl: `/api/shares/${linkCode}/preview`,
      contentUrl: `/api/shares/${linkCode}/content`,
      sharedEncryptionKey: undefined,
    });
  } catch (error) {
    console.error('Share download-data error:', error);
    return c.json({ message: 'Erro ao buscar dados do arquivo' }, 500);
  }
});

shareRoutes.post('/:linkCode/content', async (c) => {
  try {
    const linkCode = c.req.param('linkCode');
    const body = await c.req.json().catch(() => ({}));
    const { password } = body;
    
    const db = createDb(c.env.DATABASE_URL);
    
    const [share] = await db.select().from(shares).where(eq(shares.linkCode, linkCode));
    if (!share) {
      return c.json({ message: 'Link não encontrado' }, 404);
    }
    
    if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
      return c.json({ message: 'Link expirado' }, 410);
    }
    
    if (share.passwordHash) {
      if (!password) {
        return c.json({ message: 'Senha necessária' }, 401);
      }
      const isValid = await verifyPassword(password, share.passwordHash);
      if (!isValid) {
        return c.json({ message: 'Senha incorreta' }, 401);
      }
    }
    
    const [file] = await db.select().from(files).where(eq(files.id, share.fileId));
    if (!file || !file.telegramFileId || !file.telegramBotId) {
      return c.json({ message: 'Arquivo não disponível' }, 404);
    }
    
    const telegram = new TelegramService(c.env);
    
    if (file.isChunked && file.totalChunks > 1) {
      const chunks = await db.select().from(fileChunks)
        .where(eq(fileChunks.fileId, file.id))
        .orderBy(fileChunks.chunkIndex);
      
      const buffers: ArrayBuffer[] = [];
      for (const chunk of chunks) {
        const buffer = await telegram.downloadFile(chunk.telegramFileId, chunk.telegramBotId);
        buffers.push(buffer);
      }
      
      const totalLength = buffers.reduce((acc, buf) => acc + buf.byteLength, 0);
      const combined = new Uint8Array(totalLength);
      let offset = 0;
      for (const buffer of buffers) {
        combined.set(new Uint8Array(buffer), offset);
        offset += buffer.byteLength;
      }
      
      return new Response(combined, {
        headers: { 'Content-Type': 'application/octet-stream' }
      });
    }
    
    const buffer = await telegram.downloadFile(file.telegramFileId, file.telegramBotId);
    
    return new Response(buffer, {
      headers: { 'Content-Type': 'application/octet-stream' }
    });
  } catch (error) {
    console.error('Share content error:', error);
    return c.json({ message: 'Erro ao buscar conteúdo do arquivo' }, 500);
  }
});

shareRoutes.delete('/:id', authMiddleware, async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const shareId = c.req.param('id');
    
    const db = createDb(c.env.DATABASE_URL);
    
    const [share] = await db.select().from(shares).where(eq(shares.id, shareId));
    if (!share) {
      return c.json({ message: 'Link não encontrado' }, 404);
    }
    
    const [file] = await db.select().from(files).where(eq(files.id, share.fileId));
    if (!file || file.userId !== user.id) {
      return c.json({ message: 'Não autorizado' }, 403);
    }
    
    await db.delete(shares).where(eq(shares.id, shareId));
    
    return c.json({ message: 'Link removido com sucesso' });
  } catch (error) {
    console.error('Delete share error:', error);
    return c.json({ message: 'Erro ao remover link' }, 500);
  }
});

shareRoutes.get('/:linkCode/stream', async (c) => {
  try {
    const linkCode = c.req.param('linkCode');
    
    const db = createDb(c.env.DATABASE_URL);
    
    const [share] = await db.select().from(shares).where(eq(shares.linkCode, linkCode));
    if (!share) {
      return c.json({ message: 'Link não encontrado' }, 404);
    }
    
    if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
      return c.json({ message: 'Link expirado' }, 410);
    }
    
    const [file] = await db.select().from(files).where(eq(files.id, share.fileId));
    if (!file) {
      return c.json({ message: 'Arquivo não encontrado' }, 404);
    }
    
    if (!file.telegramFileId || !file.telegramBotId) {
      return c.json({ message: 'Arquivo não disponível' }, 404);
    }
    
    const telegramService = new TelegramService(c.env);
    const downloadUrl = await telegramService.getDownloadUrl(file.telegramFileId, file.telegramBotId);
    
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      return c.json({ message: 'Erro ao buscar ficheiro' }, 500);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    return new Response(arrayBuffer, {
      headers: {
        'Content-Type': file.originalMimeType || file.tipoMime,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600'
      }
    });
  } catch (error) {
    console.error('Stream error:', error);
    return c.json({ message: 'Erro ao fazer stream' }, 500);
  }
});

shareRoutes.get('/:linkCode/preview', async (c) => {
  try {
    const linkCode = c.req.param('linkCode');
    
    const db = createDb(c.env.DATABASE_URL);
    
    const [share] = await db.select().from(shares).where(eq(shares.linkCode, linkCode));
    if (!share) {
      return c.json({ message: 'Link não encontrado' }, 404);
    }
    
    if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
      return c.json({ message: 'Link expirado' }, 410);
    }
    
    const [file] = await db.select().from(files).where(eq(files.id, share.fileId));
    if (!file) {
      return c.json({ message: 'Arquivo não encontrado' }, 404);
    }
    
    if (!file.telegramFileId || !file.telegramBotId) {
      return c.json({ message: 'Arquivo não disponível' }, 404);
    }
    
    const telegramService = new TelegramService(c.env);
    const arrayBuffer = await telegramService.downloadFile(file.telegramFileId, file.telegramBotId);
    const mimeType = file.isEncrypted ? 'application/octet-stream' : (file.originalMimeType || file.tipoMime);
    
    return new Response(arrayBuffer, {
      headers: {
        'Content-Type': mimeType,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'Cache-Control': 'public, max-age=3600',
        'Content-Disposition': `inline; filename="${encodeURIComponent(file.nome)}"`
      }
    });
  } catch (error) {
    console.error('Preview error:', error);
    return c.json({ message: 'Erro ao obter preview' }, 500);
  }
});
