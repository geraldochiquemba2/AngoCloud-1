import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import session from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { z } from "zod";
import { insertUserSchema, insertFileSchema, insertFolderSchema, insertShareSchema, PLANS } from "@shared/schema";
import crypto from "crypto";
import multer, { type Multer } from "multer";
import { telegramService } from "./telegram";
import bcrypt from "bcrypt";
import { wsManager } from "./websocket";

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 * 1024 } // 2GB limit
});

// Bcrypt config
const SALT_ROUNDS = 12;

// PBKDF2 config (must match Cloudflare Worker settings)
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_KEY_LENGTH = 32;

// Hash password with bcrypt (for new users created in Express)
async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

// Verify PBKDF2 hash (for users created in Cloudflare Worker)
async function verifyPasswordPBKDF2(password: string, storedHash: string): Promise<boolean> {
  try {
    const [prefix, salt, hash] = storedHash.split(':');
    if (prefix !== 'pbkdf2' || !salt || !hash) {
      return false;
    }
    
    const derivedKey = crypto.pbkdf2Sync(
      password,
      salt,
      PBKDF2_ITERATIONS,
      PBKDF2_KEY_LENGTH,
      'sha256'
    );
    
    const computedHash = derivedKey.toString('hex');
    return computedHash === hash;
  } catch (error) {
    console.error('PBKDF2 verification error:', error);
    return false;
  }
}

// Verify password - supports both bcrypt and PBKDF2
async function verifyPassword(password: string, hash: string): Promise<boolean> {
  // Check if it's a PBKDF2 hash (from Cloudflare Worker)
  if (hash.startsWith('pbkdf2:')) {
    return verifyPasswordPBKDF2(password, hash);
  }
  
  // Check if it's a bcrypt hash
  if (hash.startsWith('$2a$') || hash.startsWith('$2b$') || hash.startsWith('$2y$')) {
    return bcrypt.compare(password, hash);
  }
  
  return false;
}

// Extend Express Request to include user and file
declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      nome: string;
      plano: string;
      storageLimit: number;
      storageUsed: number;
      uploadsCount: number;
      uploadLimit: number;
      isAdmin: boolean;
    }
    
    interface Request {
      file?: Multer.File;
    }
  }
}

// Configure passport
passport.use(
  new LocalStrategy(
    { usernameField: "email" },
    async (email, password, done) => {
      try {
        const user = await storage.getUserByEmail(email);
        if (!user) {
          return done(null, false, { message: "Email ou senha incorretos" });
        }

        const isValidPassword = await verifyPassword(password, user.passwordHash);
        if (!isValidPassword) {
          return done(null, false, { message: "Email ou senha incorretos" });
        }

        return done(null, {
          id: user.id,
          email: user.email,
          nome: user.nome,
          plano: user.plano,
          storageLimit: user.storageLimit,
          storageUsed: user.storageUsed,
          uploadsCount: user.uploadsCount,
          uploadLimit: user.uploadLimit,
          isAdmin: user.isAdmin,
        });
      } catch (error) {
        return done(error);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await storage.getUser(id);
    if (!user) {
      return done(null, false);
    }
    done(null, {
      id: user.id,
      email: user.email,
      nome: user.nome,
      plano: user.plano,
      storageLimit: user.storageLimit,
      storageUsed: user.storageUsed,
      uploadsCount: user.uploadsCount,
      uploadLimit: user.uploadLimit,
      isAdmin: user.isAdmin,
    });
  } catch (error) {
    done(error);
  }
});

// Auth middleware
function requireAuth(req: Request, res: Response, next: Function) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: "Não autorizado" });
}

// Admin middleware
async function requireAdmin(req: Request, res: Response, next: Function) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Não autorizado" });
  }
  
  const user = await storage.getUser(req.user!.id);
  if (!user?.isAdmin) {
    return res.status(403).json({ message: "Acesso negado - requer privilégios de administrador" });
  }
  return next();
}

