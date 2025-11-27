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

interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

class TelegramService {
  private bots: TelegramBot[] = [];
  private currentBotIndex: number = 0;
  private retryConfig: RetryConfig = {
    maxRetries: 3,
    initialDelayMs: 500,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
  };

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
   * Upload para um bot específico
   */
  private async uploadFileToBot(bot: TelegramBot, fileBuffer: Buffer, fileName: string): Promise<UploadResult> {
    const chatId = process.env.TELEGRAM_STORAGE_CHAT_ID || bot.id;

    const formData = new FormData();
    const blob = new Blob([fileBuffer], { type: "application/octet-stream" });
    formData.append("document", blob, fileName);
    formData.append("chat_id", chatId);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

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
        
        const url = await this.getDownloadUrl(fileId, botId);
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
   * Obtém URL de download
   */
  private async getDownloadUrl(fileId: string, botId: string): Promise<string> {
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
    const timeout = setTimeout(() => controller.abort(), 30000);

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
