"use client";

import { ReactNode, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface FileFolderProps {
  /**
   * Tab configuration
   */
  tabs: TabConfig[];

  /**
   * Initially active tab index
   * @default 0
   */
  defaultTab?: number;

  /**
   * Tab position
   * @default "top"
   */
  tabPosition?: "top" | "side";

  /**
   * Additional CSS classes
   */
  className?: string;

  /**
   * Callback when tab changes
   */
  onTabChange?: (index: number) => void;
}

interface TabConfig {
  /**
   * Tab label
   */
  label: string;

  /**
   * Tab content
   */
  content: ReactNode;

  /**
   * Optional color dot for tab
   */
  color?: "red" | "blue" | "green" | "yellow" | "orange";
}

/**
 * FileFolder - Tabbed navigation with manila folder aesthetic
 *
 * Creates manila file folder tabs for organizing content into categories.
 * Use for student profiles, document organization, or section navigation.
 *
 * @example
 * ```tsx
 * <FileFolder
 *   tabs={[
 *     { label: "Personal Info", content: <PersonalInfo />, color: "red" },
 *     { label: "Grades", content: <Grades />, color: "blue" },
 *     { label: "Attendance", content: <Attendance />, color: "green" },
 *   ]}
 *   defaultTab={0}
 * />
 * ```
 */
export function FileFolder({
  tabs,
  defaultTab = 0,
  tabPosition = "top",
  className,
  onTabChange,
}: FileFolderProps) {
  const [activeTab, setActiveTab] = useState(defaultTab);

  const handleTabClick = (index: number) => {
    setActiveTab(index);
    onTabChange?.(index);
  };

  return (
    <div className={cn("relative", className)}>
      {/* Tabs */}
      <div
        className={cn(
          "flex gap-1",
          tabPosition === "top" ? "flex-row mb-0" : "flex-col mr-0"
        )}
      >
        {tabs.map((tab, index) => (
          <FolderTab
            key={index}
            label={tab.label}
            color={tab.color}
            active={activeTab === index}
            onClick={() => handleTabClick(index)}
            position={tabPosition}
          />
        ))}
      </div>

      {/* Content */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className={cn(
          "bg-[#e6d5b8] dark:bg-[#3d3a32] p-6 rounded-lg",
          "paper-shadow-md border border-amber-900/20",
          tabPosition === "top" ? "rounded-tl-none" : "rounded-tr-none"
        )}
      >
        {tabs[activeTab].content}
      </motion.div>
    </div>
  );
}

interface FolderTabProps {
  label: string;
  color?: "red" | "blue" | "green" | "yellow" | "orange";
  active: boolean;
  onClick: () => void;
  position: "top" | "side";
}

function FolderTab({ label, color, active, onClick, position }: FolderTabProps) {
  const colorDot = color
    ? {
        red: "bg-red-500",
        blue: "bg-blue-500",
        green: "bg-green-500",
        yellow: "bg-yellow-500",
        orange: "bg-orange-500",
      }[color]
    : null;

  return (
    <button
      onClick={onClick}
      className={cn(
        "relative px-4 py-2 font-medium text-sm transition-all",
        "font-handwriting-print",
        active
          ? "bg-[#e6d5b8] dark:bg-[#3d3a32] text-foreground z-10"
          : "bg-[#d4c5a8] dark:bg-[#2d2a22] text-foreground/70 hover:text-foreground z-0",
        position === "top"
          ? "rounded-t-lg clip-path-tab-top"
          : "rounded-l-lg clip-path-tab-side",
        "border border-amber-900/20",
        active && "border-b-0"
      )}
      style={{
        clipPath:
          position === "top"
            ? "polygon(5% 0%, 95% 0%, 100% 100%, 0% 100%)"
            : "polygon(0% 5%, 100% 0%, 100% 100%, 0% 95%)",
      }}
    >
      {/* Color dot indicator */}
      {colorDot && (
        <span
          className={cn(
            "inline-block w-2 h-2 rounded-full mr-2",
            colorDot
          )}
        ></span>
      )}

      {label}

      {/* Active tab indicator line */}
      {active && position === "top" && (
        <motion.div
          layoutId="activeTab"
          className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#e6d5b8] dark:bg-[#3d3a32]"
        />
      )}
    </button>
  );
}
