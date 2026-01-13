"use client";

import { cn } from "@/lib/utils";
import {
  Phone,
  MessageCircle,
  TrendingUp,
  AlertTriangle
} from "lucide-react";

// Contact method and type constants
export const CONTACT_METHODS = ['WeChat', 'Phone', 'In-Person'] as const;
export const CONTACT_TYPES = ['Progress Update', 'Concern', 'General'] as const;

export type ContactMethod = typeof CONTACT_METHODS[number];
export type ContactType = typeof CONTACT_TYPES[number];

// Custom WeChat icon SVG
export const WeChatIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.045c.134 0 .24-.111.24-.247 0-.06-.024-.12-.04-.178l-.326-1.233a.49.49 0 0 1 .178-.553c1.527-1.122 2.5-2.782 2.5-4.622 0-3.105-3.05-5.924-7.059-6.119zm-2.07 2.867c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.14 0c.535 0 .969.44.969.982a.976.976 0 0 1-.97.983.976.976 0 0 1-.968-.983c0-.542.434-.982.969-.982z"/>
  </svg>
);

// Custom In-Person icon SVG (two people meeting)
export const InPersonIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="7" cy="6" r="3" />
    <circle cx="17" cy="6" r="3" />
    <path d="M2 20c0-3.5 2.5-6 5-6s5 2.5 5 6" />
    <path d="M12 20c0-3.5 2.5-6 5-6s5 2.5 5 6" />
  </svg>
);

// Get icon for contact method
export function getMethodIcon(method: string, size: string = "h-4 w-4") {
  switch (method) {
    case 'WeChat':
      return <WeChatIcon className={cn(size, "text-green-600")} />;
    case 'Phone':
      return <Phone className={cn(size, "text-blue-600")} />;
    case 'In-Person':
      return <InPersonIcon className={cn(size, "text-purple-600")} />;
    default:
      return <MessageCircle className={size} />;
  }
}

// Get icon for contact type
export function getContactTypeIcon(type: string, size: string = "h-3 w-3") {
  switch (type) {
    case 'Progress Update':
      return <TrendingUp className={size} />;
    case 'Concern':
      return <AlertTriangle className={size} />;
    case 'General':
    default:
      return <MessageCircle className={size} />;
  }
}

// Get color classes for contact type badge
export function getContactTypeColor(type: string) {
  switch (type) {
    case 'Progress Update':
      return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400';
    case 'Concern':
      return 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400';
    case 'General':
    default:
      return 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400';
  }
}
