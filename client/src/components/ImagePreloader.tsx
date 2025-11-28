import { useEffect } from "react";
import dashboardBg from "@/assets/dashboard-bg.jpg";
import loadingBg from "@/assets/loading-bg.jpg";

export default function ImagePreloader() {
  useEffect(() => {
    const preloadImages = async () => {
      const images = [dashboardBg, loadingBg];
      
      images.forEach((src) => {
        const img = new Image();
        img.src = src;
      });
    };

    preloadImages();
  }, []);

  return null;
}
