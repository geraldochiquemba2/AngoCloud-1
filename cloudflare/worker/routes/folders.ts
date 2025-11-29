/**
 * Folder Routes for Cloudflare Workers
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { createDb } from '../db';
import { authMiddleware, JWTPayload } from '../middleware/auth';
import { folders } from '../../../shared/schema';
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
