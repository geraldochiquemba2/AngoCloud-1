import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, bigint, boolean, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  nome: text("nome").notNull(),
  avatar: text("avatar"),
  googleId: text("google_id").unique(),
  githubId: text("github_id").unique(),
  facebookId: text("facebook_id").unique(),
  plano: text("plano").notNull().default("gratis"),
  storageLimit: bigint("storage_limit", { mode: "number" }).notNull().default(21474836480),
  storageUsed: bigint("storage_used", { mode: "number" }).notNull().default(0),
  uploadsCount: integer("uploads_count").notNull().default(0),
  uploadLimit: integer("upload_limit").notNull().default(-1),
  isAdmin: boolean("is_admin").notNull().default(false),
  encryptionSalt: text("encryption_salt"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const folders = pgTable("folders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  parentId: varchar("parent_id"),
  nome: text("nome").notNull(),
  isPublic: boolean("is_public").notNull().default(false),
  publicSlug: text("public_slug").unique(),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const files = pgTable("files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  uploadedByUserId: varchar("uploaded_by_user_id"),
  folderId: varchar("folder_id"),
  nome: text("nome").notNull(),
  tamanho: bigint("tamanho", { mode: "number" }).notNull(),
  tipoMime: text("tipo_mime").notNull(),
  telegramFileId: text("telegram_file_id"),
  telegramBotId: text("telegram_bot_id"),
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at"),
  sharedLinkId: varchar("shared_link_id"),
  isEncrypted: boolean("is_encrypted").notNull().default(false),
  encryptionVersion: integer("encryption_version").notNull().default(1),
  originalMimeType: text("original_mime_type"),
  originalSize: bigint("original_size", { mode: "number" }),
  isChunked: boolean("is_chunked").notNull().default(false),
  totalChunks: integer("total_chunks").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const shares = pgTable("shares", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fileId: varchar("file_id").notNull(),
  linkCode: text("link_code").notNull().unique(),
  passwordHash: text("password_hash"),
  expiresAt: timestamp("expires_at"),
  downloadCount: integer("download_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const payments = pgTable("payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  valor: integer("valor").notNull(),
  plano: text("plano").notNull(),
  referenciaMulticaixa: text("referencia_multicaixa"),
  status: text("status").notNull().default("pendente"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const invitations = pgTable("invitations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  resourceType: text("resource_type").notNull(),
  resourceId: varchar("resource_id").notNull(),
  inviterId: varchar("inviter_id").notNull(),
  inviteeEmail: text("invitee_email").notNull(),
  inviteeUserId: varchar("invitee_user_id"),
  role: text("role").notNull().default("viewer"),
  status: text("status").notNull().default("pending"),
  token: text("token").notNull().unique(),
  sharedEncryptionKey: text("shared_encryption_key"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const filePermissions = pgTable("file_permissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fileId: varchar("file_id").notNull(),
  userId: varchar("user_id").notNull(),
  role: text("role").notNull().default("viewer"),
  grantedBy: varchar("granted_by").notNull(),
  sharedEncryptionKey: text("shared_encryption_key"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const folderPermissions = pgTable("folder_permissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  folderId: varchar("folder_id").notNull(),
  userId: varchar("user_id").notNull(),
  role: text("role").notNull().default("viewer"),
  grantedBy: varchar("granted_by").notNull(),
  sharedEncryptionKey: text("shared_encryption_key"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const upgradeRequests = pgTable("upgrade_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  currentPlan: text("current_plan").notNull(),
  requestedPlan: text("requested_plan").notNull(),
  requestedExtraGB: integer("requested_extra_gb"),
  totalPrice: integer("total_price"),
  status: text("status").notNull().default("pending"),
  adminNote: text("admin_note"),
  proofFileName: text("proof_file_name"),
  proofFileSize: bigint("proof_file_size", { mode: "number" }),
  proofTelegramFileId: text("proof_telegram_file_id"),
  proofTelegramBotId: text("proof_telegram_bot_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  processedAt: timestamp("processed_at"),
});

export const fileChunks = pgTable("file_chunks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fileId: varchar("file_id").notNull(),
  chunkIndex: integer("chunk_index").notNull(),
  telegramFileId: text("telegram_file_id").notNull(),
  telegramBotId: text("telegram_bot_id").notNull(),
  chunkSize: bigint("chunk_size", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const uploadSessions = pgTable("upload_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  fileName: text("file_name").notNull(),
  fileSize: bigint("file_size", { mode: "number" }).notNull(),
  mimeType: text("mime_type").notNull(),
  totalChunks: integer("total_chunks").notNull(),
  uploadedChunks: integer("uploaded_chunks").notNull().default(0),
  folderId: varchar("folder_id"),
  isEncrypted: boolean("is_encrypted").notNull().default(false),
  encryptionVersion: integer("encryption_version").notNull().default(1),
  originalMimeType: text("original_mime_type"),
  originalSize: bigint("original_size", { mode: "number" }),
  status: text("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const uploadChunks = pgTable("upload_chunks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull(),
  chunkIndex: integer("chunk_index").notNull(),
  telegramFileId: text("telegram_file_id").notNull(),
  telegramBotId: text("telegram_bot_id").notNull(),
  chunkSize: bigint("chunk_size", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Folder = typeof folders.$inferSelect;
export type File = typeof files.$inferSelect;
export type Share = typeof shares.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Invitation = typeof invitations.$inferSelect;
export type FilePermission = typeof filePermissions.$inferSelect;
export type FolderPermission = typeof folderPermissions.$inferSelect;
export type UpgradeRequest = typeof upgradeRequests.$inferSelect;
export type FileChunk = typeof fileChunks.$inferSelect;
export type UploadSession = typeof uploadSessions.$inferSelect;
export type UploadChunk = typeof uploadChunks.$inferSelect;

export const PRICING = {
  freeStorageGB: 20,
  freeStorageBytes: 21474836480,
  pricePerGB: 500,
} as const;

export const PLANS = {
  gratis: { nome: "Grátis", uploadLimit: -1, storageLimit: 21474836480, preco: 0 },
} as const;
