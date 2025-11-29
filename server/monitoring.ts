/**
 * Sistema de Monitorização e Alertas para OrbitalCloud
 * 
 * Monitoriza:
 * - Saúde dos bots Telegram
 * - Rate limits e falhas
 * - Uso de storage por utilizador
 * - Métricas gerais do sistema
 */

interface BotHealthMetric {
  botId: string;
  botName: string;
  isActive: boolean;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  consecutiveFailures: number;
  lastSuccessTime: number | null;
  lastFailureTime: number | null;
  lastFailureReason: string | null;
  avgResponseTimeMs: number;
  rateLimitHits: number;
}

interface SystemMetrics {
  uptime: number;
  startTime: number;
  totalUploads: number;
  totalDownloads: number;
  totalUploadBytes: number;
  totalDownloadBytes: number;
  activeUsers24h: Set<string>;
  errors: Array<{timestamp: number; type: string; message: string}>;
}

interface DailyQuota {
  userId: string;
  date: string;
  uploadsCount: number;
  uploadBytes: number;
  downloadsCount: number;
}

interface Alert {
  id: string;
  type: 'critical' | 'warning' | 'info';
  category: 'bot_health' | 'rate_limit' | 'storage' | 'system';
  message: string;
  timestamp: number;
  resolved: boolean;
  metadata?: Record<string, any>;
}

class MonitoringService {
  private botMetrics: Map<string, BotHealthMetric> = new Map();
  private systemMetrics: SystemMetrics;
  private dailyQuotas: Map<string, DailyQuota> = new Map();
  private alerts: Alert[] = [];
  private alertCallbacks: Array<(alert: Alert) => void> = [];
  
  // Limites de segurança
  public readonly LIMITS = {
    FREE_STORAGE_GB: 5, // Reduzido de 20GB para 5GB inicialmente
    FREE_STORAGE_BYTES: 5 * 1024 * 1024 * 1024,
    MAX_FILE_SIZE_MB: 100, // Máximo 100MB por ficheiro
    MAX_FILE_SIZE_BYTES: 100 * 1024 * 1024,
    DAILY_UPLOAD_LIMIT_FREE: 20, // Máximo 20 uploads por dia (grátis)
    DAILY_UPLOAD_BYTES_FREE: 1 * 1024 * 1024 * 1024, // 1GB por dia (grátis)
    MAX_USERS_BETA: 1000, // Limite de utilizadores em beta
    BOT_FAILURE_THRESHOLD: 3, // Após 3 falhas consecutivas, alerta
    RATE_LIMIT_COOLDOWN_MS: 60000, // 1 minuto cooldown após rate limit
  } as const;

  constructor() {
    this.systemMetrics = {
      uptime: 0,
      startTime: Date.now(),
      totalUploads: 0,
      totalDownloads: 0,
      totalUploadBytes: 0,
      totalDownloadBytes: 0,
      activeUsers24h: new Set(),
      errors: [],
    };

    // Limpar quotas diárias à meia-noite
    this.scheduleDailyQuotaReset();
    
    // Limpar alertas antigos periodicamente
    setInterval(() => this.cleanOldAlerts(), 3600000); // 1 hora
  }

  // ========== BOT HEALTH ==========

  public initBot(botId: string, botName: string): void {
    this.botMetrics.set(botId, {
      botId,
      botName,
      isActive: true,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      consecutiveFailures: 0,
      lastSuccessTime: null,
      lastFailureTime: null,
      lastFailureReason: null,
      avgResponseTimeMs: 0,
      rateLimitHits: 0,
    });
  }

  public recordBotRequest(botId: string, success: boolean, responseTimeMs: number, errorReason?: string): void {
    const metric = this.botMetrics.get(botId);
    if (!metric) return;

    metric.totalRequests++;
    
    if (success) {
      metric.successfulRequests++;
      metric.consecutiveFailures = 0;
      metric.lastSuccessTime = Date.now();
      metric.isActive = true;
    } else {
      metric.failedRequests++;
      metric.consecutiveFailures++;
      metric.lastFailureTime = Date.now();
      metric.lastFailureReason = errorReason || 'Unknown error';
      
      // Detectar rate limit
      if (errorReason?.includes('429') || errorReason?.toLowerCase().includes('rate limit')) {
        metric.rateLimitHits++;
        this.createAlert({
          type: 'warning',
          category: 'rate_limit',
          message: `Bot ${metric.botName} atingiu rate limit do Telegram`,
          metadata: { botId, rateLimitHits: metric.rateLimitHits },
        });
      }
      
      // Alertar se muitas falhas consecutivas
      if (metric.consecutiveFailures >= this.LIMITS.BOT_FAILURE_THRESHOLD) {
        metric.isActive = false;
        this.createAlert({
          type: 'critical',
          category: 'bot_health',
          message: `Bot ${metric.botName} marcado como inativo após ${metric.consecutiveFailures} falhas consecutivas`,
          metadata: { botId, consecutiveFailures: metric.consecutiveFailures, lastError: errorReason },
        });
      }
    }

    // Atualizar média de tempo de resposta (rolling average)
    const alpha = 0.1; // Fator de suavização
    metric.avgResponseTimeMs = metric.avgResponseTimeMs * (1 - alpha) + responseTimeMs * alpha;
  }

