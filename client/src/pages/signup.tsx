import { Cloud, Heart, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { useState, useEffect } from "react";
import bgImage from "@assets/pexels-shkrabaanthony-5475778_1764258312022.jpg";
import { useAuth } from "@/contexts/AuthContext";
import LoadingScreen from "@/components/LoadingScreen";

export default function Signup() {
  const [, navigate] = useLocation();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const { signup } = useAuth();

  useEffect(() => {
    // Show loading for 3 seconds when page loads
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  const handleSignup = async () => {
    if (!fullName || !email || !password || !confirmPassword) {
      setError("Por favor, preencha todos os campos");
      return;
    }
    
    if (password !== confirmPassword) {
      setError("As palavras-passe não coincidem");
      return;
    }
    
    if (password.length < 6) {
      setError("A palavra-passe deve ter pelo menos 6 caracteres");
      return;
    }
    
    if (!acceptedTerms) {
      setError("Deve aceitar os Termos de Uso e Política de Privacidade");
      return;
    }
    
    setError("");
    setIsLoading(true);
    
    try {
      await signup(email, password, fullName);
      // Keep loading for 3 seconds before navigating
      setTimeout(() => {
        navigate("/dashboard");
      }, 3000);
    } catch (err: any) {
      setError(err.message || "Erro ao criar conta");
      setIsLoading(false);
    }
  };

  return (
    <>
      <LoadingScreen isVisible={isLoading} />
      <div 
        className="min-h-screen w-screen max-w-full overflow-x-hidden bg-background text-foreground selection:bg-primary/10 flex flex-col"
        style={{
          backgroundImage: `url(${bgImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed'
        }}
      >
        {/* Background Overlay */}
        <div className="fixed inset-0 z-[-1] bg-black/40" />

      {/* Navigation */}
      <nav className="w-full py-6 px-6 md:px-12 flex justify-between items-center z-50">
        <button 
          onClick={() => navigate("/")}
          className="flex items-center gap-2 font-display font-bold text-xl sm:text-2xl tracking-tighter cursor-pointer hover:opacity-80 transition-opacity bg-transparent border-none"
        >
          <Cloud className="w-6 sm:w-8 h-6 sm:h-8 text-white fill-white/20" />
          <span className="text-white drop-shadow-md">OrbitalCloud</span>
        </button>
        <div className="flex gap-2">
          <button
            onClick={() => navigate("/login")}
            className="text-white rounded-full px-6 font-bold border border-white/30 bg-white/5 hover:bg-white/15 hover:border-white/50 backdrop-blur-sm transition-all h-10"
          >
            Entrar
          </button>
        </div>
      </nav>

      {/* Signup Section */}
      <section className="flex-1 flex items-center justify-center px-6 md:px-12 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="w-full max-w-md"
        >
          {/* Form Container */}
          <div className="backdrop-blur-md bg-white/10 p-8 rounded-2xl border border-white/30">
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
              className="text-center mb-8"
            >
              <h1 className="text-3xl md:text-4xl font-display font-bold text-white mb-2">Cria uma Conta</h1>
              <p className="text-white/70">Começa a guardar com OrbitalCloud hoje</p>
            </motion.div>

            {/* Full Name Input */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 }}
              className="mb-4"
            >
              <label className="block text-sm font-medium text-white mb-2">Nome Completo</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="João Silva"
                className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder:text-white/50 focus:outline-none focus:border-white/50 transition-colors"
                data-testid="input-fullname"
              />
            </motion.div>

            {/* Email Input */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut", delay: 0.25 }}
              className="mb-4"
            >
              <label className="block text-sm font-medium text-white mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder:text-white/50 focus:outline-none focus:border-white/50 transition-colors"
                data-testid="input-email"
              />
            </motion.div>

            {/* Password Input */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut", delay: 0.3 }}
              className="mb-4"
            >
              <label className="block text-sm font-medium text-white mb-2">Palavra-passe</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder:text-white/50 focus:outline-none focus:border-white/50 transition-colors"
                data-testid="input-password"
              />
            </motion.div>

            {/* Confirm Password Input */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut", delay: 0.35 }}
              className="mb-4"
            >
              <label className="block text-sm font-medium text-white mb-2">Confirmar Palavra-passe</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSignup()}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder:text-white/50 focus:outline-none focus:border-white/50 transition-colors"
                data-testid="input-confirm-password"
              />
            </motion.div>

            {/* Terms and Conditions Checkbox */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut", delay: 0.38 }}
              className="mb-2"
            >
              <label className="flex items-start gap-3 cursor-pointer group">
                <div className="relative mt-0.5">
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    className="peer sr-only"
                    data-testid="checkbox-terms"
                  />
                  <div className="w-5 h-5 rounded border-2 border-white/30 bg-white/10 peer-checked:bg-primary peer-checked:border-primary transition-all flex items-center justify-center group-hover:border-white/50">
                    {acceptedTerms && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
                <span className="text-sm text-white/80 leading-tight">
                  Li e aceito os{" "}
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); setShowTermsModal(true); }}
                    className="text-primary hover:text-primary/80 underline font-medium bg-transparent border-none cursor-pointer"
                    data-testid="link-terms"
                  >
                    Termos de Uso e Política de Privacidade
                  </button>
                </span>
              </label>
            </motion.div>

            {/* Error Message */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 p-3 rounded-lg bg-red-500/20 border border-red-500/50 text-red-100 text-sm"
              >
                {error}
              </motion.div>
            )}

            {/* Signup Button */}
            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut", delay: 0.4 }}
              whileHover={!isLoading ? { scale: 1.02 } : {}}
              onClick={handleSignup}
              disabled={isLoading}
              className="w-full bg-white/10 hover:bg-white/20 text-white border border-white/30 backdrop-blur-md font-bold py-3 rounded-lg transition-all duration-300 mb-4 disabled:opacity-50 disabled:cursor-not-allowed mt-6"
              data-testid="button-signup"
            >
              {isLoading ? "Criando conta..." : "Criar Conta"}
            </motion.button>

            {/* Login Link */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut", delay: 0.5 }}
              className="text-center"
            >
              <p className="text-white/70 text-sm">
                Já tens conta?{" "}
                <button
                  onClick={() => navigate("/login")}
                  className="text-white font-bold hover:opacity-80 transition-opacity bg-transparent border-none cursor-pointer"
                >
                  Entra aqui
                </button>
              </p>
            </motion.div>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <motion.footer 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative py-8 px-6 md:px-12 border-t border-primary/10 bg-black/20 backdrop-blur-sm"
      >
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row justify-between items-center gap-4 md:gap-6 text-center md:text-left">
          <div className="flex items-center gap-2 font-display font-bold text-xl text-white">
            <Cloud className="w-6 h-6 text-white" />
            <span>OrbitalCloud</span>
          </div>
          <div className="text-sm text-white/70 flex items-center gap-2">
            <span>&copy; 2024 OrbitalCloud. Feito em Luanda com</span>
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 0.6, repeat: Infinity }}
              className="inline-block"
            >
              <Heart className="w-4 h-4 text-red-500 fill-red-500" />
            </motion.div>
          </div>
        </div>
      </motion.footer>
      </div>

      {/* Terms and Privacy Policy Modal */}
      <AnimatePresence>
        {showTermsModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
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
                  data-testid="button-close-terms"
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
                    organizar e partilhar ficheiros de forma segura. Oferecemos 15GB de armazenamento gratuito para 
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
                    Cada conta gratuita inclui 15GB de armazenamento. Espaço adicional pode ser adquirido mediante 
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
                  onClick={() => { setAcceptedTerms(true); setShowTermsModal(false); }}
                  className="w-full py-3 rounded-lg bg-primary hover:bg-primary/80 text-white font-semibold transition-colors"
                  data-testid="button-accept-terms"
                >
                  Li e Aceito os Termos
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
