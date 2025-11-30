import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, bigint, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  nome: text("nome").notNull(),
  plano: text("plano").notNull().default("gratis"),
  storageLimit: bigint("storage_limit", { mode: "number" }).notNull().default(21474836480), // 20GB em bytes
  storageUsed: bigint("storage_used", { mode: "number" }).notNull().default(0),
  uploadsCount: integer("uploads_count").notNull().default(0),
  uploadLimit: integer("upload_limit").notNull().default(-1), // -1 = ilimitado, limite é pelo espaço
  isAdmin: boolean("is_admin").notNull().default(false),
  encryptionSalt: text("encryption_salt"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Modelo de preços: 20GB grátis + 500Kz por GB extra
export const PRICING = {
  freeStorageGB: 20, // 20GB grátis
  freeStorageBytes: 21474836480, // 20GB em bytes
  pricePerGB: 500, // 500Kz por GB
} as const;

// Modelo simplificado: todos começam com 20GB grátis e pagam por GB extra
export const PLANS = {
  gratis: { nome: "Grátis", uploadLimit: -1, storageLimit: 21474836480, preco: 0 }, // 20GB base
} as const;

export const folders = pgTable("folders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  parentId: varchar("parent_id"),
  nome: text("nome").notNull(),
  isPublic: boolean("is_public").notNull().default(false),
  publicSlug: text("public_slug").unique(),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const files = pgTable("files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  uploadedByUserId: varchar("uploaded_by_user_id").references(() => users.id, { onDelete: "set null" }),
  folderId: varchar("folder_id").references(() => folders.id, { onDelete: "set null" }),
  nome: text("nome").notNull(),
  tamanho: bigint("tamanho", { mode: "number" }).notNull(),
  tipoMime: text("tipo_mime").notNull(),
  telegramFileId: text("telegram_file_id"),
  telegramBotId: text("telegram_bot_id"),
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at"),
  sharedLinkId: varchar("shared_link_id"),
  isEncrypted: boolean("is_encrypted").notNull().default(false),
  originalMimeType: text("original_mime_type"),
  originalSize: bigint("original_size", { mode: "number" }),
  isChunked: boolean("is_chunked").notNull().default(false),
  totalChunks: integer("total_chunks").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const shares = pgTable("shares", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fileId: varchar("file_id").notNull().references(() => files.id, { onDelete: "cascade" }),
  linkCode: text("link_code").notNull().unique(),
  passwordHash: text("password_hash"),
  expiresAt: timestamp("expires_at"),
  downloadCount: integer("download_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const payments = pgTable("payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  valor: integer("valor").notNull(),
  plano: text("plano").notNull(),
  referenciaMulticaixa: text("referencia_multicaixa"),
  status: text("status").notNull().default("pendente"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const invitations = pgTable("invitations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  resourceType: text("resource_type").notNull(), // 'file' ou 'folder'
  resourceId: varchar("resource_id").notNull(),
  inviterId: varchar("inviter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  inviteeEmail: text("invitee_email").notNull(),
  inviteeUserId: varchar("invitee_user_id").references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("viewer"), // 'viewer' ou 'collaborator'
  status: text("status").notNull().default("pending"), // 'pending', 'accepted', 'declined', 'cancelled'
  token: text("token").notNull().unique(),
  sharedEncryptionKey: text("shared_encryption_key"), // Chave de encriptação partilhada (base64)
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const filePermissions = pgTable("file_permissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fileId: varchar("file_id").notNull().references(() => files.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("viewer"), // 'viewer' ou 'editor'
  grantedBy: varchar("granted_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  sharedEncryptionKey: text("shared_encryption_key"), // Chave de encriptação partilhada (base64)
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const folderPermissions = pgTable("folder_permissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  folderId: varchar("folder_id").notNull().references(() => folders.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("viewer"), // 'viewer' ou 'collaborator'
  grantedBy: varchar("granted_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  sharedEncryptionKey: text("shared_encryption_key"), // Chave de encriptação partilhada (base64)
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const upgradeRequests = pgTable("upgrade_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  currentPlan: text("current_plan").notNull(),
  requestedPlan: text("requested_plan").notNull(),
  requestedExtraGB: integer("requested_extra_gb"), // GB extras solicitados
  totalPrice: integer("total_price"), // Preço total em Kz (GB * 500)
  status: text("status").notNull().default("pending"), // 'pending', 'approved', 'rejected'
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
  fileId: varchar("file_id").notNull().references(() => files.id, { onDelete: "cascade" }),
  chunkIndex: integer("chunk_index").notNull(),
  telegramFileId: text("telegram_file_id").notNull(),
  telegramBotId: text("telegram_bot_id").notNull(),
  chunkSize: bigint("chunk_size", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const uploadSessions = pgTable("upload_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileSize: bigint("file_size", { mode: "number" }).notNull(),
  mimeType: text("mime_type").notNull(),
  totalChunks: integer("total_chunks").notNull(),
  uploadedChunks: integer("uploaded_chunks").notNull().default(0),
  folderId: varchar("folder_id").references(() => folders.id, { onDelete: "set null" }),
  isEncrypted: boolean("is_encrypted").notNull().default(false),
  originalMimeType: text("original_mime_type"),
  originalSize: bigint("original_size", { mode: "number" }),
  status: text("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const uploadChunks = pgTable("upload_chunks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => uploadSessions.id, { onDelete: "cascade" }),
  chunkIndex: integer("chunk_index").notNull(),
  telegramFileId: text("telegram_file_id").notNull(),
  telegramBotId: text("telegram_bot_id").notNull(),
  chunkSize: bigint("chunk_size", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  files: many(files),
  folders: many(folders),
  payments: many(payments),
}));

export const foldersRelations = relations(folders, ({ one, many }) => ({
  user: one(users, {
    fields: [folders.userId],
    references: [users.id],
  }),
  parent: one(folders, {
    fields: [folders.parentId],
    references: [folders.id],
  }),
  children: many(folders),
  files: many(files),
}));

export const filesRelations = relations(files, ({ one }) => ({
  user: one(users, {
    fields: [files.userId],
    references: [users.id],
  }),
  folder: one(folders, {
    fields: [files.folderId],
    references: [folders.id],
  }),
  share: one(shares, {
    fields: [files.sharedLinkId],
    references: [shares.id],
  }),
}));

export const sharesRelations = relations(shares, ({ one }) => ({
  file: one(files, {
    fields: [shares.fileId],
    references: [files.id],
  }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  user: one(users, {
    fields: [payments.userId],
    references: [users.id],
  }),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
  inviter: one(users, {
    fields: [invitations.inviterId],
    references: [users.id],
  }),
  invitee: one(users, {
    fields: [invitations.inviteeUserId],
    references: [users.id],
  }),
}));

export const filePermissionsRelations = relations(filePermissions, ({ one }) => ({
  file: one(files, {
    fields: [filePermissions.fileId],
    references: [files.id],
  }),
  user: one(users, {
    fields: [filePermissions.userId],
    references: [users.id],
  }),
  granter: one(users, {
    fields: [filePermissions.grantedBy],
    references: [users.id],
  }),
}));

export const folderPermissionsRelations = relations(folderPermissions, ({ one }) => ({
  folder: one(folders, {
    fields: [folderPermissions.folderId],
    references: [folders.id],
  }),
  user: one(users, {
    fields: [folderPermissions.userId],
    references: [users.id],
  }),
  granter: one(users, {
    fields: [folderPermissions.grantedBy],
    references: [users.id],
  }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  storageLimit: true,
  storageUsed: true,
}).extend({
  email: z.string().email(),
  passwordHash: z.string().min(6),
  nome: z.string().min(2),
  encryptionSalt: z.string().optional(),
});

export const insertFolderSchema = createInsertSchema(folders).omit({
  id: true,
  createdAt: true,
});

export const insertFileSchema = createInsertSchema(files).omit({
  id: true,
  createdAt: true,
  isDeleted: true,
  deletedAt: true,
  sharedLinkId: true,
}).extend({
  isEncrypted: z.boolean().optional(),
  originalMimeType: z.string().optional(),
  originalSize: z.number().optional(),
});

export const insertShareSchema = createInsertSchema(shares).omit({
  id: true,
  createdAt: true,
  downloadCount: true,
});

export const insertPaymentSchema = createInsertSchema(payments).omit({
  id: true,
  createdAt: true,
  status: true,
});

export const insertInvitationSchema = createInsertSchema(invitations).omit({
  id: true,
  createdAt: true,
  inviteeUserId: true,
  status: true,
});

export const insertFilePermissionSchema = createInsertSchema(filePermissions).omit({
  id: true,
  createdAt: true,
}).extend({
  sharedEncryptionKey: z.string().optional(),
});

export const insertFolderPermissionSchema = createInsertSchema(folderPermissions).omit({
  id: true,
  createdAt: true,
});

export const insertUpgradeRequestSchema = createInsertSchema(upgradeRequests).omit({
  id: true,
  createdAt: true,
  status: true,
  processedAt: true,
  adminNote: true,
});

export const insertFileChunkSchema = createInsertSchema(fileChunks).omit({
  id: true,
  createdAt: true,
});

export const insertUploadSessionSchema = createInsertSchema(uploadSessions).omit({
  id: true,
  createdAt: true,
  uploadedChunks: true,
  status: true,
});

export const insertUploadChunkSchema = createInsertSchema(uploadChunks).omit({
  id: true,
  createdAt: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Folder = typeof folders.$inferSelect;
export type InsertFolder = z.infer<typeof insertFolderSchema>;

export type File = typeof files.$inferSelect;
export type InsertFile = z.infer<typeof insertFileSchema>;

export type Share = typeof shares.$inferSelect;
export type InsertShare = z.infer<typeof insertShareSchema>;

export type Payment = typeof payments.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;

export type Invitation = typeof invitations.$inferSelect;
export type InsertInvitation = z.infer<typeof insertInvitationSchema>;

export type FilePermission = typeof filePermissions.$inferSelect;
export type InsertFilePermission = z.infer<typeof insertFilePermissionSchema>;

export type FolderPermission = typeof folderPermissions.$inferSelect;
export type InsertFolderPermission = z.infer<typeof insertFolderPermissionSchema>;

export type UpgradeRequest = typeof upgradeRequests.$inferSelect;
export type InsertUpgradeRequest = z.infer<typeof insertUpgradeRequestSchema>;

export type FileChunk = typeof fileChunks.$inferSelect;
export type InsertFileChunk = z.infer<typeof insertFileChunkSchema>;

export type UploadSession = typeof uploadSessions.$inferSelect;
export type InsertUploadSession = z.infer<typeof insertUploadSessionSchema>;

export type UploadChunk = typeof uploadChunks.$inferSelect;
export type InsertUploadChunk = z.infer<typeof insertUploadChunkSchema>;
