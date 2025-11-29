import { Cloud, Download, FileText, File, Image, Video, Music, FileArchive, FileCode, AlertCircle, X, Play, Maximize2, Lock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation, useRoute } from "wouter";
import { useEffect, useState, useCallback } from "react";
import LoadingScreen from "@/components/LoadingScreen";
import { useIsMobile } from "@/hooks/use-mobile";

interface FileInfo {
  id: string;
  nome: string;
  tamanho: number;
  tipoMime: string;
  createdAt: string;
  isEncrypted?: boolean;
  originalMimeType?: string;
  originalSize?: number;
}

interface ShareInfo {
  id: string;
  fileId: string;
  linkCode: string;
  downloadCount: number;
  createdAt: string;
}

export default function SharePage() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/share/:linkCode");
  const isMobile = useIsMobile();
  const [file, setFile] = useState<FileInfo | null>(null);
  const [share, setShare] = useState<ShareInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFullPreview, setShowFullPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const getEffectiveMimeType = (fileInfo: FileInfo): string => {
    return (fileInfo.isEncrypted && fileInfo.originalMimeType) 
      ? fileInfo.originalMimeType 
      : fileInfo.tipoMime;
  };

  const isMediaFile = (fileInfo: FileInfo): boolean => {
    const mimeToCheck = getEffectiveMimeType(fileInfo);
    return mimeToCheck.startsWith("image/") || mimeToCheck.startsWith("video/");
  };

  useEffect(() => {
    if (params?.linkCode) {
      fetchShareInfo(params.linkCode);
    }
  }, [params?.linkCode]);

  const fetchShareInfo = async (linkCode: string) => {
    try {
      const response = await fetch(`/api/shares/${linkCode}`);
      
      if (response.ok) {
        const data = await response.json();
        setFile(data.file);
        setShare(data.share);
        
        const effectiveMime = (data.file.isEncrypted && data.file.originalMimeType) 
          ? data.file.originalMimeType 
          : data.file.tipoMime;
        if (effectiveMime.startsWith("image/") || effectiveMime.startsWith("video/")) {
          loadThumbnail(linkCode, effectiveMime);
        }
      } else if (response.status === 404) {
        setError("Link não encontrado ou expirado");
      } else if (response.status === 410) {
        setError("Este link expirou");
      } else {
        setError("Erro ao carregar ficheiro");
      }
    } catch (err) {
      console.error("Error fetching share:", err);
      setError("Erro ao carregar ficheiro");
    } finally {
      setLoading(false);
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
            const maxHeight = isMobile ? 120 : 180;
            const videoWidth = video.videoWidth;
            const videoHeight = video.videoHeight;
            const scale = Math.min(maxWidth / videoWidth, maxHeight / videoHeight);
            canvas.width = Math.round(videoWidth * scale);
            canvas.height = Math.round(videoHeight * scale);
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const quality = isMobile ? 0.7 : 0.8;
              const thumbnailDataUrl = canvas.toDataURL("image/jpeg", quality);
              video.src = "";
              resolve(thumbnailDataUrl);
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
      
      video.onerror = () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutId);
          reject(new Error("Video load error"));
        }
      };
      
      video.src = videoUrl;
      video.load();
    });
  }, [isMobile]);

  const loadThumbnail = async (linkCode: string, mimeType: string) => {
    try {
      if (mimeType.startsWith("video/")) {
        const streamUrl = `/api/shares/${linkCode}/stream`;
        try {
          const thumbnail = await generateVideoThumbnail(streamUrl);
          setThumbnailUrl(thumbnail);
        } catch (err) {
          console.error("Error generating video thumbnail:", err);
        }
      } else if (mimeType.startsWith("image/")) {
        const response = await fetch(`/api/shares/${linkCode}/preview`);
        if (response.ok) {
          const data = await response.json();
          setThumbnailUrl(data.url);
        }
      }
    } catch (err) {
      console.error("Error loading thumbnail:", err);
    }
  };

  const openFullPreview = async () => {
    if (!params?.linkCode || !file) return;
    
    setLoadingPreview(true);
    setShowFullPreview(true);
    
    try {
      const effectiveMime = getEffectiveMimeType(file);
      if (effectiveMime.startsWith("video/") || effectiveMime.startsWith("audio/")) {
        setPreviewUrl(`/api/shares/${params.linkCode}/stream`);
      } else {
        const response = await fetch(`/api/shares/${params.linkCode}/preview`);
        if (response.ok) {
          const data = await response.json();
          setPreviewUrl(data.url);
        }
      }
    } catch (err) {
      console.error("Error loading preview:", err);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleDownload = () => {
    if (params?.linkCode) {
      window.open(`/api/shares/${params.linkCode}/download`, "_blank");
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith("image/")) return <Image className="w-16 h-16 text-purple-400" />;
    if (mimeType.startsWith("video/")) return <Video className="w-16 h-16 text-blue-400" />;
    if (mimeType.startsWith("audio/")) return <Music className="w-16 h-16 text-green-400" />;
    if (mimeType.includes("zip") || mimeType.includes("rar") || mimeType.includes("tar")) 
      return <FileArchive className="w-16 h-16 text-yellow-400" />;
    if (mimeType.includes("javascript") || mimeType.includes("json") || mimeType.includes("html") || mimeType.includes("css"))
      return <FileCode className="w-16 h-16 text-orange-400" />;
    return <File className="w-16 h-16 text-primary" />;
  };

  const canPreview = (fileInfo: FileInfo) => {
    const mimeType = getEffectiveMimeType(fileInfo);
    return mimeType.startsWith("image/") || 
           mimeType.startsWith("video/") || 
           mimeType.startsWith("audio/") ||
           mimeType === "application/pdf";
  };

  return (
    <>
      <LoadingScreen isVisible={loading} />
      <div className="min-h-screen w-screen max-w-full overflow-x-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-foreground">
        {/* Navigation */}
        <nav className="w-full py-6 px-6 md:px-12 flex justify-between items-center">
        <button 
          onClick={() => navigate("/")}
          className="flex items-center gap-2 font-display font-bold text-xl sm:text-2xl tracking-tighter cursor-pointer hover:opacity-80 transition-opacity bg-transparent border-none"
          data-testid="link-home"
        >
          <Cloud className="w-6 sm:w-8 h-6 sm:h-8 text-white fill-white/20" />
          <span className="text-white drop-shadow-md">AngoCloud</span>
        </button>
        </nav>

        {/* Main Content */}
        <div className="flex items-center justify-center min-h-[calc(100vh-200px)] px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="w-full max-w-md"
          >
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
              <p className="text-white/70">A carregar...</p>
            </div>
          ) : error ? (
            <div className="backdrop-blur-md bg-white/10 p-8 rounded-2xl border border-white/30 text-center">
              <AlertCircle className="w-16 h-16 mx-auto mb-4 text-red-400" />
              <h1 className="text-2xl font-bold text-white mb-2">Oops!</h1>
              <p className="text-white/70 mb-6">{error}</p>
              <button
                onClick={() => navigate("/")}
                className="px-6 py-3 rounded-xl bg-primary hover:bg-primary/80 text-white font-medium transition-colors"
                data-testid="button-go-home"
              >
                Ir para o Início
              </button>
            </div>
          ) : file && share ? (
            <div className="backdrop-blur-md bg-white/10 p-8 rounded-2xl border border-white/30 text-center">
              {/* Encrypted file warning */}
              {file.isEncrypted && (
                <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Lock className="w-5 h-5 text-amber-400" />
                    <span className="text-amber-400 font-medium">Ficheiro Encriptado</span>
                  </div>
                  <p className="text-white/70 text-sm">
                    Este ficheiro está protegido com encriptação. O preview não está disponível, mas podes fazer download.
                  </p>
                </div>
              )}
              
              {/* Preview Thumbnail - only for non-encrypted files */}
              {!file.isEncrypted && isMediaFile(file) && (
                <div 
                  className="relative mb-6 rounded-xl overflow-hidden cursor-pointer group"
                  onClick={openFullPreview}
                  data-testid="preview-thumbnail"
                >
                  {thumbnailUrl ? (
                    <>
                      <img 
                        src={thumbnailUrl} 
                        alt={file.nome}
                        className="w-full h-48 object-cover"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        {getEffectiveMimeType(file).startsWith("video/") ? (
                          <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                            <Play className="w-8 h-8 text-white ml-1" />
                          </div>
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                            <Maximize2 className="w-6 h-6 text-white" />
                          </div>
                        )}
                      </div>
                      {getEffectiveMimeType(file).startsWith("video/") && (
                        <div className="absolute bottom-2 right-2 bg-black/60 px-2 py-1 rounded text-xs text-white flex items-center gap-1">
                          <Video className="w-3 h-3" />
                          Vídeo
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="w-full h-48 bg-gradient-to-br from-purple-900/50 to-slate-900/50 flex items-center justify-center">
                      {getEffectiveMimeType(file).startsWith("video/") ? (
                        <Video className="w-16 h-16 text-white/60" />
                      ) : (
                        <Image className="w-16 h-16 text-white/60" />
                      )}
                    </div>
                  )}
                </div>
              )}
              
              {/* File Icon for non-media files OR encrypted files */}
              {(!isMediaFile(file) || file.isEncrypted) && (
                <div className="mb-6 flex justify-center">
                  {file.isEncrypted ? (
                    <div className="relative">
                      {getFileIcon(getEffectiveMimeType(file))}
                      <Lock className="absolute -bottom-1 -right-1 w-5 h-5 text-amber-400 bg-slate-800 rounded-full p-0.5" />
                    </div>
                  ) : (
                    getFileIcon(getEffectiveMimeType(file))
                  )}
                </div>
              )}
              
              <h1 className="text-xl font-bold text-white mb-2 break-words">{file.nome}</h1>
              <p className="text-white/60 text-sm mb-6">{formatFileSize(file.tamanho)}</p>
              
              {/* Preview Button for previewable files - not for encrypted files */}
              {!file.isEncrypted && canPreview(file) && (
                <button
                  onClick={openFullPreview}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium transition-colors mb-3"
                  data-testid="button-preview"
                >
                  {getEffectiveMimeType(file).startsWith("video/") ? (
                    <>
                      <Play className="w-5 h-5" />
                      Reproduzir
                    </>
                  ) : (
                    <>
                      <Maximize2 className="w-5 h-5" />
                      Ver em Grande
                    </>
                  )}
                </button>
              )}
              
              <button
                onClick={handleDownload}
                className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-primary hover:bg-primary/80 text-white font-bold text-lg transition-colors"
                data-testid="button-download"
              >
                <Download className="w-5 h-5" />
                Fazer Download
              </button>
              
              <p className="text-white/40 text-xs mt-6">
                Partilhado via AngoCloud • {share.downloadCount} downloads
              </p>
            </div>
          ) : null}
        </motion.div>
      </div>

      {/* Full Preview Modal */}
      <AnimatePresence>
        {showFullPreview && file && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4"
            onClick={() => setShowFullPreview(false)}
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
                  <p className="text-white font-medium truncate">{file.nome}</p>
                  <p className="text-white/50 text-sm">{formatFileSize(file.tamanho)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDownload}
                    className="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
                    title="Download"
                  >
                    <Download className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={() => setShowFullPreview(false)} 
                    className="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              
              {/* Content */}
              <div className="flex-1 flex items-center justify-center bg-black/50 rounded-xl overflow-hidden min-h-[300px]">
                {loadingPreview ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    <p className="text-white/50 text-sm">A carregar...</p>
                  </div>
                ) : previewUrl ? (
                  getEffectiveMimeType(file).startsWith("image/") ? (
                    <img 
                      src={previewUrl} 
                      alt={file.nome}
                      className="max-w-full max-h-[70vh] object-contain"
                    />
                  ) : getEffectiveMimeType(file).startsWith("video/") ? (
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
                  ) : getEffectiveMimeType(file).startsWith("audio/") ? (
                    <div className="flex flex-col items-center gap-4 p-8">
                      <Music className="w-20 h-20 text-white/50" />
                      <audio src={previewUrl} controls autoPlay className="w-full max-w-md" />
                    </div>
                  ) : getEffectiveMimeType(file) === "application/pdf" ? (
                    <iframe 
                      src={previewUrl} 
                      className="w-full h-[70vh]"
                      title={file.nome}
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-4 p-8">
                      {getFileIcon(getEffectiveMimeType(file))}
                      <p className="text-white/70 text-center">
                        Preview não disponível para este tipo de ficheiro.
                      </p>
                    </div>
                  )
                ) : (
                  <div className="flex flex-col items-center gap-4 p-8">
                    {getFileIcon(getEffectiveMimeType(file))}
                    <p className="text-white/50">Não foi possível carregar o preview</p>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
          )}
        </AnimatePresence>

        {/* Footer */}
        <footer className="py-6 px-6 md:px-12 text-center">
          <p className="text-white/50 text-sm">
            &copy; 2024 AngoCloud. A nuvem de Angola.
          </p>
        </footer>
      </div>
    </>
  );
}
