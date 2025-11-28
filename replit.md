# AngoCloud - Cloud Storage Platform

## Overview

AngoCloud é uma plataforma de armazenamento em nuvem projetada para fornecer armazenamento de arquivos seguro e acessível para usuários angolanos. A aplicação oferece planos de armazenamento em camadas, começando com 15GB de armazenamento gratuito, com camadas pagas até armazenamento empresarial ilimitado. A plataforma possui uma interface moderna com recursos de gerenciamento de arquivos, incluindo upload, download, organização, compartilhamento e recuperação de lixeira.

## Status Atual

**Backend MVP Completo com Resilência (Novembro 2025)**
- ✅ Sistema de autenticação completo (registro, login, logout, sessões)
- ✅ Banco de dados PostgreSQL com schema completo
- ✅ API RESTful completa para gerenciamento de arquivos e pastas
- ✅ Integração com Telegram Bot API com suporte a até 10 bots
- ✅ Load balancing automático entre múltiplos bots
- ✅ **🆕 Retry com exponential backoff para uploads/downloads**
- ✅ **🆕 Fallback automático entre bots com health checks**
- ✅ **🆕 Tratamento inteligente de rate limits do Telegram**
- ✅ **🆕 Logging detalhado para monitoramento**
- ✅ Sistema de quotas de armazenamento por plano
- ✅ Compartilhamento de arquivos via links públicos
- ✅ Dashboard completo com funcionalidades avançadas
- ✅ **🆕 Sistema de lixeira com 15 dias para recuperação**
- ✅ **🆕 Confirmação de eliminação com diálogo**
- ✅ **🆕 Eliminação automática após 15 dias**
- ✅ Busca de arquivos integrada
- ✅ Frontend totalmente funcional e responsivo

**Fase 1 - MVP Local: Completa**
**Fase 2 - Escalabilidade: Completa**
**Fase 3 - Resilência: Completa ✨**
**Fase 4 - Encriptação Cliente: Completa ✨**

### Encriptação de Ficheiros (Cliente-Side)

- ✅ **Encriptação AES-256-GCM** - Ficheiros encriptados no navegador antes de upload
- ✅ **PBKDF2 Key Derivation** - Chave de encriptação derivada da password do utilizador
- ✅ **Zero-Knowledge** - Servidor nunca tem acesso aos ficheiros desencriptados
- ✅ **Previews Encriptados** - Thumbnails e previews são desencriptados no cliente
- ✅ **Download Seguro** - Ficheiros desencriptados automaticamente ao baixar
- ✅ **🆕 Partilha com Chave** - Ao partilhar ficheiro encriptado com utilizador registado, a chave é também partilhada
- ✅ **🆕 Revogação Automática** - Ao remover partilha, a chave é automaticamente revogada
- ⚠️ **Links Públicos** - Links públicos de partilha não incluem chave (ficheiros encriptados não são acessíveis por links públicos)

## User Preferences

Preferred communication style: Simple, everyday language (Português).

## System Architecture

### Frontend Architecture

**Framework & Build System**
- React 18+ with TypeScript for type-safe component development
- Vite as the build tool and development server, chosen for fast HMR and optimized production builds
- Wouter for client-side routing (lightweight alternative to React Router)
- TailwindCSS v4 for utility-first styling with custom design tokens

**State Management**
- React Query (TanStack Query) for server state management and caching
- React Context API for authentication state and user session management
- Local component state using React hooks for UI-specific state

**UI Component Library**
- Shadcn/ui components built on Radix UI primitives for accessibility
- Custom components including 3D card effects, video backgrounds, and cloud scene animations
- Framer Motion for page transitions and interactive animations
- Lucide React for consistent iconography

**Design System**
- Space Grotesk and DM Sans fonts for modern typography
- Custom CSS variables for theming with light/dark mode support
- Component variants using class-variance-authority (CVA)
- Responsive breakpoints with mobile-first approach

### Backend Architecture

**Server Framework**
- Express.js for HTTP server and API routing
- Node.js runtime with ES modules
- Session-based authentication using express-session with connect-pg-simple for PostgreSQL session storage

