export interface StorageProvider {
  name: string;
  isAvailable(): boolean;
  uploadFile(buffer: Buffer, filename: string): Promise<UploadResult>;
  downloadFile(fileId: string): Promise<Buffer>;
  getDownloadUrl(fileId: string): Promise<string>;
  deleteFile(fileId: string): Promise<boolean>;
  getQuota(): Promise<QuotaInfo | null>;
}

export interface UploadResult {
  fileId: string;
  provider: string;
  isChunked: boolean;
  totalChunks: number;
  chunks: ChunkInfo[];
}

export interface ChunkInfo {
  chunkIndex: number;
  fileId: string;
  chunkSize: number;
  providerId?: string;
}

export interface QuotaInfo {
  used: number;
  limit: number;
  remaining: number;
}

export const STORAGE_PROVIDERS = {
  TELEGRAM: 'telegram',
  R2: 'cloudflare_r2',
  B2: 'backblaze_b2',
  LOCAL: 'local',
} as const;

export type StorageProviderType = typeof STORAGE_PROVIDERS[keyof typeof STORAGE_PROVIDERS];

export interface StorageConfig {
  primary: StorageProviderType;
  fallback: StorageProviderType[];
  replicationEnabled: boolean;
}

export const DEFAULT_STORAGE_CONFIG: StorageConfig = {
  primary: STORAGE_PROVIDERS.TELEGRAM,
  fallback: [],
  replicationEnabled: false,
};

export class TelegramStorageProvider implements StorageProvider {
  name = 'Telegram Bot API';
  private telegramService: any = null;

  async initialize(): Promise<void> {
    try {
      const { telegramService } = await import('./telegram');
      this.telegramService = telegramService;
    } catch (e) {
      console.error('Failed to initialize Telegram storage provider:', e);
    }
  }

  isAvailable(): boolean {
    return this.telegramService?.isAvailable() ?? false;
  }

  async uploadFile(buffer: Buffer, filename: string): Promise<UploadResult> {
    if (!this.telegramService) {
      await this.initialize();
    }
    
    if (!this.isAvailable()) {
      throw new Error('Telegram storage not available');
    }

    const result = await this.telegramService.uploadLargeFile(buffer, filename);
    
    return {
      fileId: result.chunks[0].fileId,
      provider: STORAGE_PROVIDERS.TELEGRAM,
      isChunked: result.isChunked,
      totalChunks: result.chunks.length,
      chunks: result.chunks.map((chunk: any) => ({
        chunkIndex: chunk.chunkIndex,
        fileId: chunk.fileId,
        chunkSize: chunk.chunkSize,
        providerId: chunk.botId,
      })),
    };
  }

  async downloadFile(fileId: string): Promise<Buffer> {
    if (!this.telegramService) {
      await this.initialize();
    }
    
    if (!this.isAvailable()) {
      throw new Error('Telegram storage not available');
    }

    const botStatus = this.telegramService.getBotStatus();
    if (!botStatus.length) {
      throw new Error('No Telegram bots available');
    }

    return await this.telegramService.downloadFile(fileId, botStatus[0].botId);
  }

  async getDownloadUrl(fileId: string): Promise<string> {
    if (!this.telegramService) {
      await this.initialize();
    }
    
    if (!this.isAvailable()) {
      throw new Error('Telegram storage not available');
    }

    const botStatus = this.telegramService.getBotStatus();
    if (!botStatus.length) {
      throw new Error('No Telegram bots available');
    }

    return await this.telegramService.getDownloadUrl(fileId, botStatus[0].botId);
  }

  async deleteFile(fileId: string): Promise<boolean> {
    return true;
  }

  async getQuota(): Promise<QuotaInfo | null> {
    return null;
  }
}

export class CloudflareR2Provider implements StorageProvider {
  name = 'Cloudflare R2';
  private accountId: string | null = null;
  private accessKeyId: string | null = null;
  private secretAccessKey: string | null = null;
  private bucketName: string | null = null;

  constructor() {
    this.accountId = process.env.R2_ACCOUNT_ID || null;
    this.accessKeyId = process.env.R2_ACCESS_KEY_ID || null;
    this.secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || null;
    this.bucketName = process.env.R2_BUCKET_NAME || null;
  }

  isAvailable(): boolean {
    return !!(this.accountId && this.accessKeyId && this.secretAccessKey && this.bucketName);
  }

  async uploadFile(buffer: Buffer, filename: string): Promise<UploadResult> {
    if (!this.isAvailable()) {
      throw new Error('Cloudflare R2 not configured');
    }
    throw new Error('Cloudflare R2 upload not yet implemented');
  }

  async downloadFile(fileId: string): Promise<Buffer> {
    if (!this.isAvailable()) {
      throw new Error('Cloudflare R2 not configured');
    }
    throw new Error('Cloudflare R2 download not yet implemented');
  }

