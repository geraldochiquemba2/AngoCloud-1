import { 
  Cloud, Heart, LogOut, Upload, FileText, Share2, Folder, 
  Search, Trash2, Download, MoreVertical, FolderPlus, 
  ArrowLeft, X, Edit, Move, RefreshCw, Link, Copy, Check,
  File, Image, Video, Music, FileCode, FileArchive
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState, useRef, useCallback } from "react";
import { toast } from "sonner";

interface FileItem {
  id: string;
  nome: string;
  tamanho: number;
  tipoMime: string;
  createdAt: string;
  folderId: string | null;
  isDeleted: boolean;
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
  const { user, logout, refreshUser } = useAuth();
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Folder modal
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  
  // File actions
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [showFileMenu, setShowFileMenu] = useState<string | null>(null);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [allFolders, setAllFolders] = useState<FolderItem[]>([]);

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

  const uploadFiles = async (filesToUpload: globalThis.File[]) => {
    setIsUploading(true);
    setUploadProgress(0);
    
    let completed = 0;
    const total = filesToUpload.length;
    let hasSuccess = false;
    
    for (const file of filesToUpload) {
      try {
        const formData = new FormData();
        formData.append("file", file);
        if (currentFolderId) {
          formData.append("folderId", currentFolderId);
        }
        
        const response = await fetch("/api/files/upload", {
          method: "POST",
          credentials: "include",
          body: formData
        });
        
        if (response.ok) {
          completed++;
          hasSuccess = true;
          setUploadProgress((completed / total) * 100);
          toast.success(`${file.name} enviado com sucesso`);
        } else {
          const error = await response.json();
          toast.error(error.message || `Erro ao enviar ${file.name}`);
        }
      } catch (err) {
        console.error("Upload error:", err);
        toast.error(`Erro ao enviar ${file.name}`);
      }
    }
    
    // Reset all upload state
    setIsUploading(false);
    setUploadProgress(0);
    setShowUploadModal(false);
    setDragOver(false);
    
    // Clear file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    
    // Refresh content and user data
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

  // File action handlers
  const deleteFile = async (fileId: string) => {
    try {
      const response = await fetch(`/api/files/${fileId}`, {
        method: "DELETE",
        credentials: "include"
      });
      
      if (response.ok) {
        toast.success("Arquivo movido para a lixeira");
        setShowFileMenu(null);
        fetchContent();
      } else {
        const error = await response.json();
        toast.error(error.message || "Erro ao eliminar arquivo");
      }
    } catch (err) {
      console.error("Error deleting file:", err);
      toast.error("Erro ao eliminar arquivo");
    }
  };

  const renameFile = async () => {
    if (!selectedFile || !newFileName.trim()) return;
    
    try {
      const response = await fetch(`/api/files/${selectedFile.id}/rename`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: newFileName })
      });
      
