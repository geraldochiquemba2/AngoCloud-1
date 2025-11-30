# AngoCloud - Cloud Storage Platform

## Overview

AngoCloud is a cloud storage platform designed to provide secure and accessible file storage for Angolan users. The application offers tiered storage plans, starting with 20GB of free storage, with paid tiers extending to unlimited enterprise storage. It features a modern interface with file management capabilities, including upload, download, organization, sharing, and trash recovery. The platform prioritizes resilience, client-side encryption, and scalability, supporting multiple deployment environments and robust handling of external dependencies.

## User Preferences

Preferred communication style: Simple, everyday language (Português).

## System Architecture

### Frontend Architecture

AngoCloud's frontend is built with React 18+ and TypeScript, utilizing Vite for fast builds and Wouter for lightweight client-side routing. Styling is handled with TailwindCSS v4 and custom design tokens. State management uses React Query for server state and React Context API for authentication. The UI features Shadcn/ui components based on Radix UI, enhanced with custom components, Framer Motion for animations, and Lucide React for iconography. A design system with custom fonts, CSS variables for theming, and responsive breakpoints ensures a modern and consistent user experience. Client-side AES-256-GCM encryption with PBKDF2 key derivation provides zero-knowledge privacy, where files are encrypted in the browser before upload and decrypted on download. Sharing of encrypted files involves key sharing and automatic revocation.

### Backend Architecture

The backend is an Express.js application running on Node.js, using session-based authentication with `express-session` and `connect-pg-simple` for PostgreSQL session storage. Authentication is managed by Passport.js with a LocalStrategy and SHA-256 password hashing. Multer middleware handles file uploads up to 2GB. The core innovation lies in using the Telegram Bot API as the underlying, cost-effective storage backend, distributing load across multiple Telegram bots. The API is RESTful, uses JSON, and includes middleware for logging and error handling. It implements a robust retry mechanism with exponential backoff and jitter, automatic fallback between bots with health checks, and intelligent handling of Telegram rate limits, ensuring high availability and resilience.

### Data Storage

PostgreSQL, provided by Neon serverless database, is used for data storage. Drizzle ORM facilitates type-safe queries and migrations. The schema includes `users` (with storage quotas), `files` (with metadata and Telegram references, supporting soft delete), `folders` (with public sharing support via `isPublic`, `publicSlug`, `publishedAt`), `shares`, and `payments`. Data relationships enforce referential integrity with cascade deletion and soft delete for trash functionality.

### Public Folders Feature

Users can share folders publicly with customized links (`/p/{slug}`). Public folders display file listings and allow guests to preview media and download files without login. Features:
- Generate unique public links for any folder
- Regenerate links anytime
- View public folder metadata (owner, publish date)
- Browse files and subfolders
- Preview images, videos, and audio
- Download files without authentication
- Encrypted files are excluded from public folders for security

### System Design Choices

The architecture supports scalability through:
- **Multiple Telegram Bots:** Up to 10 bots can be configured to distribute upload capacity and ensure resilience.
- **Database Optimizations:** Recommended PostgreSQL indices for efficient querying of millions of files.
- **Server Scalability:** Options for scaling include increasing Replit resources, or migrating to a distributed architecture with Redis for session caching, message queues for background uploads, and CDNs for popular file downloads.
- **Robust Retry/Fallback System:** Implemented with exponential backoff, bot health checks, and rate limit handling to ensure reliable file operations even during Telegram API issues.
- **Monitoring System:** Comprehensive monitoring with health checks, metrics tracking, quota management, and alerting.
- **Fallback Storage Providers:** Interface ready for Cloudflare R2 and Backblaze B2 as backup storage options.

### Storage Limits

- **Free Storage:** 20GB per user
- **Max File Size:** 2GB per file (Telegram API limit)
- **Upload Limit:** Unlimited uploads (limited by storage quota)

### Monitoring & Alerting

The `server/monitoring.ts` module provides:
- Real-time health checks for all Telegram bots
- Daily quota tracking per user
- Automatic alert generation for system issues
- Admin API endpoints for monitoring dashboard
- Error rate tracking and trend analysis

