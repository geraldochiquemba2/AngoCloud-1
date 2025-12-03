/**
 * File Routes for Cloudflare Workers
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { createDb } from '../db';
import { authMiddleware, JWTPayload } from '../middleware/auth';
import { TelegramService } from '../services/telegram';
import { files, users, folders, fileChunks, filePermissions, folderPermissions, uploadSessions, uploadChunks } from '../../../shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

type Database = ReturnType<typeof createDb>;

// Helper function to check if folder or any ancestor is public
async function isFolderOrAncestorPublic(db: Database, folderId: string): Promise<boolean> {
  let currentFolderId: string | null = folderId;
  const visited = new Set<string>();
  
  while (currentFolderId) {
    if (visited.has(currentFolderId)) {
      break;
    }
    visited.add(currentFolderId);
    
    const result = await db.select({
      id: folders.id,
      isPublic: folders.isPublic,
      parentId: folders.parentId,
    }).from(folders).where(eq(folders.id, currentFolderId)).limit(1);
    
    if (result.length === 0) {
      break;
    }
    
    const folder = result[0];
    if (folder.isPublic) {
      return true;
    }
    
    currentFolderId = folder.parentId;
  }
  
  return false;
}

interface Env {
  DATABASE_URL: string;
  JWT_SECRET: string;
  TELEGRAM_BOT_1_TOKEN?: string;
  TELEGRAM_BOT_2_TOKEN?: string;
  TELEGRAM_BOT_3_TOKEN?: string;
  TELEGRAM_BOT_4_TOKEN?: string;
  TELEGRAM_BOT_5_TOKEN?: string;
  TELEGRAM_BOT_6_TOKEN?: string;
  TELEGRAM_BOT_7_TOKEN?: string;
  TELEGRAM_BOT_8_TOKEN?: string;
  TELEGRAM_BOT_9_TOKEN?: string;
  TELEGRAM_BOT_10_TOKEN?: string;
  TELEGRAM_STORAGE_CHAT_ID?: string;
}

export const fileRoutes = new Hono<{ Bindings: Env }>();

fileRoutes.use('*', authMiddleware);

fileRoutes.get('/', async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const folderId = c.req.query('folderId');
    
    const db = createDb(c.env.DATABASE_URL);
    
    if (folderId) {
      // Verificar se o utilizador tem acesso à pasta (dono ou colaborador)
      const [folder] = await db.select().from(folders).where(eq(folders.id, folderId));
      if (!folder) {
        return c.json({ message: 'Pasta não encontrada' }, 404);
      }
      
      const isOwner = folder.userId === user.id;
      let hasAccess = isOwner;
      
      if (!isOwner) {
        // Verificar permissão na pasta ou em qualquer pasta ancestral
        let currentFolderId: string | null = folderId;
        while (currentFolderId && !hasAccess) {
          const [permission] = await db.select().from(folderPermissions)
            .where(and(
              eq(folderPermissions.folderId, currentFolderId),
              eq(folderPermissions.userId, user.id)
            ));
          if (permission) {
            hasAccess = true;
            break;
          }
          // Verificar pasta pai
          const [parentFolder] = await db.select().from(folders).where(eq(folders.id, currentFolderId));
          currentFolderId = parentFolder?.parentId || null;
        }
      }
      
      if (!hasAccess) {
        return c.json({ message: 'Acesso negado' }, 403);
      }
      
      // Listar todos os ficheiros da pasta (independente do userId)
      const result = await db.select().from(files)
        .where(and(
          eq(files.folderId, folderId),
          eq(files.isDeleted, false)
        ))
        .orderBy(desc(files.createdAt));
      
      return c.json(result);
    } else {
      // Pasta raiz - apenas ficheiros do próprio utilizador
      const result = await db.select().from(files)
        .where(and(
          eq(files.userId, user.id),
          eq(files.isDeleted, false),
          sql`${files.folderId} IS NULL`
        ))
        .orderBy(desc(files.createdAt));
      
      return c.json(result);
    }
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
    
    // Buscar ficheiros do próprio utilizador
    const ownFiles = await db.select().from(files)
      .where(and(
        eq(files.userId, user.id),
        eq(files.isDeleted, false),
        sql`${files.nome} ILIKE ${`%${query}%`}`
      ))
      .orderBy(desc(files.createdAt));
    
    // Buscar ficheiros em pastas onde o utilizador tem permissão
    const permissions = await db.select().from(folderPermissions)
      .where(eq(folderPermissions.userId, user.id));
    
    let sharedFiles: typeof ownFiles = [];
    if (permissions.length > 0) {
      const folderIds = permissions.map(p => p.folderId);
      sharedFiles = await db.select().from(files)
        .where(and(
          sql`${files.folderId} IN (${sql.join(folderIds.map(id => sql`${id}`), sql`, `)})`,
          sql`${files.userId} != ${user.id}`,
          eq(files.isDeleted, false),
          sql`${files.nome} ILIKE ${`%${query}%`}`
        ))
        .orderBy(desc(files.createdAt));
    }
    
    // Combinar e remover duplicados
    const allFiles = [...ownFiles, ...sharedFiles];
    
    return c.json(allFiles);
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
    
    const clientSentEncrypted = formData.get('isEncrypted') === 'true';
    const originalMimeType = formData.get('originalMimeType') as string || file.type;
    const originalSize = formData.get('originalSize') 
      ? parseInt(formData.get('originalSize') as string, 10) 
      : file.size;
    const folderId = formData.get('folderId') as string || null;
    
    const db = createDb(c.env.DATABASE_URL);
    
    // Verificar se é uma pasta compartilhada e determinar o proprietário real
    let fileOwnerId = user.id;
    let storageOwnerId = user.id;
    let isSharedFolder = false;
    
    if (folderId) {
      const [folder] = await db.select().from(folders).where(eq(folders.id, folderId));
      if (!folder) {
        return c.json({ message: 'Pasta não encontrada' }, 404);
      }
      
      if (folder.userId !== user.id) {
        // É uma pasta de outro utilizador - verificar permissão de colaborador (com herança)
        let hasPermission = false;
        let permissionRole = '';
        let currentFolderId: string | null = folderId;
        
        // Verificar permissão na pasta ou em qualquer pasta ancestral
        while (currentFolderId && !hasPermission) {
          const [permission] = await db.select().from(folderPermissions)
            .where(and(
              eq(folderPermissions.folderId, currentFolderId),
              eq(folderPermissions.userId, user.id)
            ));
          if (permission) {
            hasPermission = true;
            permissionRole = permission.role;
            break;
          }
          // Verificar pasta pai
          const [ancestorFolder] = await db.select().from(folders).where(eq(folders.id, currentFolderId));
          currentFolderId = ancestorFolder?.parentId || null;
        }
        
        if (!hasPermission) {
          return c.json({ message: 'Não tem permissão para aceder a esta pasta' }, 403);
        }
        
        if (permissionRole !== 'collaborator') {
          return c.json({ message: 'Apenas colaboradores podem adicionar ficheiros a esta pasta. Você tem permissão apenas de visualização.' }, 403);
        }
        
        // Ficheiro pertence ao dono da pasta, mas foi enviado pelo colaborador
        fileOwnerId = folder.userId;
        storageOwnerId = folder.userId;
        isSharedFolder = true;
      }
    }
    
    // Ficheiros são enviados SEM encriptação por padrão
    // Encriptação só acontece se:
    // 1. Cliente explicitamente pediu encriptação E
    // 2. Pasta NÃO é pública (pastas públicas nunca aceitam ficheiros encriptados)
    let isFolderPublic = false;
    if (folderId) {
      isFolderPublic = await isFolderOrAncestorPublic(db, folderId);
    }
    
    // Se pasta é pública, força sem encriptação. Caso contrário, respeita escolha do cliente (default: false)
    const isEncrypted = isFolderPublic ? false : (clientSentEncrypted || false);
    
    // Verificar quota do proprietário do armazenamento (dono da pasta para pastas compartilhadas)
    const [storageOwner] = await db.select().from(users).where(eq(users.id, storageOwnerId));
    if (!storageOwner) {
      return c.json({ message: 'Utilizador proprietário não encontrado' }, 404);
    }
    
    if (storageOwner.uploadLimit !== -1 && storageOwner.uploadsCount >= storageOwner.uploadLimit) {
      return c.json({ 
        message: isSharedFolder 
          ? 'O proprietário da pasta atingiu o limite de uploads.' 
          : 'Limite de uploads atingido.',
        uploadsCount: storageOwner.uploadsCount,
        uploadLimit: storageOwner.uploadLimit,
      }, 400);
    }
    
    if (Number(storageOwner.storageUsed) + originalSize > Number(storageOwner.storageLimit)) {
      return c.json({ 
        message: isSharedFolder 
          ? 'O proprietário da pasta não tem espaço suficiente.' 
          : 'Quota de armazenamento excedida',
        storageUsed: Number(storageOwner.storageUsed),
        storageLimit: Number(storageOwner.storageLimit),
      }, 400);
    }
    
    const telegram = new TelegramService(c.env);
    
    if (!telegram.isAvailable()) {
      return c.json({ 
        message: 'Serviço de armazenamento temporariamente indisponível.'
      }, 503);
    }
    
    // Limite reduzido para 20MB para uploads únicos no Cloudflare Workers
    // Para ficheiros maiores, usar o sistema de upload chunked via /init-upload
    const MAX_SINGLE_UPLOAD_SIZE = 20 * 1024 * 1024; // 20MB
    if (originalSize > MAX_SINGLE_UPLOAD_SIZE) {
      return c.json({ 
        message: `Ficheiro muito grande para upload direto. Máximo: 20MB. Seu ficheiro: ${(originalSize / 1024 / 1024).toFixed(1)}MB. Use o sistema de upload chunked para ficheiros maiores.`,
        maxSize: MAX_SINGLE_UPLOAD_SIZE,
        fileSize: originalSize,
        useChunkedUpload: true,
      }, 400);
    }
    
    const fileBuffer = await file.arrayBuffer();
    const uploadResult = await telegram.uploadLargeFile(fileBuffer, file.name);
    
    const mainFileId = uploadResult.chunks[0].fileId;
    const mainBotId = uploadResult.chunks[0].botId;
    
    const [newFile] = await db.insert(files).values({
      userId: fileOwnerId,
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
    
    // Actualizar quota do proprietário do armazenamento
    await db.update(users)
      .set({ 
        storageUsed: sql`${users.storageUsed} + ${originalSize}`,
        uploadsCount: sql`${users.uploadsCount} + 1`
      })
      .where(eq(users.id, storageOwnerId));
    
    return c.json(newFile);
  } catch (error: any) {
    console.error('Upload error:', error);
    
    const errorMessage = error.message || 'Erro ao fazer upload';
    
    if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
      return c.json({ 
        message: 'Upload demorou demais. Tente um ficheiro menor (máximo recomendado: 15MB) ou verifique sua conexão.',
        error: 'timeout',
        suggestion: 'Para ficheiros grandes, use uma conexão mais rápida ou divida o ficheiro.'
      }, 408);
    }
    
    if (errorMessage.includes('Rate limit')) {
      return c.json({ 
        message: 'Servidor ocupado. Aguarde alguns segundos e tente novamente.',
        error: 'rate_limit'
      }, 429);
    }
    
    if (errorMessage.includes('Nenhum bot')) {
      return c.json({ 
        message: 'Serviço de armazenamento temporariamente indisponível. Tente novamente em alguns minutos.',
        error: 'no_bots_available'
      }, 503);
    }
    
    return c.json({ 
      message: errorMessage,
      error: 'upload_failed'
    }, 500);
  }
});

fileRoutes.post('/:id/reprocess', async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const fileId = c.req.param('id');
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
    
    const db = createDb(c.env.DATABASE_URL);
    
    const [existingFile] = await db.select().from(files).where(eq(files.id, fileId));
    if (!existingFile) {
      return c.json({ message: 'Arquivo não encontrado' }, 404);
    }
    
    if (existingFile.userId !== user.id) {
      return c.json({ message: 'Acesso negado' }, 403);
    }
    
    const telegram = new TelegramService(c.env);
    
    if (!telegram.isAvailable()) {
      return c.json({ 
        message: 'Serviço de armazenamento temporariamente indisponível.'
      }, 503);
    }
    
    const MAX_SINGLE_UPLOAD_SIZE = 20 * 1024 * 1024;
    if (file.size > MAX_SINGLE_UPLOAD_SIZE) {
      return c.json({ 
        message: `Ficheiro muito grande para reprocessamento direto. Máximo: 20MB. Para ficheiros maiores, use o sistema de upload chunked.`,
        maxSize: MAX_SINGLE_UPLOAD_SIZE,
        fileSize: file.size,
        useChunkedReprocess: true,
      }, 400);
    }
    
    const sizeDiff = file.size - Number(existingFile.tamanho);
    if (sizeDiff > 0) {
      const [currentUser] = await db.select().from(users).where(eq(users.id, user.id));
      if (currentUser && Number(currentUser.storageUsed) + sizeDiff > Number(currentUser.storageLimit)) {
        return c.json({ 
          message: 'Quota de armazenamento excedida',
          storageUsed: Number(currentUser.storageUsed),
          storageLimit: Number(currentUser.storageLimit),
        }, 400);
      }
    }
    
    const fileBuffer = await file.arrayBuffer();
    const uploadResult = await telegram.uploadLargeFile(fileBuffer, existingFile.nome);
    
    const mainFileId = uploadResult.chunks[0].fileId;
    const mainBotId = uploadResult.chunks[0].botId;
    
    if (existingFile.isChunked && existingFile.totalChunks && existingFile.totalChunks > 1) {
      await db.delete(fileChunks).where(eq(fileChunks.fileId, fileId));
    }
    
    const [updatedFile] = await db.update(files)
      .set({
        telegramFileId: mainFileId,
        telegramBotId: mainBotId,
        tamanho: file.size,
        tipoMime: isEncrypted ? 'application/octet-stream' : originalMimeType,
        isEncrypted,
        originalMimeType,
        originalSize,
        isChunked: uploadResult.isChunked,
        totalChunks: uploadResult.chunks.length,
      })
      .where(eq(files.id, fileId))
      .returning();
    
    if (uploadResult.isChunked && uploadResult.chunks.length > 1) {
      const chunksData = uploadResult.chunks.map(chunk => ({
        fileId: fileId,
        chunkIndex: chunk.chunkIndex,
        telegramFileId: chunk.fileId,
        telegramBotId: chunk.botId,
        chunkSize: chunk.chunkSize,
      }));
      await db.insert(fileChunks).values(chunksData);
    }
    
    const sizeDifference = file.size - Number(existingFile.tamanho);
    if (sizeDifference !== 0) {
      await db.update(users)
        .set({ 
          storageUsed: sql`${users.storageUsed} + ${sizeDifference}`
        })
        .where(eq(users.id, user.id));
    }
    
    return c.json(updatedFile);
  } catch (error: any) {
    console.error('Reprocess error:', error);
    return c.json({ 
      message: error.message || 'Erro ao reprocessar arquivo',
      error: 'reprocess_failed'
    }, 500);
  }
});

fileRoutes.get('/:id/download', async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const fileId = c.req.param('id');
    
    const db = createDb(c.env.DATABASE_URL);
    
    const [file] = await db.select().from(files).where(eq(files.id, fileId));
    if (!file) {
      return c.json({ message: 'Arquivo não encontrado' }, 404);
    }
    
    // Verificar acesso: dono, permissão direta no arquivo, ou permissão na pasta (com herança)
    const isOwner = file.userId === user.id;
    let hasAccess = isOwner;
    
    if (!hasAccess && file.folderId) {
      // Verificar permissão na pasta ou em qualquer pasta ancestral
      let currentFolderId: string | null = file.folderId;
      while (currentFolderId && !hasAccess) {
        const [folderPerm] = await db.select().from(folderPermissions)
          .where(and(
            eq(folderPermissions.folderId, currentFolderId),
            eq(folderPermissions.userId, user.id)
          ));
        if (folderPerm) {
          hasAccess = true;
          break;
        }
        // Verificar pasta pai
        const [parentFolder] = await db.select().from(folders).where(eq(folders.id, currentFolderId));
        currentFolderId = parentFolder?.parentId || null;
      }
    }
    
    if (!hasAccess) {
      // Verificar permissão direta no arquivo
      const [filePerm] = await db.select().from(filePermissions)
        .where(and(
          eq(filePermissions.fileId, fileId),
          eq(filePermissions.userId, user.id)
        ));
      hasAccess = !!filePerm;
    }
    
    if (!hasAccess) {
      return c.json({ message: 'Acesso negado' }, 403);
    }
    
    if (!file.telegramFileId || !file.telegramBotId) {
      return c.json({ message: 'Arquivo sem referência de download' }, 400);
    }
    
    const MAX_LEGACY_SIZE = 50 * 1024 * 1024;
    const fileSize = Number(file.originalSize || file.tamanho);
    
    if (file.isChunked && file.totalChunks > 1 && fileSize > MAX_LEGACY_SIZE) {
      return c.json({ 
        message: 'Ficheiro muito grande para download direto. Use o download por chunks.',
        error: 'file_too_large',
        fileSize: fileSize,
        maxSize: MAX_LEGACY_SIZE,
        useChunkedDownload: true,
        chunksInfoUrl: `/api/files/${fileId}/chunks-info`
      }, 413);
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

fileRoutes.get('/:id/download-data', async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const fileId = c.req.param('id');
    
    const db = createDb(c.env.DATABASE_URL);
    
    const [file] = await db.select().from(files).where(eq(files.id, fileId));
    if (!file) {
      return c.json({ message: 'Arquivo não encontrado' }, 404);
    }
    
    const isOwner = file.userId === user.id;
    
    // Verificar acesso: dono, permissão direta no arquivo, ou permissão na pasta (com herança)
    let hasAccess = isOwner;
    let foundFolderPerm: typeof folderPermissions.$inferSelect | null = null;
    
    if (!hasAccess && file.folderId) {
      // Verificar permissão na pasta ou em qualquer pasta ancestral
      let currentFolderId: string | null = file.folderId;
      while (currentFolderId && !hasAccess) {
        const [folderPerm] = await db.select().from(folderPermissions)
          .where(and(
            eq(folderPermissions.folderId, currentFolderId),
            eq(folderPermissions.userId, user.id)
          ));
        if (folderPerm) {
          hasAccess = true;
          foundFolderPerm = folderPerm;
          break;
        }
        // Verificar pasta pai
        const [parentFolder] = await db.select().from(folders).where(eq(folders.id, currentFolderId));
        currentFolderId = parentFolder?.parentId || null;
      }
    }
    
    let foundFilePerm: typeof filePermissions.$inferSelect | null = null;
    if (!hasAccess) {
      // Verificar permissão direta no arquivo
      const [filePerm] = await db.select().from(filePermissions)
        .where(and(
          eq(filePermissions.fileId, fileId),
          eq(filePermissions.userId, user.id)
        ));
      if (filePerm) {
        hasAccess = true;
        foundFilePerm = filePerm;
      }
    }
    
    if (!hasAccess) {
      return c.json({ message: 'Acesso negado' }, 403);
    }
    
    // Buscar chave de encriptação compartilhada
    let sharedEncryptionKey: string | undefined;
    if (!isOwner) {
      // Usar permissões já encontradas
      if (foundFolderPerm?.sharedEncryptionKey) {
        sharedEncryptionKey = foundFolderPerm.sharedEncryptionKey;
      } else if (foundFilePerm?.sharedEncryptionKey) {
        sharedEncryptionKey = foundFilePerm.sharedEncryptionKey;
      }
    }
    
    return c.json({
      id: file.id,
      nome: file.nome,
      tamanho: file.tamanho,
      tipoMime: file.tipoMime,
      createdAt: file.createdAt,
      isEncrypted: file.isEncrypted || false,
      encryptionVersion: file.encryptionVersion || 1,
      isOwner: isOwner,
      originalMimeType: file.originalMimeType || file.tipoMime,
      originalSize: file.originalSize || file.tamanho,
      downloadUrl: `/api/files/${fileId}/download`,
      previewUrl: `/api/files/${fileId}/preview`,
      contentUrl: `/api/files/${fileId}/content`,
      sharedEncryptionKey: sharedEncryptionKey,
    });
  } catch (error) {
    console.error('Download data error:', error);
    return c.json({ message: 'Erro ao buscar dados do arquivo' }, 500);
  }
});

fileRoutes.get('/:id/content', async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const fileId = c.req.param('id');
    
    const db = createDb(c.env.DATABASE_URL);
    
    const [file] = await db.select().from(files).where(eq(files.id, fileId));
    if (!file) {
      return c.json({ message: 'Arquivo não encontrado' }, 404);
    }
    
    const isOwner = file.userId === user.id;
    
    // Verificar acesso: dono, permissão direta no arquivo, ou permissão na pasta (com herança)
    let hasAccess = isOwner;
    
    if (!hasAccess && file.folderId) {
      // Verificar permissão na pasta ou em qualquer pasta ancestral
      let currentFolderId: string | null = file.folderId;
      while (currentFolderId && !hasAccess) {
        const [folderPerm] = await db.select().from(folderPermissions)
          .where(and(
            eq(folderPermissions.folderId, currentFolderId),
            eq(folderPermissions.userId, user.id)
          ));
        if (folderPerm) {
          hasAccess = true;
          break;
        }
        // Verificar pasta pai
        const [parentFolder] = await db.select().from(folders).where(eq(folders.id, currentFolderId));
        currentFolderId = parentFolder?.parentId || null;
      }
    }
    
    if (!hasAccess) {
      // Verificar permissão direta no arquivo
      const [filePerm] = await db.select().from(filePermissions)
        .where(and(
          eq(filePermissions.fileId, fileId),
          eq(filePermissions.userId, user.id)
        ));
      hasAccess = !!filePerm;
    }
    
    if (!hasAccess) {
      return c.json({ message: 'Não autorizado' }, 403);
    }
    
    if (!file.telegramFileId || !file.telegramBotId) {
      return c.json({ message: 'Arquivo sem referência de download' }, 400);
    }
    
    const MAX_LEGACY_SIZE = 50 * 1024 * 1024;
    const fileSize = Number(file.originalSize || file.tamanho);
    
    if (file.isChunked && file.totalChunks > 1 && fileSize > MAX_LEGACY_SIZE) {
      return c.json({ 
        message: 'Ficheiro muito grande para download direto. Use o download por chunks.',
        error: 'file_too_large',
        fileSize: fileSize,
        maxSize: MAX_LEGACY_SIZE,
        useChunkedDownload: true,
        chunksInfoUrl: `/api/files/${fileId}/chunks-info`
      }, 413);
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
    console.error('Content error:', error);
    return c.json({ message: 'Erro ao buscar conteúdo do arquivo' }, 500);
  }
});

fileRoutes.delete('/:id', async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const fileId = c.req.param('id');
    
    const db = createDb(c.env.DATABASE_URL);
    
    const [file] = await db.select().from(files).where(eq(files.id, fileId));
    if (!file) {
      return c.json({ message: 'Arquivo não encontrado' }, 404);
    }
    
    // Verificar permissão: dono do ficheiro, quem fez upload, ou colaborador da pasta (com herança)
    const isOwner = file.userId === user.id;
    const isUploader = file.uploadedByUserId === user.id;
    let isCollaborator = false;
    
    if (!isOwner && !isUploader && file.folderId) {
      // Verificar permissão na pasta ou em qualquer pasta ancestral
      let currentFolderId: string | null = file.folderId;
      while (currentFolderId && !isCollaborator) {
        const [permission] = await db.select().from(folderPermissions)
          .where(and(
            eq(folderPermissions.folderId, currentFolderId),
            eq(folderPermissions.userId, user.id)
          ));
        if (permission?.role === 'collaborator') {
          isCollaborator = true;
          break;
        }
        // Verificar pasta pai
        const [parentFolder] = await db.select().from(folders).where(eq(folders.id, currentFolderId));
        currentFolderId = parentFolder?.parentId || null;
      }
    }
    
    if (!isOwner && !isUploader && !isCollaborator) {
      return c.json({ message: 'Não tem permissão para eliminar este ficheiro' }, 403);
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

fileRoutes.get('/:id/preview', async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const fileId = c.req.param('id');
    
    const db = createDb(c.env.DATABASE_URL);
    
    const [file] = await db.select().from(files).where(eq(files.id, fileId));
    if (!file) {
      return c.json({ message: 'Arquivo não encontrado' }, 404);
    }
    
    // Verificar acesso: dono, permissão direta no arquivo, ou permissão na pasta (com herança)
    const isOwner = file.userId === user.id;
    let hasAccess = isOwner;
    
    if (!hasAccess && file.folderId) {
      // Verificar permissão na pasta ou em qualquer pasta ancestral
      let currentFolderId: string | null = file.folderId;
      while (currentFolderId && !hasAccess) {
        const [folderPerm] = await db.select().from(folderPermissions)
          .where(and(
            eq(folderPermissions.folderId, currentFolderId),
            eq(folderPermissions.userId, user.id)
          ));
        if (folderPerm) {
          hasAccess = true;
          break;
        }
        // Verificar pasta pai
        const [parentFolder] = await db.select().from(folders).where(eq(folders.id, currentFolderId));
        currentFolderId = parentFolder?.parentId || null;
      }
    }
    
    if (!hasAccess) {
      // Verificar permissão direta no arquivo
      const [filePerm] = await db.select().from(filePermissions)
        .where(and(
          eq(filePermissions.fileId, fileId),
          eq(filePermissions.userId, user.id)
        ));
      hasAccess = !!filePerm;
    }
    
    if (!hasAccess) {
      return c.json({ message: 'Acesso negado' }, 403);
    }
    
    if (!file.telegramFileId || !file.telegramBotId) {
      return c.json({ message: 'Arquivo não disponível' }, 404);
    }
    
    const telegramService = new TelegramService(c.env);
    const downloadUrl = await telegramService.getDownloadUrl(file.telegramFileId, file.telegramBotId);
    
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      return c.json({ message: 'Erro ao buscar arquivo' }, 500);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    return new Response(arrayBuffer, {
      headers: {
        'Content-Type': file.isEncrypted ? 'application/octet-stream' : (file.originalMimeType || file.tipoMime),
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
        'Content-Disposition': `inline; filename="${file.nome}"`
      }
    });
  } catch (error) {
    console.error('Preview error:', error);
    return c.json({ message: 'Erro ao obter preview' }, 500);
  }
});

fileRoutes.get('/:id/stream', async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const fileId = c.req.param('id');
    
    const db = createDb(c.env.DATABASE_URL);
    
    const [file] = await db.select().from(files).where(eq(files.id, fileId));
    if (!file) {
      return c.json({ message: 'Arquivo não encontrado' }, 404);
    }
    
    // Verificar acesso: dono, permissão direta no arquivo, ou permissão na pasta (com herança)
    const isOwner = file.userId === user.id;
    let hasAccess = isOwner;
    
    if (!hasAccess && file.folderId) {
      // Verificar permissão na pasta ou em qualquer pasta ancestral
      let currentFolderId: string | null = file.folderId;
      while (currentFolderId && !hasAccess) {
        const [folderPerm] = await db.select().from(folderPermissions)
          .where(and(
            eq(folderPermissions.folderId, currentFolderId),
            eq(folderPermissions.userId, user.id)
          ));
        if (folderPerm) {
          hasAccess = true;
          break;
        }
        // Verificar pasta pai
        const [parentFolder] = await db.select().from(folders).where(eq(folders.id, currentFolderId));
        currentFolderId = parentFolder?.parentId || null;
      }
    }
    
    if (!hasAccess) {
      // Verificar permissão direta no arquivo
      const [filePerm] = await db.select().from(filePermissions)
        .where(and(
          eq(filePermissions.fileId, fileId),
          eq(filePermissions.userId, user.id)
        ));
      hasAccess = !!filePerm;
    }
    
    if (!hasAccess) {
      return c.json({ message: 'Acesso negado' }, 403);
    }
    
    if (!file.telegramFileId || !file.telegramBotId) {
      return c.json({ message: 'Arquivo não disponível' }, 404);
    }
    
    const mimeType = file.originalMimeType || file.tipoMime;
    
    // Accept video, image and audio files for streaming
    if (!mimeType.startsWith('video/') && !mimeType.startsWith('image/') && !mimeType.startsWith('audio/')) {
      return c.json({ message: 'Este endpoint é apenas para mídia' }, 400);
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
        'Content-Type': mimeType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600'
      }
    });
  } catch (error) {
    console.error('Stream error:', error);
    return c.json({ message: 'Erro ao fazer stream' }, 500);
  }
});

const CHUNK_SIZE = 10 * 1024 * 1024;

fileRoutes.post('/init-upload', async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const body = await c.req.json();
    
    const { fileName, fileSize, mimeType, folderId, isEncrypted: clientSentEncrypted, originalMimeType, originalSize } = body;
    
    console.log(`📂 Init upload: fileName=${fileName}, fileSize=${fileSize}, mimeType=${mimeType}`);
    
    if (!fileName || !fileSize || !mimeType) {
      console.error('❌ Init upload: parâmetros obrigatórios faltando');
      return c.json({ message: 'fileName, fileSize e mimeType são obrigatórios' }, 400);
    }
    
    const db = createDb(c.env.DATABASE_URL);
    
    // Check if uploading to a public folder - encryption is not allowed
    let isFolderPublic = false;
    if (folderId) {
      isFolderPublic = await isFolderOrAncestorPublic(db, folderId);
    }
    
    // For public folders, always store without encryption (silently force plaintext like Express server)
    const isEncrypted = isFolderPublic ? false : (clientSentEncrypted || false);
    
    const [currentUser] = await db.select().from(users).where(eq(users.id, user.id));
    if (!currentUser) {
      console.error(`❌ Init upload: usuário não encontrado (${user.id})`);
      return c.json({ message: 'Utilizador não encontrado' }, 404);
    }
    
    const actualSize = originalSize || fileSize;
    if (Number(currentUser.storageUsed) + actualSize > Number(currentUser.storageLimit)) {
      console.error(`❌ Init upload: quota excedida (used=${currentUser.storageUsed}, limit=${currentUser.storageLimit})`);
      return c.json({ 
        message: 'Quota de armazenamento excedida',
        storageUsed: Number(currentUser.storageUsed),
        storageLimit: Number(currentUser.storageLimit),
      }, 400);
    }
    
    const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    
    console.log(`📂 Init upload: criando sessão com ${totalChunks} chunks...`);
    
    const [session] = await db.insert(uploadSessions).values({
      userId: user.id,
      fileName,
      fileSize,
      mimeType,
      totalChunks,
      folderId: folderId || null,
      isEncrypted: isEncrypted || false,
      originalMimeType: originalMimeType || mimeType,
      originalSize: originalSize || fileSize,
      expiresAt,
    }).returning();
    
    console.log(`✅ Init upload: sessão criada com id=${session.id}, totalChunks=${totalChunks}`);
    
    return c.json({
      sessionId: session.id,
      totalChunks,
      chunkSize: CHUNK_SIZE,
      expiresAt: session.expiresAt,
    });
  } catch (error: any) {
    console.error('❌ Init upload error:', error);
    console.error('❌ Init upload stack:', error.stack);
    return c.json({ 
      message: 'Erro ao iniciar upload',
      error: error.message 
    }, 500);
  }
});

fileRoutes.post('/upload-chunk', async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const formData = await c.req.formData();
    
    const sessionId = formData.get('sessionId') as string;
    const chunkIndex = parseInt(formData.get('chunkIndex') as string, 10);
    const chunk = formData.get('chunk') as File;
    
    console.log(`📦 Upload chunk: sessionId=${sessionId}, chunkIndex=${chunkIndex}, size=${chunk?.size || 0}`);
    
    if (!sessionId || isNaN(chunkIndex) || !chunk) {
      console.error('❌ Upload chunk: parâmetros inválidos');
      return c.json({ message: 'sessionId, chunkIndex e chunk são obrigatórios' }, 400);
    }
    
    const db = createDb(c.env.DATABASE_URL);
    
    const [session] = await db.select().from(uploadSessions).where(eq(uploadSessions.id, sessionId));
    if (!session) {
      console.error(`❌ Upload chunk: sessão não encontrada (${sessionId})`);
      return c.json({ message: 'Sessão de upload não encontrada' }, 404);
    }
    
    if (session.userId !== user.id) {
      console.error(`❌ Upload chunk: acesso negado`);
      return c.json({ message: 'Acesso negado' }, 403);
    }
    
    if (session.status !== 'pending') {
      console.error(`❌ Upload chunk: sessão não está pendente (status=${session.status})`);
      return c.json({ message: 'Sessão de upload já foi concluída ou cancelada' }, 400);
    }
    
    if (new Date() > new Date(session.expiresAt)) {
      console.error(`❌ Upload chunk: sessão expirou`);
      await db.delete(uploadChunks).where(eq(uploadChunks.sessionId, sessionId));
      await db.delete(uploadSessions).where(eq(uploadSessions.id, sessionId));
      return c.json({ message: 'Sessão de upload expirou' }, 400);
    }
    
    if (chunkIndex < 0 || chunkIndex >= session.totalChunks) {
      console.error(`❌ Upload chunk: índice inválido (${chunkIndex}, esperado: 0-${session.totalChunks - 1})`);
      return c.json({ message: `Índice de chunk inválido. Esperado: 0-${session.totalChunks - 1}` }, 400);
    }
    
    const existingChunk = await db.select().from(uploadChunks)
      .where(and(
        eq(uploadChunks.sessionId, sessionId),
        eq(uploadChunks.chunkIndex, chunkIndex)
      ));
    
    if (existingChunk.length > 0) {
      console.log(`📦 Upload chunk: chunk ${chunkIndex} já existe, retornando sucesso`);
      const currentChunks = await db.select().from(uploadChunks)
        .where(eq(uploadChunks.sessionId, sessionId));
      return c.json({
        success: true,
        chunkIndex,
        uploadedChunks: currentChunks.length,
        totalChunks: session.totalChunks,
        message: 'Chunk já foi enviado anteriormente'
      });
    }
    
    const telegram = new TelegramService(c.env);
    if (!telegram.isAvailable()) {
      console.error(`❌ Upload chunk: Telegram não disponível`);
      return c.json({ message: 'Serviço de armazenamento temporariamente indisponível' }, 503);
    }
    
    console.log(`📦 Upload chunk: enviando chunk ${chunkIndex + 1}/${session.totalChunks} para Telegram...`);
    const chunkBuffer = await chunk.arrayBuffer();
    const uploadResult = await telegram.uploadFile(chunkBuffer, `${session.fileName}.chunk${chunkIndex}`);
    console.log(`📦 Upload chunk: chunk ${chunkIndex + 1} enviado com sucesso, fileId=${uploadResult.fileId}`);
    
    await db.insert(uploadChunks).values({
      sessionId,
      chunkIndex,
      telegramFileId: uploadResult.fileId,
      telegramBotId: uploadResult.botId,
      chunkSize: chunk.size,
    });
    
    const allChunks = await db.select().from(uploadChunks)
      .where(eq(uploadChunks.sessionId, sessionId));
    
    await db.update(uploadSessions)
      .set({ uploadedChunks: allChunks.length })
      .where(eq(uploadSessions.id, sessionId));
    
    console.log(`✅ Upload chunk: chunk ${chunkIndex + 1}/${session.totalChunks} salvo (total: ${allChunks.length})`);
    
    return c.json({
      success: true,
      chunkIndex,
      uploadedChunks: allChunks.length,
      totalChunks: session.totalChunks,
    });
  } catch (error: any) {
    console.error('❌ Upload chunk error:', error);
    console.error('❌ Upload chunk stack:', error.stack);
    
    const errorMessage = error.message || 'Erro ao enviar chunk';
    
    if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
      return c.json({ 
        message: 'Chunk demorou demais para enviar. Tente novamente.',
        error: 'timeout'
      }, 408);
    }
    
    return c.json({ 
      message: errorMessage,
      error: 'chunk_upload_failed'
    }, 500);
  }
});

fileRoutes.post('/complete-upload', async (c) => {
  try {
    console.log('📋 Complete upload: iniciando...');
    const user = c.get('user') as JWTPayload;
    const body = await c.req.json();
    const { sessionId } = body;
    
    console.log(`📋 Complete upload: sessionId=${sessionId}, userId=${user.id}`);
    
    if (!sessionId) {
      console.error('❌ Complete upload: sessionId não fornecido');
      return c.json({ message: 'sessionId é obrigatório' }, 400);
    }
    
    const db = createDb(c.env.DATABASE_URL);
    
    const [session] = await db.select().from(uploadSessions).where(eq(uploadSessions.id, sessionId));
    if (!session) {
      console.error(`❌ Complete upload: sessão não encontrada (${sessionId})`);
      return c.json({ message: 'Sessão de upload não encontrada' }, 404);
    }
    
    console.log(`📋 Complete upload: sessão encontrada, totalChunks=${session.totalChunks}`);
    
    if (session.userId !== user.id) {
      console.error(`❌ Complete upload: acesso negado (session.userId=${session.userId}, user.id=${user.id})`);
      return c.json({ message: 'Acesso negado' }, 403);
    }
    
    const chunks = await db.select().from(uploadChunks)
      .where(eq(uploadChunks.sessionId, sessionId))
      .orderBy(uploadChunks.chunkIndex);
    
    console.log(`📋 Complete upload: chunks encontrados=${chunks.length}, esperados=${session.totalChunks}`);
    
    if (chunks.length !== session.totalChunks) {
      console.error(`❌ Complete upload: chunks incompletos (${chunks.length}/${session.totalChunks})`);
      return c.json({ 
        message: `Faltam chunks. Enviados: ${chunks.length}, Esperados: ${session.totalChunks}` 
      }, 400);
    }
    
    const mainChunk = chunks[0];
    console.log(`📋 Complete upload: criando registro do ficheiro...`);
    
    // Always recompute encryption status from live folder state (handles race conditions)
    let finalIsEncrypted = session.isEncrypted;
    if (session.folderId) {
      const isFolderPublic = await isFolderOrAncestorPublic(db, session.folderId);
      if (isFolderPublic) {
        console.log(`📋 Complete upload: pasta é pública, forçando isEncrypted=false`);
        finalIsEncrypted = false;
      }
    }
    
    const [newFile] = await db.insert(files).values({
      userId: user.id,
      uploadedByUserId: user.id,
      folderId: session.folderId,
      nome: session.fileName,
      tamanho: session.fileSize,
      tipoMime: session.mimeType,
      telegramFileId: mainChunk.telegramFileId,
      telegramBotId: mainChunk.telegramBotId,
      isEncrypted: finalIsEncrypted,
      originalMimeType: session.originalMimeType,
      originalSize: session.originalSize,
      isChunked: chunks.length > 1,
      totalChunks: chunks.length,
    }).returning();
    
    console.log(`📋 Complete upload: ficheiro criado com id=${newFile.id}`);
    
    if (chunks.length > 1) {
      console.log(`📋 Complete upload: salvando ${chunks.length} chunks no banco...`);
      const fileChunksData = chunks.map(chunk => ({
        fileId: newFile.id,
        chunkIndex: chunk.chunkIndex,
        telegramFileId: chunk.telegramFileId,
        telegramBotId: chunk.telegramBotId,
        chunkSize: chunk.chunkSize,
      }));
      await db.insert(fileChunks).values(fileChunksData);
    }
    
    const actualSize = session.originalSize || session.fileSize;
    console.log(`📋 Complete upload: atualizando storage do usuário (+${actualSize} bytes)`);
    
    await db.update(users)
      .set({ 
        storageUsed: sql`${users.storageUsed} + ${actualSize}`,
        uploadsCount: sql`${users.uploadsCount} + 1`
      })
      .where(eq(users.id, user.id));
    
    console.log(`📋 Complete upload: limpando sessão de upload...`);
    await db.delete(uploadChunks).where(eq(uploadChunks.sessionId, sessionId));
    await db.delete(uploadSessions).where(eq(uploadSessions.id, sessionId));
    
    console.log(`✅ Complete upload: sucesso! ficheiro=${session.fileName}`);
    return c.json(newFile);
  } catch (error: any) {
    console.error('❌ Complete upload error:', error);
    console.error('❌ Complete upload stack:', error.stack);
    return c.json({ 
      message: 'Erro ao completar upload',
      error: error.message 
    }, 500);
  }
});

fileRoutes.delete('/upload-session/:sessionId', async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const sessionId = c.req.param('sessionId');
    
    const db = createDb(c.env.DATABASE_URL);
    
    const [session] = await db.select().from(uploadSessions).where(eq(uploadSessions.id, sessionId));
    if (!session) {
      return c.json({ message: 'Sessão não encontrada' }, 404);
    }
    
    if (session.userId !== user.id) {
      return c.json({ message: 'Acesso negado' }, 403);
    }
    
    await db.delete(uploadChunks).where(eq(uploadChunks.sessionId, sessionId));
    await db.delete(uploadSessions).where(eq(uploadSessions.id, sessionId));
    
    return c.json({ success: true, message: 'Sessão de upload cancelada' });
  } catch (error) {
    console.error('Cancel upload error:', error);
    return c.json({ message: 'Erro ao cancelar upload' }, 500);
  }
});

fileRoutes.post('/:id/reprocess', async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const fileId = c.req.param('id');
    const formData = await c.req.formData();
    
    const file = formData.get('file') as File;
    if (!file) {
      return c.json({ message: 'Nenhum arquivo enviado' }, 400);
    }
    
    const isEncrypted = formData.get('isEncrypted') === 'true';
    const originalMimeType = formData.get('originalMimeType') as string;
    const originalSize = formData.get('originalSize') 
      ? parseInt(formData.get('originalSize') as string, 10) 
      : file.size;
    
    const db = createDb(c.env.DATABASE_URL);
    
    const [existingFile] = await db.select().from(files).where(eq(files.id, fileId));
    if (!existingFile || existingFile.userId !== user.id) {
      return c.json({ message: 'Ficheiro não encontrado' }, 404);
    }
    
    const telegram = new TelegramService(c.env);
    
    if (!telegram.isAvailable()) {
      return c.json({ 
        message: 'Serviço de armazenamento temporariamente indisponível.'
      }, 503);
    }
    
    const fileBuffer = await file.arrayBuffer();
    const uploadResult = await telegram.uploadLargeFile(fileBuffer, existingFile.nome);
    
    const mainFileId = uploadResult.chunks[0].fileId;
    const mainBotId = uploadResult.chunks[0].botId;
    
    if (existingFile.isChunked && existingFile.totalChunks > 1) {
      await db.delete(fileChunks).where(eq(fileChunks.fileId, fileId));
    }
    
    await db.update(files)
      .set({
        telegramFileId: mainFileId,
        telegramBotId: mainBotId,
        isEncrypted,
        tipoMime: isEncrypted ? 'application/octet-stream' : originalMimeType,
        originalMimeType,
        originalSize,
        tamanho: file.size,
        isChunked: uploadResult.isChunked,
        totalChunks: uploadResult.chunks.length,
      })
      .where(eq(files.id, fileId));
    
    if (uploadResult.isChunked && uploadResult.chunks.length > 1) {
      const chunksData = uploadResult.chunks.map(chunk => ({
        fileId: fileId,
        chunkIndex: chunk.chunkIndex,
        telegramFileId: chunk.fileId,
        telegramBotId: chunk.botId,
        chunkSize: chunk.chunkSize,
      }));
      await db.insert(fileChunks).values(chunksData);
    }
    
    const [updatedFile] = await db.select().from(files).where(eq(files.id, fileId));
    
    return c.json({
      message: 'Ficheiro reprocessado com sucesso',
      file: updatedFile,
    });
  } catch (error) {
    console.error('Reprocess file error:', error);
    return c.json({ message: 'Erro ao reprocessar ficheiro' }, 500);
  }
});

fileRoutes.get('/:id/shares', async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const fileId = c.req.param('id');
    
    const db = createDb(c.env.DATABASE_URL);
    
    const [file] = await db.select().from(files).where(eq(files.id, fileId));
    if (!file || file.userId !== user.id) {
      return c.json({ message: 'Ficheiro não encontrado' }, 404);
    }
    
    const permissions = await db.select().from(filePermissions)
      .where(eq(filePermissions.fileId, fileId));
    
    const sharesWithUsers = await Promise.all(
      permissions.map(async (perm) => {
        const [permUser] = await db.select().from(users).where(eq(users.id, perm.userId));
        return {
          id: perm.id,
          fileId: perm.fileId,
          userId: perm.userId,
          role: perm.role,
          grantedBy: perm.grantedBy,
          sharedEncryptionKey: perm.sharedEncryptionKey,
          createdAt: perm.createdAt,
          user: permUser ? {
            id: permUser.id,
            username: permUser.username,
            email: permUser.email,
          } : null,
        };
      })
    );
    
    return c.json(sharesWithUsers);
  } catch (error) {
    console.error('Get file shares error:', error);
    return c.json({ message: 'Erro ao buscar partilhas' }, 500);
  }
});

fileRoutes.delete('/:id/shares/:shareId', async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const fileId = c.req.param('id');
    const shareId = c.req.param('shareId');
    
    const db = createDb(c.env.DATABASE_URL);
    
    const [file] = await db.select().from(files).where(eq(files.id, fileId));
    if (!file || file.userId !== user.id) {
      return c.json({ message: 'Ficheiro não encontrado ou acesso negado' }, 404);
    }
    
    const [permission] = await db.select().from(filePermissions)
      .where(and(
        eq(filePermissions.id, shareId),
        eq(filePermissions.fileId, fileId)
      ));
    
    if (!permission) {
      return c.json({ message: 'Partilha não encontrada' }, 404);
    }
    
    await db.delete(filePermissions).where(eq(filePermissions.id, shareId));
    
    return c.json({ message: 'Partilha removida com sucesso' });
  } catch (error) {
    console.error('Delete file share error:', error);
    return c.json({ message: 'Erro ao remover partilha' }, 500);
  }
});

fileRoutes.get('/:id/chunks-info', async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const fileId = c.req.param('id');
    
    const db = createDb(c.env.DATABASE_URL);
    
    const [file] = await db.select().from(files).where(eq(files.id, fileId));
    if (!file) {
      return c.json({ message: 'Arquivo não encontrado' }, 404);
    }
    
    const isOwner = file.userId === user.id;
    let hasAccess = isOwner;
    
    if (!hasAccess && file.folderId) {
      // Verificar permissão na pasta ou em qualquer pasta ancestral
      let currentFolderId: string | null = file.folderId;
      while (currentFolderId && !hasAccess) {
        const [folderPerm] = await db.select().from(folderPermissions)
          .where(and(
            eq(folderPermissions.folderId, currentFolderId),
            eq(folderPermissions.userId, user.id)
          ));
        if (folderPerm) {
          hasAccess = true;
          break;
        }
        // Verificar pasta pai
        const [parentFolder] = await db.select().from(folders).where(eq(folders.id, currentFolderId));
        currentFolderId = parentFolder?.parentId || null;
      }
    }
    
    if (!hasAccess) {
      const [filePerm] = await db.select().from(filePermissions)
        .where(and(
          eq(filePermissions.fileId, fileId),
          eq(filePermissions.userId, user.id)
        ));
      hasAccess = !!filePerm;
    }
    
    if (!hasAccess) {
      return c.json({ message: 'Acesso negado' }, 403);
    }
    
    if (!file.isChunked || file.totalChunks <= 1) {
      return c.json({
        isChunked: false,
        totalChunks: 1,
        totalSize: file.tamanho,
        chunks: [{
          index: 0,
          size: file.tamanho,
        }],
      });
    }
    
    const chunks = await db.select().from(fileChunks)
      .where(eq(fileChunks.fileId, file.id))
      .orderBy(fileChunks.chunkIndex);
    
    return c.json({
      isChunked: true,
      totalChunks: chunks.length,
      totalSize: file.tamanho,
      originalSize: file.originalSize || file.tamanho,
      isEncrypted: file.isEncrypted,
      originalMimeType: file.originalMimeType || file.tipoMime,
      chunks: chunks.map(chunk => ({
        index: chunk.chunkIndex,
        size: chunk.chunkSize,
      })),
    });
  } catch (error) {
    console.error('Get chunks info error:', error);
    return c.json({ message: 'Erro ao buscar informações dos chunks' }, 500);
  }
});

fileRoutes.get('/:id/chunk/:index', async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const fileId = c.req.param('id');
    const chunkIndex = parseInt(c.req.param('index'), 10);
    
    if (isNaN(chunkIndex) || chunkIndex < 0) {
      return c.json({ message: 'Índice de chunk inválido' }, 400);
    }
    
    const db = createDb(c.env.DATABASE_URL);
    
    const [file] = await db.select().from(files).where(eq(files.id, fileId));
    if (!file) {
      return c.json({ message: 'Arquivo não encontrado' }, 404);
    }
    
    const isOwner = file.userId === user.id;
    let hasAccess = isOwner;
    
    if (!hasAccess && file.folderId) {
      // Verificar permissão na pasta ou em qualquer pasta ancestral
      let currentFolderId: string | null = file.folderId;
      while (currentFolderId && !hasAccess) {
        const [folderPerm] = await db.select().from(folderPermissions)
          .where(and(
            eq(folderPermissions.folderId, currentFolderId),
            eq(folderPermissions.userId, user.id)
          ));
        if (folderPerm) {
          hasAccess = true;
          break;
        }
        // Verificar pasta pai
        const [parentFolder] = await db.select().from(folders).where(eq(folders.id, currentFolderId));
        currentFolderId = parentFolder?.parentId || null;
      }
    }
    
    if (!hasAccess) {
      const [filePerm] = await db.select().from(filePermissions)
        .where(and(
          eq(filePermissions.fileId, fileId),
          eq(filePermissions.userId, user.id)
        ));
      hasAccess = !!filePerm;
    }
    
    if (!hasAccess) {
      return c.json({ message: 'Acesso negado' }, 403);
    }
    
    const telegram = new TelegramService(c.env);
    
    if (!file.isChunked || file.totalChunks <= 1) {
      if (chunkIndex !== 0) {
        return c.json({ message: 'Arquivo não é chunked, apenas chunk 0 disponível' }, 400);
      }
      
      if (!file.telegramFileId || !file.telegramBotId) {
        return c.json({ message: 'Arquivo sem referência de download' }, 400);
      }
      
      const buffer = await telegram.downloadFile(file.telegramFileId, file.telegramBotId);
      
      return new Response(buffer, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': buffer.byteLength.toString(),
          'X-Chunk-Index': '0',
          'X-Total-Chunks': '1',
        },
      });
    }
    
    const [chunk] = await db.select().from(fileChunks)
      .where(and(
        eq(fileChunks.fileId, file.id),
        eq(fileChunks.chunkIndex, chunkIndex)
      ));
    
    if (!chunk) {
      return c.json({ message: `Chunk ${chunkIndex} não encontrado` }, 404);
    }
    
    const buffer = await telegram.downloadFile(chunk.telegramFileId, chunk.telegramBotId);
    
    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': buffer.byteLength.toString(),
        'X-Chunk-Index': chunkIndex.toString(),
        'X-Total-Chunks': file.totalChunks.toString(),
        'X-Chunk-Size': chunk.chunkSize.toString(),
      },
    });
  } catch (error) {
    console.error('Download chunk error:', error);
    return c.json({ message: 'Erro ao baixar chunk' }, 500);
  }
});
