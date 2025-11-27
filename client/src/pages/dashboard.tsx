import { 
  Cloud, Heart, LogOut, Upload, FileText, Share2, Folder, 
  Search, Trash2, Download, MoreVertical, FolderPlus, 
  ArrowLeft, X, Edit, Move, RefreshCw, Link, Copy, Check,
  File, Image, Video, Music, FileCode, FileArchive, Lock,
  Shield, Loader2, AlertTriangle
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import { 
  encryptFile, 
  decryptBuffer, 
  getActiveEncryptionKey,
  createDownloadUrl,
  revokeDownloadUrl,
  isEncryptionSupported
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

type ViewMode = "files" | "trash";

export default function Dashboard() {
  const [, navigate] = useLocation();
  const { user, logout, refreshUser, needsEncryptionSetup, enableEncryption, hasEncryptionKey } = useAuth();
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Folder modal
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  
  // File actions
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [showFileMenu, setShowFileMenu] = useState<string | null>(null);
  const [menuOpenTime, setMenuOpenTime] = useState<number>(0);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [allFolders, setAllFolders] = useState<FolderItem[]>([]);
  
  // Preview state
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [fileThumbnails, setFileThumbnails] = useState<Record<string, string>>({});
  
  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<FileItem | null>(null);
  
  // Encryption setup
  const [showEncryptionModal, setShowEncryptionModal] = useState(false);
  const [encryptionPassword, setEncryptionPassword] = useState("");
  const [encryptionLoading, setEncryptionLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }
    fetchContent();
  }, [user, navigate, currentFolderId, viewMode]);

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
      
      const timeoutId = setTimeout(() => {
        video.src = "";
        reject(new Error("Video load timeout"));
      }, 15000);
      
      video.onloadeddata = () => {
        video.currentTime = Math.min(2, video.duration * 0.1);
      };
      
      video.onseeked = () => {
        clearTimeout(timeoutId);
        try {
          const canvas = document.createElement("canvas");
          canvas.width = video.videoWidth || 320;
          canvas.height = video.videoHeight || 180;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const thumbnailUrl = canvas.toDataURL("image/jpeg", 0.8);
            video.src = "";
            resolve(thumbnailUrl);
          } else {
            reject(new Error("Could not get canvas context"));
          }
        } catch (err) {
          reject(err);
        }
      };
      
      video.onerror = (e) => {
        clearTimeout(timeoutId);
        reject(new Error("Video load error: " + (e as any)?.message));
      };
      
      video.src = videoUrl;
    });
  }, []);

  const loadThumbnail = useCallback(async (fileId: string, mimeType: string) => {
    if (fileThumbnails[fileId]) return;
    
    try {
      const metaResponse = await fetch(`/api/files/${fileId}/download-data`, { credentials: "include" });
      if (!metaResponse.ok) return;
      
      const meta = await metaResponse.json();
      const encryptionKey = await getActiveEncryptionKey();
      
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

  useEffect(() => {
    const mediaFiles = files.filter(isMediaFile);
    mediaFiles.forEach(file => {
      if (!fileThumbnails[file.id]) {
        loadThumbnail(file.id, getEffectiveMimeType(file));
      }
    });
  }, [files, loadThumbnail]);

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
      const encryptionKey = await getActiveEncryptionKey();
      
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
      toast.error("Erro ao carregar preview");
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
    await logout();
    navigate("/");
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
            const percentComplete = (event.loaded / event.total) * 100;
            setUploadProgress(percentComplete);
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
          toast.error(`Erro ao enviar ${file.name}`);
          resolve(false);
        };
        
        xhr.open("POST", "/api/files/upload");
        xhr.withCredentials = true;
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
      const encryptionKey = await getActiveEncryptionKey();
      
      let fileBlob: Blob;
      
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
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setTimeout(() => revokeDownloadUrl(downloadUrl), 1000);
      
      toast.success("Download concluído!");
    } catch (err) {
      console.error("Download error:", err);
      toast.error("Erro ao fazer download");
    }
  };

  // Share handlers
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

  if (!user) return null;

  const storageUsedMB = user.storageUsed / (1024 * 1024);
  const storageUsedGB = user.storageUsed / (1024 * 1024 * 1024);
  const storageTotalGB = user.storageLimit / (1024 * 1024 * 1024);
  const storagePercent = (user.storageUsed / user.storageLimit) * 100;
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

  return (
    <div className="min-h-screen w-screen max-w-full overflow-x-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-foreground selection:bg-primary/10">
      {/* Navigation */}
      <nav className="w-full py-4 px-4 md:px-8 flex justify-between items-center z-50 fixed top-0 left-0 backdrop-blur-md bg-black/20 border-b border-white/10">
        <button 
          onClick={() => navigate("/")}
          className="flex items-center gap-2 font-display font-bold text-lg sm:text-xl tracking-tighter cursor-pointer hover:opacity-80 transition-opacity bg-transparent border-none"
          data-testid="link-home"
        >
          <Cloud className="w-6 h-6 text-white fill-white/20" />
          <span className="text-white drop-shadow-md">AngoCloud</span>
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
        
        <button 
          onClick={handleLogout}
          className="flex items-center gap-2 text-white rounded-full px-4 py-2 font-bold border border-white/30 bg-white/5 hover:bg-white/15 hover:border-white/50 backdrop-blur-sm transition-all text-sm"
          data-testid="button-logout"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">Sair</span>
        </button>
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
      <div className={`${needsEncryptionSetup ? 'pt-32' : 'pt-20'} px-4 md:px-8 pb-8`}>
        <div className="max-w-7xl mx-auto">
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
                Olá, {user.nome}! 👋
              </h1>
              <p className="text-white/70">Gerencie os seus ficheiros na nuvem</p>
              
              {/* Quick Actions */}
              <div className="flex flex-wrap gap-3 mt-6">
                <button 
                  onClick={() => setShowUploadModal(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary hover:bg-primary/80 text-white font-medium transition-all"
                  data-testid="button-upload"
                >
                  <Upload className="w-4 h-4" />
                  Upload
                </button>
                <button 
                  onClick={() => setShowFolderModal(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-medium transition-all"
                  data-testid="button-create-folder"
                >
                  <FolderPlus className="w-4 h-4" />
                  Nova Pasta
                </button>
                <button 
                  onClick={() => { setViewMode(viewMode === "trash" ? "files" : "trash"); setCurrentFolderId(null); setFolderPath([]); }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl border border-white/20 font-medium transition-all ${viewMode === "trash" ? "bg-red-500/20 text-red-300" : "bg-white/10 hover:bg-white/20 text-white"}`}
                  data-testid="button-trash"
                >
                  <Trash2 className="w-4 h-4" />
                  {viewMode === "trash" ? "Ver Ficheiros" : "Lixeira"}
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
              <div className="p-3 bg-white/5 rounded-lg border border-white/10">
                <p className="text-xs text-white/70">Plano: <span className="font-bold text-white capitalize">{user.plano}</span></p>
              </div>
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

          {/* Content Grid */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="backdrop-blur-md bg-white/10 p-6 rounded-2xl border border-white/30 min-h-[400px]"
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
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                      {folders.map((folder) => (
                        <motion.div
                          key={folder.id}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="group relative flex flex-col items-center p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 cursor-pointer transition-all"
                          onClick={() => navigateToFolder(folder.id)}
                          data-testid={`folder-item-${folder.id}`}
                        >
                          <Folder className="w-10 h-10 text-yellow-400 mb-2" />
                          <span className="text-white text-sm font-medium text-center truncate w-full">{folder.nome}</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteFolder(folder.id); }}
                            className="absolute top-2 right-2 p-1 rounded-lg bg-red-500/20 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/40"
                            data-testid={`button-delete-folder-${folder.id}`}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Files */}
                {displayFiles.length === 0 && folders.length === 0 ? (
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
                        className="mt-4 flex items-center gap-2 px-4 py-2 rounded-xl hover:bg-primary/80 text-white font-medium transition-all bg-[#ffffff]"
                        data-testid="button-upload-empty"
                      >
                        <Upload className="w-4 h-4" />
                        Fazer Upload
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    {displayFiles.length > 0 && (
                      <div>
                        {!searchResults && folders.length > 0 && <h3 className="text-sm font-medium text-white/50 mb-3">Ficheiros</h3>}
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                          {displayFiles.map((file) => (
                            <motion.div
                              key={file.id}
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="group relative flex flex-col rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-all overflow-hidden"
                              data-testid={`file-item-${file.id}`}
                            >
                              <div 
                                className="aspect-square flex items-center justify-center bg-black/20 cursor-pointer overflow-hidden"
                                onClick={() => openPreview(file)}
                              >
                                {(file.tipoMime.startsWith("image/") || file.tipoMime.startsWith("video/")) && fileThumbnails[file.id] && fileThumbnails[file.id] !== "" ? (
                                  <img 
                                    src={fileThumbnails[file.id]} 
                                    alt={file.nome}
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                  />
                                ) : file.tipoMime.startsWith("video/") ? (
                                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-900/50 to-slate-900/50">
                                    <Video className="w-10 h-10 text-white/60" />
                                  </div>
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center p-4">
                                    <div className="w-12 h-12 flex items-center justify-center">
                                      {getFileIcon(file.tipoMime)}
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
                              
                              <div 
                                className="absolute top-1 right-1 flex items-center gap-1"
                              >
                                {viewMode === "trash" ? (
                                  <>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); restoreFile(file.id); }}
                                      className="p-1.5 rounded bg-green-500/80 text-white hover:bg-green-500 transition-colors"
                                      title="Restaurar"
                                      data-testid={`button-restore-${file.id}`}
                                    >
                                      <RefreshCw className="w-3 h-3" />
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); permanentlyDeleteFile(file.id); }}
                                      className="p-1.5 rounded bg-red-500/80 text-white hover:bg-red-500 transition-colors"
                                      title="Eliminar permanentemente"
                                      data-testid={`button-permanent-delete-${file.id}`}
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); downloadFile(file); }}
                                      className="p-1.5 rounded bg-black/60 text-white hover:bg-black/80 transition-colors"
                                      title="Download"
                                      data-testid={`button-download-${file.id}`}
                                    >
                                      <Download className="w-3 h-3" />
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); shareFile(file); }}
                                      className="p-1.5 rounded bg-black/60 text-white hover:bg-black/80 transition-colors"
                                      title="Partilhar"
                                      data-testid={`button-share-${file.id}`}
                                    >
                                      <Share2 className="w-3 h-3" />
                                    </button>
                                    <button
                                      onClick={(e) => { 
                                        e.stopPropagation(); 
                                        e.preventDefault();
                                        setSelectedFile(file);
                                        setNewFileName(file.nome);
                                        setShowRenameModal(true);
                                      }}
                                      className="p-1.5 rounded bg-black/60 text-white hover:bg-black/80 transition-colors"
                                      title="Renomear"
                                      data-testid={`button-rename-${file.id}`}
                                    >
                                      <Edit className="w-3 h-3" />
                                    </button>
                                    <button
                                      onClick={(e) => { 
                                        e.stopPropagation(); 
                                        e.preventDefault();
                                        setSelectedFile(file);
                                        fetchAllFolders();
                                        setShowMoveModal(true);
                                      }}
                                      className="p-1.5 rounded bg-black/60 text-white hover:bg-black/80 transition-colors"
                                      title="Mover"
                                      data-testid={`button-move-${file.id}`}
                                    >
                                      <Move className="w-3 h-3" />
                                    </button>
                                    <button
                                      onClick={(e) => { 
                                        e.stopPropagation(); 
                                        e.preventDefault();
                                        confirmDeleteFile(file); 
                                      }}
                                      className="p-1.5 rounded bg-red-500/80 text-white hover:bg-red-500 transition-colors"
                                      title="Eliminar"
                                      data-testid={`button-delete-${file.id}`}
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </motion.div>
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
                    {totalUploadFiles > 1 && (
                      <p className="text-white/50 text-xs">
                        Ficheiro {uploadFileIndex} de {totalUploadFiles}
                      </p>
                    )}
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-white/70">A enviar...</span>
                      <span className="text-primary font-bold">{Math.round(uploadProgress)}%</span>
                    </div>
                    <div className="w-full bg-white/10 rounded-full h-3 overflow-hidden">
                      <motion.div
                        className="bg-gradient-to-r from-primary to-accent h-full rounded-full"
                        style={{ width: `${uploadProgress}%` }}
                        transition={{ duration: 0.1 }}
                      />
                    </div>
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
            onClick={(e) => { if (e.target === e.currentTarget) { setShowShareModal(false); setSelectedFile(null); setShareLink(null); } }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-800 rounded-2xl p-6 w-full max-w-md border border-white/20"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-white">Partilhar Ficheiro</h2>
                <button onClick={() => { setShowShareModal(false); setSelectedFile(null); setShareLink(null); }} className="text-white/50 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="mb-4">
                <p className="text-white/70 mb-2 text-sm">Ficheiro: <span className="text-white">{selectedFile.nome}</span></p>
              </div>
              
              <div className="flex items-center gap-2 mb-4">
                <div className="flex-1 px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white/80 text-sm truncate">
                  {shareLink}
                </div>
                <button
                  onClick={copyShareLink}
                  className="p-3 rounded-lg bg-primary hover:bg-primary/80 text-white transition-colors"
                  data-testid="button-copy-link"
                >
                  {linkCopied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                </button>
              </div>
              
              <p className="text-white/50 text-xs text-center">
                Qualquer pessoa com este link pode fazer download do ficheiro
              </p>
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
                  previewFile.tipoMime.startsWith("image/") ? (
                    <img 
                      src={previewUrl} 
                      alt={previewFile.nome}
                      className="max-w-full max-h-[70vh] object-contain"
                    />
                  ) : previewFile.tipoMime.startsWith("video/") ? (
                    <video 
                      src={previewUrl} 
                      controls 
                      autoPlay
                      className="max-w-full max-h-[70vh]"
                    />
                  ) : previewFile.tipoMime.startsWith("audio/") ? (
                    <div className="flex flex-col items-center gap-4 p-8">
                      <Music className="w-20 h-20 text-white/50" />
                      <audio src={previewUrl} controls autoPlay className="w-full max-w-md" />
                    </div>
                  ) : previewFile.tipoMime === "application/pdf" ? (
                    <iframe 
                      src={previewUrl} 
                      className="w-full h-[70vh]"
                      title={previewFile.nome}
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-4 p-8">
                      {getFileIcon(previewFile.tipoMime)}
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
                    {getFileIcon(previewFile.tipoMime)}
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
      
      {/* Footer */}
      <motion.footer 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="relative py-6 px-4 md:px-8 border-t border-white/10 bg-black/20 backdrop-blur-sm"
      >
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4 text-center md:text-left">
          <div className="flex items-center gap-2 font-display font-bold text-lg text-white">
            <Cloud className="w-5 h-5 text-white" />
            <span>AngoCloud</span>
          </div>
          <div className="text-sm text-white/70 flex items-center gap-2">
            <span>&copy; 2024 AngoCloud. Feito em Luanda com</span>
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
  );
}
