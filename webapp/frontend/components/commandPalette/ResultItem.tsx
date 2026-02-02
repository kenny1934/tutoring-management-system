import { CornerDownLeft, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ResultItem as ResultItemType } from "./types";
import { highlightMatch } from "./utils";

interface ResultItemProps {
  item: ResultItemType;
  index: number;
  isSelected: boolean;
  onClick: () => void;
  searchTerm?: string;
  iconColorClass?: string;
  showEnterIcon?: boolean;
  badge?: React.ReactNode;
  // For recent searches
  onDelete?: () => void;
  isRecentSearch?: boolean;
}

export function ResultItemButton({
  item,
  index,
  isSelected,
  onClick,
  searchTerm,
  iconColorClass,
  showEnterIcon = true,
  badge,
  onDelete,
  isRecentSearch,
}: ResultItemProps) {
  const Icon = item.icon;

  // Default icon color based on selection
  const defaultIconColor = isSelected
    ? "text-[#a0704b] dark:text-[#cd853f]"
    : "text-gray-400 dark:text-gray-500";

  const iconColor = isSelected
    ? "text-[#a0704b] dark:text-[#cd853f]"
    : iconColorClass || defaultIconColor;

  // Recent search has a special layout with delete button
  if (isRecentSearch && onDelete) {
    return (
      <div
        id={item.id}
        role="option"
        aria-selected={isSelected}
        className={cn(
          "group flex items-center gap-3 px-4 py-2.5 max-sm:py-3 transition-colors",
          isSelected
            ? "bg-[#d4a574]/20 dark:bg-[#cd853f]/20"
            : "hover:bg-[#f5ede3] dark:hover:bg-[#2d2618]"
        )}
      >
        <button
          data-index={index}
          onClick={onClick}
          className="flex-1 flex items-center gap-3 text-left"
        >
          <Icon className={cn("h-4 w-4 flex-shrink-0", iconColor)} />
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {item.title}
          </span>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-1 opacity-0 group-hover:opacity-100 hover:bg-[#e8d4b8] dark:hover:bg-[#3d3628] rounded transition-all"
        >
          <X className="h-3 w-3 text-gray-400" />
        </button>
        {isSelected && (
          <CornerDownLeft className="h-4 w-4 text-gray-400 dark:text-gray-500" />
        )}
      </div>
    );
  }

  return (
    <button
      id={item.id}
      data-index={index}
      role="option"
      aria-selected={isSelected}
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-2.5 max-sm:py-3 text-left transition-colors",
        isSelected
          ? "bg-[#d4a574]/20 dark:bg-[#cd853f]/20"
          : "hover:bg-[#f5ede3] dark:hover:bg-[#2d2618]"
      )}
    >
      <Icon className={cn("h-4 w-4 flex-shrink-0", iconColor)} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
          {searchTerm ? highlightMatch(item.title, searchTerm) : item.title}
        </div>
        {item.subtitle && (
          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
            {searchTerm ? highlightMatch(item.subtitle, searchTerm) : item.subtitle}
          </div>
        )}
      </div>
      {badge}
      {isSelected && showEnterIcon && (
        <CornerDownLeft className="h-4 w-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
      )}
    </button>
  );
}
