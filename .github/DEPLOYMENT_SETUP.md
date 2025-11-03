# CI/CD Deployment Setup Guide

This guide explains how to set up automated deployments for the IRISX platform using GitHub Actions.

---

## Prerequisites

- GitHub repository access with admin permissions
- SSH access to production server
- Production server details (IP address, SSH key)

---

## GitHub Secrets Configuration

You need to add these secrets to your GitHub repository:

### Navigate to Repository Settings
1. Go to your GitHub repository: `https://github.com/genghisprime/irisx-infrastructure`
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**

### Required Secrets

#### 1. `PROD_SSH_KEY`
**Description:** Private SSH key for accessing production server
**Value:** Contents of `~/.ssh/irisx-prod-key.pem`

```bash
# Copy the SSH key content
cat ~/.ssh/irisx-prod-key.pem | pbcopy  # macOS
# Or just cat and copy manually
cat ~/.ssh/irisx-prod-key.pem
```

**To add:**
- Name: `PROD_SSH_KEY`
- Secret: Paste the entire private key content (including `-----BEGIN RSA PRIVATE KEY-----` and `-----END RSA PRIVATE KEY-----`)

#### 2. `PROD_API_HOST`
**Description:** Production API server IP address
**Value:** `3.83.53.69`

**To add:**
- Name: `PROD_API_HOST`
- Secret: `3.83.53.69`

---

## How the CI/CD Pipeline Works

### Trigger Conditions
The deployment pipeline runs automatically when:
1. Code is pushed to the `main` branch
2. Changes are made to files in the `api/` directory
3. Changes are made to the workflow file itself
4. Manually triggered via GitHub Actions UI

### Deployment Steps

#### 1. **Pre-deployment Checks**
- ✅ Checkout code from repository
- ✅ Setup Node.js 22
- ✅ Install dependencies with `npm ci`
- ✅ Run syntax validation on all JavaScript files

#### 2. **Create Deployment Package**
- ✅ Package `api/src/` directory into tarball
- ✅ Verify package size and contents

#### 3. **Backup Production**
- ✅ SSH into production server
- ✅ Create timestamped backup of current code
- ✅ Backup saved to `/home/ubuntu/irisx-backend-backup-YYYYMMDD-HHMMSS.tar.gz`

#### 4. **Deploy New Code**
- ✅ Stop PM2 API process
- ✅ Move current `src/` to `src.old.YYYYMMDD-HHMMSS`
- ✅ Extract new code from deployment package
- ✅ Verify `index.js` exists
- ✅ Start PM2 API process

#### 5. **Health Check**
- ✅ Wait 10 seconds for startup
- ✅ Call `/health` endpoint
- ✅ Verify response contains `"healthy"`
- ✅ If failed, trigger automatic rollback

#### 6. **Rollback (on failure)**
- ❌ If deployment fails, automatically restore from backup
- ❌ Restart PM2 with old code
- ❌ Verify health of restored system

#### 7. **Cleanup**
- ✅ Remove temporary files
- ✅ Remove SSH keys from GitHub runner
- ✅ Delete old backup directories

---

## Manual Deployment Trigger

You can manually trigger a deployment without pushing code:

1. Go to **Actions** tab in GitHub
2. Click **Deploy API to Production** workflow
3. Click **Run workflow** button
4. Select `main` branch
5. Click **Run workflow**

---

## Monitoring Deployments

### View Deployment Status
1. Go to **Actions** tab in GitHub repository
2. Click on the latest workflow run
3. Watch real-time logs as deployment progresses

### Deployment Logs Show:
- Syntax validation results
- Package creation details
- SSH connection status
- Backup creation confirmation
- Deployment progress
- Health check results
- Success or failure status

### After Deployment
Check the API health endpoint:
```bash
curl http://3.83.83.69:3000/health
```

Expected response:
```json
{
  "status": "healthy",
  "database": {"status": "connected"},
  "redis": {"status": "connected"},
  "freeswitch": {"status": "connected"}
}
```

---

## Safety Features

### ✅ **Automatic Backup**
Every deployment creates a timestamped backup of the current production code before making any changes.

