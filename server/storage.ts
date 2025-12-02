import { 
  users, 
  files, 
  folders, 
  shares, 
  payments,
  invitations,
  filePermissions,
  folderPermissions,
  upgradeRequests,
  fileChunks,
  uploadSessions,
  uploadChunks,
  PLANS,
  type User, 
  type InsertUser,
  type File,
  type InsertFile,
  type Folder,
  type InsertFolder,
  type Share,
  type InsertShare,
  type Payment,
  type InsertPayment,
  type Invitation,
  type InsertInvitation,
  type FilePermission,
  type InsertFilePermission,
  type FolderPermission,
  type InsertFolderPermission,
  type UpgradeRequest,
  type InsertUpgradeRequest,
  type FileChunk,
  type InsertFileChunk,
  type UploadSession,
  type InsertUploadSession,
  type UploadChunk,
  type InsertUploadChunk,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql, or } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserStorage(userId: string, bytesChange: number): Promise<void>;
  updateUserPlan(userId: string, plano: string, newLimit: number): Promise<void>;
  updateEncryptionSalt(userId: string, encryptionSalt: string): Promise<void>;
  updateUserPassword(userId: string, passwordHash: string): Promise<void>;

  // Files
  getFile(id: string): Promise<File | undefined>;
  getFilesByUser(userId: string): Promise<File[]>;
  getFilesByFolder(folderId: string | null, userId: string): Promise<File[]>;
  getTrashFiles(userId: string): Promise<File[]>;
  createFile(file: InsertFile): Promise<File>;
  updateFile(id: string, updates: Partial<Omit<File, "id" | "userId" | "createdAt">>): Promise<void>;
  deleteFile(id: string): Promise<void>;
  moveToTrash(id: string): Promise<void>;
  restoreFromTrash(id: string): Promise<void>;
  purgeExpiredTrash(daysOld: number): Promise<File[]>;
  renameFile(id: string, newNome: string): Promise<void>;
  moveFile(id: string, newFolderId: string | null): Promise<void>;
  searchFiles(userId: string, query: string): Promise<File[]>;

  // Folders
  getFolder(id: string): Promise<Folder | undefined>;
  getFoldersByUser(userId: string): Promise<Folder[]>;
  getFoldersByParent(parentId: string | null, userId: string): Promise<Folder[]>;
  createFolder(folder: InsertFolder): Promise<Folder>;
  deleteFolder(id: string): Promise<void>;
  renameFolder(id: string, newNome: string): Promise<void>;
  moveFolder(id: string, newParentId: string | null): Promise<void>;

  // Shares
  getShare(id: string): Promise<Share | undefined>;
  getShareByLinkCode(linkCode: string): Promise<Share | undefined>;
  createShare(share: InsertShare): Promise<Share>;
  incrementShareDownload(id: string): Promise<void>;

  // Payments
  getPaymentsByUser(userId: string): Promise<Payment[]>;
  createPayment(payment: InsertPayment): Promise<Payment>;
  updatePaymentStatus(id: string, status: string): Promise<void>;

  // Invitations
  createInvitation(invitation: InsertInvitation): Promise<Invitation>;
  getInvitationByToken(token: string): Promise<Invitation | undefined>;
  getInvitationById(id: string): Promise<Invitation | undefined>;
  getInvitationsByInviter(inviterId: string): Promise<Invitation[]>;
  getInvitationsByInviteeEmail(email: string): Promise<Invitation[]>;
  getPendingInvitationsForUser(email: string): Promise<Invitation[]>;
  updateInvitationStatus(id: string, status: string, inviteeUserId?: string): Promise<void>;
  updateInvitationRole(id: string, role: string): Promise<void>;
  deleteInvitation(id: string): Promise<void>;
  getInvitationsForResource(resourceType: string, resourceId: string): Promise<Invitation[]>;

  // File Permissions
  createFilePermission(permission: InsertFilePermission): Promise<FilePermission>;
  getFilePermission(fileId: string, userId: string): Promise<FilePermission | undefined>;
  getFilePermissionsByFile(fileId: string): Promise<FilePermission[]>;
  getFilePermissionsByUser(userId: string): Promise<FilePermission[]>;
  deleteFilePermission(id: string): Promise<void>;
  hasFileAccess(fileId: string, userId: string): Promise<boolean>;

  // Folder Permissions
  createFolderPermission(permission: InsertFolderPermission): Promise<FolderPermission>;
  getFolderPermission(folderId: string, userId: string): Promise<FolderPermission | undefined>;
  getFolderPermissionsByFolder(folderId: string): Promise<FolderPermission[]>;
  getFolderPermissionsByUser(userId: string): Promise<FolderPermission[]>;
  deleteFolderPermission(id: string): Promise<void>;
  hasFolderAccess(folderId: string, userId: string): Promise<boolean>;
  canUploadToFolder(folderId: string, userId: string): Promise<boolean>;

  // Shared content
  getSharedFilesForUser(userId: string): Promise<File[]>;
  getSharedFoldersForUser(userId: string): Promise<Folder[]>;
  getFilesInSharedFolder(folderId: string, userId: string): Promise<File[]>;
  getFoldersInSharedFolder(parentId: string, userId: string): Promise<Folder[]>;

  // Admin functions
  getAllUsers(): Promise<User[]>;
  countUsers(): Promise<number>;
  countFiles(): Promise<number>;
  updateUserAdmin(userId: string, isAdmin: boolean): Promise<void>;
  incrementUserUploadCount(userId: string): Promise<void>;
  updateUserPlanFull(userId: string, plano: string, uploadLimit: number, storageLimit: number): Promise<void>;
  incrementUserStorageLimit(userId: string, additionalBytes: number): Promise<void>;

  // Upgrade Requests
  createUpgradeRequest(request: InsertUpgradeRequest): Promise<UpgradeRequest>;
  getUpgradeRequest(id: string): Promise<UpgradeRequest | undefined>;
  getAllUpgradeRequests(): Promise<UpgradeRequest[]>;
  getPendingUpgradeRequests(): Promise<UpgradeRequest[]>;
  getUpgradeRequestsByUser(userId: string): Promise<UpgradeRequest[]>;
  processUpgradeRequest(id: string, status: string, adminNote?: string): Promise<void>;
  cancelOtherUpgradeRequests(userId: string, excludeRequestId: string): Promise<void>;

  // File Chunks (for large file support)
  createFileChunks(chunks: InsertFileChunk[]): Promise<FileChunk[]>;
  getFileChunks(fileId: string): Promise<FileChunk[]>;
  deleteFileChunks(fileId: string): Promise<void>;

  // Public Folders
  makeFolderPublic(folderId: string, userId: string): Promise<{ slug: string }>;
  makeFolderPrivate(folderId: string, userId: string): Promise<void>;
  getPublicFolderBySlug(slug: string): Promise<Folder | undefined>;
  getPublicFolderFiles(folderId: string): Promise<File[]>;
  getPublicFolderSubfolders(folderId: string): Promise<Folder[]>;
  getUserPublicFolders(userId: string): Promise<Folder[]>;
  regeneratePublicSlug(folderId: string, userId: string): Promise<{ slug: string }>;
  isFolderOrAncestorPublic(folderId: string): Promise<boolean>;

  // Upload Sessions (for chunked uploads)
  createUploadSession(session: InsertUploadSession): Promise<UploadSession>;
  getUploadSession(id: string): Promise<UploadSession | undefined>;
  updateUploadSessionChunkCount(id: string): Promise<void>;
  updateUploadSessionStatus(id: string, status: string): Promise<void>;
  deleteUploadSession(id: string): Promise<void>;
  cleanupExpiredSessions(): Promise<void>;

  // Upload Chunks (temporary chunks for upload sessions)
  createUploadChunk(chunk: InsertUploadChunk): Promise<UploadChunk>;
  getUploadChunks(sessionId: string): Promise<UploadChunk[]>;
  deleteUploadChunks(sessionId: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUserStorage(userId: string, bytesChange: number): Promise<void> {
    await db
      .update(users)
      .set({ storageUsed: sql`${users.storageUsed} + ${bytesChange}` })
      .where(eq(users.id, userId));
  }

  async updateUserPlan(userId: string, plano: string, newLimit: number): Promise<void> {
    await db
      .update(users)
      .set({ plano, storageLimit: newLimit })
      .where(eq(users.id, userId));
  }

  async updateEncryptionSalt(userId: string, encryptionSalt: string): Promise<void> {
    await db
      .update(users)
      .set({ encryptionSalt })
      .where(eq(users.id, userId));
  }

  async updateUserPassword(userId: string, passwordHash: string): Promise<void> {
    await db
      .update(users)
      .set({ passwordHash })
      .where(eq(users.id, userId));
  }

  // Files
  async getFile(id: string): Promise<File | undefined> {
    const [file] = await db.select().from(files).where(eq(files.id, id));
    return file || undefined;
  }

  async getFilesByUser(userId: string): Promise<File[]> {
    return db
      .select()
      .from(files)
      .where(and(eq(files.userId, userId), eq(files.isDeleted, false)))
      .orderBy(desc(files.createdAt));
  }

  async getFilesByFolder(folderId: string | null, userId: string): Promise<File[]> {
    if (folderId === null) {
      return db
        .select()
        .from(files)
        .where(and(
          eq(files.userId, userId),
          eq(files.isDeleted, false),
          sql`${files.folderId} IS NULL`
        ))
        .orderBy(desc(files.createdAt));
    }
    return db
      .select()
      .from(files)
      .where(and(
        eq(files.userId, userId),
        eq(files.folderId, folderId),
        eq(files.isDeleted, false)
      ))
      .orderBy(desc(files.createdAt));
  }

  async getTrashFiles(userId: string): Promise<File[]> {
    return db
      .select()
      .from(files)
      .where(and(
        eq(files.userId, userId),
        eq(files.isDeleted, true)
      ))
      .orderBy(desc(files.createdAt));
  }

  async createFile(file: InsertFile): Promise<File> {
    const [newFile] = await db.insert(files).values(file).returning();
    return newFile;
  }

  async updateFile(id: string, updates: Partial<Omit<File, "id" | "userId" | "createdAt">>): Promise<void> {
    await db.update(files).set(updates).where(eq(files.id, id));
  }

  async deleteFile(id: string): Promise<void> {
    await db.delete(files).where(eq(files.id, id));
  }

  async moveToTrash(id: string): Promise<void> {
    await db.update(files).set({ 
      isDeleted: true, 
      deletedAt: new Date() 
    }).where(eq(files.id, id));
  }

  async restoreFromTrash(id: string): Promise<void> {
    await db.update(files).set({ 
      isDeleted: false, 
      deletedAt: null 
    }).where(eq(files.id, id));
  }

  async purgeExpiredTrash(daysOld: number = 15): Promise<File[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    const expiredFiles = await db
      .select()
      .from(files)
      .where(and(
        eq(files.isDeleted, true),
        sql`${files.deletedAt} IS NOT NULL`,
        sql`${files.deletedAt} < ${cutoffDate}`
      ));
    
    if (expiredFiles.length > 0) {
      await db.delete(files).where(and(
        eq(files.isDeleted, true),
        sql`${files.deletedAt} IS NOT NULL`,
        sql`${files.deletedAt} < ${cutoffDate}`
      ));
    }
    
    return expiredFiles;
  }

  async renameFile(id: string, newNome: string): Promise<void> {
    await db.update(files).set({ nome: newNome }).where(eq(files.id, id));
  }

  async moveFile(id: string, newFolderId: string | null): Promise<void> {
    await db.update(files).set({ folderId: newFolderId }).where(eq(files.id, id));
  }

  async searchFiles(userId: string, query: string): Promise<File[]> {
    return db
      .select()
      .from(files)
      .where(and(
        eq(files.userId, userId),
        eq(files.isDeleted, false),
        sql`${files.nome} ILIKE ${`%${query}%`}`
      ))
      .orderBy(desc(files.createdAt));
  }

  // Folders
  async getFolder(id: string): Promise<Folder | undefined> {
    const [folder] = await db.select().from(folders).where(eq(folders.id, id));
    return folder || undefined;
  }

  async getFoldersByUser(userId: string): Promise<Folder[]> {
    return db
      .select()
      .from(folders)
      .where(eq(folders.userId, userId))
      .orderBy(desc(folders.createdAt));
  }

  async getFoldersByParent(parentId: string | null, userId: string): Promise<Folder[]> {
    if (parentId === null) {
      return db
        .select()
        .from(folders)
        .where(and(
          eq(folders.userId, userId),
          sql`${folders.parentId} IS NULL`
        ))
        .orderBy(desc(folders.createdAt));
    }
    return db
      .select()
      .from(folders)
      .where(and(
        eq(folders.userId, userId),
        eq(folders.parentId, parentId)
      ))
      .orderBy(desc(folders.createdAt));
  }

  async createFolder(folder: InsertFolder): Promise<Folder> {
    const [newFolder] = await db.insert(folders).values(folder).returning();
    return newFolder;
  }

  async deleteFolder(id: string): Promise<void> {
    await db.delete(folders).where(eq(folders.id, id));
  }

  async renameFolder(id: string, newNome: string): Promise<void> {
    await db.update(folders).set({ nome: newNome }).where(eq(folders.id, id));
  }

  async moveFolder(id: string, newParentId: string | null): Promise<void> {
    await db.update(folders).set({ parentId: newParentId }).where(eq(folders.id, id));
  }

  // Shares
  async getShare(id: string): Promise<Share | undefined> {
    const [share] = await db.select().from(shares).where(eq(shares.id, id));
    return share || undefined;
  }

  async getShareByLinkCode(linkCode: string): Promise<Share | undefined> {
    const [share] = await db.select().from(shares).where(eq(shares.linkCode, linkCode));
    return share || undefined;
  }

  async createShare(share: InsertShare): Promise<Share> {
    const [newShare] = await db.insert(shares).values(share).returning();
    return newShare;
  }

  async incrementShareDownload(id: string): Promise<void> {
    await db
      .update(shares)
      .set({ downloadCount: sql`${shares.downloadCount} + 1` })
      .where(eq(shares.id, id));
  }

  // Payments
  async getPaymentsByUser(userId: string): Promise<Payment[]> {
    return db
      .select()
      .from(payments)
      .where(eq(payments.userId, userId))
      .orderBy(desc(payments.createdAt));
  }

  async createPayment(payment: InsertPayment): Promise<Payment> {
    const [newPayment] = await db.insert(payments).values(payment).returning();
    return newPayment;
  }

  async updatePaymentStatus(id: string, status: string): Promise<void> {
    await db.update(payments).set({ status }).where(eq(payments.id, id));
  }

  // Invitations
  async createInvitation(invitation: InsertInvitation): Promise<Invitation> {
    const [newInvitation] = await db.insert(invitations).values(invitation).returning();
    return newInvitation;
  }

  async getInvitationByToken(token: string): Promise<Invitation | undefined> {
    const [invitation] = await db.select().from(invitations).where(eq(invitations.token, token));
    return invitation || undefined;
  }

  async getInvitationById(id: string): Promise<Invitation | undefined> {
    const [invitation] = await db.select().from(invitations).where(eq(invitations.id, id));
    return invitation || undefined;
  }

  async getInvitationsByInviter(inviterId: string): Promise<Invitation[]> {
    return db
      .select()
      .from(invitations)
      .where(eq(invitations.inviterId, inviterId))
      .orderBy(desc(invitations.createdAt));
  }

  async getInvitationsByInviteeEmail(email: string): Promise<Invitation[]> {
    return db
      .select()
      .from(invitations)
      .where(eq(invitations.inviteeEmail, email))
      .orderBy(desc(invitations.createdAt));
  }

  async getPendingInvitationsForUser(email: string): Promise<Invitation[]> {
    return db
      .select()
      .from(invitations)
      .where(and(
        eq(invitations.inviteeEmail, email),
        eq(invitations.status, "pending")
      ))
      .orderBy(desc(invitations.createdAt));
  }

  async updateInvitationStatus(id: string, status: string, inviteeUserId?: string): Promise<void> {
    const updateData: any = { status };
    if (inviteeUserId) {
      updateData.inviteeUserId = inviteeUserId;
    }
    await db.update(invitations).set(updateData).where(eq(invitations.id, id));
  }

  async updateInvitationRole(id: string, role: string): Promise<void> {
    await db.update(invitations).set({ role }).where(eq(invitations.id, id));
  }

  async deleteInvitation(id: string): Promise<void> {
    await db.delete(invitations).where(eq(invitations.id, id));
  }

  async getInvitationsForResource(resourceType: string, resourceId: string): Promise<Invitation[]> {
    return db
      .select()
      .from(invitations)
      .where(and(
        eq(invitations.resourceType, resourceType),
        eq(invitations.resourceId, resourceId)
      ))
      .orderBy(desc(invitations.createdAt));
  }

  // File Permissions
  async createFilePermission(permission: InsertFilePermission): Promise<FilePermission> {
    const [newPermission] = await db.insert(filePermissions).values(permission).returning();
    return newPermission;
  }

  async getFilePermission(fileId: string, userId: string): Promise<FilePermission | undefined> {
    const [permission] = await db
      .select()
      .from(filePermissions)
      .where(and(
        eq(filePermissions.fileId, fileId),
        eq(filePermissions.userId, userId)
      ));
    return permission || undefined;
  }

  async getFilePermissionsByFile(fileId: string): Promise<FilePermission[]> {
    return db
      .select()
      .from(filePermissions)
      .where(eq(filePermissions.fileId, fileId));
  }

  async getFilePermissionsByUser(userId: string): Promise<FilePermission[]> {
    return db
      .select()
      .from(filePermissions)
      .where(eq(filePermissions.userId, userId));
  }

  async deleteFilePermission(id: string): Promise<void> {
    await db.delete(filePermissions).where(eq(filePermissions.id, id));
  }

  async hasFileAccess(fileId: string, userId: string): Promise<boolean> {
    const file = await this.getFile(fileId);
    if (!file) return false;
    
    // Owner always has access
    if (file.userId === userId) return true;
    
    // Check direct file permission
    const permission = await this.getFilePermission(fileId, userId);
    if (permission) return true;
    
    // Check folder permission if file is in a folder
    if (file.folderId) {
      const folderAccess = await this.hasFolderAccess(file.folderId, userId);
      if (folderAccess) return true;
    }
    
    return false;
  }

  // Folder Permissions
  async createFolderPermission(permission: InsertFolderPermission): Promise<FolderPermission> {
    const [newPermission] = await db.insert(folderPermissions).values(permission).returning();
    return newPermission;
  }

  async getFolderPermission(folderId: string, userId: string): Promise<FolderPermission | undefined> {
    const [permission] = await db
      .select()
      .from(folderPermissions)
      .where(and(
        eq(folderPermissions.folderId, folderId),
        eq(folderPermissions.userId, userId)
      ));
    return permission || undefined;
  }

  async getFolderPermissionsByFolder(folderId: string): Promise<FolderPermission[]> {
    return db
      .select()
      .from(folderPermissions)
      .where(eq(folderPermissions.folderId, folderId));
  }

  async getFolderPermissionsByUser(userId: string): Promise<FolderPermission[]> {
    return db
      .select()
      .from(folderPermissions)
      .where(eq(folderPermissions.userId, userId));
  }

  async deleteFolderPermission(id: string): Promise<void> {
    await db.delete(folderPermissions).where(eq(folderPermissions.id, id));
  }

  async updateFolderPermissionRole(id: string, role: string): Promise<void> {
    await db.update(folderPermissions).set({ role }).where(eq(folderPermissions.id, id));
  }

  async updateFilePermissionRole(id: string, role: string): Promise<void> {
    await db.update(filePermissions).set({ role }).where(eq(filePermissions.id, id));
  }

  async hasFolderAccess(folderId: string, userId: string): Promise<boolean> {
    const folder = await this.getFolder(folderId);
    if (!folder) return false;
    
    // Owner always has access
    if (folder.userId === userId) return true;
    
    // Check direct folder permission
    const permission = await this.getFolderPermission(folderId, userId);
    if (permission) return true;
    
    // Check parent folder permission recursively
    if (folder.parentId) {
      return this.hasFolderAccess(folder.parentId, userId);
    }
    
    return false;
  }

  async canUploadToFolder(folderId: string, userId: string): Promise<boolean> {
    const folder = await this.getFolder(folderId);
    if (!folder) return false;
    
    // Owner can always upload
    if (folder.userId === userId) return true;
    
    // Check if user has collaborator role on folder
    const permission = await this.getFolderPermission(folderId, userId);
    if (permission && permission.role === "collaborator") return true;
    
    // Check parent folder permission recursively
    if (folder.parentId) {
      return this.canUploadToFolder(folder.parentId, userId);
    }
    
    return false;
  }

  // Shared content
  async getSharedFilesForUser(userId: string): Promise<File[]> {
    const permissions = await this.getFilePermissionsByUser(userId);
    if (permissions.length === 0) return [];
    
    const fileIds = permissions.map(p => p.fileId);
    return db
      .select()
      .from(files)
      .where(and(
        sql`${files.id} IN (${sql.join(fileIds.map(id => sql`${id}`), sql`, `)})`,
        eq(files.isDeleted, false),
        sql`${files.userId} != ${userId}`
      ))
      .orderBy(desc(files.createdAt));
  }

  async getSharedFoldersForUser(userId: string): Promise<Folder[]> {
    const permissions = await this.getFolderPermissionsByUser(userId);
    if (permissions.length === 0) return [];
    
    const folderIds = permissions.map(p => p.folderId);
    return db
      .select()
      .from(folders)
      .where(and(
        sql`${folders.id} IN (${sql.join(folderIds.map(id => sql`${id}`), sql`, `)})`,
        sql`${folders.userId} != ${userId}`
      ))
      .orderBy(desc(folders.createdAt));
  }

  async getFilesInSharedFolder(folderId: string, userId: string): Promise<File[]> {
    const hasAccess = await this.hasFolderAccess(folderId, userId);
    if (!hasAccess) return [];
    
    return db
      .select()
      .from(files)
      .where(and(
        eq(files.folderId, folderId),
        eq(files.isDeleted, false)
      ))
      .orderBy(desc(files.createdAt));
  }

  async getFoldersInSharedFolder(parentId: string, userId: string): Promise<Folder[]> {
    const hasAccess = await this.hasFolderAccess(parentId, userId);
    if (!hasAccess) return [];
    
    return db
      .select()
      .from(folders)
      .where(eq(folders.parentId, parentId))
      .orderBy(desc(folders.createdAt));
  }

  // Admin functions
  async getAllUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.createdAt));
  }

  async countUsers(): Promise<number> {
    const result = await db.select({ count: sql`count(*)` }).from(users);
    return result[0]?.count ? Number(result[0].count) : 0;
  }

  async countFiles(): Promise<number> {
    const result = await db.select({ count: sql`count(*)` }).from(files);
    return result[0]?.count ? Number(result[0].count) : 0;
  }

  async updateUserAdmin(userId: string, isAdmin: boolean): Promise<void> {
    await db.update(users).set({ isAdmin }).where(eq(users.id, userId));
  }

  async incrementUserUploadCount(userId: string): Promise<void> {
    await db
      .update(users)
      .set({ uploadsCount: sql`${users.uploadsCount} + 1` })
      .where(eq(users.id, userId));
  }

  async updateUserPlanFull(userId: string, plano: string, uploadLimit: number, storageLimit: number): Promise<void> {
    await db
      .update(users)
      .set({ plano, uploadLimit, storageLimit })
      .where(eq(users.id, userId));
  }

  async incrementUserStorageLimit(userId: string, additionalBytes: number): Promise<void> {
    await db
      .update(users)
      .set({ storageLimit: sql`${users.storageLimit} + ${additionalBytes}` })
      .where(eq(users.id, userId));
  }

  // Upgrade Requests
  async createUpgradeRequest(request: InsertUpgradeRequest): Promise<UpgradeRequest> {
    const [result] = await db.insert(upgradeRequests).values(request).returning();
    return result;
  }

  async getUpgradeRequest(id: string): Promise<UpgradeRequest | undefined> {
    const [request] = await db.select().from(upgradeRequests).where(eq(upgradeRequests.id, id));
    return request || undefined;
  }

  async getAllUpgradeRequests(): Promise<UpgradeRequest[]> {
    return db.select().from(upgradeRequests).orderBy(desc(upgradeRequests.createdAt));
  }

  async getPendingUpgradeRequests(): Promise<UpgradeRequest[]> {
    return db
      .select()
      .from(upgradeRequests)
      .where(eq(upgradeRequests.status, "pending"))
      .orderBy(desc(upgradeRequests.createdAt));
  }

  async getUpgradeRequestsByUser(userId: string): Promise<UpgradeRequest[]> {
    return db
      .select()
      .from(upgradeRequests)
      .where(eq(upgradeRequests.userId, userId))
      .orderBy(desc(upgradeRequests.createdAt));
  }

  async processUpgradeRequest(id: string, status: string, adminNote?: string): Promise<void> {
    await db
      .update(upgradeRequests)
      .set({ 
        status, 
        adminNote: adminNote || null,
        processedAt: new Date()
      })
      .where(eq(upgradeRequests.id, id));
  }

  async cancelOtherUpgradeRequests(userId: string, excludeRequestId: string): Promise<void> {
    await db
      .update(upgradeRequests)
      .set({ status: "rejected" })
      .where(
        and(
          eq(upgradeRequests.userId, userId),
          eq(upgradeRequests.status, "pending"),
          // Don't update the current request
          sql`${upgradeRequests.id} != ${excludeRequestId}`
        )
      );
  }

  // File Chunks (for large file support)
  async createFileChunks(chunks: InsertFileChunk[]): Promise<FileChunk[]> {
    if (chunks.length === 0) return [];
    const result = await db.insert(fileChunks).values(chunks).returning();
    return result;
  }

  async getFileChunks(fileId: string): Promise<FileChunk[]> {
    return db
      .select()
      .from(fileChunks)
      .where(eq(fileChunks.fileId, fileId))
      .orderBy(fileChunks.chunkIndex);
  }

  async deleteFileChunks(fileId: string): Promise<void> {
    await db.delete(fileChunks).where(eq(fileChunks.fileId, fileId));
  }

  // Public Folders
  private generatePublicSlug(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let slug = '';
    for (let i = 0; i < 12; i++) {
      slug += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return slug;
  }

  async makeFolderPublic(folderId: string, userId: string): Promise<{ slug: string }> {
    const [folder] = await db.select().from(folders).where(
      and(eq(folders.id, folderId), eq(folders.userId, userId))
    );
    
    if (!folder) {
      throw new Error("Pasta não encontrada ou não autorizada");
    }

    if (folder.isPublic && folder.publicSlug) {
      return { slug: folder.publicSlug };
    }

    const encryptedFiles = await db
      .select()
      .from(files)
      .where(and(
        eq(files.folderId, folderId),
        eq(files.isDeleted, false),
        eq(files.isEncrypted, true)
      ));

    if (encryptedFiles.length > 0) {
      throw new Error(`Esta pasta contém ${encryptedFiles.length} ficheiro(s) encriptado(s). Por favor, reprocesse-os antes de tornar a pasta pública.`);
    }

    const slug = this.generatePublicSlug();
    await db
      .update(folders)
      .set({ 
        isPublic: true, 
        publicSlug: slug,
        publishedAt: new Date()
      })
      .where(eq(folders.id, folderId));

    return { slug };
  }

  async makeFolderPrivate(folderId: string, userId: string): Promise<void> {
    const [folder] = await db.select().from(folders).where(
      and(eq(folders.id, folderId), eq(folders.userId, userId))
    );
    
    if (!folder) {
      throw new Error("Pasta não encontrada ou não autorizada");
    }

    await db
      .update(folders)
      .set({ 
        isPublic: false, 
        publicSlug: null,
        publishedAt: null
      })
      .where(eq(folders.id, folderId));
  }

  async getPublicFolderBySlug(slug: string): Promise<Folder | undefined> {
    const [folder] = await db.select().from(folders).where(
      and(eq(folders.publicSlug, slug), eq(folders.isPublic, true))
    );
    return folder || undefined;
  }

  async getPublicFolderFiles(folderId: string): Promise<File[]> {
    return db
      .select()
      .from(files)
      .where(and(
        eq(files.folderId, folderId),
        eq(files.isDeleted, false)
      ))
      .orderBy(desc(files.createdAt));
  }

  async getPublicFolderSubfolders(folderId: string): Promise<Folder[]> {
    return db
      .select()
      .from(folders)
      .where(eq(folders.parentId, folderId))
      .orderBy(folders.nome);
  }

  async getUserPublicFolders(userId: string): Promise<Folder[]> {
    return db
      .select()
      .from(folders)
      .where(and(eq(folders.userId, userId), eq(folders.isPublic, true)))
      .orderBy(desc(folders.createdAt));
  }

  async regeneratePublicSlug(folderId: string, userId: string): Promise<{ slug: string }> {
    const [folder] = await db.select().from(folders).where(
      and(eq(folders.id, folderId), eq(folders.userId, userId), eq(folders.isPublic, true))
    );
    
    if (!folder) {
      throw new Error("Pasta pública não encontrada ou não autorizada");
    }

    const newSlug = this.generatePublicSlug();
    await db
      .update(folders)
      .set({ publicSlug: newSlug })
      .where(eq(folders.id, folderId));

    return { slug: newSlug };
  }

  async isFolderOrAncestorPublic(folderId: string): Promise<boolean> {
    let currentFolderId: string | null = folderId;
    const visited = new Set<string>();
    
    while (currentFolderId) {
      if (visited.has(currentFolderId)) {
        break;
      }
      visited.add(currentFolderId);
      
      const [folder] = await db.select().from(folders).where(eq(folders.id, currentFolderId));
      
      if (!folder) {
        break;
      }
      
      if (folder.isPublic) {
        return true;
      }
      
      currentFolderId = folder.parentId;
    }
    
    return false;
  }

  // Upload Sessions (for chunked uploads)
  async createUploadSession(session: InsertUploadSession): Promise<UploadSession> {
    const [result] = await db.insert(uploadSessions).values(session).returning();
    return result;
  }

  async getUploadSession(id: string): Promise<UploadSession | undefined> {
    const [session] = await db.select().from(uploadSessions).where(eq(uploadSessions.id, id));
    return session || undefined;
  }

  async updateUploadSessionChunkCount(id: string): Promise<void> {
    await db
      .update(uploadSessions)
      .set({ uploadedChunks: sql`${uploadSessions.uploadedChunks} + 1` })
      .where(eq(uploadSessions.id, id));
  }

  async updateUploadSessionStatus(id: string, status: string): Promise<void> {
    await db.update(uploadSessions).set({ status }).where(eq(uploadSessions.id, id));
  }

  async deleteUploadSession(id: string): Promise<void> {
    await db.delete(uploadSessions).where(eq(uploadSessions.id, id));
  }

  async cleanupExpiredSessions(): Promise<void> {
    const now = new Date();
    await db.delete(uploadSessions).where(
      sql`${uploadSessions.expiresAt} < ${now}`
    );
  }

  // Upload Chunks (temporary chunks for upload sessions)
  async createUploadChunk(chunk: InsertUploadChunk): Promise<UploadChunk> {
    const [result] = await db.insert(uploadChunks).values(chunk).returning();
    return result;
  }

  async getUploadChunks(sessionId: string): Promise<UploadChunk[]> {
    return db
      .select()
      .from(uploadChunks)
      .where(eq(uploadChunks.sessionId, sessionId))
      .orderBy(uploadChunks.chunkIndex);
  }

  async deleteUploadChunks(sessionId: string): Promise<void> {
    await db.delete(uploadChunks).where(eq(uploadChunks.sessionId, sessionId));
  }

  // Migration: Update legacy users from 15GB to 20GB storage limit
  async migrateLegacyStorageLimits(): Promise<number> {
    const OLD_15GB_LIMIT = 16106127360; // 15GB in bytes
    const NEW_20GB_LIMIT = 21474836480; // 20GB in bytes
    
    const result = await db
      .update(users)
      .set({ storageLimit: NEW_20GB_LIMIT })
      .where(eq(users.storageLimit, OLD_15GB_LIMIT))
      .returning({ id: users.id });
    
    return result.length;
  }
}

export const storage = new DatabaseStorage();

// Run startup migrations
(async () => {
  try {
    const updatedCount = await storage.migrateLegacyStorageLimits();
    if (updatedCount > 0) {
      console.log(`[Migration] Updated ${updatedCount} user(s) from 15GB to 20GB storage limit`);
    }
  } catch (error) {
    console.error("[Migration] Failed to migrate legacy storage limits:", error);
  }
})();
