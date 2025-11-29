import { 
  Cloud, Heart, LogOut, Upload, FileText, Share2, Folder, 
  Search, Trash2, Download, MoreVertical, FolderPlus, 
  ArrowLeft, X, Edit, Move, RefreshCw, Link, Copy, Check,
  File, Image, Video, Music, FileCode, FileArchive, Lock,
  Shield, Loader2, AlertTriangle, UserPlus, Mail, Users,
  CheckCircle, XCircle, Clock, FolderOpen, Settings, UserX,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import dashboardBgImage from "@/assets/pexels-steve-29586678_1764345410863.jpg";
import LoadingScreen from "@/components/LoadingScreen";
import { 
  encryptFile, 
  decryptBuffer, 
  getActiveEncryptionKey,
  createDownloadUrl,
  revokeDownloadUrl,
  isEncryptionSupported,
  getStoredEncryptionKey,
  importKey,
  exportKey
} from "@/lib/encryption";

interface FileItem {
  id: string;
  nome: string;
  tamanho: number;
  tipoMime: string;
  createdAt: string;
  folderId: string | null;
  isDeleted: boolean;
  deletedAt: string | null;
  isEncrypted?: boolean;
  originalMimeType?: string | null;
  originalSize?: number | null;
}

interface FolderItem {
  id: string;
  nome: string;
  parentId: string | null;
  createdAt: string;
}

interface ShareItem {
  id: string;
  fileId: string;
  linkCode: string;
  downloadCount: number;
  createdAt: string;
}

interface InvitationItem {
  id: string;
  resourceType: "file" | "folder";
  resourceId: string;
  resourceName: string;
  ownerName: string;
  inviteeEmail: string;
  role: string;
  status: string;
  createdAt: string;
}

interface SharedFileItem extends FileItem {
  ownerName: string;
  ownerEmail: string;
}

interface SharedFolderItem extends FolderItem {
  ownerName: string;
  ownerEmail: string;
  role: string;
}

type ViewMode = "files" | "trash" | "shared";

export default function Dashboard() {
  const [, navigate] = useLocation();
  const { user, logout, refreshUser, needsEncryptionSetup, enableEncryption, hasEncryptionKey, loading: authLoading } = useAuth();
  const isMobile = useIsMobile();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState<FolderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FileItem[] | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("files");
  
  // Upload state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [currentUploadFile, setCurrentUploadFile] = useState<string>("");
  const [uploadFileIndex, setUploadFileIndex] = useState(0);
  const [totalUploadFiles, setTotalUploadFiles] = useState(0);
  const [uploadSpeed, setUploadSpeed] = useState<string>("");
  const [uploadTimeRemaining, setUploadTimeRemaining] = useState<string>("");
  const [currentFileSize, setCurrentFileSize] = useState<number>(0);
  const uploadStartTimeRef = useRef<number>(0);
  const lastProgressRef = useRef<{ time: number; loaded: number }>({ time: 0, loaded: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Folder modal
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  
  // File actions
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [showFileMenu, setShowFileMenu] = useState<string | null>(null);
  const [menuOpenTime, setMenuOpenTime] = useState<number>(0);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [shareSending, setShareSending] = useState(false);
  const [fileShares, setFileShares] = useState<{id: string; email: string; nome: string; role: string; createdAt: string}[]>([]);
  const [sharesLoading, setSharesLoading] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [allFolders, setAllFolders] = useState<FolderItem[]>([]);
  
  // Preview state
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [fileThumbnails, setFileThumbnails] = useState<Record<string, string>>({});
  const [loadingThumbnails, setLoadingThumbnails] = useState<Set<string>>(new Set());
  
  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<FileItem | null>(null);
  
  // Encryption setup
  const [showEncryptionModal, setShowEncryptionModal] = useState(false);
  const [encryptionPassword, setEncryptionPassword] = useState("");
  const [encryptionLoading, setEncryptionLoading] = useState(false);
  
  // Invitations
  const [pendingInvitations, setPendingInvitations] = useState<InvitationItem[]>([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"viewer" | "collaborator">("viewer");
  const [inviteResourceType, setInviteResourceType] = useState<"file" | "folder">("file");
  const [inviteResourceId, setInviteResourceId] = useState("");
  const [inviteResourceName, setInviteResourceName] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [resourceInvitations, setResourceInvitations] = useState<InvitationItem[]>([]);
  const [resourceInvitationsLoading, setResourceInvitationsLoading] = useState(false);
  
  // Shared content
  const [sharedFiles, setSharedFiles] = useState<SharedFileItem[]>([]);
  const [sharedFolders, setSharedFolders] = useState<SharedFolderItem[]>([]);
  const [currentSharedFolderId, setCurrentSharedFolderId] = useState<string | null>(null);
  const [sharedFolderPath, setSharedFolderPath] = useState<SharedFolderItem[]>([]);
  const [sharedFolderFiles, setSharedFolderFiles] = useState<FileItem[]>([]);
  const [sharedFolderFolders, setSharedFolderFolders] = useState<FolderItem[]>([]);
  
  // Plans modal
  const [showPlansModal, setShowPlansModal] = useState(false);
  const [requestingPlan, setRequestingPlan] = useState<string | null>(null);
  
  // Upgrade proof upload modal
  const [showUpgradeProofModal, setShowUpgradeProofModal] = useState(false);
  const [selectedPlanForUpgrade, setSelectedPlanForUpgrade] = useState<string | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [uploadingProof, setUploadingProof] = useState(false);
  const proofInputRef = useRef<HTMLInputElement>(null);
  
  // Upgrade requests tracking
  const [upgradeRequests, setUpgradeRequests] = useState<Array<{id: string; status: string; requestedPlan: string; requestedExtraGB?: number; totalPrice?: number; adminNote?: string; currentPlan: string}>>([]);
  const [showRejectionModal, setShowRejectionModal] = useState(false);
  const [selectedRejection, setSelectedRejection] = useState<{id: string; message?: string; requestedGB?: number; totalPrice?: number} | null>(null);
  const [showApprovedSection, setShowApprovedSection] = useState(true);
  const [showRejectedSection, setShowRejectedSection] = useState(true);
  
  // New pricing model state
  const [requestedExtraGB, setRequestedExtraGB] = useState<number>(10);
  const PRICE_PER_GB = 500; // 500 Kz per GB
  const [showLoading, setShowLoading] = useState(true);
  const [isLogoutLoading, setIsLogoutLoading] = useState(false);

  // Initial load - only run once when user is available
  useEffect(() => {
    // Wait for auth check to complete before redirecting
    if (authLoading) {
      return;
    }
    
    if (!user) {
      navigate("/login");
      return;
    }
    
    const loadInitialData = async () => {
      setShowLoading(true);
      try {
        await Promise.all([
          fetchContent(),
          fetchPendingInvitations(),
          fetchUpgradeRequests(),
        ]);
      } catch (err) {
        console.error("Error loading dashboard:", err);
      } finally {
        setShowLoading(false);
      }
    };
    loadInitialData();
  }, [user, navigate, authLoading]);

  // Reload content when folder or view mode changes (without reloading invitations/upgrades)
  useEffect(() => {
    if (!user) return;
    fetchContent();
  }, [currentFolderId, viewMode]);

  // Handle shared folder navigation
  useEffect(() => {
    if (viewMode === "shared" && currentSharedFolderId) {
      fetchSharedContent();
    }
  }, [currentSharedFolderId]);

  // Close file menu when clicking outside
  useEffect(() => {
    if (!showFileMenu) return;

    const handleClickOutside = () => {
      setShowFileMenu(null);
    };

    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [showFileMenu]);

  const fetchUpgradeRequests = async () => {
    try {
      const response = await fetch("/api/my-upgrade-requests", { credentials: "include" });
      if (response.ok) {
        const data = await response.json();
        setUpgradeRequests(data);
      }
    } catch (err) {
      console.error("Error fetching upgrade requests:", err);
    }
  };

  const fetchPendingInvitations = async () => {
    try {
      const response = await fetch("/api/invitations/pending", { credentials: "include" });
      if (response.ok) {
        const data = await response.json();
        setPendingInvitations(data);
      }
    } catch (err) {
      console.error("Error fetching invitations:", err);
    }
  };

  const fetchSharedContent = async () => {
    try {
      if (currentSharedFolderId) {
        const response = await fetch(`/api/shared/folders/${currentSharedFolderId}/content`, { credentials: "include" });
        if (response.ok) {
          const data = await response.json();
          setSharedFolderFiles(data.files);
          setSharedFolderFolders(data.folders);
        }
      } else {
        const [filesRes, foldersRes] = await Promise.all([
          fetch("/api/shared/files", { credentials: "include" }),
          fetch("/api/shared/folders", { credentials: "include" })
        ]);
        
        if (filesRes.ok) {
          const filesData = await filesRes.json();
          setSharedFiles(filesData);
        }
        if (foldersRes.ok) {
          const foldersData = await foldersRes.json();
          setSharedFolders(foldersData);
        }
      }
    } catch (err) {
      console.error("Error fetching shared content:", err);
    }
  };

  const acceptInvitation = async (invitationId: string) => {
    try {
      const response = await fetch(`/api/invitations/${invitationId}/accept`, {
        method: "POST",
        credentials: "include",
      });
      
      if (response.ok) {
        toast.success("Convite aceite com sucesso!");
        fetchPendingInvitations();
        if (viewMode === "shared") {
          fetchSharedContent();
        }
      } else {
        const error = await response.json();
        toast.error(error.message || "Erro ao aceitar convite");
      }
    } catch (err) {
      console.error("Error accepting invitation:", err);
      toast.error("Erro ao aceitar convite");
    }
  };

  const declineInvitation = async (invitationId: string) => {
    try {
      const response = await fetch(`/api/invitations/${invitationId}/decline`, {
        method: "POST",
        credentials: "include",
      });
      
      if (response.ok) {
        toast.success("Convite recusado");
        fetchPendingInvitations();
      } else {
        const error = await response.json();
        toast.error(error.message || "Erro ao recusar convite");
      }
    } catch (err) {
      console.error("Error declining invitation:", err);
      toast.error("Erro ao recusar convite");
    }
  };

  const sendInvitation = async () => {
    if (!inviteEmail.trim()) {
      toast.error("Por favor, insira um email");
      return;
    }
    
    setInviteLoading(true);
    try {
      // Get encryption key if user has encryption enabled (for sharing encrypted content)
      let sharedEncryptionKey: string | undefined;
      if (user?.encryptionSalt) {
        try {
          const encryptionKey = await getActiveEncryptionKey();
          if (encryptionKey) {
            sharedEncryptionKey = await exportKey(encryptionKey);
          }
        } catch (err) {
          console.log("No encryption key available for sharing");
        }
      }

      const response = await fetch("/api/invitations", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resourceType: inviteResourceType,
          resourceId: inviteResourceId,
          inviteeEmail: inviteEmail,
          role: inviteRole,
          sharedEncryptionKey,
        }),
      });
      
      if (response.ok) {
        toast.success("Convite enviado com sucesso!");
        setShowInviteModal(false);
        setInviteEmail("");
        setInviteRole("viewer");
      } else {
        const error = await response.json();
        toast.error(error.message || "Erro ao enviar convite");
      }
    } catch (err) {
      console.error("Error sending invitation:", err);
      toast.error("Erro ao enviar convite");
    } finally {
      setInviteLoading(false);
    }
  };

  const fetchResourceInvitations = async (type: "file" | "folder", id: string) => {
    setResourceInvitationsLoading(true);
    try {
      const response = await fetch(`/api/invitations/resource/${type}/${id}`, { credentials: "include" });
      if (response.ok) {
        const invitations = await response.json();
        setResourceInvitations(invitations);
      }
    } catch (err) {
      console.error("Error fetching resource invitations:", err);
      setResourceInvitations([]);
    } finally {
      setResourceInvitationsLoading(false);
    }
  };

  const cancelInvitation = async (invitationId: string) => {
    try {
      const response = await fetch(`/api/invitations/${invitationId}`, {
        method: "DELETE",
        credentials: "include",
      });
      
      if (response.ok) {
        toast.success("Convite/acesso removido");
        // Remove from resourceInvitations immediately
        setResourceInvitations(prev => prev.filter(inv => inv.id !== invitationId));
        // Refetch shared content if viewing shared files to update the shared people list
        if (viewMode === "shared") {
          await fetchSharedContent();
        }
      } else {
        const error = await response.json();
        toast.error(error.message || "Erro ao remover convite");
      }
    } catch (err) {
      console.error("Error cancelling invitation:", err);
      toast.error("Erro ao remover convite");
    }
  };

  const updateInvitationRole = async (invitationId: string, newRole: string) => {
    try {
      const response = await fetch(`/api/invitations/${invitationId}/role`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      
      if (response.ok) {
        toast.success("Permissão atualizada");
        setResourceInvitations(prev => prev.map(inv => 
          inv.id === invitationId ? { ...inv, role: newRole } : inv
        ));
      } else {
        const error = await response.json();
        toast.error(error.message || "Erro ao atualizar permissão");
      }
    } catch (err) {
      console.error("Error updating invitation role:", err);
      toast.error("Erro ao atualizar permissão");
    }
  };

  const openInviteModal = (type: "file" | "folder", id: string, name: string) => {
    setInviteResourceType(type);
    setInviteResourceId(id);
    setInviteResourceName(name);
    setInviteEmail("");
    setInviteRole("viewer");
    if (type === "file") {
      fetchFileShares(id);
    }
    fetchResourceInvitations(type, id);
    setShowInviteModal(true);
  };

  const fetchContent = async () => {
    try {
      setLoading(true);
      if (viewMode === "trash") {
        const response = await fetch("/api/files/trash", { credentials: "include" });
        if (response.ok) {
          const data = await response.json();
          setFiles(data);
          setFolders([]);
        }
      } else if (viewMode === "shared") {
        await fetchSharedContent();
      } else {
        const [filesRes, foldersRes] = await Promise.all([
          fetch(`/api/files${currentFolderId ? `?folderId=${currentFolderId}` : ""}`, { credentials: "include" }),
          fetch(`/api/folders${currentFolderId ? `?parentId=${currentFolderId}` : ""}`, { credentials: "include" })
        ]);
        
        if (filesRes.ok && foldersRes.ok) {
          const filesData = await filesRes.json();
          const foldersData = await foldersRes.json();
          setFiles(filesData);
          setFolders(foldersData);
        }
      }
    } catch (err) {
      console.error("Error fetching content:", err);
      toast.error("Erro ao carregar ficheiros");
    } finally {
      setLoading(false);
    }
  };

  const fetchAllFolders = async () => {
    try {
      const response = await fetch("/api/folders", { credentials: "include" });
      if (response.ok) {
        const data = await response.json();
        setAllFolders(data);
      }
    } catch (err) {
      console.error("Error fetching folders:", err);
    }
  };

  const generateVideoThumbnail = useCallback((videoUrl: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement("video");
      video.preload = "auto";
      video.muted = true;
      video.playsInline = true;
      video.crossOrigin = "anonymous";
      video.setAttribute("webkit-playsinline", "true");
      
      const timeoutMs = isMobile ? 15000 : 20000;
      let resolved = false;
      let hasTriedDraw = false;
      
      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          video.src = "";
          reject(new Error("Video load timeout"));
        }
      }, timeoutMs);
      
      const drawThumbnail = () => {
        if (resolved || hasTriedDraw) return;
        
        if (video.videoWidth === 0 || video.videoHeight === 0) {
          return;
        }
        
        hasTriedDraw = true;
        
        setTimeout(() => {
          if (resolved) return;
          resolved = true;
          clearTimeout(timeoutId);
          
          try {
            const canvas = document.createElement("canvas");
            const maxWidth = isMobile ? 200 : 320;
            const maxHeight = isMobile ? 300 : 400;
            const videoWidth = video.videoWidth;
            const videoHeight = video.videoHeight;
            const scale = Math.min(maxWidth / videoWidth, maxHeight / videoHeight);
            canvas.width = Math.round(videoWidth * scale);
            canvas.height = Math.round(videoHeight * scale);
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const quality = isMobile ? 0.7 : 0.8;
              const thumbnailUrl = canvas.toDataURL("image/jpeg", quality);
              video.src = "";
              resolve(thumbnailUrl);
            } else {
              reject(new Error("Could not get canvas context"));
            }
          } catch (err) {
            reject(err);
          }
        }, 100);
      };
      
      video.onloadedmetadata = () => {
        try {
          const seekTime = Math.min(0.5, video.duration * 0.05);
          video.currentTime = seekTime;
        } catch (err) {
          console.error("Error seeking:", err);
        }
      };
      
      video.onseeked = drawThumbnail;
      video.onloadeddata = drawThumbnail;
      
      video.onerror = (e) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutId);
          reject(new Error("Video load error: " + (e as any)?.message));
        }
      };
      
      video.src = videoUrl;
      video.load();
    });
  }, [isMobile]);

  const loadThumbnail = useCallback(async (fileId: string, mimeType: string) => {
    if (fileThumbnails[fileId]) return;
    
    setLoadingThumbnails(prev => new Set(prev).add(fileId));
    
    try {
      const metaResponse = await fetch(`/api/files/${fileId}/download-data`, { credentials: "include" });
      if (!metaResponse.ok) return;
      
      const meta = await metaResponse.json();
      let encryptionKey = await getActiveEncryptionKey();
      
      // Use shared encryption key for shared encrypted files
      if (meta.isEncrypted && !meta.isOwner && meta.sharedEncryptionKey) {
        try {
          encryptionKey = await importKey(meta.sharedEncryptionKey);
        } catch (err) {
          console.error("Error importing shared encryption key for thumbnail:", err);
          setFileThumbnails(prev => ({ ...prev, [fileId]: "" }));
          return;
        }
      }
      
      if (meta.isEncrypted && encryptionKey) {
        const fileResponse = await fetch(`/api/files/${fileId}/content`, { credentials: "include" });
        if (!fileResponse.ok) return;
        
        const encryptedBuffer = await fileResponse.arrayBuffer();
        const decryptedBuffer = await decryptBuffer(encryptedBuffer, encryptionKey);
        const blob = new Blob([decryptedBuffer], { type: meta.originalMimeType });
        const url = createDownloadUrl(blob);
        
        if (meta.originalMimeType?.startsWith("video/")) {
          try {
            const thumbnailDataUrl = await generateVideoThumbnail(url);
            revokeDownloadUrl(url);
            setFileThumbnails(prev => ({ ...prev, [fileId]: thumbnailDataUrl }));
          } catch (err) {
            console.error("Error generating video thumbnail:", err);
            revokeDownloadUrl(url);
            setFileThumbnails(prev => ({ ...prev, [fileId]: "" }));
          }
        } else {
          setFileThumbnails(prev => ({ ...prev, [fileId]: url }));
        }
      } else if (meta.isEncrypted && !encryptionKey) {
        setFileThumbnails(prev => ({ ...prev, [fileId]: "" }));
      } else {
        if (mimeType.startsWith("video/") || meta.originalMimeType?.startsWith("video/")) {
          try {
            const thumbnailDataUrl = await generateVideoThumbnail(`/api/files/${fileId}/stream`);
            setFileThumbnails(prev => ({ ...prev, [fileId]: thumbnailDataUrl }));
          } catch (err) {
            console.error("Error generating video thumbnail:", err);
            setFileThumbnails(prev => ({ ...prev, [fileId]: "" }));
          }
        } else {
          setFileThumbnails(prev => ({ ...prev, [fileId]: meta.downloadUrl }));
        }
      }
    } catch (err) {
      console.error("Error loading thumbnail:", err);
    } finally {
      setLoadingThumbnails(prev => { const next = new Set(prev); next.delete(fileId); return next; });
    }
  }, [fileThumbnails, generateVideoThumbnail]);

  const isMediaFile = (file: FileItem): boolean => {
    const mimeToCheck = file.isEncrypted && file.originalMimeType 
      ? file.originalMimeType 
      : file.tipoMime;
    return mimeToCheck.startsWith("image/") || mimeToCheck.startsWith("video/");
  };

  const getEffectiveMimeType = (file: FileItem): string => {
    return (file.isEncrypted && file.originalMimeType) 
      ? file.originalMimeType 
      : file.tipoMime;
  };

  const thumbnailQueueRef = useRef<Array<{id: string, mimeType: string}>>([]);
  const loadingCountRef = useRef(0);
  const MAX_CONCURRENT_LOADS = isMobile ? 2 : 4;

  const processQueue = useCallback(async () => {
    while (thumbnailQueueRef.current.length > 0 && loadingCountRef.current < MAX_CONCURRENT_LOADS) {
      const item = thumbnailQueueRef.current.shift();
      if (!item) break;
      
      if (fileThumbnails[item.id]) continue;
      
      loadingCountRef.current++;
      loadThumbnail(item.id, item.mimeType).finally(() => {
        loadingCountRef.current--;
        processQueue();
      });
    }
  }, [fileThumbnails, loadThumbnail]);

  const queueThumbnailLoad = useCallback((fileId: string, mimeType: string) => {
    if (fileThumbnails[fileId]) return;
    if (thumbnailQueueRef.current.some(item => item.id === fileId)) return;
    
    thumbnailQueueRef.current.push({ id: fileId, mimeType });
    processQueue();
  }, [fileThumbnails, processQueue]);

  useEffect(() => {
    const mediaFiles = files.filter(isMediaFile);
    mediaFiles.slice(0, 12).forEach(file => {
      queueThumbnailLoad(file.id, getEffectiveMimeType(file));
    });
  }, [files, queueThumbnailLoad]);

  useEffect(() => {
    const mediaFiles = sharedFiles.filter(isMediaFile);
    mediaFiles.slice(0, 12).forEach(file => {
      queueThumbnailLoad(file.id, getEffectiveMimeType(file));
    });
  }, [sharedFiles, queueThumbnailLoad]);

  useEffect(() => {
    const mediaFiles = sharedFolderFiles.filter(isMediaFile);
    mediaFiles.slice(0, 12).forEach(file => {
      queueThumbnailLoad(file.id, getEffectiveMimeType(file));
    });
  }, [sharedFolderFiles, queueThumbnailLoad]);

  // Open file preview
  const openPreview = async (file: FileItem) => {
    setPreviewFile(file);
    setShowPreviewModal(true);
    setPreviewLoading(true);
    setPreviewUrl(null);
    
    try {
      const metaResponse = await fetch(`/api/files/${file.id}/download-data`, { credentials: "include" });
      if (!metaResponse.ok) {
        throw new Error("Could not fetch file data");
      }
      
      const meta = await metaResponse.json();
      let encryptionKey = await getActiveEncryptionKey();
      
      // Use shared encryption key for shared encrypted files
      if (meta.isEncrypted && !meta.isOwner && meta.sharedEncryptionKey) {
        try {
          encryptionKey = await importKey(meta.sharedEncryptionKey);
        } catch (err) {
          console.error("Error importing shared encryption key:", err);
          toast.error("Erro ao carregar chave de encriptação partilhada");
          throw new Error("Cannot import shared encryption key");
        }
      } else if (meta.isEncrypted && !meta.isOwner && !meta.sharedEncryptionKey) {
        toast.error("Este ficheiro está encriptado e não tem a chave de acesso partilhada.");
        throw new Error("No shared encryption key available");
      }
      
      if (meta.isEncrypted && encryptionKey) {
        const fileResponse = await fetch(`/api/files/${file.id}/content`, { credentials: "include" });
        if (!fileResponse.ok) {
          throw new Error("Could not fetch encrypted file");
        }
        
        const encryptedBuffer = await fileResponse.arrayBuffer();
        const decryptedBuffer = await decryptBuffer(encryptedBuffer, encryptionKey);
        const blob = new Blob([decryptedBuffer], { type: meta.originalMimeType });
        const url = createDownloadUrl(blob);
        setPreviewUrl(url);
      } else if (meta.isEncrypted && !encryptionKey) {
        toast.error("Faça logout e login novamente para desencriptar os ficheiros");
        throw new Error("No encryption key available");
      } else {
        setPreviewUrl(meta.downloadUrl);
      }
    } catch (err) {
      console.error("Error loading preview:", err);
      toast.error("Não foi possível carregar o preview");
    } finally {
      setPreviewLoading(false);
    }
  };

  const navigateToFolder = async (folderId: string | null) => {
    setSearchResults(null);
    setSearchQuery("");
    
    if (folderId === null) {
      setCurrentFolderId(null);
      setFolderPath([]);
      return;
    }
    
    // Check if navigating to a folder already in the path (going back)
    const existingIndex = folderPath.findIndex(f => f.id === folderId);
    if (existingIndex >= 0) {
      setCurrentFolderId(folderId);
      setFolderPath(folderPath.slice(0, existingIndex + 1));
      return;
    }
    
    // Check if folder is in current view (child of current folder)
    const folder = folders.find(f => f.id === folderId);
    if (folder) {
      setCurrentFolderId(folderId);
      setFolderPath([...folderPath, folder]);
      return;
    }
    
    // Folder not found in current context - try to fetch it
    try {
      const response = await fetch(`/api/folders`, { credentials: "include" });
      if (response.ok) {
        const allFoldersData: FolderItem[] = await response.json();
        const targetFolder = allFoldersData.find(f => f.id === folderId);
        if (targetFolder) {
          // Build path from root to target folder
          const newPath: FolderItem[] = [];
          let current: FolderItem | undefined = targetFolder;
          
          while (current) {
            newPath.unshift(current);
            if (current.parentId) {
              current = allFoldersData.find(f => f.id === current!.parentId);
            } else {
              break;
            }
          }
          
          setCurrentFolderId(folderId);
          setFolderPath(newPath);
        }
      }
    } catch (err) {
      console.error("Error navigating to folder:", err);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    try {
      const response = await fetch(`/api/files/search?q=${encodeURIComponent(searchQuery)}`, { credentials: "include" });
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data);
      }
    } catch (err) {
      console.error("Error searching:", err);
      toast.error("Erro ao pesquisar");
    }
  };

  const handleLogout = async () => {
    setIsLogoutLoading(true);
    await logout();
    setTimeout(() => {
      navigate("/");
    }, 100);
  };

  const handleEnableEncryption = async () => {
    if (!encryptionPassword.trim()) {
      toast.error("Por favor, insira a sua password");
      return;
    }
    
    setEncryptionLoading(true);
    try {
      await enableEncryption(encryptionPassword);
      toast.success("Encriptação ativada com sucesso! Os seus ficheiros agora serão encriptados.");
      setShowEncryptionModal(false);
      setEncryptionPassword("");
    } catch (err: any) {
      toast.error(err.message || "Erro ao ativar encriptação");
    } finally {
      setEncryptionLoading(false);
    }
  };

  // Upload helpers
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) {
      const mins = Math.floor(seconds / 60);
      const secs = Math.round(seconds % 60);
      return `${mins}m ${secs}s`;
    }
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  };

  // Upload handlers
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      uploadFiles(Array.from(e.target.files));
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      uploadFiles(Array.from(e.dataTransfer.files));
    }
  }, [currentFolderId]);

  const uploadSingleFile = async (file: globalThis.File, folderId: string | null): Promise<boolean> => {
    try {
      const encryptionKey = await getActiveEncryptionKey();
      
      let fileToUpload: globalThis.File | Blob = file;
      let originalSize = file.size;
      let wasEncrypted = false;
      
      if (!encryptionKey || !isEncryptionSupported()) {
        console.warn("Encryption key not available - file will be uploaded without encryption");
        toast.warning(`${file.name} será enviado SEM encriptação. Faça logout e login novamente para ativar a encriptação.`);
      } else {
        setCurrentUploadFile(`A encriptar ${file.name}...`);
        
        const encrypted = await encryptFile(file, encryptionKey);
        fileToUpload = new Blob([encrypted.encryptedBuffer], { type: 'application/octet-stream' });
        originalSize = encrypted.originalSize;
        wasEncrypted = true;
        
        setCurrentUploadFile(`A enviar ${file.name}...`);
      }
      
      // Initialize speed tracking
      uploadStartTimeRef.current = Date.now();
      lastProgressRef.current = { time: Date.now(), loaded: 0 };
      setCurrentFileSize(fileToUpload.size);
      setUploadSpeed("");
      setUploadTimeRemaining("");
      
      return new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        const formData = new FormData();
        formData.append("file", fileToUpload, file.name);
        formData.append("originalSize", originalSize.toString());
        formData.append("originalMimeType", file.type);
        formData.append("isEncrypted", wasEncrypted ? "true" : "false");
        if (folderId) {
          formData.append("folderId", folderId);
        }
        
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const now = Date.now();
            const percentComplete = (event.loaded / event.total) * 100;
            setUploadProgress(percentComplete);
            
            // Calculate speed (using moving average for smoother display)
            const timeDiff = (now - lastProgressRef.current.time) / 1000; // in seconds
            if (timeDiff >= 0.5) { // Update speed every 500ms for smoother display
              const bytesDiff = event.loaded - lastProgressRef.current.loaded;
              const speedBps = bytesDiff / timeDiff; // bytes per second
              
              if (speedBps > 0) {
                setUploadSpeed(formatBytes(speedBps) + '/s');
                
                // Calculate time remaining
                const bytesRemaining = event.total - event.loaded;
                const secondsRemaining = bytesRemaining / speedBps;
                if (secondsRemaining > 0 && secondsRemaining < 86400) { // Less than 24 hours
                  setUploadTimeRemaining(formatTime(secondsRemaining));
                }
              }
              
              lastProgressRef.current = { time: now, loaded: event.loaded };
            }
          }
        };
        
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            if (wasEncrypted) {
              toast.success(`${file.name} enviado com sucesso (encriptado)`);
            } else {
              toast.success(`${file.name} enviado com sucesso`);
            }
            resolve(true);
          } else {
            try {
              const error = JSON.parse(xhr.responseText);
              toast.error(error.message || `Erro ao enviar ${file.name}`);
            } catch {
              toast.error(`Erro ao enviar ${file.name}`);
            }
            resolve(false);
          }
        };
        
        xhr.onerror = () => {
          console.error(`XHR error uploading ${file.name}`);
          toast.error(`Erro de rede ao enviar ${file.name}. Verifique a sua conexão.`);
          resolve(false);
        };
        
        xhr.ontimeout = () => {
          console.error(`XHR timeout uploading ${file.name} (file size: ${fileToUpload.size} bytes)`);
          toast.error(`Timeout ao enviar ${file.name}. O ficheiro é muito grande ou a conexão é lenta.`);
          resolve(false);
        };
        
        xhr.open("POST", "/api/files/upload");
        xhr.withCredentials = true;
        xhr.timeout = 600000; // 10 minutes timeout for large files
        xhr.send(formData);
      });
    } catch (err) {
      console.error("Error encrypting/uploading file:", err);
      toast.error(`Erro ao encriptar ${file.name}`);
      return false;
    }
  };

  const uploadFiles = async (filesToUpload: globalThis.File[]) => {
    setIsUploading(true);
    setUploadProgress(0);
    setTotalUploadFiles(filesToUpload.length);
    
    let hasSuccess = false;
    
    for (let i = 0; i < filesToUpload.length; i++) {
      const file = filesToUpload[i];
      setUploadFileIndex(i + 1);
      setCurrentUploadFile(file.name);
      setUploadProgress(0);
      const success = await uploadSingleFile(file, currentFolderId);
      if (success) {
        hasSuccess = true;
      }
    }
    
    setIsUploading(false);
    setUploadProgress(0);
    setCurrentUploadFile("");
    setUploadFileIndex(0);
    setTotalUploadFiles(0);
    setUploadSpeed("");
    setUploadTimeRemaining("");
    setCurrentFileSize(0);
    setShowUploadModal(false);
    setDragOver(false);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    
    if (hasSuccess) {
      await fetchContent();
      await refreshUser();
    }
  };

  // Folder handlers
  const createFolder = async () => {
    if (!newFolderName.trim()) return;
    
    try {
      const response = await fetch("/api/folders", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: newFolderName,
          parentId: currentFolderId
        })
      });
      
      if (response.ok) {
        toast.success("Pasta criada com sucesso");
        setShowFolderModal(false);
        setNewFolderName("");
        fetchContent();
      } else {
        const error = await response.json();
        toast.error(error.message || "Erro ao criar pasta");
      }
    } catch (err) {
      console.error("Error creating folder:", err);
      toast.error("Erro ao criar pasta");
    }
  };

  const deleteFolder = async (folderId: string) => {
    try {
      const response = await fetch(`/api/folders/${folderId}`, {
        method: "DELETE",
        credentials: "include"
      });
      
      if (response.ok) {
        toast.success("Pasta eliminada com sucesso");
        fetchContent();
      } else {
        const error = await response.json();
        toast.error(error.message || "Erro ao eliminar pasta");
      }
    } catch (err) {
      console.error("Error deleting folder:", err);
      toast.error("Erro ao eliminar pasta");
    }
  };

  // Mostrar diálogo de confirmação antes de eliminar
  const confirmDeleteFile = (file: FileItem) => {
    setFileToDelete(file);
    setShowDeleteConfirm(true);
  };

  // File action handlers - mover para lixeira (soft delete)
  const deleteFile = async () => {
    if (!fileToDelete) return;
    
    try {
      console.log("Moving file to trash:", fileToDelete.id);
      const response = await fetch(`/api/files/${fileToDelete.id}`, {
        method: "DELETE",
        credentials: "include"
      });
      
      console.log("Delete response status:", response.status);
      
      if (response.ok) {
        toast.success("Ficheiro movido para a lixeira. Tens 15 dias para recuperar.");
        setShowFileMenu(null);
        setShowDeleteConfirm(false);
        setFileToDelete(null);
        fetchContent();
      } else {
        const error = await response.json();
        console.error("Delete error:", error);
        toast.error(error.message || "Erro ao eliminar ficheiro");
      }
    } catch (err) {
      console.error("Error deleting file:", err);
      toast.error("Erro ao eliminar ficheiro");
    }
  };

  const renameFile = async () => {
    if (!selectedFile || !newFileName.trim()) {
      toast.error("Nome de ficheiro inválido");
      return;
    }
    
    try {
      console.log("Renaming file:", selectedFile.id, "to:", newFileName);
      const response = await fetch(`/api/files/${selectedFile.id}/rename`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: newFileName })
      });
      
      console.log("Rename response status:", response.status);
      
      if (response.ok) {
        toast.success("Ficheiro renomeado com sucesso");
        setShowRenameModal(false);
        setSelectedFile(null);
        setNewFileName("");
        fetchContent();
      } else {
        const error = await response.json();
        console.error("Rename error:", error);
        toast.error(error.message || "Erro ao renomear ficheiro");
      }
    } catch (err) {
      console.error("Error renaming file:", err);
      toast.error("Erro ao renomear ficheiro");
    }
  };

  const moveFile = async (targetFolderId: string | null) => {
    if (!selectedFile) {
      toast.error("Ficheiro não selecionado");
      return;
    }
    
    try {
      console.log("Moving file:", selectedFile.id, "to folder:", targetFolderId);
      const response = await fetch(`/api/files/${selectedFile.id}/move`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId: targetFolderId })
      });
      
      console.log("Move response status:", response.status);
      
      if (response.ok) {
        toast.success("Ficheiro movido com sucesso");
        setShowMoveModal(false);
        setSelectedFile(null);
        fetchContent();
      } else {
        const error = await response.json();
        console.error("Move error:", error);
        toast.error(error.message || "Erro ao mover ficheiro");
      }
    } catch (err) {
      console.error("Error moving file:", err);
      toast.error("Erro ao mover ficheiro");
    }
  };

  const downloadFile = async (file: FileItem) => {
    try {
      toast.info("A preparar download...");
      
      const response = await fetch(`/api/files/${file.id}/download-data`, {
        credentials: "include"
      });
      
      if (!response.ok) {
        throw new Error("Erro ao buscar ficheiro");
      }
      
      const data = await response.json();
      let encryptionKey = await getActiveEncryptionKey();
      
      let fileBlob: Blob;
      
      if (data.isEncrypted && !data.isOwner && data.sharedEncryptionKey) {
        try {
          encryptionKey = await importKey(data.sharedEncryptionKey);
        } catch (err) {
          console.error("Error importing shared encryption key:", err);
          toast.error("Erro ao carregar chave de encriptação partilhada");
          throw new Error("Cannot import shared encryption key");
        }
      } else if (data.isEncrypted && !data.isOwner && !data.sharedEncryptionKey) {
        toast.error("Este ficheiro está encriptado e não tem a chave de acesso partilhada.");
        throw new Error("No shared encryption key available");
      }
      
      if (data.isEncrypted) {
        if (!encryptionKey) {
          toast.error("Faça logout e login novamente para desencriptar os ficheiros");
          throw new Error("No encryption key available");
        }
        
        const fileResponse = await fetch(`/api/files/${file.id}/content`, { credentials: "include" });
        if (!fileResponse.ok) {
          throw new Error("Erro ao descarregar ficheiro");
        }
        
        const encryptedBuffer = await fileResponse.arrayBuffer();
        toast.info("A desencriptar ficheiro...");
        const decryptedBuffer = await decryptBuffer(encryptedBuffer, encryptionKey);
        fileBlob = new Blob([decryptedBuffer], { type: data.originalMimeType || file.tipoMime });
      } else {
        const fileResponse = await fetch(data.downloadUrl);
        if (!fileResponse.ok) {
          throw new Error("Erro ao descarregar ficheiro");
        }
        const buffer = await fileResponse.arrayBuffer();
        fileBlob = new Blob([buffer], { type: file.tipoMime });
      }
      
      const downloadUrl = createDownloadUrl(fileBlob);
      
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = file.nome;
      link.style.cssText = "position:fixed;left:-9999px;top:-9999px;";
      document.body.appendChild(link);
      
      requestAnimationFrame(() => {
        link.click();
        requestAnimationFrame(() => {
          document.body.removeChild(link);
          setTimeout(() => revokeDownloadUrl(downloadUrl), 3000);
        });
      });
      
      toast.success("Download concluído!");
    } catch (err) {
      console.error("Download error:", err);
      toast.error("Erro ao fazer download");
    }
  };

  // Share handlers
  const fetchFileShares = async (fileId: string) => {
    setSharesLoading(true);
    try {
      const response = await fetch(`/api/files/${fileId}/shares`, { credentials: "include" });
      if (response.ok) {
        const shares = await response.json();
        setFileShares(shares);
      } else {
        setFileShares([]);
      }
    } catch (err) {
      console.error("Error fetching shares:", err);
      setFileShares([]);
    } finally {
      setSharesLoading(false);
    }
  };

  const shareFile = async (file: FileItem) => {
    try {
      const response = await fetch("/api/shares", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: file.id })
      });
      
      if (response.ok) {
        const share = await response.json();
        const link = `${window.location.origin}/share/${share.linkCode}`;
        setShareLink(link);
        setSelectedFile(file);
        setShowShareModal(true);
        fetchFileShares(file.id);
      } else {
        const error = await response.json();
        toast.error(error.message || "Erro ao criar link de partilha");
      }
    } catch (err) {
      console.error("Error sharing file:", err);
      toast.error("Erro ao criar link de partilha");
    }
  };

  const copyShareLink = () => {
    if (shareLink) {
      navigator.clipboard.writeText(shareLink);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
      toast.success("Link copiado!");
    }
  };

  const sendShareByEmail = async () => {
    if (!shareLink || !shareEmail.trim() || !selectedFile) return;
    
    setShareSending(true);
    try {
      // Get encryption key to share if the file is encrypted
      let sharedEncryptionKey: string | undefined;
      if (selectedFile.isEncrypted) {
        const storedKey = getStoredEncryptionKey();
        if (storedKey) {
          sharedEncryptionKey = storedKey;
        }
      }
      
      const response = await fetch("/api/shares/send-email", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          email: shareEmail.trim(),
          shareLink: shareLink,
          fileName: selectedFile.nome,
          fileId: selectedFile.id,
          sharedEncryptionKey
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        toast.success(data.message);
        setShareEmail("");
        fetchFileShares(selectedFile.id);
      } else {
        const error = await response.json();
        toast.error(error.message || "Erro ao partilhar");
      }
    } catch (err) {
      console.error("Error sharing file:", err);
      toast.error("Erro ao partilhar");
    } finally {
      setShareSending(false);
    }
  };

  const removeFileShare = async (shareId: string) => {
    if (!selectedFile) return;
    try {
      const response = await fetch(`/api/files/${selectedFile.id}/shares/${shareId}`, {
        method: "DELETE",
        credentials: "include"
      });
      
      if (response.ok) {
        toast.success("Partilha removida");
        setFileShares(prev => prev.filter(s => s.id !== shareId));
      } else {
        toast.error("Erro ao remover partilha");
      }
    } catch (err) {
      console.error("Error removing share:", err);
      toast.error("Erro ao remover partilha");
    }
  };

  const removeFolderPermission = async (folderId: string) => {
    try {
      const response = await fetch(`/api/folders/${folderId}/shares`, {
        method: "DELETE",
        credentials: "include"
      });
      
      if (response.ok) {
        toast.success("Permissão removida");
        setSharedFolders(prev => prev.filter(f => f.id !== folderId));
      } else {
        const error = await response.json();
        toast.error(error.message || "Erro ao remover permissão");
      }
    } catch (err) {
      console.error("Error removing folder permission:", err);
      toast.error("Erro ao remover permissão");
    }
  };

  const removeFromSharedFiles = async (fileId: string) => {
    try {
      const response = await fetch(`/api/shared/files/${fileId}`, {
        method: "DELETE",
        credentials: "include"
      });
      
      if (response.ok) {
        toast.success("Ficheiro removido da lista de partilhados");
        setSharedFiles(prev => prev.filter(f => f.id !== fileId));
        // Refetch pending invitations to update the owner's invitation list
        await fetchPendingInvitations();
      } else {
        const error = await response.json();
        toast.error(error.message || "Erro ao remover ficheiro");
      }
    } catch (err) {
      console.error("Error removing from shared files:", err);
      toast.error("Erro ao remover ficheiro partilhado");
    }
  };

  const cloneFile = async (file: FileItem) => {
    try {
      toast.info("A clonar ficheiro...");
      const response = await fetch(`/api/shared/files/${file.id}/clone`, {
        method: "POST",
        credentials: "include"
      });
      
      if (response.ok) {
        toast.success("Ficheiro clonado com sucesso nos seus ficheiros!");
        setViewMode("files");
        setCurrentFolderId(null);
        setFolderPath([]);
        await fetchContent();
        await refreshUser();
      } else {
        const error = await response.json();
        toast.error(error.message || "Erro ao clonar ficheiro");
      }
    } catch (err) {
      console.error("Error cloning file:", err);
      toast.error("Erro ao clonar ficheiro");
    }
  };

  const removeFromSharedFolders = async (folderId: string) => {
    try {
      const response = await fetch(`/api/shared/folders/${folderId}`, {
        method: "DELETE",
        credentials: "include"
      });
      
      if (response.ok) {
        toast.success("Pasta removida da lista de partilhados");
        setSharedFolders(prev => prev.filter(f => f.id !== folderId));
        // Refetch pending invitations to update the owner's invitation list  
        await fetchPendingInvitations();
      } else {
        const error = await response.json();
        toast.error(error.message || "Erro ao remover pasta");
      }
    } catch (err) {
      console.error("Error removing from shared folders:", err);
      toast.error("Erro ao remover pasta partilhada");
    }
  };

  // Trash handlers
  const restoreFile = async (fileId: string) => {
    try {
      const response = await fetch(`/api/files/${fileId}/restore`, {
        method: "POST",
        credentials: "include"
      });
      
      if (response.ok) {
        toast.success("Arquivo restaurado com sucesso");
        await fetchContent();
        await refreshUser();
      } else {
        const error = await response.json();
        toast.error(error.message || "Erro ao restaurar arquivo");
      }
    } catch (err) {
      console.error("Error restoring file:", err);
      toast.error("Erro ao restaurar arquivo");
    }
  };

  const permanentlyDeleteFile = async (fileId: string) => {
    try {
      const response = await fetch(`/api/files/${fileId}/permanent`, {
        method: "DELETE",
        credentials: "include"
      });
      
      if (response.ok) {
        toast.success("Arquivo eliminado permanentemente");
        fetchContent();
        refreshUser();
      } else {
        const error = await response.json();
        toast.error(error.message || "Erro ao eliminar arquivo");
      }
    } catch (err) {
      console.error("Error permanently deleting file:", err);
      toast.error("Erro ao eliminar arquivo");
    }
  };

  // Utility functions
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return "Hoje";
    if (diffDays === 1) return "Ontem";
    if (diffDays < 7) return `${diffDays} dias`;
    
    return date.toLocaleDateString("pt-PT");
  };

  const getDaysRemaining = (deletedAt: string | null) => {
    if (!deletedAt) return 15;
    const deleteDate = new Date(deletedAt);
    const now = new Date();
    const diffTime = now.getTime() - deleteDate.getTime();
    const daysPassed = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, 15 - daysPassed);
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith("image/")) return <Image className="w-5 h-5 text-purple-400" />;
    if (mimeType.startsWith("video/")) return <Video className="w-5 h-5 text-blue-400" />;
    if (mimeType.startsWith("audio/")) return <Music className="w-5 h-5 text-green-400" />;
    if (mimeType.includes("zip") || mimeType.includes("rar") || mimeType.includes("tar")) 
      return <FileArchive className="w-5 h-5 text-yellow-400" />;
    if (mimeType.includes("javascript") || mimeType.includes("json") || mimeType.includes("html") || mimeType.includes("css"))
      return <FileCode className="w-5 h-5 text-orange-400" />;
    return <File className="w-5 h-5 text-primary" />;
  };

  const storageUsedMB = user?.storageUsed ? user.storageUsed / (1024 * 1024) : 0;
  const storageUsedGB = user?.storageUsed ? user.storageUsed / (1024 * 1024 * 1024) : 0;
  const storageTotalGB = user?.storageLimit ? user.storageLimit / (1024 * 1024 * 1024) : 0;
  const storagePercent = user?.storageUsed && user?.storageLimit ? (user.storageUsed / user.storageLimit) * 100 : 0;
  const displayFiles = searchResults || files;
  
  const formatStorageUsed = () => {
    if (storageUsedGB >= 1) {
      return `${storageUsedGB.toFixed(2)} GB`;
    }
    return `${storageUsedMB.toFixed(2)} MB`;
  };
  
  const formatStorageAvailable = () => {
    const availableGB = storageTotalGB - storageUsedGB;
    if (availableGB >= 1) {
      return `${availableGB.toFixed(2)} GB`;
    }
    return `${(availableGB * 1024).toFixed(2)} MB`;
  };

  // Show loading screen while auth is being checked or if user not loaded yet
  if (authLoading || !user) {
    return <LoadingScreen isVisible={true} />;
  }

  return (
    <>
      {/* Loading Screen - Always rendered first to cover everything */}
      <LoadingScreen isVisible={showLoading || isLogoutLoading} />
      
      <div className="min-h-screen w-screen max-w-full overflow-x-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-foreground selection:bg-primary/10">
        {/* Navigation */}
        <nav className="w-full py-4 px-4 md:px-8 flex justify-between items-center z-50 fixed top-0 left-0 backdrop-blur-md bg-black/20 border-b border-white/10">
        <button 
          onClick={() => navigate("/")}
          className="flex items-center gap-2 font-display font-bold text-lg sm:text-xl tracking-tighter cursor-pointer hover:opacity-80 transition-opacity bg-transparent border-none"
          data-testid="link-home"
        >
          <Cloud className="w-6 h-6 text-white fill-white/20" />
          <span className="text-white drop-shadow-md">OrbitalCloud</span>
        </button>
        
        {/* Search Bar */}
        <div className="hidden md:flex items-center gap-2 flex-1 max-w-md mx-8">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-white/50" />
            <input
              type="text"
              placeholder="Pesquisar ficheiros..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="w-full pl-10 pr-4 py-2 rounded-full bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:border-primary/50"
              data-testid="input-search"
            />
          </div>
          <button 
            onClick={handleSearch}
            className="p-2 rounded-full bg-primary hover:bg-primary/80 text-white transition-colors"
            data-testid="button-search"
          >
            <Search className="w-4 h-4" />
          </button>
        </div>
        
        <div className="flex items-center gap-2">
          {user?.isAdmin && (
            <button 
              onClick={() => navigate("/admin")}
              className="flex items-center gap-2 text-white rounded-full px-4 py-2 font-bold border border-amber-500/50 bg-amber-500/10 hover:bg-amber-500/20 hover:border-amber-500/70 backdrop-blur-sm transition-all text-sm"
              data-testid="button-admin-panel"
            >
              <Settings className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">Admin</span>
            </button>
          )}
          <button 
            onClick={handleLogout}
            className="flex items-center gap-2 text-white rounded-full px-4 py-2 font-bold border border-white/30 bg-white/5 hover:bg-white/15 hover:border-white/50 backdrop-blur-sm transition-all text-sm"
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sair</span>
          </button>
        </div>
      </nav>
      {/* Encryption Warning Banner */}
      {needsEncryptionSetup && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed top-16 left-0 right-0 z-40 bg-amber-500/90 backdrop-blur-sm border-b border-amber-600"
        >
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-900 flex-shrink-0" />
              <p className="text-amber-900 text-sm font-medium">
                A sua conta não tem encriptação ativa. Ative para proteger os seus ficheiros.
              </p>
            </div>
            <button
              onClick={() => setShowEncryptionModal(true)}
              className="flex items-center gap-2 px-4 py-1.5 bg-amber-900 text-white rounded-full text-sm font-medium hover:bg-amber-800 transition-colors flex-shrink-0"
              data-testid="button-enable-encryption"
            >
              <Shield className="w-4 h-4" />
              Ativar Agora
            </button>
          </div>
        </motion.div>
      )}
      {/* Main Content */}
      <div 
        className={`${needsEncryptionSetup ? 'pt-32' : 'pt-20'} px-4 md:px-8 pb-8`}
        style={{
          backgroundImage: `url(${dashboardBgImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed'
        }}
      >
        <div className="max-w-7xl mx-auto">
          {/* Header & Storage */}
          <div className="grid lg:grid-cols-3 gap-6 mb-8">
            {/* Welcome */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="lg:col-span-2 backdrop-blur-md bg-white/10 p-6 rounded-2xl border border-white/30"
            >
              <h1 className="text-2xl md:text-3xl font-display font-bold text-white mb-2">
                Olá, {user.nome}! 
              </h1>
              <p className="text-white/70">Gerencie os seus ficheiros na nuvem</p>
              
              {/* Quick Actions */}
              <div className="grid grid-cols-2 gap-3 mt-6">
                <button 
                  onClick={() => setShowUploadModal(true)}
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary hover:bg-primary/80 text-white font-medium transition-all"
                  data-testid="button-upload"
                >
                  <Upload className="w-4 h-4" />
                  Upload
                </button>
                <button 
                  onClick={() => setShowFolderModal(true)}
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-medium transition-all"
                  data-testid="button-create-folder"
                >
                  <FolderPlus className="w-4 h-4" />
                  Nova Pasta
                </button>
                <button 
                  onClick={() => { setViewMode(viewMode === "trash" ? "files" : "trash"); setCurrentFolderId(null); setFolderPath([]); setCurrentSharedFolderId(null); setSharedFolderPath([]); }}
                  className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-white/20 font-medium transition-all ${viewMode === "trash" ? "bg-red-500/20 text-red-300" : "bg-white/10 hover:bg-white/20 text-white"}`}
                  data-testid="button-trash"
                >
                  <Trash2 className="w-4 h-4" />
                  {viewMode === "trash" ? "Ver Ficheiros" : "Lixeira"}
                </button>
                <button 
                  onClick={() => { setViewMode(viewMode === "shared" ? "files" : "shared"); setCurrentFolderId(null); setFolderPath([]); setCurrentSharedFolderId(null); setSharedFolderPath([]); }}
                  className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-white/20 font-medium transition-all ${viewMode === "shared" ? "bg-blue-500/20 text-blue-300" : "bg-white/10 hover:bg-white/20 text-white"}`}
                  data-testid="button-shared"
                >
                  <Users className="w-4 h-4" />
                  {viewMode === "shared" ? "Meus Ficheiros" : "Partilhados"}
                  {pendingInvitations.length > 0 && (
                    <span className="ml-1 px-2 py-0.5 text-xs bg-red-500 text-white rounded-full">
                      {pendingInvitations.length}
                    </span>
                  )}
                </button>
              </div>
            </motion.div>

            {/* Storage Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="backdrop-blur-md bg-white/10 p-6 rounded-2xl border border-white/30"
            >
              <h2 className="text-lg font-bold text-white mb-4">Armazenamento</h2>
              <div className="mb-4 p-4 bg-gradient-to-br from-primary/20 to-accent/10 rounded-xl border border-primary/30">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-2xl font-bold text-white">{formatStorageUsed()}</span>
                  <span className="text-white/70">já consumidos</span>
                </div>
                <p className="text-white/60 text-sm">{formatStorageUsed()} de {storageTotalGB.toFixed(0)} GB ({storagePercent.toFixed(1)}%)</p>
              </div>
              <div className="mb-4">
                <div className="w-full bg-white/10 rounded-full h-3 border border-white/20 overflow-hidden">
                  <motion.div
                    className="bg-gradient-to-r from-primary to-accent h-full rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(storagePercent, 100)}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                  />
                </div>
              </div>
              <div className="flex justify-between text-sm text-white/70 mb-4">
                <span>Usado: {formatStorageUsed()}</span>
                <span>Disponível: {formatStorageAvailable()}</span>
              </div>
              <button
                onClick={() => setShowPlansModal(true)}
                className="w-full p-3 bg-primary/10 rounded-lg border border-primary/30 hover:bg-primary/20 transition-all text-left group"
                data-testid="button-request-more-gb"
              >
                <p className="text-xs text-white/70">
                  <span className="text-primary font-bold">+GB</span>
                  <span className="ml-2 text-white">Solicitar</span>
                </p>
              </button>
            </motion.div>
          </div>

          {/* Breadcrumb */}
          {viewMode === "files" && (folderPath.length > 0 || searchResults) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-2 mb-4 text-white/70"
            >
              <button 
                onClick={() => { navigateToFolder(null); setSearchResults(null); setSearchQuery(""); }}
                className="flex items-center gap-1 hover:text-white transition-colors"
                data-testid="button-back-root"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Início</span>
              </button>
              {folderPath.map((folder, index) => (
                <span key={folder.id} className="flex items-center gap-2">
                  <span>/</span>
                  <button
                    onClick={() => navigateToFolder(folder.id)}
                    className="hover:text-white transition-colors"
                    data-testid={`breadcrumb-folder-${folder.id}`}
                  >
                    {folder.nome}
                  </button>
                </span>
              ))}
              {searchResults && (
                <span className="flex items-center gap-2">
                  <span>/</span>
                  <span className="text-primary">Resultados: "{searchQuery}"</span>
                </span>
              )}
            </motion.div>
          )}

          {/* Trash Header */}
          {viewMode === "trash" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-2 mb-4"
            >
              <Trash2 className="w-5 h-5 text-red-400" />
              <h2 className="text-xl font-bold text-white">Lixeira</h2>
              <span className="text-white/50 text-sm">({files.length} ficheiros)</span>
            </motion.div>
          )}

          {/* Shared Header */}
          {viewMode === "shared" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mb-4"
            >
              <div className="flex items-center gap-2 mb-4">
                <Users className="w-5 h-5 text-blue-400" />
                <h2 className="text-xl font-bold text-white">Partilhados Comigo</h2>
              </div>
              
              {/* Shared Folder Breadcrumb - Back Button */}
              {currentSharedFolderId && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-2 mb-4 text-white/70"
                >
                  <button 
                    onClick={() => { setCurrentSharedFolderId(null); setSharedFolderPath([]); }}
                    className="flex items-center gap-1 hover:text-white transition-colors"
                    data-testid="button-back-shared-root"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Voltar</span>
                  </button>
                  {sharedFolderPath.map((folder) => (
                    <span key={folder.id} className="flex items-center gap-2">
                      <span>/</span>
                      <button
                        onClick={() => setCurrentSharedFolderId(folder.id)}
                        className="hover:text-white transition-colors"
                        data-testid={`breadcrumb-shared-folder-${folder.id}`}
                      >
                        {folder.nome}
                      </button>
                    </span>
                  ))}
                </motion.div>
              )}
              
              {/* Pending Invitations */}
              {pendingInvitations.length > 0 && (
                <div className="mb-6 backdrop-blur-md bg-yellow-500/10 p-4 rounded-xl border border-yellow-500/30">
                  <div className="flex items-center gap-2 mb-3">
                    <Mail className="w-4 h-4 text-yellow-400" />
                    <h3 className="text-sm font-medium text-yellow-300">Convites Pendentes ({pendingInvitations.length})</h3>
                  </div>
                  <div className="space-y-2">
                    {pendingInvitations.map((inv) => (
                      <div 
                        key={inv.id} 
                        className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/10"
                      >
                        <div className="flex items-center gap-3">
                          {inv.resourceType === "folder" ? (
                            <Folder className="w-5 h-5 text-yellow-400" />
                          ) : (
                            <FileText className="w-5 h-5 text-blue-400" />
                          )}
                          <div>
                            <p className="text-white font-medium text-sm">{inv.resourceName}</p>
                            <p className="text-white/50 text-xs">
                              De: {inv.ownerName} | Permissão: {inv.role === "collaborator" ? "Colaborador" : "Visualizador"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => acceptInvitation(inv.id)}
                            className="p-2 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/40 transition-colors"
                            title="Aceitar"
                            data-testid={`button-accept-invite-${inv.id}`}
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => declineInvitation(inv.id)}
                            className="p-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/40 transition-colors"
                            title="Recusar"
                            data-testid={`button-decline-invite-${inv.id}`}
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* Mobile Search */}
          <div className="md:hidden mb-6 mt-4">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-white/50" />
                <input
                  type="text"
                  placeholder="Pesquisar ficheiros..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="w-full pl-10 pr-4 py-2 rounded-full bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:border-primary/50"
                  data-testid="input-search-mobile"
                />
              </div>
              <button 
                onClick={handleSearch}
                className="p-2 rounded-full bg-primary hover:bg-primary/80 text-white transition-colors"
                data-testid="button-search-mobile"
              >
                <Search className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Content Grid */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="bg-white/5 p-6 rounded-2xl border border-white/20 min-h-[400px]"
            style={{ willChange: 'auto', contain: 'layout' }}
          >
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : (
              <>
                {/* Folders */}
                {viewMode === "files" && !searchResults && folders.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-sm font-medium text-white/50 mb-3">Pastas</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3" style={{ contain: 'layout paint' }}>
                      {folders.map((folder) => (
                        <div
                          key={folder.id}
                          className="group relative flex flex-col items-center p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 cursor-pointer"
                          onClick={() => navigateToFolder(folder.id)}
                          data-testid={`folder-item-${folder.id}`}
                          style={{ transition: 'background-color 0.15s' }}
                        >
                          <Folder className="w-10 h-10 text-yellow-400 mb-2" />
                          <span className="text-white text-sm font-medium text-center truncate w-full">{folder.nome}</span>
                          <div className="absolute top-2 right-2 flex items-center gap-1 transition-opacity">
                            <button
                              onClick={(e) => { e.stopPropagation(); openInviteModal("folder", folder.id, folder.nome); }}
                              className="p-1 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/40"
                              title="Convidar"
                              data-testid={`button-invite-folder-${folder.id}`}
                            >
                              <UserPlus className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); deleteFolder(folder.id); }}
                              className="p-1 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/40"
                              data-testid={`button-delete-folder-${folder.id}`}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Shared Folders */}
                {viewMode === "shared" && !currentSharedFolderId && sharedFolders.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-sm font-medium text-white/50 mb-3">Pastas Partilhadas</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                      {sharedFolders.map((folder) => (
                        <div
                          key={folder.id}
                          className="group relative flex flex-col items-center p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-blue-500/30 cursor-pointer transition-colors"
                          onClick={() => { setCurrentSharedFolderId(folder.id); setSharedFolderPath([]); }}
                          data-testid={`shared-folder-item-${folder.id}`}
                        >
                          <div className="absolute top-1 right-1 flex items-center gap-1 transition-opacity">
                            {user.email === folder.ownerEmail && (
                              <button
                                onClick={(e) => { e.stopPropagation(); removeFolderPermission(folder.id); }}
                                className="p-1.5 rounded bg-amber-500/80 text-white hover:bg-amber-500 transition-colors"
                                title="Remover permissão"
                                data-testid={`button-remove-folder-permission-${folder.id}`}
                              >
                                <UserX className="w-3 h-3" />
                              </button>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); removeFromSharedFolders(folder.id); }}
                              className="p-1.5 rounded bg-red-500/80 text-white hover:bg-red-500 transition-colors"
                              title="Remover da lista"
                              data-testid={`button-remove-shared-folder-${folder.id}`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                          <FolderOpen className="w-10 h-10 text-blue-400 mb-2" />
                          <span className="text-white text-sm font-medium text-center truncate w-full">{folder.nome}</span>
                          <span className="text-blue-300/60 text-[10px]">
                            {folder.ownerName} | {folder.role === "collaborator" ? "Colaborador" : "Visualizador"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Content inside Shared Folder */}
                {viewMode === "shared" && currentSharedFolderId && (
                  <>
                    {sharedFolderFolders.length > 0 && (
                      <div className="mb-6">
                        <h3 className="text-sm font-medium text-white/50 mb-3">Pastas</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                          {sharedFolderFolders.map((folder) => (
                            <div
                              key={folder.id}
                              className="group relative flex flex-col items-center p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/20 cursor-pointer transition-colors"
                              onClick={() => { setCurrentSharedFolderId(folder.id); setSharedFolderPath([...sharedFolderPath, {id: folder.id, nome: folder.nome} as SharedFolderItem]); }}
                              data-testid={`shared-subfolder-item-${folder.id}`}
                            >
                              <Folder className="w-10 h-10 text-blue-400 mb-2" />
                              <span className="text-white text-sm font-medium text-center truncate w-full">{folder.nome}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {sharedFolderFiles.length > 0 && (
                      <div>
                        {sharedFolderFolders.length > 0 && <h3 className="text-sm font-medium text-white/50 mb-3">Ficheiros</h3>}
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                          {sharedFolderFiles.map((file) => (
                            <div
                              key={file.id}
                              className={`group relative flex flex-col rounded-lg bg-white/5 hover:bg-white/10 border transition-colors overflow-hidden ${
                                file.isEncrypted ? 'border-amber-500/50' : 'border-white/20'
                              }`}
                              data-testid={`shared-subfolder-file-item-${file.id}`}
                            >
                              <div 
                                className={`aspect-square flex items-center justify-center bg-black/20 overflow-hidden ${
                                  file.isEncrypted ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                                }`}
                                onClick={() => !file.isEncrypted && openPreview(file)}
                              >
                                {isMediaFile(file) && fileThumbnails[file.id] && fileThumbnails[file.id] !== "" ? (
                                  <img 
                                    src={fileThumbnails[file.id]} 
                                    alt={file.nome}
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                  />
                                ) : file.isEncrypted ? (
                                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-amber-900/50 to-slate-900/50">
                                    <Lock className="w-10 h-10 text-amber-400" />
                                  </div>
                                ) : getEffectiveMimeType(file).startsWith("video/") ? (
                                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-900/50 to-slate-900/50 relative">
                                    {loadingThumbnails.has(file.id) ? (
                                      <div className="w-8 h-8 border-2 border-white/20 border-t-purple-400 rounded-full animate-spin" />
                                    ) : (
                                      <Video className="w-10 h-10 text-white/60" />
                                    )}
                                  </div>
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center p-4">
                                    <div className="w-12 h-12 flex items-center justify-center">
                                      {getFileIcon(getEffectiveMimeType(file))}
                                    </div>
                                  </div>
                                )}
                              </div>
                              
                              <div className="p-2 flex-1">
                                <p className="text-white text-xs font-medium truncate" title={file.nome}>{file.nome}</p>
                                {!file.isEncrypted && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); downloadFile(file); }}
                                    className="p-1.5 rounded bg-black/60 text-white hover:bg-black/80 transition-colors w-full mt-1"
                                    title="Download"
                                    data-testid={`button-download-shared-subfolder-${file.id}`}
                                  >
                                    <Download className="w-3 h-3 mx-auto" />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {sharedFolderFiles.length === 0 && sharedFolderFolders.length === 0 && (
                      <div className="flex flex-col items-center justify-center h-64 text-white/50">
                        <FolderOpen className="w-16 h-16 mb-4 opacity-30" />
                        <p className="text-lg">Pasta vazia</p>
                      </div>
                    )}
                  </>
                )}

                {/* Shared Files */}
                {viewMode === "shared" && !currentSharedFolderId && sharedFiles.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-sm font-medium text-white/50 mb-3">Ficheiros Partilhados</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                      {sharedFiles.map((file) => (
                        <div
                          key={file.id}
                          className={`group relative flex flex-col rounded-lg bg-white/5 hover:bg-white/10 border transition-colors overflow-hidden ${
                            file.isEncrypted ? 'border-amber-500/50' : 'border-blue-500/30'
                          }`}
                          data-testid={`shared-file-item-${file.id}`}
                        >
                          <div 
                            className={`aspect-square flex items-center justify-center bg-black/20 overflow-hidden ${
                              file.isEncrypted ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                            }`}
                            onClick={() => !file.isEncrypted && openPreview(file)}
                            title={file.isEncrypted ? "Ficheiro encriptado - não pode ser visualizado" : "Clique para ver"}
                          >
                            {isMediaFile(file) && fileThumbnails[file.id] && fileThumbnails[file.id] !== "" ? (
                              <div className="w-full h-full relative">
                                <img 
                                  src={fileThumbnails[file.id]} 
                                  alt={file.nome}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                                {file.isEncrypted && (
                                  <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                                    <div className="flex flex-col items-center">
                                      <Lock className="w-6 h-6 text-amber-400" />
                                      <span className="text-[8px] text-amber-400 mt-1">Encriptado</span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : getEffectiveMimeType(file).startsWith("video/") ? (
                              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-900/50 to-slate-900/50 relative">
                                {loadingThumbnails.has(file.id) ? (
                                  <div className="w-8 h-8 border-2 border-white/20 border-t-purple-400 rounded-full animate-spin" />
                                ) : (
                                  <Video className="w-10 h-10 text-white/60" />
                                )}
                                {file.isEncrypted && (
                                  <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                                    <div className="flex flex-col items-center">
                                      <Lock className="w-6 h-6 text-amber-400" />
                                      <span className="text-[8px] text-amber-400 mt-1">Encriptado</span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="w-full h-full flex items-center justify-center p-4 relative">
                                <div className="w-12 h-12 flex items-center justify-center">
                                  {getFileIcon(getEffectiveMimeType(file))}
                                </div>
                                {file.isEncrypted && (
                                  <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                                    <div className="flex flex-col items-center">
                                      <Lock className="w-6 h-6 text-amber-400" />
                                      <span className="text-[8px] text-amber-400 mt-1">Encriptado</span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          
                          <div className="p-2 flex-1">
                            <p className="text-white text-xs font-medium truncate" title={file.nome}>{file.nome}</p>
                            <div className="flex items-center gap-1">
                              <p className="text-blue-300/60 text-[10px]">{file.ownerName}</p>
                              {file.isEncrypted && (
                                <span title="Encriptado"><Lock className="w-2.5 h-2.5 text-amber-400" /></span>
                              )}
                            </div>
                          </div>
                          
                          <div className="absolute top-1 right-1 flex items-center gap-1 opacity-100">
                            {!file.isEncrypted && (
                              <button
                                onClick={(e) => { e.stopPropagation(); e.preventDefault(); downloadFile(file); }}
                                className="p-1.5 rounded bg-black/60 text-white hover:bg-black/80 transition-colors"
                                title="Download"
                                data-testid={`button-download-shared-${file.id}`}
                              >
                                <Download className="w-3 h-3" />
                              </button>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); e.preventDefault(); cloneFile(file); }}
                              className="p-1.5 rounded bg-green-500/80 text-white hover:bg-green-500 transition-colors"
                              title="Clonar para meus ficheiros"
                              data-testid={`button-clone-shared-${file.id}`}
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); e.preventDefault(); removeFromSharedFiles(file.id); }}
                              className="p-1.5 rounded bg-red-500/80 text-white hover:bg-red-500 transition-colors"
                              title="Remover da lista"
                              data-testid={`button-remove-shared-${file.id}`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Empty state for shared view */}
                {viewMode === "shared" && sharedFiles.length === 0 && sharedFolders.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-64 text-white/50">
                    <Users className="w-16 h-16 mb-4 opacity-30" />
                    <p className="text-lg">Nenhum ficheiro partilhado contigo</p>
                    <p className="text-sm mt-2 text-white/30">
                      Quando alguém partilhar ficheiros ou pastas contigo, aparecerão aqui
                    </p>
                  </div>
                )}

                {/* Files - only show for non-shared views */}
                {viewMode !== "shared" && displayFiles.length === 0 && folders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-white/50">
                    <FileText className="w-16 h-16 mb-4 opacity-30" />
                    <p className="text-lg">
                      {viewMode === "trash" 
                        ? "A lixeira está vazia" 
                        : searchResults 
                          ? "Nenhum ficheiro encontrado" 
                          : "Nenhum ficheiro ainda"}
                    </p>
                    {viewMode === "files" && !searchResults && (
                      <button 
                        onClick={() => setShowUploadModal(true)}
                        className="mt-4 flex items-center gap-2 px-4 py-2 rounded-xl bg-primary hover:bg-primary/80 text-white font-medium transition-all"
                        data-testid="button-upload-empty"
                      >
                        <Upload className="w-4 h-4" />
                        Fazer Upload
                      </button>
                    )}
                  </div>
                ) : viewMode !== "shared" && (
                  <>
                    {displayFiles.length > 0 && (
                      <div>
                        {!searchResults && folders.length > 0 && <h3 className="text-sm font-medium text-white/50 mb-3">Ficheiros</h3>}
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3" style={{ contain: 'layout paint' }}>
                          {displayFiles.map((file) => (
                            <div
                              key={file.id}
                              className="group relative flex flex-col rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 overflow-hidden"
                              data-testid={`file-item-${file.id}`}
                              style={{ transition: 'background-color 0.15s' }}
                            >
                              <div 
                                className="aspect-square flex items-center justify-center bg-black/20 cursor-pointer overflow-hidden"
                                onClick={() => openPreview(file)}
                                style={{ contain: 'layout paint' }}
                              >
                                {isMediaFile(file) && fileThumbnails[file.id] && fileThumbnails[file.id] !== "" ? (
                                  <img 
                                    src={fileThumbnails[file.id]} 
                                    alt={file.nome}
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                    decoding="async"
                                  />
                                ) : getEffectiveMimeType(file).startsWith("video/") ? (
                                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-900/50 to-slate-900/50">
                                    {loadingThumbnails.has(file.id) ? (
                                      <div className="w-8 h-8 border-2 border-white/20 border-t-purple-400 rounded-full animate-spin" />
                                    ) : (
                                      <Video className="w-10 h-10 text-white/60" />
                                    )}
                                  </div>
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center p-4">
                                    <div className="w-12 h-12 flex items-center justify-center">
                                      {getFileIcon(getEffectiveMimeType(file))}
                                    </div>
                                  </div>
                                )}
                              </div>
                              
                              <div className="p-2 flex-1">
                                <p className="text-white text-xs font-medium truncate" title={file.nome}>{file.nome}</p>
                                <p className="text-white/50 text-[10px]">{formatFileSize(file.tamanho)}</p>
                                {viewMode === "trash" && file.deletedAt && (
                                  <p className={`text-[10px] mt-0.5 ${getDaysRemaining(file.deletedAt) <= 3 ? 'text-red-400' : 'text-amber-400'}`}>
                                    {getDaysRemaining(file.deletedAt)} dias restantes
                                  </p>
                                )}
                              </div>
                              
                              <div className="absolute top-2 right-2 z-20">
                                <button
                                  ref={file.id === showFileMenu ? menuButtonRef : null}
                                  onClick={(e) => { 
                                    e.stopPropagation(); 
                                    e.preventDefault(); 
                                    const newRef = e.currentTarget;
                                    const rect = newRef.getBoundingClientRect();
                                    setMenuPosition({ 
                                      top: rect.bottom + 8, 
                                      left: rect.left - 180 
                                    });
                                    setShowFileMenu(showFileMenu === file.id ? null : file.id); 
                                    setMenuOpenTime(Date.now()); 
                                    setSelectedFile(file); 
                                  }}
                                  className="p-2 rounded bg-black/60 text-white hover:bg-black/80 transition-colors"
                                  title="Mais opções"
                                  data-testid={`button-menu-${file.id}`}
                                >
                                  <MoreVertical className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </motion.div>
        </div>
      </div>
      {/* Upload Modal */}
      <AnimatePresence>
        {showUploadModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => !isUploading && setShowUploadModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-800 rounded-2xl p-6 w-full max-w-md border border-white/20"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-white">Upload de Ficheiros</h2>
                {!isUploading && (
                  <button onClick={() => setShowUploadModal(false)} className="text-white/50 hover:text-white">
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>
              
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${dragOver ? "border-primary bg-primary/10" : "border-white/20 hover:border-white/40"}`}
              >
                <Upload className="w-12 h-12 mx-auto mb-4 text-white/50" />
                <p className="text-white mb-2">Arraste ficheiros aqui ou</p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/80 text-white font-medium transition-colors"
                  disabled={isUploading}
                  data-testid="button-select-files"
                >
                  Selecionar Ficheiros
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                  data-testid="input-file"
                />
              </div>
              
              {isUploading && (
                <div className="mt-4 space-y-3">
                  <div className="p-3 bg-white/5 rounded-lg border border-white/10">
                    <p className="text-white/90 text-sm font-medium truncate mb-1">
                      {currentUploadFile}
                    </p>
                    <div className="flex justify-between items-center">
                      {totalUploadFiles > 1 && (
                        <p className="text-white/50 text-xs">
                          Ficheiro {uploadFileIndex} de {totalUploadFiles}
                        </p>
                      )}
                      {currentFileSize > 0 && (
                        <p className="text-white/50 text-xs">
                          {formatBytes(currentFileSize)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-white/70">A enviar...</span>
                        {uploadSpeed && (
                          <span className="text-green-400 font-medium text-xs px-2 py-0.5 bg-green-400/10 rounded-full">
                            {uploadSpeed}
                          </span>
                        )}
                      </div>
                      <span className="text-primary font-bold">{Math.round(uploadProgress)}%</span>
                    </div>
                    <div className="w-full bg-white/10 rounded-full h-3 overflow-hidden">
                      <motion.div
                        className="bg-gradient-to-r from-primary to-accent h-full rounded-full"
                        style={{ width: `${uploadProgress}%` }}
                        transition={{ duration: 0.1 }}
                      />
                    </div>
                    {uploadTimeRemaining && uploadProgress < 99 && (
                      <p className="text-white/50 text-xs mt-2 text-right">
                        Tempo restante: ~{uploadTimeRemaining}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Enable Encryption Modal */}
      <AnimatePresence>
        {showEncryptionModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => !encryptionLoading && setShowEncryptionModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-800 rounded-2xl p-6 w-full max-w-md border border-white/20"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-white">Ativar Encriptação</h2>
                <button 
                  onClick={() => !encryptionLoading && setShowEncryptionModal(false)} 
                  className="text-white/50 hover:text-white"
                  disabled={encryptionLoading}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <p className="text-white/70 text-sm mb-4">
                Para ativar a encriptação dos seus ficheiros, por favor confirme a sua password.
                Após ativar, todos os novos ficheiros serão encriptados automaticamente.
              </p>
              
              <input
                type="password"
                value={encryptionPassword}
                onChange={(e) => setEncryptionPassword(e.target.value)}
                placeholder="Sua password"
                className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:border-primary/50 mb-4"
                onKeyDown={(e) => e.key === "Enter" && handleEnableEncryption()}
                disabled={encryptionLoading}
                data-testid="input-encryption-password"
              />
              
              <div className="flex gap-3">
                <button
                  onClick={() => !encryptionLoading && setShowEncryptionModal(false)}
                  className="flex-1 px-4 py-2 rounded-lg bg-white/10 text-white font-medium hover:bg-white/20 transition-colors"
                  disabled={encryptionLoading}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleEnableEncryption}
                  className="flex-1 px-4 py-2 rounded-lg bg-primary text-white font-medium hover:bg-primary/80 transition-colors flex items-center justify-center gap-2"
                  disabled={encryptionLoading}
                  data-testid="button-confirm-encryption"
                >
                  {encryptionLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      A ativar...
                    </>
                  ) : (
                    <>
                      <Shield className="w-4 h-4" />
                      Ativar
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Create Folder Modal */}
      <AnimatePresence>
        {showFolderModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setShowFolderModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-800 rounded-2xl p-6 w-full max-w-md border border-white/20"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-white">Nova Pasta</h2>
                <button onClick={() => setShowFolderModal(false)} className="text-white/50 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Nome da pasta"
                className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:border-primary/50 mb-4"
                onKeyDown={(e) => e.key === "Enter" && createFolder()}
                data-testid="input-folder-name"
              />
              
              <div className="flex gap-3">
                <button
                  onClick={() => setShowFolderModal(false)}
                  className="flex-1 px-4 py-2 rounded-lg bg-white/10 text-white font-medium hover:bg-white/20 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={createFolder}
                  className="flex-1 px-4 py-2 rounded-lg bg-primary text-white font-medium hover:bg-primary/80 transition-colors"
                  data-testid="button-confirm-folder"
                >
                  Criar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Rename Modal */}
      <AnimatePresence>
        {showRenameModal && selectedFile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={(e) => { if (e.target === e.currentTarget) { setShowRenameModal(false); setSelectedFile(null); } }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-800 rounded-2xl p-6 w-full max-w-md border border-white/20"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-white">Renomear Ficheiro</h2>
                <button onClick={() => { setShowRenameModal(false); setSelectedFile(null); }} className="text-white/50 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <input
                type="text"
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                placeholder="Novo nome"
                className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:border-primary/50 mb-4"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); renameFile(); } }}
                autoFocus
                data-testid="input-new-name"
              />
              
              <div className="flex gap-3">
                <button
                  onClick={() => { setShowRenameModal(false); setSelectedFile(null); }}
                  className="flex-1 px-4 py-2 rounded-lg bg-white/10 text-white font-medium hover:bg-white/20 transition-colors"
                  data-testid="button-cancel-rename"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => { console.log("Rename button clicked"); renameFile(); }}
                  className="flex-1 px-4 py-2 rounded-lg bg-primary text-white font-medium hover:bg-primary/80 transition-colors"
                  data-testid="button-confirm-rename"
                >
                  Renomear
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Move Modal */}
      <AnimatePresence>
        {showMoveModal && selectedFile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={(e) => { if (e.target === e.currentTarget) { setShowMoveModal(false); setSelectedFile(null); } }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-800 rounded-2xl p-6 w-full max-w-md border border-white/20 max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-white">Mover para</h2>
                <button onClick={() => { setShowMoveModal(false); setSelectedFile(null); }} className="text-white/50 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="space-y-2">
                <button
                  onClick={() => moveFile(null)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-left transition-colors"
                  data-testid="button-move-root"
                >
                  <Folder className="w-5 h-5 text-yellow-400" />
                  <span className="text-white">Raiz (Início)</span>
                </button>
                {allFolders.filter(f => f.id !== selectedFile.folderId).map((folder) => (
                  <button
                    key={folder.id}
                    onClick={() => moveFile(folder.id)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-left transition-colors"
                    data-testid={`button-move-to-${folder.id}`}
                  >
                    <Folder className="w-5 h-5 text-yellow-400" />
                    <span className="text-white">{folder.nome}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Share Modal */}
      <AnimatePresence>
        {showShareModal && selectedFile && shareLink && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={(e) => { if (e.target === e.currentTarget) { setShowShareModal(false); setSelectedFile(null); setShareLink(null); setShareEmail(""); } }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-800 rounded-2xl p-6 w-full max-w-md border border-white/20"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/20">
                    <Share2 className="w-5 h-5 text-primary" />
                  </div>
                  <h2 className="text-xl font-bold text-white">Partilhar Ficheiro</h2>
                </div>
                <button onClick={() => { setShowShareModal(false); setSelectedFile(null); setShareLink(null); setShareEmail(""); fetchFileShares(selectedFile?.id || ""); }} className="text-white/50 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="mb-4 p-3 rounded-lg bg-white/5 border border-white/10">
                <p className="text-white/50 text-sm mb-1">Ficheiro:</p>
                <p className="text-white font-medium flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-400" />
                  {selectedFile.nome}
                </p>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-white/70 text-sm mb-2">Partilhar com</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                      <input
                        type="email"
                        value={shareEmail}
                        onChange={(e) => setShareEmail(e.target.value)}
                        placeholder="email@exemplo.com"
                        className="w-full pl-10 pr-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder:text-white/30 focus:outline-none focus:border-primary"
                        data-testid="input-share-email"
                      />
                    </div>
                    <button
                      onClick={sendShareByEmail}
                      disabled={shareSending || !shareEmail.trim()}
                      className="px-4 py-3 rounded-lg bg-primary text-white hover:bg-primary/80 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      data-testid="button-send-share"
                    >
                      {shareSending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <UserPlus className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
              
              {/* Lista de partilhados */}
              <div className="mt-4">
                <label className="block text-white/70 text-sm mb-2">Partilhado com</label>
                {sharesLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="w-5 h-5 animate-spin text-white/50" />
                  </div>
                ) : fileShares.length === 0 ? (
                  <div className="text-center py-4 text-white/40 text-sm">
                    Nenhuma partilha ainda
                  </div>
                ) : (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {fileShares.map((share) => (
                      <div 
                        key={share.id} 
                        className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/10"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                            <span className="text-primary text-sm font-medium">
                              {share.nome.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-white text-sm truncate">{share.nome}</p>
                            <p className="text-white/40 text-xs truncate">{share.email}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => removeFileShare(share.id)}
                          className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/20 transition-colors flex-shrink-0"
                          title="Remover partilha"
                          data-testid={`button-remove-share-${share.id}`}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="mt-4 flex justify-end">
                <button
                  onClick={() => { setShowShareModal(false); setSelectedFile(null); setShareLink(null); setShareEmail(""); }}
                  className="px-4 py-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors font-medium"
                  data-testid="button-close-share"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Preview Modal */}
      <AnimatePresence>
        {showPreviewModal && previewFile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4"
            onClick={() => { setShowPreviewModal(false); setPreviewFile(null); setPreviewUrl(null); }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-5xl max-h-[90vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex justify-between items-center mb-4 px-2">
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium truncate">{previewFile.nome}</p>
                  <p className="text-white/50 text-sm">{formatFileSize(previewFile.tamanho)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => downloadFile(previewFile)}
                    className="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
                    title="Download"
                  >
                    <Download className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={() => { setShowPreviewModal(false); setPreviewFile(null); setPreviewUrl(null); }} 
                    className="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              
              {/* Content */}
              <div className="flex-1 flex items-center justify-center bg-black/50 rounded-xl overflow-hidden min-h-[300px]">
                {previewLoading ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    <p className="text-white/50 text-sm">A carregar...</p>
                  </div>
                ) : previewUrl ? (
                  getEffectiveMimeType(previewFile).startsWith("image/") ? (
                    <img 
                      src={previewUrl} 
                      alt={previewFile.nome}
                      className="max-w-full max-h-[70vh] object-contain"
                    />
                  ) : getEffectiveMimeType(previewFile).startsWith("video/") ? (
                    <video 
                      src={previewUrl} 
                      controls 
                      autoPlay
                      playsInline
                      preload={isMobile ? "metadata" : "auto"}
                      controlsList={isMobile ? "nodownload" : undefined}
                      className="max-w-full max-h-[70vh] w-full"
                      style={{ touchAction: 'manipulation' }}
                    />
                  ) : getEffectiveMimeType(previewFile).startsWith("audio/") ? (
                    <div className="flex flex-col items-center gap-4 p-8">
                      <Music className="w-20 h-20 text-white/50" />
                      <audio src={previewUrl} controls autoPlay className="w-full max-w-md" />
                    </div>
                  ) : getEffectiveMimeType(previewFile) === "application/pdf" ? (
                    isMobile ? (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-4 p-6">
                        <FileText className="w-16 h-16 text-red-400" />
                        <p className="text-white text-center font-medium">{previewFile.nome}</p>
                        <p className="text-white/60 text-sm text-center">
                          Para melhor visualização de PDFs em telemóvel, faça download do ficheiro.
                        </p>
                        <button
                          onClick={() => downloadFile(previewFile)}
                          className="mt-2 px-6 py-3 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium flex items-center gap-2 hover:opacity-90 transition-opacity"
                        >
                          <Download className="w-5 h-5" />
                          Fazer Download
                        </button>
                      </div>
                    ) : (
                      <iframe 
                        src={previewUrl} 
                        className="w-full h-[70vh]"
                        title={previewFile.nome}
                      />
                    )
                  ) : (
                    <div className="flex flex-col items-center gap-4 p-8">
                      {getFileIcon(getEffectiveMimeType(previewFile))}
                      <p className="text-white/70 text-center">
                        Preview não disponível para este tipo de ficheiro.
                        <br />
                        <button 
                          onClick={() => downloadFile(previewFile)}
                          className="text-primary hover:underline mt-2"
                        >
                          Fazer download
                        </button>
                      </p>
                    </div>
                  )
                ) : (
                  <div className="flex flex-col items-center gap-4 p-8">
                    {getFileIcon(getEffectiveMimeType(previewFile))}
                    <p className="text-white/50">Não foi possível carregar o preview</p>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Click outside to close menus */}
      {showFileMenu && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => {
            const timeSinceOpen = Date.now() - menuOpenTime;
            if (timeSinceOpen > 100) {
              setShowFileMenu(null);
            }
          }}
        />
      )}
      
      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && fileToDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => { setShowDeleteConfirm(false); setFileToDelete(null); }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-800 rounded-2xl p-6 w-full max-w-md border border-white/20"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 rounded-full bg-red-500/20">
                  <Trash2 className="w-6 h-6 text-red-400" />
                </div>
                <h2 className="text-xl font-bold text-white">Eliminar ficheiro?</h2>
              </div>
              
              <p className="text-white/70 mb-2">
                Tens a certeza que queres eliminar <span className="text-white font-medium">"{fileToDelete.nome}"</span>?
              </p>
              
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-6">
                <p className="text-amber-400 text-sm">
                  O ficheiro será movido para a lixeira e poderás recuperá-lo durante 15 dias. Após esse período, será eliminado permanentemente.
                </p>
              </div>
              
              <div className="flex gap-3">
                <button
                  onClick={() => { setShowDeleteConfirm(false); setFileToDelete(null); }}
                  className="flex-1 py-2.5 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors font-medium"
                  data-testid="button-cancel-delete"
                >
                  Cancelar
                </button>
                <button
                  onClick={deleteFile}
                  className="flex-1 py-2.5 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors font-medium"
                  data-testid="button-confirm-delete"
                >
                  Eliminar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Invite Modal */}
      <AnimatePresence>
        {showInviteModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setShowInviteModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-800 rounded-2xl p-6 w-full max-w-md border border-white/20"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/20">
                    <UserPlus className="w-5 h-5 text-blue-400" />
                  </div>
                  <h2 className="text-xl font-bold text-white">Convidar Utilizador</h2>
                </div>
                <button onClick={() => setShowInviteModal(false)} className="text-white/50 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="mb-4 p-3 rounded-lg bg-white/5 border border-white/10">
                <p className="text-white/50 text-sm mb-1">
                  {inviteResourceType === "folder" ? "Pasta:" : "Ficheiro:"}
                </p>
                <p className="text-white font-medium flex items-center gap-2">
                  {inviteResourceType === "folder" ? (
                    <Folder className="w-4 h-4 text-yellow-400" />
                  ) : (
                    <FileText className="w-4 h-4 text-blue-400" />
                  )}
                  {inviteResourceName}
                </p>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-white/70 text-sm mb-2">Email do utilizador</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="email@exemplo.com"
                      className="w-full pl-10 pr-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500"
                      data-testid="input-invite-email"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-white/70 text-sm mb-2">Permissão</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setInviteRole("viewer")}
                      className={`p-3 rounded-lg border transition-colors flex flex-col items-center gap-1 ${
                        inviteRole === "viewer" 
                          ? "bg-blue-500/20 border-blue-500 text-blue-300" 
                          : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10"
                      }`}
                      data-testid="button-role-viewer"
                    >
                      <Shield className="w-5 h-5" />
                      <span className="text-sm font-medium">Visualizador</span>
                      <span className="text-[10px] text-white/50">Apenas ver e download</span>
                    </button>
                    <button
                      onClick={() => setInviteRole("collaborator")}
                      className={`p-3 rounded-lg border transition-colors flex flex-col items-center gap-1 ${
                        inviteRole === "collaborator" 
                          ? "bg-green-500/20 border-green-500 text-green-300" 
                          : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10"
                      }`}
                      data-testid="button-role-collaborator"
                    >
                      <Users className="w-5 h-5" />
                      <span className="text-sm font-medium">Colaborador</span>
                      <span className="text-[10px] text-white/50">Ver, download e upload</span>
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => setShowInviteModal(false)}
                  className="flex-1 py-2.5 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors font-medium"
                  data-testid="button-cancel-invite"
                >
                  Cancelar
                </button>
                <button
                  onClick={sendInvitation}
                  disabled={inviteLoading || !inviteEmail.trim()}
                  className="flex-1 py-2.5 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  data-testid="button-send-invite"
                >
                  {inviteLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Mail className="w-4 h-4" />
                  )}
                  Enviar Convite
                </button>
              </div>
              
              <p className="text-white/40 text-xs text-center mt-4">
                O utilizador receberá uma notificação no painel quando entrar
              </p>

              {/* Resource Invitations Status */}
              {resourceInvitations.length > 0 && (
                <div className="mt-6 pt-6 border-t border-white/10">
                  <h3 className="text-white/70 text-sm font-medium mb-3">Estado de Convites ({resourceInvitations.length})</h3>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {resourceInvitations.map((inv) => (
                      <div 
                        key={inv.id}
                        className={`p-3 rounded-lg border ${
                          inv.status === "pending" 
                            ? "bg-blue-500/10 border-blue-500/30" 
                            : inv.status === "accepted"
                            ? "bg-green-500/10 border-green-500/30"
                            : "bg-red-500/10 border-red-500/30"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="min-w-0 flex-1">
                            <p className="text-white text-sm font-medium truncate">{inv.inviteeEmail}</p>
                            <div className="flex flex-col gap-0.5">
                              <p className="text-white/50 text-xs">
                                {inv.role === "editor" ? "👥 Colaborador" : inv.role === "collaborator" ? "👥 Colaborador" : "👁️ Visualizador"}
                              </p>
                              <p className={`text-xs ${
                                inv.status === "pending" 
                                  ? "text-blue-400" 
                                  : inv.status === "accepted"
                                  ? "text-green-400"
                                  : "text-red-400"
                              }`}>
                                {inv.status === "pending" ? "⏳ Pendente" : inv.status === "accepted" ? "✓ Aceito" : "✗ Rejeitado"}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {(inv.status === "pending" || inv.status === "accepted") && (
                              <select
                                value={inv.role === "editor" ? "collaborator" : inv.role}
                                onChange={(e) => updateInvitationRole(inv.id, e.target.value)}
                                className="text-xs bg-white/10 border border-white/20 rounded px-1.5 py-1 text-white focus:outline-none focus:border-blue-500"
                                title="Alterar permissão"
                                data-testid={`select-role-${inv.id}`}
                              >
                                <option value="viewer" className="bg-slate-800">Visualizador</option>
                                <option value="collaborator" className="bg-slate-800">Colaborador</option>
                              </select>
                            )}
                            {(inv.status === "pending" || inv.status === "accepted") && (
                              <button
                                onClick={() => cancelInvitation(inv.id)}
                                className="ml-1 p-1.5 rounded bg-red-500/20 text-red-400 hover:bg-red-500/40 transition-colors"
                                title={inv.status === "accepted" ? "Remover acesso" : "Cancelar convite"}
                                data-testid={`button-cancel-invitation-${inv.id}`}
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Current Shares List */}
              {inviteResourceType === "file" && (
                <div className="mt-6 pt-6 border-t border-white/10">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-white/70 text-sm font-medium">Utilizadores com acesso ({fileShares.length})</h3>
                    {sharesLoading && <Loader2 className="w-4 h-4 animate-spin text-blue-400" />}
                  </div>
                  {fileShares.length === 0 ? (
                    <p className="text-white/40 text-xs text-center py-4">Nenhuma partilha ativa neste ficheiro</p>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {fileShares.map((share) => (
                        <div 
                          key={share.id}
                          className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/10"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-medium truncate">{share.email}</p>
                            <p className="text-white/50 text-xs">
                              {share.role === "editor" ? "Colaborador (Ver, download e upload)" : "Visualizador (Ver e download)"}
                            </p>
                          </div>
                          <button
                            onClick={() => removeFileShare(share.id)}
                            className="ml-2 p-1.5 rounded bg-red-500/20 text-red-400 hover:bg-red-500/40 transition-colors flex-shrink-0"
                            title="Remover acesso"
                            data-testid={`button-remove-share-${share.id}`}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Plans Modal */}
      <AnimatePresence>
        {showPlansModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto"
            onClick={() => setShowPlansModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white/10 rounded-2xl p-3 sm:p-4 md:p-6 w-full max-w-2xl sm:max-w-4xl lg:max-w-7xl border border-white/20 my-4 sm:my-6 md:my-8 max-h-[90vh] overflow-y-auto backdrop-blur-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-start sm:items-center mb-6 gap-4">
                <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 flex-shrink-0">
                    <Cloud className="w-5 sm:w-6 h-5 sm:h-6 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-lg sm:text-xl font-bold text-white truncate">Aumentar Armazenamento</h2>
                    <p className="text-white/50 text-xs sm:text-sm truncate">20GB grátis + 500 Kz por GB extra (para sempre)</p>
                  </div>
                </div>
                <button onClick={() => setShowPlansModal(false)} className="text-white/50 hover:text-white flex-shrink-0">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Pending Requests */}
              {upgradeRequests.some(r => r.status === "pending") && (
                <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-blue-500/10 rounded-lg border border-blue-500/30">
                  <h3 className="text-blue-400 font-medium mb-2 sm:mb-3 flex items-center gap-2 text-sm sm:text-base">
                    <Clock className="w-4 h-4 flex-shrink-0" />
                    <span>Solicitações Pendentes ({upgradeRequests.filter(r => r.status === "pending").length})</span>
                  </h3>
                  <div className="space-y-2">
                    {upgradeRequests.filter(r => r.status === "pending").map(req => (
                      <div key={req.id} className="p-2 sm:p-3 bg-white/5 rounded-lg border border-blue-500/20">
                        <p className="text-white text-xs sm:text-sm">
                          Solicitação de <span className="font-bold text-blue-400">{req.requestedExtraGB || 0} GB</span> extra 
                          {req.totalPrice && <span className="text-white/70"> ({req.totalPrice.toLocaleString('pt-AO')} Kz)</span>} - Aguardando aprovação
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Approved Requests */}
              {upgradeRequests.some(r => r.status === "approved") && showApprovedSection && (
                <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-green-500/10 rounded-lg border border-green-500/30">
                  <div className="flex items-center justify-between mb-2 sm:mb-3">
                    <h3 className="text-green-400 font-medium flex items-center gap-2 text-sm sm:text-base">
                      <CheckCircle className="w-4 h-4 flex-shrink-0" />
                      <span>Solicitações Aprovadas ({upgradeRequests.filter(r => r.status === "approved").length})</span>
                    </h3>
                    <button
                      onClick={() => setShowApprovedSection(false)}
                      className="text-green-400 hover:text-green-300 transition-colors"
                      data-testid="button-close-approved-section"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="space-y-2">
                    {upgradeRequests.filter(r => r.status === "approved").map(req => (
                      <div key={req.id} className="p-2 sm:p-3 bg-white/5 rounded-lg border border-green-500/20">
                        <p className="text-white text-xs sm:text-sm">
                          <span className="font-bold text-green-400">+{req.requestedExtraGB || 0} GB</span> 
                          {req.totalPrice && <span className="text-white/70"> ({req.totalPrice.toLocaleString('pt-AO')} Kz)</span>} - ✓ Aprovado
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Rejected Requests */}
              {upgradeRequests.some(r => r.status === "rejected") && showRejectedSection && (
                <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-red-500/10 rounded-lg border border-red-500/30">
                  <div className="flex items-center justify-between mb-2 sm:mb-3">
                    <h3 className="text-red-400 font-medium flex items-center gap-2 text-sm sm:text-base">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                      <span>Solicitações Rejeitadas ({upgradeRequests.filter(r => r.status === "rejected").length})</span>
                    </h3>
                    <button
                      onClick={() => setShowRejectedSection(false)}
                      className="text-red-400 hover:text-red-300 transition-colors"
                      data-testid="button-close-rejected-section"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="space-y-2">
                    {upgradeRequests.filter(r => r.status === "rejected").map(req => (
                      <div key={req.id} className="p-2 sm:p-3 bg-white/5 rounded-lg border border-red-500/20">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                          <span className="text-white text-xs sm:text-sm">
                            Solicitação de <span className="font-bold">{req.requestedExtraGB || 0} GB</span> extra
                            {req.totalPrice && <span className="text-white/70"> ({req.totalPrice.toLocaleString('pt-AO')} Kz)</span>}
                          </span>
                          {req.adminNote && (
                            <button
                              onClick={() => {
                                setSelectedRejection({id: req.id, message: req.adminNote, requestedGB: req.requestedExtraGB, totalPrice: req.totalPrice});
                                setShowRejectionModal(true);
                              }}
                              className="text-blue-400 text-xs hover:text-blue-300 text-left sm:text-right whitespace-nowrap"
                            >
                              Ver motivo
                            </button>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            if (req.requestedExtraGB) setRequestedExtraGB(req.requestedExtraGB);
                            setShowUpgradeProofModal(true);
                          }}
                          className="text-xs px-3 py-1 rounded bg-amber-500 hover:bg-amber-600 text-white transition-colors w-full sm:w-auto"
                        >
                          Tentar Novamente
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Current Storage Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 mb-4 sm:mb-6">
                <div className="p-3 sm:p-4 bg-gradient-to-br from-green-500/10 to-emerald-500/10 rounded-xl border border-green-500/20">
                  <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
                    <div className="p-2 rounded-lg bg-green-500/20 flex-shrink-0">
                      <Check className="w-4 sm:w-5 h-4 sm:h-5 text-green-400" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-white font-medium text-xs sm:text-sm">Armazenamento Grátis</h3>
                      <p className="text-green-400 font-bold text-base sm:text-lg">20 GB</p>
                    </div>
                  </div>
                  <p className="text-white/60 text-xs sm:text-xs">Incluído para todos os utilizadores, para sempre.</p>
                </div>
                
                <div className="p-3 sm:p-4 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-xl border border-blue-500/20">
                  <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
                    <div className="p-2 rounded-lg bg-blue-500/20 flex-shrink-0">
                      <Cloud className="w-4 sm:w-5 h-4 sm:h-5 text-blue-400" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-white font-medium text-xs sm:text-sm">Seu Limite Atual</h3>
                      <p className="text-blue-400 font-bold text-base sm:text-lg">{Math.round(user.storageLimit / (1024 * 1024 * 1024))} GB</p>
                    </div>
                  </div>
                  <p className="text-white/60 text-xs sm:text-xs">
                    {user.storageLimit > 21474836480 
                      ? `+${Math.round((user.storageLimit - 21474836480) / (1024 * 1024 * 1024))} GB extras adicionados`
                      : 'Sem espaço extra adicionado'}
                  </p>
                </div>
              </div>

              {/* Request Extra GB Form */}
              <div className="p-3 sm:p-4 md:p-6 bg-gradient-to-br from-primary/10 to-accent/10 rounded-xl border border-primary/20 mb-4 sm:mb-6">
                <h3 className="text-white font-bold text-base sm:text-lg mb-3 sm:mb-4 flex items-center gap-2">
                  <Upload className="w-4 sm:w-5 h-4 sm:h-5 text-primary flex-shrink-0" />
                  <span className="truncate">Solicitar Espaço Extra</span>
                </h3>
                
                <div className="mb-3 sm:mb-4">
                  <label className="text-white/70 text-xs sm:text-sm mb-2 block">Quantos GB extras deseja?</label>
                  <div className="flex items-center gap-2 sm:gap-3">
                    <button
                      onClick={() => setRequestedExtraGB(Math.max(1, requestedExtraGB - 5))}
                      className="p-2 sm:p-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors flex-shrink-0"
                      data-testid="button-decrease-gb"
                    >
                      <span className="text-base sm:text-lg font-bold">-5</span>
                    </button>
                    <input
                      type="number"
                      min="1"
                      max="1000"
                      value={requestedExtraGB}
                      onChange={(e) => setRequestedExtraGB(Math.max(1, Math.min(1000, parseInt(e.target.value) || 1)))}
                      className="flex-1 py-2 sm:py-3 px-3 sm:px-4 rounded-lg bg-white/10 border border-white/20 text-white text-center text-lg sm:text-xl font-bold focus:outline-none focus:border-primary/50 text-xs"
                      data-testid="input-extra-gb"
                    />
                    <button
                      onClick={() => setRequestedExtraGB(Math.min(1000, requestedExtraGB + 5))}
                      className="p-2 sm:p-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors flex-shrink-0"
                      data-testid="button-increase-gb"
                    >
                      <span className="text-base sm:text-lg font-bold">+5</span>
                    </button>
                  </div>
                </div>

                <div className="p-2.5 sm:p-4 bg-white/5 rounded-lg mb-3 sm:mb-4">
                  <div className="flex justify-between items-center mb-1.5 sm:mb-2">
                    <span className="text-white/70 text-xs sm:text-sm">Preço por GB:</span>
                    <span className="text-white font-medium text-xs sm:text-sm">{PRICE_PER_GB.toLocaleString('pt-AO')} Kz</span>
                  </div>
                  <div className="flex justify-between items-center mb-2 sm:mb-2">
                    <span className="text-white/70 text-xs sm:text-sm">GB solicitados:</span>
                    <span className="text-white font-medium text-xs sm:text-sm">{requestedExtraGB} GB</span>
                  </div>
                  <div className="border-t border-white/10 pt-1.5 sm:pt-2 mt-2">
                    <div className="flex justify-between items-center">
                      <span className="text-white font-medium text-xs sm:text-sm">Total a pagar:</span>
                      <span className="text-lg sm:text-2xl font-bold text-primary">{(requestedExtraGB * PRICE_PER_GB).toLocaleString('pt-AO')} Kz</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:flex sm:gap-2 gap-2 flex-wrap mb-3 sm:mb-4">
                  {[10, 20, 50, 100].map(gb => (
                    <button
                      key={gb}
                      onClick={() => setRequestedExtraGB(gb)}
                      className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors flex-1 sm:flex-none ${
                        requestedExtraGB === gb 
                          ? 'bg-primary text-white' 
                          : 'bg-white/10 text-white/70 hover:bg-white/20'
                      }`}
                      data-testid={`button-preset-${gb}gb`}
                    >
                      {gb} GB
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setShowUpgradeProofModal(true)}
                  disabled={upgradeRequests.some(r => r.status === "pending")}
                  className="w-full py-2 sm:py-3 rounded-lg bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 text-white font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-xs sm:text-sm md:text-base"
                  data-testid="button-request-upgrade"
                  title={upgradeRequests.some(r => r.status === "pending") ? "Aguarde a resposta da solicitação atual" : ""}
                >
                  <Upload className="w-3 sm:w-4 h-3 sm:h-4 flex-shrink-0" />
                  <span className="truncate">Solicitar +{requestedExtraGB} GB</span>
                </button>
              </div>
              
              <div className="p-2.5 sm:p-4 bg-white/5 rounded-lg border border-white/10">
                <div className="flex items-start gap-2 sm:gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/20 flex-shrink-0">
                    <Shield className="w-3 sm:w-4 h-3 sm:h-4 text-blue-400" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-white font-medium text-xs sm:text-sm mb-1">Como funciona?</h4>
                    <p className="text-white/50 text-xs leading-relaxed">
                      1. Escolha quantos GB extras deseja • 2. Envie o comprovativo de pagamento • 
                      3. Após verificação, o seu espaço será aumentado imediatamente. 
                      O espaço extra é permanente - pague uma vez, use para sempre!
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Rejection Modal */}
      <AnimatePresence>
        {showRejectionModal && selectedRejection && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[80] flex items-center justify-center p-4"
            onClick={() => setShowRejectionModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="backdrop-blur-md bg-white/10 rounded-2xl p-6 w-full max-w-md border border-white/30"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-red-500/20">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                </div>
                <h3 className="text-lg font-bold text-white">Motivo da Rejeição</h3>
              </div>
              
              <div className="mb-6">
                <p className="text-white/70 text-sm mb-4">
                  Sua solicitação de <span className="font-bold">{selectedRejection.requestedGB || 0} GB</span> extra
                  {selectedRejection.totalPrice && <span> ({selectedRejection.totalPrice.toLocaleString('pt-AO')} Kz)</span>} foi rejeitada:
                </p>
                <div className="p-4 bg-red-500/10 rounded-lg border border-red-500/20">
                  <p className="text-white text-sm">{selectedRejection.message || "Nenhuma mensagem fornecida"}</p>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowRejectionModal(false)}
                  className="flex-1 py-3 rounded-lg bg-white/10 hover:bg-white/20 text-white font-medium transition-colors"
                >
                  OK
                </button>
                <button
                  onClick={() => {
                    setShowRejectionModal(false);
                    if (selectedRejection.requestedGB) setRequestedExtraGB(selectedRejection.requestedGB);
                    setShowUpgradeProofModal(true);
                  }}
                  className="flex-1 py-3 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-medium transition-colors"
                >
                  Tentar Novamente
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upgrade Proof Upload Modal */}
      <AnimatePresence>
        {showUpgradeProofModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[70] flex items-center justify-center p-4"
            onClick={() => {
              if (!uploadingProof) {
                setShowUpgradeProofModal(false);
                setProofFile(null);
              }
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="backdrop-blur-md bg-white/10 rounded-2xl p-6 w-full max-w-md border border-white/30"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-white">Enviar Comprovativo</h3>
                <button 
                  onClick={() => {
                    if (!uploadingProof) {
                      setShowUpgradeProofModal(false);
                      setProofFile(null);
                    }
                  }}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                  disabled={uploadingProof}
                >
                  <X className="w-5 h-5 text-white/70" />
                </button>
              </div>

              <div className="mb-6">
                <div className="p-4 bg-gradient-to-br from-primary/10 to-accent/10 rounded-lg border border-primary/30 mb-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-white/70 text-sm">Espaço extra solicitado:</span>
                    <span className="text-white font-bold">{requestedExtraGB} GB</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-white/70 text-sm">Valor a pagar:</span>
                    <span className="text-primary font-bold text-lg">{(requestedExtraGB * PRICE_PER_GB).toLocaleString('pt-AO')} Kz</span>
                  </div>
                </div>

                <p className="text-white/70 text-sm mb-4">
                  Envie o comprovativo de pagamento (PDF ou imagem) para adicionar 
                  <span className="font-bold text-white"> +{requestedExtraGB} GB</span> à sua conta.
                </p>

                <div className="p-4 bg-blue-500/10 rounded-lg border border-blue-500/30 mb-4">
                  <h4 className="text-blue-400 font-medium text-sm mb-2">Dados para pagamento:</h4>
                  <p className="text-white/70 text-xs mb-1">
                    <span className="font-medium text-white">Multicaixa Express:</span> 943412688
                  </p>
                  <p className="text-white/70 text-xs">
                    <span className="font-medium text-white">IBAN:</span> 0055 0000 6320 2244 10102 Geraldo Abreu Leão Chiquemba
                  </p>
                </div>

                <input 
                  type="file" 
                  ref={proofInputRef}
                  accept=".pdf,image/jpeg,image/png,image/jpg"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setProofFile(file);
                    }
                  }}
                />

                <div 
                  onClick={() => proofInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                    proofFile 
                      ? "border-green-500 bg-green-500/10" 
                      : "border-white/20 hover:border-white/40"
                  }`}
                >
                  {proofFile ? (
                    <div className="flex items-center justify-center gap-3">
                      <CheckCircle className="w-6 h-6 text-green-400" />
                      <div className="text-left">
                        <p className="text-white font-medium text-sm truncate max-w-[200px]">{proofFile.name}</p>
                        <p className="text-white/50 text-xs">{(proofFile.size / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setProofFile(null);
                        }}
                        className="p-1 hover:bg-white/10 rounded-lg"
                      >
                        <X className="w-4 h-4 text-white/50" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-8 h-8 text-white/40 mx-auto mb-2" />
                      <p className="text-white/70 text-sm">Clique para selecionar o comprovativo</p>
                      <p className="text-white/40 text-xs mt-1">PDF, JPG ou PNG (máx. 10MB)</p>
                    </>
                  )}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowUpgradeProofModal(false);
                    setProofFile(null);
                  }}
                  disabled={uploadingProof}
                  className="flex-1 py-3 rounded-lg bg-white/10 hover:bg-white/20 text-white font-medium transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={async () => {
                    if (!proofFile) return;
                    
                    setUploadingProof(true);
                    try {
                      const formData = new FormData();
                      formData.append("proof", proofFile);
                      formData.append("requestedExtraGB", requestedExtraGB.toString());
                      formData.append("totalPrice", (requestedExtraGB * PRICE_PER_GB).toString());
                      
                      const response = await fetch("/api/upgrade-requests", {
                        method: "POST",
                        credentials: "include",
                        body: formData
                      });
                      
                      if (response.ok) {
                        toast.success("Solicitação enviada com sucesso! Aguarde aprovação.");
                        setShowUpgradeProofModal(false);
                        setShowPlansModal(false);
                        setProofFile(null);
                        await fetchUpgradeRequests();
                      } else {
                        const data = await response.json();
                        toast.error(data.message || "Erro ao enviar solicitação");
                      }
                    } catch {
                      toast.error("Erro ao enviar solicitação");
                    } finally {
                      setUploadingProof(false);
                    }
                  }}
                  disabled={!proofFile || uploadingProof}
                  className="flex-1 py-3 rounded-lg bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 text-white font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {uploadingProof ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    `Solicitar +${requestedExtraGB} GB`
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Global File Menu Dropdown */}
      <AnimatePresence>
        {showFileMenu && selectedFile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40"
            onClick={() => setShowFileMenu(null)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showFileMenu && selectedFile && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed z-50 bg-gradient-to-br from-blue-900/80 via-purple-900/80 to-slate-900/80 border border-blue-500/40 rounded-lg shadow-2xl w-44 max-h-[400px] overflow-y-auto backdrop-blur-sm"
            style={{
              top: `${menuPosition.top}px`,
              left: `${menuPosition.left + 57}px`
            }}
          >
            {viewMode === "trash" ? (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); setShowFileMenu(null); restoreFile(selectedFile.id); }}
                  className="w-full px-4 py-3 text-left text-white hover:bg-white/10 transition-colors flex items-center gap-3 text-sm"
                  data-testid={`button-restore-${selectedFile.id}`}
                >
                  <RefreshCw className="w-4 h-4 text-white flex-shrink-0" />
                  Restaurar
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setShowFileMenu(null); permanentlyDeleteFile(selectedFile.id); }}
                  className="w-full px-4 py-3 text-left text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-3 text-sm border-t border-white/10"
                  data-testid={`button-permanent-delete-${selectedFile.id}`}
                >
                  <Trash2 className="w-4 h-4 text-white flex-shrink-0" />
                  Eliminar permanentemente
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    e.preventDefault();
                    const fileToDownload = selectedFile;
                    setShowFileMenu(null); 
                    setSelectedFile(null);
                    setTimeout(() => downloadFile(fileToDownload), 50);
                  }}
                  className="w-full px-4 py-3 text-left text-white hover:bg-white/10 transition-colors flex items-center gap-3 text-sm active:bg-white/20"
                  data-testid={`button-download-${selectedFile.id}`}
                >
                  <Download className="w-4 h-4 text-white flex-shrink-0" />
                  Download
                </button>
                <button
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    e.preventDefault();
                    const fileToShare = selectedFile;
                    setShowFileMenu(null); 
                    shareFile(fileToShare); 
                  }}
                  className="w-full px-4 py-3 text-left text-white hover:bg-white/10 transition-colors flex items-center gap-3 text-sm border-t border-white/10 active:bg-white/20"
                  data-testid={`button-share-${selectedFile.id}`}
                >
                  <Share2 className="w-4 h-4 text-white flex-shrink-0" />
                  Partilhar
                </button>
                <button
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    e.preventDefault();
                    setShowFileMenu(null);
                    setNewFileName(selectedFile.nome);
                    setShowRenameModal(true);
                  }}
                  className="w-full px-4 py-3 text-left text-white hover:bg-white/10 transition-colors flex items-center gap-3 text-sm border-t border-white/10 active:bg-white/20"
                  data-testid={`button-rename-${selectedFile.id}`}
                >
                  <Edit className="w-4 h-4 text-white flex-shrink-0" />
                  Renomear
                </button>
                <button
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    e.preventDefault();
                    setShowFileMenu(null);
                    fetchAllFolders();
                    setShowMoveModal(true);
                  }}
                  className="w-full px-4 py-3 text-left text-white hover:bg-white/10 transition-colors flex items-center gap-3 text-sm border-t border-white/10 active:bg-white/20"
                  data-testid={`button-move-${selectedFile.id}`}
                >
                  <Move className="w-4 h-4 text-white flex-shrink-0" />
                  Mover
                </button>
                <button
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    e.preventDefault();
                    setShowFileMenu(null);
                    confirmDeleteFile(selectedFile); 
                  }}
                  className="w-full px-4 py-3 text-left text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-3 text-sm border-t border-white/10 active:bg-red-500/20"
                  data-testid={`button-delete-${selectedFile.id}`}
                >
                  <Trash2 className="w-4 h-4 text-white flex-shrink-0" />
                  Eliminar
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Footer */}
      <motion.footer 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="relative py-6 px-4 md:px-8 border-t border-white/10 bg-black/20 backdrop-blur-sm"
      >
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4 text-center md:text-left">
          <div className="flex items-center gap-2 font-display font-bold text-lg text-white">
            <Cloud className="w-5 h-5 text-white" />
            <span>OrbitalCloud</span>
          </div>
          <div className="text-sm text-white/70 flex items-center gap-2">
            <span>&copy; 2024 OrbitalCloud. Feito em Luanda com</span>
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 0.6, repeat: Infinity }}
              className="inline-block"
            >
              <Heart className="w-4 h-4 text-red-500 fill-red-500" />
            </motion.div>
          </div>
        </div>
      </motion.footer>
      </div>
    </>
  );
}
