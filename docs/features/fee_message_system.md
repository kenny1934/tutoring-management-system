# Fee Message & Discount System for Bulk Enrollment

## Overview

This system streamlines fee message generation and discount management for the bulk enrollment period, replacing the cumbersome spreadsheet-based concatenation process with integrated AppSheet functionality.

## Current Workflow Enhancement

**Before:** MSA/B Assignments → Submit Enrollment → Generate Sessions → *[Manual spreadsheet fee message creation]*

**After:** MSA/B Assignments → Submit Enrollment → Generate Sessions → **Automatic Fee Message Generation** → Copy & Send to Parents

---

## Part 1: Simplified Discount Management

### Step 1: Populate Common Discounts

Add these standard discount amounts to your existing `discounts` SQL table:

```sql
INSERT INTO discounts (discount_name, discount_type, discount_value, is_active) VALUES
('Student Discount $300', 'Fixed Amount', 300.00, TRUE),
('Staff Referral Coupon $500', 'Fixed Amount', 500.00, TRUE),
('Student Discount $200', 'Fixed Amount', 200.00, TRUE),
('Trial to Enrollment Discount $150', 'Fixed Amount', 150.00, TRUE),
('No Discount', 'None', 0.00, TRUE);
```

**If you've already inserted the discounts, update the existing row:**
```sql
UPDATE discounts 
SET discount_name = 'Staff Referral Coupon $500' 
WHERE discount_name = 'Student Discount $500' AND discount_value = 500.00;
```

### Step 2: Create Discount Management View (Optional)

**Navigate to:** UX > Views > New View

#### View Configuration:
| Setting | Value |
|---------|-------|
| **View Name** | `Discount Management` |
| **For This Data** | `discounts` |
| **View Type** | `Table` |

**Purpose:** Allow admins to easily add/modify discount amounts as needed.

---

## Part 2: Fee Calculation System

### Step 3: Add Virtual Columns to `enrollments` Table

Navigate to **Data > Tables > enrollments** and add these virtual columns:

#### 1. `Base_Fee` (Price)
**Expression:**
```
(
  IF([lessons_paid] = 6, 2400.00,
  IF([lessons_paid] = 12, 4800.00,
  [lessons_paid] * 400.00))
)
```
**Purpose:** Calculates base fee based on lesson count ($400/lesson, 6 lessons = $2400)

#### 2. `Discount_Amount` (Price)
**Expression:**
```
IF(
  ISBLANK([discount_id]),
  0,
  LOOKUP([discount_id], "discounts", "id", "discount_value")
)
```
**Purpose:** Retrieves discount amount from discounts table

#### 3. `Reg_Fee` (Price)
**Expression:**
```
IF([is_new_student] = TRUE, 100.00, 0.00)
```
**Purpose:** Adds $100 reg fee for new students (requires is_new_student field)

#### 4. `Subtotal_Before_Discount` (Price)
**Expression:**
```
[Base_Fee] + [Reg_Fee]
```
**Purpose:** Total before applying discounts

#### 5. `Final_Fee` (Price)
**Expression:**
```
MAX(0, [Subtotal_Before_Discount] - [Discount_Amount])
```
**Purpose:** Calculates final amount after discount (minimum $0)

#### 6. `Discount_Description` (Text)
**Expression:**
```
IF(
  ISBLANK([discount_id]),
  "No discount applied",
  LOOKUP([discount_id], "discounts", "id", "discount_name")
)
```
**Purpose:** Human-readable discount description

---

## Part 3: Fee Message Generation

### Step 4: Create Fee Message Virtual Column

