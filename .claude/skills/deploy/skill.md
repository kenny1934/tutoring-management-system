# Deploy Skill

Manual deployment commands for tutoring management system.

## Usage

Invoke with `/deploy` followed by optional target:
- `/deploy` - Deploy both backend and frontend
- `/deploy backend` - Deploy backend only
- `/deploy frontend` - Deploy frontend only

## Deploy Backend

```bash
cd /home/kenny/projects/tutoring-management-system/webapp/backend
export CLOUDSDK_PYTHON=python3
gcloud builds submit --config cloudbuild.yaml --region asia-east2
gcloud run deploy tutoring-backend \
  --image asia-east2-docker.pkg.dev/csm-database-project/tutoring-backend/tutoring-backend:latest \
  --region asia-east2
```

## Deploy Frontend

```bash
cd /home/kenny/projects/tutoring-management-system/webapp/frontend
export CLOUDSDK_PYTHON=python3
gcloud builds submit --config cloudbuild.yaml --region asia-east2
gcloud run deploy tutoring-frontend \
  --image asia-east2-docker.pkg.dev/csm-database-project/tutoring-frontend/tutoring-frontend:latest \
  --region asia-east2
```

## Check Status

```bash
export CLOUDSDK_PYTHON=python3
gcloud run services describe tutoring-backend --region asia-east2 --format="value(status.traffic[0].revisionName)"
gcloud run services describe tutoring-frontend --region asia-east2 --format="value(status.traffic[0].revisionName)"
```

## Production URLs

- Backend: https://tutoring-backend-284725664511.asia-east2.run.app
- Frontend: https://tutoring-frontend-284725664511.asia-east2.run.app
- Custom Domain: https://csm.mathconceptsecondary.academy
