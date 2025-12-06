import { Button } from "@/components/ui/button";
import { Check, Cloud, Server, Lock, HardDrive, Heart, Mail, Phone, FileText, X, Files, Database } from "lucide-react";
import { cn } from "@/lib/utils";
import VideoBackground from "@/components/ui/video-background";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import LoadingScreen from "@/components/LoadingScreen";
import { useIsMobile } from "@/hooks/use-mobile";
import { motion, AnimatePresence } from "framer-motion";

import heroImage from "@assets/generated_images/minimalist_cloud_storage_icon.png";
import cubeImage from "@assets/generated_images/3d_abstract_floating_cube.png";
import heroVideo from "@assets/4354033-hd_1280_720_25fps_1764245575076.mp4";
import pricingPoster from "@assets/generated_images/pricing_video_first_frame.png";

interface PlatformStats {
  ficheiros: number;
  armazenamentoUsado: number;
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

export default function Home() {
  const [, navigate] = useLocation();
  const { isLoggedIn } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [videosLoaded, setVideosLoaded] = useState(0);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [platformStats, setPlatformStats] = useState<PlatformStats | null>(null);
  const totalVideos = 2;
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isLoggedIn) {
      navigate("/dashboard");
    }
  }, [isLoggedIn, navigate]);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch("/api/stats");
        if (response.ok) {
          const data = await response.json();
          setPlatformStats({
            ficheiros: data.ficheiros,
            armazenamentoUsado: data.armazenamentoUsado
          });
        }
      } catch (error) {
        console.error("Erro ao buscar estatísticas:", error);
      }
    };
    
    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

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
      {/* Support Bar */}
      <div className="w-full py-2 px-4 md:px-12 bg-black/40 backdrop-blur-sm border-b border-white/10 z-50 fixed top-0 left-0">
        <div className="max-w-7xl mx-auto flex flex-wrap justify-center md:justify-end items-center gap-4 text-xs text-white/80">
          <a href="mailto:OrbitalCloud@outlook.com.br" className="flex items-center gap-1.5 hover:text-white transition-colors">
            <Mail className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">OrbitalCloud@outlook.com.br</span>
            <span className="sm:hidden">Email</span>
          </a>
          <span className="text-white/50 hidden md:inline">|</span>
          <button 
            onClick={() => setShowTermsModal(true)}
            className="flex items-center gap-1.5 hover:text-white transition-colors bg-transparent border-none cursor-pointer text-white/80"
          >
            <FileText className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Termos & Política</span>
            <span className="sm:hidden">Termos</span>
          </button>
        </div>
      </div>
      
      {/* Navigation */}
      <nav className="w-full py-6 px-6 md:px-12 flex justify-between items-center z-50 fixed top-[32px] left-0">
        <button 
          onClick={() => window.location.href = "/"}
          className="flex items-center gap-2 font-display font-bold text-xl sm:text-2xl tracking-tighter cursor-pointer hover:opacity-80 transition-opacity bg-transparent border-none"
        >
          <Cloud className="w-6 sm:w-8 h-6 sm:h-8 text-white fill-white/20" />
          <span className="text-white drop-shadow-md">OrbitalCloud</span>
        </button>
        <div className="hidden md:flex gap-8 items-center font-medium text-sm text-white/80">
          <a href="#features" className="hover:text-white transition-colors cursor-pointer">Funcionalidades</a>
          <a href="#pricing" className="hover:text-white transition-colors cursor-pointer">Precos</a>
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
      <section className="relative min-h-screen flex items-center pt-28 px-6 md:px-12 overflow-hidden">
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
              Guarde, partilhe e aceda aos seus ficheiros com a velocidade de servidores locais. 20GB grátis para todos os angolanos, sem truques.
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
            
            <div className="mt-8 md:mt-12 flex flex-wrap sm:gap-6 gap-3 text-xs sm:text-sm font-medium text-white/80">
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
      <section id="features" className="py-24 px-6 md:px-12 relative overflow-hidden">
        {/* Fallback background color while image loads */}
        <div 
          className="absolute inset-0 bg-slate-900"
          style={{ zIndex: 0 }}
        />
        {/* Background image */}
        <img 
          src="/features-bg.jpg"
          alt=""
          loading="eager"
          className="absolute inset-0 w-full h-full object-cover"
          style={{ zIndex: 1 }}
        />
        {/* Overlay for better text readability */}
        <div 
          className="absolute inset-0 bg-black/20"
          style={{ zIndex: 2 }}
        />
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center mb-16">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold mb-4 text-white">Tecnologia de Ponta</h2>
            <p className="text-white/80 max-w-2xl mx-auto">
              Infraestrutura local otimizada para a rede de internet angolana, garantindo a menor latência possível.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6 md:gap-8">
            {[
              { title: "Infraestrutura Distribuída", desc: "Servidores com load balancing automático, retry/fallback e failover inteligente. Alta disponibilidade com health checks em tempo real e redundância geográfica.", icon: Server },
              { title: "Criptografia AES-256-GCM", desc: "Encriptação cliente-side (zero-knowledge). Chaves derivadas com PBKDF2 da sua password. Ficheiros encriptados no browser antes do upload, sem acesso do servidor aos dados.", icon: Lock },
              { title: "Sincronização Inteligente", desc: "Upload e download otimizados com retry automático, tratamento de erros de rede e recovery inteligente. Monitoramento em tempo real do estado dos seus ficheiros.", icon: HardDrive },
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
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white/10 backdrop-blur-sm text-white border border-white/30 text-xs font-bold px-4 py-1 rounded-full pl-[16px] pr-[16px] pt-[3px] pb-[3px] mt-[23px] mb-[23px]">
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
                  className="w-full rounded-xl font-bold bg-white/10 text-white border border-white/30 hover:bg-white/20 transition-all duration-300 h-12"
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

      {/* Terms and Privacy Policy Modal */}
      <AnimatePresence>
        {showTermsModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={() => setShowTermsModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-800 rounded-2xl w-full max-w-2xl max-h-[85vh] border border-white/20 flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center p-6 border-b border-white/10">
                <h2 className="text-xl font-bold text-white">Termos de Uso e Política de Privacidade</h2>
                <button 
                  onClick={() => setShowTermsModal(false)} 
                  className="text-white/50 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 space-y-6 text-white/80 text-sm leading-relaxed">
                <section>
                  <h3 className="text-lg font-semibold text-white mb-3">1. Aceitação dos Termos</h3>
                  <p>
                    Ao criar uma conta e utilizar os serviços da OrbitalCloud, você concorda com estes Termos de Uso e 
                    Política de Privacidade. Se não concordar com algum termo, não deve utilizar a plataforma.
                  </p>
                </section>

                <section>
                  <h3 className="text-lg font-semibold text-white mb-3">2. Descrição do Serviço</h3>
                  <p>
                    A OrbitalCloud é uma plataforma de armazenamento em nuvem que permite aos utilizadores guardar, 
                    organizar e partilhar ficheiros de forma segura. Oferecemos 20GB de armazenamento gratuito para 
                    todos os utilizadores registados, com opção de adquirir espaço adicional.
                  </p>
                </section>

                <section>
                  <h3 className="text-lg font-semibold text-white mb-3">3. Conta de Utilizador</h3>
                  <p className="mb-2">
                    Para utilizar os nossos serviços, deve criar uma conta fornecendo informações verdadeiras e completas. 
                    Você é responsável por:
                  </p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>Manter a confidencialidade da sua palavra-passe</li>
                    <li>Todas as atividades realizadas na sua conta</li>
                    <li>Notificar-nos imediatamente sobre qualquer uso não autorizado</li>
                  </ul>
                </section>

                <section>
                  <h3 className="text-lg font-semibold text-white mb-3">4. Privacidade e Segurança dos Dados</h3>
                  <p className="mb-2">
                    Levamos a segurança dos seus dados a sério. Os seus ficheiros são:
                  </p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>Encriptados com tecnologia AES-256-GCM antes de serem armazenados</li>
                    <li>Protegidos com chaves derivadas da sua palavra-passe</li>
                    <li>Acessíveis apenas por si ou por quem você autorizar</li>
                  </ul>
                  <p className="mt-2">
                    Não temos acesso ao conteúdo dos seus ficheiros encriptados. A sua privacidade é a nossa prioridade.
                  </p>
                </section>

                <section>
                  <h3 className="text-lg font-semibold text-white mb-3">5. Uso Aceitável</h3>
                  <p className="mb-2">
                    Ao utilizar a OrbitalCloud, você concorda em não:
                  </p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>Armazenar conteúdo ilegal ou que viole direitos de terceiros</li>
                    <li>Utilizar o serviço para spam ou atividades maliciosas</li>
                    <li>Tentar aceder a contas ou dados de outros utilizadores</li>
                    <li>Sobrecarregar ou interferir com a infraestrutura do serviço</li>
                  </ul>
                </section>

                <section>
                  <h3 className="text-lg font-semibold text-white mb-3">6. Armazenamento e Limites</h3>
                  <p>
                    Cada conta gratuita inclui 20GB de armazenamento. Espaço adicional pode ser adquirido a 500 Kz por GB mediante 
                    pagamento único. Reservamo-nos o direito de remover ficheiros de contas inativas por mais de 
                    12 meses após notificação prévia.
                  </p>
                </section>

                <section>
                  <h3 className="text-lg font-semibold text-white mb-3">7. Propriedade Intelectual</h3>
                  <p>
                    Você mantém todos os direitos sobre os ficheiros que carrega. Ao utilizar o serviço de partilha, 
                    garante que tem autorização para partilhar o conteúdo. A OrbitalCloud e suas marcas são propriedade 
                    exclusiva da empresa.
                  </p>
                </section>

                <section>
                  <h3 className="text-lg font-semibold text-white mb-3">8. Suporte e Contacto</h3>
                  <p className="mb-2">
                    Para suporte técnico ou reclamações, pode contactar-nos através de:
                  </p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>Email: OrbitalCloud@outlook.com.br</li>
                  </ul>
                </section>

                <section>
                  <h3 className="text-lg font-semibold text-white mb-3">9. Alterações aos Termos</h3>
                  <p>
                    Reservamo-nos o direito de modificar estes termos a qualquer momento. Alterações significativas 
                    serão comunicadas por email ou através da plataforma. O uso continuado após alterações constitui 
                    aceitação dos novos termos.
                  </p>
                </section>

                <section>
                  <h3 className="text-lg font-semibold text-white mb-3">10. Legislação Aplicável</h3>
                  <p>
                    Estes termos são regidos pelas leis da República de Angola. Quaisquer disputas serão resolvidas 
                    nos tribunais competentes de Luanda.
                  </p>
                </section>
              </div>

              <div className="p-6 border-t border-white/10">
                <button
                  onClick={() => setShowTermsModal(false)}
                  className="w-full py-3 rounded-lg bg-primary hover:bg-primary/80 text-white font-semibold transition-colors"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
