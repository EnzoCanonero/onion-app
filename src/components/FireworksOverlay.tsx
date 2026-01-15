import { useEffect, useRef } from "react";

type FireworksOverlayProps = {
  colors?: string[];
  durationMs?: number;
  onDone: () => void;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  lifetime: number;
  size: number;
  color: string;
};

export default function FireworksOverlay({
  colors = ["#FFD700", "#ff9800", "#4caf50", "#2196f3", "#e91e63"],
  durationMs = 1600,
  onDone,
}: FireworksOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener("resize", resize);

    const particles: Particle[] = [];

    const addBurst = (x: number, y: number, color: string) => {
      const count = 56;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 140 + Math.random() * 260;
        particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          age: 0,
          lifetime: 0.9 + Math.random() * 0.7,
          size: 1.5 + Math.random() * 2.8,
          color,
        });
      }
    };

    const timeouts: number[] = [];
    const burstCount = 4;
    for (let i = 0; i < burstCount; i++) {
      const delay = i * 220;
      const id = window.setTimeout(() => {
        const x = width * (0.2 + Math.random() * 0.6);
        const y = height * (0.2 + Math.random() * 0.35);
        addBurst(x, y, colors[i % colors.length]);
      }, delay);
      timeouts.push(id);
    }

    let rafId = 0;
    let last = performance.now();

    const step = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;

      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = "lighter";

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.age += dt;
        if (p.age >= p.lifetime) {
          particles.splice(i, 1);
          continue;
        }

        p.vx *= 0.985;
        p.vy = p.vy * 0.985 + 220 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        const t = Math.max(0, Math.min(1, 1 - p.age / p.lifetime));
        ctx.globalAlpha = t;
        ctx.beginPath();
        ctx.fillStyle = p.color;
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      rafId = window.requestAnimationFrame(step);
    };

    rafId = window.requestAnimationFrame(step);
    const doneTimeout = window.setTimeout(onDone, durationMs);

    return () => {
      window.clearTimeout(doneTimeout);
      timeouts.forEach((t) => window.clearTimeout(t));
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
    };
  }, [colors, durationMs, onDone]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 5000,
        pointerEvents: "none",
      }}
    >
      <canvas ref={canvasRef} />
    </div>
  );
}

