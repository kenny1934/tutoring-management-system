# Terminology Updates - July 2025

This document summarizes the terminology improvements made to enhance clarity for the admin team.

## 📋 **Updated Naming Convention**

### **View Names:**
| Old Name | New Name | Reason |
|----------|----------|--------|
| "Pending Assignments" | **"Ready to Enroll"** | Clearer action needed, less ambiguous |

### **Assignment Status Values:**
| Old Status | New Status | Meaning |
|------------|-------------|---------|
| "Pending" | **"Unpaid"** | Seat confirmed, waiting for payment |
| "Confirmed" | **"Paid"** | Payment received, ready to process |
| "Processed" | **"Enrolled"** | Sessions generated, student enrolled |

### **Action Names:**
| Old Action | New Action | Reason |
|------------|-------------|--------|
| "Submit Enrollment" | **"Generate Sessions"** | Describes actual outcome (session creation) |

## 🔄 **Workflow Clarity**

### **Before (Confusing):**
```
Pending Assignments View
├── Pending (what's pending?)
├── Confirmed (confirmed for what?)
└── Processed (processed how?)

Submit Enrollment Action (submit where?)
```

### **After (Clear):**
```
Ready to Enroll View  
├── Unpaid (need payment)
├── Paid (ready to process)
└── Enrolled (sessions created)

Generate Sessions Action (creates lesson sessions)
```

## 📊 **Impact on Admin Workflow**

### **Admin Team Benefits:**
- ✅ **Instant clarity:** No need to remember what statuses mean
- ✅ **Action-focused:** Clear next steps for each status
- ✅ **Reduced training:** Intuitive terminology needs no explanation
- ✅ **Faster processing:** Quick scanning of status without confusion

### **Status Progression:**
```
Assignment Created → Unpaid → Paid → Enrolled
                      ↓        ↓       ↓
                  (collect   (click   (done)
                   payment)  Generate
                            Sessions)
```

## 📝 **Technical Notes**

### **Database Fields (Unchanged):**
- `payment_status` in enrollments table remains "Pending Payment"/"Paid"
- This is different from assignment status in the Google Sheets
- Database terminology maintained for API consistency

### **Updated Documentation:**
- ✅ `README.md` - Updated action descriptions
- ✅ `TODO.md` - Updated task references  
- ✅ `docs/DESIGN_NOTES.md` - Updated workflow descriptions
- ✅ `docs/features/fee_message_system.md` - Updated integration steps
- ✅ `docs/features/assignments_fee_message_system.md` - Updated workflow references

## 🎯 **Implementation Checklist**

**AppSheet Updates Needed:**
- [ ] Rename view: "Pending Assignments" → "Ready to Enroll"
- [ ] Update status dropdown: "Pending/Confirmed/Processed" → "Unpaid/Paid/Enrolled" 
- [ ] Rename action: "Submit Enrollment" → "Generate Sessions"
- [ ] Update any status-based view filters
- [ ] Update bot triggers that reference old status names

**Benefits Achieved:**
- ✅ Terminology matches actual business process
- ✅ Reduced cognitive load on admin team
- ✅ Self-documenting workflow states
- ✅ Professional, clear naming convention