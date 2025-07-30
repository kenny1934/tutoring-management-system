# MSA/B Assignments Fee Message System

## Overview

Since fee messages must be sent BEFORE enrollment submission (to allow parent feedback on time slots), this system adds fee message generation directly to the MSA/B Assignments sheets with holiday-aware lesson date calculation.

## Current Workflow Understanding

**MSA/B Assignments → Generate Fee Message → Send to Parent → Parent Confirms → Submit Enrollment (3 subactions) → Auto-generate sessions**

---

## Part 1: Enhanced Assignments Sheet Structure

### Step 1: Add Fee Message Columns to Assignments Sheets

Based on your column layout, add these columns to your `MSA Assignments` and `MSB Assignments` sheets:

**Your existing columns:**
- Column T: Student ID
- Column U: Student Name  
- Column V: Discount Amount (dropdown)
- Column W: Is New Student? (checkbox)
- Column AC: First Lesson Date

**Your existing columns:**
- Column O: Assigned Day (Sun, Mon, Tue, etc.)
- Column P: Assigned Time (10:00 - 11:30, etc.)

**New columns to add:**
- Column X: `Lesson_Dates` (Text) - Calculated lesson dates (holiday-aware)
- Column Y: `Fee_Message` (Long Text) - Complete fee message 
- Column Z: `Fee_Message_Sent` (Checkbox) - Track message status

### Step 2: Set Up Discount Amount Dropdown (Column V)

In Column V, create a dropdown with these values:
- 0 (No discount)
- 150 (Trial to enrollment)
- 200 (Student discount)
- 300 (Student discount) 
- 500 (Staff referral)

---

## Part 2: Holiday-Aware Date Calculation

### Step 3: Create Holiday-Aware Lesson Dates Formula

#### Column X (`Lesson_Dates`) Formula:
```
=IF(ISBLANK(AC2), "", 
  "上課日期:" & CHAR(10) &
  "                  " & TEXT(AC2, "yyyy/mm/dd") & CHAR(10) &
  "                  " & TEXT(AC2+7, "yyyy/mm/dd") & CHAR(10) &
  "                  " & TEXT(AC2+14, "yyyy/mm/dd") & CHAR(10) &
  "                  " & TEXT(AC2+21, "yyyy/mm/dd") & CHAR(10) &
  "                  " & TEXT(AC2+28, "yyyy/mm/dd") & CHAR(10) &
  "                  " & TEXT(AC2+35, "yyyy/mm/dd") & CHAR(10) &
  "                  (共6堂)"
)
```

**Note:** This creates a simple weekly progression. For holiday-aware calculation, you can enhance with WORKDAY function if needed:

#### Holiday-Aware Version (Use This One):
```
=IF(ISBLANK(AC2), "", 
  "上課日期:" & CHAR(10) &
  "                  " & TEXT(AC2, "yyyy/mm/dd") & CHAR(10) &
  "                  " & TEXT(IF(COUNTIF(Holidays!A:A, AC2+7)>0, AC2+14, AC2+7), "yyyy/mm/dd") & CHAR(10) &
  "                  " & TEXT(IF(COUNTIF(Holidays!A:A, AC2+14)>0, AC2+21, IF(COUNTIF(Holidays!A:A, AC2+7)>0, AC2+21, AC2+14)), "yyyy/mm/dd") & CHAR(10) &
  "                  " & TEXT(IF(COUNTIF(Holidays!A:A, AC2+21)>0, AC2+28, IF(COUNTIF(Holidays!A:A, AC2+14)>0, AC2+28, IF(COUNTIF(Holidays!A:A, AC2+7)>0, AC2+28, AC2+21))), "yyyy/mm/dd") & CHAR(10) &
  "                  " & TEXT(IF(COUNTIF(Holidays!A:A, AC2+28)>0, AC2+35, IF(COUNTIF(Holidays!A:A, AC2+21)>0, AC2+35, IF(COUNTIF(Holidays!A:A, AC2+14)>0, AC2+35, IF(COUNTIF(Holidays!A:A, AC2+7)>0, AC2+35, AC2+28)))), "yyyy/mm/dd") & CHAR(10) &
  "                  " & TEXT(IF(COUNTIF(Holidays!A:A, AC2+35)>0, AC2+42, IF(COUNTIF(Holidays!A:A, AC2+28)>0, AC2+42, IF(COUNTIF(Holidays!A:A, AC2+21)>0, AC2+42, IF(COUNTIF(Holidays!A:A, AC2+14)>0, AC2+42, IF(COUNTIF(Holidays!A:A, AC2+7)>0, AC2+42, AC2+35))))), "yyyy/mm/dd") & CHAR(10) &
  "                  (共6堂)"
)
```

