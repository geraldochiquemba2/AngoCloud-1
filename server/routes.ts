import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import session from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { z } from "zod";
import { insertUserSchema, insertFileSchema, insertFolderSchema, insertShareSchema } from "@shared/schema";
import crypto from "crypto";
import multer, { type Multer } from "multer";
import { telegramService } from "./telegram";
import bcrypt from "bcrypt";

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 * 1024 } // 2GB limit
});

// Bcrypt config
const SALT_ROUNDS = 12;

// Hash password with bcrypt
async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

// Verify password with bcrypt
async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
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

// Get storage limits by plan
function getStorageLimitByPlan(plano: string): number {
  const limits: Record<string, number> = {
    gratis: 15 * 1024 * 1024 * 1024, // 15GB
    plus: 100 * 1024 * 1024 * 1024, // 100GB
    pro: 500 * 1024 * 1024 * 1024, // 500GB
    empresas: Number.MAX_SAFE_INTEGER, // Unlimited
  };
  return limits[plano] || limits.gratis;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Configure session
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "angocloud-secret-key-change-in-production",
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      },
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  // ========== AUTH ROUTES ==========

  // Register
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        email: z.string().email(),
        password: z.string().min(6),
        nome: z.string().min(2),
      });

      const { email, password, nome } = schema.parse(req.body);

      // Check if user exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "Email já está em uso" });
      }

      // Create user with bcrypt hashed password
      const hashedPassword = await hashPassword(password);
      const user = await storage.createUser({
        email,
        passwordHash: hashedPassword,
        nome,
        plano: "gratis",
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
  app.post("/api/auth/login", (req: Request, res: Response, next) => {
    passport.authenticate("local", (err: any, user: Express.User | false, info: any) => {
      if (err) {
        return res.status(500).json({ message: "Erro ao fazer login" });
      }
      if (!user) {
        return res.status(401).json({ message: info?.message || "Credenciais inválidas" });
      }
      req.login(user, (err) => {
        if (err) {
          return res.status(500).json({ message: "Erro ao fazer login" });
        }
        res.json(user);
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

  // Get current user
  app.get("/api/auth/me", requireAuth, (req: Request, res: Response) => {
    res.json(req.user);
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
    try {
      if (!req.file) {
        return res.status(400).json({ message: "Nenhum arquivo enviado" });
      }

      const user = req.user!;
      const fileSize = req.file.size;

      // Check storage quota
      if (user.storageUsed + fileSize > user.storageLimit) {
        return res.status(400).json({ 
          message: "Quota de armazenamento excedida",
          storageUsed: user.storageUsed,
          storageLimit: user.storageLimit,
        });
      }

      // Check if Telegram service is available
      if (!telegramService.isAvailable()) {
        return res.status(503).json({ 
          message: "Serviço de armazenamento temporariamente indisponível. Configure os tokens dos bots Telegram."
        });
      }

      // Upload to Telegram
      const uploadResult = await telegramService.uploadFile(
        req.file.buffer,
        req.file.originalname
      );

      const folderId = req.body.folderId || null;

      const file = await storage.createFile({
        userId: user.id,
        folderId,
        nome: req.file.originalname,
        tamanho: fileSize,
        tipoMime: req.file.mimetype,
        telegramFileId: uploadResult.fileId,
        telegramBotId: uploadResult.botId,
      });

      // Update user storage
      await storage.updateUserStorage(user.id, fileSize);

      res.json(file);
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ message: "Erro ao fazer upload" });
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

  // Get share by link code
  app.get("/api/shares/:linkCode", async (req: Request, res: Response) => {
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

      res.json({ share, file });
    } catch (error) {
      res.status(500).json({ message: "Erro ao buscar compartilhamento" });
    }
  });

  // ========== DOWNLOAD ROUTES ==========

  // Get file preview URL (for thumbnails)
  app.get("/api/files/:id/preview", requireAuth, async (req: Request, res: Response) => {
    try {
      const file = await storage.getFile(req.params.id);
      if (!file || file.userId !== req.user!.id) {
        return res.status(404).json({ message: "Arquivo não encontrado" });
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

  // Proxy video stream for CORS-safe thumbnail generation
  app.get("/api/files/:id/stream", requireAuth, async (req: Request, res: Response) => {
    try {
      const file = await storage.getFile(req.params.id);
      if (!file || file.userId !== req.user!.id) {
        return res.status(404).json({ message: "Arquivo não encontrado" });
      }

      if (!file.telegramFileId || !file.telegramBotId) {
        return res.status(404).json({ message: "Arquivo não disponível" });
      }

      if (!file.tipoMime.startsWith("video/")) {
        return res.status(400).json({ message: "Este endpoint é apenas para vídeos" });
      }

      const downloadUrl = await telegramService.getDownloadUrl(
        file.telegramFileId,
        file.telegramBotId
      );

      const response = await fetch(downloadUrl);
      if (!response.ok) {
        return res.status(500).json({ message: "Erro ao buscar vídeo" });
      }

      res.setHeader("Content-Type", file.tipoMime);
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "public, max-age=3600");
      
      const arrayBuffer = await response.arrayBuffer();
      res.send(Buffer.from(arrayBuffer));
    } catch (error) {
      console.error("Stream error:", error);
      res.status(500).json({ message: "Erro ao fazer stream" });
    }
  });

  // Download file
  app.get("/api/files/:id/download", requireAuth, async (req: Request, res: Response) => {
    try {
      const file = await storage.getFile(req.params.id);
      if (!file || file.userId !== req.user!.id) {
        return res.status(404).json({ message: "Arquivo não encontrado" });
      }

      if (!file.telegramFileId || !file.telegramBotId) {
        return res.status(404).json({ message: "Arquivo não disponível para download" });
      }

      // Get download URL from Telegram
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

      // Increment download count
      await storage.incrementShareDownload(share.id);

      // Get download URL from Telegram
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

      const downloadUrl = await telegramService.getDownloadUrl(
        file.telegramFileId,
        file.telegramBotId
      );

      const response = await fetch(downloadUrl);
      if (!response.ok) {
        return res.status(500).json({ message: "Erro ao buscar ficheiro" });
      }

      res.setHeader("Content-Type", file.tipoMime);
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

  return httpServer;
}