  public getBotHealth(): BotHealthMetric[] {
    return Array.from(this.botMetrics.values());
  }

  public getActiveBotCount(): number {
    return Array.from(this.botMetrics.values()).filter(b => b.isActive).length;
  }

  public getTotalBotCount(): number {
    return this.botMetrics.size;
  }

  // ========== QUOTAS DIÁRIAS ==========

  private getQuotaKey(userId: string): string {
    const today = new Date().toISOString().split('T')[0];
    return `${userId}:${today}`;
  }

  public getUserDailyQuota(userId: string): DailyQuota {
    const key = this.getQuotaKey(userId);
    let quota = this.dailyQuotas.get(key);
    
    if (!quota) {
      quota = {
        userId,
        date: new Date().toISOString().split('T')[0],
        uploadsCount: 0,
        uploadBytes: 0,
        downloadsCount: 0,
      };
      this.dailyQuotas.set(key, quota);
    }
    
    return quota;
  }

  public canUpload(userId: string, fileSize: number, userPlan: string = 'gratis'): { allowed: boolean; reason?: string } {
    // Verificar tamanho máximo do ficheiro
    if (fileSize > this.LIMITS.MAX_FILE_SIZE_BYTES) {
      return {
        allowed: false,
        reason: `Ficheiro excede o tamanho máximo permitido (${this.LIMITS.MAX_FILE_SIZE_MB}MB)`,
      };
    }

    // Para planos grátis, verificar quota diária
    if (userPlan === 'gratis') {
      const quota = this.getUserDailyQuota(userId);
      
      if (quota.uploadsCount >= this.LIMITS.DAILY_UPLOAD_LIMIT_FREE) {
        return {
          allowed: false,
          reason: `Limite diário de uploads atingido (${this.LIMITS.DAILY_UPLOAD_LIMIT_FREE} ficheiros). Volta amanhã ou faz upgrade.`,
        };
      }
      
      if (quota.uploadBytes + fileSize > this.LIMITS.DAILY_UPLOAD_BYTES_FREE) {
        const remainingMB = Math.floor((this.LIMITS.DAILY_UPLOAD_BYTES_FREE - quota.uploadBytes) / 1024 / 1024);
        return {
          allowed: false,
          reason: `Limite diário de dados atingido. Restam ${remainingMB}MB hoje. Volta amanhã ou faz upgrade.`,
        };
      }
    }

    return { allowed: true };
  }

  public recordUpload(userId: string, fileSize: number): void {
    const quota = this.getUserDailyQuota(userId);
    quota.uploadsCount++;
    quota.uploadBytes += fileSize;
    
    this.systemMetrics.totalUploads++;
    this.systemMetrics.totalUploadBytes += fileSize;
    this.systemMetrics.activeUsers24h.add(userId);
  }

  public recordDownload(userId: string, fileSize: number): void {
    const quota = this.getUserDailyQuota(userId);
    quota.downloadsCount++;
    
    this.systemMetrics.totalDownloads++;
    this.systemMetrics.totalDownloadBytes += fileSize;
    this.systemMetrics.activeUsers24h.add(userId);
  }

  private scheduleDailyQuotaReset(): void {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const msUntilMidnight = tomorrow.getTime() - now.getTime();
    
    setTimeout(() => {
      this.dailyQuotas.clear();
      console.log('🔄 Quotas diárias resetadas');
      this.scheduleDailyQuotaReset(); // Agendar próximo reset
    }, msUntilMidnight);
  }

  // ========== ALERTAS ==========

  private createAlert(params: Omit<Alert, 'id' | 'timestamp' | 'resolved'>): void {
    const alert: Alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      resolved: false,
      ...params,
    };
    
