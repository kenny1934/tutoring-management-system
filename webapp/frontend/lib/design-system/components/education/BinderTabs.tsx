"use client";

import { ReactNode, useState } from "react";
import { cn } from "@/lib/utils";

interface BinderTabsProps {
  /**
   * Tab items
   */
  tabs: BinderTabItem[];

  /**
   * Default active tab index
   * @default 0
   */
  defaultTab?: number;

  /**
   * Show 3-ring binder holes
   * @default true
   */
  showBinderHoles?: boolean;

  /**
   * Additional CSS classes
   */
  className?: string;
}

interface BinderTabItem {
  /**
   * Tab label text
   */
  label: string;

  /**
   * Tab color
   */
  color: "red" | "orange" | "yellow" | "green" | "blue" | "purple" | "pink";

  /**
   * Tab content
   */
  content: ReactNode;
}

const TAB_COLORS = {
  red: "bg-red-500 hover:bg-red-600 border-red-600",
  orange: "bg-orange-500 hover:bg-orange-600 border-orange-600",
  yellow: "bg-yellow-400 hover:bg-yellow-500 border-yellow-500",
  green: "bg-green-500 hover:bg-green-600 border-green-600",
  blue: "bg-blue-500 hover:bg-blue-600 border-blue-600",
  purple: "bg-purple-500 hover:bg-purple-600 border-purple-600",
  pink: "bg-pink-500 hover:bg-pink-600 border-pink-600",
};

/**
 * BinderTabs - Multi-section navigation with binder divider tabs
 *
 * Creates a binder-style tabbed interface with colored staggered tabs
 * on the right edge. Perfect for course sections, multi-part documentation,
 * and progressive content disclosure.
 *
 * @example
 * ```tsx
 * <BinderTabs
 *   tabs={[
 *     { label: "Ch. 1", color: "red", content: <Chapter1 /> },
 *     { label: "Ch. 2", color: "blue", content: <Chapter2 /> },
 *     { label: "Ch. 3", color: "green", content: <Chapter3 /> },
 *   ]}
 *   showBinderHoles={true}
 * />
 * ```
 */
export function BinderTabs({
  tabs,
  defaultTab = 0,
  showBinderHoles = true,
  className,
}: BinderTabsProps) {
  const [activeTab, setActiveTab] = useState(defaultTab);

  return (
    <div className={cn("relative w-full", className)}>
      <div className="relative flex">
        {/* Main content area */}
        <div className="flex-1 relative">
          {/* Paper background with binder holes */}
          <div className="relative bg-white dark:bg-[#2d2618] paper-texture rounded-l-lg shadow-lg min-h-[600px] p-8 pr-20">
            {/* 3-ring binder holes */}
            {showBinderHoles && (
              <div className="absolute left-4 top-0 bottom-0 flex flex-col justify-around py-8">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-6 h-6 rounded-full border-4 border-gray-400 dark:border-gray-500 bg-white dark:bg-[#342d20] shadow-inner"
                  />
                ))}
              </div>
            )}

            {/* Content */}
            <div className={cn("relative z-10", showBinderHoles && "pl-8")}>
              <div className="text-gray-900 dark:text-gray-100">
                {tabs[activeTab]?.content}
              </div>
            </div>
          </div>
        </div>

        {/* Tabs on the right edge */}
        <div className="relative w-16">
          <div className="absolute top-0 right-0 bottom-0 flex flex-col justify-start pt-8 gap-2">
            {tabs.map((tab, index) => {
              const isActive = index === activeTab;
              const tabColor = TAB_COLORS[tab.color];

              return (
                <button
                  key={index}
                  onClick={() => setActiveTab(index)}
                  className={cn(
                    "relative h-24 w-12 rounded-r-lg border-r-4 border-t-2 border-b-2",
                    "transition-all duration-200 shadow-md",
                    "flex items-center justify-center",
                    tabColor,
                    isActive && "w-14 shadow-lg scale-105 z-10",
                    !isActive && "opacity-80"
                  )}
                  style={{
                    marginLeft: isActive ? "-8px" : "0",
                  }}
                >
                  {/* Tab label (vertical text) */}
                  <span className="text-white font-semibold text-sm whitespace-nowrap transform -rotate-90">
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

interface BinderTabProps {
  /**
   * Tab label
   */
  label: string;

  /**
   * Tab color
   */
  color: "red" | "orange" | "yellow" | "green" | "blue" | "purple" | "pink";

  /**
   * Is this tab active
   */
  isActive?: boolean;

  /**
   * Click handler
   */
  onClick?: () => void;

  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * BinderTab - Individual binder tab (used internally by BinderTabs)
 */
export function BinderTab({
  label,
  color,
  isActive = false,
  onClick,
  className,
}: BinderTabProps) {
  const tabColor = TAB_COLORS[color];

  return (
    <button
      onClick={onClick}
      className={cn(
        "relative h-24 w-12 rounded-r-lg border-r-4 border-t-2 border-b-2",
        "transition-all duration-200 shadow-md",
        "flex items-center justify-center",
        tabColor,
        isActive && "w-14 shadow-lg scale-105",
        !isActive && "opacity-80 hover:opacity-100",
        className
      )}
      style={{
        marginLeft: isActive ? "-8px" : "0",
      }}
    >
      <span className="text-white font-semibold text-sm whitespace-nowrap transform -rotate-90">
        {label}
      </span>
    </button>
  );
}
