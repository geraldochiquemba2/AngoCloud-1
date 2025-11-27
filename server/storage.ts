import { 
  users, 
  files, 
  folders, 
  shares, 
  payments,
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
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserStorage(userId: string, bytesChange: number): Promise<void>;
  updateUserPlan(userId: string, plano: string, newLimit: number): Promise<void>;

  // Files
  getFile(id: string): Promise<File | undefined>;
  getFilesByUser(userId: string): Promise<File[]>;
  getFilesByFolder(folderId: string | null, userId: string): Promise<File[]>;
  createFile(file: InsertFile): Promise<File>;
  deleteFile(id: string): Promise<void>;
  moveToTrash(id: string): Promise<void>;
  restoreFromTrash(id: string): Promise<void>;
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

  async createFile(file: InsertFile): Promise<File> {
    const [newFile] = await db.insert(files).values(file).returning();
    return newFile;
  }

  async deleteFile(id: string): Promise<void> {
    await db.delete(files).where(eq(files.id, id));
  }

  async moveToTrash(id: string): Promise<void> {
    await db.update(files).set({ isDeleted: true }).where(eq(files.id, id));
  }

  async restoreFromTrash(id: string): Promise<void> {
    await db.update(files).set({ isDeleted: false }).where(eq(files.id, id));
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
}

export const storage = new DatabaseStorage();
