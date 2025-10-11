#!/bin/bash

if [ $# -eq 0 ]; then
    echo "Usage: ./sync_coupons.sh <excel_file>"
    exit 1
fi

EXCEL_FILE="$1"
DB_HOST="localhost"
DB_PORT="3306"
DB_NAME="csm_db"

echo "=== Coupon Sync Process ==="
echo ""

# Step 1: Generate SQL
echo "1. Processing Excel file..."
source analysis_env/bin/activate
python3 scripts/process_coupons.py "$EXCEL_FILE"
deactivate

# Find the generated SQL file
SQL_FILE=$(ls -t coupon_updates_*.sql 2>/dev/null | head -1)

if [ -z "$SQL_FILE" ]; then
    echo "Error: No SQL file generated"
    exit 1
fi

echo "   Generated: $SQL_FILE"
echo ""

# Step 2: Preview
echo "2. Preview (first 20 lines):"
head -20 "$SQL_FILE"
echo ""

# Step 3: Confirm
read -p "Apply to database? (y/n): " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
fi

# Step 4: Allowlist IP
echo ""
echo "3. Allowlisting your IP (5-minute window)..."
echo "   Run this command in another terminal if not done already:"
echo ""
echo "   gcloud sql connect [INSTANCE_NAME] --user=root --project=[PROJECT_ID]"
echo ""
read -p "   Press Enter when IP is allowlisted (or Ctrl+C to cancel)..."

# Step 5: Apply to database
echo ""
echo "4. Applying to database..."
mysql -h $DB_HOST -P $DB_PORT -u root -p $DB_NAME < "$SQL_FILE"

if [ $? -eq 0 ]; then
    echo ""
    echo "5. Verifying..."
    mysql -h $DB_HOST -P $DB_PORT -u root -p $DB_NAME -e "SELECT COUNT(*) as total, SUM(available_coupons) as coupons FROM student_coupons;"

    echo ""
    echo "✅ Done! Sync completed successfully."
else
    echo ""
    echo "❌ Error: Database connection failed. Check if IP is allowlisted."
    exit 1
fi
