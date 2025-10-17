import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type StatusType =
  | "attended" | "paid" | "active" | "regular" | "success"
  | "scheduled" | "info"
  | "pending" | "make-up" | "warning"
  | "cancelled" | "urgent" | "overdue" | "danger"
  | "inactive" | "unknown" | "default";

interface StatusBadgeProps {
  status: string;
  className?: string;
}

/**
 * StatusBadge component with CSM Pro color scheme
 *
 * Green (#4CAF50): Attended, Paid, Active, Regular
 * Cyan (#00BCD4): Scheduled, Info
 * Yellow (#FFC107): Pending Payment, Make-up Class, Warning
 * Red (#EF5350): Cancelled, Urgent, Overdue
 * Gray: Inactive, Unknown, Default
 */
export function StatusBadge({ status, className }: StatusBadgeProps) {
  const statusType = getStatusType(status);
  const variant = getStatusVariant(statusType);
  const colorClass = getStatusColorClass(statusType);

  return (
    <Badge variant={variant} className={cn(colorClass, className)}>
      {status}
    </Badge>
  );
}

function getStatusType(status: string): StatusType {
  const normalized = status.toLowerCase().trim();

  // Success/Green
  if (['attended', 'paid', 'active', 'regular'].includes(normalized)) {
    return 'success';
  }

  // Info/Cyan
  if (['scheduled', 'info'].includes(normalized)) {
    return 'info';
  }

  // Warning/Yellow
  if (['pending payment', 'pending', 'make-up class', 'makeup', 'warning'].includes(normalized)) {
    return 'warning';
  }

  // Danger/Red
  if (['cancelled', 'canceled', 'urgent', 'overdue', 'danger'].includes(normalized)) {
    return 'danger';
  }

  // Default/Gray
  return 'default';
}

function getStatusVariant(statusType: StatusType): "default" | "secondary" | "destructive" | "outline" {
  switch (statusType) {
    case 'success':
    case 'info':
    case 'warning':
      return 'default';
    case 'danger':
      return 'destructive';
    default:
      return 'secondary';
  }
}

function getStatusColorClass(statusType: StatusType): string {
  switch (statusType) {
    case 'success':
      return 'bg-[#4CAF50] hover:bg-[#45a049] text-white border-[#4CAF50]';
    case 'info':
      return 'bg-[#00BCD4] hover:bg-[#00ACC1] text-white border-[#00BCD4]';
    case 'warning':
      return 'bg-[#FFC107] hover:bg-[#FFB300] text-black border-[#FFC107]';
    case 'danger':
      return 'bg-[#EF5350] hover:bg-[#E53935] text-white border-[#EF5350]';
    default:
      return '';
  }
}
