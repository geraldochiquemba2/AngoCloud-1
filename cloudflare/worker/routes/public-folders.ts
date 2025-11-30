import { Hono } from 'hono';
import { Env } from '../index';
import { TelegramService } from '../services/telegram';
import { createDb } from '../db';
import { files, folders, users } from '../../../shared/schema';
import { eq, and, desc } from 'drizzle-orm';

export const publicFolderRoutes = new Hono<{ Bindings: Env }>();

type Database = ReturnType<typeof createDb>;

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

async function getFolderBySlugOrId(db: Database, slugOrId: string) {
  let result = await db.select({
    id: folders.id,
    nome: folders.nome,
    publishedAt: folders.publishedAt,
    userId: folders.userId,
    isPublic: folders.isPublic,
    parentId: folders.parentId,
  }).from(folders)
    .where(and(
      eq(folders.publicSlug, slugOrId),
      eq(folders.isPublic, true)
    ))
    .limit(1);

  if (result.length === 0) {
    result = await db.select({
      id: folders.id,
      nome: folders.nome,
      publishedAt: folders.publishedAt,
      userId: folders.userId,
      isPublic: folders.isPublic,
      parentId: folders.parentId,
    }).from(folders)
      .where(eq(folders.id, slugOrId))
      .limit(1);
    
    if (result.length > 0) {
      const isPublic = await isFolderOrAncestorPublic(db, result[0].id);
      if (!isPublic) {
        return null;
      }
    }
  }

  return result.length > 0 ? result[0] : null;
}

// Get public folder by slug or id
publicFolderRoutes.get('/folder/:slug', async (c) => {
  try {
    const slug = c.req.param('slug');
    const db = createDb(c.env.DATABASE_URL);

    const folder = await getFolderBySlugOrId(db, slug);

    if (!folder) {
      return c.json({ message: 'Pasta não encontrada' }, 404);
    }
    
    const ownerResult = await db.select({ nome: users.nome })
      .from(users)
      .where(eq(users.id, folder.userId))
      .limit(1);

    return c.json({
      id: folder.id,
      nome: folder.nome,
      publishedAt: folder.publishedAt,
      ownerName: ownerResult[0]?.nome || 'Anónimo'
    });
  } catch (error) {
    console.error('Error fetching public folder:', error);
    return c.json({ message: 'Erro ao buscar pasta pública' }, 500);
  }
});

// Get public folder contents
publicFolderRoutes.get('/folder/:slug/contents', async (c) => {
  try {
    const slug = c.req.param('slug');
    const db = createDb(c.env.DATABASE_URL);

    const folder = await getFolderBySlugOrId(db, slug);

    if (!folder) {
      return c.json({ message: 'Pasta não encontrada' }, 404);
    }

    const folderId = folder.id;

    const [filesResult, foldersResult] = await Promise.all([
      db.select({
        id: files.id,
        nome: files.nome,
        tamanho: files.tamanho,
        tipoMime: files.tipoMime,
        createdAt: files.createdAt,
      }).from(files)
        .where(and(
          eq(files.folderId, folderId),
          eq(files.isDeleted, false),
          eq(files.isEncrypted, false)
        ))
        .orderBy(desc(files.createdAt)),
      db.select({
        id: folders.id,
        nome: folders.nome,
        createdAt: folders.createdAt,
      }).from(folders)
        .where(eq(folders.parentId, folderId))
        .orderBy(folders.nome)
    ]);

    return c.json({
      files: filesResult,
      folders: foldersResult
    });
  } catch (error) {
    console.error('Error fetching folder contents:', error);
    return c.json({ message: 'Erro ao buscar conteúdo' }, 500);
  }
});

// Preview file from public folder
publicFolderRoutes.get('/file/:fileId/preview', async (c) => {
  try {
    const fileId = c.req.param('fileId');
    const db = createDb(c.env.DATABASE_URL);
    
    const fileResult = await db.select({
      id: files.id,
      nome: files.nome,
      tamanho: files.tamanho,
      tipoMime: files.tipoMime,
      telegramFileId: files.telegramFileId,
      telegramBotId: files.telegramBotId,
      isEncrypted: files.isEncrypted,
      folderId: files.folderId,
    }).from(files)
      .where(and(
        eq(files.id, fileId),
        eq(files.isDeleted, false)
      ))
      .limit(1);

    if (fileResult.length === 0 || fileResult[0].isEncrypted) {
      return c.json({ message: 'Ficheiro não encontrado' }, 404);
    }

    const file = fileResult[0];
    
    if (!file.folderId) {
      return c.json({ message: 'Ficheiro não está numa pasta pública' }, 403);
    }

    const isPublic = await isFolderOrAncestorPublic(db, file.folderId);
    if (!isPublic) {
      return c.json({ message: 'Ficheiro não está numa pasta pública' }, 403);
    }
    
    if (!file.telegramFileId || !file.telegramBotId) {
      return c.json({ message: 'Ficheiro não disponível' }, 404);
    }
    
    const telegram = new TelegramService(c.env);
    const downloadUrl = await telegram.getDownloadUrl(file.telegramFileId, file.telegramBotId);
    
    return c.json({ 
      url: downloadUrl,
      tipoMime: file.tipoMime,
      nome: file.nome
    });
  } catch (error) {
    console.error('Error previewing file:', error);
    return c.json({ message: 'Erro ao obter preview' }, 500);
  }
});

