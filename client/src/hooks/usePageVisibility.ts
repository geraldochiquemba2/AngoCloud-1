import { useEffect, useRef, useCallback, useState } from "react";

interface UsePageVisibilityOptions {
  onVisible?: () => void;
  onHidden?: () => void;
  minHiddenDuration?: number;
}

interface UsePageVisibilityResult {
  isVisible: boolean;
  wasHiddenFor: number;
  lastVisibleTime: number;
  forceRefresh: () => void;
}

export function usePageVisibility(options: UsePageVisibilityOptions = {}): UsePageVisibilityResult {
  const { onVisible, onHidden, minHiddenDuration = 30000 } = options;
  
  const [isVisible, setIsVisible] = useState(!document.hidden);
  const [wasHiddenFor, setWasHiddenFor] = useState(0);
  const [lastVisibleTime, setLastVisibleTime] = useState(Date.now());
  
  const hiddenAtRef = useRef<number | null>(null);
  const onVisibleRef = useRef(onVisible);
  const onHiddenRef = useRef(onHidden);
  const minHiddenDurationRef = useRef(minHiddenDuration);

  useEffect(() => {
    onVisibleRef.current = onVisible;
    onHiddenRef.current = onHidden;
    minHiddenDurationRef.current = minHiddenDuration;
  }, [onVisible, onHidden, minHiddenDuration]);

  const forceRefresh = useCallback(() => {
    if (onVisibleRef.current) {
      onVisibleRef.current();
    }
  }, []);

  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let lastTriggerTime = 0;
    const DEBOUNCE_MS = 1000;

    const triggerOnVisible = (hiddenDuration: number, source: string) => {
      const now = Date.now();
      if (now - lastTriggerTime < DEBOUNCE_MS) {
        console.log(`[PageVisibility] Debouncing duplicate trigger from ${source}`);
        return;
      }
      lastTriggerTime = now;
      
      console.log(`[PageVisibility] ${source} after ${Math.round(hiddenDuration / 1000)}s, triggering refresh`);
      if (onVisibleRef.current) {
        onVisibleRef.current();
      }
    };

    const handleVisibilityChange = () => {
      const nowHidden = document.hidden;
      
      if (nowHidden) {
        hiddenAtRef.current = Date.now();
        setIsVisible(false);
        if (onHiddenRef.current) {
          onHiddenRef.current();
        }
      } else {
        const hiddenDuration = hiddenAtRef.current 
          ? Date.now() - hiddenAtRef.current 
          : 0;
        
        setWasHiddenFor(hiddenDuration);
        setIsVisible(true);
        setLastVisibleTime(Date.now());
        hiddenAtRef.current = null;

        if (hiddenDuration >= minHiddenDurationRef.current) {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            triggerOnVisible(hiddenDuration, "Page became visible");
          }, 100);
        }
      }
    };

    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted && hiddenAtRef.current) {
        const hiddenDuration = Date.now() - hiddenAtRef.current;
        
        setIsVisible(true);
        setLastVisibleTime(Date.now());
        hiddenAtRef.current = null;
        
        if (hiddenDuration >= minHiddenDurationRef.current) {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            triggerOnVisible(hiddenDuration, "Page restored from bfcache");
          }, 100);
        }
      }
    };

    const handleFocus = () => {
      if (hiddenAtRef.current) {
        const hiddenDuration = Date.now() - hiddenAtRef.current;
        if (hiddenDuration >= minHiddenDurationRef.current) {
          setWasHiddenFor(hiddenDuration);
          hiddenAtRef.current = null;
          
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            triggerOnVisible(hiddenDuration, "Window focused");
          }, 100);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("focus", handleFocus);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  return {
    isVisible,
    wasHiddenFor,
    lastVisibleTime,
    forceRefresh,
  };
}
