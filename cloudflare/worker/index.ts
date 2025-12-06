/**
 * AngoCloud - Cloudflare Worker (2025)
 * 
 * Worker unificado que serve:
 * - Frontend React via Cloudflare Assets (configurado em wrangler.toml)
 * - API backend com Hono
 * 
 * A configuração de assets em wrangler.toml serve automaticamente os
 * arquivos estáticos e redireciona rotas não encontradas para index.html (SPA).
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { authRoutes } from './routes/auth';
import { oauthRoutes } from './routes/oauth';
import { fileRoutes } from './routes/files';
import { folderRoutes } from './routes/folders';
import { shareRoutes } from './routes/shares';
import { invitationRoutes } from './routes/invitations';
import { sharedContentRoutes } from './routes/shared-content';
import { adminRoutes } from './routes/admin';
import { upgradeRoutes, userUpgradeRequestsRoutes, myUpgradeRequestsRoutes } from './routes/upgrades';
import { publicFolderRoutes } from './routes/public-folders';
import { plansRoutes, userQuotaRoutes, systemRoutes, statsRoutes } from './routes/system';

export interface Env {
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
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  FACEBOOK_CLIENT_ID?: string;
  FACEBOOK_CLIENT_SECRET?: string;
  APP_URL?: string;
  ENVIRONMENT: string;
  ASSETS?: {
    fetch: (request: Request) => Promise<Response>;
  };
}

const api = new Hono<{ Bindings: Env }>();

api.use('*', logger());

api.use('*', secureHeaders());

api.use('*', cors({
  origin: (origin) => {
    const allowedOrigins = [
      'https://angocloud.ao',
      'https://www.angocloud.ao',
      'http://localhost:5000',
      'http://localhost:3000',
      'http://localhost:8787',
    ];
    if (!origin) {
      return allowedOrigins[0];
    }
    if (allowedOrigins.includes(origin)) {
      return origin;
    }
    if (origin.endsWith('.angocloud.ao') || origin.endsWith('.workers.dev')) {
      return origin;
    }
    return null;
  },
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  maxAge: 86400,
}));

api.use('*', async (c, next) => {
  await next();
  
  c.res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  c.res.headers.set('Pragma', 'no-cache');
  c.res.headers.set('Expires', '0');
  c.res.headers.set('Surrogate-Control', 'no-store');
});

api.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: c.env.ENVIRONMENT,
    runtime: 'Cloudflare Workers',
    version: '2.0.0',
  });
});

api.get('/info', (c) => {
  return c.json({
    name: 'AngoCloud API',
    version: '2.0.0',
    description: 'A nuvem de Angola para angolanos',
    endpoints: {
      auth: '/api/auth',
      files: '/api/files',
      folders: '/api/folders',
      shares: '/api/shares',
      invitations: '/api/invitations',
      shared: '/api/shared',
      admin: '/api/admin',
      upgrades: '/api/upgrades',
      plans: '/api/plans',
      quota: '/api/user/quota',
      system: '/api/system',
      stats: '/api/stats',
    },
  });
});

api.route('/auth', authRoutes);
api.route('/auth/oauth', oauthRoutes);
api.route('/files', fileRoutes);
api.route('/folders', folderRoutes);
api.route('/shares', shareRoutes);
api.route('/invitations', invitationRoutes);
api.route('/shared', sharedContentRoutes);
api.route('/admin', adminRoutes);
api.route('/upgrades', upgradeRoutes);
api.route('/public', publicFolderRoutes);

api.route('/upgrade-requests', userUpgradeRequestsRoutes);
api.route('/my-upgrade-requests', myUpgradeRequestsRoutes);

api.route('/plans', plansRoutes);
api.route('/user/quota', userQuotaRoutes);
api.route('/system', systemRoutes);
api.route('/stats', statsRoutes);

api.notFound((c) => {
  return c.json({ 
    message: 'Endpoint não encontrado',
    path: c.req.path,
    method: c.req.method,
  }, 404);
});

api.onError((err, c) => {
  console.error('Worker Error:', err);
  return c.json({ 
    message: 'Erro interno do servidor',
    error: c.env.ENVIRONMENT === 'development' ? err.message : undefined,
    requestId: crypto.randomUUID(),
  }, 500);
});

const app = new Hono<{ Bindings: Env }>();

app.route('/api', api);

app.all('*', async (c) => {
  if (c.env.ASSETS) {
    return c.env.ASSETS.fetch(c.req.raw);
  }
  return c.text('Assets not configured', 500);
});

export default app;
