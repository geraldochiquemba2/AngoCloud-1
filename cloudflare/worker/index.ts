/**
 * AngoCloud API - Cloudflare Worker
 * 
 * Este worker substitui o Express.js backend e roda no edge da Cloudflare.
 * Usa Hono como framework web (leve e compatível com Workers).
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { authRoutes } from './routes/auth';
import { fileRoutes } from './routes/files';
import { folderRoutes } from './routes/folders';
import { shareRoutes } from './routes/shares';
import { invitationRoutes } from './routes/invitations';
import { sharedContentRoutes } from './routes/shared-content';
import { adminRoutes } from './routes/admin';
import { upgradeRoutes } from './routes/upgrades';
import { authMiddleware } from './middleware/auth';

export interface Env {
  DATABASE_URL: string;
  JWT_SECRET: string;
  TELEGRAM_BOT_1_TOKEN?: string;
  TELEGRAM_BOT_2_TOKEN?: string;
  TELEGRAM_BOT_3_TOKEN?: string;
  TELEGRAM_BOT_4_TOKEN?: string;
  TELEGRAM_BOT_5_TOKEN?: string;
  TELEGRAM_STORAGE_CHAT_ID?: string;
  ENVIRONMENT: string;
}

const app = new Hono<{ Bindings: Env }>();

app.use('*', logger());

app.use('*', cors({
  origin: ['https://angocloud.ao', 'https://www.angocloud.ao', 'http://localhost:5000', 'http://localhost:3000'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: c.env.ENVIRONMENT,
    runtime: 'Cloudflare Workers',
  });
});

app.route('/api/auth', authRoutes);
app.route('/api/files', fileRoutes);
app.route('/api/folders', folderRoutes);
app.route('/api/shares', shareRoutes);
app.route('/api/invitations', invitationRoutes);
app.route('/api/shared', sharedContentRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/upgrades', upgradeRoutes);

app.notFound((c) => {
  return c.json({ message: 'Rota não encontrada' }, 404);
});

app.onError((err, c) => {
  console.error('Worker Error:', err);
  return c.json({ 
    message: 'Erro interno do servidor',
    error: c.env.ENVIRONMENT === 'development' ? err.message : undefined
  }, 500);
});

export default app;
