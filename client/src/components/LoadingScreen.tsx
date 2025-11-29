import { useState, useEffect } from "react";
import loadingBgImage from "@/assets/loading-background.jpg";

interface LoadingScreenProps {
  isVisible: boolean;
}

export default function LoadingScreen({ isVisible }: LoadingScreenProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsMobile(window.innerWidth < 768);
  }, []);

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center transition-opacity ${
        isMobile ? 'duration-200' : 'duration-300'
      } ease-out will-change-opacity ${
        isVisible ? 'opacity-100 pointer-events-auto visible' : 'opacity-0 pointer-events-none invisible'
      }`}
      style={{
        margin: 0,
        padding: 0
      }}
    >
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: `url(${loadingBgImage})`,
        }}
      />
      
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900/80 via-purple-900/60 to-slate-900/80" />
      
      <div className="relative flex flex-col items-center gap-6">
        <div className="text-center">
          <h1 className={`${isMobile ? 'text-3xl' : 'text-4xl'} font-bold bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent`}>
            OrbitalCloud
          </h1>
          <p className="text-cyan-300/80 text-xs mt-2 font-medium tracking-wider">
            Carregando...
          </p>
        </div>

        <div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
      </div>
    </div>
  );
}
