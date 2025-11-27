import { ThreeDCard, ThreeDCardBody, ThreeDCardItem } from "@/components/ui/3d-card";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Check, Cloud, Shield, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

// Import assets
import heroImage from "@assets/generated_images/minimalist_cloud_storage_icon.png";
import cubeImage from "@assets/generated_images/3d_abstract_floating_cube.png";

export default function Home() {
  const pricingPlans = [
    {
      name: "Grátis",
      storage: "15 GB",
      price: "Kz 0",
      features: ["Armazenamento Básico", "Acesso Web", "Suporte da Comunidade"],
      highlight: false,
    },
    {
      name: "Plus",
      storage: "100 GB",
      price: "Kz 2.500",
      period: "/mês",
      features: ["Backup Automático", "Suporte Prioritário", "Sem Anúncios", "Acesso Offline"],
      highlight: true,
    },
    {
      name: "Pro",
      storage: "500 GB",
      price: "Kz 7.500",
      period: "/mês",
      features: ["Encriptação Ponta-a-Ponta", "Colaboração em Tempo Real", "Histórico de Versões (30 dias)", "API de Acesso"],
      highlight: false,
    },
    {
      name: "Empresas",
      storage: "Ilimitado",
      price: "Kz 25.000",
      period: "/mês",
      features: ["Gestão de Usuários", "SLA Garantido", "Suporte Dedicado 24/7", "Auditoria de Logs"],
      highlight: false,
    },
  ];

  return (
    <div className="min-h-screen w-full overflow-hidden bg-background text-foreground selection:bg-primary/10">
      {/* Background Elements */}
      <div className="fixed inset-0 z-[-1]">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-accent/3 blur-[120px]" />
      </div>

      {/* Navigation */}
      <nav className="w-full py-6 px-6 md:px-12 flex justify-between items-center z-50 absolute top-0 left-0">
        <div className="flex items-center gap-2 font-display font-bold text-2xl tracking-tighter">
          <Cloud className="w-8 h-8 text-primary fill-primary/10" />
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent">AngoCloud</span>
        </div>
        <div className="hidden md:flex gap-8 items-center font-medium text-sm text-muted-foreground">
          <a href="#features" className="hover:text-primary transition-colors">Funcionalidades</a>
          <a href="#pricing" className="hover:text-primary transition-colors">Preços</a>
          <a href="#about" className="hover:text-primary transition-colors">Sobre</a>
        </div>
        <div className="flex gap-4">
          <Button variant="ghost" className="hidden md:flex hover:bg-primary/5">Login</Button>
          <Button className="bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20 rounded-full px-6">
            Criar Conta
          </Button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center pt-20 px-6 md:px-12">
        <div className="grid md:grid-cols-2 gap-12 items-center w-full max-w-7xl mx-auto">
          <motion.div 
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="z-10"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/20 bg-primary/5 backdrop-blur-sm text-xs font-medium text-primary mb-6">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              A Nuvem de Angola
            </div>
            <h1 className="text-5xl md:text-7xl font-display font-bold leading-[1.1] mb-6">
              Armazenamento <br />
              <span className="text-gradient">Sem Fronteiras.</span>
            </h1>
            <p className="text-lg text-muted-foreground mb-8 max-w-md leading-relaxed">
              Guarde, partilhe e aceda aos seus ficheiros com a velocidade de servidores locais. 15GB grátis para todos os angolanos, sem truques.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button size="lg" className="bg-primary hover:bg-primary/90 text-white h-12 px-8 rounded-full shadow-lg shadow-primary/20 text-base">
                Começar Grátis
              </Button>
              <Button size="lg" variant="outline" className="h-12 px-8 rounded-full border-primary/30 hover:bg-primary/5 text-primary text-base">
                Ver Planos
              </Button>
            </div>
            
            <div className="mt-12 flex items-center gap-8 text-sm font-medium text-muted-foreground">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" />
                <span>Encriptado</span>
              </div>
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-accent" />
                <span>Alta Velocidade</span>
              </div>
              <div className="flex items-center gap-2">
                <Cloud className="w-4 h-4 text-primary" />
                <span>15GB Grátis</span>
              </div>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.2 }}
            className="relative h-[500px] w-full flex items-center justify-center"
          >
            <div className="absolute inset-0 bg-primary/10 blur-[100px] rounded-full transform translate-y-10" />
            <motion.img 
              src={heroImage} 
              alt="Cloud Storage Future" 
              className="relative z-10 w-full h-full object-contain drop-shadow-2xl"
              animate={{ 
                y: [0, -20, 0],
                rotateZ: [0, 1, 0]
              }}
              transition={{ 
                duration: 6, 
                repeat: Infinity,
                ease: "easeInOut" 
              }}
            />
          </motion.div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-24 px-6 md:px-12 relative">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">Tecnologia de Ponta</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Infraestrutura local otimizada para a rede de internet angolana, garantindo a menor latência possível.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              { title: "Servidores em Luanda", desc: "Acesso ultra-rápido sem depender de cabos submarinos internacionais.", icon: Zap },
              { title: "Privacidade Total", desc: "Seus dados são seus. Encriptação AES-256 em repouso e em trânsito.", icon: Shield },
              { title: "Backup Automático", desc: "Sincronização em tempo real em todos os seus dispositivos.", icon: Cloud },
            ].map((feature, i) => (
              <motion.div 
                key={i}
                whileHover={{ y: -5 }}
                className="glass-card p-8 rounded-2xl border border-primary/10 hover:border-primary/30 transition-colors group"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/8 flex items-center justify-center mb-6 group-hover:bg-primary/15 transition-colors">
                  <feature.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-24 px-6 md:px-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background/40 pointer-events-none" />
        
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">Planos Flexíveis</h2>
            <p className="text-muted-foreground">Escolha o espaço que você precisa.</p>
          </div>

          <div className="flex flex-wrap justify-center gap-8">
            {pricingPlans.map((plan, i) => (
              <ThreeDCard key={i} className="w-full md:w-auto" containerClassName="md:!py-0">
                <ThreeDCardBody className="bg-white relative group/card hover:shadow-lg hover:shadow-primary/[0.1] w-[300px] md:w-[350px] h-auto rounded-xl p-6 border border-primary/10 glass-card">
                  <ThreeDCardItem
                    translateZ="50"
                    className="text-xl font-bold text-foreground"
                  >
                    {plan.name}
                  </ThreeDCardItem>
                  
                  <ThreeDCardItem
                    as="p"
                    translateZ="60"
                    className="text-muted-foreground text-sm max-w-sm mt-2"
                  >
                    Ideal para {plan.name === 'Empresas' ? 'negócios' : 'uso pessoal'}
                  </ThreeDCardItem>
                  
                  <ThreeDCardItem translateZ="80" className="mt-6 mb-8">
                    <span className="text-4xl font-bold font-display">{plan.price}</span>
                    {plan.period && <span className="text-muted-foreground text-sm">{plan.period}</span>}
                  </ThreeDCardItem>
                  
                  <div className="space-y-3 mb-8">
                    {plan.features.map((feature, idx) => (
                      <ThreeDCardItem 
                        key={idx} 
                        translateZ={40 + (idx * 5)}
                        className="flex items-center gap-3 text-sm text-muted-foreground"
                      >
                        <Check className="w-4 h-4 text-primary" />
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
                      className={cn(
                        "w-full rounded-lg", 
                        plan.highlight 
                          ? "bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/25" 
                          : "bg-white/10 hover:bg-white/20 text-white"
                      )}
                    >
                      Selecionar Plano
                    </Button>
                  </ThreeDCardItem>
                </ThreeDCardBody>
              </ThreeDCard>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-primary/10 bg-white/50">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2 font-display font-bold text-xl">
            <Cloud className="w-6 h-6 text-primary" />
            <span>AngoCloud</span>
          </div>
          <div className="text-sm text-muted-foreground">
            &copy; 2024 AngoCloud Technologies. Feito em Luanda com ❤️
          </div>
          <div className="flex gap-6">
             {/* Social icons would go here */}
          </div>
        </div>
      </footer>
    </div>
  );
}