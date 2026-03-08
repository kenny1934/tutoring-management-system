"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight, Download } from "lucide-react";

interface ImageLightboxProps {
  images: string[];
  currentIndex: number;
  onClose: () => void;
  onChangeIndex: (index: number) => void;
}

export default function ImageLightbox({ images, currentIndex, onClose, onChangeIndex }: ImageLightboxProps) {
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < images.length - 1;

  // Zoom & pan state
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const pinchStartRef = useRef(0);
  const pinchScaleRef = useRef(1);

  const isZoomed = scale > 1.05;

  // Reset zoom on image change
  useEffect(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, [currentIndex]);

  const goPrev = useCallback(() => { if (hasPrev) onChangeIndex(currentIndex - 1); }, [hasPrev, currentIndex, onChangeIndex]);
  const goNext = useCallback(() => { if (hasNext) onChangeIndex(currentIndex + 1); }, [hasNext, currentIndex, onChangeIndex]);

  const clampScale = (s: number) => Math.min(Math.max(s, 0.5), 5);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { if (isZoomed) { setScale(1); setTranslate({ x: 0, y: 0 }); } else onClose(); }
      else if (e.key === "ArrowLeft" && !isZoomed) goPrev();
      else if (e.key === "ArrowRight" && !isZoomed) goNext();
      else if (e.key === "+" || e.key === "=") setScale(s => clampScale(s + 0.25));
      else if (e.key === "-") setScale(s => clampScale(s - 0.25));
      else if (e.key === "0") { setScale(1); setTranslate({ x: 0, y: 0 }); }
    };
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [onClose, goPrev, goNext, isZoomed]);

  // Desktop scroll-to-zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.stopPropagation();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    setScale(s => {
      const next = clampScale(s + delta);
      if (next <= 1) setTranslate({ x: 0, y: 0 });
      return next;
    });
  }, []);

  // Double-click to toggle zoom
  const handleDoubleClick = useCallback(() => {
    if (isZoomed) {
      setScale(1);
      setTranslate({ x: 0, y: 0 });
    } else {
      setScale(2.5);
    }
  }, [isZoomed]);

  // Mouse drag to pan (desktop)
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!isZoomed) return;
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY, tx: translate.x, ty: translate.y };
  }, [isZoomed, translate]);

  useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setTranslate({ x: dragStartRef.current.tx + dx / scale, y: dragStartRef.current.ty + dy / scale });
    };
    const handleMouseUp = () => setIsDragging(false);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, scale]);

  // Mobile pinch-to-zoom + single-finger pan
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      pinchStartRef.current = dist;
      pinchScaleRef.current = scale;
    } else if (e.touches.length === 1 && isZoomed) {
      dragStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, tx: translate.x, ty: translate.y };
      setIsDragging(true);
    }
  }, [scale, isZoomed, translate]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      const ratio = dist / pinchStartRef.current;
      const next = clampScale(pinchScaleRef.current * ratio);
      setScale(next);
      if (next <= 1) setTranslate({ x: 0, y: 0 });
    } else if (e.touches.length === 1 && isDragging) {
      const dx = e.touches[0].clientX - dragStartRef.current.x;
      const dy = e.touches[0].clientY - dragStartRef.current.y;
      setTranslate({ x: dragStartRef.current.tx + dx / scale, y: dragStartRef.current.ty + dy / scale });
    }
  }, [isDragging, scale]);

  const handleTouchEnd = useCallback(() => { setIsDragging(false); }, []);

  // Backdrop click: reset zoom if zoomed, otherwise close
  const handleBackdropClick = useCallback(() => {
    if (isZoomed) {
      setScale(1);
      setTranslate({ x: 0, y: 0 });
    } else {
      onClose();
    }
  }, [isZoomed, onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={handleBackdropClick} />

      {/* Controls */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        {images.length > 1 && (
          <span className="text-sm text-white/70">{currentIndex + 1} / {images.length}</span>
        )}
        {isZoomed && (
          <span className="text-sm text-white/50 tabular-nums">{Math.round(scale * 100)}%</span>
        )}
        <a
          href={images[currentIndex]}
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          title="Open original"
        >
          <Download className="h-5 w-5" />
        </a>
        <button
          onClick={onClose}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Prev/Next — hidden when zoomed */}
      {!isZoomed && hasPrev && (
        <button
          onClick={goPrev}
          className="absolute left-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}
      {!isZoomed && hasNext && (
        <button
          onClick={goNext}
          className="absolute right-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}

      {/* Image */}
      <img
        src={images[currentIndex]}
        alt={`Image ${currentIndex + 1}`}
        className="relative z-[1] max-h-[90vh] max-w-[90vw] object-contain rounded-lg select-none"
        draggable={false}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: `scale(${scale}) translate(${translate.x}px, ${translate.y}px)`,
          transition: isDragging ? "none" : "transform 0.2s ease-out",
          cursor: isZoomed ? (isDragging ? "grabbing" : "grab") : "zoom-in",
        }}
      />
    </div>,
    document.body
  );
}
