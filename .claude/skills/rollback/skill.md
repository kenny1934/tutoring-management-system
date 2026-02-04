# Rollback Skill

Rollback production to a previous version.

## Usage

Invoke with `/rollback` followed by optional target:
- `/rollback` - Show rollback options
- `/rollback backend` - Rollback backend
- `/rollback frontend` - Rollback frontend

## Quick Rollback (Cloud Run - Fastest)

### List Recent Revisions

```bash
export CLOUDSDK_PYTHON=python3
# Backend revisions
gcloud run revisions list --service tutoring-backend --region asia-east2 --limit 5

# Frontend revisions
gcloud run revisions list --service tutoring-frontend --region asia-east2 --limit 5
```

### Rollback to Specific Revision

```bash
export CLOUDSDK_PYTHON=python3
# Rollback backend (replace REVISION_NAME with actual revision)
gcloud run services update-traffic tutoring-backend \
  --to-revisions REVISION_NAME=100 \
  --region asia-east2

# Rollback frontend (replace REVISION_NAME with actual revision)
gcloud run services update-traffic tutoring-frontend \
  --to-revisions REVISION_NAME=100 \
  --region asia-east2
```

## Git Revert Rollback (Triggers New Deploy)

```bash
# Revert last commit and push (triggers CI/CD pipeline)
git revert HEAD --no-edit
git push origin main
```

## Check Current Status

```bash
export CLOUDSDK_PYTHON=python3
# View current running revision
gcloud run services describe tutoring-backend --region asia-east2 --format="value(status.traffic[0].revisionName)"
gcloud run services describe tutoring-frontend --region asia-east2 --format="value(status.traffic[0].revisionName)"

# View recent logs
gcloud run logs read tutoring-backend --region asia-east2 --limit 20
```
