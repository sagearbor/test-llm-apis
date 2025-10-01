# VM Deployment Guide
## Deploying LLM Test App on Azure VM with NGINX + SSL

**Target VM:** `alp-dsvm-003.azure.dhe.duke.edu`
**Access URL:** `https://alp-dsvm-003.azure.dhe.duke.edu:3060`
**Security:** OAuth required, HTTPS only, Duke network access

---

## Prerequisites

- SSH access to the VM
- Sudo privileges
- Duke Azure AD credentials for OAuth setup
- VM restarts automatically each night (auto-start configured)

---

## Part 1: Initial Setup on VM

### 1.1 SSH into the VM

```bash
ssh your-username@alp-dsvm-003.azure.dhe.duke.edu
```

### 1.2 Check Current Setup

Run these commands to see what's already installed:

```bash
# Check Node.js
node --version  # Need v18 or higher

# Check NGINX
nginx -v

# Check if port 3060 is in use
sudo netstat -tulpn | grep 3060

# Check firewall status
sudo ufw status
```

### 1.3 Install Node.js (if needed)

```bash
# Check version first
node --version

# If not installed or too old (need v18+):
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify
node --version  # Should show v22.x.x
npm --version
```

### 1.4 Install NGINX (if needed)

```bash
# Check if installed
nginx -v

# If not installed:
sudo apt update
sudo apt install -y nginx

# Start and enable
sudo systemctl start nginx
sudo systemctl enable nginx
```

---

## Part 2: Deploy the Application

### 2.1 Create Service Account (IMPORTANT - Security Best Practice)

**Even if you're logged in as root, the app should run as a non-root user for security.**

```bash
# Create a dedicated system user for the app (no login shell)
sudo useradd --system --no-create-home --shell /bin/false llmtest

# Verify user was created
id llmtest
# Should show: uid=... gid=... groups=...
```

### 2.2 Create Application Directory

```bash
# Create app directory
sudo mkdir -p /opt/llm-test-app

# Set ownership to service account
sudo chown -R llmtest:llmtest /opt/llm-test-app

# Give yourself temporary access to set it up
sudo chmod 755 /opt/llm-test-app
cd /opt/llm-test-app
```

### 2.3 Clone Repository

```bash
# Clone the repo as root/your user (will fix permissions after)
sudo git clone https://github.com/sagearbor/test-llm-apis.git /opt/llm-test-app

# Or if already cloned, pull latest:
cd /opt/llm-test-app
sudo git pull origin main
```

### 2.4 Install Dependencies

```bash
cd /opt/llm-test-app
sudo npm install

# Fix ownership after npm install
sudo chown -R llmtest:llmtest /opt/llm-test-app
```

### 2.5 Configure Environment Variables

```bash
# Create .env file
sudo cp /opt/llm-test-app/.env.example /opt/llm-test-app/.env
sudo nano /opt/llm-test-app/.env
```

**Edit `.env` with these settings:**

```bash
# Azure OpenAI Configuration
AZURE_OPENAI_ENDPOINT=https://ai-sandbox-instance.openai.azure.com/
AZURE_OPENAI_API_KEY=your-api-key-here
AZURE_OPENAI_API_VERSION=2025-03-01-preview

# OAuth - REQUIRED for production
ENABLE_OAUTH=true
AZURE_AD_CLIENT_ID=your-client-id
AZURE_AD_TENANT_ID=cb72c54e-4a31-4d9e-b14a-1ea36dfac94c
AZURE_AD_CLIENT_SECRET=your-client-secret

# Session Security
SESSION_SECRET=generate-random-string-here
NODE_ENV=production

# Port (internal - NGINX will proxy to this)
PORT=3000
```

**To generate a secure session secret:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**After editing, secure the .env file:**
```bash
# Only llmtest user can read the file
sudo chown llmtest:llmtest /opt/llm-test-app/.env
sudo chmod 600 /opt/llm-test-app/.env

# Verify permissions
ls -la /opt/llm-test-app/.env
# Should show: -rw------- 1 llmtest llmtest
```

### 2.6 Test the Application

```bash
# Test run as the service account
cd /opt/llm-test-app
sudo -u llmtest NODE_ENV=production node server.js

# In another terminal, test:
curl http://localhost:3000/health

# If it works, stop with Ctrl+C
```

---

## Part 3: Configure NGINX with SSL

### 3.1 Locate NGINX Config Directory

```bash
# Check where configs are
ls -la /etc/nginx/sites-available/
ls -la /etc/nginx/conf.d/

# Duke might use a custom location, check:
sudo nginx -T | grep "conf"
```

### 3.2 Create NGINX Configuration