// Stream file from public folder (for video thumbnails with CORS support)
publicFolderRoutes.get('/file/:fileId/stream', async (c) => {
  try {
    const fileId = c.req.param('fileId');
    const db = createDb(c.env.DATABASE_URL);
    
    const fileResult = await db.select({
      id: files.id,
      nome: files.nome,
      tamanho: files.tamanho,
      tipoMime: files.tipoMime,
      telegramFileId: files.telegramFileId,
      telegramBotId: files.telegramBotId,
      isEncrypted: files.isEncrypted,
      folderId: files.folderId,
    }).from(files)
      .where(and(
        eq(files.id, fileId),
        eq(files.isDeleted, false)
      ))
      .limit(1);

    if (fileResult.length === 0 || fileResult[0].isEncrypted) {
      return c.json({ message: 'Ficheiro não encontrado' }, 404);
    }

    const file = fileResult[0];
    
    if (!file.folderId) {
      return c.json({ message: 'Ficheiro não está numa pasta pública' }, 403);
    }

    const isPublic = await isFolderOrAncestorPublic(db, file.folderId);
    if (!isPublic) {
      return c.json({ message: 'Ficheiro não está numa pasta pública' }, 403);
    }
    
    if (!file.telegramFileId || !file.telegramBotId) {
      return c.json({ message: 'Ficheiro não disponível' }, 404);
    }
    
    const telegram = new TelegramService(c.env);
    const fileBuffer = await telegram.downloadFile(file.telegramFileId, file.telegramBotId);
    
    return new Response(fileBuffer, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'Content-Type': file.tipoMime,
        'Content-Length': file.tamanho.toString(),
        'Cache-Control': 'public, max-age=3600',
      }
    });
  } catch (error) {
    console.error('Error streaming file:', error);
    return c.json({ message: 'Erro ao transmitir ficheiro' }, 500);
  }
});

// Download file from public folder
publicFolderRoutes.get('/file/:fileId/download', async (c) => {
  try {
    const fileId = c.req.param('fileId');
    const db = createDb(c.env.DATABASE_URL);
    
    const fileResult = await db.select({
      id: files.id,
      nome: files.nome,
      tamanho: files.tamanho,
      tipoMime: files.tipoMime,
      telegramFileId: files.telegramFileId,
      telegramBotId: files.telegramBotId,
      isEncrypted: files.isEncrypted,
      folderId: files.folderId,
    }).from(files)
      .where(and(
        eq(files.id, fileId),
        eq(files.isDeleted, false)
      ))
      .limit(1);

    if (fileResult.length === 0 || fileResult[0].isEncrypted) {
      return c.json({ message: 'Ficheiro não encontrado' }, 404);
    }

    const file = fileResult[0];
    
    if (!file.folderId) {
      return c.json({ message: 'Ficheiro não está numa pasta pública' }, 403);
    }

    const isPublic = await isFolderOrAncestorPublic(db, file.folderId);
    if (!isPublic) {
      return c.json({ message: 'Ficheiro não está numa pasta pública' }, 403);
    }
    
    if (!file.telegramFileId || !file.telegramBotId) {
      return c.json({ message: 'Ficheiro não disponível' }, 404);
    }
    
    const telegram = new TelegramService(c.env);
    const fileBuffer = await telegram.downloadFile(file.telegramFileId, file.telegramBotId);
    
    return new Response(fileBuffer, {
      headers: {
        'Content-Type': file.tipoMime,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(file.nome)}"`,
        'Content-Length': file.tamanho.toString(),
      }
    });
  } catch (error) {
    console.error('Error downloading file:', error);
    return c.json({ message: 'Erro ao baixar ficheiro' }, 500);
  }
});
