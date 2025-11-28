import { ThreeDCard, ThreeDCardBody, ThreeDCardItem } from "@/components/ui/3d-card";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Check, Cloud, Server, Lock, HardDrive, Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import VideoBackground from "@/components/ui/video-background";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import LoadingScreen from "@/components/LoadingScreen";
import { useIsMobile } from "@/hooks/use-mobile";

// Import assets
import heroImage from "@assets/generated_images/minimalist_cloud_storage_icon.png";
import cubeImage from "@assets/generated_images/3d_abstract_floating_cube.png";
import heroVideo from "@assets/4354033-hd_1280_720_25fps_1764245575076.mp4";

export default function Home() {
  const [, navigate] = useLocation();
  const { isLoggedIn } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [videosLoaded, setVideosLoaded] = useState(0);
  const totalVideos = 2; // Hero video + Pricing video
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isLoggedIn) {
      navigate("/dashboard");
    }
  }, [isLoggedIn, navigate]);

  useEffect(() => {
    // When all videos are loaded, wait 4 seconds then hide loading screen
    if (videosLoaded === totalVideos) {
      const timer = setTimeout(() => {
        setIsLoading(false);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [videosLoaded]);

  const handleVideoLoaded = () => {
    setVideosLoaded(prev => Math.min(prev + 1, totalVideos));
  };

  const handleNavigateWithLoading = (path: string) => {
    setIsLoading(true);
    // Reset video loaded state when navigating away
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
  const pricingPlans = [
    {
      name: "Grátis",
      storage: "15 GB",
      price: "Kz 0",
      features: ["Armazenamento Básico", "Encriptação Ponta-a-Ponta", "Acesso Web", "Suporte da Comunidade"],
      highlight: false,
    },
    {
      name: "Plus",
      storage: "100 GB",
      price: "Kz 2.500",
      period: "/mês",
      features: ["Encriptação Ponta-a-Ponta", "Backup Automático", "Suporte Prioritário"],
      highlight: true,
    },
    {
      name: "Pro",
      storage: "500 GB",
      price: "Kz 7.500",
      period: "/mês",
      features: ["Encriptação Ponta-a-Ponta", "Colaboração em Tempo Real", "API de Acesso"],
      highlight: false,
    },
    {
      name: "Empresas",
      storage: "Ilimitado",
      price: "Kz 25.000",
      period: "/mês",
      features: ["Encriptação Ponta-a-Ponta", "SLA Garantido", "Suporte Dedicado 24/7"],
      highlight: false,
    },
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
          <span className="text-white drop-shadow-md">OrbitalDrive</span>
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
          <motion.div 
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="z-20"
          >
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/30 bg-white/5 backdrop-blur-md text-xs font-medium text-white mb-6"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
              </span>
              A Nuvem de Angola
            </motion.div>
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
              className="text-3xl sm:text-4xl md:text-7xl font-display font-bold leading-[1.1] mb-6 text-white drop-shadow-lg"
            >
              Armazenamento <br />
              <span className="bg-gradient-to-r from-white to-white/90 bg-clip-text text-transparent drop-shadow-lg">Sem Fronteiras</span>
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: "easeOut", delay: 0.3 }}
              className="text-sm sm:text-base md:text-lg text-white/90 mb-8 leading-relaxed drop-shadow-md"
            >
              Guarde, partilhe e aceda aos seus ficheiros com a velocidade de servidores locais. 15GB grátis para todos os angolanos, sem truques.
            </motion.p>
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: "easeOut", delay: 0.4 }}
              className="flex flex-col sm:flex-row gap-4"
            >
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
            </motion.div>
            
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: "easeOut", delay: 0.5 }}
              className="mt-8 md:mt-12 flex flex-col sm:flex-row sm:gap-8 gap-4 text-xs sm:text-sm font-medium text-white/80"
            >
              <motion.div 
                whileHover={{ x: 5 }}
                transition={{ duration: 0.3 }}
                className="flex items-center gap-2"
              >
                <Lock className="w-4 h-4 text-white" />
                <span>Encriptado</span>
              </motion.div>
              <motion.div 
                whileHover={{ x: 5 }}
                transition={{ duration: 0.3 }}
                className="flex items-center gap-2"
              >
                <Server className="w-4 h-4 text-white" />
                <span>Alta Velocidade</span>
              </motion.div>
              <motion.div 
                whileHover={{ x: 5 }}
                transition={{ duration: 0.3 }}
                className="flex items-center gap-2"
              >
                <Cloud className="w-4 h-4 text-white" />
                <span>15GB Grátis</span>
              </motion.div>
            </motion.div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.2 }}
            className="relative h-[500px] w-full flex items-center justify-center hidden md:flex"
          />
        </div>
      </section>
      {/* Features Grid */}
      <section id="features" className="py-24 px-6 md:px-12 relative overflow-hidden" style={{
        backgroundImage: 'url(/features-bg.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}>
        <div className="max-w-7xl mx-auto relative z-10">
          <motion.div 
            className="text-center mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            viewport={{ once: true, margin: "-100px" }}
          >
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold mb-4 text-white">Tecnologia de Ponta</h2>
            <p className="text-white/80 max-w-2xl mx-auto">
              Infraestrutura local otimizada para a rede de internet angolana, garantindo a menor latência possível.
            </p>
          </motion.div>

          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6 md:gap-8">
            {[
              { title: "Infraestrutura com Bots", desc: "Múltiplos bots com load balancing automático, retry/fallback e failover inteligente. Suporta até 10 bots simultâneos com health checks em tempo real.", icon: Server },
              { title: "Criptografia AES-256-GCM", desc: "Encriptação cliente-side (zero-knowledge). Chaves derivadas com PBKDF2 da password do utilizador. Ficheiros encriptados no browser antes do upload, sem acesso do servidor aos dados.", icon: Lock },
              { title: "Sincronização e Resiliência", desc: "Exponential backoff com jitter, tratamento automático de rate limits, recovery automático de bots bloqueados e logging detalhado para monitoramento.", icon: HardDrive },
            ].map((feature, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: isMobile ? 0 : 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                whileHover={isMobile ? {} : { y: -5 }}
                transition={{ duration: isMobile ? 0.3 : 0.6, ease: "easeOut", delay: isMobile ? 0 : i * 0.1 }}
                viewport={{ once: true, margin: "-100px" }}
                className="backdrop-blur-md bg-white/10 p-8 rounded-2xl border border-white/20 hover:border-white/40 transition-all duration-300 ease-out group"
              >
                <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center mb-6 group-hover:bg-white/30 transition-colors">
                  <feature.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-bold mb-3 text-white">{feature.title}</h3>
                <p className="text-white/70 leading-relaxed">{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
      {/* Pricing Section with Footer */}
      <section id="pricing" className="relative min-h-screen py-24 px-6 md:px-12 overflow-hidden flex flex-col">
        {/* Video Background Container */}
        <div className="absolute inset-0 z-0">
          <video
            key="pricing-video"
            autoPlay
            muted
            loop
            playsInline
            onCanPlay={handleVideoLoaded}
            className="w-full h-full object-cover"
          >
            <source src="/pricing-video.mp4" type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-black/40" />
        </div>
        
        <div className="max-w-7xl mx-auto relative z-10 w-full flex-1 flex items-center">
          <div className="w-full">
            <motion.div 
              className="text-center mb-16"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              viewport={{ once: true, margin: "-100px" }}
            >
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold mb-4 text-white">Planos Flexíveis</h2>
              <p className="text-white/80">Escolha o espaço que você precisa.</p>
            </motion.div>

            <div className="flex flex-wrap justify-center gap-4 md:gap-8">
              {pricingPlans.map((plan, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: isMobile ? 0 : 40 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: isMobile ? 0.3 : 0.6, ease: "easeOut", delay: isMobile ? 0 : i * 0.12 }}
                  viewport={{ once: true, margin: "-100px" }}
                >
                  <ThreeDCard className="w-full md:w-auto" containerClassName="md:!py-0">
                    <ThreeDCardBody className="backdrop-blur-3xl bg-transparent relative group/card hover:shadow-lg hover:shadow-white/10 transition-all duration-500 ease-out w-full sm:w-[280px] md:w-[350px] h-auto rounded-xl p-4 md:p-6 border border-white/30">
                    <ThreeDCardItem
                      translateZ="50"
                      className="text-xl font-bold text-white"
                    >
                      {plan.name}
                    </ThreeDCardItem>
                    
                    <ThreeDCardItem
                      as="p"
                      translateZ="60"
                      className="text-white/70 text-sm max-w-sm mt-2"
                    >
                      Ideal para {plan.name === 'Empresas' ? 'negócios' : 'uso pessoal'}
                    </ThreeDCardItem>

                    <ThreeDCardItem translateZ="75" className="mt-4 mb-6 inline-block">
                      <div className="bg-white/10 px-4 py-2 rounded-lg border border-white/30">
                        <span className="text-3xl font-bold text-white font-display">{plan.storage}</span>
                        <span className="text-xs text-white/60 ml-1">de armazenamento</span>
                      </div>
                    </ThreeDCardItem>
                    
                    <ThreeDCardItem translateZ="80" className="mb-8">
                      <span className="text-4xl font-bold font-display text-white">{plan.price}</span>
                      {plan.period && <span className="text-white/60 text-sm">{plan.period}</span>}
                    </ThreeDCardItem>
                    
                    <div className="space-y-3 mb-8">
                      {plan.features.map((feature, idx) => (
                        <ThreeDCardItem 
                          key={idx} 
                          translateZ={40 + (idx * 5)}
                          className="flex items-center gap-3 text-sm text-white/70"
                        >
                          <Check className="w-4 h-4 text-white" />
                          {feature}
                        </ThreeDCardItem>
                      ))}
                    </div>

                    <ThreeDCardItem
                      translateZ={50}
                      as="div"
                      className="w-full"
                    >
                      <Button 
                        onClick={handleSelectPlan}
                        className="w-full rounded-lg font-bold bg-white/10 hover:bg-white/20 text-white border border-white/30 hover:border-white/50 backdrop-blur-md transition-all duration-300"
                      >
                        Selecionar Plano
                      </Button>
                    </ThreeDCardItem>
                  </ThreeDCardBody>
                </ThreeDCard>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer inside section */}
        <footer className="relative z-10 py-12 border-t border-white/20">
          <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row justify-between items-center gap-4 md:gap-6 text-center md:text-left">
            <div className="flex items-center gap-2 font-display font-bold text-xl text-white">
              <Cloud className="w-6 h-6 text-white" />
              <span>OrbitalDrive</span>
            </div>
            <div className="text-sm text-white/70 flex items-center gap-2">
              <span>&copy; 2024 OrbitalDrive. Feito em Luanda com</span>
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 0.6, repeat: Infinity }}
                className="inline-block"
              >
                <Heart className="w-4 h-4 text-red-500 fill-red-500" />
              </motion.div>
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