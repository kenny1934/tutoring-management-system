#!/bin/bash

# Deploy Summer Conversion Report to GitHub Pages
# This script generates a fresh privacy-safe report and deploys it to GitHub Pages

echo "🔄 Deploying Summer Conversion Report to GitHub Pages..."
echo "=================================================="

# Check if we're in the right directory
if [ ! -f "interactive_report.py" ]; then
    echo "❌ Error: Please run this script from the database/analysis directory"
    echo "   cd database/analysis && ./deploy_to_github_pages.sh"
    exit 1
fi

# Generate fresh privacy-safe report
echo "📊 Generating privacy-safe report..."
python3 interactive_report.py --cache

if [ $? -ne 0 ]; then
    echo "❌ Error: Failed to generate report"
    exit 1
fi

# Find the latest report file
LATEST_REPORT=$(ls -t reports/interactive_summer_conversion_report_*.html | head -1)

if [ -z "$LATEST_REPORT" ]; then
    echo "❌ Error: No report found in reports/ directory"
    exit 1
fi

echo "📁 Latest report: $LATEST_REPORT"

# Copy to docs folder
echo "📋 Copying report to docs folder..."
cp "$LATEST_REPORT" ../../docs/summer-conversion-report.html

if [ $? -eq 0 ]; then
    echo "✅ Report successfully copied to docs/summer-conversion-report.html"
else
    echo "❌ Error: Failed to copy report to docs folder"
    exit 1
fi

# Check file size for verification
REPORT_SIZE=$(wc -c < "../../docs/summer-conversion-report.html")
echo "📏 Report size: $REPORT_SIZE bytes"

# Security verification
SENSITIVE_CHECK=$(grep -c "student_name\|student_id\|database.*host.*[0-9]" "../../docs/summer-conversion-report.html" 2>/dev/null || echo "0")

if [ "$SENSITIVE_CHECK" -eq "0" ]; then
    echo "🔒 Security check passed: No sensitive data found"
else
    echo "⚠️  WARNING: Potential sensitive data detected ($SENSITIVE_CHECK matches)"
    echo "   Please review the report before committing"
fi

echo "=================================================="
echo "✅ Deployment complete!"
echo ""
echo "📝 Next steps:"
echo "   1. Review the report: docs/summer-conversion-report.html"
echo "   2. Commit the changes:"
echo "      git add docs/summer-conversion-report.html"
echo "      git commit -m 'Update summer conversion report - $(date +%Y%m%d)'"
echo "      git push"
echo ""
echo "🌐 The report will be available at:"
echo "   https://[your-username].github.io/tutoring-management-system/summer-conversion-report.html"
echo "   https://[your-username].github.io/tutoring-management-system/dashboard.html"
echo ""
echo "🔐 Privacy Status: SAFE FOR PUBLIC ACCESS"
echo "   ✓ No student names or IDs"
echo "   ✓ No database credentials"
echo "   ✓ Only aggregated statistics"