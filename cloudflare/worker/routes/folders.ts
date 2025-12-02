/**
 * Folder Routes for Cloudflare Workers
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { createDb } from '../db';
import { authMiddleware, JWTPayload } from '../middleware/auth';
import { folders, folderPermissions, files } from '../../../shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

interface Env {
  DATABASE_URL: string;
  JWT_SECRET: string;
}

export const folderRoutes = new Hono<{ Bindings: Env }>();

folderRoutes.use('*', authMiddleware);

folderRoutes.get('/', async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const parentId = c.req.query('parentId');
    
    const db = createDb(c.env.DATABASE_URL);
    
    let query;
    if (parentId) {
      query = db.select().from(folders)
        .where(and(
          eq(folders.userId, user.id),
          eq(folders.parentId, parentId)
        ))
        .orderBy(desc(folders.createdAt));
    } else {
      query = db.select().from(folders)
        .where(and(
          eq(folders.userId, user.id),
          sql`${folders.parentId} IS NULL`
        ))
        .orderBy(desc(folders.createdAt));
    }
    
    const result = await query;
    return c.json(result);
  } catch (error) {
    console.error('Get folders error:', error);
    return c.json({ message: 'Erro ao buscar pastas' }, 500);
  }
});

folderRoutes.post('/', async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const { nome, parentId } = await c.req.json();
    
    if (!nome || nome.length < 1) {
      return c.json({ message: 'Nome da pasta é obrigatório' }, 400);
    }
    
    const db = createDb(c.env.DATABASE_URL);
    
    const [folder] = await db.insert(folders).values({
      userId: user.id,
      nome,
      parentId: parentId || null,
    }).returning();
    
    return c.json(folder);
  } catch (error) {
    console.error('Create folder error:', error);
    return c.json({ message: 'Erro ao criar pasta' }, 500);
  }
});

folderRoutes.delete('/:id', async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const folderId = c.req.param('id');
    
    const db = createDb(c.env.DATABASE_URL);
    
    const [folder] = await db.select().from(folders).where(eq(folders.id, folderId));
    if (!folder || folder.userId !== user.id) {
      return c.json({ message: 'Pasta não encontrada' }, 404);
    }
    
    await db.delete(folders).where(eq(folders.id, folderId));
    
    return c.json({ message: 'Pasta deletada com sucesso' });
  } catch (error) {
    console.error('Delete folder error:', error);
    return c.json({ message: 'Erro ao deletar pasta' }, 500);
  }
});

folderRoutes.patch('/:id/rename', async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const folderId = c.req.param('id');
    const { nome } = await c.req.json();
    
    if (!nome || nome.length < 1) {
      return c.json({ message: 'Nome inválido' }, 400);
    }
    
    const db = createDb(c.env.DATABASE_URL);
    
    const [folder] = await db.select().from(folders).where(eq(folders.id, folderId));
    if (!folder || folder.userId !== user.id) {
      return c.json({ message: 'Pasta não encontrada' }, 404);
    }
    
    await db.update(folders)
      .set({ nome })
      .where(eq(folders.id, folderId));
    
    return c.json({ message: 'Pasta renomeada com sucesso' });
  } catch (error) {
    console.error('Rename folder error:', error);
    return c.json({ message: 'Erro ao renomear pasta' }, 500);
  }
});

function generateSlug(length: number = 12): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

folderRoutes.get('/public', async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const db = createDb(c.env.DATABASE_URL);
    
    const result = await db.select().from(folders)
      .where(and(
        eq(folders.userId, user.id),
        eq(folders.isPublic, true)
      ))
      .orderBy(desc(folders.publishedAt));
    
    return c.json(result);
  } catch (error) {
    console.error('Get public folders error:', error);
    return c.json({ message: 'Erro ao buscar pastas públicas' }, 500);
  }
});

folderRoutes.post('/:id/make-public', async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const folderId = c.req.param('id');
    
    const db = createDb(c.env.DATABASE_URL);
    
    const [folder] = await db.select().from(folders).where(eq(folders.id, folderId));
    if (!folder || folder.userId !== user.id) {
      return c.json({ message: 'Pasta não encontrada' }, 404);
    }
    
    if (folder.isPublic && folder.publicSlug) {
      return c.json({ 
        message: 'Pasta já é pública',
        slug: folder.publicSlug,
        publicUrl: `/p/${folder.publicSlug}`
      });
    }
    
    // Verificar quantos ficheiros estão encriptados
    const encryptedFilesResult = await db.select({ id: files.id })
      .from(files)
      .where(and(
        eq(files.folderId, folderId),
        eq(files.isEncrypted, true),
        eq(files.isDeleted, false)
      ));
    
    const encryptedCount = encryptedFilesResult.length;
    
    const slug = generateSlug();
    
    // Tornar a pasta pública
    await db.update(folders)
      .set({ 
        isPublic: true, 
        publicSlug: slug,
        publishedAt: new Date()
      })
      .where(eq(folders.id, folderId));
    
    // Contar ficheiros visíveis (não encriptados e não deletados)
    const visibleFilesResult = await db.select({ id: files.id })
      .from(files)
      .where(and(
        eq(files.folderId, folderId),
        eq(files.isEncrypted, false),
        eq(files.isDeleted, false)
      ));
    
    return c.json({ 
      message: 'Pasta tornada pública com sucesso',
      slug,
      publicUrl: `/p/${slug}`,
      visibleFiles: visibleFilesResult.length,
      encryptedFiles: encryptedCount,
      warning: encryptedCount > 0 
        ? `${encryptedCount} ficheiro(s) encriptado(s) não serão visíveis. Para torná-los públicos, faça download, desencripte e reenvie sem encriptação.`
        : undefined
    });
  } catch (error) {
    console.error('Make folder public error:', error);
    return c.json({ message: 'Erro ao tornar pasta pública' }, 500);
  }
});

folderRoutes.post('/:id/make-private', async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const folderId = c.req.param('id');
    
    const db = createDb(c.env.DATABASE_URL);
    
    const [folder] = await db.select().from(folders).where(eq(folders.id, folderId));
    if (!folder || folder.userId !== user.id) {
      return c.json({ message: 'Pasta não encontrada' }, 404);
    }
    
    // Tornar a pasta privada
    await db.update(folders)
      .set({ 
        isPublic: false, 
        publicSlug: null,
        publishedAt: null
      })
      .where(eq(folders.id, folderId));
    
    return c.json({ message: 'Pasta tornada privada com sucesso' });
  } catch (error) {
    console.error('Make folder private error:', error);
    return c.json({ message: 'Erro ao tornar pasta privada' }, 500);
  }
});

folderRoutes.post('/:id/regenerate-slug', async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const folderId = c.req.param('id');
    
    const db = createDb(c.env.DATABASE_URL);
    
    const [folder] = await db.select().from(folders).where(eq(folders.id, folderId));
    if (!folder || folder.userId !== user.id) {
      return c.json({ message: 'Pasta não encontrada' }, 404);
    }
    
    if (!folder.isPublic) {
      return c.json({ message: 'Pasta não é pública' }, 400);
    }
    
    const newSlug = generateSlug();
    
    await db.update(folders)
      .set({ publicSlug: newSlug })
      .where(eq(folders.id, folderId));
    
    return c.json({ 
      message: 'Link regenerado com sucesso',
      slug: newSlug,
      publicUrl: `/p/${newSlug}`
    });
  } catch (error) {
    console.error('Regenerate slug error:', error);
    return c.json({ message: 'Erro ao regenerar link' }, 500);
  }
});

folderRoutes.delete('/:id/shares', async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const folderId = c.req.param('id');
    
    const db = createDb(c.env.DATABASE_URL);
    
    const [folder] = await db.select().from(folders).where(eq(folders.id, folderId));
    if (!folder || folder.userId !== user.id) {
      return c.json({ message: 'Pasta não encontrada ou acesso negado' }, 404);
    }
    
    await db.delete(folderPermissions).where(eq(folderPermissions.folderId, folderId));
    
    return c.json({ message: 'Todas as partilhas da pasta foram removidas' });
  } catch (error) {
    console.error('Delete folder shares error:', error);
    return c.json({ message: 'Erro ao remover partilhas da pasta' }, 500);
  }
});
