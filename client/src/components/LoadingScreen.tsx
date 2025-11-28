import { motion } from "framer-motion";
import loadingBg from "@/assets/loading-bg.jpg";

interface LoadingScreenProps {
  isVisible: boolean;
}

export default function LoadingScreen({ isVisible }: LoadingScreenProps) {
  if (!isVisible) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{
        backgroundImage: `url(${loadingBg})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Dark overlay for better contrast */}
      <div className="absolute inset-0 bg-black/30" />

      {/* Content */}
      <div className="relative flex flex-col items-center gap-8">
        {/* Pulsing Logo */}
        <motion.div
          animate={{ scale: [0.95, 1.05, 0.95] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="flex flex-col items-center gap-4"
        >
          {/* Outer glow circle */}
          <motion.div
            animate={{ opacity: [0.3, 0.8, 0.3] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            className="absolute w-32 h-32 rounded-full border-2 border-cyan-400/50 blur-lg"
          />

          {/* Middle glow circle */}
          <motion.div
            animate={{ opacity: [0.5, 1, 0.5], scale: [0.9, 1, 0.9] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
            className="absolute w-24 h-24 rounded-full border-2 border-purple-400/60"
          />

          {/* Logo text */}
          <div className="relative z-10 text-center">
            <motion.h1
              animate={{ 
                textShadow: [
                  "0 0 10px rgba(34, 211, 238, 0.5)",
                  "0 0 30px rgba(168, 85, 247, 0.8)",
                  "0 0 10px rgba(34, 211, 238, 0.5)",
                ]
              }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              className="text-5xl font-bold bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent drop-shadow-2xl"
            >
              OrbitalDrive
            </motion.h1>
            <motion.p
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              className="text-cyan-300/80 text-sm mt-2 font-medium tracking-widest"
            >
              Carregando...
            </motion.p>
          </div>
        </motion.div>

        {/* Loading spinner dots */}
        <motion.div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              animate={{
                scale: [0.8, 1.2, 0.8],
                opacity: [0.5, 1, 0.5],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "easeInOut",
                delay: i * 0.2,
              }}
              className="w-3 h-3 rounded-full bg-cyan-400/80"
            />
          ))}
        </motion.div>
      </div>
    </motion.div>
  );
}
