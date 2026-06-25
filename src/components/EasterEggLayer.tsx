import { useEffect, useRef, type CSSProperties } from "react";

const RAIN_COLUMNS = [
  "MARCATO",
  "010110",
  "PREVIEW",
  "MERMAID",
  "EXPORT",
  "LATEX",
  "SHARE",
  "WORKER",
  "PDF",
  "GRAPH",
  "CYBER",
  "MARKDOWN",
  "CACHE",
  "TOC",
  "KROKI",
  "VITE",
];

const PARTICLES = Array.from({ length: 30 }, (_, index) => ({
  delay: (index % 10) * 0.65,
  drift: (index % 7) - 3,
  left: 3 + ((index * 31) % 94),
  size: 2 + (index % 4),
  speed: 7 + (index % 6),
}));

export function EasterEggLayer({ enabled }: { enabled: boolean }) {
  const cursorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!enabled || matchMedia("(pointer: coarse)").matches) return;
    const onPointerMove = (event: PointerEvent) => {
      cursorRef.current?.style.setProperty("--cursor-x", `${event.clientX}px`);
      cursorRef.current?.style.setProperty("--cursor-y", `${event.clientY}px`);
      cursorRef.current?.setAttribute("data-ready", "true");
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => window.removeEventListener("pointermove", onPointerMove);
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div className="easter-egg-layer" aria-hidden="true">
      <div className="cyber-grid" />
      <div className="matrix-rain">
        {RAIN_COLUMNS.map((text, index) => (
          <span
            key={`${text}-${index}`}
            style={{
              "--delay": `${(index % 6) * -0.7}s`,
              "--left": `${index * 6.5 + 1}%`,
              "--speed": `${8 + (index % 5)}s`,
            } as CSSProperties}
          >
            {text.split("").join("\n")}
          </span>
        ))}
      </div>
      <div className="cyber-weather">
        {PARTICLES.map((particle, index) => (
          <i
            key={index}
            style={{
              "--delay": `${particle.delay}s`,
              "--drift": `${particle.drift * 14}px`,
              "--left": `${particle.left}%`,
              "--size": `${particle.size}px`,
              "--speed": `${particle.speed}s`,
            } as CSSProperties}
          />
        ))}
      </div>
      <div className="lightning-field">
        <span />
        <span />
      </div>
      <div className="scan-beam" />
      <div ref={cursorRef} className="cyber-cursor" />
      <div className="cyber-pet" title="Marcato pet">
        <span className="pet-ear left" />
        <span className="pet-ear right" />
        <span className="pet-body">
          <span className="pet-eye left" />
          <span className="pet-eye right" />
          <span className="pet-tail" />
        </span>
        <span className="pet-shadow" />
      </div>
    </div>
  );
}