// Get storage limits by plan
function getStorageLimitByPlan(plano: string): number {
  const limits: Record<string, number> = {
    gratis: 20 * 1024 * 1024 * 1024, // 20GB base
  };
  return limits[plano] || limits.gratis;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Configure session with 10 minutes inactivity timeout
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "angocloud-secret-key-change-in-production",
      resave: true,
      rolling: true,
      saveUninitialized: false,
      proxy: process.env.NODE_ENV === "production",
      cookie: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        sameSite: "lax",
        maxAge: 10 * 60 * 1000, // 10 minutes inactivity timeout
      },
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  // ========== HEALTH CHECK ROUTE (Keep-Alive) ==========
  app.get("/api/health", (_req: Request, res: Response) => {
    res.status(200).json({ 
      status: "ok", 
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  // ========== AUTH ROUTES ==========

  // Register
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        email: z.string().email(),
        password: z.string().min(6),
        nome: z.string().min(2),
        encryptionSalt: z.string().optional(),
      });

      const { email, password, nome, encryptionSalt } = schema.parse(req.body);

      // Check if user exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "Email já está em uso" });
      }

      // Generate encryption salt if not provided
      const salt = encryptionSalt || crypto.randomBytes(16).toString('base64');

      // Create user with bcrypt hashed password
      const hashedPassword = await hashPassword(password);
      const user = await storage.createUser({
        email,
        passwordHash: hashedPassword,
        nome,
        plano: "gratis",
        encryptionSalt: salt,
      });

      // Auto login
      req.login(
        {
          id: user.id,
          email: user.email,
          nome: user.nome,
          plano: user.plano,
          storageLimit: user.storageLimit,
          storageUsed: user.storageUsed,
          uploadsCount: user.uploadsCount,
          uploadLimit: user.uploadLimit,
          isAdmin: user.isAdmin,
        },
        (err) => {
          if (err) {
            return res.status(500).json({ message: "Erro ao fazer login" });
          }
          res.json({
            id: user.id,
            email: user.email,
            nome: user.nome,
            plano: user.plano,
            storageLimit: user.storageLimit,
            storageUsed: user.storageUsed,
            uploadsCount: user.uploadsCount,
            uploadLimit: user.uploadLimit,
            isAdmin: user.isAdmin,
            encryptionSalt: salt,
          });
        }
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Dados inválidos", errors: error.errors });
      }
      res.status(500).json({ message: "Erro ao criar conta" });
    }
  });

  // Login
  app.post("/api/auth/login", async (req: Request, res: Response, next) => {
    passport.authenticate("local", async (err: any, user: Express.User | false, info: any) => {
      if (err) {
        return res.status(500).json({ message: "Erro ao fazer login" });
      }
      if (!user) {
        return res.status(401).json({ message: info?.message || "Credenciais inválidas" });
      }
      
      // Get full user data including encryption salt
      const fullUser = await storage.getUser(user.id);
      
      req.login(user, (err) => {
        if (err) {
          return res.status(500).json({ message: "Erro ao fazer login" });
        }
        res.json({
          ...user,
          encryptionSalt: fullUser?.encryptionSalt || null,
        });
      });
    })(req, res, next);
  });

  // Logout
  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ message: "Erro ao fazer logout" });
      }
      res.json({ message: "Logout realizado com sucesso" });
    });
  });

  // Keepalive - extends session without requiring full auth check
  // This endpoint checks if session exists and explicitly extends it
  app.post("/api/auth/keepalive", (req: Request, res: Response) => {
    if (req.isAuthenticated() && req.user && req.session) {
      // Explicitly touch the session to reset the expiry time
      req.session.touch();
      
      // Force save the session to ensure persistence
      req.session.save((err) => {
        if (err) {
          console.error("Error saving session during keepalive:", err);
          return res.status(500).json({ status: "error", message: "Erro ao estender sessão" });
        }
        res.json({ status: "active", userId: req.user!.id });
      });
    } else {
      // Session expired or invalid
      res.status(401).json({ status: "expired", message: "Sessão expirada" });
    }
  });

  // Get current user
  app.get("/api/auth/me", requireAuth, async (req: Request, res: Response) => {
    const fullUser = await storage.getUser(req.user!.id);
    res.json({
      ...req.user,
      encryptionSalt: fullUser?.encryptionSalt || null,
    });
  });

  // Enable encryption for legacy accounts
  app.post("/api/auth/enable-encryption", requireAuth, async (req: Request, res: Response) => {
    try {
      const { encryptionSalt, password } = req.body;
      
      if (!encryptionSalt || typeof encryptionSalt !== 'string') {
        return res.status(400).json({ message: "Salt de encriptação é obrigatório" });
      }
      
      if (!password || typeof password !== 'string') {
        return res.status(400).json({ message: "Password é obrigatória para verificação" });
      }
      
      const user = await storage.getUser(req.user!.id);
      if (!user) {
        return res.status(404).json({ message: "Utilizador não encontrado" });
      }
      
      if (user.encryptionSalt) {
        return res.status(400).json({ message: "Encriptação já está ativa para esta conta" });
      }
      
      const isPasswordValid = await verifyPassword(password, user.passwordHash);
      if (!isPasswordValid) {
        return res.status(401).json({ message: "Password incorreta" });
      }
      
      await storage.updateEncryptionSalt(req.user!.id, encryptionSalt);
      
      res.json({ 
        message: "Encriptação ativada com sucesso",
        encryptionSalt 
      });
    } catch (error) {
      console.error("Enable encryption error:", error);
      res.status(500).json({ message: "Erro ao ativar encriptação" });
    }
  });

  // Change password
  app.post("/api/auth/change-password", requireAuth, async (req: Request, res: Response) => {
    try {
      const { currentPassword, newPassword } = req.body;
      
      if (!currentPassword || typeof currentPassword !== 'string') {
        return res.status(400).json({ message: "Senha atual é obrigatória" });
      }
      
      if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
        return res.status(400).json({ message: "Nova senha deve ter pelo menos 6 caracteres" });
      }
      
      const user = await storage.getUser(req.user!.id);
      if (!user) {
        return res.status(404).json({ message: "Utilizador não encontrado" });
      }
      
      const isPasswordValid = await verifyPassword(currentPassword, user.passwordHash);
      if (!isPasswordValid) {
        return res.status(401).json({ message: "Senha atual incorreta" });
      }
      
      const newHashedPassword = await hashPassword(newPassword);
      await storage.updateUserPassword(req.user!.id, newHashedPassword);
      
      res.json({ message: "Senha alterada com sucesso" });
    } catch (error) {
      console.error("Change password error:", error);
      res.status(500).json({ message: "Erro ao alterar senha" });
    }
  });

  // ========== FILES ROUTES ==========

  // Get all files for current user
  app.get("/api/files", requireAuth, async (req: Request, res: Response) => {
    try {
      const folderId = req.query.folderId as string | undefined;
      const files = await storage.getFilesByFolder(
        folderId || null,
        req.user!.id
      );
      res.json(files);
    } catch (error) {
      res.status(500).json({ message: "Erro ao buscar arquivos" });
    }
  });

  // Search files
  app.get("/api/files/search", requireAuth, async (req: Request, res: Response) => {
    try {
      const query = req.query.q as string;
      if (!query) {
        return res.status(400).json({ message: "Query é obrigatório" });
      }
      const files = await storage.searchFiles(req.user!.id, query);
      res.json(files);
    } catch (error) {
      res.status(500).json({ message: "Erro ao buscar arquivos" });
    }
  });

  // Upload file
  app.post("/api/files/upload", requireAuth, upload.single("file"), async (req: Request, res: Response) => {
    // Extend timeout for large file uploads (30 minutes)
    req.setTimeout(1800000);
    res.setTimeout(1800000);
    
    try {
      // Import monitoring service for limits and tracking
      const { monitoringService } = await import("./monitoring");
      
      if (!req.file) {
        return res.status(400).json({ message: "Nenhum arquivo enviado" });
      }

      const user = req.user!;
      const fileSize = req.file.size;
      
      const clientSentEncrypted = req.body.isEncrypted === "true";
      const originalMimeType = req.body.originalMimeType || req.file.mimetype;
      const originalSize = req.body.originalSize ? parseInt(req.body.originalSize, 10) : fileSize;
      const folderId = req.body.folderId || null;
      
      // Check if uploading to a public folder - encryption is not allowed
      let isFolderPublic = false;
      if (folderId) {
        isFolderPublic = await storage.isFolderOrAncestorPublic(folderId);
      }
      
      // If client sent encrypted file to public folder, reject it with clear message
      if (isFolderPublic && clientSentEncrypted) {
        return res.status(400).json({ 
          message: "Ficheiros em pastas públicas não podem ser encriptados. O ficheiro será enviado sem encriptação.",
          isPublicFolder: true,
          requiresPlainUpload: true
        });
      }
      
      // For public folders, always store without encryption
      const isEncrypted = isFolderPublic ? false : clientSentEncrypted;
      
      // Get full user data for plan info
      const fullUser = await storage.getUser(user.id);
      if (!fullUser) {
        return res.status(500).json({ message: "Erro ao verificar utilizador" });
      }
      
      // Check daily limits and file size using monitoring service
      const canUploadCheck = monitoringService.canUpload(user.id, originalSize, fullUser.plano);
      if (!canUploadCheck.allowed) {
        return res.status(400).json({ message: canUploadCheck.reason });
      }
      
      // Determine who owns the storage (folder owner if uploading to shared folder)
      let storageOwnerId = user.id;
      let fileOwnerId = user.id;
      
      if (folderId) {
        const folder = await storage.getFolder(folderId);
        if (!folder) {
          return res.status(404).json({ message: "Pasta não encontrada" });
        }
        
        // Check if user has access to this folder
        if (folder.userId === user.id) {
          // User owns the folder - use their storage
          storageOwnerId = user.id;
          fileOwnerId = user.id;
        } else {
          // Check if user has collaborator permission
          const canUpload = await storage.canUploadToFolder(folderId, user.id);
          if (!canUpload) {
            return res.status(403).json({ message: "Sem permissão para enviar ficheiros para esta pasta" });
          }
          // Uploading to shared folder - storage goes to folder owner
          storageOwnerId = folder.userId;
          fileOwnerId = folder.userId;
        }
      }
      
      // Get storage owner's current usage
      const storageOwner = await storage.getUser(storageOwnerId);
      if (!storageOwner) {
        return res.status(500).json({ message: "Erro ao verificar quota de armazenamento" });
      }
      
      // Check upload limit (only for own uploads, not shared folder uploads)
      if (storageOwnerId === user.id && storageOwner.uploadLimit !== -1) {
        if (storageOwner.uploadsCount >= storageOwner.uploadLimit) {
          return res.status(400).json({ 
            message: "Limite de uploads atingido. Faça upgrade do seu plano para continuar.",
            uploadsCount: storageOwner.uploadsCount,
            uploadLimit: storageOwner.uploadLimit,
          });
        }
      }
      
      if (storageOwner.storageUsed + originalSize > storageOwner.storageLimit) {
        return res.status(400).json({ 
          message: storageOwnerId === user.id 
            ? "Quota de armazenamento excedida" 
            : "O proprietário da pasta excedeu a quota de armazenamento",
          storageUsed: storageOwner.storageUsed,
          storageLimit: storageOwner.storageLimit,
        });
      }

      if (!telegramService.isAvailable()) {
        return res.status(503).json({ 
          message: "Serviço de armazenamento temporariamente indisponível. Configure os tokens dos bots Telegram."
        });
      }

      // Use large file upload for files over 45MB (handles chunking automatically)
      const uploadResult = await telegramService.uploadLargeFile(
        req.file.buffer,
        req.file.originalname
      );

      // For chunked files, use first chunk's ID for the file record
      const mainFileId = uploadResult.chunks[0].fileId;
      const mainBotId = uploadResult.chunks[0].botId;

      const file = await storage.createFile({
        userId: fileOwnerId,
        uploadedByUserId: user.id,
        folderId,
        nome: req.file.originalname,
        tamanho: fileSize,
        tipoMime: isEncrypted ? 'application/octet-stream' : originalMimeType,
        telegramFileId: mainFileId,
        telegramBotId: mainBotId,
        isEncrypted,
        originalMimeType,
        originalSize,
        isChunked: uploadResult.isChunked,
        totalChunks: uploadResult.chunks.length,
      });

      // If file is chunked, save chunk information
      if (uploadResult.isChunked && uploadResult.chunks.length > 1) {
        const chunksData = uploadResult.chunks.map(chunk => ({
          fileId: file.id,
          chunkIndex: chunk.chunkIndex,
          telegramFileId: chunk.fileId,
          telegramBotId: chunk.botId,
          chunkSize: chunk.chunkSize,
        }));
        await storage.createFileChunks(chunksData);
      }

      // Update storage for the storage owner (folder owner if shared folder)
      await storage.updateUserStorage(storageOwnerId, originalSize);
      
      // Increment upload count for the uploader
      await storage.incrementUserUploadCount(user.id);
      
      // Record upload in monitoring system
      monitoringService.recordUpload(user.id, originalSize);

      // Notify via WebSocket
      wsManager.notifyFileUploaded(fileOwnerId, file);
      
      // Notify storage update
      const updatedUser = await storage.getUser(storageOwnerId);
      if (updatedUser) {
        wsManager.notifyStorageUpdated(storageOwnerId, {
          used: updatedUser.storageUsed,
          limit: updatedUser.storageLimit
        });
      }

      res.json(file);
    } catch (error) {
      console.error("Upload error:", error);
      // Record error in monitoring
      const { monitoringService: ms } = await import("./monitoring");
      ms.recordError('upload', error instanceof Error ? error.message : 'Unknown error');
      res.status(500).json({ message: "Erro ao fazer upload" });
    }
  });

  // ========== CHUNKED UPLOAD ROUTES ==========
  const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB per chunk from client
  const SESSION_EXPIRY_HOURS = 24; // Sessions expire after 24 hours

  // Initialize chunked upload session
  app.post("/api/files/init-upload", requireAuth, async (req: Request, res: Response) => {
    try {
      const { monitoringService } = await import("./monitoring");
      
      const schema = z.object({
        fileName: z.string().min(1),
        fileSize: z.number().positive().max(2 * 1024 * 1024 * 1024), // Max 2GB
        mimeType: z.string(),
        folderId: z.string().nullable().optional(),
        isEncrypted: z.boolean().optional(),
        originalMimeType: z.string().optional(),
        originalSize: z.number().optional(),
      });

      const data = schema.parse(req.body);
      const user = req.user!;
      const totalChunks = Math.ceil(data.fileSize / CHUNK_SIZE);

      // Check if uploading to a public folder
      let isFolderPublic = false;
      if (data.folderId) {
        isFolderPublic = await storage.isFolderOrAncestorPublic(data.folderId);
      }

      // If client wants encryption but folder is public, reject
      if (isFolderPublic && data.isEncrypted) {
        return res.status(400).json({ 
          message: "Ficheiros em pastas públicas não podem ser encriptados.",
          isPublicFolder: true,
          requiresPlainUpload: true
        });
      }

      // Get full user data for plan info
      const fullUser = await storage.getUser(user.id);
      if (!fullUser) {
        return res.status(500).json({ message: "Erro ao verificar utilizador" });
      }

      // Check daily limits
      const originalSize = data.originalSize || data.fileSize;
      const canUploadCheck = monitoringService.canUpload(user.id, originalSize, fullUser.plano);
      if (!canUploadCheck.allowed) {
        return res.status(400).json({ message: canUploadCheck.reason });
      }

      // Check storage quota
      let storageOwnerId = user.id;
      if (data.folderId) {
        const folder = await storage.getFolder(data.folderId);
        if (!folder) {
          return res.status(404).json({ message: "Pasta não encontrada" });
        }
        
        if (folder.userId !== user.id) {
          const canUpload = await storage.canUploadToFolder(data.folderId, user.id);
          if (!canUpload) {
            return res.status(403).json({ message: "Sem permissão para enviar ficheiros para esta pasta" });
          }
          storageOwnerId = folder.userId;
        }
      }

      const storageOwner = await storage.getUser(storageOwnerId);
      if (!storageOwner) {
        return res.status(500).json({ message: "Erro ao verificar quota de armazenamento" });
      }

      // Check upload limit
      if (storageOwnerId === user.id && storageOwner.uploadLimit !== -1) {
        if (storageOwner.uploadsCount >= storageOwner.uploadLimit) {
          return res.status(400).json({ 
            message: "Limite de uploads atingido. Faça upgrade do seu plano para continuar.",
          });
        }
      }

      if (storageOwner.storageUsed + originalSize > storageOwner.storageLimit) {
        return res.status(400).json({ 
          message: "Quota de armazenamento excedida",
        });
      }

      if (!telegramService.isAvailable()) {
        return res.status(503).json({ 
          message: "Serviço de armazenamento temporariamente indisponível."
        });
      }

      // Create upload session
      const expiresAt = new Date(Date.now() + SESSION_EXPIRY_HOURS * 60 * 60 * 1000);
      const session = await storage.createUploadSession({
        userId: user.id,
        fileName: data.fileName,
        fileSize: data.fileSize,
        mimeType: data.mimeType,
        totalChunks,
        folderId: data.folderId || null,
        isEncrypted: isFolderPublic ? false : (data.isEncrypted || false),
        originalMimeType: data.originalMimeType,
        originalSize: data.originalSize,
        expiresAt,
      });

      console.log(`📦 Upload session criada: ${session.id} (${totalChunks} chunks, ${(data.fileSize / 1024 / 1024).toFixed(2)}MB)`);

      res.json({
        sessionId: session.id,
        totalChunks,
        chunkSize: CHUNK_SIZE,
        expiresAt: expiresAt.toISOString(),
      });
    } catch (error) {
      console.error("Init upload error:", error);
      res.status(500).json({ message: "Erro ao iniciar upload" });
    }
  });

  // Upload a single chunk
  app.post("/api/files/upload-chunk", requireAuth, upload.single("chunk"), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "Nenhum chunk enviado" });
      }

      const sessionId = req.body.sessionId as string;
      const chunkIndex = parseInt(req.body.chunkIndex, 10);

      if (!sessionId || isNaN(chunkIndex)) {
        return res.status(400).json({ message: "sessionId e chunkIndex são obrigatórios" });
      }

      const session = await storage.getUploadSession(sessionId);
      if (!session) {
        return res.status(404).json({ message: "Sessão de upload não encontrada ou expirada" });
      }

      if (session.userId !== req.user!.id) {
        return res.status(403).json({ message: "Não autorizado" });
      }

      if (session.status !== "pending") {
        return res.status(400).json({ message: "Sessão de upload já foi concluída ou cancelada" });
      }

      if (chunkIndex < 0 || chunkIndex >= session.totalChunks) {
        return res.status(400).json({ message: "Índice de chunk inválido" });
      }

      // Check if chunk already exists
      const existingChunks = await storage.getUploadChunks(sessionId);
      const chunkExists = existingChunks.some(c => c.chunkIndex === chunkIndex);
      if (chunkExists) {
        return res.json({ 
          message: "Chunk já existe",
          chunkIndex,
          uploadedChunks: session.uploadedChunks,
          totalChunks: session.totalChunks,
        });
      }

      // Upload chunk to Telegram
      const chunkFileName = `${session.fileName}.chunk${chunkIndex.toString().padStart(4, '0')}`;
      const uploadResult = await telegramService.uploadFile(req.file.buffer, chunkFileName);

      // Save chunk info
      await storage.createUploadChunk({
        sessionId,
        chunkIndex,
        telegramFileId: uploadResult.fileId,
        telegramBotId: uploadResult.botId,
        chunkSize: req.file.size,
      });

      // Update session chunk count
      await storage.updateUploadSessionChunkCount(sessionId);

      const updatedSession = await storage.getUploadSession(sessionId);
      const uploadedChunks = updatedSession?.uploadedChunks || session.uploadedChunks + 1;

      console.log(`📤 Chunk ${chunkIndex + 1}/${session.totalChunks} uploaded for session ${sessionId}`);

      res.json({
        message: "Chunk enviado com sucesso",
        chunkIndex,
        uploadedChunks,
        totalChunks: session.totalChunks,
        isComplete: uploadedChunks === session.totalChunks,
      });
    } catch (error) {
      console.error("Chunk upload error:", error);
      res.status(500).json({ message: "Erro ao enviar chunk" });
    }
  });

  // Complete the upload and create file record
  app.post("/api/files/complete-upload", requireAuth, async (req: Request, res: Response) => {
    try {
      const { monitoringService } = await import("./monitoring");
      
      const { sessionId } = z.object({ sessionId: z.string() }).parse(req.body);
      const user = req.user!;

      const session = await storage.getUploadSession(sessionId);
      if (!session) {
        return res.status(404).json({ message: "Sessão de upload não encontrada" });
      }

      if (session.userId !== user.id) {
        return res.status(403).json({ message: "Não autorizado" });
      }

      if (session.status !== "pending") {
        return res.status(400).json({ message: "Sessão já foi processada" });
      }

      // Verify all chunks are uploaded
      const chunks = await storage.getUploadChunks(sessionId);
      if (chunks.length !== session.totalChunks) {
        return res.status(400).json({ 
          message: `Upload incompleto: ${chunks.length}/${session.totalChunks} chunks enviados`,
          uploadedChunks: chunks.length,
          totalChunks: session.totalChunks,
        });
      }

      // Verify chunk indices are sequential
      const sortedChunks = [...chunks].sort((a, b) => a.chunkIndex - b.chunkIndex);
      for (let i = 0; i < sortedChunks.length; i++) {
        if (sortedChunks[i].chunkIndex !== i) {
          return res.status(400).json({ 
            message: `Chunk ${i} está em falta`,
          });
        }
      }

      // Determine file and storage owners
      let storageOwnerId = user.id;
      let fileOwnerId = user.id;
      
      if (session.folderId) {
        const folder = await storage.getFolder(session.folderId);
        if (folder && folder.userId !== user.id) {
          storageOwnerId = folder.userId;
          fileOwnerId = folder.userId;
        }
      }

      // Create file record
      const isChunked = session.totalChunks > 1;
      const file = await storage.createFile({
        userId: fileOwnerId,
        uploadedByUserId: user.id,
        folderId: session.folderId,
        nome: session.fileName,
        tamanho: session.fileSize,
        tipoMime: session.isEncrypted ? 'application/octet-stream' : session.mimeType,
        telegramFileId: sortedChunks[0].telegramFileId,
        telegramBotId: sortedChunks[0].telegramBotId,
        isEncrypted: session.isEncrypted,
        originalMimeType: session.originalMimeType ?? undefined,
        originalSize: session.originalSize ?? undefined,
        isChunked,
        totalChunks: session.totalChunks,
      });

      // If file is chunked, save chunk information to permanent table
      if (isChunked) {
        const fileChunksData = sortedChunks.map(chunk => ({
          fileId: file.id,
          chunkIndex: chunk.chunkIndex,
          telegramFileId: chunk.telegramFileId,
          telegramBotId: chunk.telegramBotId,
          chunkSize: chunk.chunkSize,
        }));
        await storage.createFileChunks(fileChunksData);
      }

      // Update storage
      const originalSize = session.originalSize || session.fileSize;
      await storage.updateUserStorage(storageOwnerId, originalSize);
      await storage.incrementUserUploadCount(user.id);
      
      // Record upload in monitoring
      monitoringService.recordUpload(user.id, originalSize);

      // Clean up session and temporary chunks
      await storage.updateUploadSessionStatus(sessionId, "completed");
      await storage.deleteUploadChunks(sessionId);
      await storage.deleteUploadSession(sessionId);

      // Notify via WebSocket
      wsManager.notifyFileUploaded(fileOwnerId, file);
      
      const updatedUser = await storage.getUser(storageOwnerId);
      if (updatedUser) {
        wsManager.notifyStorageUpdated(storageOwnerId, {
          used: updatedUser.storageUsed,
          limit: updatedUser.storageLimit
        });
      }

      console.log(`✅ Upload completo: ${file.nome} (${session.totalChunks} chunks, ${(session.fileSize / 1024 / 1024).toFixed(2)}MB)`);

      res.json(file);
    } catch (error) {
      console.error("Complete upload error:", error);
      res.status(500).json({ message: "Erro ao concluir upload" });
    }
  });

  // Cancel an upload session
  app.delete("/api/files/upload-session/:sessionId", requireAuth, async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const session = await storage.getUploadSession(sessionId);
      
      if (!session) {
        return res.status(404).json({ message: "Sessão não encontrada" });
      }

      if (session.userId !== req.user!.id) {
        return res.status(403).json({ message: "Não autorizado" });
      }

      // Delete uploaded chunks from Telegram (best effort)
      const chunks = await storage.getUploadChunks(sessionId);
      for (const chunk of chunks) {
        try {
          await telegramService.deleteFile(chunk.telegramFileId, chunk.telegramBotId);
        } catch (e) {
          // Ignore errors when deleting from Telegram
        }
      }

      await storage.deleteUploadChunks(sessionId);
      await storage.deleteUploadSession(sessionId);

      res.json({ message: "Sessão de upload cancelada" });
    } catch (error) {
      console.error("Cancel upload error:", error);
      res.status(500).json({ message: "Erro ao cancelar upload" });
    }
  });

  // Delete file (move to trash)
  app.delete("/api/files/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const file = await storage.getFile(req.params.id);
      if (!file || file.userId !== req.user!.id) {
        return res.status(404).json({ message: "Arquivo não encontrado" });
      }

      await storage.moveToTrash(req.params.id);
      
      // Notify via WebSocket
      wsManager.notifyFileDeleted(req.user!.id, req.params.id);
      
      res.json({ message: "Arquivo movido para a lixeira" });
    } catch (error) {
      res.status(500).json({ message: "Erro ao deletar arquivo" });
    }
  });

  // Get trash files
  app.get("/api/files/trash", requireAuth, async (req: Request, res: Response) => {
    try {
      const files = await storage.getTrashFiles(req.user!.id);
      res.json(files);
    } catch (error) {
      res.status(500).json({ message: "Erro ao buscar arquivos da lixeira" });
    }
  });

  // Restore file from trash
  app.post("/api/files/:id/restore", requireAuth, async (req: Request, res: Response) => {
    try {
      const file = await storage.getFile(req.params.id);
      if (!file || file.userId !== req.user!.id) {
        return res.status(404).json({ message: "Arquivo não encontrado" });
      }

      await storage.restoreFromTrash(req.params.id);
      
      // Notify via WebSocket
      wsManager.notifyFileRestored(req.user!.id, req.params.id);
      
      res.json({ message: "Arquivo restaurado com sucesso" });
    } catch (error) {
      res.status(500).json({ message: "Erro ao restaurar arquivo" });
    }
  });

  // Permanently delete file
  app.delete("/api/files/:id/permanent", requireAuth, async (req: Request, res: Response) => {
    try {
      const file = await storage.getFile(req.params.id);
      if (!file || file.userId !== req.user!.id) {
        return res.status(404).json({ message: "Arquivo não encontrado" });
      }

      // Try to delete from Telegram (Telegram doesn't support real deletion, but we try)
      if (file.telegramFileId && file.telegramBotId) {
        try {
          await telegramService.deleteFile(file.telegramFileId, file.telegramBotId);
        } catch (telegramError) {
          console.log(`ℹ️ Não foi possível eliminar do Telegram: ${telegramError}`);
        }
      }

      // Decrease storage used
      await storage.updateUserStorage(req.user!.id, -file.tamanho);
      await storage.deleteFile(req.params.id);
      res.json({ message: "Arquivo deletado permanentemente" });
    } catch (error) {
      res.status(500).json({ message: "Erro ao deletar arquivo permanentemente" });
    }
  });

  // Rename file
  app.patch("/api/files/:id/rename", requireAuth, async (req: Request, res: Response) => {
    try {
      const file = await storage.getFile(req.params.id);
      if (!file || file.userId !== req.user!.id) {
        return res.status(404).json({ message: "Arquivo não encontrado" });
      }

      const { nome } = z.object({ nome: z.string().min(1) }).parse(req.body);
      await storage.renameFile(req.params.id, nome);
      res.json({ message: "Arquivo renomeado com sucesso" });
    } catch (error) {
      res.status(500).json({ message: "Erro ao renomear arquivo" });
    }
  });

  // Move file
  app.patch("/api/files/:id/move", requireAuth, async (req: Request, res: Response) => {
    try {
      const file = await storage.getFile(req.params.id);
      if (!file || file.userId !== req.user!.id) {
        return res.status(404).json({ message: "Arquivo não encontrado" });
      }

      const { folderId } = z.object({ folderId: z.string().nullable() }).parse(req.body);
      await storage.moveFile(req.params.id, folderId);
      res.json({ message: "Arquivo movido com sucesso" });
    } catch (error) {
      res.status(500).json({ message: "Erro ao mover arquivo" });
    }
  });

  // Reprocess file (decrypt and re-upload without encryption for public folders)
  app.post("/api/files/:id/reprocess", requireAuth, upload.single("file"), async (req: Request, res: Response) => {
    req.setTimeout(1800000);
    res.setTimeout(1800000);
    
    try {
      const file = await storage.getFile(req.params.id);
      if (!file || file.userId !== req.user!.id) {
        return res.status(404).json({ message: "Arquivo não encontrado" });
      }

      if (!file.isEncrypted) {
        return res.status(400).json({ message: "O ficheiro não está encriptado" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "Ficheiro desencriptado não fornecido" });
      }

      if (!telegramService.isAvailable()) {
        return res.status(500).json({ message: "Serviço de armazenamento indisponível" });
      }

      const trustedMimeType = file.originalMimeType || req.file.mimetype;
      const trustedSize = req.file.size;

      const oldTelegramFileId = file.telegramFileId;
      const oldTelegramBotId = file.telegramBotId;
      const oldStoredSize = file.tamanho;

      const telegramResult = await telegramService.uploadFile(
        req.file.buffer,
        file.nome
      );

      try {
        await storage.updateFile(file.id, {
          telegramFileId: telegramResult.fileId,
          telegramBotId: telegramResult.botId,
          tamanho: trustedSize,
          tipoMime: trustedMimeType,
          originalMimeType: trustedMimeType,
          originalSize: trustedSize,
          isEncrypted: false,
        });

        const sizeDiff = trustedSize - oldStoredSize;
        if (sizeDiff !== 0) {
          await storage.updateUserStorage(req.user!.id, sizeDiff);
        }

        if (oldTelegramFileId && oldTelegramBotId) {
          try {
            await telegramService.deleteFile(oldTelegramFileId, oldTelegramBotId);
          } catch (deleteError) {
            console.warn(`Não foi possível eliminar ficheiro antigo do Telegram: ${oldTelegramFileId}`);
          }
        }

        res.json({ 
          message: "Ficheiro reprocessado com sucesso",
          file: {
            id: file.id,
            nome: file.nome,
            isEncrypted: false,
            tamanho: trustedSize,
            tipoMime: trustedMimeType,
          }
        });
      } catch (dbError) {
        console.error("Erro ao atualizar base de dados após upload:", dbError);
        try {
          await telegramService.deleteFile(telegramResult.fileId, telegramResult.botId);
        } catch (cleanupError) {
          console.warn("Não foi possível limpar ficheiro novo após erro de DB");
        }
        throw dbError;
      }
    } catch (error) {
      console.error("Erro ao reprocessar ficheiro:", error);
      res.status(500).json({ message: "Erro ao reprocessar ficheiro" });
    }
  });

  // ========== FOLDERS ROUTES ==========

  // Get all folders for current user
  app.get("/api/folders", requireAuth, async (req: Request, res: Response) => {
    try {
      const parentId = req.query.parentId as string | undefined;
      const folders = await storage.getFoldersByParent(
        parentId || null,
        req.user!.id
      );
      res.json(folders);
    } catch (error) {
      res.status(500).json({ message: "Erro ao buscar pastas" });
    }
  });

  // Create folder
  app.post("/api/folders", requireAuth, async (req: Request, res: Response) => {
    try {
      const { nome, parentId } = z.object({
        nome: z.string().min(1),
        parentId: z.string().nullable().optional(),
      }).parse(req.body);

      const folder = await storage.createFolder({
        userId: req.user!.id,
        nome,
        parentId: parentId || null,
      });

      res.json(folder);
    } catch (error) {
      res.status(500).json({ message: "Erro ao criar pasta" });
    }
  });

  // Delete folder
  app.delete("/api/folders/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const folder = await storage.getFolder(req.params.id);
      if (!folder || folder.userId !== req.user!.id) {
        return res.status(404).json({ message: "Pasta não encontrada" });
      }

      await storage.deleteFolder(req.params.id);
      res.json({ message: "Pasta deletada com sucesso" });
    } catch (error) {
      res.status(500).json({ message: "Erro ao deletar pasta" });
    }
  });

  // Rename folder
  app.patch("/api/folders/:id/rename", requireAuth, async (req: Request, res: Response) => {
    try {
      const folder = await storage.getFolder(req.params.id);
      if (!folder || folder.userId !== req.user!.id) {
        return res.status(404).json({ message: "Pasta não encontrada" });
      }

      const { nome } = z.object({ nome: z.string().min(1) }).parse(req.body);
      await storage.renameFolder(req.params.id, nome);
      res.json({ message: "Pasta renomeada com sucesso" });
    } catch (error) {
      res.status(500).json({ message: "Erro ao renomear pasta" });
    }
  });

  // ========== PUBLIC FOLDER ROUTES (Authenticated) ==========

  // Make folder public
  app.post("/api/folders/:id/make-public", requireAuth, async (req: Request, res: Response) => {
    try {
      const result = await storage.makeFolderPublic(req.params.id, req.user!.id);
      res.json({ 
        message: "Pasta tornada pública com sucesso",
        slug: result.slug,
        publicUrl: `/p/${result.slug}`
      });
    } catch (error: any) {
      console.error("Make folder public error:", error);
      res.status(500).json({ message: error.message || "Erro ao tornar pasta pública" });
    }
  });

  // Make folder private
  app.post("/api/folders/:id/make-private", requireAuth, async (req: Request, res: Response) => {
    try {
      await storage.makeFolderPrivate(req.params.id, req.user!.id);
      res.json({ message: "Pasta tornada privada com sucesso" });
    } catch (error: any) {
      console.error("Make folder private error:", error);
      res.status(500).json({ message: error.message || "Erro ao tornar pasta privada" });
    }
  });

  // Regenerate public slug
  app.post("/api/folders/:id/regenerate-slug", requireAuth, async (req: Request, res: Response) => {
    try {
      const result = await storage.regeneratePublicSlug(req.params.id, req.user!.id);
      res.json({ 
        message: "Link regenerado com sucesso",
        slug: result.slug,
        publicUrl: `/p/${result.slug}`
      });
    } catch (error: any) {
      console.error("Regenerate slug error:", error);
      res.status(500).json({ message: error.message || "Erro ao regenerar link" });
    }
  });

  // Get user's public folders
  app.get("/api/folders/public", requireAuth, async (req: Request, res: Response) => {
    try {
      const folders = await storage.getUserPublicFolders(req.user!.id);
      res.json(folders);
    } catch (error) {
      console.error("Get public folders error:", error);
      res.status(500).json({ message: "Erro ao buscar pastas públicas" });
    }
  });

  // ========== PUBLIC FOLDER ROUTES (Unauthenticated) ==========

  // Get public folder by slug (no auth required)
  app.get("/api/public/folder/:slug", async (req: Request, res: Response) => {
    try {
      const folder = await storage.getPublicFolderBySlug(req.params.slug);
      if (!folder) {
        return res.status(404).json({ message: "Pasta não encontrada" });
      }

      const owner = await storage.getUser(folder.userId);
      res.json({
        id: folder.id,
        nome: folder.nome,
        publishedAt: folder.publishedAt,
        ownerName: owner?.nome || "Anónimo"
      });
    } catch (error) {
      console.error("Get public folder error:", error);
      res.status(500).json({ message: "Erro ao buscar pasta pública" });
    }
  });

  // Get public folder contents (no auth required)
  app.get("/api/public/folder/:slug/contents", async (req: Request, res: Response) => {
    try {
      const folder = await storage.getPublicFolderBySlug(req.params.slug);
      if (!folder) {
        return res.status(404).json({ message: "Pasta não encontrada" });
      }

      const files = await storage.getPublicFolderFiles(folder.id);
      const subfolders = await storage.getPublicFolderSubfolders(folder.id);

      res.json({
        files: files.map(f => ({
          id: f.id,
          nome: f.nome,
          tamanho: f.originalSize || f.tamanho,
          tipoMime: f.originalMimeType || f.tipoMime,
          createdAt: f.createdAt,
          isEncrypted: f.isEncrypted || false,
          originalMimeType: f.originalMimeType || f.tipoMime
        })),
        folders: subfolders.map(sf => ({
          id: sf.id,
          nome: sf.nome,
          createdAt: sf.createdAt
        }))
      });
    } catch (error) {
      console.error("Get public folder contents error:", error);
      res.status(500).json({ message: "Erro ao buscar conteúdo da pasta" });
    }
  });

  // Preview file from public folder (no auth required)
  app.get("/api/public/file/:fileId/preview", async (req: Request, res: Response) => {
    try {
      const file = await storage.getFile(req.params.fileId);
      if (!file || file.isDeleted) {
        return res.status(404).json({ message: "Ficheiro não encontrado" });
      }

      // Verify the file is in a public folder
      if (!file.folderId) {
        return res.status(403).json({ message: "Ficheiro não está numa pasta pública" });
      }

      const folder = await storage.getFolder(file.folderId);
      if (!folder || !folder.isPublic) {
        return res.status(403).json({ message: "Ficheiro não está numa pasta pública" });
      }

      // Get download URL from Telegram
      if (!file.telegramFileId || !file.telegramBotId) {
        return res.status(404).json({ message: "Ficheiro não disponível" });
      }

      // For encrypted files, use the content endpoint that handles decryption on client
      const isEncrypted = file.isEncrypted || false;
      const originalMimeType = file.originalMimeType || file.tipoMime;

      // For encrypted files, return content URL instead of direct Telegram URL
      if (isEncrypted) {
        return res.json({ 
          url: `/api/public/file/${file.id}/content`,
          tipoMime: originalMimeType,
          nome: file.nome,
          isEncrypted: true,
          originalMimeType
        });
      }

      // For videos, return the video URL directly - client will use it with <video> tag
      // The <video> element will extract the first frame as thumbnail
      if (originalMimeType.startsWith("video/")) {
        const downloadUrl = await telegramService.getDownloadUrl(file.telegramFileId, file.telegramBotId);
        return res.json({ 
          url: downloadUrl,
          tipoMime: originalMimeType,
          nome: file.nome,
          isEncrypted: false
        });
      }

      // For images, return the image URL
      const downloadUrl = await telegramService.getDownloadUrl(file.telegramFileId, file.telegramBotId);
      res.json({ 
        url: downloadUrl,
        tipoMime: originalMimeType,
        nome: file.nome,
        isEncrypted: false
      });
    } catch (error) {
      console.error("Public file preview error:", error);
      res.status(500).json({ message: "Erro ao obter preview" });
    }
  });

  // Stream file from public folder (for video thumbnails with CORS support)
  // Supports Range requests for mobile video playback (iOS/Safari)
  app.get("/api/public/file/:fileId/stream", async (req: Request, res: Response) => {
    try {
      const file = await storage.getFile(req.params.fileId);
      if (!file || file.isDeleted) {
        return res.status(404).json({ message: "Ficheiro não encontrado" });
      }

      // Verify the file is in a public folder
      if (!file.folderId) {
        return res.status(403).json({ message: "Ficheiro não está numa pasta pública" });
      }

      const folder = await storage.getFolder(file.folderId);
      if (!folder || !folder.isPublic) {
        return res.status(403).json({ message: "Ficheiro não está numa pasta pública" });
      }

      // Download file from Telegram
      if (!file.telegramFileId || !file.telegramBotId) {
        return res.status(404).json({ message: "Ficheiro não disponível" });
      }

      const fileBuffer = await telegramService.downloadFile(file.telegramFileId, file.telegramBotId);
      const originalMimeType = file.originalMimeType || file.tipoMime;
      const originalSize = file.originalSize || file.tamanho;
      const fileSize = fileBuffer.length;
      
      // Handle Range requests for video seeking (critical for mobile)
      const range = req.headers.range;
      
      // Set common headers
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Range");
      res.setHeader("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Type", file.isEncrypted ? "application/octet-stream" : originalMimeType);
      res.setHeader("X-Is-Encrypted", file.isEncrypted ? "true" : "false");
      res.setHeader("X-Original-Mime-Type", originalMimeType);
      res.setHeader("X-Original-Size", originalSize.toString());
      
      if (range) {
        // Parse Range header
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        
        // Validate range
        if (start >= fileSize || end >= fileSize || start > end) {
          res.status(416).setHeader("Content-Range", `bytes */${fileSize}`);
          return res.end();
        }
        
        const chunkSize = end - start + 1;
        const chunk = fileBuffer.slice(start, end + 1);
        
        res.status(206);
        res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
        res.setHeader("Content-Length", chunkSize.toString());
        res.send(chunk);
      } else {
        // Full file response
        res.setHeader("Content-Length", fileSize.toString());
        res.send(fileBuffer);
      }
    } catch (error) {
      console.error("Public file stream error:", error);
      res.status(500).json({ message: "Erro ao transmitir ficheiro" });
    }
  });

  // Download file from public folder (no auth required)
  app.get("/api/public/file/:fileId/download", async (req: Request, res: Response) => {
    try {
      const file = await storage.getFile(req.params.fileId);
      if (!file || file.isDeleted) {
        return res.status(404).json({ message: "Ficheiro não encontrado" });
      }

      // Verify the file is in a public folder
      if (!file.folderId) {
        return res.status(403).json({ message: "Ficheiro não está numa pasta pública" });
      }

      const folder = await storage.getFolder(file.folderId);
      if (!folder || !folder.isPublic) {
        return res.status(403).json({ message: "Ficheiro não está numa pasta pública" });
      }

      // Download file from Telegram
      if (!file.telegramFileId || !file.telegramBotId) {
        return res.status(404).json({ message: "Ficheiro não disponível" });
      }

      const fileBuffer = await telegramService.downloadFile(file.telegramFileId, file.telegramBotId);
      const originalMimeType = file.originalMimeType || file.tipoMime;
      
      // For encrypted files, include headers to inform client
      res.setHeader("Content-Type", file.isEncrypted ? "application/octet-stream" : originalMimeType);
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(file.nome)}"`);
      res.setHeader("Content-Length", fileBuffer.length.toString());
      res.setHeader("X-Is-Encrypted", file.isEncrypted ? "true" : "false");
      res.setHeader("X-Original-Mime-Type", originalMimeType);
      res.setHeader("X-Original-Size", (file.originalSize || file.tamanho).toString());
      res.send(fileBuffer);
    } catch (error) {
      console.error("Public file download error:", error);
      res.status(500).json({ message: "Erro ao baixar ficheiro" });
    }
  });

  // Content endpoint for public files (serves raw data for client-side decryption)
  app.get("/api/public/file/:fileId/content", async (req: Request, res: Response) => {
    try {
      const file = await storage.getFile(req.params.fileId);
      if (!file || file.isDeleted) {
        return res.status(404).json({ message: "Ficheiro não encontrado" });
      }

      // Verify the file is in a public folder
      if (!file.folderId) {
        return res.status(403).json({ message: "Ficheiro não está numa pasta pública" });
      }

      const folder = await storage.getFolder(file.folderId);
      if (!folder || !folder.isPublic) {
        return res.status(403).json({ message: "Ficheiro não está numa pasta pública" });
      }

      // Download file from Telegram
      if (!file.telegramFileId || !file.telegramBotId) {
        return res.status(404).json({ message: "Ficheiro não disponível" });
      }

      const fileBuffer = await telegramService.downloadFile(file.telegramFileId, file.telegramBotId);
      const originalMimeType = file.originalMimeType || file.tipoMime;
      
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Expose-Headers", "X-Is-Encrypted, X-Original-Mime-Type, X-Original-Size");
      res.setHeader("Content-Type", file.isEncrypted ? "application/octet-stream" : originalMimeType);
      res.setHeader("Content-Length", fileBuffer.length.toString());
      res.setHeader("X-Is-Encrypted", file.isEncrypted ? "true" : "false");
      res.setHeader("X-Original-Mime-Type", originalMimeType);
      res.setHeader("X-Original-Size", (file.originalSize || file.tamanho).toString());
      res.send(fileBuffer);
    } catch (error) {
      console.error("Public file content error:", error);
      res.status(500).json({ message: "Erro ao obter conteúdo do ficheiro" });
    }
  });

  // ========== INVITATION ROUTES ==========

  // Create invitation (invite someone to access a file or folder)
  app.post("/api/invitations", requireAuth, async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        resourceType: z.enum(["file", "folder"]),
        resourceId: z.string(),
        inviteeEmail: z.string().email(),
        role: z.enum(["viewer", "collaborator"]).optional().default("viewer"),
        sharedEncryptionKey: z.string().optional(),
      });

      const { resourceType, resourceId, inviteeEmail, role, sharedEncryptionKey } = schema.parse(req.body);
      const inviterId = req.user!.id;

      // Verify the resource exists and belongs to the user
      if (resourceType === "file") {
        const file = await storage.getFile(resourceId);
        if (!file || file.userId !== inviterId) {
          return res.status(404).json({ message: "Ficheiro não encontrado" });
        }
      } else {
        const folder = await storage.getFolder(resourceId);
        if (!folder || folder.userId !== inviterId) {
          return res.status(404).json({ message: "Pasta não encontrada" });
        }
      }

      // Check if invitee already has access
      const existingInvitations = await storage.getInvitationsForResource(resourceType, resourceId);
      const alreadyInvited = existingInvitations.find(
        inv => inv.inviteeEmail === inviteeEmail && (inv.status === "pending" || inv.status === "accepted")
      );
      if (alreadyInvited) {
        return res.status(400).json({ message: "Este email já foi convidado" });
      }

      // Check if invitee user exists
      const inviteeUser = await storage.getUserByEmail(inviteeEmail);

      // Generate unique token for the invitation
      const token = crypto.randomBytes(32).toString("hex");

      const invitation = await storage.createInvitation({
        resourceType,
        resourceId,
        inviterId,
        inviteeEmail,
        role,
        token,
        sharedEncryptionKey,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      });

      // If the invitee user exists, we can directly reference them
      if (inviteeUser) {
        await storage.updateInvitationStatus(invitation.id, "pending", inviteeUser.id);
      }

      res.json({
        ...invitation,
        inviteeExists: !!inviteeUser,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Dados inválidos", errors: error.errors });
      }
      console.error("Create invitation error:", error);
      res.status(500).json({ message: "Erro ao criar convite" });
    }
  });

  // Get pending invitations for current user
  app.get("/api/invitations/pending", requireAuth, async (req: Request, res: Response) => {
    try {
      const invitations = await storage.getPendingInvitationsForUser(req.user!.email);
      
      // Enrich with resource details
      const enrichedInvitations = await Promise.all(
        invitations.map(async (inv) => {
          let resourceName = "";
          let ownerName = "";
          
          if (inv.resourceType === "file") {
            const file = await storage.getFile(inv.resourceId);
            resourceName = file?.nome || "Ficheiro desconhecido";
          } else {
            const folder = await storage.getFolder(inv.resourceId);
            resourceName = folder?.nome || "Pasta desconhecida";
          }
          
          const inviter = await storage.getUser(inv.inviterId);
          ownerName = inviter?.nome || "Utilizador desconhecido";
          
          return {
            ...inv,
            resourceName,
            ownerName,
          };
        })
      );
      
      res.json(enrichedInvitations);
    } catch (error) {
      console.error("Get pending invitations error:", error);
      res.status(500).json({ message: "Erro ao buscar convites" });
    }
  });

  // Get sent invitations (invitations created by current user)
  app.get("/api/invitations/sent", requireAuth, async (req: Request, res: Response) => {
    try {
      const invitations = await storage.getInvitationsByInviter(req.user!.id);
      
      // Enrich with resource details
      const enrichedInvitations = await Promise.all(
        invitations.map(async (inv) => {
          let resourceName = "";
          
          if (inv.resourceType === "file") {
            const file = await storage.getFile(inv.resourceId);
            resourceName = file?.nome || "Ficheiro desconhecido";
          } else {
            const folder = await storage.getFolder(inv.resourceId);
            resourceName = folder?.nome || "Pasta desconhecida";
          }
          
          return {
            ...inv,
            resourceName,
          };
        })
      );
      
      res.json(enrichedInvitations);
    } catch (error) {
      console.error("Get sent invitations error:", error);
      res.status(500).json({ message: "Erro ao buscar convites enviados" });
    }
  });

  // Get invitations for a specific resource
  app.get("/api/invitations/resource/:type/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const { type, id } = req.params;
      
      // Verify ownership
      if (type === "file") {
        const file = await storage.getFile(id);
        if (!file || file.userId !== req.user!.id) {
          return res.status(404).json({ message: "Ficheiro não encontrado" });
        }
      } else if (type === "folder") {
        const folder = await storage.getFolder(id);
        if (!folder || folder.userId !== req.user!.id) {
          return res.status(404).json({ message: "Pasta não encontrada" });
        }
      } else {
        return res.status(400).json({ message: "Tipo de recurso inválido" });
      }
      
      const invitations = await storage.getInvitationsForResource(type, id);
      res.json(invitations);
    } catch (error) {
      console.error("Get resource invitations error:", error);
      res.status(500).json({ message: "Erro ao buscar convites do recurso" });
    }
  });

  // Accept invitation
  app.post("/api/invitations/:id/accept", requireAuth, async (req: Request, res: Response) => {
    try {
      const invitation = await storage.getInvitationById(req.params.id);
      
      if (!invitation) {
        return res.status(404).json({ message: "Convite não encontrado" });
      }
      
      if (invitation.inviteeEmail !== req.user!.email) {
        return res.status(403).json({ message: "Este convite não é para você" });
      }
      
      if (invitation.status !== "pending") {
        return res.status(400).json({ message: "Este convite já foi processado" });
      }
      
      if (invitation.expiresAt && new Date(invitation.expiresAt) < new Date()) {
        return res.status(410).json({ message: "Este convite expirou" });
      }
      
      // Update invitation status
      await storage.updateInvitationStatus(invitation.id, "accepted", req.user!.id);
      
      // Create the appropriate permission with encryption key if provided
      if (invitation.resourceType === "file") {
        await storage.createFilePermission({
          fileId: invitation.resourceId,
          userId: req.user!.id,
          role: invitation.role === "collaborator" ? "editor" : "viewer",
          grantedBy: invitation.inviterId,
          sharedEncryptionKey: invitation.sharedEncryptionKey || undefined,
        });
      } else {
        await storage.createFolderPermission({
          folderId: invitation.resourceId,
          userId: req.user!.id,
          role: invitation.role,
          grantedBy: invitation.inviterId,
          sharedEncryptionKey: invitation.sharedEncryptionKey || undefined,
        });
      }
      
      res.json({ message: "Convite aceite com sucesso" });
    } catch (error) {
      console.error("Accept invitation error:", error);
      res.status(500).json({ message: "Erro ao aceitar convite" });
    }
  });

  // Decline invitation
  app.post("/api/invitations/:id/decline", requireAuth, async (req: Request, res: Response) => {
    try {
      const invitation = await storage.getInvitationById(req.params.id);
      
      if (!invitation) {
        return res.status(404).json({ message: "Convite não encontrado" });
      }
      
      if (invitation.inviteeEmail !== req.user!.email) {
        return res.status(403).json({ message: "Este convite não é para você" });
      }
      
      if (invitation.status !== "pending") {
        return res.status(400).json({ message: "Este convite já foi processado" });
      }
      
      await storage.updateInvitationStatus(invitation.id, "declined", req.user!.id);
      
      res.json({ message: "Convite recusado" });
    } catch (error) {
      console.error("Decline invitation error:", error);
      res.status(500).json({ message: "Erro ao recusar convite" });
    }
  });

  // Cancel invitation (by the inviter)
  app.delete("/api/invitations/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const invitation = await storage.getInvitationById(req.params.id);
      
      if (!invitation) {
        return res.status(404).json({ message: "Convite não encontrado" });
      }
      
      if (invitation.inviterId !== req.user!.id) {
        return res.status(403).json({ message: "Você não pode cancelar este convite" });
      }
      
      // If the invitation was already accepted, also remove the permission
      if (invitation.status === "accepted" && invitation.inviteeUserId) {
        if (invitation.resourceType === "file") {
          const permission = await storage.getFilePermission(invitation.resourceId, invitation.inviteeUserId);
          if (permission) {
            await storage.deleteFilePermission(permission.id);
          }
        } else {
          const permission = await storage.getFolderPermission(invitation.resourceId, invitation.inviteeUserId);
          if (permission) {
            await storage.deleteFolderPermission(permission.id);
          }
        }
      }
      
      await storage.deleteInvitation(invitation.id);
      
      res.json({ message: "Convite cancelado" });
    } catch (error) {
      console.error("Cancel invitation error:", error);
      res.status(500).json({ message: "Erro ao cancelar convite" });
    }
  });

  // Update invitation role (by the inviter)
  app.patch("/api/invitations/:id/role", requireAuth, async (req: Request, res: Response) => {
    try {
      const invitation = await storage.getInvitationById(req.params.id);
      
      if (!invitation) {
        return res.status(404).json({ message: "Convite não encontrado" });
      }
      
      if (invitation.inviterId !== req.user!.id) {
        return res.status(403).json({ message: "Você não pode alterar este convite" });
      }

      const { role } = z.object({
        role: z.enum(["viewer", "collaborator", "editor"]),
      }).parse(req.body);
      
      // Update invitation role
      await storage.updateInvitationRole(invitation.id, role);
      
      // If the invitation was already accepted, also update the permission
      if (invitation.status === "accepted" && invitation.inviteeUserId) {
        console.log(`Updating permission for user ${invitation.inviteeUserId} on ${invitation.resourceType} ${invitation.resourceId} to role ${role}`);
        
        if (invitation.resourceType === "file") {
          const permission = await storage.getFilePermission(invitation.resourceId, invitation.inviteeUserId);
          if (permission) {
            await storage.updateFilePermissionRole(permission.id, role === "collaborator" ? "editor" : role);
            console.log(`File permission ${permission.id} updated to ${role}`);
          } else {
            console.warn(`No file permission found for file ${invitation.resourceId} and user ${invitation.inviteeUserId}, creating one`);
            // Create the missing permission
            await storage.createFilePermission({
              fileId: invitation.resourceId,
              userId: invitation.inviteeUserId,
              role: role === "collaborator" ? "editor" : role,
              grantedBy: invitation.inviterId,
              sharedEncryptionKey: invitation.sharedEncryptionKey || undefined,
            });
            console.log(`Created new file permission for user ${invitation.inviteeUserId}`);
          }
        } else {
          const permission = await storage.getFolderPermission(invitation.resourceId, invitation.inviteeUserId);
          if (permission) {
            await storage.updateFolderPermissionRole(permission.id, role);
            console.log(`Folder permission ${permission.id} updated to ${role}`);
          } else {
            console.warn(`No folder permission found for folder ${invitation.resourceId} and user ${invitation.inviteeUserId}, creating one`);
            // Create the missing permission
            await storage.createFolderPermission({
              folderId: invitation.resourceId,
              userId: invitation.inviteeUserId,
              role: role,
              grantedBy: invitation.inviterId,
              sharedEncryptionKey: invitation.sharedEncryptionKey || undefined,
            });
            console.log(`Created new folder permission for user ${invitation.inviteeUserId}`);
          }
        }
      } else if (invitation.status === "accepted" && !invitation.inviteeUserId) {
        console.warn(`Invitation ${invitation.id} is accepted but has no inviteeUserId`);
      }
      
      res.json({ message: "Permissão atualizada", role });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Dados inválidos", errors: error.errors });
      }
      console.error("Update invitation role error:", error);
      res.status(500).json({ message: "Erro ao atualizar permissão" });
    }
  });

  // ========== SHARED CONTENT ROUTES ==========

  // Get files shared with the current user
  app.get("/api/shared/files", requireAuth, async (req: Request, res: Response) => {
    try {
      const files = await storage.getSharedFilesForUser(req.user!.id);
      
      // Enrich with owner info
      const enrichedFiles = await Promise.all(
        files.map(async (file) => {
          const owner = await storage.getUser(file.userId);
          return {
            ...file,
            ownerName: owner?.nome || "Desconhecido",
            ownerEmail: owner?.email || "",
          };
        })
      );
      
      res.json(enrichedFiles);
    } catch (error) {
      console.error("Get shared files error:", error);
      res.status(500).json({ message: "Erro ao buscar ficheiros partilhados" });
    }
  });

  // Get folders shared with the current user
  app.get("/api/shared/folders", requireAuth, async (req: Request, res: Response) => {
    try {
      const foldersData = await storage.getSharedFoldersForUser(req.user!.id);
      
      // Enrich with owner info and permission details
      const enrichedFolders = await Promise.all(
        foldersData.map(async (folder) => {
          const owner = await storage.getUser(folder.userId);
          const permission = await storage.getFolderPermission(folder.id, req.user!.id);
          return {
            ...folder,
            ownerName: owner?.nome || "Desconhecido",
            ownerEmail: owner?.email || "",
            role: permission?.role || "viewer",
          };
        })
      );
      
      res.json(enrichedFolders);
    } catch (error) {
      console.error("Get shared folders error:", error);
      res.status(500).json({ message: "Erro ao buscar pastas partilhadas" });
    }
  });

  // Get content of a shared folder
  app.get("/api/shared/folders/:id/content", requireAuth, async (req: Request, res: Response) => {
    try {
      const folderId = req.params.id;
      const userId = req.user!.id;
      
      // Check if user has access to this folder
      const hasAccess = await storage.hasFolderAccess(folderId, userId);
      console.log(`Checking folder access: folderId=${folderId}, userId=${userId}, hasAccess=${hasAccess}`);
      
      if (!hasAccess) {
        // Log more details for debugging
        const folder = await storage.getFolder(folderId);
        const permission = await storage.getFolderPermission(folderId, userId);
        console.log(`Access denied details: folder exists=${!!folder}, folder owner=${folder?.userId}, permission exists=${!!permission}`);
        return res.status(403).json({ message: "Acesso negado" });
      }
      
      const [filesData, foldersData] = await Promise.all([
        storage.getFilesInSharedFolder(folderId, userId),
        storage.getFoldersInSharedFolder(folderId, userId),
      ]);
      
      console.log(`Shared folder content: folderId=${folderId}, files=${filesData.length}, subfolders=${foldersData.length}`);
      res.json({ files: filesData, folders: foldersData });
    } catch (error) {
      console.error("Get shared folder content error:", error);
      res.status(500).json({ message: "Erro ao buscar conteúdo da pasta" });
    }
  });

  // Clone file from shared (invitee clones the file to their own files)
  app.post("/api/shared/files/:fileId/clone", requireAuth, async (req: Request, res: Response) => {
    try {
      const fileId = req.params.fileId;
      const userId = req.user!.id;
      
      // Get the file to check access
      const file = await storage.getFile(fileId);
      if (!file) {
        return res.status(404).json({ message: "Ficheiro não encontrado" });
      }
      
      // User must have permission to this file
      const permission = await storage.getFilePermission(fileId, userId);
      if (!permission && file.userId !== userId) {
        return res.status(403).json({ message: "Você não tem acesso a este ficheiro" });
      }
      
      // Get the user to check storage quota
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "Utilizador não encontrado" });
      }
      
      // Check if user has enough storage
      if (user.storageUsed + file.tamanho > user.storageLimit) {
        return res.status(400).json({ message: "Sem espaço suficiente para clonar este ficheiro" });
      }
      
      // Create a clone of the file with a new name
      const clonedFile = await storage.createFile({
        userId,
        nome: file.nome.includes("(Cópia)") ? file.nome : `${file.nome.substring(0, file.nome.lastIndexOf("."))} (Cópia)${file.nome.substring(file.nome.lastIndexOf("."))}`,
        tamanho: file.tamanho,
        tipoMime: file.tipoMime,
        telegramFileId: file.telegramFileId,
        telegramBotId: file.telegramBotId || undefined,
        uploadedByUserId: undefined,
        folderId: undefined,
        isEncrypted: file.isEncrypted,
        originalMimeType: file.originalMimeType || undefined,
        originalSize: file.originalSize || undefined,
      });
      
      // Update user storage
      await storage.updateUserStorage(userId, user.storageUsed + file.tamanho);
      
      res.json({ success: true, message: "Ficheiro clonado com sucesso", file: clonedFile });
    } catch (error) {
      console.error("Clone shared file error:", error);
      res.status(500).json({ message: "Erro ao clonar ficheiro" });
    }
  });

  // Remove file from shared list (invitee removes themselves from the share)
  app.delete("/api/shared/files/:fileId", requireAuth, async (req: Request, res: Response) => {
    try {
      const fileId = req.params.fileId;
      const userId = req.user!.id;
      
      // Get the file to check ownership
      const file = await storage.getFile(fileId);
      if (!file) {
        return res.status(404).json({ message: "Ficheiro não encontrado" });
      }
      
      // Don't allow owner to remove from shared list (they should use delete share instead)
      if (file.userId === userId) {
        return res.status(400).json({ message: "Não pode remover os seus próprios ficheiros da lista de partilhados" });
      }
      
      // Get the file permission specifically for THIS user only
      const permission = await storage.getFilePermission(fileId, userId);
      if (!permission) {
        return res.status(404).json({ message: "Não tem permissão direta para este ficheiro" });
      }
      
      // Extra validation: ensure the permission belongs to the current user
      if (permission.userId !== userId) {
        return res.status(403).json({ message: "Não autorizado" });
      }
      
      // Delete only this user's permission
      await storage.deleteFilePermission(permission.id);
      
      res.json({ success: true, message: "Ficheiro removido da lista de partilhados" });
    } catch (error) {
      console.error("Remove shared file error:", error);
      res.status(500).json({ message: "Erro ao remover ficheiro partilhado" });
    }
  });

  // Remove folder from shared list (invitee removes themselves from the share)
  app.delete("/api/shared/folders/:folderId", requireAuth, async (req: Request, res: Response) => {
    try {
      const folderId = req.params.folderId;
      const userId = req.user!.id;
      
      // Get the folder to check ownership
      const folder = await storage.getFolder(folderId);
      if (!folder) {
        return res.status(404).json({ message: "Pasta não encontrada" });
      }
      
      // Don't allow owner to remove from shared list
      if (folder.userId === userId) {
        return res.status(400).json({ message: "Não pode remover as suas próprias pastas da lista de partilhados" });
      }
      
      // Get the folder permission specifically for THIS user only
      const permission = await storage.getFolderPermission(folderId, userId);
      if (!permission) {
        return res.status(404).json({ message: "Não tem permissão direta para esta pasta" });
      }
      
      // Extra validation: ensure the permission belongs to the current user
      if (permission.userId !== userId) {
        return res.status(403).json({ message: "Não autorizado" });
      }
      
      // Delete only this user's permission
      await storage.deleteFolderPermission(permission.id);
      
      res.json({ success: true, message: "Pasta removida da lista de partilhados" });
    } catch (error) {
      console.error("Remove shared folder error:", error);
      res.status(500).json({ message: "Erro ao remover pasta partilhada" });
    }
  });

  // ========== SHARES ROUTES ==========

  // Create share link
  app.post("/api/shares", requireAuth, async (req: Request, res: Response) => {
    try {
      const { fileId } = z.object({ fileId: z.string() }).parse(req.body);

      const file = await storage.getFile(fileId);
      if (!file || file.userId !== req.user!.id) {
        return res.status(404).json({ message: "Arquivo não encontrado" });
      }

      // Generate unique link code
      const linkCode = crypto.randomBytes(16).toString("hex");

      const share = await storage.createShare({
        fileId,
        linkCode,
        passwordHash: null,
        expiresAt: null,
      });

      res.json(share);
    } catch (error) {
      res.status(500).json({ message: "Erro ao criar link de compartilhamento" });
    }
  });

  // Get file shares/permissions
  app.get("/api/files/:id/shares", requireAuth, async (req: Request, res: Response) => {
    try {
      const file = await storage.getFile(req.params.id);
      if (!file || file.userId !== req.user!.id) {
        return res.status(404).json({ message: "Ficheiro não encontrado" });
      }

      const permissions = await storage.getFilePermissionsByFile(file.id);
      
      // Enrich with user details
      const sharesWithUsers = await Promise.all(
        permissions.map(async (perm) => {
          const user = await storage.getUser(perm.userId);
          return {
            id: perm.id,
            email: user?.email || "",
            nome: user?.nome || "Desconhecido",
            role: perm.role,
            createdAt: perm.createdAt
          };
        })
      );

      res.json(sharesWithUsers);
    } catch (error) {
      console.error("Get file shares error:", error);
      res.status(500).json({ message: "Erro ao buscar partilhas" });
    }
  });

  // Remove file share
  app.delete("/api/files/:id/shares/:shareId", requireAuth, async (req: Request, res: Response) => {
    try {
      const file = await storage.getFile(req.params.id);
      if (!file || file.userId !== req.user!.id) {
        return res.status(404).json({ message: "Ficheiro não encontrado" });
      }

      await storage.deleteFilePermission(req.params.shareId);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete file share error:", error);
      res.status(500).json({ message: "Erro ao remover partilha" });
    }
  });

  // Remove folder share/permission (remove all folder permissions)
  app.delete("/api/folders/:id/shares", requireAuth, async (req: Request, res: Response) => {
    try {
      const folder = await storage.getFolder(req.params.id);
      if (!folder || folder.userId !== req.user!.id) {
        return res.status(404).json({ message: "Pasta não encontrada" });
      }

      // Get all folder permissions and delete them
      const permissions = await storage.getFolderPermissionsByFolder(req.params.id);
      for (const perm of permissions) {
        await storage.deleteFolderPermission(perm.id);
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Delete folder share error:", error);
      res.status(500).json({ message: "Erro ao remover permissão" });
    }
  });

  // Send share link via email (and create file permission)
  app.post("/api/shares/send-email", requireAuth, async (req: Request, res: Response) => {
    try {
      const { email, shareLink, fileName, fileId, sharedEncryptionKey } = z.object({ 
        email: z.string().email(),
        shareLink: z.string(),
        fileName: z.string(),
        fileId: z.string(),
        sharedEncryptionKey: z.string().optional()
      }).parse(req.body);

      // Check if email is registered in the system
      const targetUser = await storage.getUserByEmail(email);
      if (!targetUser) {
        return res.status(404).json({ message: "Email inválido" });
      }

      // Don't allow sharing with yourself
      if (targetUser.id === req.user!.id) {
        return res.status(400).json({ message: "Não pode partilhar ficheiros consigo mesmo" });
      }

      // Check if already shared with this user
      const existingPermission = await storage.getFilePermission(fileId, targetUser.id);
      if (existingPermission) {
        return res.status(400).json({ message: "Ficheiro já partilhado com este utilizador" });
      }

      // Create file permission for the target user with shared encryption key
      await storage.createFilePermission({
        fileId,
        userId: targetUser.id,
        role: "viewer",
        grantedBy: req.user!.id,
        sharedEncryptionKey: sharedEncryptionKey
      });

      console.log(`[Share] File ${fileName} shared with ${email} by ${req.user!.email}${sharedEncryptionKey ? ' (with encryption key)' : ''}`);

      res.json({ 
        success: true, 
        message: `Ficheiro partilhado com ${targetUser.nome}` 
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Email inválido" });
      }
      res.status(500).json({ message: "Erro ao enviar email" });
    }
  });

  // Get share by link code
  app.get("/api/shares/:linkCode", async (req: Request, res: Response) => {
    try {
      const share = await storage.getShareByLinkCode(req.params.linkCode);
      if (!share) {
        return res.status(404).json({ message: "Link não encontrado" });
      }

      if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
        return res.status(410).json({ message: "Link expirado" });
      }

      const file = await storage.getFile(share.fileId);
      if (!file) {
        return res.status(404).json({ message: "Arquivo não encontrado" });
      }

      res.json({ 
        share, 
        file: {
          ...file,
          tipoMime: file.originalMimeType || file.tipoMime,
          tamanho: file.originalSize || file.tamanho,
        }
      });
    } catch (error) {
      res.status(500).json({ message: "Erro ao buscar compartilhamento" });
    }
  });

  // ========== DOWNLOAD ROUTES ==========

  // Get file preview URL (for thumbnails)
  app.get("/api/files/:id/preview", requireAuth, async (req: Request, res: Response) => {
    try {
      const file = await storage.getFile(req.params.id);
      if (!file) {
        return res.status(404).json({ message: "Arquivo não encontrado" });
      }
      
      // Check if user has access (owner or has permission)
      const hasAccess = await storage.hasFileAccess(req.params.id, req.user!.id);
      if (!hasAccess) {
        return res.status(403).json({ message: "Acesso negado" });
      }

      if (!file.telegramFileId || !file.telegramBotId) {
        return res.status(404).json({ message: "Arquivo não disponível" });
      }

      const previewUrl = await telegramService.getDownloadUrl(
        file.telegramFileId,
        file.telegramBotId
      );

      res.json({ url: previewUrl });
    } catch (error) {
      console.error("Preview error:", error);
      res.status(500).json({ message: "Erro ao obter preview" });
    }
  });

  // Proxy media stream for CORS-safe thumbnail generation and preview
  // Supports Range requests for mobile video playback (iOS/Safari)
  app.get("/api/files/:id/stream", requireAuth, async (req: Request, res: Response) => {
    try {
      const file = await storage.getFile(req.params.id);
      if (!file) {
        return res.status(404).json({ message: "Arquivo não encontrado" });
      }
      
      // Check if user has access (owner or has permission)
      const hasAccess = await storage.hasFileAccess(req.params.id, req.user!.id);
      if (!hasAccess) {
        return res.status(403).json({ message: "Acesso negado" });
      }

      if (!file.telegramFileId || !file.telegramBotId) {
        return res.status(404).json({ message: "Arquivo não disponível" });
      }

      const mimeType = file.originalMimeType || file.tipoMime;
      
      // Accept both video and image files for streaming
      if (!mimeType.startsWith("video/") && !mimeType.startsWith("image/") && !mimeType.startsWith("audio/")) {
        return res.status(400).json({ message: "Este endpoint é apenas para mídia" });
      }

      // Download the file content
      const fileBuffer = await telegramService.downloadFile(file.telegramFileId, file.telegramBotId);
      const fileSize = fileBuffer.length;
      
      // Handle Range requests for video seeking (critical for mobile)
      const range = req.headers.range;
      
      // Set common headers
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Range");
      res.setHeader("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Type", mimeType);
      
      if (range) {
        // Parse Range header
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        
        // Validate range
        if (start >= fileSize || end >= fileSize || start > end) {
          res.status(416).setHeader("Content-Range", `bytes */${fileSize}`);
          return res.end();
        }
        
        const chunkSize = end - start + 1;
        const chunk = fileBuffer.slice(start, end + 1);
        
        res.status(206);
        res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
        res.setHeader("Content-Length", chunkSize.toString());
        res.send(chunk);
      } else {
        // Full file response
        res.setHeader("Content-Length", fileSize.toString());
        res.send(fileBuffer);
      }
    } catch (error) {
      console.error("Stream error:", error);
      res.status(500).json({ message: "Erro ao fazer stream" });
    }
  });

  // Proxy file content for CORS-safe client-side decryption
  app.get("/api/files/:id/content", requireAuth, async (req: Request, res: Response) => {
    try {
      const file = await storage.getFile(req.params.id);
      if (!file) {
        return res.status(404).json({ message: "Arquivo não encontrado" });
      }
      
      // Check if user has access (owner or has permission)
      const hasAccess = await storage.hasFileAccess(req.params.id, req.user!.id);
      if (!hasAccess) {
        return res.status(403).json({ message: "Acesso negado" });
      }

      if (!file.telegramFileId) {
        return res.status(404).json({ message: "Arquivo não disponível" });
      }

      // Handle chunked files - validate before setting headers
      if (file.isChunked && file.totalChunks > 1) {
        const chunks = await storage.getFileChunks(file.id);
        
        if (chunks.length === 0) {
          return res.status(500).json({ message: "Erro: nenhum chunk encontrado" });
        }
        if (chunks.length !== file.totalChunks) {
          return res.status(500).json({ 
            message: `Erro: dados do ficheiro incompletos (${chunks.length}/${file.totalChunks})` 
          });
        }

        try {
          res.setHeader("Content-Type", file.isEncrypted ? "application/octet-stream" : (file.originalMimeType || file.tipoMime));
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Cache-Control", "public, max-age=3600");

          const chunkData = chunks.map(c => ({ 
            fileId: c.telegramFileId, 
            botId: c.telegramBotId, 
            chunkIndex: c.chunkIndex,
            chunkSize: c.chunkSize
          }));
          
          for await (const buffer of telegramService.streamLargeFile(chunkData)) {
            res.write(buffer);
          }
          
          return res.end();
        } catch (streamError) {
          console.error("Stream error:", streamError);
          if (!res.headersSent) {
            return res.status(500).json({ message: "Erro ao fazer streaming" });
          }
          return res.end();
        }
      }

      // Single file - fetch and return
      const botId = file.telegramBotId || telegramService.getBotStatus()[0]?.id || "bot_1";

      const downloadUrl = await telegramService.getDownloadUrl(
        file.telegramFileId,
        botId
      );

      const response = await fetch(downloadUrl);
      if (!response.ok) {
        return res.status(500).json({ message: "Erro ao buscar arquivo" });
      }
      
      res.setHeader("Content-Type", file.isEncrypted ? "application/octet-stream" : (file.originalMimeType || file.tipoMime));
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "public, max-age=3600");
      
      const arrayBuffer = await response.arrayBuffer();
      res.send(Buffer.from(arrayBuffer));
    } catch (error) {
      console.error("Content proxy error:", error);
      res.status(500).json({ message: "Erro ao buscar conteúdo" });
    }
  });

  // Download file (streams full file including chunked files)
  app.get("/api/files/:id/download", requireAuth, async (req: Request, res: Response) => {
    try {
      const file = await storage.getFile(req.params.id);
      if (!file) {
        return res.status(404).json({ message: "Arquivo não encontrado" });
      }
      
      // Check if user has access (owner or has permission)
      const hasAccess = await storage.hasFileAccess(req.params.id, req.user!.id);
      if (!hasAccess) {
        return res.status(403).json({ message: "Acesso negado" });
      }

      if (!file.telegramFileId) {
        return res.status(404).json({ message: "Arquivo não disponível para download" });
      }

      // Handle chunked files - validate and stream all chunks
      if (file.isChunked && file.totalChunks > 1) {
        const chunks = await storage.getFileChunks(file.id);
        
        // Validate chunk count before setting headers
        if (chunks.length === 0) {
          return res.status(500).json({ message: "Erro: nenhum chunk encontrado para o ficheiro" });
        }
        if (chunks.length !== file.totalChunks) {
          return res.status(500).json({ 
            message: `Erro: dados do ficheiro fragmentado incompletos (${chunks.length}/${file.totalChunks} chunks)` 
          });
        }

        try {
          // Stream chunks using generator for memory efficiency
          res.setHeader("Content-Type", file.originalMimeType || file.tipoMime);
          res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(file.nome)}"`);
          res.setHeader("Content-Length", file.originalSize || file.tamanho);

          const chunkData = chunks.map(c => ({ 
            fileId: c.telegramFileId, 
            botId: c.telegramBotId, 
            chunkIndex: c.chunkIndex,
            chunkSize: c.chunkSize
          }));
          
          for await (const buffer of telegramService.streamLargeFile(chunkData)) {
            res.write(buffer);
          }
          
          return res.end();
        } catch (streamError) {
          console.error("Stream error:", streamError);
          if (!res.headersSent) {
            return res.status(500).json({ message: "Erro ao fazer streaming do ficheiro" });
          }
          return res.end();
        }
      }

      // Single file - use simple redirect
      const botId = file.telegramBotId || telegramService.getBotStatus()[0]?.id || "bot_1";
      const downloadUrl = await telegramService.getDownloadUrl(
        file.telegramFileId,
        botId
      );

      res.redirect(downloadUrl);
    } catch (error) {
      console.error("Download error:", error);
      res.status(500).json({ message: "Erro ao fazer download" });
    }
  });

  // Get download data for client-side decryption
  app.get("/api/files/:id/download-data", requireAuth, async (req: Request, res: Response) => {
    try {
      const file = await storage.getFile(req.params.id);
      if (!file) {
        return res.status(404).json({ message: "Arquivo não encontrado" });
      }
      
      // Check if user has access (owner or has permission)
      const hasAccess = await storage.hasFileAccess(req.params.id, req.user!.id);
      if (!hasAccess) {
        return res.status(403).json({ message: "Acesso negado" });
      }

      if (!file.telegramFileId) {
        return res.status(404).json({ message: "Arquivo não disponível para download" });
      }

      // Use provided botId or get first available bot
      const botId = file.telegramBotId || telegramService.getBotStatus()[0]?.id || "bot_1";

      // Check if current user is the file owner
      const isOwner = file.userId === req.user!.id;
      
      // Get shared encryption key if user is not owner but has file/folder permission
      let sharedEncryptionKey: string | null = null;
      if (!isOwner && file.isEncrypted) {
        // First check direct file permission
        const filePermission = await storage.getFilePermission(req.params.id, req.user!.id);
        if (filePermission?.sharedEncryptionKey) {
          sharedEncryptionKey = filePermission.sharedEncryptionKey;
        } else if (file.folderId) {
          // Check folder permission if file is in a folder
          const folderPermission = await storage.getFolderPermission(file.folderId, req.user!.id);
          if (folderPermission?.sharedEncryptionKey) {
            sharedEncryptionKey = folderPermission.sharedEncryptionKey;
          }
        }
      }

      // Handle chunked files
      if (file.isChunked && file.totalChunks > 1) {
        const chunks = await storage.getFileChunks(file.id);
        const chunkUrls = await Promise.all(
          chunks.map(async (chunk) => ({
            chunkIndex: chunk.chunkIndex,
            downloadUrl: await telegramService.getDownloadUrl(chunk.telegramFileId, chunk.telegramBotId),
            chunkSize: chunk.chunkSize,
          }))
        );
        
        res.json({
          id: file.id,
          nome: file.nome,
          tamanho: file.tamanho,
          tipoMime: file.tipoMime,
          createdAt: file.createdAt,
          isChunked: true,
          totalChunks: file.totalChunks,
          chunks: chunkUrls,
          isEncrypted: file.isEncrypted || false,
          isOwner,
          sharedEncryptionKey,
          originalMimeType: file.originalMimeType || file.tipoMime,
          originalSize: file.originalSize || file.tamanho,
          downloadUrl: `/api/files/${req.params.id}/download`,
          previewUrl: `/api/files/${req.params.id}/preview`,
          contentUrl: `/api/files/${req.params.id}/content`,
        });
      } else {
        const downloadUrl = await telegramService.getDownloadUrl(
          file.telegramFileId,
          botId
        );

        res.json({
          id: file.id,
          nome: file.nome,
          tamanho: file.tamanho,
          tipoMime: file.tipoMime,
          createdAt: file.createdAt,
          isChunked: false,
          downloadUrl,
          isEncrypted: file.isEncrypted || false,
          isOwner,
          sharedEncryptionKey,
          originalMimeType: file.originalMimeType || file.tipoMime,
          originalSize: file.originalSize || file.tamanho,
          previewUrl: `/api/files/${req.params.id}/preview`,
          contentUrl: `/api/files/${req.params.id}/content`,
        });
      }
    } catch (error) {
      console.error("Download data error:", error);
      res.status(500).json({ message: "Erro ao obter dados de download" });
    }
  });

  // Download shared file (public)
  app.get("/api/shares/:linkCode/download", async (req: Request, res: Response) => {
    try {
      const share = await storage.getShareByLinkCode(req.params.linkCode);
      if (!share) {
        return res.status(404).json({ message: "Link não encontrado" });
      }

      // Check expiration
      if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
        return res.status(410).json({ message: "Link expirado" });
      }

      const file = await storage.getFile(share.fileId);
      if (!file) {
        return res.status(404).json({ message: "Arquivo não encontrado" });
      }

      if (!file.telegramFileId || !file.telegramBotId) {
        return res.status(404).json({ message: "Arquivo não disponível para download" });
      }

      // Handle chunked files - validate and stream all chunks
      if (file.isChunked && file.totalChunks > 1) {
        const chunks = await storage.getFileChunks(file.id);
        
        if (chunks.length === 0) {
          return res.status(500).json({ message: "Erro: nenhum chunk encontrado" });
        }
        if (chunks.length !== file.totalChunks) {
          return res.status(500).json({ 
            message: `Erro: dados do ficheiro incompletos (${chunks.length}/${file.totalChunks})` 
          });
        }

        try {
          // Increment download count after validation
          await storage.incrementShareDownload(share.id);
          
          res.setHeader("Content-Type", file.originalMimeType || file.tipoMime);
          res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(file.nome)}"`);
          res.setHeader("Content-Length", file.originalSize || file.tamanho);

          const chunkData = chunks.map(c => ({ 
            fileId: c.telegramFileId, 
            botId: c.telegramBotId, 
            chunkIndex: c.chunkIndex,
            chunkSize: c.chunkSize
          }));
          
          for await (const buffer of telegramService.streamLargeFile(chunkData)) {
            res.write(buffer);
          }
          
          return res.end();
        } catch (streamError) {
          console.error("Stream error:", streamError);
          if (!res.headersSent) {
            return res.status(500).json({ message: "Erro ao fazer streaming do ficheiro" });
          }
          return res.end();
        }
      }

      // Increment download count for single file
      await storage.incrementShareDownload(share.id);

      // Get download URL from Telegram for single file
      const downloadUrl = await telegramService.getDownloadUrl(
        file.telegramFileId,
        file.telegramBotId
      );

      // Redirect to Telegram download URL
      res.redirect(downloadUrl);
    } catch (error) {
      console.error("Download error:", error);
      res.status(500).json({ message: "Erro ao fazer download" });
    }
  });

  // Stream shared file for preview (public, CORS enabled)
  app.get("/api/shares/:linkCode/stream", async (req: Request, res: Response) => {
    try {
      const share = await storage.getShareByLinkCode(req.params.linkCode);
      if (!share) {
        return res.status(404).json({ message: "Link não encontrado" });
      }

      if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
        return res.status(410).json({ message: "Link expirado" });
      }

      const file = await storage.getFile(share.fileId);
      if (!file) {
        return res.status(404).json({ message: "Arquivo não encontrado" });
      }

      if (!file.telegramFileId || !file.telegramBotId) {
        return res.status(404).json({ message: "Arquivo não disponível" });
      }

      // Handle chunked files - validate before setting headers
      if (file.isChunked && file.totalChunks > 1) {
        const chunks = await storage.getFileChunks(file.id);
        
        if (chunks.length === 0) {
          return res.status(500).json({ message: "Erro: nenhum chunk encontrado" });
        }
        if (chunks.length !== file.totalChunks) {
          return res.status(500).json({ 
            message: `Erro: dados do ficheiro incompletos (${chunks.length}/${file.totalChunks})` 
          });
        }

        try {
          res.setHeader("Content-Type", file.originalMimeType || file.tipoMime);
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Cache-Control", "public, max-age=3600");

          const chunkData = chunks.map(c => ({ 
            fileId: c.telegramFileId, 
            botId: c.telegramBotId, 
            chunkIndex: c.chunkIndex,
            chunkSize: c.chunkSize
          }));
          
          for await (const buffer of telegramService.streamLargeFile(chunkData)) {
            res.write(buffer);
          }
          
          return res.end();
        } catch (streamError) {
          console.error("Stream error:", streamError);
          if (!res.headersSent) {
            return res.status(500).json({ message: "Erro ao fazer streaming" });
          }
          return res.end();
        }
      }

      const downloadUrl = await telegramService.getDownloadUrl(
        file.telegramFileId,
        file.telegramBotId
      );

      const response = await fetch(downloadUrl);
      if (!response.ok) {
        return res.status(500).json({ message: "Erro ao buscar ficheiro" });
      }
      
      res.setHeader("Content-Type", file.originalMimeType || file.tipoMime);
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "public, max-age=3600");
      
      const arrayBuffer = await response.arrayBuffer();
      res.send(Buffer.from(arrayBuffer));
    } catch (error) {
      console.error("Stream error:", error);
      res.status(500).json({ message: "Erro ao fazer stream" });
    }
  });

  // Get preview URL for shared file (public)
  app.get("/api/shares/:linkCode/preview", async (req: Request, res: Response) => {
    try {
      const share = await storage.getShareByLinkCode(req.params.linkCode);
      if (!share) {
        return res.status(404).json({ message: "Link não encontrado" });
      }

      if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
        return res.status(410).json({ message: "Link expirado" });
      }

      const file = await storage.getFile(share.fileId);
      if (!file) {
        return res.status(404).json({ message: "Arquivo não encontrado" });
      }

      if (!file.telegramFileId || !file.telegramBotId) {
        return res.status(404).json({ message: "Arquivo não disponível" });
      }

      const previewUrl = await telegramService.getDownloadUrl(
        file.telegramFileId,
        file.telegramBotId
      );

      res.json({ url: previewUrl, mimeType: file.tipoMime });
    } catch (error) {
      console.error("Preview error:", error);
      res.status(500).json({ message: "Erro ao obter preview" });
    }
  });

  // ========== ADMIN ROUTES ==========

  // Get all users (admin only)
  app.get("/api/admin/users", requireAdmin, async (req: Request, res: Response) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users.map(u => ({
        id: u.id,
        email: u.email,
        nome: u.nome,
        plano: u.plano,
        storageLimit: u.storageLimit,
        storageUsed: u.storageUsed,
        uploadsCount: u.uploadsCount,
        uploadLimit: u.uploadLimit,
        isAdmin: u.isAdmin,
        createdAt: u.createdAt,
      })));
    } catch (error) {
      res.status(500).json({ message: "Erro ao buscar utilizadores" });
    }
  });

  // Update user plan (admin only)
  app.patch("/api/admin/users/:id/plan", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { plano } = z.object({ plano: z.string() }).parse(req.body);
      
      const planConfig = PLANS[plano as keyof typeof PLANS];
      if (!planConfig) {
        return res.status(400).json({ message: "Plano inválido" });
      }
      
      await storage.updateUserPlanFull(
        req.params.id,
        plano,
        planConfig.uploadLimit,
        planConfig.storageLimit
      );
      
      res.json({ message: "Plano atualizado com sucesso" });
    } catch (error) {
      res.status(500).json({ message: "Erro ao atualizar plano" });
    }
  });

  // Toggle admin status (admin only)
  app.patch("/api/admin/users/:id/admin", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { isAdmin } = z.object({ isAdmin: z.boolean() }).parse(req.body);
      
      // Prevent removing own admin status
      if (req.params.id === req.user!.id && !isAdmin) {
        return res.status(400).json({ message: "Não pode remover o seu próprio estatuto de admin" });
      }
      
      await storage.updateUserAdmin(req.params.id, isAdmin);
      res.json({ message: isAdmin ? "Admin adicionado" : "Admin removido" });
    } catch (error) {
      res.status(500).json({ message: "Erro ao atualizar admin" });
    }
  });

  // Get all upgrade requests (admin only)
  app.get("/api/admin/upgrade-requests", requireAdmin, async (req: Request, res: Response) => {
    try {
      const requests = await storage.getAllUpgradeRequests();
      
      // Get user details for each request
      const requestsWithUsers = await Promise.all(
        requests.map(async (req) => {
          const user = await storage.getUser(req.userId);
          return {
            ...req,
            userName: user?.nome || "Desconhecido",
            userEmail: user?.email || "Desconhecido",
          };
        })
      );
      
      res.json(requestsWithUsers);
    } catch (error) {
      res.status(500).json({ message: "Erro ao buscar solicitações" });
    }
  });

  // Process upgrade request (admin only)
  app.patch("/api/admin/upgrade-requests/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { status, adminNote } = z.object({
        status: z.enum(["approved", "rejected"]),
        adminNote: z.string().optional(),
      }).parse(req.body);
      
      const upgradeRequest = await storage.getUpgradeRequest(req.params.id);
      if (!upgradeRequest) {
        return res.status(404).json({ message: "Solicitação não encontrada" });
      }
      
      if (upgradeRequest.status !== "pending") {
        return res.status(400).json({ message: "Solicitação já foi processada" });
      }
      
      // If approved, update user's plan or storage limit
      if (status === "approved") {
        // Check if this is an extra storage request (explicit numeric check)
        const extraGB = upgradeRequest.requestedExtraGB;
        const isExtraStorageRequest = typeof extraGB === 'number' && Number.isFinite(extraGB) && extraGB > 0;
        
        if (isExtraStorageRequest) {
          // Increment storage limit by the requested extra GB
          const additionalBytes = extraGB * 1024 * 1024 * 1024;
          await storage.incrementUserStorageLimit(upgradeRequest.userId, additionalBytes);
        } else {
          // Regular plan upgrade
          const planConfig = PLANS[upgradeRequest.requestedPlan as keyof typeof PLANS];
          if (planConfig) {
            await storage.updateUserPlanFull(
              upgradeRequest.userId,
              upgradeRequest.requestedPlan,
              planConfig.uploadLimit,
              planConfig.storageLimit
            );
          }
        }
        
        // Cancel other pending requests from the same user
        await storage.cancelOtherUpgradeRequests(upgradeRequest.userId, req.params.id);
      }
      
      const processedRequest = await storage.processUpgradeRequest(req.params.id, status, adminNote);
      
      // Notify user and admins via WebSocket
      wsManager.notifyUpgradeRequestProcessed(upgradeRequest.userId, { ...upgradeRequest, status, adminNote });
      
      res.json({ message: status === "approved" ? "Solicitação aprovada" : "Solicitação rejeitada" });
    } catch (error) {
      res.status(500).json({ message: "Erro ao processar solicitação" });
    }
  });

  // ========== USER PLAN ROUTES ==========

  // Get available plans
  app.get("/api/plans", async (req: Request, res: Response) => {
    res.json(PLANS);
  });

  // Request extra storage with proof of payment (simplified: 20GB free + 500Kz per GB extra)
  app.post("/api/upgrade-requests", requireAuth, upload.single("proof"), async (req: Request, res: Response) => {
    try {
      // Parse and validate numeric fields - strictly validate integer strings
      let requestedExtraGB: number | null = null;
      let totalPrice: number | null = null;
      
      if (req.body.requestedExtraGB !== undefined && req.body.requestedExtraGB !== null && req.body.requestedExtraGB !== '') {
        const rawValue = String(req.body.requestedExtraGB).trim();
        // Only accept pure integer strings (no decimals, no scientific notation)
        if (!/^-?\d+$/.test(rawValue)) {
          return res.status(400).json({ message: "GB extras deve ser um número inteiro válido" });
        }
        const parsedGB = Number(rawValue);
        if (!Number.isFinite(parsedGB) || !Number.isInteger(parsedGB)) {
          return res.status(400).json({ message: "GB extras deve ser um número inteiro válido" });
        }
        requestedExtraGB = parsedGB;
      }
      
      if (req.body.totalPrice !== undefined && req.body.totalPrice !== null && req.body.totalPrice !== '') {
        const rawValue = String(req.body.totalPrice).trim();
        // Only accept pure integer strings (no decimals, no scientific notation)
        if (!/^-?\d+$/.test(rawValue)) {
          return res.status(400).json({ message: "Preço total deve ser um número inteiro válido" });
        }
        const parsedPrice = Number(rawValue);
        if (!Number.isFinite(parsedPrice) || !Number.isInteger(parsedPrice)) {
          return res.status(400).json({ message: "Preço total deve ser um número inteiro válido" });
        }
        totalPrice = parsedPrice;
      }
      
      const user = await storage.getUser(req.user!.id);
      if (!user) {
        return res.status(404).json({ message: "Utilizador não encontrado" });
      }
      
      // Validate extra GB request is required
      if (requestedExtraGB === null || requestedExtraGB <= 0) {
        return res.status(400).json({ message: "GB extras deve ser maior que 0" });
      }
      
      // Validate price (500 Kz per GB)
      const expectedPrice = requestedExtraGB * 500;
      if (totalPrice !== null && totalPrice !== expectedPrice) {
        return res.status(400).json({ message: "Preço incorreto para a quantidade de GB solicitada" });
      }
      
      // Check for existing pending request
      const existingRequests = await storage.getUpgradeRequestsByUser(user.id);
      const hasPending = existingRequests.some(r => r.status === "pending");
      if (hasPending) {
        return res.status(400).json({ message: "Já existe uma solicitação pendente" });
      }

      // Require proof file
      if (!req.file) {
        return res.status(400).json({ message: "Comprovativo de pagamento é obrigatório" });
      }

      // Validate file type (PDF or image)
      const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/jpg"];
      if (!allowedTypes.includes(req.file.mimetype)) {
        return res.status(400).json({ message: "Apenas ficheiros PDF ou imagens são aceites" });
      }

      // Upload proof to Telegram
      let proofTelegramFileId: string | null = null;
      let proofTelegramBotId: string | null = null;

      if (telegramService.isAvailable()) {
        try {
          const result = await telegramService.uploadFile(
            req.file.buffer,
            req.file.originalname
          );
          proofTelegramFileId = result.fileId;
          proofTelegramBotId = result.botId;
        } catch (uploadError) {
          console.error("Erro ao fazer upload do comprovativo:", uploadError);
          return res.status(500).json({ message: "Erro ao fazer upload do comprovativo" });
        }
      } else {
        return res.status(500).json({ message: "Sistema de armazenamento indisponível" });
      }
      
      const request = await storage.createUpgradeRequest({
        userId: user.id,
        currentPlan: user.plano,
        requestedPlan: "gratis",
        requestedExtraGB,
        totalPrice: totalPrice ?? requestedExtraGB * 500,
        proofFileName: req.file.originalname,
        proofFileSize: req.file.size,
        proofTelegramFileId,
        proofTelegramBotId,
      });
      
      // Notify user and admins via WebSocket
      wsManager.notifyUpgradeRequestCreated(user.id, request);
      
      res.json({ message: "Solicitação enviada com sucesso! Aguarde aprovação.", request });
    } catch (error) {
      console.error("Upgrade request error:", error);
      res.status(500).json({ message: "Erro ao solicitar upgrade" });
    }
  });

  // Download proof of payment (admin only)
  app.get("/api/admin/upgrade-requests/:id/proof", requireAdmin, async (req: Request, res: Response) => {
    try {
      const request = await storage.getUpgradeRequest(req.params.id);
      if (!request) {
        return res.status(404).json({ message: "Solicitação não encontrada" });
      }

      if (!request.proofTelegramFileId || !request.proofTelegramBotId) {
        return res.status(404).json({ message: "Comprovativo não disponível" });
      }

      const downloadUrl = await telegramService.getDownloadUrl(
        request.proofTelegramFileId,
        request.proofTelegramBotId
      );

      res.redirect(downloadUrl);
    } catch (error) {
      console.error("Proof download error:", error);
      res.status(500).json({ message: "Erro ao baixar comprovativo" });
    }
  });

  // Get my upgrade requests
  app.get("/api/my-upgrade-requests", requireAuth, async (req: Request, res: Response) => {
    try {
      const requests = await storage.getUpgradeRequestsByUser(req.user!.id);
      res.json(requests);
    } catch (error) {
      res.status(500).json({ message: "Erro ao buscar solicitações" });
    }
  });

  // ========== SYSTEM STATUS ROUTES ==========

  // Get Telegram bot status (for monitoring)
  app.get("/api/system/telegram-status", requireAuth, async (req: Request, res: Response) => {
    try {
      const botStatus = telegramService.getBotStatus();
      const cacheStats = telegramService.getCacheStats();
      
      res.json({
        available: telegramService.isAvailable(),
        bots: botStatus,
        cache: cacheStats,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(500).json({ message: "Erro ao obter status do sistema" });
    }
  });

  // Health check endpoint (public)
  app.get("/api/health", async (req: Request, res: Response) => {
    res.json({
      status: "ok",
      telegramAvailable: telegramService.isAvailable(),
      timestamp: new Date().toISOString(),
    });
  });

  // Stats endpoint (public) - for displaying real stats on about page
  app.get("/api/stats", async (req: Request, res: Response) => {
    try {
      const usersCount = await storage.countUsers();
      const filesCount = await storage.countFiles();
      
      res.json({
        utilizadores: usersCount,
        ficheiros: filesCount,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(500).json({ message: "Erro ao obter estatísticas" });
    }
  });

  // ========== MONITORING ROUTES (Admin) ==========
  
  // System status overview (admin)
  app.get("/api/admin/monitoring/status", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { monitoringService } = await import("./monitoring");
      res.json(monitoringService.getSystemStatus());
    } catch (error) {
      res.status(500).json({ message: "Erro ao obter status de monitorização" });
    }
  });
  
  // Detailed metrics (admin)
  app.get("/api/admin/monitoring/metrics", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { monitoringService } = await import("./monitoring");
      const metrics = monitoringService.getDetailedMetrics();
      res.json({
        ...metrics,
        system: {
          ...metrics.system,
          activeUsers24h: metrics.system.activeUsers24h.size,
        },
      });
    } catch (error) {
      res.status(500).json({ message: "Erro ao obter métricas detalhadas" });
    }
  });
  
  // Alerts list (admin)
  app.get("/api/admin/monitoring/alerts", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { monitoringService } = await import("./monitoring");
      const unresolvedOnly = req.query.unresolved === 'true';
      const category = req.query.category as string | undefined;
      const limit = parseInt(req.query.limit as string) || 100;
      
      res.json(monitoringService.getAlerts({ 
        unresolved: unresolvedOnly, 
        category, 
        limit 
      }));
    } catch (error) {
      res.status(500).json({ message: "Erro ao obter alertas" });
    }
  });
  
  // Resolve alert (admin)
  app.post("/api/admin/monitoring/alerts/:id/resolve", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { monitoringService } = await import("./monitoring");
      monitoringService.resolveAlert(req.params.id);
      res.json({ message: "Alerta resolvido" });
    } catch (error) {
      res.status(500).json({ message: "Erro ao resolver alerta" });
    }
  });
  
  // System limits info (public - for frontend)
  app.get("/api/system/limits", async (req: Request, res: Response) => {
    try {
      const { monitoringService } = await import("./monitoring");
      res.json({
        limits: monitoringService.LIMITS,
        isBeta: false,
      });
    } catch (error) {
      res.status(500).json({ message: "Erro ao obter limites" });
    }
  });
  
  // User quota info (authenticated)
  app.get("/api/user/quota", requireAuth, async (req: Request, res: Response) => {
    try {
      const { monitoringService } = await import("./monitoring");
      const user = await storage.getUser(req.user!.id);
      
      if (!user) {
        return res.status(404).json({ message: "Utilizador não encontrado" });
      }
      
      const dailyQuota = monitoringService.getUserDailyQuota(req.user!.id);
      const limits = monitoringService.LIMITS;
      
      res.json({
        storage: {
          used: user.storageUsed,
          limit: user.storageLimit,
          percentage: Math.round((user.storageUsed / user.storageLimit) * 100),
        },
        daily: {
          uploads: dailyQuota.uploadsCount,
          maxUploads: -1,
          bytesUploaded: dailyQuota.uploadBytes,
          maxBytes: -1,
        },
        limits: {
          maxFileSize: limits.MAX_FILE_SIZE_BYTES,
          maxFileSizeMB: limits.MAX_FILE_SIZE_MB,
        },
        plan: user.plano,
      });
    } catch (error) {
      res.status(500).json({ message: "Erro ao obter quota" });
    }
  });

  return httpServer;
}