#### 7. `Fee_Message` (LongText) - Enhanced Chinese Template with Location Awareness
**Expression:**
```
CONCATENATE(
  "家長您好，以下是 常規課程 下一期學費的明細：\n\n",
  "學生編號：", LOOKUP([student_id], "students", "id", "id"), "\n",
  "學生姓名：", LOOKUP([student_id], "students", "id", "student_name"), "\n",
  "上課時間：逢星期", 
  SWITCH([assigned_day], "Sunday", "日", "Monday", "一", "Tuesday", "二", "Wednesday", "三", "Thursday", "四", "Friday", "五", "Saturday", "六", [assigned_day]),
  " ", [assigned_time], " (90分鐘)\n",
  "上課日期：\n",
  "                  ", TEXT([first_lesson_date], "yyyy/mm/dd"), "\n",
  "                  ", TEXT([first_lesson_date] + 7, "yyyy/mm/dd"), "\n",
  "                  ", TEXT([first_lesson_date] + 14, "yyyy/mm/dd"), "\n",
  "                  ", TEXT([first_lesson_date] + 21, "yyyy/mm/dd"), "\n",
  "                  ", TEXT([first_lesson_date] + 28, "yyyy/mm/dd"), "\n",
  "                  ", TEXT([first_lesson_date] + 35, "yyyy/mm/dd"), "\n",
  "                  (共", [lessons_paid], "堂)\n\n",
  "費用： $", TEXT([Final_Fee]),
  IF([Discount_Amount] > 0, 
    CONCATENATE(" (已折扣$", TEXT([Discount_Amount]), "學費禮劵，原價為$", TEXT([Base_Fee]), IF([Reg_Fee] > 0, "+$100報名費", ""), ")"),
    IF([Reg_Fee] > 0, " ($100報名費已豁免)", "")
  ), "\n\n",
  "請於第一堂之前繳交學費。逾期繳費者，本中心將收取$200手續費，並保留權利拒絕學生上課。\n",
  "家長可親臨中學教室(", 
  SWITCH([location], "MSA", "華士古分校", "MSB", "二龍喉分校", [location]), ")",
  IF([location] = "MSB", " (星期二三公休)", ""),
  " 以現金方式繳交學費，或選擇把學費存入以下戶口：\n\n",
  "銀行：中國銀行\n",
  "名稱：弘教數學教育中心\n",
  "號碼：", 
  IF([location] = "MSA", "185000380468369", 
     IF([location] = "MSB", "185000010473304", "185000380468369")), "\n",
  "請於備註註明學生姓名及其編號，並發收條至中心微信號確認，謝謝[Joyful]\n\n",
  "MathConcept 中學教室 (", 
  SWITCH([location], "MSA", "華士古分校", "MSB", "二龍喉分校", [location]), ")"
)
```

**Purpose:** Generates complete, personalized fee message ready for parent communication

---

## Part 4: Database Schema Addition

### Step 5: Add New Student Field (Required)

You'll need to add a field to track new students for reg fee calculation:

**Option 1: Add to enrollments table (Recommended)**
```sql
ALTER TABLE enrollments ADD COLUMN is_new_student BOOLEAN DEFAULT FALSE;
```

**Option 2: Add to students table and reference**
```sql
ALTER TABLE students ADD COLUMN is_new_student BOOLEAN DEFAULT TRUE;
```

**Then update the Reg_Fee virtual column expression if using Option 2:**
```
IF(LOOKUP([student_id], "students", "id", "is_new_student") = TRUE, 100.00, 0.00)
```

---

## Part 5: Integration with Submit Enrollment Workflow

### Step 6: Enhanced Submit Enrollment Action

**Navigate to:** Behavior > Actions > Find your existing "Submit Enrollment" action

#### Add These Fields to Your Submit Enrollment Form:

**New Student Checkbox:**
- **Field:** `is_new_student`
- **Type:** `Yes/No`
- **Label:** "New Student (Add $100 reg fee)"
- **Default:** `FALSE`

**Discount Selection:**
- **Field:** `discount_id`
- **Type:** `Ref` to `discounts` table
- **Label:** "Apply Discount"
- **Default:** Reference to "No Discount" record

#### Additional Step: Update Fee Message Sent Status
**Action Type:** `Data: set the values of some columns in this row`
**Fields to Update:**
| Column | Expression |
|--------|------------|
| `fee_message_sent` | `FALSE` |

**Purpose:** Marks that fee message is ready but not yet sent

### Step 7: Create Copy Fee Message Action

**Navigate to:** Behavior > Actions > New Action

#### Action Configuration:
| Setting | Value |
|---------|-------|
| **Action Name** | `Copy Fee Message` |
| **For a Record Of** | `enrollments` |
| **Do This** | `External: go to a website` |
| **Target** | `CONCATENATE("https://copy-to-clipboard.onrender.com/copy/", ENCODEURL([Fee_Message]))` |
| **✅ Launch External** | Checked |

