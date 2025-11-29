import { useState, useEffect } from "react";
import { AlertTriangle, X, Info } from "lucide-react";

interface BetaWarningBannerProps {
  variant?: "banner" | "inline";
  dismissible?: boolean;
}

interface SystemLimits {
  limits: {
    FREE_STORAGE_GB: number;
    MAX_FILE_SIZE_MB: number;
    DAILY_UPLOAD_LIMIT_FREE: number;
  };
  isBeta: boolean;
  betaMessage: string;
}

export default function BetaWarningBanner({ variant = "banner", dismissible = true }: BetaWarningBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const [limits, setLimits] = useState<SystemLimits | null>(null);

  useEffect(() => {
    const dismissedKey = "beta_warning_dismissed";
    const dismissedTime = localStorage.getItem(dismissedKey);
    
    if (dismissedTime) {
      const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
      if (parseInt(dismissedTime) > dayAgo) {
        setDismissed(true);
      } else {
        localStorage.removeItem(dismissedKey);
      }
    }

    fetch("/api/system/limits")
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch limits');
        return res.json();
      })
      .then(data => setLimits(data))
      .catch(() => {
        setLimits({
          limits: {
            FREE_STORAGE_GB: 5,
            MAX_FILE_SIZE_MB: 100,
            DAILY_UPLOAD_LIMIT_FREE: 20,
          },
          isBeta: true,
          betaMessage: "OrbitalCloud está em fase beta. Mantenha cópias locais dos seus ficheiros importantes.",
        });
      });
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem("beta_warning_dismissed", Date.now().toString());
  };

  if (dismissed || !limits?.isBeta) return null;

  if (variant === "inline") {
    return (
      <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
        <Info className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
        <div className="flex-1 text-sm">
          <p className="text-amber-200 font-medium">Serviço em Fase Beta</p>
          <p className="text-amber-200/70 mt-1">
            {limits.betaMessage}
          </p>
          <ul className="text-amber-200/70 mt-2 space-y-1 text-xs">
            <li>• Armazenamento grátis: {limits.limits.FREE_STORAGE_GB}GB</li>
            <li>• Tamanho máximo por ficheiro: {limits.limits.MAX_FILE_SIZE_MB}MB</li>
            <li>• Uploads diários (grátis): {limits.limits.DAILY_UPLOAD_LIMIT_FREE}</li>
          </ul>
        </div>
        {dismissible && (
          <button
            onClick={handleDismiss}
            className="text-amber-400/70 hover:text-amber-400 transition-colors"
            aria-label="Fechar aviso"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div 
      className="fixed top-0 left-0 right-0 z-[100] bg-gradient-to-r from-amber-600/90 to-orange-600/90 backdrop-blur-sm"
      data-testid="beta-warning-banner"
    >
      <div className="max-w-7xl mx-auto px-4 py-2">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-white flex-shrink-0" />
            <p className="text-white text-sm font-medium">
              <span className="font-bold">Beta:</span> {limits.betaMessage}
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-4 text-white/80 text-xs">
              <span>{limits.limits.FREE_STORAGE_GB}GB grátis</span>
              <span>•</span>
              <span>Max {limits.limits.MAX_FILE_SIZE_MB}MB/ficheiro</span>
            </div>
            
            {dismissible && (
              <button
                onClick={handleDismiss}
                className="text-white/70 hover:text-white transition-colors p-1"
                aria-label="Fechar aviso"
                data-testid="dismiss-beta-warning"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function BetaInfoCard() {
  const [limits, setLimits] = useState<SystemLimits | null>(null);

  useEffect(() => {
    fetch("/api/system/limits")
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch limits');
        return res.json();
      })
      .then(data => setLimits(data))
      .catch(() => {
        setLimits({
          limits: {
            FREE_STORAGE_GB: 5,
            MAX_FILE_SIZE_MB: 100,
            DAILY_UPLOAD_LIMIT_FREE: 20,
          },
          isBeta: true,
          betaMessage: "OrbitalCloud está em fase beta. Mantenha cópias locais dos seus ficheiros importantes.",
        });
      });
  }, []);

  if (!limits?.isBeta) return null;

  return (
    <div className="rounded-xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/20 p-6">
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-full bg-amber-500/20">
          <AlertTriangle className="w-6 h-6 text-amber-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-amber-200">Serviço em Fase Beta</h3>
          <p className="text-amber-200/70 mt-2 text-sm leading-relaxed">
            {limits.betaMessage}
          </p>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
            <div className="bg-white/5 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-amber-400">{limits.limits.FREE_STORAGE_GB}GB</div>
              <div className="text-xs text-amber-200/60 mt-1">Armazenamento Grátis</div>
            </div>
            <div className="bg-white/5 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-amber-400">{limits.limits.MAX_FILE_SIZE_MB}MB</div>
              <div className="text-xs text-amber-200/60 mt-1">Max por Ficheiro</div>
            </div>
            <div className="bg-white/5 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-amber-400">{limits.limits.DAILY_UPLOAD_LIMIT_FREE}</div>
              <div className="text-xs text-amber-200/60 mt-1">Uploads/Dia</div>
            </div>
          </div>
          
          <div className="mt-4 p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
            <p className="text-xs text-amber-200/80 flex items-start gap-2">
              <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                <strong>Importante:</strong> Recomendamos manter cópias locais dos seus ficheiros importantes.
                O serviço está em desenvolvimento e pode ter interrupções ocasionais.
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
