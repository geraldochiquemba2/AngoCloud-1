/**
 * Telegram Bot Service para AngoCloud com Retry/Fallback Robusto
 * 
 * Este serviço gerencia o upload e download de arquivos usando a Telegram Bot API
 * como backend de armazenamento. Suporta múltiplos bots com:
 * - Retry com exponential backoff
 * - Fallback automático entre bots
 * - Health checks
 * - Logging detalhado
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

const CHUNK_SIZE = 19 * 1024 * 1024; // 19MB per chunk (Telegram download limit is 20MB)
const MAX_SINGLE_FILE_SIZE = 48 * 1024 * 1024; // 48MB - files larger than this will be chunked

interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

interface CachedUrl {
  url: string;
  expiresAt: number;
}

import crypto from "crypto";

class TelegramService {
  private bots: TelegramBot[] = [];
  private currentBotIndex: number = 0;
  private retryConfig: RetryConfig = {
    maxRetries: 5,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
  };
  private urlCache: Map<string, CachedUrl> = new Map();
  private cacheHits: number = 0;
  private cacheMisses: number = 0;

  constructor() {
    this.loadBotsFromEnv();
  }

  /**
   * Carrega bots configurados nas variáveis de ambiente
   */
  private loadBotsFromEnv() {
    const envBots: TelegramBot[] = [];
    
    for (let i = 1; i <= 10; i++) {
      const token = process.env[`TELEGRAM_BOT_${i}_TOKEN`];
      if (token) {
        envBots.push({
          id: `bot_${i}`,
          token,
          name: `AngoCloud Bot ${i}`,
          active: true,
          failureCount: 0,
          lastFailureTime: 0,
          consecutiveFailures: 0,
        });
      }
    }

    this.bots = envBots;
    
    if (this.bots.length === 0) {
      console.warn("⚠️  Nenhum bot Telegram configurado. Upload de arquivos não funcionará.");
      console.warn("   Configure TELEGRAM_BOT_1_TOKEN, TELEGRAM_BOT_2_TOKEN, etc.");
    } else {
      console.log(`✅ ${this.bots.length} bot(s) Telegram carregados com retry/fallback`);
    }
  }

  /**
   * Aguarda com base em exponential backoff
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Calcula delay com exponential backoff
   */
  private calculateBackoffDelay(attempt: number): number {
    const delay = Math.min(
      this.retryConfig.initialDelayMs * Math.pow(this.retryConfig.backoffMultiplier, attempt),
      this.retryConfig.maxDelayMs
    );
    // Adiciona jitter para evitar thundering herd
    return delay + Math.random() * (delay * 0.1);
  }

  /**
   * Seleciona o próximo bot disponível com health check
   */
  private getNextAvailableBot(): TelegramBot | null {
    if (this.bots.length === 0) {
      return null;
    }

    // Filtra bots com base na saúde
    const activeBots = this.bots.filter(bot => {
      if (!bot.active) return false;
      
      // Se o bot falhou recentemente, verifica se pode tentar de novo
      if (bot.consecutiveFailures > 0) {
        const timeSinceLastFailure = Date.now() - bot.lastFailureTime;
        const recoveryTime = 60000 * bot.consecutiveFailures; // 1 min * falhas consecutivas
        
        if (timeSinceLastFailure < recoveryTime) {
          return false; // Bot em período de recovery
        }
        
        // Reseta contador se passou tempo suficiente
        console.log(`🔄 Bot ${bot.name} tentando se recuperar...`);
        bot.consecutiveFailures = 0;
      }
      
      return true;
    });

    if (activeBots.length === 0) {
      console.warn("⚠️  Nenhum bot disponível! Tentando usar bot com falhas...");
      // Último recurso: tenta usar qualquer bot
      const anyBot = this.bots[this.currentBotIndex % this.bots.length];
      this.currentBotIndex++;
      return anyBot;
    }

    // Seleciona bot com round-robin entre os disponíveis
    const bot = activeBots[this.currentBotIndex % activeBots.length];
    this.currentBotIndex++;
    return bot;
  }

  /**
   * Registra falha de um bot
   */
  private recordBotFailure(bot: TelegramBot, error: any): void {
    bot.failureCount++;
    bot.consecutiveFailures++;
    bot.lastFailureTime = Date.now();
    
    console.error(`❌ Bot ${bot.name} falhou (tentativa ${bot.consecutiveFailures}):`, 
      error?.message || error);
    
    // Marca bot como inativo após 5 falhas consecutivas
    if (bot.consecutiveFailures >= 5) {
      bot.active = false;
      console.error(`🔴 Bot ${bot.name} marcado como inativo após ${bot.consecutiveFailures} falhas`);
    }
  }

  /**
   * Registra sucesso de um bot
   */
  private recordBotSuccess(bot: TelegramBot): void {
    if (bot.consecutiveFailures > 0) {
      console.log(`✅ Bot ${bot.name} recuperado! Falhas consecutivas resetadas.`);
    }
    bot.consecutiveFailures = 0;
  }

  /**
   * Verifica se o serviço está disponível
   */
  public isAvailable(): boolean {
    return this.bots.length > 0 && this.bots.some(b => b.active || b.consecutiveFailures < 5);
  }

  /**
   * Obtém status dos bots para monitoramento
   */
  public getBotStatus(): Array<{id: string; name: string; active: boolean; failures: number}> {
    return this.bots.map(b => ({
      id: b.id,
      name: b.name,
      active: b.active,
      failures: b.failureCount,
    }));
  }

  /**
   * Faz upload com retry automático
   */
  public async uploadFile(fileBuffer: Buffer, fileName: string): Promise<UploadResult> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      const bot = this.getNextAvailableBot();
      
      if (!bot) {
        throw new Error("Nenhum bot Telegram disponível para upload");
      }

      try {
        console.log(`📤 Upload tentativa ${attempt + 1}/${this.retryConfig.maxRetries + 1} com ${bot.name}`);
        
        const result = await this.uploadFileToBot(bot, fileBuffer, fileName);
        this.recordBotSuccess(bot);
        
        console.log(`✅ Upload bem-sucedido com ${bot.name}`);
        return result;
      } catch (error) {
        lastError = error as Error;
        this.recordBotFailure(bot, error);

        if (attempt < this.retryConfig.maxRetries) {
          const delay = this.calculateBackoffDelay(attempt);
          console.log(`⏳ Aguardando ${Math.round(delay)}ms antes de nova tentativa...`);
          await this.sleep(delay);
        }
      }
    }

    throw new Error(`Falha ao fazer upload após ${this.retryConfig.maxRetries + 1} tentativas: ${lastError?.message}`);
  }

  /**
   * Faz upload de ficheiros grandes dividindo em chunks
   * Suporta ficheiros até 2GB
   */
  public async uploadLargeFile(fileBuffer: Buffer, fileName: string): Promise<ChunkUploadResult> {
    const fileSize = fileBuffer.length;
    
    // Se ficheiro for pequeno, usa upload normal
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

    // Divide ficheiro em chunks
    const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);
    console.log(`📦 Ficheiro grande (${(fileSize / 1024 / 1024).toFixed(2)}MB) - dividindo em ${totalChunks} partes`);
    
    const chunks: ChunkUploadResult['chunks'] = [];
    
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, fileSize);
      const chunkBuffer = fileBuffer.subarray(start, end);
      const chunkFileName = `${fileName}.part${i.toString().padStart(4, '0')}`;
      
      console.log(`📤 Enviando parte ${i + 1}/${totalChunks} (${(chunkBuffer.length / 1024 / 1024).toFixed(2)}MB)`);
      
      const result = await this.uploadFile(chunkBuffer, chunkFileName);
      
      chunks.push({
        chunkIndex: i,
        fileId: result.fileId,
        botId: result.botId,
        chunkSize: chunkBuffer.length,
      });
    }
    
    console.log(`✅ Upload de ficheiro grande concluído: ${totalChunks} partes enviadas`);
    
    return {
      chunks,
      isChunked: true,
    };
  }

  /**
   * Download de ficheiro grande (com chunks) - versão com validação
   * Para ficheiros pequenos/médios onde carregar em memória é aceitável
   */
  public async downloadLargeFile(chunks: Array<{fileId: string; botId: string; chunkIndex: number; chunkSize?: number}>): Promise<Buffer> {
    if (chunks.length === 0) {
      throw new Error("Nenhum chunk fornecido para download");
    }

    // Ordena chunks pelo índice
    const sortedChunks = [...chunks].sort((a, b) => a.chunkIndex - b.chunkIndex);
    
    // Valida que os índices são sequenciais
    for (let i = 0; i < sortedChunks.length; i++) {
      if (sortedChunks[i].chunkIndex !== i) {
        throw new Error(`Índice de chunk em falta: esperado ${i}, encontrado ${sortedChunks[i].chunkIndex}`);
      }
    }
    
    console.log(`📥 Descarregando ficheiro grande: ${sortedChunks.length} partes`);
    
    const buffers: Buffer[] = [];
    
    for (const chunk of sortedChunks) {
      try {
        console.log(`📥 Descarregando parte ${chunk.chunkIndex + 1}/${sortedChunks.length}`);
        const buffer = await this.downloadFile(chunk.fileId, chunk.botId);
        
        // Valida que o buffer não está vazio
        if (!buffer || buffer.length === 0) {
          throw new Error(`Chunk ${chunk.chunkIndex} retornou vazio`);
        }
        
        // Valida tamanho se disponível
        if (chunk.chunkSize !== undefined && buffer.length !== chunk.chunkSize) {
          console.warn(`⚠️ Tamanho do chunk ${chunk.chunkIndex} difere: esperado ${chunk.chunkSize}, recebido ${buffer.length}`);
        }
        
        buffers.push(buffer);
      } catch (error) {
        console.error(`❌ Falha ao descarregar chunk ${chunk.chunkIndex}:`, error);
        throw new Error(`Falha ao descarregar chunk ${chunk.chunkIndex}: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
      }
    }
    
    console.log(`✅ Download de ficheiro grande concluído: ${buffers.length} partes`);
    
    return Buffer.concat(buffers);
  }

  /**
   * Generator para streaming de chunks grandes
   * Para ficheiros muito grandes onde não se pode carregar tudo em memória
   */
  public async *streamLargeFile(chunks: Array<{fileId: string; botId: string; chunkIndex: number; chunkSize?: number}>): AsyncGenerator<Buffer> {
    if (chunks.length === 0) {
      throw new Error("Nenhum chunk fornecido para download");
    }

    // Ordena chunks pelo índice
    const sortedChunks = [...chunks].sort((a, b) => a.chunkIndex - b.chunkIndex);
    
    // Valida que os índices são sequenciais
    for (let i = 0; i < sortedChunks.length; i++) {
      if (sortedChunks[i].chunkIndex !== i) {
        throw new Error(`Índice de chunk em falta: esperado ${i}, encontrado ${sortedChunks[i].chunkIndex}`);
      }
    }
    
    console.log(`📥 Streaming ficheiro grande: ${sortedChunks.length} partes`);
    
    for (const chunk of sortedChunks) {
      console.log(`📥 Streaming parte ${chunk.chunkIndex + 1}/${sortedChunks.length}`);
      const buffer = await this.downloadFile(chunk.fileId, chunk.botId);
      
      if (!buffer || buffer.length === 0) {
        throw new Error(`Chunk ${chunk.chunkIndex} retornou vazio`);
      }
      
      yield buffer;
    }
    
    console.log(`✅ Streaming de ficheiro grande concluído`);
  }

  /**
   * Gera um nome de ficheiro ofuscado para segurança
   * Mantém apenas a extensão para compatibilidade
   */
  private generateObfuscatedFileName(originalFileName: string): string {
    const randomId = crypto.randomBytes(16).toString('hex');
    const extension = originalFileName.includes('.') 
      ? '.' + originalFileName.split('.').pop()?.toLowerCase() 
      : '';
    return `${randomId}${extension}`;
  }

  /**
   * Upload para um bot específico
   */
  private async uploadFileToBot(bot: TelegramBot, fileBuffer: Buffer, fileName: string): Promise<UploadResult> {
    const chatId = process.env.TELEGRAM_STORAGE_CHAT_ID || bot.id;
    
    // Ofusca o nome do ficheiro para segurança
    const obfuscatedFileName = this.generateObfuscatedFileName(fileName);

    const formData = new FormData();
    const blob = new Blob([fileBuffer], { type: "application/octet-stream" });
    formData.append("document", blob, obfuscatedFileName);
    formData.append("chat_id", chatId);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1800000); // 30 minutes timeout for large files

    try {
      const response = await fetch(
        `https://api.telegram.org/bot${bot.token}/sendDocument`,
        {
          method: "POST",
          body: formData,
          signal: controller.signal,
        }
      );

      const data = await response.json();

      if (!data.ok) {
        // Identifica tipo de erro
        const errorCode = data.error_code;
        if (errorCode === 429) {
          throw new Error(`Rate limit do Telegram (retry-after: ${data.parameters?.retry_after || '?'}s)`);
        } else if (errorCode === 403) {
          throw new Error("Bot banido/removido do Telegram");
        } else if (errorCode === 400) {
          throw new Error(`Erro do cliente: ${data.description}`);
        }
        throw new Error(`Telegram API error: ${data.description || `Code ${errorCode}`}`);
      }

      const fileId = data.result.document.file_id;
      return { fileId, botId: bot.id };
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Download com retry
   */
  public async downloadFile(fileId: string, botId: string): Promise<Buffer> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        console.log(`📥 Download tentativa ${attempt + 1}/${this.retryConfig.maxRetries + 1}`);
        
        const url = await this.fetchDownloadUrl(fileId, botId);
        const buffer = await this.fetchFileBuffer(url);
        
        console.log(`✅ Download bem-sucedido`);
        return buffer;
      } catch (error) {
        lastError = error as Error;

        if (attempt < this.retryConfig.maxRetries) {
          const delay = this.calculateBackoffDelay(attempt);
          console.log(`⏳ Aguardando ${Math.round(delay)}ms antes de nova tentativa...`);
          await this.sleep(delay);
        }
      }
    }

    throw new Error(`Falha ao fazer download após ${this.retryConfig.maxRetries + 1} tentativas: ${lastError?.message}`);
  }

  /**
   * Obtém URL de download com cache e retry automático
   * URLs do Telegram expiram após ~1 hora, então cacheamos por 50 minutos
   */
  public async getDownloadUrl(fileId: string, botId: string): Promise<string> {
    const cacheKey = `${fileId}:${botId}`;
    const cached = this.urlCache.get(cacheKey);
    
    if (cached && cached.expiresAt > Date.now()) {
      this.cacheHits++;
      return cached.url;
    }
    
    this.cacheMisses++;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        const url = await this.fetchDownloadUrl(fileId, botId);
        
        this.urlCache.set(cacheKey, {
          url,
          expiresAt: Date.now() + 50 * 60 * 1000,
        });
        
        return url;
      } catch (error) {
        lastError = error as Error;
        if (attempt < this.retryConfig.maxRetries) {
          const delay = this.calculateBackoffDelay(attempt);
          console.log(`⏳ getDownloadUrl: Aguardando ${Math.round(delay)}ms antes de retry...`);
          await this.sleep(delay);
        }
      }
    }

    throw new Error(`Falha ao obter URL de download após ${this.retryConfig.maxRetries + 1} tentativas: ${lastError?.message}`);
  }

  /**
   * Limpa cache expirado (executar periodicamente)
   */
  public cleanExpiredCache(): number {
    const now = Date.now();
    let cleaned = 0;
    const entries = Array.from(this.urlCache.entries());
    
    for (let i = 0; i < entries.length; i++) {
      const [key, value] = entries[i];
      if (value.expiresAt <= now) {
        this.urlCache.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`🧹 Cache: ${cleaned} URLs expiradas removidas`);
    }
    
    return cleaned;
  }

  /**
   * Obtém estatísticas de cache
   */
  public getCacheStats(): { hits: number; misses: number; size: number; hitRate: string } {
    const total = this.cacheHits + this.cacheMisses;
    const hitRate = total > 0 ? ((this.cacheHits / total) * 100).toFixed(1) : '0.0';
    
    return {
      hits: this.cacheHits,
      misses: this.cacheMisses,
      size: this.urlCache.size,
      hitRate: `${hitRate}%`,
    };
  }

  /**
   * Fetch interno da URL de download
   */
  private async fetchDownloadUrl(fileId: string, botId: string): Promise<string> {
    const bot = this.bots.find(b => b.id === botId);
    
    if (!bot) {
      throw new Error(`Bot ${botId} não encontrado`);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(
        `https://api.telegram.org/bot${bot.token}/getFile?file_id=${fileId}`,
        { signal: controller.signal }
      );

      const data = await response.json();

      if (!data.ok) {
        throw new Error(`Telegram API error: ${data.description || "Unknown error"}`);
      }

      const filePath = data.result.file_path;
      return `https://api.telegram.org/file/bot${bot.token}/${filePath}`;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Faz fetch do arquivo com timeout
   */
  private async fetchFileBuffer(url: string): Promise<Buffer> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1800000); // 30 minutes timeout for large files

    try {
      const response = await fetch(url, { signal: controller.signal });
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Deleta arquivo (nota: Telegram não suporta)
   */
  public async deleteFile(fileId: string, botId: string): Promise<void> {
    console.log(`📋 Arquivo ${fileId} marcado para deleção (Telegram não suporta deleção real)`);
  }
}

// Exporta instância singleton
export const telegramService = new TelegramService();