**Simpler Holiday-Aware Version (Recommended):**
For a cleaner approach, use this formula that checks each weekly date and skips to the next week if it's a holiday:

```
=IF(ISBLANK(AC2), "", 
  LET(
    date1, AC2,
    date2, IF(COUNTIF(Holidays!A:A, AC2+7)>0, AC2+14, AC2+7),
    date3, IF(COUNTIF(Holidays!A:A, date2+7)>0, date2+14, date2+7),
    date4, IF(COUNTIF(Holidays!A:A, date3+7)>0, date3+14, date3+7),
    date5, IF(COUNTIF(Holidays!A:A, date4+7)>0, date4+14, date4+7),
    date6, IF(COUNTIF(Holidays!A:A, date5+7)>0, date5+14, date5+7),
    "上課日期:" & CHAR(10) &
    "                  " & TEXT(date1, "yyyy/mm/dd") & CHAR(10) &
    "                  " & TEXT(date2, "yyyy/mm/dd") & CHAR(10) &
    "                  " & TEXT(date3, "yyyy/mm/dd") & CHAR(10) &
    "                  " & TEXT(date4, "yyyy/mm/dd") & CHAR(10) &
    "                  " & TEXT(date5, "yyyy/mm/dd") & CHAR(10) &
    "                  " & TEXT(date6, "yyyy/mm/dd") & CHAR(10) &
    "                  (共6堂)"
  )
)
```

**Note:** If the LET function isn't available in your Google Sheets, use the first version. Both formulas check if each weekly lesson date falls on a holiday and skip to the next week if needed.

---

## Part 3: Fee Message Generation in Assignments

### Step 4: Create Complete Fee Message Formula

#### Column Y (`Fee_Message`) Formula:
```
==IF(OR(ISBLANK(U2), ISBLANK(T2)), "", 
  "家長您好，以下是下一期學費的明細：" & CHAR(10) & CHAR(10) &
  "學生編號：" & T2 & CHAR(10) &
  "學生姓名：" & U2 & CHAR(10) &
  "上課時間：逢星期" & 
  SWITCH(O2, "Sun", "日", "Mon", "一", "Tue", "二", "Wed", "三", "Thu", "四", "Fri", "五", "Sat", "六", O2) & 
  " " & P2 & " (90分鐘)" & CHAR(10) &
  X2 & CHAR(10) & CHAR(10) &
  "費用： $" & (2400 - V2) & 
  IF(V2 > 0, 
    " (已折扣$" & V2 & "學費禮劵，原價為$2400" & IF(W2, "+$100報名費", "") & ")",
    IF(W2, " (已豁免$100報名費)", "")
  ) & CHAR(10) & CHAR(10) &
  "請於第一堂之前繳交學費。逾期繳費者，本中心將收取$200手續費，並保留權利拒絕學生上課。" & CHAR(10) &
  "家長可親臨中學教室(華士古分校)以現金方式繳交學費，或選擇把學費存入以下戶口：" & CHAR(10) & CHAR(10) &
  "銀行：中國銀行" & CHAR(10) &
  "名稱：弘教數學教育中心" & CHAR(10) &
  "號碼：185000380468369" & CHAR(10) &
  "請於備註註明學生姓名及其編號，並發收條至中心微信號確認，謝謝[Joyful]" & CHAR(10) & CHAR(10) &
  "MathConcept 中學教室 (華士古分校)"
)
```

**Formula Breakdown:**
- T2: Student ID
- U2: Student Name  
- V2: Discount Amount
- W2: Is New Student (checkbox - shows reg fee waiver text only when checked)
- O2: Assigned Day (converts Sun→日, Mon→一, etc.)
- P2: Assigned Time 
- AC2: First Lesson Date
- X2: Lesson Dates (from previous formula)

**The SWITCH function converts English day abbreviations to Chinese:**
- Sun → 日, Mon → 一, Tue → 二, Wed → 三, Thu → 四, Fri → 五, Sat → 六