#### Availability Settings:
**Show If:**
```
AND(
  NOT(ISBLANK([Fee_Message])),
  [payment_status] = "Pending Payment"
)
```

**Behavior:**
- **✅ Prominent:** Yes
- **Icon:** 📋 or 💬
- **Position:** Row-level action on enrollment records

---

## Part 5: Trial Class Integration Notes

### Trial Class Pricing Structure:
- **Trial Class Fee:** HK$400 (same as regular lesson)
- **Trial-to-Enrollment Discount:** HK$150 (if student enrolls after trial)
- **Implementation:** Use "Trial to Enrollment Discount $150" from discounts table

### For Future Trial Class System:
When you implement the trial class booking system:
1. Trial classes will also use $400 pricing
2. If student converts to enrollment, apply the $150 discount
3. The fee message system will automatically handle this calculation

---

## Part 6: Complete Workflow Integration

### Step 7: Add Discount Selection to Submit Enrollment Form

When admins use "Submit Enrollment" from the MSA/B Assignments sheet:

#### Modify the Submit Enrollment Action Form:

**Add Discount Selection Field:**
- **Field:** `discount_id`
- **Type:** `Enum` 
- **Base Type:** `Ref`
- **Referenced Table:** `discounts`
- **Display:** Show `discount_name` (like "Student Discount $300")
- **Default:** Reference to "No Discount" record

**Form Enhancement:**
- Show discount options as dropdown during enrollment submission
- Admin selects appropriate discount based on student's coupon balance
- System automatically calculates final fee

---

## Part 6: Complete Workflow Integration

### Enhanced Bulk Enrollment Process:

#### 1. Admin Reviews MSA/B Assignment
- Student assigned to tutor, day/time, location

#### 2. Admin Clicks "Submit Enrollment"
- Form opens with pre-filled data from spreadsheet
- **NEW:** Admin selects discount from dropdown (No Discount/$200/$300/$500)
- Admin submits enrollment

#### 3. System Automatically:
- Creates enrollment record with discount
- Generates 6 sessions via existing bot
- Calculates final fee automatically
- Generates personalized fee message

#### 4. Admin Sends Fee Message:
- Views enrollment record
- Clicks "Copy Fee Message" action
- Message appears in confirmation dialog
- Admin copies and pastes into WhatsApp/email to parent

#### 5. Parent Payment Process:
- Receives fee message with all details
- Makes payment and sends confirmation
- Admin uses existing "Confirm Payment" action

---

## Part 7: Testing Checklist

### Discount System Test:
- [ ] Add standard discounts to discounts table
- [ ] Verify discount dropdown appears in Submit Enrollment form
- [ ] Test each discount amount ($0, $200, $300, $500)
- [ ] Confirm Final_Fee calculates correctly

### Fee Message Test:
- [ ] Create test enrollment with discount
- [ ] Verify Fee_Message virtual column generates complete message
- [ ] Test "Copy Fee Message" action
- [ ] Confirm message contains all required details

### Integration Test:
- [ ] Complete workflow: Assignment → Submit → Generate Sessions → Copy Message
- [ ] Verify message accuracy for different discount amounts
- [ ] Test with various lesson counts and schedules

---

## Part 8: Benefits of This System

### ✅ **Eliminates Spreadsheet Complexity:**
- No more separate fee message concatenation sheets
- All calculations happen automatically in real-time
- Single source of truth for enrollment and fee data

### ✅ **Streamlines Admin Workflow:**
- One-click discount selection during enrollment
- Automatic fee calculation prevents errors
- Ready-to-send messages with all details

### ✅ **Maintains Flexibility:**
- Easy to add new discount amounts
- Message template can be updated via virtual column
- Integrates seamlessly with existing Submit Enrollment process

### ✅ **Professional Parent Communication:**
- Consistent, branded fee messages
- All relevant details included automatically
- Clear payment instructions and deadlines

This system transforms your bulk enrollment process from a manual, error-prone workflow into a streamlined, automated system that saves time and reduces mistakes while maintaining the personal touch in parent communications.