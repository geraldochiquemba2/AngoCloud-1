import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { motion } from "framer-motion";
import { 
  Folder, FileText, Download, File, Image, Video, Music, 
  FileCode, FileArchive, Loader2, ChevronLeft, Globe, Eye, Play, Lock
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { 
  getActiveEncryptionKey, 
  decryptBuffer,
  createDownloadUrl,
  revokeDownloadUrl
} from "@/lib/encryption";

interface PublicFile {
  id: string;
  nome: string;
  tamanho: number;
  tipoMime: string;
  createdAt: string;
  isEncrypted?: boolean;
  originalMimeType?: string;
}

interface PublicFolder {
  id: string;
  nome: string;
  createdAt: string;
}

interface FolderInfo {
  id: string;
  nome: string;
  publishedAt: string;
  ownerName: string;
}

export default function PublicFolderPage() {
  const { slug } = useParams<{ slug: string }>();
  const [, navigate] = useLocation();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [folderInfo, setFolderInfo] = useState<FolderInfo | null>(null);
  const [files, setFiles] = useState<PublicFile[]>([]);
  const [subfolders, setSubfolders] = useState<PublicFolder[]>([]);
  const [previewFile, setPreviewFile] = useState<PublicFile | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [loadingThumbnails, setLoadingThumbnails] = useState<Set<string>>(new Set());
  const thumbnailQueueRef = useRef<PublicFile[]>([]);
  const isProcessingRef = useRef(false);
  const videoThumbnailQueueRef = useRef<PublicFile[]>([]);
  const isProcessingVideoRef = useRef(false);

  useEffect(() => {
    if (slug) {
      fetchFolderData();
    }
  }, [slug]);

  const generateVideoThumbnail = useCallback((videoUrl: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.muted = true;
      video.playsInline = true;
      video.setAttribute("webkit-playsinline", "true");
      
      const timeoutMs = isMobile ? 30000 : 45000;
      let resolved = false;
      let drawAttempts = 0;
      const maxDrawAttempts = 3;
      
      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          video.src = "";
          video.load();
          reject(new Error("Video load timeout"));
        }
      }, timeoutMs);
      
      const drawThumbnail = () => {
        if (resolved) return;
        
        if (video.videoWidth === 0 || video.videoHeight === 0) {
          drawAttempts++;
          if (drawAttempts < maxDrawAttempts) {
            setTimeout(drawThumbnail, 500);
          }
          return;
        }
        
        resolved = true;
        clearTimeout(timeoutId);
        
        setTimeout(() => {
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
              const quality = isMobile ? 0.9 : 0.95;
              const thumbnailUrl = canvas.toDataURL("image/jpeg", quality);
              video.src = "";
              video.load();
              resolve(thumbnailUrl);
            } else {
              video.src = "";
              video.load();
              reject(new Error("Could not get canvas context"));
            }
          } catch (err) {
            video.src = "";
            video.load();
            reject(err);
          }
        }, 150);
      };
      
      video.onloadedmetadata = () => {
        try {
          if (video.duration > 0) {
            const seekTime = Math.min(1, video.duration * 0.1);
            video.currentTime = seekTime;
          }
        } catch (err) {
          console.error("Error seeking:", err);
          drawThumbnail();
        }
      };
      
      video.onseeked = drawThumbnail;
      video.onloadeddata = () => {
        setTimeout(drawThumbnail, 200);
      };
      video.oncanplay = () => {
        setTimeout(drawThumbnail, 100);
      };
      
      video.onerror = (e) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutId);
          video.src = "";
          video.load();
          reject(new Error("Video load error"));
        }
      };
      
      video.src = videoUrl;
      video.load();
    });
  }, [isMobile]);

  const isVideoFile = useCallback((file: PublicFile) => {
    const mimeType = file.originalMimeType || file.tipoMime;
    return mimeType.startsWith("video/") || 
           mimeType === "application/octet-stream" && file.nome.toLowerCase().match(/\.(mov|mp4|webm|avi|mkv|m4v|wmv|flv)$/);
  }, []);

  const isImageFile = useCallback((file: PublicFile) => {
    const mimeType = file.originalMimeType || file.tipoMime;
    return mimeType.startsWith("image/");
  }, []);

  // Load thumbnails for media files
  useEffect(() => {
    if (files.length > 0) {
      const imageFiles = files.filter(f => isImageFile(f));
      const videoFiles = files.filter(f => isVideoFile(f));
      
      thumbnailQueueRef.current = imageFiles;
      videoThumbnailQueueRef.current = videoFiles;
      
      processNextThumbnail();
      processNextVideoThumbnail();
    }
  }, [files, isImageFile, isVideoFile]);

  const processNextVideoThumbnail = useCallback(async () => {
    if (isProcessingVideoRef.current || videoThumbnailQueueRef.current.length === 0) return;
    
    isProcessingVideoRef.current = true;
    const file = videoThumbnailQueueRef.current.shift();
    
    if (file && !thumbnails[file.id]) {
      setLoadingThumbnails(prev => new Set(prev).add(file.id));
      try {
        if (file.isEncrypted) {
          const encryptionKey = await getActiveEncryptionKey();
          if (encryptionKey) {
            const contentRes = await fetch(`/api/public/file/${file.id}/content`);
            if (contentRes.ok) {
              const encryptedBuffer = await contentRes.arrayBuffer();
              const decryptedBuffer = await decryptBuffer(encryptedBuffer, encryptionKey);
              const mimeType = file.originalMimeType || file.tipoMime;
              const decryptedBlob = new Blob([decryptedBuffer], { type: mimeType });
              const blobUrl = createDownloadUrl(decryptedBlob);
              const thumbnailDataUrl = await generateVideoThumbnail(blobUrl);
              revokeDownloadUrl(blobUrl);
              setThumbnails(prev => ({ ...prev, [file.id]: thumbnailDataUrl }));
            }
          } else {
            setThumbnails(prev => ({ ...prev, [file.id]: "encrypted" }));
          }
        } else {
          const streamUrl = `/api/public/file/${file.id}/stream`;
          const thumbnailDataUrl = await generateVideoThumbnail(streamUrl);
          setThumbnails(prev => ({ ...prev, [file.id]: thumbnailDataUrl }));
        }
      } catch (err) {
        console.error("Error generating video thumbnail:", err);
        setThumbnails(prev => ({ ...prev, [file.id]: file.isEncrypted ? "encrypted" : "video_error" }));
      } finally {
        setLoadingThumbnails(prev => {
          const next = new Set(prev);
          next.delete(file.id);
          return next;
        });
      }
    }
    
    isProcessingVideoRef.current = false;
    
    if (videoThumbnailQueueRef.current.length > 0) {
      setTimeout(processNextVideoThumbnail, 200);
    }
  }, [thumbnails, generateVideoThumbnail]);

  const processNextThumbnail = useCallback(async () => {
    if (isProcessingRef.current || thumbnailQueueRef.current.length === 0) return;
    
    isProcessingRef.current = true;
    const file = thumbnailQueueRef.current.shift();
    
    if (file && !thumbnails[file.id]) {
      try {
        if (file.isEncrypted) {
          const encryptionKey = await getActiveEncryptionKey();
          if (encryptionKey) {
            try {
              const contentRes = await fetch(`/api/public/file/${file.id}/content`);
              if (contentRes.ok) {
                const encryptedBuffer = await contentRes.arrayBuffer();
                const decryptedBuffer = await decryptBuffer(encryptedBuffer, encryptionKey);
                const mimeType = file.originalMimeType || file.tipoMime;
                const decryptedBlob = new Blob([decryptedBuffer], { type: mimeType });
                const blobUrl = createDownloadUrl(decryptedBlob);
                setThumbnails(prev => ({ ...prev, [file.id]: blobUrl }));
              }
            } catch (err) {
              console.error("Error decrypting thumbnail:", err);
              setThumbnails(prev => ({ ...prev, [file.id]: "encrypted" }));
            }
          } else {
            setThumbnails(prev => ({ ...prev, [file.id]: "encrypted" }));
          }
        } else {
          const res = await fetch(`/api/public/file/${file.id}/preview`);
          if (res.ok) {
            const blob = await res.blob();
            const blobUrl = URL.createObjectURL(blob);
            setThumbnails(prev => ({ ...prev, [file.id]: blobUrl }));
          }
        }
      } catch (err) {
        console.error("Error loading thumbnail:", err);
      }
    }
    
    isProcessingRef.current = false;
    
    if (thumbnailQueueRef.current.length > 0) {
      setTimeout(processNextThumbnail, 100);
    }
  }, [thumbnails]);

  const fetchFolderData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [infoRes, contentsRes] = await Promise.all([
        fetch(`/api/public/folder/${slug}`),
        fetch(`/api/public/folder/${slug}/contents`)
      ]);

      if (!infoRes.ok) {
        if (infoRes.status === 404) {
          setError("Esta pasta não existe ou não está mais disponível.");
        } else {
          setError("Erro ao carregar pasta pública.");
        }
        return;
      }

      const info = await infoRes.json();
      const contents = await contentsRes.json();

      setFolderInfo(info);
      setFiles(contents.files || []);
      setSubfolders(contents.folders || []);
    } catch (err) {
      console.error("Error fetching public folder:", err);
      setError("Erro ao carregar pasta pública.");
    } finally {
      setLoading(false);
    }
  };

  const getFileIcon = (tipoMime: string, large = false) => {
    const size = large ? "w-12 h-12" : "w-6 h-6";
    if (tipoMime.startsWith("image/")) return <Image className={`${size} text-green-400`} />;
    if (tipoMime.startsWith("video/")) return <Video className={`${size} text-purple-400`} />;
    if (tipoMime.startsWith("audio/")) return <Music className={`${size} text-pink-400`} />;
    if (tipoMime.includes("zip") || tipoMime.includes("rar") || tipoMime.includes("tar") || tipoMime.includes("7z")) 
      return <FileArchive className={`${size} text-amber-400`} />;
    if (tipoMime.includes("javascript") || tipoMime.includes("json") || tipoMime.includes("html") || tipoMime.includes("css") || tipoMime.includes("xml"))
      return <FileCode className={`${size} text-blue-400`} />;
    if (tipoMime.includes("pdf"))
      return <FileText className={`${size} text-red-400`} />;
    return <FileText className={`${size} text-gray-400`} />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('pt-AO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const openPreview = async (file: PublicFile) => {
    const mimeType = file.originalMimeType || file.tipoMime;
    if (!mimeType.startsWith("image/") && !mimeType.startsWith("video/") && !mimeType.startsWith("audio/")) {
      downloadFile(file);
      return;
    }

    setPreviewFile(file);
    setPreviewLoading(true);
    setPreviewUrl(null);

    try {
      if (file.isEncrypted) {
        const encryptionKey = await getActiveEncryptionKey();
        if (!encryptionKey) {
          console.log("No encryption key available for preview");
          setPreviewUrl(null);
          setPreviewLoading(false);
          return;
        }
        
        const contentRes = await fetch(`/api/public/file/${file.id}/content`);
        if (contentRes.ok) {
          const encryptedBuffer = await contentRes.arrayBuffer();
          const decryptedBuffer = await decryptBuffer(encryptedBuffer, encryptionKey);
          const decryptedBlob = new Blob([decryptedBuffer], { type: mimeType });
          const blobUrl = createDownloadUrl(decryptedBlob);
          setPreviewUrl(blobUrl);
        }
      } else if (mimeType.startsWith("video/")) {
        setPreviewUrl(`/api/public/file/${file.id}/stream`);
      } else {
        const res = await fetch(`/api/public/file/${file.id}/preview`);
        if (res.ok) {
          const blob = await res.blob();
          const blobUrl = URL.createObjectURL(blob);
          setPreviewUrl(blobUrl);
        }
      }
    } catch (err) {
      console.error("Error loading preview:", err);
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    if (previewUrl && previewUrl.startsWith("blob:")) {
      revokeDownloadUrl(previewUrl);
    }
    setPreviewFile(null);
    setPreviewUrl(null);
  };

  const downloadFile = async (file: PublicFile) => {
    setDownloadingId(file.id);
    try {
      const res = await fetch(`/api/public/file/${file.id}/download`);
      if (res.ok) {
        const isEncrypted = res.headers.get("X-Is-Encrypted") === "true";
        const originalMimeType = res.headers.get("X-Original-Mime-Type") || file.tipoMime;
        
        let blob = await res.blob();
        
        if (isEncrypted) {
          const encryptionKey = await getActiveEncryptionKey();
          if (encryptionKey) {
            try {
              const encryptedBuffer = await blob.arrayBuffer();
              const decryptedBuffer = await decryptBuffer(encryptedBuffer, encryptionKey);
              blob = new Blob([decryptedBuffer], { type: originalMimeType });
            } catch (err) {
              console.error("Error decrypting file:", err);
            }
          }
        }
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.nome;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error("Error downloading file:", err);
    } finally {
      setDownloadingId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto mb-4" />
          <p className="text-white/70">A carregar pasta pública...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-6">
            <Globe className="w-10 h-10 text-red-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Pasta Não Disponível</h1>
          <p className="text-white/60 mb-6">{error}</p>
          <button
            onClick={() => navigate("/")}
            className="px-6 py-2.5 rounded-lg bg-primary text-white hover:bg-primary/80 transition-colors font-medium"
          >
            Voltar ao Início
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <header className="border-b border-white/10 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div 
            className="flex items-center gap-3 cursor-pointer"
            onClick={() => navigate("/")}
          >
            <span className="text-xl font-bold text-white">OrbitalCloud</span>
          </div>
          <div className="flex items-center gap-2 text-white/60 text-sm">
            <Globe className="w-4 h-4" />
            <span>Pasta Pública</span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="mb-8 p-6 rounded-2xl bg-white/5 border border-white/10">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 rounded-xl bg-yellow-500/20">
                <Folder className="w-8 h-8 text-yellow-400" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-white">{folderInfo?.nome}</h1>
                <p className="text-white/50 text-sm">
                  Partilhado por <span className="text-white/70">{folderInfo?.ownerName}</span>
                  {folderInfo?.publishedAt && (
                    <> · {formatDate(folderInfo.publishedAt)}</>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4 text-sm text-white/60">
              <span>{files.length} ficheiro{files.length !== 1 ? 's' : ''}</span>
              {subfolders.length > 0 && (
                <span>{subfolders.length} pasta{subfolders.length !== 1 ? 's' : ''}</span>
              )}
            </div>
          </div>

          {subfolders.length > 0 && (
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-white mb-4">Pastas</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {subfolders.map((folder) => (
                  <motion.button
                    key={folder.id}
                    whileHover={{ scale: 1.03 }}
                    onClick={() => navigate(`/p/${folder.id}`)}
                    className="flex flex-col items-center justify-center p-6 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-yellow-400/30 transition-all cursor-pointer group text-left"
                    data-testid={`button-folder-${folder.id}`}
                  >
                    <div className="p-3 rounded-lg bg-yellow-500/20 group-hover:bg-yellow-500/30 transition-colors mb-3">
                      <Folder className="w-8 h-8 text-yellow-400" />
                    </div>
                    <span className="text-white text-sm font-medium text-center truncate w-full">
                      {folder.nome}
                    </span>
                    <span className="text-white/40 text-xs mt-1">Pasta</span>
                  </motion.button>
                ))}
              </div>
            </div>
          )}

          {files.length > 0 ? (
            <div>
              <h2 className="text-lg font-semibold text-white mb-4">Ficheiros</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {files.map((file) => {
                  const mimeType = file.originalMimeType || file.tipoMime;
                  const isImage = isImageFile(file);
                  const isVideo = isVideoFile(file);
                  const isAudio = mimeType.startsWith("audio/");
                  const isMedia = isImage || isVideo || isAudio;
                  const thumbnail = thumbnails[file.id];
                  const isEncryptedNoKey = thumbnail === "encrypted";
                  
                  return (
                    <motion.div
                      key={file.id}
                      whileHover={{ scale: 1.03 }}
                      onClick={() => isMedia ? openPreview(file) : downloadFile(file)}
                      className="flex flex-col rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all cursor-pointer overflow-hidden group"
                    >
                      {/* Thumbnail area */}
                      <div className="relative w-full aspect-square bg-slate-800/50 flex items-center justify-center overflow-hidden">
                        {isEncryptedNoKey ? (
                          <div className="w-full h-full bg-gradient-to-br from-slate-700 to-slate-900 flex flex-col items-center justify-center gap-2">
                            <Lock className="w-10 h-10 text-yellow-400/70" />
                            <span className="text-white/50 text-xs">Encriptado</span>
                          </div>
                        ) : isImage && thumbnail && thumbnail !== "encrypted" ? (
                          <img 
                            src={thumbnail} 
                            alt={file.nome}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : isVideo && thumbnail && thumbnail !== "video_error" && thumbnail !== "encrypted" ? (
                          <div className="relative w-full h-full">
                            <img 
                              src={thumbnail} 
                              alt={file.nome}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="w-12 h-12 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center shadow-lg border border-white/20">
                                <Play className="w-6 h-6 text-white fill-white ml-0.5" />
                              </div>
                            </div>
                          </div>
                        ) : isVideo && loadingThumbnails.has(file.id) ? (
                          <div className="w-full h-full bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center">
                            <Loader2 className="w-8 h-8 text-white/40 animate-spin" />
                          </div>
                        ) : isVideo ? (
                          <div className="w-full h-full bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center">
                            <div className="flex items-center justify-center">
                              <div className="w-16 h-16 rounded-full bg-white/30 backdrop-blur-md flex items-center justify-center shadow-lg border border-white/20">
                                <Play className="w-8 h-8 text-white fill-white ml-1" />
                              </div>
                            </div>
                          </div>
                        ) : isImage && !thumbnail ? (
                          <Loader2 className="w-8 h-8 text-white/40 animate-spin" />
                        ) : (
                          <div className="p-4">
                            {getFileIcon(mimeType, true)}
                          </div>
                        )}
                        
                        {/* Desktop: Hover overlay with actions */}
                        {!isMobile && (
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                            {isMedia && (
                              <button
                                onClick={(e) => { e.stopPropagation(); openPreview(file); }}
                                className="p-3 rounded-full bg-blue-500/80 text-white hover:bg-blue-500 transition-colors"
                                title="Visualizar"
                                data-testid={`button-preview-${file.id}`}
                              >
                                <Eye className="w-5 h-5" />
                              </button>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); downloadFile(file); }}
                              disabled={downloadingId === file.id}
                              className="p-3 rounded-full bg-primary/80 text-white hover:bg-primary transition-colors disabled:opacity-50"
                              title="Descarregar"
                              data-testid={`button-download-${file.id}`}
                            >
                              {downloadingId === file.id ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                              ) : (
                                <Download className="w-5 h-5" />
                              )}
                            </button>
                          </div>
                        )}
                        
                        {/* Mobile: Bottom action bar always visible - only for media files */}
                        {isMobile && isMedia && (
                          <div 
                            className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-2 pt-6"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-center">
                              <button
                                onClick={(e) => { e.stopPropagation(); openPreview(file); }}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-blue-500/90 text-white active:bg-blue-600 transition-colors"
                                data-testid={`button-preview-mobile-${file.id}`}
                              >
                                <Eye className="w-4 h-4" />
                                <span className="text-xs font-medium">Ver</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                      
                      {/* File info */}
                      <div className="p-3">
                        <p className="text-white text-sm font-medium truncate" title={file.nome}>{file.nome}</p>
                        <p className="text-white/50 text-xs">
                          {formatFileSize(file.tamanho)}
                        </p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-center py-16">
              <File className="w-16 h-16 text-white/20 mx-auto mb-4" />
              <p className="text-white/50">Esta pasta está vazia</p>
            </div>
          )}
        </motion.div>
      </main>

      {previewFile && (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm ${isMobile ? 'p-0' : 'p-4'}`}
          onClick={closePreview}
          data-testid="preview-modal-backdrop"
        >
          <div
            className={`relative bg-slate-900 overflow-hidden ${
              isMobile 
                ? 'w-full h-full' 
                : 'max-w-4xl w-full max-h-[90vh] rounded-2xl'
            }`}
            onClick={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
          >
            <div className={`flex items-center justify-between border-b border-white/10 sticky top-0 bg-slate-900/95 backdrop-blur-sm z-10 ${isMobile ? 'p-3' : 'p-4'}`}>
              <h3 className={`text-white font-medium truncate flex-1 mr-2 ${isMobile ? 'text-sm' : ''}`}>{previewFile.nome}</h3>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={(e) => { e.stopPropagation(); downloadFile(previewFile); }}
                  className={`rounded-lg bg-primary/20 text-primary hover:bg-primary/40 active:bg-primary/50 transition-colors ${isMobile ? 'p-3' : 'p-2'}`}
                  data-testid="button-download-preview"
                >
                  <Download className={isMobile ? 'w-5 h-5' : 'w-4 h-4'} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); closePreview(); }}
                  className={`rounded-lg bg-white/10 text-white hover:bg-white/20 active:bg-white/30 transition-colors ${isMobile ? 'p-3' : 'p-2'}`}
                  data-testid="button-close-preview"
                >
                  <ChevronLeft className={`${isMobile ? 'w-5 h-5' : 'w-4 h-4'} rotate-180`} />
                </button>
              </div>
            </div>
            <div 
              className={`flex items-center justify-center w-full overflow-auto ${
                isMobile 
                  ? 'h-[calc(100vh-60px)] p-2' 
                  : 'p-4 min-h-[300px]'
              }`}
              onClick={(e) => e.stopPropagation()}
              onTouchEnd={(e) => e.stopPropagation()}
            >
              {previewLoading ? (
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
              ) : previewUrl ? (
                <>
                  {(previewFile.originalMimeType || previewFile.tipoMime).startsWith("image/") && (
                    <img 
                      src={previewUrl} 
                      alt={previewFile.nome}
                      className={`object-contain ${
                        isMobile 
                          ? 'max-w-full max-h-[calc(100vh-80px)] w-auto h-auto touch-manipulation' 
                          : 'max-w-full max-h-[70vh]'
                      }`}
                      onClick={(e) => e.stopPropagation()}
                      onTouchEnd={(e) => e.stopPropagation()}
                      data-testid="preview-image"
                    />
                  )}
                  {(previewFile.originalMimeType || previewFile.tipoMime).startsWith("video/") && (
                    <video 
                      src={previewUrl}
                      poster={thumbnails[previewFile.id] && !thumbnails[previewFile.id].includes("error") && !thumbnails[previewFile.id].includes("encrypted") ? thumbnails[previewFile.id] : undefined}
                      controls
                      controlsList="nodownload"
                      className={`bg-black ${
                        isMobile 
                          ? 'w-full max-h-[calc(100vh-80px)] touch-manipulation' 
                          : 'max-w-full max-h-[70vh] w-full'
                      }`}
                      playsInline
                      webkit-playsinline="true"
                      x-webkit-airplay="allow"
                      preload="metadata"
                      onClick={(e) => e.stopPropagation()}
                      onTouchEnd={(e) => e.stopPropagation()}
                      data-testid="preview-video"
                    />
                  )}
                  {(previewFile.originalMimeType || previewFile.tipoMime).startsWith("audio/") && (
                    <audio 
                      src={previewUrl}
                      controls
                      className={`${isMobile ? 'w-full' : 'w-full max-w-md'}`}
                      onClick={(e) => e.stopPropagation()}
                      onTouchEnd={(e) => e.stopPropagation()}
                      data-testid="preview-audio"
                    />
                  )}
                </>
              ) : (
                <p className="text-white/50 text-center px-4">Não foi possível carregar a visualização</p>
              )}
            </div>
          </div>
        </div>
      )}

      <footer className="border-t border-white/10 mt-16 py-8">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <span className="text-white font-semibold mb-2 block">OrbitalCloud</span>
          <p className="text-white/40 text-sm">
            Armazenamento em nuvem para Angola · 20GB grátis
          </p>
        </div>
      </footer>
    </div>
  );
}
