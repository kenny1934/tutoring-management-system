# Deploy Skill

Manual deployment commands for tutoring management system.

## Usage

Invoke with `/deploy` followed by optional target:
- `/deploy` - Deploy both backend and frontend
- `/deploy backend` - Deploy backend only
- `/deploy frontend` - Deploy frontend only

## Deploy Backend

```bash
export CLOUDSDK_PYTHON_SITEPACKAGES=1
cd webapp/backend
gcloud builds submit --tag $ARTIFACT_REGISTRY/tutoring-backend:latest --region=$REGION --project=$GCP_PROJECT
gcloud run deploy tutoring-backend \
  --image $ARTIFACT_REGISTRY/tutoring-backend:latest \
  --region $REGION --project $GCP_PROJECT \
  --max-instances=1 --timeout=900
```

## Deploy Frontend

```bash
export CLOUDSDK_PYTHON_SITEPACKAGES=1
VERSION=$(cat .release-please-manifest.json | python3 -c "import sys,json; print(json.load(sys.stdin).get('.','0.0.0'))")
cd webapp/frontend
gcloud builds submit --tag $ARTIFACT_REGISTRY/tutoring-frontend:latest --region=$REGION --project=$GCP_PROJECT
gcloud run deploy tutoring-frontend \
  --image $ARTIFACT_REGISTRY/tutoring-frontend:latest \
  --region $REGION --project $GCP_PROJECT \
  --max-instances=1 --timeout=60
```

## Check Status

```bash
export CLOUDSDK_PYTHON_SITEPACKAGES=1
gcloud run services describe tutoring-backend --region $REGION --format="value(status.traffic[0].revisionName)"
gcloud run services describe tutoring-frontend --region $REGION --format="value(status.traffic[0].revisionName)"
```

Note: $GCP_PROJECT, $REGION, and $ARTIFACT_REGISTRY values are in the project memory file.