  async getDownloadUrl(fileId: string): Promise<string> {
    if (!this.isAvailable()) {
      throw new Error('Cloudflare R2 not configured');
    }
    throw new Error('Cloudflare R2 presigned URL not yet implemented');
  }

  async deleteFile(fileId: string): Promise<boolean> {
    if (!this.isAvailable()) {
      throw new Error('Cloudflare R2 not configured');
    }
    throw new Error('Cloudflare R2 delete not yet implemented');
  }

  async getQuota(): Promise<QuotaInfo | null> {
    return null;
  }
}

export class BackblazeB2Provider implements StorageProvider {
  name = 'Backblaze B2';
  private applicationKeyId: string | null = null;
  private applicationKey: string | null = null;
  private bucketId: string | null = null;

  constructor() {
    this.applicationKeyId = process.env.B2_APPLICATION_KEY_ID || null;
    this.applicationKey = process.env.B2_APPLICATION_KEY || null;
    this.bucketId = process.env.B2_BUCKET_ID || null;
  }

  isAvailable(): boolean {
    return !!(this.applicationKeyId && this.applicationKey && this.bucketId);
  }

  async uploadFile(buffer: Buffer, filename: string): Promise<UploadResult> {
    if (!this.isAvailable()) {
      throw new Error('Backblaze B2 not configured');
    }
    throw new Error('Backblaze B2 upload not yet implemented');
  }

  async downloadFile(fileId: string): Promise<Buffer> {
    if (!this.isAvailable()) {
      throw new Error('Backblaze B2 not configured');
    }
    throw new Error('Backblaze B2 download not yet implemented');
  }

  async getDownloadUrl(fileId: string): Promise<string> {
    if (!this.isAvailable()) {
      throw new Error('Backblaze B2 not configured');
    }
    throw new Error('Backblaze B2 presigned URL not yet implemented');
  }

  async deleteFile(fileId: string): Promise<boolean> {
    if (!this.isAvailable()) {
      throw new Error('Backblaze B2 not configured');
    }
    throw new Error('Backblaze B2 delete not yet implemented');
  }

  async getQuota(): Promise<QuotaInfo | null> {
    return null;
  }
}

export class StorageManager {
  private providers: Map<StorageProviderType, StorageProvider> = new Map();
  private config: StorageConfig;

  constructor(config: StorageConfig = DEFAULT_STORAGE_CONFIG) {
    this.config = config;
    this.initializeProviders();
  }

  private initializeProviders() {
    this.providers.set(STORAGE_PROVIDERS.TELEGRAM, new TelegramStorageProvider());
    this.providers.set(STORAGE_PROVIDERS.R2, new CloudflareR2Provider());
    this.providers.set(STORAGE_PROVIDERS.B2, new BackblazeB2Provider());
  }

  getPrimaryProvider(): StorageProvider | null {
    return this.providers.get(this.config.primary) || null;
  }

  getFallbackProviders(): StorageProvider[] {
    return this.config.fallback
      .map(type => this.providers.get(type))
      .filter((p): p is StorageProvider => p !== undefined && p.isAvailable());
  }

  getAvailableProviders(): { type: StorageProviderType; provider: StorageProvider }[] {
    const available: { type: StorageProviderType; provider: StorageProvider }[] = [];
    
    const entries = Array.from(this.providers.entries());
    for (const [type, provider] of entries) {
      if (provider.isAvailable()) {
        available.push({ type, provider });
      }
    }
    
    return available;
  }

  async uploadWithFallback(buffer: Buffer, filename: string): Promise<UploadResult & { usedProvider: StorageProviderType }> {
    const primary = this.getPrimaryProvider();
    
    if (primary && primary.isAvailable()) {
      try {
        const result = await primary.uploadFile(buffer, filename);
        return { ...result, usedProvider: this.config.primary };
      } catch (error) {
        console.error(`Primary storage (${this.config.primary}) failed:`, error);
      }
    }

    for (const fallbackType of this.config.fallback) {
      const fallback = this.providers.get(fallbackType);
      if (fallback && fallback.isAvailable()) {
        try {
          const result = await fallback.uploadFile(buffer, filename);
          return { ...result, usedProvider: fallbackType };
        } catch (error) {
          console.error(`Fallback storage (${fallbackType}) failed:`, error);
        }
      }
    }

    throw new Error('No storage providers available');
  }

  getStatus(): {
    primary: { type: StorageProviderType; available: boolean; name: string };
    fallbacks: { type: StorageProviderType; available: boolean; name: string }[];
  } {
    const primary = this.providers.get(this.config.primary);
    
    return {
      primary: {
        type: this.config.primary,
        available: primary?.isAvailable() ?? false,
        name: primary?.name ?? 'Unknown',
      },
      fallbacks: this.config.fallback.map(type => {
        const provider = this.providers.get(type);
        return {
          type,
          available: provider?.isAvailable() ?? false,
          name: provider?.name ?? 'Unknown',
        };
      }),
    };
  }
}

export const storageManager = new StorageManager();