      if (response.ok) {
        toast.success("Arquivo renomeado com sucesso");
        setShowRenameModal(false);
        setSelectedFile(null);
        setNewFileName("");
        fetchContent();
      } else {
        const error = await response.json();
        toast.error(error.message || "Erro ao renomear arquivo");
      }
    } catch (err) {
      console.error("Error renaming file:", err);
      toast.error("Erro ao renomear arquivo");
    }
  };

  const moveFile = async (targetFolderId: string | null) => {
    if (!selectedFile) return;
    
    try {
      const response = await fetch(`/api/files/${selectedFile.id}/move`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId: targetFolderId })
      });
      
      if (response.ok) {
        toast.success("Arquivo movido com sucesso");
        setShowMoveModal(false);
        setSelectedFile(null);
        fetchContent();
      } else {
        const error = await response.json();
        toast.error(error.message || "Erro ao mover arquivo");
      }
    } catch (err) {
      console.error("Error moving file:", err);
      toast.error("Erro ao mover arquivo");
    }
  };

  const downloadFile = async (fileId: string) => {
    window.open(`/api/files/${fileId}/download`, "_blank");
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

  const storageUsedGB = user.storageUsed / (1024 * 1024 * 1024);
  const storageTotalGB = user.storageLimit / (1024 * 1024 * 1024);
  const storagePercent = (user.storageUsed / user.storageLimit) * 100;
  const displayFiles = searchResults || files;

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
      {/* Main Content */}
      <div className="pt-20 px-4 md:px-8 pb-8">
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
              <div className="mb-3">
                <div className="flex justify-between mb-2">
                  <span className="text-white/80 text-sm">{storageUsedGB.toFixed(2)} GB de {storageTotalGB.toFixed(0)} GB</span>
                  <span className="text-white/60 text-xs">{storagePercent.toFixed(0)}%</span>
                </div>
                <div className="w-full bg-white/10 rounded-full h-2 border border-white/20">
                  <motion.div
                    className="bg-gradient-to-r from-primary to-accent h-full rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(storagePercent, 100)}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                  />
                </div>
              </div>
              <p className="text-white/60 text-xs">{(storageTotalGB - storageUsedGB).toFixed(2)} GB disponível</p>
              <div className="mt-4 p-3 bg-white/5 rounded-lg border border-white/10">
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
                              <div className="aspect-square flex items-center justify-center bg-black/20 p-4">
                                {file.tipoMime.startsWith("image/") ? (
                                  <div className="w-full h-full flex items-center justify-center text-white/30">
                                    {getFileIcon(file.tipoMime)}
                                  </div>
                                ) : (
                                  <div className="w-12 h-12">
                                    {getFileIcon(file.tipoMime)}
                                  </div>
                                )}
                              </div>
                              
                              <div className="p-2 flex-1">
                                <p className="text-white text-xs font-medium truncate" title={file.nome}>{file.nome}</p>
                                <p className="text-white/50 text-[10px]">{formatFileSize(file.tamanho)}</p>
                              </div>
                              
                              <div className="absolute top-1 right-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                {viewMode === "trash" ? (
                                  <>
                                    <button
                                      onClick={() => restoreFile(file.id)}
                                      className="p-1.5 rounded bg-green-500/80 text-white hover:bg-green-500 transition-colors"
                                      title="Restaurar"
                                      data-testid={`button-restore-${file.id}`}
                                    >
                                      <RefreshCw className="w-3 h-3" />
                                    </button>
                                    <button
                                      onClick={() => permanentlyDeleteFile(file.id)}
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
                                      onClick={() => downloadFile(file.id)}
                                      className="p-1.5 rounded bg-black/60 text-white hover:bg-black/80 transition-colors"
                                      title="Download"
                                      data-testid={`button-download-${file.id}`}
                                    >
                                      <Download className="w-3 h-3" />
                                    </button>
                                    <button
                                      onClick={() => shareFile(file)}
                                      className="p-1.5 rounded bg-black/60 text-white hover:bg-black/80 transition-colors"
                                      title="Partilhar"
                                      data-testid={`button-share-${file.id}`}
                                    >
                                      <Share2 className="w-3 h-3" />
                                    </button>
                                    <div className="relative">
                                      <button
                                        onClick={() => setShowFileMenu(showFileMenu === file.id ? null : file.id)}
                                        className="p-1.5 rounded bg-black/60 text-white hover:bg-black/80 transition-colors"
                                        data-testid={`button-menu-${file.id}`}
                                      >
                                        <MoreVertical className="w-3 h-3" />
                                      </button>
                                      
                                      <AnimatePresence>
                                        {showFileMenu === file.id && (
                                          <motion.div
                                            initial={{ opacity: 0, scale: 0.9 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.9 }}
                                            className="absolute right-0 top-8 z-50 bg-slate-800 border border-white/20 rounded-lg shadow-xl py-1 min-w-[130px]"
                                          >
                                            <button
                                              onClick={() => { setSelectedFile(file); setNewFileName(file.nome); setShowRenameModal(true); setShowFileMenu(null); }}
                                              className="w-full flex items-center gap-2 px-3 py-1.5 text-white/80 hover:bg-white/10 text-left text-sm"
                                              data-testid={`button-rename-${file.id}`}
                                            >
                                              <Edit className="w-3 h-3" />
                                              Renomear
                                            </button>
                                            <button
                                              onClick={() => { setSelectedFile(file); fetchAllFolders(); setShowMoveModal(true); setShowFileMenu(null); }}
                                              className="w-full flex items-center gap-2 px-3 py-1.5 text-white/80 hover:bg-white/10 text-left text-sm"
                                              data-testid={`button-move-${file.id}`}
                                            >
                                              <Move className="w-3 h-3" />
                                              Mover
                                            </button>
                                            <button
                                              onClick={() => { deleteFile(file.id); }}
                                              className="w-full flex items-center gap-2 px-3 py-1.5 text-red-400 hover:bg-red-500/10 text-left text-sm"
                                              data-testid={`button-delete-${file.id}`}
                                            >
                                              <Trash2 className="w-3 h-3" />
                                              Eliminar
                                            </button>
                                          </motion.div>
                                        )}
                                      </AnimatePresence>
                                    </div>
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
                <div className="mt-4">
                  <div className="flex justify-between text-sm text-white/70 mb-2">
                    <span>A enviar...</span>
                    <span>{Math.round(uploadProgress)}%</span>
                  </div>
                  <div className="w-full bg-white/10 rounded-full h-2">
                    <motion.div
                      className="bg-primary h-full rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}
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
            onClick={() => { setShowRenameModal(false); setSelectedFile(null); }}
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
                onKeyDown={(e) => e.key === "Enter" && renameFile()}
                data-testid="input-new-name"
              />
              
              <div className="flex gap-3">
                <button
                  onClick={() => { setShowRenameModal(false); setSelectedFile(null); }}
                  className="flex-1 px-4 py-2 rounded-lg bg-white/10 text-white font-medium hover:bg-white/20 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={renameFile}
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
            onClick={() => { setShowMoveModal(false); setSelectedFile(null); }}
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
            onClick={() => { setShowShareModal(false); setSelectedFile(null); setShareLink(null); }}
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
      {/* Click outside to close menus */}
      {showFileMenu && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setShowFileMenu(null)}
        />
      )}
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
