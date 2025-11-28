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
      
      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
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
      
      const isEncrypted = req.body.isEncrypted === "true";
      const originalMimeType = req.body.originalMimeType || req.file.mimetype;
      const originalSize = req.body.originalSize ? parseInt(req.body.originalSize, 10) : fileSize;
      const folderId = req.body.folderId || null;
      
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

      const uploadResult = await telegramService.uploadFile(
        req.file.buffer,
        req.file.originalname
      );

      const file = await storage.createFile({
        userId: fileOwnerId,
        uploadedByUserId: user.id,
        folderId,
        nome: req.file.originalname,
        tamanho: fileSize,
        tipoMime: isEncrypted ? 'application/octet-stream' : originalMimeType,
        telegramFileId: uploadResult.fileId,
        telegramBotId: uploadResult.botId,
        isEncrypted,
        originalMimeType,
        originalSize,
      });

      // Update storage for the storage owner (folder owner if shared folder)
      await storage.updateUserStorage(storageOwnerId, originalSize);
      
      // Increment upload count for the uploader
      await storage.incrementUserUploadCount(user.id);

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

  // ========== INVITATION ROUTES ==========

  // Create invitation (invite someone to access a file or folder)
  app.post("/api/invitations", requireAuth, async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        resourceType: z.enum(["file", "folder"]),
        resourceId: z.string(),
        inviteeEmail: z.string().email(),
        role: z.enum(["viewer", "collaborator"]).optional().default("viewer"),
      });

      const { resourceType, resourceId, inviteeEmail, role } = schema.parse(req.body);
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
      
      // Create the appropriate permission
      if (invitation.resourceType === "file") {
        await storage.createFilePermission({
          fileId: invitation.resourceId,
          userId: req.user!.id,
          role: invitation.role === "collaborator" ? "editor" : "viewer",
          grantedBy: invitation.inviterId,
        });
      } else {
        await storage.createFolderPermission({
          folderId: invitation.resourceId,
          userId: req.user!.id,
          role: invitation.role,
          grantedBy: invitation.inviterId,
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
      if (!hasAccess) {
        return res.status(403).json({ message: "Acesso negado" });
      }
      
      const [filesData, foldersData] = await Promise.all([
        storage.getFilesInSharedFolder(folderId, userId),
        storage.getFoldersInSharedFolder(folderId, userId),
      ]);
      
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
        folderId: null,
        isDeleted: false,
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

  // Proxy video stream for CORS-safe thumbnail generation
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

      if (!file.telegramFileId || !file.telegramBotId) {
        return res.status(404).json({ message: "Arquivo não disponível" });
      }

      const downloadUrl = await telegramService.getDownloadUrl(
        file.telegramFileId,
        file.telegramBotId
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

  // Download file (legacy redirect)
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

      if (!file.telegramFileId || !file.telegramBotId) {
        return res.status(404).json({ message: "Arquivo não disponível para download" });
      }

      const downloadUrl = await telegramService.getDownloadUrl(
        file.telegramFileId,
        file.telegramBotId
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

      if (!file.telegramFileId || !file.telegramBotId) {
        return res.status(404).json({ message: "Arquivo não disponível para download" });
      }

      const downloadUrl = await telegramService.getDownloadUrl(
        file.telegramFileId,
        file.telegramBotId
      );

      // Check if current user is the file owner
      const isOwner = file.userId === req.user!.id;
      
      // Get shared encryption key if user is not owner but has file permission
      let sharedEncryptionKey: string | null = null;
      if (!isOwner && file.isEncrypted) {
        const permission = await storage.getFilePermission(req.params.id, req.user!.id);
        if (permission?.sharedEncryptionKey) {
          sharedEncryptionKey = permission.sharedEncryptionKey;
        }
      }

      res.json({
        downloadUrl,
        isEncrypted: file.isEncrypted || false,
        isOwner,
        sharedEncryptionKey,
        originalMimeType: file.originalMimeType || file.tipoMime,
        originalSize: file.originalSize || file.tamanho,
        nome: file.nome,
      });
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
      
      // If approved, update user's plan and cancel other requests
      if (status === "approved") {
        const planConfig = PLANS[upgradeRequest.requestedPlan as keyof typeof PLANS];
        if (planConfig) {
          await storage.updateUserPlanFull(
            upgradeRequest.userId,
            upgradeRequest.requestedPlan,
            planConfig.uploadLimit,
            planConfig.storageLimit
          );
          
          // Cancel other pending requests from the same user
          await storage.cancelOtherUpgradeRequests(upgradeRequest.userId, req.params.id);
        }
      }
      
      await storage.processUpgradeRequest(req.params.id, status, adminNote);
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

  // Request plan upgrade with proof of payment
  app.post("/api/upgrade-requests", requireAuth, upload.single("proof"), async (req: Request, res: Response) => {
    try {
      const requestedPlan = req.body.requestedPlan;
      
      if (!requestedPlan) {
        return res.status(400).json({ message: "Plano não especificado" });
      }
      
      const planConfig = PLANS[requestedPlan as keyof typeof PLANS];
      if (!planConfig) {
        return res.status(400).json({ message: "Plano inválido" });
      }
      
      const user = await storage.getUser(req.user!.id);
      if (!user) {
        return res.status(404).json({ message: "Utilizador não encontrado" });
      }
      
      if (user.plano === requestedPlan) {
        return res.status(400).json({ message: "Já possui este plano" });
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
        requestedPlan,
        proofFileName: req.file.originalname,
        proofFileSize: req.file.size,
        proofTelegramFileId,
        proofTelegramBotId,
      });
      
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

  return httpServer;
}
