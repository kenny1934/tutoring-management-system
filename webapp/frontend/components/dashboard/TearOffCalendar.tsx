"use client";

import { cn } from "@/lib/utils";
import { useWeather, getWeatherIcon, getWeatherDescription } from "@/lib/useWeather";

interface TearOffCalendarProps {
  className?: string;
}

export function TearOffCalendar({ className }: TearOffCalendarProps) {
  const today = new Date();
  const month = today.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  const date = today.getDate();
  const day = today.toLocaleDateString('en-US', { weekday: 'short' });

  const { data: weather, isLoading: weatherLoading } = useWeather();

  return (
    <div
      className={cn(
        "inline-flex h-8 overflow-visible rounded-l-md",
        className
      )}
    >
      {/* Month section - warm brown to match theme */}
      <div className="flex items-center justify-center px-2 bg-[#a0704b] dark:bg-[#8b5a3a] rounded-l-md">
        <span className="text-[10px] font-bold text-white tracking-wide">
          {month}
        </span>
      </div>

      {/* Paper section with date, day, and weather */}
      <div
        className="flex items-center gap-1.5 px-2.5 bg-[#fef9f3] dark:bg-[#2d2618] border-y border-[#e8d4b8] dark:border-[#6b5a4a]"
        style={{
          // Torn edge effect on the right + shadow that follows the clip
          clipPath: "polygon(0 0, calc(100% - 4px) 0, 100% 15%, calc(100% - 3px) 25%, 100% 40%, calc(100% - 2px) 50%, 100% 65%, calc(100% - 3px) 75%, 100% 85%, calc(100% - 4px) 100%, 0 100%)",
          filter: "drop-shadow(1px 2px 2px rgba(0,0,0,0.1))",
        }}
      >
        <span className="text-base font-bold text-gray-900 dark:text-gray-100">
          {date}
        </span>
        <span className="text-sm font-handwriting text-gray-500 dark:text-gray-400">
          {day}
        </span>

        {/* Weather section */}
        {weatherLoading ? (
          <span className="text-xs text-gray-400 animate-pulse ml-1">...</span>
        ) : weather ? (
          <div
            className="flex items-center gap-1 ml-1 pl-1.5 border-l border-[#e8d4b8] dark:border-[#6b5a4a]"
            title={getWeatherDescription(weather.weatherCode)}
          >
            <span className="text-sm">
              {getWeatherIcon(weather.weatherCode, weather.isDay)}
            </span>
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400 pr-1">
              {weather.temperature}°
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
