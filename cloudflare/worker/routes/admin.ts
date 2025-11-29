/**
 * Admin Routes for Cloudflare Workers
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { createDb } from '../db';
import { authMiddleware, adminMiddleware, JWTPayload } from '../middleware/auth';
import { users, files, PLANS } from '../../../shared/schema';
import { eq, desc, sql } from 'drizzle-orm';

interface Env {
  DATABASE_URL: string;
  JWT_SECRET: string;
}

export const adminRoutes = new Hono<{ Bindings: Env }>();

adminRoutes.use('*', authMiddleware, adminMiddleware);

adminRoutes.get('/stats', async (c) => {
  try {
    const db = createDb(c.env.DATABASE_URL);

    const [userCount] = await db.select({ count: sql`count(*)` }).from(users);
    const [fileCount] = await db.select({ count: sql`count(*)` }).from(files);

    return c.json({
      totalUsers: Number(userCount?.count || 0),
      totalFiles: Number(fileCount?.count || 0),
    });
  } catch (error) {
    console.error('Get stats error:', error);
    return c.json({ message: 'Erro ao buscar estatísticas' }, 500);
  }
});

adminRoutes.get('/users', async (c) => {
  try {
    const db = createDb(c.env.DATABASE_URL);

    const allUsers = await db.select().from(users).orderBy(desc(users.createdAt));

    const safeUsers = allUsers.map(user => ({
      id: user.id,
      email: user.email,
      nome: user.nome,
      plano: user.plano,
      storageLimit: Number(user.storageLimit),
      storageUsed: Number(user.storageUsed),
      uploadsCount: user.uploadsCount,
      uploadLimit: user.uploadLimit,
      isAdmin: user.isAdmin,
      createdAt: user.createdAt,
    }));

    return c.json(safeUsers);
  } catch (error) {
    console.error('Get users error:', error);
    return c.json({ message: 'Erro ao buscar utilizadores' }, 500);
  }
});

adminRoutes.patch('/users/:id/admin', async (c) => {
  try {
    const currentUser = c.get('user') as JWTPayload;
    const userId = c.req.param('id');
    const { isAdmin } = await c.req.json();

    if (userId === currentUser.id) {
      return c.json({ message: 'Não pode alterar os seus próprios privilégios' }, 400);
    }

    const db = createDb(c.env.DATABASE_URL);

    await db.update(users)
      .set({ isAdmin: !!isAdmin })
      .where(eq(users.id, userId));

    return c.json({ message: 'Privilégios atualizados' });
  } catch (error) {
    console.error('Update admin error:', error);
    return c.json({ message: 'Erro ao atualizar privilégios' }, 500);
  }
});

adminRoutes.patch('/users/:id/plan', async (c) => {
  try {
    const userId = c.req.param('id');
    const { plano } = await c.req.json();

    if (!plano || !PLANS[plano as keyof typeof PLANS]) {
      return c.json({ message: 'Plano inválido' }, 400);
    }

    const planInfo = PLANS[plano as keyof typeof PLANS];
    
    const db = createDb(c.env.DATABASE_URL);

    await db.update(users)
      .set({ 
        plano,
        uploadLimit: planInfo.uploadLimit,
        storageLimit: planInfo.storageLimit,
      })
      .where(eq(users.id, userId));

    return c.json({ message: 'Plano atualizado' });
  } catch (error) {
    console.error('Update plan error:', error);
    return c.json({ message: 'Erro ao atualizar plano' }, 500);
  }
});

adminRoutes.delete('/users/:id', async (c) => {
  try {
    const currentUser = c.get('user') as JWTPayload;
    const userId = c.req.param('id');

    if (userId === currentUser.id) {
      return c.json({ message: 'Não pode eliminar a sua própria conta' }, 400);
    }

    const db = createDb(c.env.DATABASE_URL);

    await db.delete(users).where(eq(users.id, userId));

    return c.json({ message: 'Utilizador eliminado' });
  } catch (error) {
    console.error('Delete user error:', error);
    return c.json({ message: 'Erro ao eliminar utilizador' }, 500);
  }
});
