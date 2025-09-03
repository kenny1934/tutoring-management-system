# Curriculum Tracking System - Infrastructure Setup Guide

## Overview
This guide walks you through setting up the infrastructure for the Curriculum Tracking System. The setup is designed to be cost-effective (likely $0-10/month) and use your existing domain `mathconceptsecondary.academy`.

## Prerequisites
- Access to your Google Cloud Console (same account as CSM Pro)
- Domain control for `mathconceptsecondary.academy`
- Basic familiarity with Google Cloud Console

---

## Step 1: Domain and DNS Configuration

### 1.1 Create Subdomain
You'll create: `curriculum.mathconceptsecondary.academy`

**If using Cloudflare (recommended):**
1. Log into Cloudflare DNS management
2. Add a CNAME record:
   - **Name**: `curriculum`
   - **Target**: `ghs.googlehosted.com` (temporary, will update after Cloud Run deployment)
   - **TTL**: Auto
   - **Proxy**: Orange cloud (proxied)

**If using other DNS provider:**
1. Access your DNS management panel
2. Create CNAME record pointing `curriculum` to `ghs.googlehosted.com`
3. Save changes (may take 5-60 minutes to propagate)

### 1.2 Verify Domain Control
1. Go to [Google Domains](https://domains.google.com) or your provider
2. Ensure you can modify DNS records
3. Note: We'll update the CNAME after deploying Cloud Run

---

## Step 2: Google Cloud Setup

### 2.1 Enable Required APIs
1. Open [Google Cloud Console](https://console.cloud.google.com)
2. Select your existing project (same as CSM Pro)
3. Go to **APIs & Services** → **Library**
4. Enable these APIs:
   - **Cloud Run API**
   - **Cloud Build API** 
   - **Container Registry API**
   - **Cloud SQL Admin API** (if not already enabled)
   - **Secret Manager API**

### 2.2 Set Up Service Account
1. Go to **IAM & Admin** → **Service Accounts**
2. Click **Create Service Account**
3. Configure:
   - **Name**: `curriculum-service`
   - **Description**: `Service account for curriculum tracking system`
4. Grant roles:
   - **Cloud Run Developer**
   - **Cloud SQL Client**
   - **Secret Manager Secret Accessor**
5. Click **Create Key** → **JSON** and save the file securely

### 2.3 Configure Cloud SQL Access
1. Go to **SQL** → Select your existing Cloud SQL instance
2. Go to **Users** tab
3. Create new user:
   - **Username**: `curriculum_user`
   - **Password**: Generate strong password
   - **Host**: `%` (allow from anywhere - Cloud Run will use private IP)
4. Go to **Databases** tab  
5. Your existing database should work, or create: `csm_curriculum`

---

## Step 3: Environment Configuration

### 3.1 Set Up Secret Manager
1. Go to **Security** → **Secret Manager**
2. Create these secrets:

#### Database Connection Secret
- **Name**: `curriculum-db-config`
- **Value** (JSON format):
```json
{
  "host": "YOUR_CLOUD_SQL_PRIVATE_IP",
  "port": 3306,
  "user": "curriculum_user", 
  "password": "YOUR_GENERATED_PASSWORD",
  "database": "csm_db",
  "connectionLimit": 5
}
```

#### Application Config Secret  
- **Name**: `curriculum-app-config`
- **Value** (JSON format):
```json
{
  "nodeEnv": "production",
  "port": 8080,
  "corsOrigins": [
    "https://www.appsheet.com",
    "https://mathconceptsecondary.academy"
  ],
  "sessionSecret": "GENERATE_RANDOM_STRING_HERE",
  "rateLimitMax": 100
}
```

### 3.2 Note Important Values
Save these for the deployment:
- **Project ID**: (your current Google Cloud project)
- **Cloud SQL Instance Connection Name**: `PROJECT_ID:REGION:INSTANCE_NAME`
- **Service Account Email**: `curriculum-service@PROJECT_ID.iam.gserviceaccount.com`

---

## Step 4: Repository Setup (For Code Deployment)

### 4.1 Choose Deployment Method

**Option A: GitHub Integration (Recommended)**
1. Create GitHub repository: `curriculum-tracking-service`
2. Connect to Google Cloud Build:
   - Go to **Cloud Build** → **Triggers**
   - Click **Connect Repository**
   - Authorize GitHub and select your repository

**Option B: Direct Upload**
- You'll zip and upload code directly to Cloud Run
- Simpler but less automated

### 4.2 Prepare Build Configuration
Create `cloudbuild.yaml` (I'll provide this with the code):
```yaml
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', 'gcr.io/$PROJECT_ID/curriculum-service', '.']
  - name: 'gcr.io/cloud-builders/docker'  
    args: ['push', 'gcr.io/$PROJECT_ID/curriculum-service']
  - name: 'gcr.io/cloud-builders/gcloud'
    args:
      - 'run'
      - 'deploy'
      - 'curriculum-service'
      - '--image=gcr.io/$PROJECT_ID/curriculum-service'
      - '--region=asia-southeast1'
      - '--platform=managed'
      - '--allow-unauthenticated'
```

---

## Step 5: Cloud Run Configuration

### 5.1 Deployment Settings
When deploying to Cloud Run, use these settings:

**Basic Configuration:**
- **Service name**: `curriculum-service`
- **Region**: `asia-southeast1` (Singapore - closest to you)
- **Platform**: Managed
- **Authentication**: Allow unauthenticated invocations

**Resource Allocation:**
- **Memory**: 512 MB (sufficient for 9 users)
- **CPU**: 1 (default)
- **Request timeout**: 300 seconds
- **Maximum instances**: 10
- **Minimum instances**: 0 (cost optimization)

**Environment Variables:**
- `NODE_ENV`: `production`
- `GOOGLE_CLOUD_PROJECT`: `YOUR_PROJECT_ID`
- `CLOUD_SQL_CONNECTION_NAME`: `YOUR_INSTANCE_CONNECTION_NAME`

**Service Account:**
- Use the `curriculum-service@PROJECT_ID.iam.gserviceaccount.com` created earlier

### 5.2 Cloud SQL Connection
1. In Cloud Run service settings
2. Go to **Connections** tab
3. Add Cloud SQL connection:
   - Select your existing Cloud SQL instance
   - This enables private networking

---

## Step 6: SSL and Domain Mapping

### 6.1 Map Custom Domain
1. In Cloud Run service details
2. Go to **Domain Mappings** tab
3. Click **Add Mapping**
4. Enter: `curriculum.mathconceptsecondary.academy`
5. Google will provide DNS records to update

### 6.2 Update DNS (Final Step)
1. Go back to your DNS provider (Cloudflare, etc.)
2. Update the CNAME record you created earlier:
   - **Name**: `curriculum` 
   - **Target**: The value provided by Google (usually `ghs.googlehosted.com`)
3. Add any additional records Google requires

### 6.3 SSL Certificate
- Google automatically provisions SSL certificate
- Takes 5-60 minutes to activate
- You'll see ✅ when ready

---

## Step 7: Verification and Testing

### 7.1 Basic Health Check
Once deployed, test these URLs:

1. **Health check**: `https://curriculum.mathconceptsecondary.academy/health`
   - Should return: `{"status": "ok", "database": "connected"}`

2. **API test**: `https://curriculum.mathconceptsecondary.academy/api/status`
   - Should return basic API information

### 7.2 Database Connection Test
1. Check Cloud Run logs:
   - Go to **Cloud Run** → **curriculum-service** → **Logs**
   - Look for successful database connection messages
   - No error messages about connection failures

### 7.3 Performance Test
1. Use browser developer tools
2. Check response times < 2 seconds
3. Verify mobile responsiveness

---

## Step 8: Security Configuration

### 8.1 IAM and Permissions
Verify service account has minimal required permissions:
- ✅ Cloud SQL Client (database access)
- ✅ Secret Manager Secret Accessor (config access)  
- ❌ No admin or editor roles (security best practice)

### 8.2 Network Security
- ✅ Cloud SQL uses private networking (not public IP)
- ✅ HTTPS only (no HTTP access)
- ✅ CORS configured for AppSheet origins only

### 8.3 Monitoring Setup
1. Go to **Monitoring** → **Alerting**
2. Create alert policies:
   - **High Error Rate**: >5% errors in 5 minutes
   - **High Response Time**: >5 seconds average
   - **Service Down**: 0 requests in 10 minutes

---

## Cost Optimization

### 8.1 Expected Costs (Monthly)
**Google Cloud Run:**
- **Free tier**: 2 million requests, 360,000 GB-seconds
- **Your usage**: ~3,000 requests/month (9 users × 10 sessions/week)
- **Expected cost**: $0 (well within free tier)

**Cloud SQL:**
- **Cost**: $0 (using existing instance)
- **Additional storage**: Minimal (<100MB for curriculum data)

**Networking:**
- **Egress**: Minimal within Google Cloud
- **Expected cost**: $0-1/month

**Total Expected**: $0-2/month

### 8.2 Cost Controls
1. **Auto-scaling**: Set minimum instances to 0
2. **Resource limits**: 512MB memory sufficient
3. **Request timeout**: 300 seconds prevents long-running costs
4. **Monitoring**: Set billing alerts at $10/month

---

## Step 9: Backup and Disaster Recovery

### 9.1 Database Backups
- Use existing Cloud SQL automated backups
- Curriculum data is added to existing backup schedule
- No additional cost or configuration needed

### 9.2 Application Recovery
- **Code**: Stored in GitHub (or Google Cloud Source)
- **Container**: Stored in Google Container Registry
- **Secrets**: Managed by Google Secret Manager
- **Recovery time**: <30 minutes to redeploy

### 9.3 Rollback Plan
If issues arise:
1. **Immediate**: Disable service (AppSheet continues working)
2. **Code rollback**: Deploy previous container version
3. **Database**: Use Cloud SQL point-in-time recovery if needed

---

## Step 10: Go-Live Checklist

### Before Launch
- [ ] Domain `curriculum.mathconceptsecondary.academy` resolves correctly
- [ ] SSL certificate active (green lock in browser)
- [ ] Health check endpoint returns success
- [ ] Database connection verified in logs
- [ ] Cloud Run service running and accessible
- [ ] Monitoring alerts configured
- [ ] Cost alerts set at $10/month

### Performance Verification  
- [ ] Page load times < 2 seconds
- [ ] Mobile responsiveness tested on actual devices
- [ ] API endpoints respond within 500ms
- [ ] Concurrent user testing (simulate 9 users)

### Security Verification
- [ ] No public database access
- [ ] Service account has minimal permissions
- [ ] Secrets stored in Secret Manager (not code)
- [ ] HTTPS only (no HTTP redirect)
- [ ] CORS properly configured

---

## Troubleshooting Common Issues

### Domain Not Resolving
**Problem**: `curriculum.mathconceptsecondary.academy` not accessible  
**Solution**: 
1. Check DNS propagation: `nslookup curriculum.mathconceptsecondary.academy`
2. Verify CNAME points to correct Google target
3. Wait up to 60 minutes for propagation

### SSL Certificate Pending
**Problem**: "Not secure" warning in browser  
**Solution**:
1. Ensure domain mapping is complete in Cloud Run
2. Verify DNS records match Google requirements exactly
3. Wait 5-60 minutes for certificate provisioning

### Database Connection Failed
**Problem**: Service can't connect to Cloud SQL  
**Solution**:
1. Verify Cloud SQL connection enabled in Cloud Run
2. Check service account has Cloud SQL Client role
3. Confirm database credentials in Secret Manager
4. Review Cloud Run logs for specific error messages

### High Response Times
**Problem**: API responses > 2 seconds  
**Solution**:
1. Check if Cloud Run instance is cold-starting
2. Consider setting minimum instances to 1
3. Verify database queries are efficient
4. Monitor Cloud Run resource usage

### Cost Higher Than Expected
**Problem**: Monthly costs > $10  
**Solution**:
1. Check Cloud Run request volume
2. Verify minimum instances set to 0
3. Review egress data charges
4. Monitor resource allocation (512MB memory)

---

## Next Steps After Setup

Once infrastructure is ready:

1. **Code deployment**: I'll provide the complete application code
2. **Database schema**: Run migration scripts to create curriculum tables
3. **AppSheet integration**: Configure virtual columns and action buttons
4. **Data import**: Import historical curriculum data from Google Sheets
5. **User testing**: Test with volunteer tutors before full launch

---

## Support and Maintenance

### Regular Maintenance (Monthly)
- [ ] Review Cloud Run logs for errors
- [ ] Check cost usage (should remain near $0)
- [ ] Verify SSL certificate renewal (automatic)
- [ ] Test backup/recovery procedures

### Monitoring Dashboard
Access these regularly:
- **Cloud Run Service**: Monitor requests, errors, latency
- **Cloud SQL**: Database performance and connections
- **Cost**: Monthly spend tracking
- **Security**: IAM and access logs

### Emergency Contacts
- **Technical issues**: Google Cloud Support (if needed)
- **DNS issues**: Your domain registrar support
- **Application bugs**: Internal development team

---

This infrastructure will provide a reliable, secure, and cost-effective foundation for the Curriculum Tracking System. The setup is designed to handle your current needs (9 tutors) with room to grow, while maintaining costs near zero through efficient use of Google Cloud's free tiers.