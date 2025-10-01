# Security Checklist for LLM Test App Deployment

## Overview

This document explains the security measures implemented to ensure the LLM Test App is safe for deployment on Duke's network and won't cause issues with IT.

---

## ✅ Implemented Security Measures

### 1. Authentication & Authorization

**What's Implemented:**
- ✅ **Azure AD OAuth Integration**: Only Duke users with valid Azure AD credentials can access
- ✅ **User Assignment Required**: IT can control exactly who has access through Azure AD Enterprise Applications
- ✅ **No Anonymous Access**: All endpoints require authentication when `ENABLE_OAUTH=true`
- ✅ **Session Management**: Secure, encrypted sessions with httpOnly cookies

**Why IT Will Approve:**
- Uses Duke's official authentication system (Azure AD)
- Audit trail of who accessed when (Azure AD sign-in logs)
- Easy to revoke access (remove user from Azure AD app)
- No custom authentication to maintain

**How to Show IT:**
```bash
# Verify OAuth is enabled
grep "ENABLE_OAUTH" /opt/llm-test-app/.env

# Should show: ENABLE_OAUTH=true
```

---

### 2. Network Security

**What's Implemented:**
- ✅ **HTTPS Only**: All traffic encrypted via SSL/TLS (NGINX)
- ✅ **Internal Port**: Node app runs on localhost:3000 (not exposed)
- ✅ **NGINX Proxy**: Only NGINX port 3060 is exposed
- ✅ **Azure NSG**: Firewall restricts access to Duke network/VPN only
- ✅ **VM Firewall (ufw)**: Additional layer blocking unauthorized ports

**Why IT Will Approve:**
- No public internet exposure
- Encrypted traffic only
- Multiple firewall layers
- Standard Duke infrastructure patterns

**How to Show IT:**
```bash
# Check firewall rules
sudo ufw status numbered
sudo netstat -tulpn | grep :3000  # Should only show 127.0.0.1
sudo netstat -tulpn | grep :3060  # Should show 0.0.0.0 or specific IP
```

---

### 3. Data Security

**What's Implemented:**
- ✅ **No Data Storage**: App doesn't store conversations or user data
- ✅ **No Conversation History**: Single-turn interactions only
- ✅ **API Keys Secured**: Stored in `.env` file (not in git, not in code)
- ✅ **Environment Variables**: Secrets loaded from environment, not hardcoded
- ✅ **Session Secrets**: Strong, randomly generated session encryption keys

