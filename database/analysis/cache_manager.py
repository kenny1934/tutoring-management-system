#!/usr/bin/env python3
"""
Cache Manager for Summer Conversion Analysis
Handles saving and loading data to avoid repeated database queries
"""

import json
import os
from datetime import datetime, timedelta
from pathlib import Path


class CacheManager:
    def __init__(self, config):
        self.config = config
        self.cache_dir = Path(__file__).parent / config['cache_settings']['cache_directory']
        self.cache_file = self.cache_dir / config['cache_settings']['cache_filename']
        self.cache_expiry_hours = config['cache_settings']['cache_expiry_hours']

        # Create cache directory if it doesn't exist
        self.cache_dir.mkdir(exist_ok=True)

    def is_cache_valid(self):
        """Check if cache exists and is not expired"""
        if not self.cache_file.exists():
            return False

        try:
            with open(self.cache_file, 'r', encoding='utf-8') as f:
                cache_data = json.load(f)

            cache_time = datetime.fromisoformat(cache_data.get('timestamp', ''))
            expiry_time = cache_time + timedelta(hours=self.cache_expiry_hours)

            return datetime.now() < expiry_time
        except (json.JSONDecodeError, ValueError, KeyError):
            return False

    def save_cache(self, data, insights, student_details):
        """Save analysis data to cache"""
        cache_data = {
            'timestamp': datetime.now().isoformat(),
            'data': data,
            'insights': insights,
            'student_details': student_details,
            'config_snapshot': self.config
        }

        try:
            with open(self.cache_file, 'w', encoding='utf-8') as f:
                json.dump(cache_data, f, indent=2, ensure_ascii=False, default=str)
            return True
        except Exception as e:
            print(f"Warning: Could not save cache: {e}")
            return False

    def load_cache(self):
        """Load analysis data from cache"""
        try:
            with open(self.cache_file, 'r', encoding='utf-8') as f:
                cache_data = json.load(f)

            return (
                cache_data['data'],
                cache_data['insights'],
                cache_data['student_details'],
                datetime.fromisoformat(cache_data['timestamp'])
            )
        except Exception as e:
            print(f"Warning: Could not load cache: {e}")
            return None, None, None, None

    def clear_cache(self):
        """Remove cache file"""
        try:
            if self.cache_file.exists():
                self.cache_file.unlink()
                return True
        except Exception as e:
            print(f"Warning: Could not clear cache: {e}")
        return False

    def get_cache_info(self):
        """Get cache file information"""
        if not self.cache_file.exists():
            return "No cache file found"

        try:
            stat = self.cache_file.stat()
            size_kb = stat.st_size / 1024
            mod_time = datetime.fromtimestamp(stat.st_mtime)

            with open(self.cache_file, 'r', encoding='utf-8') as f:
                cache_data = json.load(f)

            cache_time = datetime.fromisoformat(cache_data.get('timestamp', ''))
            age_hours = (datetime.now() - cache_time).total_seconds() / 3600

            return {
                'size_kb': round(size_kb, 2),
                'created': cache_time.strftime('%Y-%m-%d %H:%M:%S'),
                'age_hours': round(age_hours, 1),
                'expires_in_hours': round(max(0, self.cache_expiry_hours - age_hours), 1),
                'is_valid': self.is_cache_valid()
            }
        except Exception as e:
            return f"Cache file error: {e}"