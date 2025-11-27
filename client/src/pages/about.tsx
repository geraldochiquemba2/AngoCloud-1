import { Cloud, Heart, Cloud as CloudMission, CloudOff, CloudCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import VideoBackground from "@/components/ui/video-background";
import aboutHeroVideo from "@assets/4351798-hd_1280_720_50fps_1764253527054.mp4";
import aboutVideoFrame from "@assets/generated_images/about_page_video_first_frame.png";
import valuesBackgroundImage from "@assets/pexels-yankrukov-7315485_1764254260497.jpg";

export default function About() {
  const [, navigate] = useLocation();

  const values = [
    {
      icon: Cloud,
      title: "Missão",
      desc: "Fornecer armazenamento em nuvem acessível, seguro e rápido para todos os angolanos."
    },
    {
      icon: CloudCheck,
      title: "Visão",
      desc: "Ser a plataforma de confiança para armazenamento digital em Angola."
    },
    {
      icon: CloudOff,
      title: "Compromisso",
      desc: "Priorizar privacidade, segurança e infraestrutura local de qualidade."
    }
  ];

  const stats = [
    { number: "500K+", label: "Utilizadores" },
    { number: "99.9%", label: "Disponibilidade" },
    { number: "15GB", label: "Grátis" },
    { number: "1M+", label: "Ficheiros Guardados" }
  ];

  const team = [
    { name: "João Silva", role: "Fundador & CEO", icon: "👨‍💼" },
    { name: "Maria Santos", role: "CTO", icon: "👩‍💻" },
    { name: "Pedro Costa", role: "Head of Security", icon: "👨‍🔬" },
    { name: "Ana Martins", role: "Product Manager", icon: "👩‍🔬" }
  ];

  return (
    <div className="min-h-screen w-screen max-w-full overflow-x-hidden bg-background text-foreground selection:bg-primary/10">
      {/* Background Elements */}
      <div className="fixed inset-0 z-[-1]">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-accent/3 blur-[120px]" />
      </div>

      {/* Navigation */}
      <nav className="w-full py-6 px-6 md:px-12 flex justify-between items-center z-50 fixed top-0 left-0 backdrop-blur-md bg-black/10">
        <button 
          onClick={() => navigate("/")}
          className="flex items-center gap-2 font-display font-bold text-xl sm:text-2xl tracking-tighter cursor-pointer hover:opacity-80 transition-opacity"
        >
          <Cloud className="w-6 sm:w-8 h-6 sm:h-8 text-white fill-white/20" />
          <span className="text-white drop-shadow-md">AngoCloud</span>
        </button>
        <div className="hidden md:flex gap-8 items-center font-medium text-sm text-white/80 hover:text-white transition-colors">
          <a href="/#features" className="hover:text-white transition-colors">Funcionalidades</a>
          <a href="/#pricing" className="hover:text-white transition-colors">Preços</a>
          <a href="/about" className="hover:text-white transition-colors text-white">Sobre</a>
        </div>
        <div className="flex gap-2 md:gap-4">
          <Button className="text-white rounded-full px-4 sm:px-6 text-xs sm:text-base border border-white/30 bg-white/5 hover:bg-white/15 hover:border-white/50 backdrop-blur-sm transition-all">Login</Button>
          <Button className="text-white rounded-full px-4 sm:px-6 font-bold border border-white/30 bg-white/5 hover:bg-white/15 hover:border-white/50 backdrop-blur-sm transition-all shadow-lg shadow-white/10 text-xs sm:text-base">
            Criar Conta
          </Button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center pt-20 px-6 md:px-12 overflow-hidden">
        {/* Video Background */}
        <div className="absolute inset-0 z-0">
          <VideoBackground videoSrc={aboutHeroVideo} posterSrc={aboutVideoFrame} />
        </div>
        <div className="max-w-7xl mx-auto relative z-10 w-full">
          <motion.div
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="text-center mb-20"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/30 bg-white/5 backdrop-blur-md text-xs font-medium text-white mb-6">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
              </span>
              Sobre AngoCloud
            </div>
            <h1 className="text-4xl sm:text-5xl md:text-7xl font-display font-bold leading-[1.1] mb-6 text-white drop-shadow-lg">
              A Nuvem de <br />
              <span className="bg-gradient-to-r from-accent to-primary bg-clip-text text-transparent drop-shadow-lg">Angola</span>
            </h1>
            <p className="text-lg sm:text-xl text-white/80 mb-8 max-w-2xl mx-auto leading-relaxed drop-shadow-md">
              Desenvolvemos tecnologia local que coloca os dados dos angolanos em primeiro lugar, com privacidade, segurança e velocidade garantidas.
            </p>
            <button
              onClick={() => navigate("/#pricing")}
              className="bg-white hover:bg-white/90 text-primary h-12 px-8 rounded-full shadow-xl font-bold transition-all duration-300"
            >
              Começar Grátis
            </button>
          </motion.div>
        </div>
      </section>

      {/* Values Section */}
      <section 
        className="relative py-24 px-6 md:px-12 overflow-hidden"
        style={{
          backgroundImage: `url(${valuesBackgroundImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed',
          backgroundRepeat: 'repeat-y',
          minHeight: 'auto'
        }}
      >
        <div className="absolute inset-0 bg-black/60" />
        <div className="max-w-7xl mx-auto relative z-10">
          <motion.div
            className="text-center mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            viewport={{ once: true, margin: "-100px" }}
          >
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-display font-bold mb-4 text-white">Nossos Valores</h2>
            <p className="text-white/80 text-lg">O que nos move a cada dia</p>
          </motion.div>

          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-8">
            {values.map((value, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                whileHover={{ y: -8 }}
                transition={{ duration: 0.6, ease: "easeOut", delay: i * 0.1 }}
                viewport={{ once: true, margin: "-100px" }}
                className="backdrop-blur-md bg-white/10 p-8 rounded-2xl border border-white/30 hover:border-white/50 transition-all duration-500 group hover:shadow-lg hover:shadow-white/20"
              >
                <motion.div 
                  className="w-16 h-16 rounded-xl bg-white/10 border border-white/30 flex items-center justify-center mb-6 group-hover:bg-white/20 transition-all duration-300"
                  whileHover={{ scale: 1.1, rotate: 5 }}
                >
                  <value.icon className="w-8 h-8 text-white" strokeWidth={1.5} />
                </motion.div>
                <h3 className="text-2xl font-bold mb-3 text-white">{value.title}</h3>
                <p className="text-white/80 leading-relaxed">{value.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section 
        className="relative py-24 px-6 md:px-12 overflow-hidden"
        style={{
          backgroundImage: `url(${valuesBackgroundImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed',
          backgroundRepeat: 'repeat-y',
          minHeight: 'auto'
        }}
      >
        <div className="absolute inset-0 bg-black/60" />
        <div className="max-w-7xl mx-auto relative z-10">
          <motion.div
            className="text-center mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            viewport={{ once: true, margin: "-100px" }}
          >
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-display font-bold mb-4 text-white">Pelos Números</h2>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {stats.map((stat, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                whileHover={{ scale: 1.05 }}
                transition={{ duration: 0.5, ease: "easeOut", delay: i * 0.1 }}
                viewport={{ once: true, margin: "-100px" }}
                className="text-center backdrop-blur-md bg-white/10 p-6 sm:p-8 rounded-2xl border border-white/30 transition-all duration-300 hover:bg-white/20 hover:border-white/50"
              >
                <motion.div 
                  className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold text-white mb-2"
                  whileHover={{ scale: 1.1 }}
                >
                  {stat.number}
                </motion.div>
                <p className="text-xs sm:text-sm lg:text-base text-white/80 font-medium">{stat.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Team Section */}
      <section className="relative py-24 px-6 md:px-12 overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <motion.div
            className="text-center mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            viewport={{ once: true, margin: "-100px" }}
          >
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-display font-bold mb-4">Nossa Equipa</h2>
            <p className="text-muted-foreground text-lg">Pessoas talentosas dedicadas a servir Angola</p>
          </motion.div>

          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-6">
            {team.map((member, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                whileHover={{ y: -8 }}
                transition={{ duration: 0.6, ease: "easeOut", delay: i * 0.1 }}
                viewport={{ once: true, margin: "-100px" }}
                className="backdrop-blur-md bg-white/10 p-8 rounded-2xl border border-primary/20 hover:border-primary/40 transition-all duration-500 text-center group hover:shadow-lg hover:shadow-primary/10"
              >
                <motion.div 
                  className="text-6xl mb-4 transition-transform duration-300"
                  whileHover={{ scale: 1.2, rotate: 10 }}
                >
                  {member.icon}
                </motion.div>
                <h3 className="text-xl font-bold mb-2">{member.name}</h3>
                <p className="text-primary font-medium text-sm">{member.role}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative py-24 px-6 md:px-12 overflow-hidden bg-gradient-to-r from-primary via-primary/80 to-accent">
        <div className="max-w-7xl mx-auto text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            viewport={{ once: true, margin: "-100px" }}
          >
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-display font-bold mb-6 text-white">Junte-se a Nós</h2>
            <p className="text-lg text-white/90 mb-8 max-w-2xl mx-auto">
              Seja parte da revolução de armazenamento em nuvem de Angola
            </p>
            <button
              onClick={() => navigate("/#pricing")}
              className="bg-white hover:bg-white/90 text-primary h-12 px-8 rounded-full shadow-xl font-bold transition-all duration-300"
            >
              Começar Grátis
            </button>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <motion.footer 
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        viewport={{ once: true, margin: "-100px" }}
        className="relative py-12 px-6 md:px-12 border-t border-primary/10 bg-black/20 backdrop-blur-sm"
      >
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row justify-between items-center gap-4 md:gap-6 text-center md:text-left">
          <div className="flex items-center gap-2 font-display font-bold text-xl text-white">
            <Cloud className="w-6 h-6 text-white" />
            <span>AngoCloud</span>
          </div>
          <div className="text-sm text-white/70 flex items-center gap-2">
            <span>&copy; 2024 AngoCloud Technologies. Feito em Luanda com</span>
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
      </motion.footer>
    </div>
  );
}