Create a new config file (use the appropriate directory from step 3.1):

```bash
sudo nano /etc/nginx/sites-available/llm-test
```

**Paste this configuration** (see `docs/nginx-config-example.conf` for full version):

```nginx
# Rate limiting
limit_req_zone $binary_remote_addr zone=llm_limit:10m rate=10r/s;

server {
    listen 3060 ssl http2;
    server_name alp-dsvm-003.azure.dhe.duke.edu;

    # SSL Configuration (use Duke's existing certificates)
    ssl_certificate /path/to/duke/cert.crt;
    ssl_certificate_key /path/to/duke/cert.key;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Rate limiting
    limit_req zone=llm_limit burst=20 nodelay;

    # Logging
    access_log /var/log/nginx/llm-test-access.log;
    error_log /var/log/nginx/llm-test-error.log;

    # Proxy to Node.js app
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
}
```

**Important:** Update the SSL certificate paths:
```bash
# Find Duke's SSL certificates
sudo find /etc -name "*.crt" -o -name "*.pem" | grep -i duke
```

### 3.3 Enable the Site

```bash
# Enable the site (if using sites-available/sites-enabled pattern)
sudo ln -s /etc/nginx/sites-available/llm-test /etc/nginx/sites-enabled/

# Test NGINX configuration
sudo nginx -t

# If test passes, reload NGINX
sudo systemctl reload nginx
```

---

## Part 4: Configure Auto-Start with systemd

### 4.1 Create systemd Service

```bash
sudo nano /etc/systemd/system/llm-test.service
```

**Paste this content:**

```ini
[Unit]
Description=LLM Test Application
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/opt/llm-test-app
Environment=NODE_ENV=production
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=llm-test

[Install]
WantedBy=multi-user.target
```

**Replace `your-username`** with `llmtest`:
```bash
# The service file should have:
# User=llmtest
# Group=llmtest
```

**Important**: The systemd service file is already included in the repo at `/opt/llm-test-app/llm-test.service`. Copy and edit it:

```bash
# Copy to systemd directory
sudo cp /opt/llm-test-app/llm-test.service /etc/systemd/system/

# Edit to set user to llmtest (if not already)
sudo nano /etc/systemd/system/llm-test.service
# Change: User=llmtest
# Change: Group=llmtest
```

### 4.2 Enable and Start Service

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable (auto-start on boot)
sudo systemctl enable llm-test

# Start now
sudo systemctl start llm-test

# Check status
sudo systemctl status llm-test

# View logs
sudo journalctl -u llm-test -f
```

### 4.3 Test Auto-Start

```bash
# Reboot VM to test
sudo reboot

# After reboot, SSH back in and check:
sudo systemctl status llm-test
curl http://localhost:3000/health
```

---

## Part 5: Configure Firewall

### 5.1 Azure NSG (Network Security Group)

In Azure Portal:

1. Go to VM → Networking → Network security group
2. Add inbound rule:
   - **Source:** Your VPN IP range or VirtualNetwork
   - **Source port ranges:** *
   - **Destination:** Any
   - **Destination port ranges:** 3060
   - **Protocol:** TCP
   - **Action:** Allow
   - **Priority:** 1000
   - **Name:** Allow-LLM-Test-3060

### 5.2 VM Firewall (ufw)

```bash
# Check status
sudo ufw status

# Allow port 3060
sudo ufw allow 3060/tcp comment 'LLM Test App'

# Verify
sudo ufw status numbered
```

---

## Part 6: Configure OAuth (Azure AD)

### 6.1 Register Application in Azure AD

1. **Azure Portal** → **Azure Active Directory** → **App registrations** → **New registration**

2. **Settings:**
   - Name: `LLM Test App - alp-dsvm-003`
   - Supported account types: `Single tenant` (Duke only)
   - Redirect URI:
     - Type: Web
     - URI: `https://alp-dsvm-003.azure.dhe.duke.edu:3060/auth/redirect`

3. **Click Register**

### 6.2 Configure Application

After registration:

1. **Copy these values:**
   - Application (client) ID → `AZURE_AD_CLIENT_ID` in `.env`
   - Directory (tenant) ID → `AZURE_AD_TENANT_ID` in `.env`

2. **Create Client Secret:**
   - Go to **Certificates & secrets**
   - **New client secret**
   - Description: `Production Secret`
   - Expires: 24 months
   - **Copy the VALUE** → `AZURE_AD_CLIENT_SECRET` in `.env`

3. **Update .env:**
```bash
sudo systemctl stop llm-test
nano /opt/llm-test-app/.env
# Add the OAuth values
sudo systemctl start llm-test
```

