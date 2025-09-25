#!/usr/bin/env python3
"""
Interactive Summer Course Conversion Report Generator
Professional, fully interactive reporting with Chart.js, dark mode, and location filtering
"""

import mysql.connector
import pandas as pd
import csv
import json
import argparse
from getpass import getpass
from pathlib import Path
from datetime import datetime
import base64
from cache_manager import CacheManager


class InteractiveSummerConversionReport:
    def __init__(self, use_cache=False, force_refresh=False):
        # Load configuration
        config_file = Path(__file__).parent / "config.json"
        with open(config_file, 'r', encoding='utf-8') as f:
            self.config = json.load(f)

        # Initialize cache manager
        self.cache_manager = CacheManager(self.config)
        self.use_cache = use_cache
        self.force_refresh = force_refresh

        # Data storage
        self.data = {}
        self.insights = {}
        self.student_details = []
        self.timestamp = datetime.now().strftime("%Y%m%d_%H%M")

        # Create output directories
        self.reports_dir = Path(__file__).parent / "reports"
        self.data_dir = self.reports_dir / "conversion_data"

        for dir_path in [self.reports_dir, self.data_dir]:
            dir_path.mkdir(exist_ok=True)

        print(f"CSM Pro - {self.config['report_settings']['report_title']}")
        print("=" * 80)

    def should_use_cache(self):
        """Determine if we should use cached data"""
        if self.force_refresh:
            print("Force refresh requested - will query database")
            return False

        if not self.use_cache:
            return False

        if self.cache_manager.is_cache_valid():
            cache_info = self.cache_manager.get_cache_info()
            print(f"Valid cache found (created: {cache_info['created']}, expires in: {cache_info['expires_in_hours']}h)")
            return True

        print("No valid cache found - will query database")
        return False

    def load_from_cache(self):
        """Load data from cache"""
        data, insights, student_details, cache_time = self.cache_manager.load_cache()
        if data:
            self.data = data
            self.insights = insights
            self.student_details = student_details
            print(f"✅ Data loaded from cache (generated: {cache_time.strftime('%Y-%m-%d %H:%M:%S')})")
            return True
        return False

    def connect_and_analyze(self):
        """Connect to database and run analysis or load from cache"""
        if self.should_use_cache() and self.load_from_cache():
            return

        print("\nDatabase connection required...")
        print("Step 1: First run this command in another terminal:")
        print("gcloud sql connect csm-regular-course-db --user=root --project=csm-database-project")
        print("This will allowlist your IP for 5 minutes")
        print()

        input("Press Enter after you've run the gcloud sql connect command and it worked...")

        # Database connection
        user = input("Username (root): ").strip() or "root"
        password = getpass("Password: ")

        try:
            connection = mysql.connector.connect(
                host=self.config['database']['host'],
                port=self.config['database']['port'],
                user=user,
                password=password,
                database=self.config['database']['database'],
                connection_timeout=self.config['database']['timeout'],
                autocommit=True,
                raise_on_warnings=False,
                ssl_disabled=True,
                auth_plugin='mysql_native_password'
            )

            print("✅ Connected to database successfully!")
            self.analyze_data(connection)
            connection.close()

            # Save to cache
            if self.cache_manager.save_cache(self.data, self.insights, self.student_details):
                print("💾 Data saved to cache for future use")

        except Exception as e:
            print(f"❌ Connection error: {e}")
            raise

    def analyze_data(self, connection):
        """Run comprehensive data analysis"""
        print("\nStep 2: Loading and analyzing data...")

        # Load summer students data
        self.load_summer_data(connection)

        # Run all analyses
        self.run_conversion_analysis(connection)
        self.calculate_insights()

        print("✅ Analysis complete!")

    def load_summer_data(self, connection):
        """Load summer course data into temporary table"""
        cursor = connection.cursor()

        # Create temporary table
        cursor.execute("DROP TEMPORARY TABLE IF EXISTS summer_students")
        cursor.execute("""
            CREATE TEMPORARY TABLE summer_students (
                student_id VARCHAR(100),
                student_name VARCHAR(255),
                coupon_code VARCHAR(100),
                location VARCHAR(10),
                category VARCHAR(50),
                INDEX idx_student_location (student_id, location)
            )
        """)

        # Load CSV data
        csv_file = Path(__file__).parent.parent.parent / "Session Log - Conversion Data.csv"

        def parse_coupon_category(coupon_code):
            if '25SSNEW' in coupon_code:
                return 'New Students'
            elif '25SummerMC' in coupon_code:
                return 'MC P6 to F1 Students'
            elif '25SummerRT' in coupon_code:
                return 'Returning Students'
            else:
                return coupon_code

        with open(csv_file, 'r', encoding='utf-8-sig') as file:
            reader = csv.DictReader(file)
            insert_query = """
                INSERT INTO summer_students
                (student_id, student_name, coupon_code, location, category)
                VALUES (%s, %s, %s, %s, %s)
            """

            for row in reader:
                student_id = row['Student ID'].strip() if row['Student ID'] else ''
                student_name = row['Student Name'].strip() if row['Student Name'] else ''
                coupon_code = row['Coupon Code'].strip()
                location = row['Location'].strip()
                category = parse_coupon_category(coupon_code)

                if student_id:
                    cursor.execute(insert_query, (
                        student_id, student_name, coupon_code, location, category
                    ))

        print("✅ Summer course data loaded")

    def run_conversion_analysis(self, connection):
        """Run comprehensive conversion analysis queries"""
        cursor = connection.cursor(dictionary=True)

        # Overall summary by category
        cursor.execute("""
            SELECT
                ss.category,
                COUNT(*) as total_summer_students,
                COUNT(DISTINCT CASE WHEN e.id IS NOT NULL THEN s.id END) as students_converted,
                ROUND(
                    COUNT(DISTINCT CASE WHEN e.id IS NOT NULL THEN s.id END) * 100.0 / COUNT(*),
                    2
                ) as conversion_rate_percent
            FROM summer_students ss
            LEFT JOIN students s ON (
                ss.student_id = s.school_student_id
                AND ss.location = s.home_location
            )
            LEFT JOIN enrollments e ON (
                s.id = e.student_id
                AND e.payment_status IN ('Paid', 'Pending Payment')
                AND e.first_lesson_date >= '2025-09-01'
            )
            GROUP BY ss.category
            ORDER BY
                CASE ss.category
                    WHEN 'New Students' THEN 1
                    WHEN 'MC P6 to F1 Students' THEN 2
                    WHEN 'Returning Students' THEN 3
                END
        """)
        self.data['category_summary'] = cursor.fetchall()

        # Location summary
        cursor.execute("""
            SELECT
                ss.location,
                COUNT(*) as total_summer_students,
                COUNT(DISTINCT CASE WHEN e.id IS NOT NULL THEN s.id END) as students_converted,
                ROUND(
                    COUNT(DISTINCT CASE WHEN e.id IS NOT NULL THEN s.id END) * 100.0 / COUNT(*),
                    2
                ) as conversion_rate_percent
            FROM summer_students ss
            LEFT JOIN students s ON (
                ss.student_id = s.school_student_id
                AND ss.location = s.home_location
            )
            LEFT JOIN enrollments e ON (
                s.id = e.student_id
                AND e.payment_status IN ('Paid', 'Pending Payment')
                AND e.first_lesson_date >= '2025-09-01'
            )
            GROUP BY ss.location
            ORDER BY ss.location
        """)
        self.data['location_summary'] = cursor.fetchall()

        # Detailed breakdown by category and location
        cursor.execute("""
            SELECT
                ss.category,
                ss.location,
                COUNT(*) as total_summer,
                COUNT(DISTINCT CASE WHEN e.id IS NOT NULL THEN s.id END) as converted,
                ROUND(
                    COUNT(DISTINCT CASE WHEN e.id IS NOT NULL THEN s.id END) * 100.0 / COUNT(*),
                    2
                ) as conversion_rate
            FROM summer_students ss
            LEFT JOIN students s ON (
                ss.student_id = s.school_student_id
                AND ss.location = s.home_location
            )
            LEFT JOIN enrollments e ON (
                s.id = e.student_id
                AND e.payment_status IN ('Paid', 'Pending Payment')
                AND e.first_lesson_date >= '2025-09-01'
            )
            GROUP BY ss.category, ss.location
            ORDER BY ss.category, ss.location
        """)
        self.data['detailed_breakdown'] = cursor.fetchall()

        # Student-level data
        cursor.execute("""
            SELECT
                ss.student_id,
                ss.student_name,
                ss.location,
                ss.category,
                ss.coupon_code,
                CASE
                    WHEN e.id IS NOT NULL THEN 'Converted to Regular Course'
                    WHEN s.id IS NOT NULL THEN 'In Database - Not Enrolled'
                    ELSE 'Not Found in Database'
                END as matching_status,
                s.id as database_student_id,
                e.first_lesson_date,
                e.payment_status,
                e.lessons_paid
            FROM summer_students ss
            LEFT JOIN students s ON (
                ss.student_id = s.school_student_id
                AND ss.location = s.home_location
            )
            LEFT JOIN enrollments e ON (
                s.id = e.student_id
                AND e.payment_status IN ('Paid', 'Pending Payment')
                AND e.first_lesson_date >= '2025-09-01'
            )
            ORDER BY ss.category, ss.location, CAST(ss.student_id AS UNSIGNED)
        """)
        self.student_details = cursor.fetchall()

    def calculate_insights(self):
        """Calculate key insights using configurable revenue settings"""
        # Overall metrics
        total_summer = sum(row['total_summer_students'] for row in self.data['category_summary'])
        total_converted = sum(row['students_converted'] for row in self.data['category_summary'])
        overall_rate = (total_converted / total_summer * 100) if total_summer > 0 else 0

        self.insights['overall'] = {
            'total_summer_students': total_summer,
            'total_converted': total_converted,
            'overall_conversion_rate': round(overall_rate, 2),
            'non_converted': total_summer - total_converted
        }

        # Best and worst performing segments
        category_rates = [(row['category'], float(row['conversion_rate_percent'])) for row in self.data['category_summary']]
        location_rates = [(row['location'], float(row['conversion_rate_percent'])) for row in self.data['location_summary']]

        self.insights['best_category'] = max(category_rates, key=lambda x: x[1])
        self.insights['worst_category'] = min(category_rates, key=lambda x: x[1])
        self.insights['best_location'] = max(location_rates, key=lambda x: x[1])
        self.insights['worst_location'] = min(location_rates, key=lambda x: x[1])

        # Follow-up opportunities (exclude data quality issues as requested)
        follow_up_students = [s for s in self.student_details if s['matching_status'] == 'In Database - Not Enrolled']

        self.insights['follow_up'] = {
            'warm_leads': len(follow_up_students),
            'total_opportunity': len(follow_up_students)  # Only count warm leads
        }

        # Revenue opportunity calculation
        revenue_config = self.config['revenue_calculation']
        revenue_opportunity = (
            self.insights['follow_up']['total_opportunity'] *
            revenue_config['avg_lessons_per_enrollment'] *
            revenue_config['avg_fee_per_lesson']
        )

        self.insights['revenue_opportunity'] = {
            'potential_students': self.insights['follow_up']['total_opportunity'],
            'estimated_revenue': revenue_opportunity,
            'calculation_details': {
                'students': self.insights['follow_up']['total_opportunity'],
                'lessons_per_student': revenue_config['avg_lessons_per_enrollment'],
                'fee_per_lesson': revenue_config['avg_fee_per_lesson'],
                'formula': f"{self.insights['follow_up']['total_opportunity']} students × {revenue_config['avg_lessons_per_enrollment']} lessons × {revenue_config['currency_symbol']}{revenue_config['avg_fee_per_lesson']}/lesson",
                'description': revenue_config['description'],
                'timeframe': revenue_config['projection_timeframe']
            }
        }

    def generate_chart_data_json(self):
        """Generate JSON data for Chart.js consumption"""
        # Prepare data for all locations and combined
        chart_data = {
            'combined': {
                'categories': [row['category'] for row in self.data['category_summary']],
                'rates': [float(row['conversion_rate_percent']) for row in self.data['category_summary']],
                'counts': [f"{row['students_converted']}/{row['total_summer_students']}" for row in self.data['category_summary']],
                'locations': [row['location'] for row in self.data['location_summary']],
                'location_rates': [float(row['conversion_rate_percent']) for row in self.data['location_summary']],
                'location_counts': [f"{row['students_converted']}/{row['total_summer_students']}" for row in self.data['location_summary']]
            }
        }

        # Add data for each location
        for location in ['MSA', 'MSB']:
            location_students = [s for s in self.student_details if s['location'] == location]
            location_categories = {}

            for student in location_students:
                category = student['category']
                if category not in location_categories:
                    location_categories[category] = {'total': 0, 'converted': 0}
                location_categories[category]['total'] += 1
                if student['matching_status'] == 'Converted to Regular Course':
                    location_categories[category]['converted'] += 1

            # Sort categories consistently (same order as SQL query)
            category_order = ['New Students', 'MC P6 to F1 Students', 'Returning Students']
            sorted_categories = [cat for cat in category_order if cat in location_categories]

            rates = []
            counts = []
            for category in sorted_categories:
                total = location_categories[category]['total']
                converted = location_categories[category]['converted']
                rate = (converted / total * 100) if total > 0 else 0
                rates.append(rate)
                counts.append(f"{converted}/{total}")

            chart_data[location] = {
                'categories': sorted_categories,
                'rates': rates,
                'counts': counts
            }

        return chart_data

    def generate_privacy_safe_data(self):
        """Generate aggregated data without exposing individual student information"""
        privacy_data = {
            'metrics': {},
            'categoryData': {},
            'locationData': {}
        }

        # Overall metrics for each location filter
        locations = ['combined', 'MSA', 'MSB']
        categories = ['New Students', 'MC P6 to F1 Students', 'Returning Students']

        for location in locations:
            if location == 'combined':
                filtered_students = self.student_details
            else:
                filtered_students = [s for s in self.student_details if s['location'] == location]

            total_students = len(filtered_students)
            converted_students = len([s for s in filtered_students if s['matching_status'] == 'Converted to Regular Course'])
            follow_up_students = len([s for s in filtered_students if s['matching_status'] == 'In Database - Not Enrolled'])
            conversion_rate = (converted_students / total_students * 100) if total_students > 0 else 0
            revenue_opportunity = follow_up_students * 6 * 350  # 6 lessons × $350

            privacy_data['metrics'][location] = {
                'total_students': total_students,
                'converted_students': converted_students,
                'conversion_rate': round(conversion_rate, 2),
                'follow_up_opportunities': follow_up_students,
                'revenue_opportunity': revenue_opportunity,
                'non_converted': total_students - converted_students
            }

            # Category breakdown for this location
            privacy_data['categoryData'][location] = {}
            for category in categories:
                if location == 'combined':
                    cat_students = [s for s in self.student_details if s['category'] == category]
                else:
                    cat_students = [s for s in self.student_details
                                   if s['category'] == category and s['location'] == location]

                cat_total = len(cat_students)
                cat_converted = len([s for s in cat_students if s['matching_status'] == 'Converted to Regular Course'])
                cat_rate = (cat_converted / cat_total * 100) if cat_total > 0 else 0

                privacy_data['categoryData'][location][category] = {
                    'total': cat_total,
                    'converted': cat_converted,
                    'rate': round(cat_rate, 1)
                }

        # Location data (only needed for combined view)
        privacy_data['locationData'] = {
            'MSA': privacy_data['metrics']['MSA'],
            'MSB': privacy_data['metrics']['MSB']
        }

        return privacy_data

    def load_company_logo(self):
        """Load and encode both company logos (light and dark mode)"""
        logos = {}

        # Light mode logo (black text on transparent/white background)
        light_logo_path = Path(__file__).parent / "../../docs/assets/images/中學班 LOGO_PNG_黑.png"
        if light_logo_path.exists():
            try:
                with open(light_logo_path, 'rb') as img_file:
                    logos['light'] = base64.b64encode(img_file.read()).decode()
            except:
                pass

        # Dark mode logo (white text on transparent/dark background)
        dark_logo_path = Path(__file__).parent / "../../docs/assets/images/中學班 LOGO_PNG_白.png"
        if dark_logo_path.exists():
            try:
                with open(dark_logo_path, 'rb') as img_file:
                    logos['dark'] = base64.b64encode(img_file.read()).decode()
            except:
                pass

        return logos

    def generate_interactive_html_report(self):
        """Generate fully interactive HTML report with Chart.js"""
        print("Generating interactive HTML report...")

        # Load both logos
        logos = self.load_company_logo()

        # Generate chart data for JavaScript
        chart_data = self.generate_chart_data_json()

        # Generate privacy-safe aggregated data
        privacy_data = self.generate_privacy_safe_data()

        # Design colors
        design = self.config['design']

        html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{self.config['report_settings']['report_title']}</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        :root {{
            --primary-color: {design['primary_color']};
            --background-color: {design['background_color']};
            --text-color: {design['text_color']};
            --text-muted: {design['text_muted']};
            --text-light: {design['text_light']};
            --border-color: {design['border_color']};
            --sidebar-bg: {design['sidebar_bg']};
            --success-color: {design['success_color']};
            --warning-color: {design['warning_color']};
        }}

        [data-theme="dark"] {{
            --background-color: #1a1a1a;
            --text-color: #e5e5e5;
            --text-muted: #a1a1a1;
            --text-light: #888;
            --border-color: #333;
            --sidebar-bg: #242424;
        }}

        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}

        body {{
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            line-height: 1.6;
            background: var(--background-color);
            color: var(--text-color);
            transition: background-color 0.3s ease, color 0.3s ease;
        }}

        .header {{
            background: var(--background-color);
            border-bottom: 1px solid var(--border-color);
            padding: 20px 0;
            position: sticky;
            top: 0;
            z-index: 100;
            transition: background-color 0.3s ease, border-color 0.3s ease;
        }}

        .header-content {{
            max-width: 1400px;
            margin: 0 auto;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 20px;
        }}

        .logo-section {{
            display: flex;
            align-items: center;
            gap: 15px;
        }}

        .logo {{
            width: 50px;
            height: auto;
        }}

        .title {{
            font-size: 24px;
            font-weight: 700;
            color: var(--text-color);
        }}

        .header-controls {{
            display: flex;
            align-items: center;
            gap: 20px;
        }}

        .location-filter {{
            display: flex;
            gap: 10px;
            align-items: center;
        }}

        .filter-btn {{
            padding: 8px 16px;
            border: 2px solid var(--border-color);
            background: var(--background-color);
            color: var(--text-muted);
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.2s ease;
        }}

        .filter-btn.active {{
            border-color: var(--primary-color);
            background: var(--primary-color);
            color: white;
        }}

        .dark-mode-toggle {{
            background: var(--sidebar-bg);
            border: 1px solid var(--border-color);
            padding: 8px 12px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 18px;
            transition: all 0.2s ease;
        }}

        .dark-mode-toggle:hover {{
            background: var(--border-color);
        }}

        .container {{
            max-width: 1400px;
            margin: 0 auto;
            padding: 30px 20px;
        }}

        .kpi-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 20px;
            margin: 30px 0;
        }}

        .kpi-card {{
            background: var(--background-color);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 24px;
            text-align: center;
            box-shadow: 0 2px 4px rgba(0,0,0,0.02);
            transition: all 0.3s ease;
        }}

        [data-theme="dark"] .kpi-card {{
            background: var(--sidebar-bg);
        }}

        .kpi-card:hover {{
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(0,0,0,0.08);
        }}

        .kpi-number {{
            font-size: 2.5em;
            font-weight: 700;
            margin: 10px 0;
            color: var(--primary-color);
        }}

        .kpi-label {{
            font-size: 0.95em;
            color: var(--text-muted);
            font-weight: 500;
        }}

        .section {{
            margin: 40px 0;
        }}

        .section-title {{
            font-size: 20px;
            font-weight: 600;
            margin-bottom: 20px;
            color: var(--text-color);
        }}

        .charts-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
            gap: 20px;
            margin: 30px 0;
        }}

        .chart-container {{
            background: var(--background-color);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 20px;
            transition: all 0.3s ease;
        }}

        [data-theme="dark"] .chart-container {{
            background: var(--sidebar-bg);
        }}

        .chart-title {{
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 16px;
            color: var(--text-color);
            text-align: center;
        }}

        .chart-wrapper {{
            position: relative;
            height: 300px;
        }}

        .insights-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin: 30px 0;
        }}

        .insight-card {{
            background: var(--sidebar-bg);
            border-left: 4px solid var(--primary-color);
            border-radius: 8px;
            padding: 20px;
            transition: all 0.3s ease;
        }}

        .insight-title {{
            font-weight: 600;
            margin-bottom: 8px;
            color: var(--text-color);
        }}

        .insight-text {{
            color: var(--text-muted);
            font-size: 14px;
        }}

        .revenue-section {{
            background: linear-gradient(135deg, var(--sidebar-bg) 0%, var(--background-color) 100%);
            border-radius: 12px;
            padding: 30px;
            margin: 30px 0;
            border: 1px solid var(--border-color);
            transition: all 0.3s ease;
        }}

        .revenue-formula {{
            background: var(--background-color);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 16px;
            margin: 16px 0;
            font-family: 'Monaco', 'Courier New', monospace;
            font-size: 14px;
            color: var(--text-muted);
        }}

        .data-table {{
            width: 100%;
            background: var(--background-color);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            overflow: hidden;
            margin: 20px 0;
            transition: all 0.3s ease;
        }}

        .data-table th,
        .data-table td {{
            padding: 12px 16px;
            text-align: left;
            border-bottom: 1px solid var(--border-color);
        }}

        .data-table th {{
            background: var(--sidebar-bg);
            font-weight: 600;
            color: var(--text-color);
            font-size: 14px;
        }}

        .data-table tr:hover {{
            background: var(--sidebar-bg);
        }}

        .footer {{
            text-align: center;
            padding: 30px 0;
            border-top: 1px solid var(--border-color);
            color: var(--text-light);
            font-size: 14px;
            margin-top: 50px;
        }}

        @media (max-width: 768px) {{
            .header-content {{
                flex-direction: column;
                gap: 15px;
            }}

            .charts-grid {{
                grid-template-columns: 1fr;
            }}

            .kpi-grid {{
                grid-template-columns: 1fr;
            }}
        }}
    </style>
