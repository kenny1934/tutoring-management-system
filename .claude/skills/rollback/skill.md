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
export CLOUDSDK_PYTHON_SITEPACKAGES=1
# Backend revisions
gcloud run revisions list --service tutoring-backend --region $REGION --limit 5

# Frontend revisions
gcloud run revisions list --service tutoring-frontend --region $REGION --limit 5
```

### Rollback to Specific Revision

```bash
export CLOUDSDK_PYTHON_SITEPACKAGES=1
# Rollback backend (replace REVISION_NAME with actual revision)
gcloud run services update-traffic tutoring-backend \
  --to-revisions REVISION_NAME=100 \
  --region $REGION

# Rollback frontend (replace REVISION_NAME with actual revision)
gcloud run services update-traffic tutoring-frontend \
  --to-revisions REVISION_NAME=100 \
  --region $REGION
```

## Git Revert Rollback (Triggers New Deploy)

```bash
# Revert last commit and push (triggers CI/CD pipeline)
git revert HEAD --no-edit
git push origin main
```

## Check Current Status

```bash
export CLOUDSDK_PYTHON_SITEPACKAGES=1
# View current running revision
gcloud run services describe tutoring-backend --region $REGION --format="value(status.traffic[0].revisionName)"
gcloud run services describe tutoring-frontend --region $REGION --format="value(status.traffic[0].revisionName)"

# View recent logs
gcloud run logs read tutoring-backend --region $REGION --limit 20
```

Note: $REGION value is in the project memory file.
