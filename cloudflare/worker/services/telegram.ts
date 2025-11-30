/**
 * Telegram Service for Cloudflare Workers
 * 
 * Versão adaptada do serviço Telegram para funcionar em ambiente Workers.
 * Usa Web APIs (fetch) em vez de Node.js APIs.
 */

interface TelegramBot {
  id: string;
  token: string;
  name: string;
  active: boolean;
  failureCount: number;
  lastFailureTime: number;
  consecutiveFailures: number;
}

interface UploadResult {
  fileId: string;
  botId: string;
}

interface ChunkUploadResult {
  chunks: Array<{
    chunkIndex: number;
    fileId: string;
    botId: string;
    chunkSize: number;
  }>;
  isChunked: boolean;
}

const CHUNK_SIZE = 19 * 1024 * 1024; // 19MB per chunk
const MAX_SINGLE_FILE_SIZE = 48 * 1024 * 1024; // 48MB

interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export class TelegramService {
  private bots: TelegramBot[] = [];
  private currentBotIndex: number = 0;
  private retryConfig: RetryConfig = {
    maxRetries: 5,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
  };
  private storageChatId: string = '';

  constructor(env: {
    TELEGRAM_BOT_1_TOKEN?: string;
    TELEGRAM_BOT_2_TOKEN?: string;
    TELEGRAM_BOT_3_TOKEN?: string;
    TELEGRAM_BOT_4_TOKEN?: string;
    TELEGRAM_BOT_5_TOKEN?: string;
    TELEGRAM_BOT_6_TOKEN?: string;
    TELEGRAM_BOT_7_TOKEN?: string;
    TELEGRAM_BOT_8_TOKEN?: string;
    TELEGRAM_BOT_9_TOKEN?: string;
    TELEGRAM_BOT_10_TOKEN?: string;
    TELEGRAM_STORAGE_CHAT_ID?: string;
  }) {
    this.loadBotsFromEnv(env);
    this.storageChatId = env.TELEGRAM_STORAGE_CHAT_ID || '';
  }

  private loadBotsFromEnv(env: Record<string, string | undefined>) {
    const tokens = [
      env.TELEGRAM_BOT_1_TOKEN,
      env.TELEGRAM_BOT_2_TOKEN,
      env.TELEGRAM_BOT_3_TOKEN,
      env.TELEGRAM_BOT_4_TOKEN,
      env.TELEGRAM_BOT_5_TOKEN,
      env.TELEGRAM_BOT_6_TOKEN,
      env.TELEGRAM_BOT_7_TOKEN,
      env.TELEGRAM_BOT_8_TOKEN,
      env.TELEGRAM_BOT_9_TOKEN,
      env.TELEGRAM_BOT_10_TOKEN,
    ];

    tokens.forEach((token, index) => {
      if (token) {
        this.bots.push({
          id: `bot_${index + 1}`,
          token,
          name: `AngoCloud Bot ${index + 1}`,
          active: true,
          failureCount: 0,
          lastFailureTime: 0,
          consecutiveFailures: 0,
        });
      }
    });

    if (this.bots.length === 0) {
      console.warn('⚠️ Nenhum bot Telegram configurado');
    } else {
      console.log(`✅ ${this.bots.length} bot(s) Telegram carregados`);
    }
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private calculateBackoffDelay(attempt: number): number {
    const delay = Math.min(
      this.retryConfig.initialDelayMs * Math.pow(this.retryConfig.backoffMultiplier, attempt),
      this.retryConfig.maxDelayMs
    );
    return delay + Math.random() * (delay * 0.1);
  }

  private getNextAvailableBot(): TelegramBot | null {
    if (this.bots.length === 0) return null;

    const activeBots = this.bots.filter(bot => {
      if (!bot.active) return false;
      
      if (bot.consecutiveFailures > 0) {
        const timeSinceLastFailure = Date.now() - bot.lastFailureTime;
        const recoveryTime = 60000 * bot.consecutiveFailures;
        
        if (timeSinceLastFailure < recoveryTime) {
          return false;
        }
        
        bot.consecutiveFailures = 0;
      }
      
      return true;
    });

    if (activeBots.length === 0) {
      const anyBot = this.bots[this.currentBotIndex % this.bots.length];
      this.currentBotIndex++;
      return anyBot;
    }

    const bot = activeBots[this.currentBotIndex % activeBots.length];
    this.currentBotIndex++;
    return bot;
  }

  private recordBotFailure(bot: TelegramBot, error: any): void {
    bot.failureCount++;
    bot.consecutiveFailures++;
    bot.lastFailureTime = Date.now();
    
    if (bot.consecutiveFailures >= 5) {
      bot.active = false;
    }
  }

  private recordBotSuccess(bot: TelegramBot): void {
    bot.consecutiveFailures = 0;
  }

  public isAvailable(): boolean {
    return this.bots.length > 0 && this.bots.some(b => b.active || b.consecutiveFailures < 5);
  }

  private generateObfuscatedFileName(originalFileName: string): string {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    const randomId = Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
    const extension = originalFileName.includes('.') 
      ? '.' + originalFileName.split('.').pop()?.toLowerCase() 
      : '';
    return `${randomId}${extension}`;
  }

  public async uploadFile(fileBuffer: ArrayBuffer, fileName: string): Promise<UploadResult> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      const bot = this.getNextAvailableBot();
      
      if (!bot) {
        throw new Error('Nenhum bot Telegram disponível para upload');
      }

      try {
        const result = await this.uploadFileToBot(bot, fileBuffer, fileName);
        this.recordBotSuccess(bot);
        return result;
      } catch (error) {
        lastError = error as Error;
        this.recordBotFailure(bot, error);

        if (attempt < this.retryConfig.maxRetries) {
          const delay = this.calculateBackoffDelay(attempt);
          await this.sleep(delay);
        }
      }
    }

    throw new Error(`Falha ao fazer upload após ${this.retryConfig.maxRetries + 1} tentativas: ${lastError?.message}`);
  }

  public async uploadLargeFile(fileBuffer: ArrayBuffer, fileName: string): Promise<ChunkUploadResult> {
    const fileSize = fileBuffer.byteLength;
    
    if (fileSize <= MAX_SINGLE_FILE_SIZE) {
      const result = await this.uploadFile(fileBuffer, fileName);
      return {
        chunks: [{
          chunkIndex: 0,
          fileId: result.fileId,
          botId: result.botId,
          chunkSize: fileSize,
        }],
        isChunked: false,
      };
    }

    const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);
    const chunks: ChunkUploadResult['chunks'] = [];
    
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, fileSize);
      const chunkBuffer = fileBuffer.slice(start, end);
      const chunkFileName = `${fileName}.part${i.toString().padStart(4, '0')}`;
      
      const result = await this.uploadFile(chunkBuffer, chunkFileName);
      
      chunks.push({
        chunkIndex: i,
        fileId: result.fileId,
        botId: result.botId,
        chunkSize: chunkBuffer.byteLength,
      });
    }
    
    return {
      chunks,
      isChunked: true,
    };
  }

  private async uploadFileToBot(bot: TelegramBot, fileBuffer: ArrayBuffer, fileName: string): Promise<UploadResult> {
    const chatId = this.storageChatId || bot.id;
    const obfuscatedFileName = this.generateObfuscatedFileName(fileName);

    const formData = new FormData();
    const blob = new Blob([fileBuffer], { type: 'application/octet-stream' });
    formData.append('document', blob, obfuscatedFileName);
    formData.append('chat_id', chatId);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000); // 25s timeout para Cloudflare (máx 30s)

    try {
      const response = await fetch(
        `https://api.telegram.org/bot${bot.token}/sendDocument`,
        {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        }
      );

      const data: any = await response.json();

      if (!data.ok) {
        const errorCode = data.error_code;
        if (errorCode === 429) {
          throw new Error(`Rate limit do Telegram (retry-after: ${data.parameters?.retry_after || '?'}s)`);
        }
        throw new Error(`Telegram API error: ${data.description || `Code ${errorCode}`}`);
      }

      return { fileId: data.result.document.file_id, botId: bot.id };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  public async downloadFile(fileId: string, botId: string): Promise<ArrayBuffer> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        const url = await this.fetchDownloadUrl(fileId, botId);
        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }

        return await response.arrayBuffer();
      } catch (error) {
        lastError = error as Error;

        if (attempt < this.retryConfig.maxRetries) {
          const delay = this.calculateBackoffDelay(attempt);
          await this.sleep(delay);
        }
      }
    }

    throw new Error(`Falha ao fazer download após ${this.retryConfig.maxRetries + 1} tentativas: ${lastError?.message}`);
  }

  public async getDownloadUrl(fileId: string, botId: string): Promise<string> {
    return this.fetchDownloadUrl(fileId, botId);
  }

  private async fetchDownloadUrl(fileId: string, botId: string): Promise<string> {
    const bot = this.bots.find(b => b.id === botId);
    
    if (!bot) {
      throw new Error(`Bot ${botId} não encontrado`);
    }

    const response = await fetch(
      `https://api.telegram.org/bot${bot.token}/getFile?file_id=${fileId}`
    );

    const data: any = await response.json();

    if (!data.ok) {
      throw new Error(`Telegram API error: ${data.description || 'Unknown error'}`);
    }

    const filePath = data.result.file_path;
    return `https://api.telegram.org/file/bot${bot.token}/${filePath}`;
  }

  public async deleteFile(fileId: string, botId: string): Promise<void> {
    console.log(`📋 Arquivo ${fileId} marcado para deleção (Telegram não suporta deleção real)`);
  }
}
