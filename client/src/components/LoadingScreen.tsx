interface LoadingScreenProps {
  isVisible: boolean;
}

export default function LoadingScreen({ isVisible }: LoadingScreenProps) {
  if (!isVisible) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900"
    >
      {/* Dark overlay for better contrast */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Content */}
      <div className="relative flex flex-col items-center gap-8">
        {/* Pulsing Logo */}
        <div
          className="flex flex-col items-center gap-4 animate-pulse"
        >
          {/* Logo text */}
          <div className="text-center">
            <h1 className="text-5xl font-bold bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent drop-shadow-2xl">
              OrbitalDrive
            </h1>
            <p className="text-cyan-300/80 text-sm mt-2 font-medium tracking-widest">
              Carregando...
            </p>
          </div>
        </div>

        {/* Loading spinner dots */}
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-3 h-3 rounded-full bg-cyan-400/80 animate-bounce"
              style={{ animationDelay: `${i * 0.2}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
