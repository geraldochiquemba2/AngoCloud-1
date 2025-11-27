import { Cloud, Download, FileText, File, Image, Video, Music, FileArchive, FileCode, AlertCircle, X, Play, Maximize2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation, useRoute } from "wouter";
import { useEffect, useState, useCallback } from "react";

interface FileInfo {
  id: string;
  nome: string;
  tamanho: number;
  tipoMime: string;
  createdAt: string;
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
  const [file, setFile] = useState<FileInfo | null>(null);
  const [share, setShare] = useState<ShareInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFullPreview, setShowFullPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

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
        
        if (data.file.tipoMime.startsWith("image/") || data.file.tipoMime.startsWith("video/")) {
          loadThumbnail(linkCode, data.file.tipoMime);
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
            const thumbnailDataUrl = canvas.toDataURL("image/jpeg", 0.8);
            video.src = "";
            resolve(thumbnailDataUrl);
          } else {
            reject(new Error("Could not get canvas context"));
          }
        } catch (err) {
          reject(err);
        }
      };
      
      video.onerror = () => {
        clearTimeout(timeoutId);
        reject(new Error("Video load error"));
      };
      
      video.src = videoUrl;
    });
  }, []);

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
      if (file.tipoMime.startsWith("video/") || file.tipoMime.startsWith("audio/")) {
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

  const canPreview = (mimeType: string) => {
    return mimeType.startsWith("image/") || 
           mimeType.startsWith("video/") || 
           mimeType.startsWith("audio/") ||
           mimeType === "application/pdf";
  };

  return (
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
              {/* Preview Thumbnail */}
              {(file.tipoMime.startsWith("image/") || file.tipoMime.startsWith("video/")) && (
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
                        {file.tipoMime.startsWith("video/") ? (
                          <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                            <Play className="w-8 h-8 text-white ml-1" />
                          </div>
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                            <Maximize2 className="w-6 h-6 text-white" />
                          </div>
                        )}
                      </div>
                      {file.tipoMime.startsWith("video/") && (
                        <div className="absolute bottom-2 right-2 bg-black/60 px-2 py-1 rounded text-xs text-white flex items-center gap-1">
                          <Video className="w-3 h-3" />
                          Vídeo
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="w-full h-48 bg-gradient-to-br from-purple-900/50 to-slate-900/50 flex items-center justify-center">
                      {file.tipoMime.startsWith("video/") ? (
                        <Video className="w-16 h-16 text-white/60" />
                      ) : (
                        <Image className="w-16 h-16 text-white/60" />
                      )}
                    </div>
                  )}
                </div>
              )}
              
              {/* File Icon for non-media files */}
              {!file.tipoMime.startsWith("image/") && !file.tipoMime.startsWith("video/") && (
                <div className="mb-6 flex justify-center">
                  {getFileIcon(file.tipoMime)}
                </div>
              )}
              
              <h1 className="text-xl font-bold text-white mb-2 break-words">{file.nome}</h1>
              <p className="text-white/60 text-sm mb-6">{formatFileSize(file.tamanho)}</p>
              
              {/* Preview Button for previewable files */}
              {canPreview(file.tipoMime) && (
                <button
                  onClick={openFullPreview}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium transition-colors mb-3"
                  data-testid="button-preview"
                >
                  {file.tipoMime.startsWith("video/") ? (
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
                  file.tipoMime.startsWith("image/") ? (
                    <img 
                      src={previewUrl} 
                      alt={file.nome}
                      className="max-w-full max-h-[70vh] object-contain"
                    />
                  ) : file.tipoMime.startsWith("video/") ? (
                    <video 
                      src={previewUrl} 
                      controls 
                      autoPlay
                      className="max-w-full max-h-[70vh]"
                    />
                  ) : file.tipoMime.startsWith("audio/") ? (
                    <div className="flex flex-col items-center gap-4 p-8">
                      <Music className="w-20 h-20 text-white/50" />
                      <audio src={previewUrl} controls autoPlay className="w-full max-w-md" />
                    </div>
                  ) : file.tipoMime === "application/pdf" ? (
                    <iframe 
                      src={previewUrl} 
                      className="w-full h-[70vh]"
                      title={file.nome}
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-4 p-8">
                      {getFileIcon(file.tipoMime)}
                      <p className="text-white/70 text-center">
                        Preview não disponível para este tipo de ficheiro.
                      </p>
                    </div>
                  )
                ) : (
                  <div className="flex flex-col items-center gap-4 p-8">
                    {getFileIcon(file.tipoMime)}
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
  );
}
