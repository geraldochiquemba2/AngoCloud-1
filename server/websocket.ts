import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";
import { log } from "./index";

interface WebSocketClient extends WebSocket {
  userId?: string;
  isAdmin?: boolean;
  isAlive?: boolean;
}

interface BroadcastMessage {
  type: string;
  data: any;
  timestamp: number;
}

class WebSocketManager {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, Set<WebSocketClient>> = new Map();
  private adminClients: Set<WebSocketClient> = new Set();
  private pingInterval: NodeJS.Timeout | null = null;

  initialize(server: Server) {
    this.wss = new WebSocketServer({ server, path: "/ws" });

    this.wss.on("connection", (ws: WebSocketClient) => {
      ws.isAlive = true;

      ws.on("pong", () => {
        ws.isAlive = true;
      });

      ws.on("message", (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(ws, message);
        } catch (error) {
          console.error("WebSocket message parse error:", error);
        }
      });

      ws.on("close", () => {
        this.removeClient(ws);
      });

      ws.on("error", (error) => {
        console.error("WebSocket error:", error);
        this.removeClient(ws);
      });
    });

    this.pingInterval = setInterval(() => {
      this.wss?.clients.forEach((ws: WebSocketClient) => {
        if (ws.isAlive === false) {
          this.removeClient(ws);
          return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);

    log("WebSocket server initialized", "websocket");
  }

  private handleMessage(ws: WebSocketClient, message: any) {
    switch (message.type) {
      case "auth":
        ws.userId = message.userId;
        ws.isAdmin = message.isAdmin || false;

        if (ws.userId) {
          if (!this.clients.has(ws.userId)) {
            this.clients.set(ws.userId, new Set());
          }
          this.clients.get(ws.userId)?.add(ws);
        }

        if (ws.isAdmin) {
          this.adminClients.add(ws);
        }

        ws.send(JSON.stringify({ type: "auth_success", timestamp: Date.now() }));
        log(`Client authenticated: userId=${ws.userId}, isAdmin=${ws.isAdmin}`, "websocket");
        break;

      case "ping":
        ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
        break;
    }
  }

  private removeClient(ws: WebSocketClient) {
    if (ws.userId && this.clients.has(ws.userId)) {
      this.clients.get(ws.userId)?.delete(ws);
      if (this.clients.get(ws.userId)?.size === 0) {
        this.clients.delete(ws.userId);
      }
    }
    this.adminClients.delete(ws);
  }

  private sendToClient(ws: WebSocketClient, message: BroadcastMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  broadcastToUser(userId: string, type: string, data: any) {
    const message: BroadcastMessage = { type, data, timestamp: Date.now() };
    const userClients = this.clients.get(userId);
    if (userClients) {
      userClients.forEach((ws) => this.sendToClient(ws, message));
    }
  }

  broadcastToAdmins(type: string, data: any) {
    const message: BroadcastMessage = { type, data, timestamp: Date.now() };
    this.adminClients.forEach((ws) => this.sendToClient(ws, message));
  }

  broadcastToAll(type: string, data: any) {
    const message: BroadcastMessage = { type, data, timestamp: Date.now() };
    this.wss?.clients.forEach((ws: WebSocketClient) => {
      this.sendToClient(ws, message);
    });
  }

  notifyFileUploaded(userId: string, file: any) {
    this.broadcastToUser(userId, "file_uploaded", file);
  }

  notifyFileDeleted(userId: string, fileId: string) {
    this.broadcastToUser(userId, "file_deleted", { fileId });
  }

  notifyFileRestored(userId: string, fileId: string) {
    this.broadcastToUser(userId, "file_restored", { fileId });
  }

  notifyFolderCreated(userId: string, folder: any) {
    this.broadcastToUser(userId, "folder_created", folder);
  }

  notifyFolderDeleted(userId: string, folderId: string) {
    this.broadcastToUser(userId, "folder_deleted", { folderId });
  }

  notifyUpgradeRequestCreated(userId: string, request: any) {
    this.broadcastToUser(userId, "upgrade_request_created", request);
    this.broadcastToAdmins("new_upgrade_request", request);
  }

  notifyUpgradeRequestProcessed(userId: string, request: any) {
    this.broadcastToUser(userId, "upgrade_request_processed", request);
    this.broadcastToAdmins("upgrade_request_updated", request);
  }

  notifyStorageUpdated(userId: string, storageInfo: { used: number; limit: number }) {
    this.broadcastToUser(userId, "storage_updated", storageInfo);
  }

  notifyInvitationReceived(userId: string, invitation: any) {
    this.broadcastToUser(userId, "invitation_received", invitation);
  }

  notifyShareCreated(userId: string, share: any) {
    this.broadcastToUser(userId, "share_created", share);
  }

  shutdown() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    this.wss?.close();
  }
}

export const wsManager = new WebSocketManager();