---

## Part 4: AppSheet Integration for Assignments

### Step 5: Connect Assignments Sheet to AppSheet

Ensure your `MSA Assignments` and `MSB Assignments` sheets are connected as data sources in AppSheet.

### Step 6: Create Copy Fee Message Action for Assignments

**Navigate to:** Behavior > Actions > New Action

#### Action Configuration:
| Setting | Value |
|---------|-------|
| **Action Name** | `Copy Assignment Fee Message` |
| **For a Record Of** | `MSA_Assignments` (create similar for MSB) |
| **Do This** | `External: go to a website` |
| **Target** | `CONCATENATE("https://copy-to-clipboard.onrender.com/copy/", ENCODEURL([Fee_Message]))` |
| **✅ Launch External** | Checked |

#### Availability Settings:
**Show If:**
```
AND(
  NOT(ISBLANK([Fee_Message])),
  NOT(ISBLANK([Student_Name])),
  [Status] <> "Processed"
)
```

### Step 7: Create Mark Fee Message Sent Action

**Action Name:** `Mark Fee Message Sent`  
**For a Record Of:** `MSA_Assignments`  
**Do This:** `Data: set the values of some columns in this row`

**Fields to Update:**
| Column | Expression |
|--------|------------|
| `Fee_Message_Sent` | `TRUE` |

---

## Part 5: Enhanced Workflow Process

### Complete Workflow for Bulk Enrollment:

#### 1. Assignment Preparation
- Admin completes assignment details in MSA/B Assignments sheet
- Sets `First_Lesson_Date`, `Assigned_Day`, `Assigned_Time`, etc.
- Selects `Discount_Type` and checks `Is_New_Student` if applicable
- Formula automatically generates `Lesson_Dates` and `Fee_Message`

#### 2. Fee Message Communication
- Admin reviews generated fee message with specific lesson dates
- Uses "Copy Assignment Fee Message" action in AppSheet
- Sends message to parent via WhatsApp/email
- Marks "Mark Fee Message Sent" when sent

#### 3. Parent Confirmation
- Parent reviews detailed schedule and fees
- Parent confirms acceptance or requests time slot changes
- If changes needed, admin updates assignment and regenerates message

#### 4. Enrollment Submission
- After parent confirmation, admin uses existing "Submit Enrollment" action
- Three subactions execute: update grade, mark processed, create enrollment
- Session generation bot triggers automatically

#### 5. Payment Processing
- Parent makes payment based on fee message amount
- Admin uses existing "Confirm Payment" workflow when payment received

---

## Part 6: Benefits of This Approach

### ✅ **Holiday-Aware Scheduling:**
- Parents see exact lesson dates before confirming
- Holidays automatically skipped in date calculation
- No surprises about session timing

### ✅ **Pre-Enrollment Flexibility:**
- Fee messages sent before final enrollment
- Parents can request time slot changes
- Reduces post-enrollment modifications

### ✅ **Professional Communication:**
- Detailed lesson schedule included
- Clear fee breakdown with all charges
- Consistent messaging across all assignments

### ✅ **Streamlined Admin Workflow:**
- Fee message generation integrated into existing assignment process
- One-click copy to clipboard via external service
- Status tracking for message sending

### ✅ **Accurate Financial Planning:**
- Final fee amount calculated upfront
- Discount and reg fees clearly shown
- Parents have complete payment information

---

## Part 7: Testing Checklist

### Assignment Sheet Setup:
- [ ] Add new columns to MSA/B Assignments sheets
- [ ] Set up discount dropdown with correct values
- [ ] Test holiday-aware date calculation formula
- [ ] Verify fee message formula generates complete text

### AppSheet Integration:
- [ ] Connect assignment sheets as data sources
- [ ] Create Copy Fee Message actions for both MSA and MSB
- [ ] Test clipboard copy functionality
- [ ] Verify Mark Fee Message Sent action

### Complete Workflow:
- [ ] Test assignment → fee message → parent communication
- [ ] Verify parent can see exact lesson dates
- [ ] Test Submit Enrollment after parent confirmation
- [ ] Confirm session generation works with pre-calculated dates

This system provides parents with complete information upfront while maintaining your existing efficient Submit Enrollment automation!