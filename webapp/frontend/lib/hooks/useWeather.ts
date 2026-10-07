import { useState, useEffect } from 'react';
import { Sun, Moon, CloudSun, CloudMoon, Cloud, CloudFog, CloudDrizzle, CloudRain, Snowflake, CloudSnow, CloudLightning, Thermometer, type LucideIcon } from 'lucide-react';

interface WeatherData {
  temperature: number;
  weatherCode: number;
  isDay: boolean;
}

interface UseWeatherResult {
  data: WeatherData | null;
  isLoading: boolean;
  error: string | null;
}

// Macau coordinates
const MACAU_LAT = 22.1987;
const MACAU_LON = 113.5439;

// Weather code to icon mapping (WMO codes)
// https://open-meteo.com/en/docs
export const getWeatherIcon = (code: number, isDay: boolean): string => {
  // Clear sky
  if (code === 0) return isDay ? '☀️' : '🌙';
  // Mainly clear, partly cloudy
  if (code === 1 || code === 2) return isDay ? '🌤️' : '☁️';
  // Overcast
  if (code === 3) return '☁️';
  // Fog
  if (code >= 45 && code <= 48) return '🌫️';
  // Drizzle
  if (code >= 51 && code <= 57) return '🌧️';
  // Rain
  if (code >= 61 && code <= 67) return '🌧️';
  // Snow
  if (code >= 71 && code <= 77) return '❄️';
  // Rain showers
  if (code >= 80 && code <= 82) return '🌦️';
  // Snow showers
  if (code >= 85 && code <= 86) return '🌨️';
  // Thunderstorm
  if (code >= 95 && code <= 99) return '⛈️';

  return '🌡️';
};

// The same mapping as plain line icons, for the staff UI, where an emoji
// would be the loudest thing on the dashboard and looks different on every
// machine. Zen mode keeps the emoji above, because it prints them as text.
export const getWeatherLucideIcon = (code: number, isDay: boolean): LucideIcon => {
  if (code === 0) return isDay ? Sun : Moon;
  if (code === 1 || code === 2) return isDay ? CloudSun : CloudMoon;
  if (code === 3) return Cloud;
  if (code >= 45 && code <= 48) return CloudFog;
  if (code >= 51 && code <= 57) return CloudDrizzle;
  if (code >= 61 && code <= 67) return CloudRain;
  if (code >= 71 && code <= 77) return Snowflake;
  if (code >= 80 && code <= 82) return CloudRain;
  if (code >= 85 && code <= 86) return CloudSnow;
  if (code >= 95 && code <= 99) return CloudLightning;
  return Thermometer;
};

export const getWeatherDescription = (code: number): string => {
  if (code === 0) return 'Clear';
  if (code === 1) return 'Mainly clear';
  if (code === 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code >= 45 && code <= 48) return 'Foggy';
  if (code >= 51 && code <= 57) return 'Drizzle';
  if (code >= 61 && code <= 67) return 'Rain';
  if (code >= 71 && code <= 77) return 'Snow';
  if (code >= 80 && code <= 82) return 'Showers';
  if (code >= 85 && code <= 86) return 'Snow showers';
  if (code >= 95 && code <= 99) return 'Thunderstorm';
  return 'Unknown';
};

// Cache weather data for 30 minutes
const CACHE_DURATION = 30 * 60 * 1000;
let cachedData: { data: WeatherData; timestamp: number } | null = null;

export function useWeather(): UseWeatherResult {
  const [data, setData] = useState<WeatherData | null>(cachedData?.data || null);
  const [isLoading, setIsLoading] = useState(!cachedData);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check if cache is still valid
    if (cachedData && Date.now() - cachedData.timestamp < CACHE_DURATION) {
      setData(cachedData.data);
      setIsLoading(false);
      return;
    }

    async function fetchWeather() {
      try {
        setIsLoading(true);
        const response = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${MACAU_LAT}&longitude=${MACAU_LON}&current_weather=true&timezone=Asia%2FMacau`
        );

        if (!response.ok) {
          throw new Error('Failed to fetch weather');
        }

        const result = await response.json();
        const weatherData: WeatherData = {
          temperature: Math.round(result.current_weather.temperature),
          weatherCode: result.current_weather.weathercode,
          isDay: result.current_weather.is_day === 1,
        };

        // Cache the result
        cachedData = { data: weatherData, timestamp: Date.now() };
        setData(weatherData);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Weather unavailable');
      } finally {
        setIsLoading(false);
      }
    }

    fetchWeather();
  }, []);

  return { data, isLoading, error };
}