    this.alerts.push(alert);
    
    // Manter apenas últimos 1000 alertas
    if (this.alerts.length > 1000) {
      this.alerts = this.alerts.slice(-1000);
    }
    
    // Notificar callbacks
    this.alertCallbacks.forEach(cb => {
      try {
        cb(alert);
      } catch (e) {
        console.error('Alert callback error:', e);
      }
    });
    
    // Log para consola
    const emoji = alert.type === 'critical' ? '🚨' : alert.type === 'warning' ? '⚠️' : 'ℹ️';
    console.log(`${emoji} [ALERT] ${alert.category}: ${alert.message}`);
  }

  public onAlert(callback: (alert: Alert) => void): void {
    this.alertCallbacks.push(callback);
  }

  public getAlerts(options?: { unresolved?: boolean; category?: string; limit?: number }): Alert[] {
    let filtered = [...this.alerts];
    
    if (options?.unresolved) {
      filtered = filtered.filter(a => !a.resolved);
    }
    
    if (options?.category) {
      filtered = filtered.filter(a => a.category === options.category);
    }
    
    if (options?.limit) {
      filtered = filtered.slice(-options.limit);
    }
    
    return filtered.reverse(); // Mais recentes primeiro
  }

  public resolveAlert(alertId: string): void {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolved = true;
    }
  }

  private cleanOldAlerts(): void {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    this.alerts = this.alerts.filter(a => 
      a.timestamp > oneDayAgo || (!a.resolved && a.type === 'critical')
    );
  }

  // ========== ERROS ==========

  public recordError(type: string, message: string): void {
    this.systemMetrics.errors.push({
      timestamp: Date.now(),
      type,
      message,
    });
    
    // Manter apenas últimos 100 erros
    if (this.systemMetrics.errors.length > 100) {
      this.systemMetrics.errors = this.systemMetrics.errors.slice(-100);
    }
  }

  // ========== STATUS GERAL ==========

  public getSystemStatus(): {
    status: 'healthy' | 'degraded' | 'critical';
    uptime: number;
    bots: { active: number; total: number; health: string };
    metrics: {
      totalUploads: number;
      totalDownloads: number;
      activeUsers24h: number;
      unresolvedAlerts: number;
    };
    limits: MonitoringService['LIMITS'];
  } {
    const activeBots = this.getActiveBotCount();
    const totalBots = this.getTotalBotCount();
    const unresolvedCritical = this.alerts.filter(a => !a.resolved && a.type === 'critical').length;
    
    let status: 'healthy' | 'degraded' | 'critical' = 'healthy';
    let botHealth = 'OK';
    
    if (totalBots === 0) {
      status = 'critical';
      botHealth = 'Nenhum bot configurado';
    } else if (activeBots === 0) {
      status = 'critical';
      botHealth = 'Todos os bots inativos';
    } else if (activeBots < totalBots * 0.5) {
      status = 'degraded';
      botHealth = `${activeBots}/${totalBots} bots ativos`;
    } else if (unresolvedCritical > 0) {
      status = 'degraded';
      botHealth = `${activeBots}/${totalBots} bots ativos`;
    } else {
      botHealth = `${activeBots}/${totalBots} bots ativos`;
    }
    
    return {
      status,
      uptime: Date.now() - this.systemMetrics.startTime,
      bots: {
        active: activeBots,
        total: totalBots,
        health: botHealth,
      },
      metrics: {
        totalUploads: this.systemMetrics.totalUploads,
        totalDownloads: this.systemMetrics.totalDownloads,
        activeUsers24h: this.systemMetrics.activeUsers24h.size,
        unresolvedAlerts: this.alerts.filter(a => !a.resolved).length,
      },
      limits: this.LIMITS,
    };
  }

  public getDetailedMetrics(): {
    system: SystemMetrics;
    bots: BotHealthMetric[];
    recentAlerts: Alert[];
    recentErrors: Array<{timestamp: number; type: string; message: string}>;
  } {
    return {
      system: {
        ...this.systemMetrics,
        uptime: Date.now() - this.systemMetrics.startTime,
        activeUsers24h: new Set(this.systemMetrics.activeUsers24h), // Clone
      },
      bots: this.getBotHealth(),
      recentAlerts: this.getAlerts({ limit: 50 }),
      recentErrors: this.systemMetrics.errors.slice(-50).reverse(),
    };
  }
}

// Singleton
export const monitoringService = new MonitoringService();
