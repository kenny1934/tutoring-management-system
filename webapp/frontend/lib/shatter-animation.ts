/**
 * Particle shatter animation for message bubble deletion.
 * Breaks a DOM element into ~40 small fragments that scatter and fade.
 */
export function shatterElement(el: HTMLElement, onComplete?: () => void): void {
  // Respect reduced motion preference
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: "forwards" })
      .onfinish = () => onComplete?.();
    return;
  }

  const rect = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  const bgColor = style.backgroundColor || "rgba(200,180,160,0.8)";

  // Hide original element but keep space
  el.style.visibility = "hidden";

  // Create particle container overlaying the element
  const container = document.createElement("div");
  container.style.cssText = `
    position: fixed; top: ${rect.top}px; left: ${rect.left}px;
    width: ${rect.width}px; height: ${rect.height}px;
    pointer-events: none; z-index: 9999; overflow: visible;
  `;
  document.body.appendChild(container);

  const PARTICLE_COUNT = 40;
  const centerX = rect.width / 2;
  const centerY = rect.height / 2;
  const animations: Animation[] = [];

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const particle = document.createElement("div");

    // Random size between 6-16px
    const size = 6 + Math.random() * 10;

    // Random position within the element bounds
    const x = Math.random() * (rect.width - size);
    const y = Math.random() * (rect.height - size);

    // Direction from center (scatter outward)
    const dx = x + size / 2 - centerX;
    const dy = y + size / 2 - centerY;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;

    // Scatter distance: 80-160px outward from center
    const scatterDist = 80 + Math.random() * 80;
    const tx = (dx / dist) * scatterDist + (Math.random() - 0.5) * 40;
    const ty = (dy / dist) * scatterDist - 20 - Math.random() * 30; // bias upward (gravity feel reversed — fragments fly up)

    const rotation = (Math.random() - 0.5) * 60; // -30 to +30 deg

    particle.style.cssText = `
      position: absolute; top: ${y}px; left: ${x}px;
      width: ${size}px; height: ${size}px;
      background: ${bgColor};
      border-radius: ${2 + Math.random() * 4}px;
      will-change: transform, opacity;
    `;
    container.appendChild(particle);

    const delay = Math.random() * 120; // stagger 0-120ms
    const duration = 800 + Math.random() * 200; // 800-1000ms

    const anim = particle.animate(
      [
        { transform: "translate(0, 0) rotate(0deg) scale(1)", opacity: 1 },
        { transform: `translate(${tx}px, ${ty}px) rotate(${rotation}deg) scale(0)`, opacity: 0 },
      ],
      {
        duration,
        delay,
        easing: "cubic-bezier(0.38, 1.21, 0.22, 1.00)",
        fill: "forwards",
      }
    );
    animations.push(anim);
  }

  // Clean up after all animations complete
  Promise.all(animations.map(a => a.finished)).then(() => {
    container.remove();
    onComplete?.();
  }).catch(() => {
    // Animation cancelled (e.g. element removed) — still clean up
    container.remove();
    onComplete?.();
  });
}
