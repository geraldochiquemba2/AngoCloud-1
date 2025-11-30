/**
 * Shared Content Routes for Cloudflare Workers
 */

import { Hono } from 'hono';
import { createDb } from '../db';
import { authMiddleware, JWTPayload } from '../middleware/auth';
import { files, folders, users, filePermissions, folderPermissions, fileChunks } from '../../../shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { TelegramService } from '../services/telegram';

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

export const sharedContentRoutes = new Hono<{ Bindings: Env }>();

sharedContentRoutes.use('*', authMiddleware);

sharedContentRoutes.get('/files', async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const db = createDb(c.env.DATABASE_URL);

    const permissions = await db.select().from(filePermissions)
      .where(eq(filePermissions.userId, user.id));
    
    if (permissions.length === 0) {
      return c.json([]);
    }

    const fileIds = permissions.map(p => p.fileId);
    
    const sharedFiles = await db.select().from(files)
      .where(and(
        sql`${files.id} IN (${sql.join(fileIds.map(id => sql`${id}`), sql`, `)})`,
        eq(files.isDeleted, false),
        sql`${files.userId} != ${user.id}`
      ))
      .orderBy(desc(files.createdAt));

    const enrichedFiles = await Promise.all(
      sharedFiles.map(async (file) => {
        const [owner] = await db.select().from(users).where(eq(users.id, file.userId));
        return {
          ...file,
          ownerName: owner?.nome || 'Desconhecido',
          ownerEmail: owner?.email || '',
        };
      })
    );

    return c.json(enrichedFiles);
  } catch (error) {
    console.error('Get shared files error:', error);
    return c.json({ message: 'Erro ao buscar ficheiros partilhados' }, 500);
  }
});

sharedContentRoutes.get('/folders', async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const db = createDb(c.env.DATABASE_URL);

    const permissions = await db.select().from(folderPermissions)
      .where(eq(folderPermissions.userId, user.id));
    
    if (permissions.length === 0) {
      return c.json([]);
    }

    const folderIds = permissions.map(p => p.folderId);
    
    const sharedFolders = await db.select().from(folders)
      .where(and(
        sql`${folders.id} IN (${sql.join(folderIds.map(id => sql`${id}`), sql`, `)})`,
        sql`${folders.userId} != ${user.id}`
      ))
      .orderBy(desc(folders.createdAt));

    const enrichedFolders = await Promise.all(
      sharedFolders.map(async (folder) => {
        const [owner] = await db.select().from(users).where(eq(users.id, folder.userId));
        const [permission] = permissions.filter(p => p.folderId === folder.id);
        return {
          ...folder,
          ownerName: owner?.nome || 'Desconhecido',
          ownerEmail: owner?.email || '',
          role: permission?.role || 'viewer',
        };
      })
    );

    return c.json(enrichedFolders);
  } catch (error) {
    console.error('Get shared folders error:', error);
    return c.json({ message: 'Erro ao buscar pastas partilhadas' }, 500);
  }
});

sharedContentRoutes.get('/files/:id/download-data', async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const fileId = c.req.param('id');
    
    const db = createDb(c.env.DATABASE_URL);
    
    const [file] = await db.select().from(files).where(eq(files.id, fileId));
    if (!file) {
      return c.json({ message: 'Arquivo não encontrado' }, 404);
    }
    
    const isOwner = file.userId === user.id;
    
    // Verificar acesso: permissão direta no arquivo ou na pasta
    let hasAccess = isOwner;
    let sharedEncryptionKey: string | undefined;
    
    if (!hasAccess && file.folderId) {
      const [folderPerm] = await db.select().from(folderPermissions)
        .where(and(
          eq(folderPermissions.folderId, file.folderId),
          eq(folderPermissions.userId, user.id)
        ));
      hasAccess = !!folderPerm;
      if (folderPerm) sharedEncryptionKey = folderPerm.sharedEncryptionKey || undefined;
    }
    
    if (!hasAccess) {
      const [filePerm] = await db.select().from(filePermissions)
        .where(and(
          eq(filePermissions.fileId, fileId),
          eq(filePermissions.userId, user.id)
        ));
      hasAccess = !!filePerm;
      if (filePerm) sharedEncryptionKey = filePerm.sharedEncryptionKey || undefined;
    }
    
    if (!hasAccess) {
      return c.json({ message: 'Acesso negado' }, 403);
    }
    
    return c.json({
      isEncrypted: file.isEncrypted || false,
      isOwner: isOwner,
      originalMimeType: file.originalMimeType || file.tipoMime,
      downloadUrl: `/api/files/${fileId}/download`,
      sharedEncryptionKey: sharedEncryptionKey,
    });
  } catch (error) {
    console.error('Shared file download-data error:', error);
    return c.json({ message: 'Erro ao buscar dados do arquivo' }, 500);
  }
});

