import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { telegramService } from "./telegram";
import { storage } from "./storage";
import { startKeepAlive } from "./keep-alive";

const app = express();
const httpServer = createServer(app);

// Compressão gzip para respostas mais rápidas
app.use(compression());

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // Limpeza automática de cache do Telegram a cada 10 minutos
  setInterval(() => {
    telegramService.cleanExpiredCache();
  }, 10 * 60 * 1000);

  // Limpeza automática da lixeira - ficheiros com mais de 15 dias são eliminados
  // Executa uma vez por hora
  const purgeExpiredTrash = async () => {
    try {
      const expiredFiles = await storage.purgeExpiredTrash(15);
      if (expiredFiles.length > 0) {
        log(`🗑️ Limpeza automática: ${expiredFiles.length} ficheiros expirados eliminados da lixeira`);
        
        // Try to delete from Telegram
        for (const file of expiredFiles) {
          if (file.telegramFileId && file.telegramBotId) {
            try {
              await telegramService.deleteFile(file.telegramFileId, file.telegramBotId);
            } catch (telegramError) {
              // Telegram doesn't support deletion, just log
            }
          }
        }
        
        // Update storage for each user whose files were deleted
        const userStorageUpdates: { [userId: string]: number } = {};
        for (const file of expiredFiles) {
          userStorageUpdates[file.userId] = (userStorageUpdates[file.userId] || 0) + file.tamanho;
        }
        for (const [userId, totalSize] of Object.entries(userStorageUpdates)) {
          await storage.updateUserStorage(userId, -totalSize);
        }
      }
    } catch (error) {
      log(`❌ Erro na limpeza automática da lixeira: ${error}`);
    }
  };
  
  // Executar limpeza ao iniciar e depois a cada hora
  purgeExpiredTrash();
  setInterval(purgeExpiredTrash, 60 * 60 * 1000);

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
      log(`🚀 Sistema com retry/fallback e cache ativo`);
      
      // Iniciar sistema de keep-alive para evitar hibernação no Render (plano free)
      startKeepAlive(port, log);
    },
  );
})();
