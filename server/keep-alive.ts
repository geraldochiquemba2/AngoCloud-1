const KEEP_ALIVE_INTERVAL = 14 * 60 * 1000;

let keepAliveTimer: NodeJS.Timeout | null = null;

export function startKeepAlive(port: number, logFn: (msg: string, source?: string) => void): void {
  if (process.env.NODE_ENV !== "production") {
    logFn("Keep-alive desativado em desenvolvimento", "keep-alive");
    return;
  }

  const selfPing = async () => {
    try {
      const url = `http://localhost:${port}/api/health`;
      const response = await fetch(url);
      if (response.ok) {
        logFn("Keep-alive ping successful", "keep-alive");
      }
    } catch (error) {
      logFn(`Keep-alive ping failed: ${error}`, "keep-alive");
    }
  };

  selfPing();

  keepAliveTimer = setInterval(selfPing, KEEP_ALIVE_INTERVAL);

  logFn(`Keep-alive system started (interval: ${KEEP_ALIVE_INTERVAL / 60000} minutes)`, "keep-alive");
}

export function stopKeepAlive(logFn?: (msg: string, source?: string) => void): void {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
    if (logFn) {
      logFn("Keep-alive system stopped", "keep-alive");
    }
  }
}
