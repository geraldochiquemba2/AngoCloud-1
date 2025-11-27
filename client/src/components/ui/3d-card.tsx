import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import React, { useRef } from "react";
import { cn } from "@/lib/utils";

export function ThreeDCard({
  children,
  className,
  containerClassName,
}: {
  children: React.ReactNode;
  className?: string;
  containerClassName?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const mouseX = useSpring(x);
  const mouseY = useSpring(y);

  function handleMouseMove(event: React.MouseEvent<HTMLDivElement>) {
    if (!ref.current) return;

    const rect = ref.current.getBoundingClientRect();

    const width = rect.width;
    const height = rect.height;

    const mouseXFromCenter = event.clientX - rect.left - width / 2;
    const mouseYFromCenter = event.clientY - rect.top - height / 2;

    x.set(mouseXFromCenter);
    y.set(mouseYFromCenter);
  }

  function handleMouseLeave() {
    x.set(0);
    y.set(0);
  }

  const rotateX = useTransform(mouseY, [-100, 100], [5, -5]); // Inverted for natural tilt
  const rotateY = useTransform(mouseX, [-100, 100], [-5, 5]);

  return (
    <div
      className={cn("py-4 flex items-center justify-center", containerClassName)}
      style={{ perspective: "1000px" }}
    >
      <motion.div
        ref={ref}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          rotateX,
          rotateY,
          transformStyle: "preserve-3d",
        }}
        className={cn(
          "relative transition-all duration-200 ease-linear group",
          className
        )}
      >
        {children}
      </motion.div>
    </div>
  );
}

export function ThreeDCardBody({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "h-96 w-96 [transform-style:preserve-3d]  [&>*]:[transform-style:preserve-3d]",
        className
      )}
    >
      {children}
    </div>
  );
}

export function ThreeDCardItem({
  as: Component = "div",
  children,
  className,
  translateX = 0,
  translateY = 0,
  translateZ = 0,
  rotateX = 0,
  rotateY = 0,
  rotateZ = 0,
  ...rest
}: {
  as?: React.ElementType;
  children: React.ReactNode;
  className?: string;
  translateX?: number | string;
  translateY?: number | string;
  translateZ?: number | string;
  rotateX?: number | string;
  rotateY?: number | string;
  rotateZ?: number | string;
  [key: string]: any;
}) {
  return (
    <Component
      className={cn("w-full transition-all duration-200 ease-linear", className)}
      style={{
        transform: `translateX(${translateX}px) translateY(${translateY}px) translateZ(${translateZ}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) rotateZ(${rotateZ}deg)`,
      }}
      {...rest}
    >
      {children}
    </Component>
  );
}