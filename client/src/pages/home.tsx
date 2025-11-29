import { Button } from "@/components/ui/button";
import { Check, Cloud, Server, Lock, HardDrive, Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import VideoBackground from "@/components/ui/video-background";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import LoadingScreen from "@/components/LoadingScreen";
import { useIsMobile } from "@/hooks/use-mobile";

import heroImage from "@assets/generated_images/minimalist_cloud_storage_icon.png";
import cubeImage from "@assets/generated_images/3d_abstract_floating_cube.png";
import heroVideo from "@assets/4354033-hd_1280_720_25fps_1764245575076.mp4";
import pricingPoster from "@assets/generated_images/pricing_video_first_frame.png";

export default function Home() {
  const [, navigate] = useLocation();
  const { isLoggedIn } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [videosLoaded, setVideosLoaded] = useState(0);
  const totalVideos = 2;
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isLoggedIn) {
      navigate("/dashboard");
    }
  }, [isLoggedIn, navigate]);

  useEffect(() => {
    const timeout = isMobile ? 2000 : 3000;
    
    if (videosLoaded >= 1 || isMobile) {
      const timer = setTimeout(() => {
        setIsLoading(false);
      }, timeout);
      return () => clearTimeout(timer);
    }
  }, [videosLoaded, isMobile]);

  const handleVideoLoaded = () => {
    setVideosLoaded(prev => Math.min(prev + 1, totalVideos));
  };

  const handleNavigateWithLoading = (path: string) => {
    setIsLoading(true);
    setVideosLoaded(0);
    setTimeout(() => {
      navigate(path);
    }, 100);
  };

  const handleSelectPlan = () => {
    if (isLoggedIn) {
      handleNavigateWithLoading("/dashboard");
    } else {
      handleNavigateWithLoading("/login");
    }
  };
  const pricingExamples = [
    { gb: 1, price: 500 },
    { gb: 5, price: 2500 },
    { gb: 10, price: 5000 },
    { gb: 50, price: 25000 },
    { gb: 100, price: 50000 },
  ];

  return (
    <>
      <LoadingScreen isVisible={isLoading} />
      <div className="min-h-screen w-screen max-w-full overflow-x-hidden bg-background text-foreground selection:bg-primary/10">
      {/* Background Elements */}
      <div className="fixed inset-0 z-[-1]">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-accent/3 blur-[120px]" />
      </div>
      {/* Navigation */}
      <nav className="w-full py-6 px-6 md:px-12 flex justify-between items-center z-50 absolute top-0 left-0">
        <button 
          onClick={() => window.location.href = "/"}
          className="flex items-center gap-2 font-display font-bold text-xl sm:text-2xl tracking-tighter cursor-pointer hover:opacity-80 transition-opacity bg-transparent border-none"
        >
          <Cloud className="w-6 sm:w-8 h-6 sm:h-8 text-white fill-white/20" />
          <span className="text-white drop-shadow-md">OrbitalCloud</span>
        </button>
        <div className="hidden md:flex gap-8 items-center font-medium text-sm text-white/80">
          <a href="#features" className="hover:text-white transition-colors cursor-pointer">Funcionalidades</a>
          <a href="#pricing" className="hover:text-white transition-colors cursor-pointer">Preços</a>
          <button onClick={() => handleNavigateWithLoading("/about")} className="hover:text-white transition-colors cursor-pointer bg-transparent border-none text-inherit">Sobre</button>
        </div>
        <div className="flex gap-2 md:gap-4">
          <button onClick={() => handleNavigateWithLoading("/login")} className="text-white rounded-full px-4 sm:px-6 text-xs sm:text-base border border-white/30 bg-white/5 hover:bg-white/15 hover:border-white/50 backdrop-blur-sm transition-all cursor-pointer bg-transparent">Login</button>
          <button onClick={() => handleNavigateWithLoading("/signup")} className="text-white rounded-full px-4 sm:px-6 font-bold border border-white/30 bg-white/5 hover:bg-white/15 hover:border-white/50 backdrop-blur-sm transition-all shadow-lg shadow-white/10 text-xs sm:text-base cursor-pointer bg-transparent">
            Criar Conta
          </button>
        </div>
      </nav>
      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center pt-20 px-6 md:px-12 overflow-hidden">
        {/* Video Background */}
        <div className="absolute inset-0 z-0">
          <VideoBackground videoSrc={heroVideo} posterSrc={heroImage} onLoad={handleVideoLoaded} />
        </div>

        <div className="grid md:grid-cols-2 gap-6 md:gap-12 items-center w-full max-w-7xl mx-auto relative z-10">
          <div className="z-20">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/30 bg-white/5 backdrop-blur-md text-xs font-medium text-white mb-6">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
              </span>
              A Nuvem de Angola
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-7xl font-display font-bold leading-[1.1] mb-6 text-white drop-shadow-lg">
              Armazenamento <br />
              <span className="bg-gradient-to-r from-white to-white/90 bg-clip-text text-transparent drop-shadow-lg">Sem Fronteiras</span>
            </h1>
            <p className="text-sm sm:text-base md:text-lg text-white/90 mb-8 leading-relaxed drop-shadow-md">
              Guarde, partilhe e aceda aos seus ficheiros com a velocidade de servidores locais. 15GB grátis para todos os angolanos, sem truques.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button onClick={() => handleNavigateWithLoading("/signup")} size="lg" className="bg-white/10 hover:bg-white/20 text-white h-11 sm:h-12 px-6 sm:px-8 rounded-full backdrop-blur-md border border-white/30 hover:border-white/50 text-sm sm:text-base font-bold transition-all duration-300">
                Começar Grátis
              </Button>
              <button 
                onClick={() => {
                  const element = document.getElementById("pricing");
                  element?.scrollIntoView({ behavior: "smooth" });
                }}
                className="h-12 px-8 rounded-full border-white/30 bg-white/5 hover:bg-white/15 text-white text-base backdrop-blur-sm hover:border-white/50 transition-all duration-300 border font-bold"
              >
                Ver Planos
              </button>
            </div>
            
            <div className="mt-8 md:mt-12 flex flex-col sm:flex-row sm:gap-8 gap-4 text-xs sm:text-sm font-medium text-white/80">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-white" />
                <span>Encriptado</span>
              </div>
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-white" />
                <span>Alta Velocidade</span>
              </div>
              <div className="flex items-center gap-2">
                <Cloud className="w-4 h-4 text-white" />
                <span>20GB Grátis</span>
              </div>
            </div>
          </div>

          <div className="relative h-[500px] w-full flex items-center justify-center hidden md:flex" />
        </div>
      </section>
      {/* Features Grid */}
      <section id="features" className="py-24 px-6 md:px-12 relative overflow-hidden" style={{
        backgroundImage: 'url(/features-bg.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}>
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center mb-16">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold mb-4 text-white">Tecnologia de Ponta</h2>
            <p className="text-white/80 max-w-2xl mx-auto">
              Infraestrutura local otimizada para a rede de internet angolana, garantindo a menor latência possível.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6 md:gap-8">
            {[
              { title: "Infraestrutura com Bots", desc: "Múltiplos bots com load balancing automático, retry/fallback e failover inteligente. Suporta até 10 bots simultâneos com health checks em tempo real.", icon: Server },
              { title: "Criptografia AES-256-GCM", desc: "Encriptação cliente-side (zero-knowledge). Chaves derivadas com PBKDF2 da password do utilizador. Ficheiros encriptados no browser antes do upload, sem acesso do servidor aos dados.", icon: Lock },
              { title: "Sincronização e Resiliência", desc: "Exponential backoff com jitter, tratamento automático de rate limits, recovery automático de bots bloqueados e logging detalhado para monitoramento.", icon: HardDrive },
            ].map((feature, i) => (
              <div 
                key={i}
                className="backdrop-blur-md bg-white/10 p-8 rounded-2xl border border-white/20 hover:border-white/40 transition-all duration-300 ease-out group"
              >
                <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center mb-6 group-hover:bg-white/30 transition-colors">
                  <feature.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-bold mb-3 text-white">{feature.title}</h3>
                <p className="text-white/70 leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      {/* Pricing Section with Footer */}
      <section id="pricing" className="relative min-h-screen py-24 px-6 md:px-12 overflow-hidden flex flex-col">
        {/* Video Background Container */}
        <div className="absolute inset-0 z-0">
          {/* Poster image - always visible until video loads */}
          <img 
            src={pricingPoster} 
            alt="Background" 
            className="absolute inset-0 w-full h-full object-cover"
            style={{ zIndex: 1 }}
          />
          <video
            key="pricing-video"
            autoPlay
            muted
            loop
            playsInline
            preload={isMobile ? "metadata" : "auto"}
            onCanPlay={handleVideoLoaded}
            onLoadedData={handleVideoLoaded}
            className="absolute inset-0 w-full h-full object-cover"
            style={{ zIndex: 2 }}
          >
            <source src="/pricing-video.mp4" type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-black/40" style={{ zIndex: 3 }} />
        </div>
        
        <div className="max-w-7xl mx-auto relative z-10 w-full flex-1 flex items-center">
          <div className="w-full">
            <div className="text-center mb-12">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold mb-4 text-white">Preços Simples</h2>
              <p className="text-white/80 text-lg">20GB grátis para sempre + pague apenas pelo que precisar</p>
            </div>

            <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
              {/* Plano Grátis */}
              <div className="backdrop-blur-xl bg-white/10 p-8 rounded-2xl border border-white/30 hover:border-white/50 transition-all">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                    <Cloud className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-white">Grátis</h3>
                    <p className="text-white/60 text-sm">Para sempre</p>
                  </div>
                </div>
                
                <div className="mb-6">
                  <span className="text-5xl font-bold font-display text-white">20GB</span>
                  <span className="text-white/60 ml-2">incluídos</span>
                </div>
                
                <div className="space-y-3 mb-8">
                  {["Encriptação Ponta-a-Ponta", "Acesso Web Ilimitado", "Partilha de Ficheiros", "Suporte da Comunidade"].map((feature, idx) => (
                    <div key={idx} className="flex items-center gap-3 text-white/80">
                      <Check className="w-4 h-4 text-green-400" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>

                <Button 
                  onClick={handleSelectPlan}
                  className="w-full rounded-lg font-bold bg-white/10 hover:bg-white/20 text-white border border-white/30 hover:border-white/50 backdrop-blur-md transition-all duration-300 h-12"
                >
                  Começar Grátis
                </Button>
              </div>

              {/* Espaço Extra */}
              <div className="backdrop-blur-xl bg-white/10 p-8 rounded-2xl border-2 border-white/50 hover:border-white/70 transition-all relative">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white text-black text-xs font-bold px-4 py-1 rounded-full">
                  PAGUE POR GB
                </div>
                
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                    <HardDrive className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-white">Espaço Extra</h3>
                    <p className="text-white/60 text-sm">Aprovado pelo admin</p>
                  </div>
                </div>
                
                <div className="mb-6">
                  <span className="text-5xl font-bold font-display text-white">500 Kz</span>
                  <span className="text-white/60 ml-2">por GB</span>
                </div>
                
                <div className="bg-white/5 rounded-xl p-4 mb-6 border border-white/20">
                  <p className="text-white/70 text-sm mb-3 font-medium">Exemplos:</p>
                  <div className="space-y-2">
                    {pricingExamples.slice(0, 4).map((example, idx) => (
                      <div key={idx} className="flex justify-between text-sm">
                        <span className="text-white/60">+{example.gb} GB</span>
                        <span className="text-white font-medium">{example.price.toLocaleString()} Kz</span>
                      </div>
                    ))}
                  </div>
                </div>

                <Button 
                  onClick={handleSelectPlan}
                  className="w-full rounded-lg font-bold bg-white text-black hover:bg-white/90 transition-all duration-300 h-12"
                >
                  Pedir Mais Espaço
                </Button>
              </div>
            </div>

            <p className="text-center text-white/50 text-sm mt-8">
              O pagamento é único e o espaço extra é para sempre. Aprovação pelo administrador em até 24h.
            </p>
          </div>
        </div>

        {/* Footer inside section */}
        <footer className="relative z-10 py-12 border-t border-white/20">
          <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row justify-between items-center gap-4 md:gap-6 text-center md:text-left">
            <div className="flex items-center gap-2 font-display font-bold text-xl text-white">
              <Cloud className="w-6 h-6 text-white" />
              <span>OrbitalCloud</span>
            </div>
            <div className="text-sm text-white/70 flex items-center gap-2">
              <span>&copy; 2024 OrbitalCloud. Feito em Luanda com</span>
              <Heart className="w-4 h-4 text-red-500 fill-red-500" />
            </div>
            <div className="flex gap-6">
               {/* Social icons would go here */}
            </div>
          </div>
        </footer>
      </section>
      </div>
    </>
  );
}