</head>
<body>
    <div class="header">
        <div class="header-content">
            <div class="logo-section">
                <img id="company-logo" src="data:image/png;base64,{logos.get('light', '')}" alt="MathConcept Secondary Academy" class="logo" style="display: {'block' if logos.get('light') else 'none'};">
                <h1 class="title">{self.config['report_settings']['report_title']}</h1>
            </div>
            <div class="header-controls">
                <div class="location-filter">
                    <span style="color: var(--text-muted); font-weight: 500; margin-right: 10px;">View:</span>
                    <button class="filter-btn active" onclick="filterLocation('combined')">All Locations</button>
                    <button class="filter-btn" onclick="filterLocation('MSA')">MSA</button>
                    <button class="filter-btn" onclick="filterLocation('MSB')">MSB</button>
                </div>
                <div class="dark-mode-toggle" onclick="toggleDarkMode()" title="Toggle dark mode">
                    <span id="theme-icon">🌙</span>
                </div>
            </div>
        </div>
    </div>

    <div class="container">
        <div class="kpi-grid">
            <div class="kpi-card">
                <div class="kpi-number" id="total-students">{self.insights['overall']['total_summer_students']}</div>
                <div class="kpi-label">Students Targeted with Promotions</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-number" id="total-converted">{self.insights['overall']['total_converted']}</div>
                <div class="kpi-label">Converted to Regular</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-number" id="conversion-rate">{self.insights['overall']['overall_conversion_rate']}%</div>
                <div class="kpi-label">Overall Conversion Rate</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-number" id="revenue-opportunity">{self.config['revenue_calculation']['currency_symbol']}{self.insights['revenue_opportunity']['estimated_revenue']:,}</div>
                <div class="kpi-label">Revenue Opportunity</div>
            </div>
        </div>

        <div class="section">
            <h2 class="section-title">Visual Analysis</h2>
            <div class="charts-grid">
                <div class="chart-container">
                    <div class="chart-title">Overall Conversion</div>
                    <div class="chart-wrapper">
                        <canvas id="overallChart"></canvas>
                    </div>
                </div>
                <div class="chart-container">
                    <div class="chart-title">Conversion by Category</div>
                    <div class="chart-wrapper">
                        <canvas id="categoryChart"></canvas>
                    </div>
                </div>
                <div class="chart-container">
                    <div class="chart-title">Conversion by Location</div>
                    <div class="chart-wrapper">
                        <canvas id="locationChart"></canvas>
                    </div>
                </div>
            </div>
        </div>

        <div class="section">
            <h2 class="section-title">Revenue Opportunity Analysis</h2>
            <div class="revenue-section">
                <h3 style="color: var(--primary-color); margin-bottom: 16px;">{self.config['revenue_calculation']['currency_symbol']}{self.insights['revenue_opportunity']['estimated_revenue']:,} Potential Revenue</h3>
                <p>{self.insights['revenue_opportunity']['calculation_details']['description']}</p>

                <div class="revenue-formula">
                    <strong>Calculation:</strong><br>
                    {self.insights['revenue_opportunity']['calculation_details']['formula']} = {self.config['revenue_calculation']['currency_symbol']}{self.insights['revenue_opportunity']['estimated_revenue']:,}
                </div>

                <p><strong>Timeframe:</strong> {self.insights['revenue_opportunity']['calculation_details']['timeframe']}</p>
                <p><strong>Assumptions:</strong> {self.insights['revenue_opportunity']['calculation_details']['lessons_per_student']} lessons per student at {self.config['revenue_calculation']['currency_symbol']}{self.insights['revenue_opportunity']['calculation_details']['fee_per_lesson']}/lesson</p>
            </div>
        </div>

        <div class="section">
            <h2 class="section-title">Key Insights</h2>
            <div class="insights-grid">
                <div class="insight-card">
                    <div class="insight-title">Best Performing Category</div>
                    <div class="insight-text">{self.insights['best_category'][0]} with {self.insights['best_category'][1]:.1f}% conversion rate</div>
                </div>
                <div class="insight-card">
                    <div class="insight-title">Best Performing Location</div>
                    <div class="insight-text">{self.insights['best_location'][0]} with {self.insights['best_location'][1]:.1f}% conversion rate</div>
                </div>
                <div class="insight-card">
                    <div class="insight-title">Follow-up Opportunities</div>
                    <div class="insight-text">{self.insights['follow_up']['warm_leads']} students in database but not enrolled</div>
                </div>
            </div>
        </div>

        <div class="section">
            <h2 class="section-title">Performance Summary</h2>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Student Category</th>
                        <th>Students Targeted with Promotions</th>
                        <th>Converted</th>
                        <th>Conversion Rate</th>
                    </tr>
                </thead>
                <tbody id="category-table-body">"""

        # Add category data rows with location data attributes
        for row in self.data['category_summary']:
            html_content += f"""
                    <tr class="category-row" data-category="{row['category']}">
                        <td>{row['category']}</td>
                        <td class="category-total">{row['total_summer_students']}</td>
                        <td class="category-converted">{row['students_converted']}</td>
                        <td class="category-rate">{float(row['conversion_rate_percent']):.1f}%</td>
                    </tr>"""

        html_content += f"""
                </tbody>
            </table>

            <table class="data-table">
                <thead>
                    <tr>
                        <th>Location</th>
                        <th>Students Targeted with Promotions</th>
                        <th>Converted</th>
                        <th>Conversion Rate</th>
                    </tr>
                </thead>
                <tbody id="location-table-body">"""

        # Add location data rows
        for row in self.data['location_summary']:
            html_content += f"""
                    <tr class="location-row" data-location="{row['location']}">
                        <td>{row['location']}</td>
                        <td>{row['total_summer_students']}</td>
                        <td>{row['students_converted']}</td>
                        <td>{float(row['conversion_rate_percent']):.1f}%</td>
                    </tr>"""

        html_content += f"""
                </tbody>
            </table>
        </div>
    </div>

    <div class="footer">
        <p>{self.config['report_settings']['company_name']} - Summer Course Conversion Analysis</p>
    </div>

    <script>
        // Chart data
        const chartData = {json.dumps(chart_data, indent=8)};
        const originalInsights = {json.dumps(self.insights, indent=8, default=str)};
        const privacyData = {json.dumps(privacy_data, indent=8)};
        const logos = {json.dumps(logos, indent=8)};

        let currentFilter = 'combined';
        let charts = {{}};

        // Theme management
        function toggleDarkMode() {{
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);

            // Update theme icon
            const themeIcon = document.getElementById('theme-icon');
            themeIcon.textContent = newTheme === 'dark' ? '☀️' : '🌙';

            // Update company logo
            const companyLogo = document.getElementById('company-logo');
            if (companyLogo && logos) {{
                const logoSrc = newTheme === 'dark' ? logos.dark : logos.light;
                if (logoSrc) {{
                    companyLogo.src = 'data:image/png;base64,' + logoSrc;
                }}
            }}

            // Update charts for new theme
            setTimeout(() => {{
                initializeCharts();
            }}, 100);
        }}

        // Load saved theme
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme) {{
            document.documentElement.setAttribute('data-theme', savedTheme);
            // Update icon on load
            const themeIcon = document.getElementById('theme-icon');
            if (themeIcon) {{
                themeIcon.textContent = savedTheme === 'dark' ? '☀️' : '🌙';
            }}
            // Update logo on load
            const companyLogo = document.getElementById('company-logo');
            if (companyLogo && logos) {{
                const logoSrc = savedTheme === 'dark' ? logos.dark : logos.light;
                if (logoSrc) {{
                    companyLogo.src = 'data:image/png;base64,' + logoSrc;
                }}
            }}
        }}

        // Update KPIs based on location filter
        function updateKPIs(location) {{
            const metrics = privacyData.metrics[location] || privacyData.metrics['combined'];

            document.getElementById('total-students').textContent = metrics.total_students;
            document.getElementById('total-converted').textContent = metrics.converted_students;
            document.getElementById('conversion-rate').textContent = metrics.conversion_rate + '%';
            document.getElementById('revenue-opportunity').textContent = '$' + metrics.revenue_opportunity.toLocaleString();
        }}

        // Calculate overall data for charts based on location
        function calculateOverallData(location) {{
            const metrics = privacyData.metrics[location] || privacyData.metrics['combined'];

            return {{
                total_converted: metrics.converted_students,
                non_converted: metrics.non_converted
            }};
        }}

        // Update category table based on location filter
        function updateCategoryTable(location) {{
            const categoryRows = document.querySelectorAll('.category-row');
            const categoryData = privacyData.categoryData[location] || privacyData.categoryData['combined'];

            categoryRows.forEach(row => {{
                const category = row.getAttribute('data-category');
                const data = categoryData[category] || {{ total: 0, converted: 0, rate: 0.0 }};

                // Update the table cells
                row.querySelector('.category-total').textContent = data.total;
                row.querySelector('.category-converted').textContent = data.converted;
                row.querySelector('.category-rate').textContent = data.rate + '%';
            }});
        }}

        // Initialize charts
        function initializeCharts() {{
            // Destroy existing charts
            Object.values(charts).forEach(chart => {{
                if (chart) chart.destroy();
            }});

            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            const textColor = isDark ? '#e5e5e5' : '#1a1a1a';
            const gridColor = isDark ? '#333' : '#e5e5e5';

            // Overall conversion donut chart
            const overallCtx = document.getElementById('overallChart').getContext('2d');
            const overallData = calculateOverallData(currentFilter);
            charts.overall = new Chart(overallCtx, {{
                type: 'doughnut',
                data: {{
                    labels: ['Converted', 'Not Converted'],
                    datasets: [{{
                        data: [overallData.total_converted, overallData.non_converted],
                        backgroundColor: ['{design['success_color']}', '{design['border_color']}'],
                        borderWidth: 2,
                        borderColor: isDark ? '#333' : '#fff'
                    }}]
                }},
                options: {{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {{
                        legend: {{
                            position: 'bottom',
                            labels: {{
                                color: textColor,
                                padding: 20
                            }}
                        }},
                        tooltip: {{
                            callbacks: {{
                                label: function(context) {{
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    const percentage = ((context.parsed / total) * 100).toFixed(1);
                                    return context.label + ': ' + context.parsed + ' (' + percentage + '%)';
                                }}
                            }}
                        }}
                    }}
                }}
            }});

            // Category conversion chart
            const categoryCtx = document.getElementById('categoryChart').getContext('2d');
            const currentCategoryData = chartData[currentFilter] || chartData.combined;

            charts.category = new Chart(categoryCtx, {{
                type: 'bar',
                data: {{
                    labels: currentCategoryData.categories || [],
                    datasets: [{{
                        label: 'Conversion Rate %',
                        data: currentCategoryData.rates || [],
                        backgroundColor: ['{design['primary_color']}', '{design['success_color']}', '{design['warning_color']}'],
                        borderWidth: 1,
                        borderColor: isDark ? '#333' : '#fff'
                    }}]
                }},
                options: {{
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {{
                        y: {{
                            beginAtZero: true,
                            ticks: {{
                                color: textColor,
                                callback: function(value) {{
                                    return value + '%';
                                }}
                            }},
                            grid: {{
                                color: gridColor
                            }}
                        }},
                        x: {{
                            ticks: {{
                                color: textColor
                            }},
                            grid: {{
                                color: gridColor
                            }}
                        }}
                    }},
                    plugins: {{
                        legend: {{
                            display: false
                        }},
                        tooltip: {{
                            callbacks: {{
                                label: function(context) {{
                                    const counts = currentCategoryData.counts || [];
                                    return context.parsed.y.toFixed(1) + '% (' + counts[context.dataIndex] + ')';
                                }}
                            }}
                        }}
                    }}
                }}
            }});

            // Location chart
            const locationCtx = document.getElementById('locationChart').getContext('2d');
            if (currentFilter === 'combined') {{
                // Show comparison of all locations
                charts.location = new Chart(locationCtx, {{
                    type: 'bar',
                    data: {{
                        labels: chartData.combined.locations,
                        datasets: [{{
                            label: 'Conversion Rate %',
                            data: chartData.combined.location_rates,
                            backgroundColor: ['{design['primary_color']}', '{design['success_color']}'],
                            borderWidth: 1,
                            borderColor: isDark ? '#333' : '#fff'
                        }}]
                    }},
                    options: {{
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {{
                            y: {{
                                beginAtZero: true,
                                ticks: {{
                                    color: textColor,
                                    callback: function(value) {{
                                        return value + '%';
                                    }}
                                }},
                                grid: {{
                                    color: gridColor
                                }}
                            }},
                            x: {{
                                ticks: {{
                                    color: textColor
                                }},
                                grid: {{
                                    color: gridColor
                                }}
                            }}
                        }},
                        plugins: {{
                            legend: {{
                                display: false
                            }},
                            tooltip: {{
                                callbacks: {{
                                    label: function(context) {{
                                        return context.parsed.y.toFixed(1) + '% (' + chartData.combined.location_counts[context.dataIndex] + ')';
                                    }}
                                }}
                            }}
                        }}
                    }}
                }});
            }} else {{
                // Show single bar for selected location
                const locationIndex = chartData.combined.locations.indexOf(currentFilter);
                const locationRate = locationIndex >= 0 ? chartData.combined.location_rates[locationIndex] : 0;
                const locationCount = locationIndex >= 0 ? chartData.combined.location_counts[locationIndex] : '0/0';

                // Use consistent colors: MSA = primary (red), MSB = success (green)
                const locationColor = currentFilter === 'MSA' ? '{design['primary_color']}' : '{design['success_color']}';

                charts.location = new Chart(locationCtx, {{
                    type: 'bar',
                    data: {{
                        labels: [currentFilter],
                        datasets: [{{
                            label: 'Conversion Rate %',
                            data: [locationRate],
                            backgroundColor: [locationColor],
                            borderWidth: 1,
                            borderColor: isDark ? '#333' : '#fff'
                        }}]
                    }},
                    options: {{
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {{
                            y: {{
                                beginAtZero: true,
                                ticks: {{
                                    color: textColor,
                                    callback: function(value) {{
                                        return value + '%';
                                    }}
                                }},
                                grid: {{
                                    color: gridColor
                                }}
                            }},
                            x: {{
                                ticks: {{
                                    color: textColor
                                }},
                                grid: {{
                                    color: gridColor
                                }}
                            }}
                        }},
                        plugins: {{
                            legend: {{
                                display: false
                            }},
                            tooltip: {{
                                callbacks: {{
                                    label: function(context) {{
                                        return context.parsed.y.toFixed(1) + '% (' + locationCount + ')';
                                    }}
                                }}
                            }}
                        }}
                    }}
                }});
            }}

        }}

        // Filter location function
        function filterLocation(location) {{
            currentFilter = location;

            // Update active button
            document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
            event.target.classList.add('active');

            // Update KPIs
            updateKPIs(location);

            // Update category table
            updateCategoryTable(location);

            // Update charts
            initializeCharts();

            // Filter location table rows
            const locationRows = document.querySelectorAll('.location-row');
            locationRows.forEach(row => {{
                const rowLocation = row.getAttribute('data-location');
                if (location === 'combined' || rowLocation === location) {{
                    row.style.display = '';
                }} else {{
                    row.style.display = 'none';
                }}
            }});
        }}

        // Initialize everything when page loads
        document.addEventListener('DOMContentLoaded', function() {{
            updateKPIs('combined');
            updateCategoryTable('combined');
            initializeCharts();
        }});
    </script>