**Authentication & Authorization**
- Passport.js with LocalStrategy for email/password authentication
- SHA-256 password hashing (Note: Consider migrating to bcrypt for production)
- Session-based authentication with secure cookie management
- User roles and storage quota enforcement at the database level

**File Upload & Storage**
- Multer middleware for handling multipart/form-data file uploads
- Memory storage with 2GB file size limit per upload
- Telegram Bot API as the underlying storage backend (novel approach to avoid traditional cloud storage costs)
- Multiple bot support for load distribution across Telegram bots
- File metadata stored in PostgreSQL with references to Telegram file IDs

**API Design**
- RESTful API endpoints under `/api` prefix
- JSON request/response format
- Express middleware for request logging and error handling
- CORS configuration for cross-origin requests

### Data Storage

**Database**
- PostgreSQL via Neon serverless database
- Drizzle ORM for type-safe database queries and migrations
- WebSocket connection pooling using @neondatabase/serverless with ws library

**Schema Design**
- `users`: User accounts with email, password hash, storage limits and usage tracking
- `files`: File metadata including name, size, MIME type, Telegram file references, soft delete flag
- `folders`: Hierarchical folder structure with parent-child relationships
- `shares`: Shareable links with optional password protection and expiration
- `payments`: Payment history and subscription management

**Data Relationships**
- Cascade deletion: Files and folders are deleted when parent user is deleted
- Soft delete: Files marked as deleted (isDeleted flag) for trash/recovery functionality
- Foreign key constraints ensure referential integrity

### External Dependencies

**Cloud Storage Backend**
- Telegram Bot API for file storage (requires multiple bot tokens via environment variables: `TELEGRAM_BOT_1_TOKEN`, `TELEGRAM_BOT_2_TOKEN`, etc.)
- Load balancing across bots using round-robin selection
- Supports uploads and downloads through Telegram's infrastructure

**Database Service**
- Neon PostgreSQL serverless database
- Environment variable `DATABASE_URL` required for connection
- WebSocket support for efficient connection management

**Payment Integration**
- Multicaixa Express integration planned for Angolan payment processing (implementation in progress)
- Payment tiers: Free (15GB), Plus (100GB/Kz 2,500), Pro (500GB/Kz 7,500), Empresas (Unlimited/Kz 25,000)

**Development Tools**
- Replit-specific plugins for development experience (cartographer, dev banner, runtime error modal)
- Custom Vite plugin for OpenGraph image metadata injection based on deployment URL

**Build & Deployment**
- esbuild for server-side bundling with selective dependency bundling
- Vite for client-side bundling with code splitting
- Static file serving from Express in production
- Environment-aware configuration (development/production modes)

## Guia de Escalabilidade

### 1. Aumentar Capacidade de Bots Telegram

A aplicação suporta até **10 bots Telegram** para distribuir carga e aumentar throughput:

**Configuração Atual:** 3 bots (TELEGRAM_BOT_1_TOKEN até TELEGRAM_BOT_3_TOKEN)

**Para adicionar mais bots:**
1. Cria novos bots no @BotFather: `/newbot`
2. Adiciona os tokens como secrets:
   - `TELEGRAM_BOT_4_TOKEN`
   - `TELEGRAM_BOT_5_TOKEN`
   - ... até `TELEGRAM_BOT_10_TOKEN`
3. Reinicia a aplicação
4. Sistema carrega automaticamente todos os bots

**Benefícios:**
- Multiplica capacidade de uploads simultâneos
- Distribui carga automaticamente (round-robin)
- Fallback automático se um bot falhar
- Sem limite prático de ficheiros armazenados

### 2. Otimizações de Banco de Dados

Para suportar milhões de ficheiros:
```sql
-- Índices recomendados (executar uma vez)
CREATE INDEX idx_files_user_id ON files(user_id);
CREATE INDEX idx_files_folder_id ON files(folder_id);
CREATE INDEX idx_files_is_deleted ON files(is_deleted);
CREATE INDEX idx_files_nome ON files(nome);
CREATE INDEX idx_folders_user_id ON folders(user_id);
CREATE INDEX idx_folders_parent_id ON folders(parent_id);
```

