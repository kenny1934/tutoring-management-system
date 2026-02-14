"use client";

import React, { useState } from "react";
import { Clock, Sun, Calendar } from "lucide-react";

function getDefaultCustomDateTime() {
  const d = new Date(Date.now() + 60_000);
  const date = d.toLocaleDateString("en-CA");
  const time = d.toTimeString().slice(0, 5);
  return { date, time };
}

interface SnoozePickerProps {
  onSnooze: (snoozeUntil: string) => void;
  onClose: () => void;
}

function getSnoozeOptions() {
  const now = new Date();
  const laterToday = new Date(now);
  laterToday.setHours(laterToday.getHours() + 3, 0, 0, 0);

  const tomorrow9am = new Date(now);
  tomorrow9am.setDate(tomorrow9am.getDate() + 1);
  tomorrow9am.setHours(9, 0, 0, 0);

  const nextMonday9am = new Date(now);
  const daysUntilMonday = ((8 - now.getDay()) % 7) || 7;
  nextMonday9am.setDate(nextMonday9am.getDate() + daysUntilMonday);
  nextMonday9am.setHours(9, 0, 0, 0);

  return [
    { label: "Later today", sublabel: formatTime(laterToday), value: laterToday.toISOString(), icon: Clock },
    { label: "Tomorrow", sublabel: `Tomorrow ${formatTime(tomorrow9am)}`, value: tomorrow9am.toISOString(), icon: Sun },
    { label: "Next week", sublabel: `Monday ${formatTime(nextMonday9am)}`, value: nextMonday9am.toISOString(), icon: Calendar },
  ];
}

function formatTime(date: Date) {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function SnoozePicker({ onSnooze, onClose }: SnoozePickerProps) {
  const [showCustom, setShowCustom] = useState(false);
  const [customDate, setCustomDate] = useState("");
  const [customTime, setCustomTime] = useState("09:00");
  const options = getSnoozeOptions();

  const handleCustomSnooze = () => {
    if (!customDate) return;
    const dt = new Date(`${customDate}T${customTime}:00`);
    if (dt <= new Date()) return;
    onSnooze(dt.toISOString());
  };

  return (
    <div className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-[#2a2a2a] rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50">
      {options.map(opt => (
        <button
          key={opt.label}
          type="button"
          onClick={() => onSnooze(opt.value)}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-[#f5ede3]/60 dark:hover:bg-[#3d3628]/50 transition-colors text-left"
        >
          <opt.icon className="h-4 w-4 text-gray-400" />
          <div>
            <div className="text-gray-700 dark:text-gray-200">{opt.label}</div>
            <div className="text-[11px] text-gray-400">{opt.sublabel}</div>
          </div>
        </button>
      ))}
      <div className="border-t border-gray-200 dark:border-gray-700 mt-1 pt-1">
        {!showCustom ? (
          <button
            type="button"
            onClick={() => {
              const { date, time } = getDefaultCustomDateTime();
              setCustomDate(date);
              setCustomTime(time);
              setShowCustom(true);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-[#f5ede3]/60 dark:hover:bg-[#3d3628]/50 transition-colors text-left"
          >
            <Calendar className="h-4 w-4 text-gray-400" />
            <span className="text-gray-700 dark:text-gray-200">Pick date & time</span>
          </button>
        ) : (
          <div className="px-3 py-2 space-y-1.5">
            <input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              min={new Date().toISOString().split("T")[0]}
              className="w-full px-2 py-1 text-xs border border-[#e8d4b8] dark:border-[#6b5a4a] rounded bg-transparent focus:outline-none focus:ring-1 focus:ring-[#a0704b]"
            />
            <input
              type="time"
              value={customTime}
              onChange={(e) => setCustomTime(e.target.value)}
              min={customDate === new Date().toLocaleDateString("en-CA") ? new Date().toTimeString().slice(0, 5) : undefined}
              className="w-full px-2 py-1 text-xs border border-[#e8d4b8] dark:border-[#6b5a4a] rounded bg-transparent focus:outline-none focus:ring-1 focus:ring-[#a0704b]"
            />
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setShowCustom(false)}
                className="flex-1 px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCustomSnooze}
                disabled={!customDate}
                className="flex-1 px-2 py-1 text-xs font-medium bg-[#a0704b] text-white rounded hover:bg-[#8b5f3c] disabled:opacity-40 transition-colors"
              >
                Set
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