</body>
</html>"""

        html_file = self.reports_dir / f"interactive_summer_conversion_report_{self.timestamp}.html"
        with open(html_file, 'w', encoding='utf-8') as f:
            f.write(html_content)

        print(f"✅ Interactive HTML report generated: {html_file}")
        return html_file

    def generate_csv_exports(self):
        """Generate individual CSV files for detailed analysis"""
        print("Generating CSV exports...")

        # Converted students
        converted_students = [s for s in self.student_details
                            if s['matching_status'] == 'Converted to Regular Course']

        converted_file = self.data_dir / f"converted_students_{self.timestamp}.csv"
        pd.DataFrame(converted_students).to_csv(converted_file, index=False)

        # Non-converted follow-up (warm leads only)
        follow_up_students = [s for s in self.student_details
                            if s['matching_status'] == 'In Database - Not Enrolled']

        followup_file = self.data_dir / f"followup_opportunities_{self.timestamp}.csv"
        pd.DataFrame(follow_up_students).to_csv(followup_file, index=False)

        # All student details
        all_students_file = self.data_dir / f"all_student_details_{self.timestamp}.csv"
        pd.DataFrame(self.student_details).to_csv(all_students_file, index=False)

        print(f"✅ CSV exports generated in: {self.data_dir}")
        print(f"  • Converted students: {len(converted_students)}")
        print(f"  • Follow-up opportunities: {len(follow_up_students)}")
        print(f"  • Total students: {len(self.student_details)}")

    def generate_excel_report(self):
        """Generate Excel report with multiple sheets"""
        print("Generating Excel report...")

        excel_file = self.reports_dir / f"interactive_summer_conversion_report_{self.timestamp}.xlsx"

        with pd.ExcelWriter(excel_file, engine='openpyxl') as writer:
            # Executive summary
            revenue_config = self.config['revenue_calculation']
            summary_data = {
                'Metric': [
                    'Students Targeted with Promotions',
                    'Students Converted',
                    'Overall Conversion Rate (%)',
                    'Revenue Opportunity (' + revenue_config['currency_symbol'] + ')',
                    'Revenue Calculation',
                    'Assumptions'
                ],
                'Value': [
                    self.insights['overall']['total_summer_students'],
                    self.insights['overall']['total_converted'],
                    self.insights['overall']['overall_conversion_rate'],
                    self.insights['revenue_opportunity']['estimated_revenue'],
                    self.insights['revenue_opportunity']['calculation_details']['formula'],
                    f"{revenue_config['avg_lessons_per_enrollment']} lessons × {revenue_config['currency_symbol']}{revenue_config['avg_fee_per_lesson']}/lesson"
                ]
            }
            pd.DataFrame(summary_data).to_excel(writer, sheet_name='Executive Summary', index=False)

            # Other sheets
            pd.DataFrame(self.data['category_summary']).to_excel(writer, sheet_name='Category Analysis', index=False)
            pd.DataFrame(self.data['location_summary']).to_excel(writer, sheet_name='Location Analysis', index=False)
            pd.DataFrame(self.data['detailed_breakdown']).to_excel(writer, sheet_name='Detailed Breakdown', index=False)
            pd.DataFrame(self.student_details).to_excel(writer, sheet_name='Student Details', index=False)

        print(f"✅ Excel report generated: {excel_file}")
        return excel_file

    def run_complete_analysis(self):
        """Run complete analysis and generate all reports"""
        try:
            # Connect and analyze data (or load from cache)
            self.connect_and_analyze()

            # Generate reports
            print("\nStep 3: Generating comprehensive reports...")
            html_file = self.generate_interactive_html_report()
            excel_file = self.generate_excel_report()
            self.generate_csv_exports()

            print("\n✅ Interactive analysis complete!")
            print("=" * 80)
            print("Generated Reports:")
            print(f"  • Interactive HTML: {html_file}")
            print(f"  • Excel Workbook: {excel_file}")
            print(f"  • CSV Data: {self.data_dir}")
            print("=" * 80)

            # Print summary
            self.print_executive_summary()

        except Exception as e:
            print(f"❌ Error during analysis: {e}")
            raise

    def print_executive_summary(self):
        """Print executive summary"""
        revenue_config = self.config['revenue_calculation']
        print(f"\nEXECUTIVE SUMMARY - {self.config['report_settings']['company_name']}")
        print("=" * 80)
        print(f"Students Targeted with Promotions: {self.insights['overall']['total_summer_students']}")
        print(f"Students Converted: {self.insights['overall']['total_converted']}")
        print(f"Overall Conversion Rate: {self.insights['overall']['overall_conversion_rate']}%")
        print(f"Revenue Opportunity: {revenue_config['currency_symbol']}{self.insights['revenue_opportunity']['estimated_revenue']:,}")
        print(f"Follow-up Opportunities: {self.insights['follow_up']['warm_leads']}")
        print("=" * 80)


def main():
    parser = argparse.ArgumentParser(description='Interactive Summer Course Conversion Analysis')
    parser.add_argument('--cache', action='store_true', help='Use cached data if available')
    parser.add_argument('--refresh', action='store_true', help='Force refresh data from database')
    parser.add_argument('--cache-info', action='store_true', help='Show cache information')

    args = parser.parse_args()

    if args.cache_info:
        # Just show cache info
        config_file = Path(__file__).parent / "config.json"
        with open(config_file, 'r', encoding='utf-8') as f:
            config = json.load(f)
        cache_manager = CacheManager(config)
        info = cache_manager.get_cache_info()
        print("Cache Information:")
        if isinstance(info, dict):
            for key, value in info.items():
                print(f"  {key}: {value}")
        else:
            print(f"  {info}")
        return

    # Run analysis
    generator = InteractiveSummerConversionReport(
        use_cache=args.cache,
        force_refresh=args.refresh
    )
    generator.run_complete_analysis()


if __name__ == "__main__":
    main()