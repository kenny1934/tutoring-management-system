import type { DocumentWatermark } from "@/types";

interface WatermarkProps {
  config: DocumentWatermark;
  /** CSS top position (e.g. "148.5mm" for page center). If omitted, uses default page center. */
  topPosition?: string;
  className?: string;
}

export function Watermark({ config, topPosition = "148.5mm", className }: WatermarkProps) {
  if (!config.enabled) return null;

  if (config.type === "text" && config.text) {
    return (
      <span
        className={className || "document-watermark"}
        style={{
          position: "absolute",
          top: topPosition,
          left: "50%",
          transform: "translate(-50%, -50%) rotate(-45deg)",
          pointerEvents: "none",
          zIndex: 0,
          fontSize: "80px",
          fontWeight: "bold",
          color: "#000",
          whiteSpace: "nowrap",
          userSelect: "none",
          opacity: config.opacity,
        }}
      >
        {config.text}
      </span>
    );
  }

  if (config.type === "image" && config.imageUrl) {
    return (
      <img
        src={config.imageUrl}
        alt=""
        className={className || "document-watermark-image"}
        style={{
          position: "absolute",
          top: topPosition,
          left: "50%",
          transform: "translate(-50%, -50%)",
          pointerEvents: "none",
          zIndex: 0,
          maxWidth: `${config.imageSize ?? 60}%`,
          maxHeight: `${config.imageSize ?? 60}%`,
          userSelect: "none",
          opacity: config.opacity,
        }}
      />
    );
  }

  return null;
}