### WebSocket Real-Time Features

The platform includes a WebSocket server (`server/websocket.ts`) for real-time updates in production:
- File upload/delete/restore notifications
- Folder creation/deletion events
- Storage quota updates
- Upgrade request notifications (for admins)
- Share and invitation notifications

**Important:** WebSocket is disabled in development mode to avoid conflicts with Vite's HMR (Hot Module Replacement) WebSocket. The client-side hook (`useWebSocket`) gracefully handles this by silently disabling after a few failed connection attempts.

### Known Limitations

- **Telegram Dependency:** Primary storage relies on Telegram Bot API. Monitor ToS changes and prepare Cloudflare R2 fallback.
- **Single Instance:** Current architecture assumes single server instance. Multi-instance scaling requires shared session/quota storage.
- **WebSocket in Development:** Real-time WebSocket features are disabled in development mode due to Vite HMR conflicts. Test real-time features in production builds.

## Deployment (Cloudflare Workers)

O AngoCloud está configurado para deploy no **Cloudflare Workers** com a abordagem unificada de 2025 (Assets integrados).

### Estrutura de Deploy

```
cloudflare/
├── wrangler.toml          # Configuração do Worker
├── worker/index.ts        # Entry point (API + Assets)
├── package.json           # Scripts de build/deploy
└── README.md              # Guia completo de deploy
```

### Comandos de Deploy

```bash
cd cloudflare
npm install
npm run deploy       # Build + deploy para Cloudflare
```

### Secrets Necessários

Configure via `wrangler secret put`:
- `DATABASE_URL` - Connection string Neon PostgreSQL
- `JWT_SECRET` - Chave secreta JWT (min. 32 caracteres)
- `TELEGRAM_BOT_1_TOKEN` - Token do primeiro bot
- `TELEGRAM_STORAGE_CHAT_ID` - ID do chat de armazenamento

### Vantagens da Cloudflare

- Deploy unificado (frontend + backend)
- Edge performance global
- 100.000 requests/dia gratuitos
- SSL automático
- Domínio personalizado fácil de configurar

## External Dependencies

- **Cloud Storage Backend:** Telegram Bot API (requires `TELEGRAM_BOT_X_TOKEN` and `TELEGRAM_CHAT_ID_X` environment variables for multiple bots).
- **Database Service:** Neon PostgreSQL serverless database (`DATABASE_URL` environment variable).
- **Payment Integration:** Multicaixa Express (planned for Angolan payment processing).
- **Deployment Platform:** Cloudflare Workers com Assets integrados (configuração em `cloudflare/`).
- **Development Tools:** Replit-specific plugins, custom Vite plugin for OpenGraph.

## Recent Changes

### November 30, 2025 - System Routes and API Parity

Added comprehensive system routes to the Cloudflare Worker for complete API parity:

1. **GET /api/plans** - Returns available storage plans (public)
2. **GET /api/user/quota** - Returns user storage quota and limits (authenticated)
3. **GET /api/system/limits** - Returns system limits (file size, storage) (public)
4. **GET /api/system/telegram-status** - Returns Telegram bots status (authenticated)
5. **GET /api/stats** - Returns system statistics (user/file counts) (public)
6. **POST /api/shared/files/:fileId/clone** - Clone a shared file to user's own storage (authenticated)

### November 30, 2025 - Invitation Routes Sync

Fixed missing routes in Cloudflare Worker for invitation management:

1. **GET /api/invitations/resource/:type/:id** - Lists invitations for a specific folder or file
2. **PATCH /api/invitations/:id/role** - Updates invitation role/permission

**Note on Cloudflare Workers Statelessness:** 
Daily quota tracking and real-time bot health metrics are simplified in the Worker environment compared to Express, as Workers are stateless. The Worker provides:
- Static system limits (matching Express LIMITS config)
- Bot availability status (based on configured tokens)
- Storage quotas from database (lifetime counts, not daily)

**Note on LSP Errors:**
LSP errors in `cloudflare/worker/routes/*.ts` are due to drizzle-orm version differences between the main project and Cloudflare package. These are type-checking warnings only and don't affect runtime functionality.