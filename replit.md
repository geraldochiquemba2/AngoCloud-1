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

PostgreSQL, provided by Neon serverless database, is used for data storage. Drizzle ORM facilitates type-safe queries and migrations. The schema includes `users` (with storage quotas), `files` (with metadata and Telegram references, supporting soft delete), `folders`, `shares`, and `payments`. Data relationships enforce referential integrity with cascade deletion and soft delete for trash functionality.

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

### Known Limitations

- **Telegram Dependency:** Primary storage relies on Telegram Bot API. Monitor ToS changes and prepare Cloudflare R2 fallback.
- **Single Instance:** Current architecture assumes single server instance. Multi-instance scaling requires shared session/quota storage.

## External Dependencies

- **Cloud Storage Backend:** Telegram Bot API (requires `TELEGRAM_BOT_X_TOKEN` and `TELEGRAM_CHAT_ID_X` environment variables for multiple bots).
- **Database Service:** Neon PostgreSQL serverless database (`DATABASE_URL` environment variable).
- **Payment Integration:** Multicaixa Express (planned for Angolan payment processing).
- **Deployment Platforms:** Render (current), Cloudflare Pages + Workers (planned for national scalability).
- **Development Tools:** Replit-specific plugins, custom Vite plugin for OpenGraph.