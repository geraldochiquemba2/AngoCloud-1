/**
 * Shared Content Routes for Cloudflare Workers
 */

import { Hono } from 'hono';
import { createDb } from '../db';
import { authMiddleware, JWTPayload } from '../middleware/auth';
import { files, folders, users, filePermissions, folderPermissions } from '../../../shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

interface Env {
  DATABASE_URL: string;
  JWT_SECRET: string;
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
