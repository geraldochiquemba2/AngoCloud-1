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

      res.json({
        downloadUrl,
        isEncrypted: file.isEncrypted || false,
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
