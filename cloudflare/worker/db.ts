/**
 * Database Connection for Cloudflare Workers
 * 
 * Usa @neondatabase/serverless para conectar ao Neon PostgreSQL.
 * Compatível com ambiente Workers (não usa conexões persistentes).
 */

import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../../shared/schema';

neonConfig.fetchConnectionCache = true;

export function createDb(databaseUrl: string) {
  const sql = neon(databaseUrl);
  return drizzle(sql, { schema });
}

export type Database = ReturnType<typeof createDb>;