### ✅ **Syntax Validation**
All JavaScript files are checked for syntax errors before deployment. Deployment aborts if syntax errors found.

### ✅ **Health Checks**
After deployment, the system automatically verifies the API is responding correctly.

### ✅ **Automatic Rollback**
If health check fails, the system automatically restores the previous working version.

### ✅ **No Downtime Risk**
- PM2 gracefully stops and starts processes
- Health checks ensure API is working before marking deployment successful
- Rollback happens automatically on failure

---

## Rollback Manually

If you need to manually rollback to a previous version:

```bash
# SSH into production
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69

# List available backups
ls -lh /home/ubuntu/irisx-backend-backup-*.tar.gz

# Choose a backup and restore it
cd /home/ubuntu/irisx-backend
pm2 stop irisx-api
rm -rf src
tar xzf /home/ubuntu/irisx-backend-backup-YYYYMMDD-HHMMSS.tar.gz
pm2 start irisx-api

# Verify health
curl http://localhost:3000/health
```

---

## Deploying Week 24-25 Features

Once the CI/CD pipeline is set up, deploying new features is simple:

### Option 1: Automatic (Recommended)
```bash
# Commit your changes
git add api/src/
git commit -m "Add new feature"
git push origin main

# GitHub Actions automatically:
# 1. Runs syntax checks
# 2. Creates deployment package
# 3. Backs up production
# 4. Deploys new code
# 5. Verifies health
# 6. Rolls back if anything fails
```

### Option 2: Manual Trigger
1. Go to GitHub Actions tab
2. Run workflow manually
3. Monitor deployment progress

---

## Troubleshooting

### Deployment Fails with SSH Error
**Cause:** SSH key not properly configured in GitHub secrets
**Fix:**
1. Verify `PROD_SSH_KEY` secret contains the complete private key
2. Ensure key includes header/footer lines
3. Check `PROD_API_HOST` is set to `3.83.53.69`

### Deployment Fails with Syntax Error
**Cause:** Code has JavaScript syntax errors
**Fix:**
1. Check the GitHub Actions log for specific file and line number
2. Fix the syntax error locally
3. Test with: `node --check api/src/path/to/file.js`
4. Commit and push the fix

### Health Check Fails
**Cause:** API not starting correctly after deployment
**Fix:**
1. Automatic rollback should restore previous version
2. Check PM2 logs on production: `ssh ubuntu@3.83.53.69 "pm2 logs irisx-api --lines 50"`
3. Fix the issue locally and redeploy

### Rollback Fails
**Cause:** No backup found or backup corrupted
**Fix:**
1. Restore from manual backup: `/home/ubuntu/irisx-backend-backup-YYYYMMDD-HHMMSS.tar.gz`
2. If no backups exist, restore from git history manually
3. Always verify backups after successful deployments

---

## Best Practices

### ✅ **Before Pushing to Main**
1. Test locally first
2. Run syntax check: `find api/src -name "*.js" -exec node --check {} \;`
3. Verify all new files are committed
4. Review changes with `git diff`

### ✅ **After Deployment**
1. Monitor GitHub Actions for success/failure
2. Check API health endpoint
3. Monitor PM2 logs for errors
4. Test new features in production

### ✅ **Regular Maintenance**
1. Clean up old backups (keep last 5-10)
2. Monitor disk space on production server
3. Review deployment logs for warnings
4. Keep deployment workflow updated

---

## Next Steps After Setup

1. ✅ Add GitHub secrets (PROD_SSH_KEY, PROD_API_HOST)
2. ✅ Test with a small change first
3. ✅ Monitor the deployment
4. ✅ Verify health check passes
5. ✅ Deploy Week 24-25 features

---

## Support

If you encounter issues:
1. Check GitHub Actions logs for detailed error messages
2. SSH into production and check PM2 logs
3. Verify health endpoint is responding
4. Review this guide's troubleshooting section
5. Check `/home/ubuntu/irisx-backend-backup-*` for available backups

---

**Created:** November 3, 2025
**Last Updated:** November 3, 2025
**Status:** Ready to use once secrets are configured
