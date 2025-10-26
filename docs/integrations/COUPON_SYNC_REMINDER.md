# 📋 COUPON SYNC REMINDER

## When to Sync
- **Weekly/Monthly** - When company system updates
- **Before renewal season** - Ensure all counts are current
- **After bulk coupon changes** - Sync immediately

## Quick Commands

### Fastest Method (2 min):
```bash
# Terminal 1: Allowlist IP
gcloud sql connect [INSTANCE_NAME] --user=root --project=[PROJECT_ID]

# Terminal 2: Run sync (within 5 minutes)
./scripts/sync_coupons.sh "TerminationList_MSA_*.xls"
```

### What You Need:
1. ✅ Latest .xls file from company system (download first)
2. ✅ Two terminals open
3. ✅ 5 minutes of time

## File Location
Drop the .xls file in project root (same folder as this file)

## After Sync
✅ Coupons auto-apply during enrollment renewal in AppSheet
✅ No manual discount selection needed
✅ Mark used coupons in company system after renewal

---

**Last Sync:** _Update this date manually after each sync_
**Next Sync Due:** _Set your next reminder date_