### 6.3 Assign Users

1. Azure Portal → **Enterprise Applications**
2. Find your app
3. **Users and groups** → **Add user/group**
4. Select users who should have access
5. **Assign**

---

## Part 7: Testing & Verification

### 7.1 Test Internal Connection

```bash
# From VM
curl -k https://localhost:3060/health
```

### 7.2 Test External Connection

From your local machine (on VPN):

```bash
# Check DNS
nslookup alp-dsvm-003.azure.dhe.duke.edu

# Test connection
curl -k https://alp-dsvm-003.azure.dhe.duke.edu:3060/api/auth/status
```

### 7.3 Test OAuth Flow

1. Open browser: `https://alp-dsvm-003.azure.dhe.duke.edu:3060`
2. Should redirect to Microsoft login
3. Sign in with Duke credentials
4. Should redirect back to app
5. Should see health status indicators

### 7.4 Verify Security

```bash
# Check app is running as non-root
ps aux | grep node

# Check listening ports
sudo netstat -tulpn | grep :3000
sudo netstat -tulpn | grep :3060

# Check logs
sudo journalctl -u llm-test --since "10 minutes ago"
tail -f /var/log/nginx/llm-test-access.log
```

---

## Part 8: Maintenance

### 8.1 Update Application

```bash
cd /opt/llm-test-app
git pull origin main
npm install
sudo systemctl restart llm-test
```

### 8.2 View Logs

```bash
# Application logs
sudo journalctl -u llm-test -f

# NGINX logs
tail -f /var/log/nginx/llm-test-access.log
tail -f /var/log/nginx/llm-test-error.log

# System logs
dmesg | tail
```

### 8.3 Restart Services

```bash
# Restart app
sudo systemctl restart llm-test

# Restart NGINX
sudo systemctl restart nginx

# Check status
sudo systemctl status llm-test
sudo systemctl status nginx
```

### 8.4 Stop Application (if needed)

```bash
# Stop app
sudo systemctl stop llm-test

# Disable auto-start
sudo systemctl disable llm-test
```

---

## Troubleshooting

### Application Won't Start

```bash
# Check logs
sudo journalctl -u llm-test -n 50

# Common issues:
# 1. Port already in use
sudo netstat -tulpn | grep :3000

# 2. Environment variables missing
sudo systemctl status llm-test
# Check for "Configuration error" in logs

# 3. Permissions
ls -la /opt/llm-test-app
sudo chown -R $USER:$USER /opt/llm-test-app
```

### NGINX Errors

```bash
# Test config
sudo nginx -t

# Check error log
tail -f /var/log/nginx/llm-test-error.log

# Common issues:
# 1. SSL certificate path wrong
sudo nginx -T | grep ssl_certificate

# 2. Port 3060 already in use
sudo netstat -tulpn | grep :3060
```

### Can't Connect Externally

```bash
# 1. Check firewall
sudo ufw status

# 2. Check Azure NSG in portal

# 3. Check DNS
nslookup alp-dsvm-003.azure.dhe.duke.edu

# 4. Check NGINX is listening
sudo netstat -tulpn | grep :3060
```

### OAuth Not Working

```bash
# 1. Check environment variables
grep AZURE_AD /opt/llm-test-app/.env

# 2. Check redirect URI matches exactly in Azure AD

# 3. Check app logs for OAuth errors
sudo journalctl -u llm-test | grep -i oauth

# 4. Verify users are assigned in Azure AD Enterprise Applications
```

---

## Security Checklist

Before going live, verify:

- [ ] OAuth is enabled (`ENABLE_OAUTH=true`)
- [ ] HTTPS only (no HTTP access)
- [ ] Firewall configured (Azure NSG + ufw)
- [ ] Strong SESSION_SECRET generated
- [ ] SSL certificates are valid
- [ ] Rate limiting configured in NGINX
- [ ] Security headers enabled
- [ ] Application runs as non-root user
- [ ] Logs are being written and monitored
- [ ] Only authorized Duke users assigned in Azure AD

See `docs/SECURITY_CHECKLIST.md` for detailed security considerations.

---

## Quick Reference

**Start/Stop/Restart:**
```bash
sudo systemctl start llm-test
sudo systemctl stop llm-test
sudo systemctl restart llm-test
sudo systemctl status llm-test
```

**Logs:**
```bash
sudo journalctl -u llm-test -f
tail -f /var/log/nginx/llm-test-access.log
```

**Update:**
```bash
cd /opt/llm-test-app && git pull && npm install && sudo systemctl restart llm-test
```

**Access URL:**
```
https://alp-dsvm-003.azure.dhe.duke.edu:3060
```