**Why IT Will Approve:**
- No sensitive data at rest
- No compliance risk (FERPA, HIPAA, etc.)
- All API calls go directly to Azure OpenAI (Duke's existing service)
- No data leaves Duke's control

**How to Show IT:**
```bash
# Verify .env is not in git
cat .gitignore | grep .env

# Check .env permissions (should be readable only by app user)
ls -la /opt/llm-test-app/.env

# Should show: -rw------- or -rw-r-----
```

---

### 4. Application Security

**What's Implemented:**
- ✅ **Non-Root Execution**: App runs as dedicated service account `llmtest` (NOT root)
- ✅ **Dedicated Service Account**: Separate user with no login shell, minimal permissions
- ✅ **Rate Limiting**: NGINX limits request rate (10 req/sec with burst)
- ✅ **Security Headers**: HSTS, CSP, X-Frame-Options, etc.
- ✅ **Input Validation**: All inputs validated by Azure OpenAI API
- ✅ **No Code Execution**: App doesn't execute user input as code
- ✅ **Dependency Scanning**: Use `npm audit` regularly
- ✅ **File Permissions**: .env file is 600 (only service account can read)

**Why IT Will Approve:**
- Follows security best practices (principle of least privilege)
- Minimal attack surface
- No privilege escalation risk (runs as unprivileged user)
- Even if app is compromised, attacker has no root access
- Standard Linux service security patterns

**How to Show IT:**
```bash
# Verify running as llmtest (not root)
ps aux | grep node
# Should show: llmtest  <pid> ... node server.js

# Verify service account has no login
grep llmtest /etc/passwd
# Should show: llmtest:x:...:...::/bin/false

# Check .env permissions
ls -la /opt/llm-test-app/.env
# Should show: -rw------- 1 llmtest llmtest

# Check for security headers
curl -I https://alp-dsvm-003.azure.dhe.duke.edu:3060

# Should see:
# Strict-Transport-Security: max-age=31536000
# X-Frame-Options: SAMEORIGIN
# X-Content-Type-Options: nosniff
```

---

### 5. Logging & Monitoring

**What's Implemented:**
- ✅ **Access Logs**: NGINX logs all access attempts
- ✅ **Error Logs**: Application and NGINX error logs
- ✅ **Azure AD Logs**: Sign-in attempts logged in Azure AD
- ✅ **systemd Logs**: Application status and crashes logged
- ✅ **Log Rotation**: Automatic log rotation (logrotate)

**Why IT Will Approve:**
- Audit trail for compliance
- Can track usage and issues
- Incident response capability
- Logs integrate with Duke's existing monitoring

**How to Show IT:**
```bash
# Show logging is active
ls -la /var/log/nginx/llm-test-*
sudo journalctl -u llm-test --since today

# Check Azure AD sign-in logs in portal
```

---

### 6. Update & Patch Management

**What's Implemented:**
- ✅ **Version Control**: App code in git (known good states)
- ✅ **Manual Updates**: Updates require manual approval (no auto-update)
- ✅ **Dependency Locking**: package-lock.json ensures consistent versions
- ✅ **Security Patches**: Can quickly apply security updates

**Why IT Will Approve:**
- No unexpected changes
- Can review updates before applying
- Quick security patch capability
- Rollback capability via git

**How to Show IT:**
```bash
# Show current version
cd /opt/llm-test-app && git log -1 --oneline

# Show dependencies are locked
cat package-lock.json | head -20

# Check for vulnerabilities
npm audit
```

---

## 🔒 Additional Security Recommendations

### For Extra IT Confidence:

1. **Create a Service Account:**
   ```bash
   # Instead of your user, create dedicated service account
   sudo adduser --system --group llm-test
   sudo chown -R llm-test:llm-test /opt/llm-test-app

   # Update systemd service:
   # User=llm-test
   ```

2. **Restrict .env File Permissions:**
   ```bash
   chmod 600 /opt/llm-test-app/.env
   chown llm-test:llm-test /opt/llm-test-app/.env
   ```

3. **Enable AppArmor/SELinux:**
   ```bash
   # If not already enabled
   sudo aa-status
   ```

4. **Set Up Log Forwarding:**
   ```bash
   # Send logs to Duke's central logging (if they have one)
   # Configure rsyslog or similar
   ```

5. **Document for IT:**
   - What it does (test Azure OpenAI deployments)
   - Who can access (Azure AD controlled)
   - What data it accesses (Azure OpenAI API only)
   - No PII/sensitive data stored
   - Temporary/test environment

---

## 🚨 What NOT to Do (To Avoid IT Issues)

### ❌ DON'T:
1. **Open to Public Internet** - Keep Azure NSG restricted to Duke network
2. **Disable OAuth** - Always require authentication in production
3. **Store API Keys in Code** - Always use environment variables
4. **Run as Root** - Use dedicated user account
5. **Disable HTTPS** - Always use SSL/TLS
6. **Skip Firewall** - Always configure both Azure NSG and ufw
7. **Ignore Logs** - Monitor regularly for issues
8. **Auto-Update in Production** - Review updates manually
9. **Share .env File** - Keep credentials secure
10. **Allow Password Auth on SSH** - Use SSH keys only

---

## 📊 Compliance Considerations

### FERPA (Student Data):
- ✅ **No student data**: App doesn't access student records
- ✅ **Auth required**: Only authorized Duke users
- ✅ **Audit trail**: Azure AD logs

### HIPAA (Health Data):
- ✅ **No PHI**: App doesn't handle health information
- ✅ **Encrypted**: All data in transit encrypted

### Duke IT Policies:
- ✅ **Azure AD Integration**: Uses Duke authentication
- ✅ **Network Segmentation**: Internal Duke network only
- ✅ **Logging**: Meets audit requirements
- ✅ **Encryption**: TLS 1.2+ only

---

## 🛡️ Security Incident Response

**If something goes wrong:**

### 1. Immediate Actions:
```bash
# Stop the application
sudo systemctl stop llm-test

# Block port in firewall
sudo ufw deny 3060
```

### 2. Investigation:
```bash
# Check access logs
tail -100 /var/log/nginx/llm-test-access.log

# Check application logs
sudo journalctl -u llm-test --since "1 hour ago"

# Check Azure AD sign-in logs (Azure Portal)
```

### 3. Recovery:
```bash
# If needed, restore from git
cd /opt/llm-test-app
git reset --hard <known-good-commit>
sudo systemctl restart llm-test
```

---

## ✅ Pre-Deployment Checklist

Before enabling production access:

### Application Security:
- [ ] OAuth enabled (`ENABLE_OAUTH=true`)
- [ ] Strong SESSION_SECRET generated
- [ ] .env file permissions set to 600
- [ ] Application runs as non-root user
- [ ] Latest security patches applied (`npm audit`)

### Network Security:
- [ ] HTTPS configured (valid SSL certificate)
- [ ] Azure NSG restricts to Duke network
- [ ] ufw firewall configured
- [ ] Port 3000 not exposed externally
- [ ] Only port 3060 accessible

### Authentication:
- [ ] Azure AD app registered
- [ ] Redirect URI configured correctly
- [ ] Client secret secured in .env
- [ ] Users assigned in Azure AD
- [ ] Test login works

### Monitoring & Logs:
- [ ] Access logs enabled
- [ ] Error logs enabled
- [ ] systemd logging working
- [ ] Log rotation configured

### Documentation:
- [ ] Deployment documented
- [ ] Security measures documented
- [ ] Incident response plan
- [ ] Contact info for issues

---

## 📞 Who to Contact

**For Issues:**
- Application problems: Your team
- Azure AD issues: Duke OIT Identity Management
- Network/firewall: Duke OIT Network Team
- SSL certificates: Duke OIT Infrastructure

**To Notify IT (Recommended):**
Send email to IT with:
- What: LLM Test Application deployment
- Where: alp-dsvm-003.azure.dhe.duke.edu:3060
- Who: Duke users via Azure AD (list users)
- Why: Testing Azure OpenAI model deployments
- Security: See this checklist
- Duration: Permanent / Temporary (specify)

---

## Summary for IT

**What is this?**
A simple web interface for testing Duke's Azure OpenAI model deployments. Allows authorized users to verify models are working and compare responses.

**Is it secure?**
- Requires Duke Azure AD login (OAuth)
- HTTPS only, encrypted traffic
- No data storage (stateless)
- Restricted to Duke network
- Standard security headers and rate limiting
- Runs as non-root user
- Full audit logging

**What's the risk?**
- **Minimal**: No sensitive data, no internet exposure, Duke auth only
- Same risk profile as any internal Duke web app
- Uses existing Duke Azure OpenAI subscription (no new external services)

**Can you shut it down remotely?**
Yes, through:
1. Azure AD: Remove user assignments
2. Azure NSG: Block port 3060
3. VM: Stop systemd service
4. VM: Shut down or deallocate

**Compliance:**
- No FERPA concerns (no student data)
- No HIPAA concerns (no health data)
- Follows Duke security best practices
- Meets audit/logging requirements