### 3. Escalabilidade de Servidor

**Para crescimento futuro (100k+ utilizadores):**

**Opção A - Replit Business:**
- Aumenta CPU/RAM do Replit
- Mantém infraestrutura simples

**Opção B - Migrações Recomendadas:**
- Redis para cache de sessões
- Message queue (Bull/RabbitMQ) para uploads em background
- CDN para downloads de ficheiros populares
- Separar frontend e backend em servidores distintos

### 4. Sistema de Retry/Fallback (NOVO)

**Configuração Padrão:**
- Máximo de tentativas: 5 retries (6 tentativas no total)
- Delay inicial: 1s
- Delay máximo: 10s
- Multiplicador: 2x (exponential backoff com jitter)
- Sequência real: 1s → 2s → 4s → 8s → 10s

**Mecanismos de Proteção:**
- Rate limit automático do Telegram (retry-after)
- Health check de bots com período de recovery
- Timeout de 30s para uploads, 15s para getFile
- Marcação automática de bots falhados
- Jitter para evitar thundering herd

**Cenários Tratados:**
- ✅ Bot bloqueado/removido → Tenta próximo bot
- ✅ Rate limit (429) → Aguarda e retenta
- ✅ Timeout de rede → Retry com backoff
- ✅ Falha de chat_id → Logging detalhado
- ✅ Todos os bots falhados → Erro claro ao utilizador

### 5. Limites Atuais e Soluções

| Limitação | Valor Atual | Solução |
|-----------|------------|--------|
| Uploads simultâneos | ~100 | Adicionar mais bots Telegram |
| Tamanho máximo ficheiro | 2GB | Implementar multipart upload |
| Utilizadores simultâneos | 500 | Usar load balancer + múltiplos servidores |
| Armazenamento total | Ilimitado* | Depende apenas de bots Telegram |
| Robustez contra bloqueios | ✅ Robusto | Retry + Fallback + Health checks |
| **Eliminação permanente | ⚠️ Limitada | Telegram não suporta deleção real** |

*Cada bot Telegram tem limite de armazenamento teórico ilimitado
**Ficheiros eliminados são removidos do BD local, mas ficam guardados no Telegram (limitação do Telegram)

### 5. Monitoramento Recomendado

```javascript
// Adicionar métricas:
- Uploads por segundo
- Taxa de erro de uploads
- Latência média de downloads
- Utilização de bots Telegram
- Tamanho total de base de dados
- Conexões ativas
```

### 6. Monitoramento de Bots

O serviço expõe endpoint para monitoramento:
```javascript
const status = telegramService.getBotStatus();
// Retorna: [{id: 'bot_1', name: 'AngoCloud Bot 1', active: true, failures: 0}, ...]
```

### 7. Plano de Crescimento Sugerido

**Fase 1 (0-1000 utilizadores):** Configuração atual ✅
**Fase 2 (1000-10k utilizadores):** Adicionar 10 bots Telegram
**Fase 3 (10k-100k utilizadores):** Adicionar Redis + cache
**Fase 4 (100k+ utilizadores):** Arquitetura distribuída

### 8. Tratamento de Bloqueios Telegram

**Como o sistema contorna bloqueios:**

1. **Bloqueio de 1 bot → Usa próximo bot automaticamente**
2. **Rate limit (429) → Retenta após tempo indicado pelo Telegram**
3. **Bot removido (403) → Marca inativo e continua com outros**
4. **Erro de rede → Exponential backoff até sucesso ou limite**
5. **Todos indisponíveis → Retorna erro claro (implementar fila de retry depois)**

**Logs para debugging:**
- `📤 Upload tentativa X/Y com BotZ` - mostra progresso
- `❌ Bot X falhou` - registra falhas
- `✅ Bot X recuperado` - mostra recuperação
- `🔴 Bot X marcado como inativo` - após 5 falhas consecutivas