sharedContentRoutes.get('/files/:id/content', async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const fileId = c.req.param('id');
    
    const db = createDb(c.env.DATABASE_URL);
    
    const [file] = await db.select().from(files).where(eq(files.id, fileId));
    if (!file) {
      return c.json({ message: 'Arquivo não encontrado' }, 404);
    }
    
    const isOwner = file.userId === user.id;
    
    // Verificar acesso
    let hasAccess = isOwner;
    
    if (!hasAccess && file.folderId) {
      const [folderPerm] = await db.select().from(folderPermissions)
        .where(and(
          eq(folderPermissions.folderId, file.folderId),
          eq(folderPermissions.userId, user.id)
        ));
      hasAccess = !!folderPerm;
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
      return c.json({ message: 'Não autorizado' }, 403);
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
        headers: { 'Content-Type': 'application/octet-stream' }
      });
    }
    
    const buffer = await telegram.downloadFile(file.telegramFileId, file.telegramBotId);
    
    return new Response(buffer, {
      headers: { 'Content-Type': 'application/octet-stream' }
    });
  } catch (error) {
    console.error('Shared file content error:', error);
    return c.json({ message: 'Erro ao buscar conteúdo do arquivo' }, 500);
  }
});

sharedContentRoutes.get('/folders/:id/content', async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const folderId = c.req.param('id');
    
    const db = createDb(c.env.DATABASE_URL);

    const [permission] = await db.select().from(folderPermissions)
      .where(and(
        eq(folderPermissions.folderId, folderId),
        eq(folderPermissions.userId, user.id)
      ));
    
    const [folder] = await db.select().from(folders).where(eq(folders.id, folderId));
    
    if (!folder) {
      return c.json({ message: 'Pasta não encontrada' }, 404);
    }
    
    if (!permission && folder.userId !== user.id) {
      return c.json({ message: 'Acesso negado' }, 403);
    }

    const [folderFiles, subFolders] = await Promise.all([
      db.select().from(files)
        .where(and(
          eq(files.folderId, folderId),
          eq(files.isDeleted, false)
        ))
        .orderBy(desc(files.createdAt)),
      db.select().from(folders)
        .where(eq(folders.parentId, folderId))
        .orderBy(desc(folders.createdAt)),
    ]);

    return c.json({ files: folderFiles, folders: subFolders });
  } catch (error) {
    console.error('Get shared folder content error:', error);
    return c.json({ message: 'Erro ao buscar conteúdo da pasta' }, 500);
  }
});

