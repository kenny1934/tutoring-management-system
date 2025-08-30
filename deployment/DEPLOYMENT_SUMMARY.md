# 📋 PLANNED RESCHEDULES FEATURE - COMPLETE DEPLOYMENT PACKAGE

## 🎯 **Quick Start - Do This in Order:**

### **Step 1: Database (5 minutes)**
```bash
1. Open your Cloud SQL console
2. Connect to csm_db database  
3. Run the SQL script: DEPLOY_PLANNED_RESCHEDULES.sql
4. Verify table created successfully
```

### **Step 2: Update Code.gs (10 minutes)**
```bash  
1. Open your Google Apps Script project
2. OPTION A: Replace entire Code.gs with Code_with_planned_reschedules.gs (recommended)
   OR
   OPTION B: Open CORRECTED_Code_gs_sections.js and copy/replace the 3 sections
3. Save and deploy new version
4. ✅ IMPORTANT: Fixed RANDBETWEEN IDs to prevent bot sync issues
```

### **Step 3: Configure AppSheet (15 minutes)**
```bash
1. Follow APPSHEET_CONFIGURATION.md step by step
2. Add planned_reschedules table to AppSheet
3. Create the 2 views and 2 actions
4. Test basic functionality
```

### **Step 4: Test Everything (15 minutes)**  
```bash
1. Use TESTING_CHECKLIST.md to validate
2. Test leave-only scenario
3. Test leave-with-makeup scenario  
4. Verify session generation works correctly
```

---

## 📁 **Files in This Package:**

| File | Purpose | When to Use |
|------|---------|-------------|  
| `DEPLOY_PLANNED_RESCHEDULES.sql` | Database setup | Run first in Cloud SQL |
| `CORRECTED_Code_gs_sections.js` | Apps Script fixes | Replace sections in Code.gs |
| `APPSHEET_CONFIGURATION.md` | UI setup guide | Configure AppSheet interface |
| `TESTING_CHECKLIST.md` | Validation tests | Verify everything works |

---

## 🚀 **What This Feature Does:**

### **For Admin Users:**
- ✅ **Record future leave requests** before sessions are generated
- ✅ **Optionally specify make-up dates** for automatic scheduling  
- ✅ **Track status** of all reschedule requests
- ✅ **Cancel requests** that are no longer needed

### **For the System:**
- ✅ **Automatically applies reschedule status** when generating sessions
- ✅ **Creates linked make-up sessions** when preferred dates specified
- ✅ **Tracks which reschedules have been applied** vs pending
- ✅ **Works seamlessly** with existing enrollment workflow

### **Two Workflows Supported:**
1. **Leave Only:** "Johnny can't come Sept 15th" → Session created as "Rescheduled - Pending Make-up"
2. **Leave + Makeup:** "Johnny can't come Sept 15th but can do Sept 22nd" → Both sessions created and linked

---

## ⚠️ **Important Notes:**

### **Database Impact:**
- **Adds 1 new table** (`planned_reschedules`) 
- **No changes** to existing tables
- **No data migration** required

### **Workflow Impact:**  
- **No changes** to existing enrollment process
- **Adds optional step** to record future leaves
- **Enhances session generation** with automatic reschedule handling

### **Performance:**
- **Minimal overhead** - only queries reschedules when generating sessions
- **Efficient indexing** on enrollment_id and status
- **No impact** on existing functionality

---

## 🔧 **Troubleshooting:**

### **Common Issues:**
- **"Table doesn't exist"** → Run SQL script in correct database
- **"Sessions not rescheduled"** → Check Apps Script execution logs  
- **"AppSheet errors"** → Verify column types match specification

### **Rollback Plan:**
1. **Disable AppSheet views** (hide from users)
2. **Keep database table** (preserves data)  
3. **Revert Code.gs** to previous version if needed

---

## ✅ **Ready to Deploy?**

**Prerequisites:**
- [ ] You have database admin access
- [ ] You can edit the Apps Script project
- [ ] You can modify AppSheet configuration
- [ ] You have 45 minutes for complete deployment + testing

**Estimated Total Time:** 45 minutes
**Risk Level:** Low (no changes to existing data/workflows)
**Rollback Time:** 5 minutes

---

🚀 **Let's deploy this feature!** Start with Step 1 (Database) and work through each step in order.