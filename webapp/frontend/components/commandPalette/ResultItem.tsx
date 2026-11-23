import { CornerDownLeft, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ResultItem as ResultItemType } from "./types";
import styles from "./SearchSurface.module.css";
import { GradeBadge } from "@/components/ui/grade-label";
import { highlightMatch } from "./utils";

interface ResultItemProps {
  item: ResultItemType;
  index: number;
  isSelected: boolean;
  onClick: () => void;
  onSelect?: (index: number) => void;
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
  onSelect,
  searchTerm,
  iconColorClass,
  showEnterIcon = true,
  badge,
  onDelete,
  isRecentSearch,
}: ResultItemProps) {
  const Icon = item.icon;

  // Default icon color based on selection
  const entityColor: Record<string, string> = { student: "text-blue-700 dark:text-blue-300", session: "text-green-700 dark:text-green-300", enrollment: "text-amber-700 dark:text-amber-300", exam: "text-purple-700 dark:text-purple-300" };
  const defaultIconColor = entityColor[item.type] ?? (isSelected ? "text-accent-ink" : "text-gray-500 dark:text-gray-400");

  const iconColor = iconColorClass || defaultIconColor;

  // Recent search has a special layout with delete button
  if (isRecentSearch && onDelete) {
    return (
      <div
        id={`command-result-${item.id}`}
        role="option"
        aria-selected={isSelected}
        onPointerMove={event => { if (event.pointerType === "mouse" && !isSelected) onSelect?.(index); }}
        className={cn(
          "group flex items-center transition-colors", styles.row,
          isSelected
            ? styles.selected
            : "hover:bg-wash"
        )}
      >
        <button
          tabIndex={-1}
          data-index={index}
          onClick={onClick}
          className="flex-1 flex items-center gap-3 text-left"
        >
          <Icon className={cn("h-5 w-5 flex-shrink-0", iconColor)} />
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {item.title}
          </span>
        </button>
        <button
          aria-label={`Remove recent search ${item.title}`}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-1 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 hover:bg-line dark:hover:bg-tint rounded transition-all"
        >
          <X className="h-3 w-3 text-gray-500" />
        </button>
        {isSelected && (
          <CornerDownLeft className="h-4 w-4 text-gray-500 dark:text-gray-400" />
        )}
      </div>
    );
  }

  return (
    <button
      id={`command-result-${item.id}`}
      tabIndex={-1}
      onPointerMove={event => { if (event.pointerType === "mouse" && !isSelected) onSelect?.(index); }}
      data-index={index}
      role="option"
      aria-selected={isSelected}
      onClick={onClick}
      className={cn(
        "w-full flex items-center text-left transition-colors", styles.row,
        isSelected
          ? styles.selected
          : "hover:bg-wash"
      )}
    >
      <Icon className={cn("h-5 w-5 flex-shrink-0", iconColor)} />
      <div className="flex-1 min-w-0">
        <div data-native-session-identity className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{searchTerm ? highlightMatch(item.title, searchTerm) : item.title}</span>
          {item.identity?.grade && <GradeBadge grade={item.identity.grade} langStream={item.identity.langStream} className="shrink-0 px-1 py-px text-[10px] rounded-sm text-gray-800" />}
          {item.identity?.school && <span title={item.identity.school} className="shrink-0 max-w-[5rem] truncate px-1 py-px text-[10px] rounded-sm bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">{item.identity.school}</span>}
        </div>
        {item.subtitle && (
          <div className="text-xs text-ink-subtle line-clamp-2">
            {searchTerm ? highlightMatch(item.subtitle, searchTerm) : item.subtitle}
          </div>
        )}
        {item.matchContext?.map((match, position) => <div key={`${match.label}-${position}`} className={styles.matchContext}><span>{match.label}:</span> {searchTerm ? highlightMatch(match.text, searchTerm) : match.text}</div>)}
      </div>
      {badge}
      {isSelected && showEnterIcon && (
        <CornerDownLeft className="h-4 w-4 text-gray-500 dark:text-gray-400 flex-shrink-0" />
      )}
    </button>
  );
}
