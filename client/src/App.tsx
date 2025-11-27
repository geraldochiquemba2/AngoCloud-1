import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import About from "@/pages/about";
import Login from "@/pages/login";
import Signup from "@/pages/signup";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/about" component={About} />
      <Route path="/login" component={Login} />
      <Route path="/signup" component={Signup} />
      <Route component={NotFound} />
    </Switch>
  );
}

function PreloadAssets() {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const preloadImages = [
      "/src/assets/generated_images/minimalist_cloud_storage_icon.png",
      "/src/assets/generated_images/about_page_video_first_frame.png",
      "/src/assets/pexels-yankrukov-7315485_1764254260497.jpg",
    ];

    const preloadVideos = [
      "/src/assets/4354033-hd_1280_720_25fps_1764245575076.mp4",
      "/src/assets/4351798-hd_1280_720_50fps_1764253527054.mp4",
    ];

    let loadedCount = 0;
    const totalAssets = preloadImages.length + preloadVideos.length;

    const checkAllLoaded = () => {
      loadedCount++;
      if (loadedCount >= totalAssets) {
        setIsLoaded(true);
      }
    };

    // Preload images
    preloadImages.forEach((src) => {
      const img = new Image();
      img.src = src;
      img.onload = checkAllLoaded;
      img.onerror = checkAllLoaded;
    });

    // Preload videos
    preloadVideos.forEach((src) => {
      const video = document.createElement("video");
      video.src = src;
      video.onloadeddata = checkAllLoaded;
      video.onerror = checkAllLoaded;
    });

    // Timeout fallback - show content after 3 seconds even if assets are still loading
    const timeout = setTimeout(() => setIsLoaded(true), 3000);
    return () => clearTimeout(timeout);
  }, []);

  if (!isLoaded) {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center z-[9999]">
        <motion.div
          animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="w-12 h-12 rounded-full border-3 border-primary border-t-transparent"
        />
      </div>
    );
  }

  return null;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <PreloadAssets />
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;