sharedContentRoutes.post('/files/:fileId/clone', async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const fileId = c.req.param('fileId');
    
    const db = createDb(c.env.DATABASE_URL);

    const [file] = await db.select().from(files).where(eq(files.id, fileId));
    if (!file) {
      return c.json({ message: 'Ficheiro não encontrado' }, 404);
    }

    const [permission] = await db.select().from(filePermissions)
      .where(and(
        eq(filePermissions.fileId, fileId),
        eq(filePermissions.userId, user.id)
      ));
    
    if (!permission && file.userId !== user.id) {
      return c.json({ message: 'Você não tem acesso a este ficheiro' }, 403);
    }

    const [currentUser] = await db.select().from(users).where(eq(users.id, user.id));
    if (!currentUser) {
      return c.json({ message: 'Utilizador não encontrado' }, 404);
    }

    if (currentUser.storageUsed + file.tamanho > currentUser.storageLimit) {
      return c.json({ message: 'Sem espaço suficiente para clonar este ficheiro' }, 400);
    }

    let clonedName: string;
    if (file.nome.includes("(Cópia)")) {
      clonedName = file.nome;
    } else {
      const lastDotIndex = file.nome.lastIndexOf(".");
      if (lastDotIndex > 0) {
        clonedName = `${file.nome.substring(0, lastDotIndex)} (Cópia)${file.nome.substring(lastDotIndex)}`;
      } else {
        clonedName = `${file.nome} (Cópia)`;
      }
    }

    const [clonedFile] = await db.insert(files).values({
      userId: user.id,
      nome: clonedName,
      tamanho: file.tamanho,
      tipoMime: file.tipoMime,
      telegramFileId: file.telegramFileId,
      telegramBotId: file.telegramBotId,
      isEncrypted: file.isEncrypted,
      originalMimeType: file.originalMimeType,
      originalSize: file.originalSize,
      isChunked: file.isChunked,
      totalChunks: file.totalChunks,
    }).returning();

    await db.update(users)
      .set({ storageUsed: currentUser.storageUsed + file.tamanho })
      .where(eq(users.id, user.id));

    return c.json({ success: true, message: 'Ficheiro clonado com sucesso', file: clonedFile });
  } catch (error) {
    console.error('Clone shared file error:', error);
    return c.json({ message: 'Erro ao clonar ficheiro' }, 500);
  }
});

sharedContentRoutes.delete('/files/:fileId', async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const fileId = c.req.param('fileId');
    
    const db = createDb(c.env.DATABASE_URL);

    const [file] = await db.select().from(files).where(eq(files.id, fileId));
    if (!file) {
      return c.json({ message: 'Ficheiro não encontrado' }, 404);
    }

    if (file.userId === user.id) {
      return c.json({ message: 'Não pode remover os seus próprios ficheiros da lista de partilhados' }, 400);
    }

    const [permission] = await db.select().from(filePermissions)
      .where(and(
        eq(filePermissions.fileId, fileId),
        eq(filePermissions.userId, user.id)
      ));
    
    if (!permission) {
      return c.json({ message: 'Não tem permissão direta para este ficheiro' }, 404);
    }

    await db.delete(filePermissions).where(eq(filePermissions.id, permission.id));

    return c.json({ success: true, message: 'Ficheiro removido da lista de partilhados' });
  } catch (error) {
    console.error('Remove shared file error:', error);
    return c.json({ message: 'Erro ao remover ficheiro partilhado' }, 500);
  }
});

sharedContentRoutes.delete('/folders/:folderId', async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const folderId = c.req.param('folderId');
    
    const db = createDb(c.env.DATABASE_URL);

    const [folder] = await db.select().from(folders).where(eq(folders.id, folderId));
    if (!folder) {
      return c.json({ message: 'Pasta não encontrada' }, 404);
    }

    if (folder.userId === user.id) {
      return c.json({ message: 'Não pode remover as suas próprias pastas da lista de partilhados' }, 400);
    }

    const [permission] = await db.select().from(folderPermissions)
      .where(and(
        eq(folderPermissions.folderId, folderId),
        eq(folderPermissions.userId, user.id)
      ));
    
    if (!permission) {
      return c.json({ message: 'Não tem permissão direta para esta pasta' }, 404);
    }

    await db.delete(folderPermissions).where(eq(folderPermissions.id, permission.id));

    return c.json({ success: true, message: 'Pasta removida da lista de partilhados' });
  } catch (error) {
    console.error('Remove shared folder error:', error);
    return c.json({ message: 'Erro ao remover pasta partilhada' }, 500);
  }
});
