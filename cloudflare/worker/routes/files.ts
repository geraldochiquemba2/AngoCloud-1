/**
 * File Routes for Cloudflare Workers
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { createDb } from '../db';
import { authMiddleware, JWTPayload } from '../middleware/auth';
import { TelegramService } from '../services/telegram';
import { files, users, folders, fileChunks } from '../../../shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

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

export const fileRoutes = new Hono<{ Bindings: Env }>();

fileRoutes.use('*', authMiddleware);

fileRoutes.get('/', async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const folderId = c.req.query('folderId');
    
    const db = createDb(c.env.DATABASE_URL);
    
    let query;
    if (folderId) {
      query = db.select().from(files)
        .where(and(
          eq(files.userId, user.id),
          eq(files.folderId, folderId),
          eq(files.isDeleted, false)
        ))
        .orderBy(desc(files.createdAt));
    } else {
      query = db.select().from(files)
        .where(and(
          eq(files.userId, user.id),
          eq(files.isDeleted, false),
          sql`${files.folderId} IS NULL`
        ))
        .orderBy(desc(files.createdAt));
    }
    
    const result = await query;
    return c.json(result);
  } catch (error) {
    console.error('Get files error:', error);
    return c.json({ message: 'Erro ao buscar arquivos' }, 500);
  }
});

fileRoutes.get('/search', async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const query = c.req.query('q');
    
    if (!query) {
      return c.json({ message: 'Query é obrigatório' }, 400);
    }
    
    const db = createDb(c.env.DATABASE_URL);
    
    const result = await db.select().from(files)
      .where(and(
        eq(files.userId, user.id),
        eq(files.isDeleted, false),
        sql`${files.nome} ILIKE ${`%${query}%`}`
      ))
      .orderBy(desc(files.createdAt));
    
    return c.json(result);
  } catch (error) {
    console.error('Search files error:', error);
    return c.json({ message: 'Erro ao buscar arquivos' }, 500);
  }
});

fileRoutes.post('/upload', async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const formData = await c.req.formData();
    
    const file = formData.get('file') as File;
    if (!file) {
      return c.json({ message: 'Nenhum arquivo enviado' }, 400);
    }
    
    const isEncrypted = formData.get('isEncrypted') === 'true';
    const originalMimeType = formData.get('originalMimeType') as string || file.type;
    const originalSize = formData.get('originalSize') 
      ? parseInt(formData.get('originalSize') as string, 10) 
      : file.size;
    const folderId = formData.get('folderId') as string || null;
    
    const db = createDb(c.env.DATABASE_URL);
    
    const [currentUser] = await db.select().from(users).where(eq(users.id, user.id));
    if (!currentUser) {
      return c.json({ message: 'Utilizador não encontrado' }, 404);
    }
    
    if (currentUser.uploadLimit !== -1 && currentUser.uploadsCount >= currentUser.uploadLimit) {
      return c.json({ 
        message: 'Limite de uploads atingido.',
        uploadsCount: currentUser.uploadsCount,
        uploadLimit: currentUser.uploadLimit,
      }, 400);
    }
    
    if (Number(currentUser.storageUsed) + originalSize > Number(currentUser.storageLimit)) {
      return c.json({ 
        message: 'Quota de armazenamento excedida',
        storageUsed: Number(currentUser.storageUsed),
        storageLimit: Number(currentUser.storageLimit),
      }, 400);
    }
    
    const telegram = new TelegramService(c.env);
    
    if (!telegram.isAvailable()) {
      return c.json({ 
        message: 'Serviço de armazenamento temporariamente indisponível.'
      }, 503);
    }
    
    const fileBuffer = await file.arrayBuffer();
    const uploadResult = await telegram.uploadLargeFile(fileBuffer, file.name);
    
    const mainFileId = uploadResult.chunks[0].fileId;
    const mainBotId = uploadResult.chunks[0].botId;
    
    const [newFile] = await db.insert(files).values({
      userId: user.id,
      uploadedByUserId: user.id,
      folderId,
      nome: file.name,
      tamanho: file.size,
      tipoMime: isEncrypted ? 'application/octet-stream' : originalMimeType,
      telegramFileId: mainFileId,
      telegramBotId: mainBotId,
      isEncrypted,
      originalMimeType,
      originalSize,
      isChunked: uploadResult.isChunked,
      totalChunks: uploadResult.chunks.length,
    }).returning();
    
    if (uploadResult.isChunked && uploadResult.chunks.length > 1) {
      const chunksData = uploadResult.chunks.map(chunk => ({
        fileId: newFile.id,
        chunkIndex: chunk.chunkIndex,
        telegramFileId: chunk.fileId,
        telegramBotId: chunk.botId,
        chunkSize: chunk.chunkSize,
      }));
      await db.insert(fileChunks).values(chunksData);
    }
    
    await db.update(users)
      .set({ 
        storageUsed: sql`${users.storageUsed} + ${originalSize}`,
        uploadsCount: sql`${users.uploadsCount} + 1`
      })
      .where(eq(users.id, user.id));
    
    return c.json(newFile);
  } catch (error) {
    console.error('Upload error:', error);
    return c.json({ message: 'Erro ao fazer upload' }, 500);
  }
});

fileRoutes.get('/:id/download', async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const fileId = c.req.param('id');
    
    const db = createDb(c.env.DATABASE_URL);
    
    const [file] = await db.select().from(files).where(eq(files.id, fileId));
    if (!file || file.userId !== user.id) {
      return c.json({ message: 'Arquivo não encontrado' }, 404);
    }
    
    if (!file.telegramFileId || !file.telegramBotId) {
      return c.json({ message: 'Arquivo sem referência de download' }, 400);
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
        headers: {
          'Content-Type': file.originalMimeType || file.tipoMime,
          'Content-Disposition': `attachment; filename="${file.nome}"`,
        },
      });
    }
    
    const buffer = await telegram.downloadFile(file.telegramFileId, file.telegramBotId);
    
    return new Response(buffer, {
      headers: {
        'Content-Type': file.originalMimeType || file.tipoMime,
        'Content-Disposition': `attachment; filename="${file.nome}"`,
      },
    });
  } catch (error) {
    console.error('Download error:', error);
    return c.json({ message: 'Erro ao fazer download' }, 500);
  }
});

fileRoutes.delete('/:id', async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const fileId = c.req.param('id');
    
    const db = createDb(c.env.DATABASE_URL);
    
    const [file] = await db.select().from(files).where(eq(files.id, fileId));
    if (!file || file.userId !== user.id) {
      return c.json({ message: 'Arquivo não encontrado' }, 404);
    }
    
    await db.update(files)
      .set({ isDeleted: true, deletedAt: new Date() })
      .where(eq(files.id, fileId));
    
    return c.json({ message: 'Arquivo movido para a lixeira' });
  } catch (error) {
    console.error('Delete file error:', error);
    return c.json({ message: 'Erro ao deletar arquivo' }, 500);
  }
});

fileRoutes.get('/trash', async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    
    const db = createDb(c.env.DATABASE_URL);
    
    const result = await db.select().from(files)
      .where(and(
        eq(files.userId, user.id),
        eq(files.isDeleted, true)
      ))
      .orderBy(desc(files.createdAt));
    
    return c.json(result);
  } catch (error) {
    console.error('Get trash error:', error);
    return c.json({ message: 'Erro ao buscar arquivos da lixeira' }, 500);
  }
});

fileRoutes.post('/:id/restore', async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const fileId = c.req.param('id');
    
    const db = createDb(c.env.DATABASE_URL);
    
    const [file] = await db.select().from(files).where(eq(files.id, fileId));
    if (!file || file.userId !== user.id) {
      return c.json({ message: 'Arquivo não encontrado' }, 404);
    }
    
    await db.update(files)
      .set({ isDeleted: false, deletedAt: null })
      .where(eq(files.id, fileId));
    
    return c.json({ message: 'Arquivo restaurado com sucesso' });
  } catch (error) {
    console.error('Restore file error:', error);
    return c.json({ message: 'Erro ao restaurar arquivo' }, 500);
  }
});

fileRoutes.delete('/:id/permanent', async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const fileId = c.req.param('id');
    
    const db = createDb(c.env.DATABASE_URL);
    
    const [file] = await db.select().from(files).where(eq(files.id, fileId));
    if (!file || file.userId !== user.id) {
      return c.json({ message: 'Arquivo não encontrado' }, 404);
    }
    
    await db.update(users)
      .set({ storageUsed: sql`${users.storageUsed} - ${file.tamanho}` })
      .where(eq(users.id, user.id));
    
    await db.delete(fileChunks).where(eq(fileChunks.fileId, fileId));
    await db.delete(files).where(eq(files.id, fileId));
    
    return c.json({ message: 'Arquivo deletado permanentemente' });
  } catch (error) {
    console.error('Permanent delete error:', error);
    return c.json({ message: 'Erro ao deletar arquivo permanentemente' }, 500);
  }
});

fileRoutes.patch('/:id/rename', async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const fileId = c.req.param('id');
    const { nome } = await c.req.json();
    
    if (!nome || nome.length < 1) {
      return c.json({ message: 'Nome inválido' }, 400);
    }
    
    const db = createDb(c.env.DATABASE_URL);
    
    const [file] = await db.select().from(files).where(eq(files.id, fileId));
    if (!file || file.userId !== user.id) {
      return c.json({ message: 'Arquivo não encontrado' }, 404);
    }
    
    await db.update(files)
      .set({ nome })
      .where(eq(files.id, fileId));
    
    return c.json({ message: 'Arquivo renomeado com sucesso' });
  } catch (error) {
    console.error('Rename file error:', error);
    return c.json({ message: 'Erro ao renomear arquivo' }, 500);
  }
});

fileRoutes.patch('/:id/move', async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const fileId = c.req.param('id');
    const { folderId } = await c.req.json();
    
    const db = createDb(c.env.DATABASE_URL);
    
    const [file] = await db.select().from(files).where(eq(files.id, fileId));
    if (!file || file.userId !== user.id) {
      return c.json({ message: 'Arquivo não encontrado' }, 404);
    }
    
    await db.update(files)
      .set({ folderId: folderId || null })
      .where(eq(files.id, fileId));
    
    return c.json({ message: 'Arquivo movido com sucesso' });
  } catch (error) {
    console.error('Move file error:', error);
    return c.json({ message: 'Erro ao mover arquivo' }, 500);
  }
});
