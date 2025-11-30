/**
 * System Routes for Cloudflare Workers
 * 
 * Routes for system information, limits, quota, and stats.
 * 
 * Note: Cloudflare Workers are stateless, so daily quota tracking
 * is not available. The Express server tracks daily quotas in memory
 * via monitoringService. For parity, these routes provide the same
 * structure but with static or database-derived values.
 */

import { Hono } from 'hono';
import { createDb } from '../db';
import { authMiddleware, JWTPayload } from '../middleware/auth';
import { users, files, PLANS } from '../../../shared/schema';
import { eq, sql } from 'drizzle-orm';
import { TelegramService } from '../services/telegram';

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

const SYSTEM_LIMITS = {
  FREE_STORAGE_GB: 20,
  FREE_STORAGE_BYTES: 20 * 1024 * 1024 * 1024,
  MAX_FILE_SIZE_MB: 2048,
  MAX_FILE_SIZE_BYTES: 2 * 1024 * 1024 * 1024,
  BOT_FAILURE_THRESHOLD: 3,
  RATE_LIMIT_COOLDOWN_MS: 60000,
};

export const plansRoutes = new Hono<{ Bindings: Env }>();

plansRoutes.get('/', (c) => {
  return c.json(PLANS);
});

export const userQuotaRoutes = new Hono<{ Bindings: Env }>();

userQuotaRoutes.get('/', authMiddleware, async (c) => {
  try {
    const jwtUser = c.get('user') as JWTPayload;
    const db = createDb(c.env.DATABASE_URL);

    const [user] = await db.select().from(users).where(eq(users.id, jwtUser.id));
    
    if (!user) {
      return c.json({ message: 'Utilizador não encontrado' }, 404);
    }

    return c.json({
      storage: {
        used: Number(user.storageUsed),
        limit: Number(user.storageLimit),
        percentage: Math.round((Number(user.storageUsed) / Number(user.storageLimit)) * 100),
      },
      daily: {
        uploads: user.uploadsCount,
        maxUploads: -1,
        bytesUploaded: 0,
        maxBytes: -1,
      },
      limits: {
        maxFileSize: SYSTEM_LIMITS.MAX_FILE_SIZE_BYTES,
        maxFileSizeMB: SYSTEM_LIMITS.MAX_FILE_SIZE_MB,
      },
      plan: user.plano,
    });
  } catch (error) {
    console.error('User quota error:', error);
    return c.json({ message: 'Erro ao obter quota' }, 500);
  }
});

export const systemRoutes = new Hono<{ Bindings: Env }>();

systemRoutes.get('/limits', (c) => {
  try {
    return c.json({
      limits: SYSTEM_LIMITS,
      isBeta: false,
    });
  } catch (error) {
    return c.json({ message: 'Erro ao obter limites' }, 500);
  }
});

systemRoutes.get('/telegram-status', authMiddleware, async (c) => {
  try {
    const telegramService = new TelegramService(c.env);
    
    const bots: Array<{
      id: string;
      name: string;
      available: boolean;
    }> = [];

    for (let i = 1; i <= 10; i++) {
      const tokenKey = `TELEGRAM_BOT_${i}_TOKEN` as keyof typeof c.env;
      const token = c.env[tokenKey];
      if (token) {
        bots.push({
          id: `bot_${i}`,
          name: `Bot ${i}`,
          available: true,
        });
      }
    }
    
    return c.json({
      available: telegramService.isAvailable(),
      bots,
      cache: { hits: 0, misses: 0 },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json({ message: 'Erro ao obter status do sistema' }, 500);
  }
});

export const statsRoutes = new Hono<{ Bindings: Env }>();

statsRoutes.get('/', async (c) => {
  try {
    const db = createDb(c.env.DATABASE_URL);

    const [usersResult] = await db.select({ count: sql`count(*)` }).from(users);
    const [filesResult] = await db.select({ count: sql`count(*)` }).from(files).where(sql`is_deleted = false`);

    return c.json({
      utilizadores: Number(usersResult?.count || 0),
      ficheiros: Number(filesResult?.count || 0),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Stats error:', error);
    return c.json({ message: 'Erro ao obter estatísticas' }, 500);
  }
});
