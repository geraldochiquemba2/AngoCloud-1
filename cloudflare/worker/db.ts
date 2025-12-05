/**
 * Database Connection for Cloudflare Workers
 * 
 * Usa @neondatabase/serverless para conectar ao Supabase PostgreSQL.
 * IMPORTANTE: Desativar pipelineConnect para compatibilidade com Supabase.
 */

import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

// Configuração obrigatória para Supabase
neonConfig.fetchConnectionCache = true;
neonConfig.pipelineConnect = false; // OBRIGATÓRIO para Supabase

export function createDb(databaseUrl: string) {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not configured');
  }
  
  console.log('Creating database connection...');
  
  try {
    const sql = neon(databaseUrl);
    const db = drizzle(sql, { schema });
    console.log('Database connection created successfully');
    return db;
  } catch (error) {
    console.error('Failed to create database connection:', error);
    throw error;
  }
}

export type Database = ReturnType<typeof createDb>;
