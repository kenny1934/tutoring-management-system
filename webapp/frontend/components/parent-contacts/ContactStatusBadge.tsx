"use client";

import { cn } from "@/lib/utils";
import { Check, AlertCircle, Clock, XCircle } from "lucide-react";

interface ContactStatusBadgeProps {
  status: 'Never Contacted' | 'Recent' | 'Been a While' | 'Contact Needed' | string;
  size?: 'sm' | 'md';
  showLabel?: boolean;
  className?: string;
}

export function ContactStatusBadge({
  status,
  size = 'sm',
  showLabel = true,
  className
}: ContactStatusBadgeProps) {
  const getStatusConfig = () => {
    switch (status) {
      case 'Recent':
        return {
          icon: Check,
          bgColor: 'bg-green-100 dark:bg-green-900/30',
          textColor: 'text-green-700 dark:text-green-400',
          borderColor: 'border-green-200 dark:border-green-800',
          label: 'Recent',
        };
      case 'Been a While':
        return {
          icon: Clock,
          bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
          textColor: 'text-yellow-700 dark:text-yellow-400',
          borderColor: 'border-yellow-200 dark:border-yellow-800',
          label: 'Been a While',
        };
      case 'Contact Needed':
        return {
          icon: AlertCircle,
          bgColor: 'bg-red-100 dark:bg-red-900/30',
          textColor: 'text-red-700 dark:text-red-400',
          borderColor: 'border-red-200 dark:border-red-800',
          label: 'Contact Needed',
        };
      case 'Never Contacted':
      default:
        return {
          icon: XCircle,
          bgColor: 'bg-gray-100 dark:bg-gray-800',
          textColor: 'text-gray-600 dark:text-gray-400',
          borderColor: 'border-gray-200 dark:border-gray-700',
          label: 'Never Contacted',
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;
  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4';
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';
  const padding = size === 'sm' ? 'px-1.5 py-0.5' : 'px-2 py-1';

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border",
        config.bgColor,
        config.textColor,
        config.borderColor,
        padding,
        textSize,
        "font-medium whitespace-nowrap",
        className
      )}
    >
      <Icon className={iconSize} />
      {showLabel && <span>{config.label}</span>}
    </span>
  );
}

// Simple dot indicator for compact views
export function ContactStatusDot({
  status
}: {
  status: 'Never Contacted' | 'Recent' | 'Been a While' | 'Contact Needed' | string
}) {
  const getColor = () => {
    switch (status) {
      case 'Recent':
        return 'bg-green-500';
      case 'Been a While':
        return 'bg-yellow-500';
      case 'Contact Needed':
        return 'bg-red-500';
      case 'Never Contacted':
      default:
        return 'bg-gray-400';
    }
  };

  return (
    <span
      className={cn("w-2 h-2 rounded-full inline-block flex-shrink-0", getColor())}
      title={status}
    />
  );
}
