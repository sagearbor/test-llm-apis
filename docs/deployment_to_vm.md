# Unix VM Deployment Guide

Complete guide for deploying the LLM Test App to a Unix VM with NGINX reverse proxy.

---

## Table of Contents

1. [Pre-Flight Checks](#pre-flight-checks)
2. [Understanding HTTPS on VM](#understanding-https-on-vm)
3. [Check Existing NGINX Configuration](#check-existing-nginx-configuration)
4. [Install Dependencies](#install-dependencies)
5. [Deploy Application](#deploy-application)
6. [Configure as System Service](#configure-as-system-service)
7. [Configure NGINX](#configure-nginx)
8. [Verify Deployment](#verify-deployment)
9. [Troubleshooting](#troubleshooting)

---

## Pre-Flight Checks

Run these commands on your Unix VM to check the current environment:

### Check if NGINX is installed
```bash
nginx -v
# Expected: nginx version: nginx/1.18.0 (or similar)

# If not installed:
sudo apt update
sudo apt install nginx -y
```

### Check if NGINX is running
```bash
sudo systemctl status nginx
# Expected: active (running)

# If not running:
sudo systemctl start nginx
sudo systemctl enable nginx
```

### Check if port 3003 is available
```bash
sudo lsof -i :3003
# Expected: (no output = port is free)
# If something is using it, you'll see the process
```

### Check if Node.js is installed
```bash
node -v
# Expected: v18.0.0 or higher

# If not installed or version too old:
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Check current user and permissions
```bash
whoami
# Note: You'll need sudo access for system configuration

# Check sudo access
sudo -l
```

---

## Understanding HTTPS on VM

### How HTTPS Works in Your Setup

```
Internet (Port 443)
     ↓
NGINX (SSL Termination)
     ↓ X-Forwarded-Proto: https
Your Node.js App (Port 3003, HTTP)
```

**Key Points:**
- **NGINX handles HTTPS** - It has the SSL certificate
- **Your app runs HTTP** - Only listens on localhost:3003
- **X-Forwarded-Proto header** - Tells your app it's behind HTTPS
- **No certificate needed in app** - NGINX does all SSL work

### Check Existing SSL Certificate

```bash
# Check if SSL certificate exists for your domain
sudo ls -la /etc/ssl/certs/ | grep aidemo

# Or check NGINX SSL config
sudo grep -r "ssl_certificate" /etc/nginx/

# Expected output shows paths like:
# ssl_certificate /etc/ssl/certs/aidemo.dcri.duke.edu.crt;
# ssl_certificate_key /etc/ssl/private/aidemo.dcri.duke.edu.key;
```

If you see certificate files, **HTTPS is already configured** - you just need to add your app's location block.

---

## Check Existing NGINX Configuration

### Find NGINX configuration files
```bash
# Main config file
sudo cat /etc/nginx/nginx.conf

# Sites available
ls -la /etc/nginx/sites-available/

# Sites enabled (symlinks to sites-available)
ls -la /etc/nginx/sites-enabled/

# Check if aidemo.dcri.duke.edu has config
sudo find /etc/nginx -name "*aidemo*"
sudo find /etc/nginx -name "*duke*"
```

### Check for existing /sageapp03 location
```bash
# Search all NGINX configs for sageapp03
sudo grep -r "sageapp03" /etc/nginx/

# Check for port 3003 references
sudo grep -r "3003" /etc/nginx/
```

### View current NGINX config for your domain
```bash
# If config file exists, view it (replace filename with actual)
sudo cat /etc/nginx/sites-available/aidemo.dcri.duke.edu

# Or view the main config
sudo cat /etc/nginx/sites-available/default
```

**What to look for:**
- `server_name aidemo.dcri.duke.edu;`
- `listen 443 ssl;` (HTTPS listener)
- `ssl_certificate` paths
- Existing `location /` blocks
- Check if `/sageapp03` location already exists

### Test NGINX configuration syntax
```bash
# Always test before reloading
sudo nginx -t

# Expected output:
# nginx: configuration file /etc/nginx/nginx.conf test is successful
```

---

## Install Dependencies

### 1. Install Node.js 22 (if needed)
```bash
# Remove old versions
sudo apt remove nodejs npm -y

# Add NodeSource repository for Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -

# Install Node.js
sudo apt-get install -y nodejs

# Verify installation
node -v  # Should show v22.x.x
npm -v   # Should show 10.x.x
```

### 2. Install Git (if needed)
```bash
# Check if installed
git --version

# Install if needed
sudo apt install git -y
```

### 3. Install build tools (for native dependencies)
```bash
sudo apt install build-essential -y
```

---

## Deploy Application

### 1. Choose deployment directory
```bash
# Standard location for web apps
sudo mkdir -p /opt/llm-test-app
sudo chown $USER:$USER /opt/llm-test-app

# Or use /var/www if preferred
# sudo mkdir -p /var/www/llm-test-app
# sudo chown $USER:$USER /var/www/llm-test-app
```

### 2. Clone repository
```bash
# From GitHub
cd /opt/llm-test-app
git clone https://github.com/your-org/test-llm-apis.git .

# Or from Azure DevOps (after migration)
git clone https://dev.azure.com/your-org/your-project/_git/test-llm-apis .

# Verify files
ls -la
# Should see: server.js, package.json, src/, public/, etc.
```

### 3. Install dependencies
```bash
cd /opt/llm-test-app

# Install ONLY production dependencies
npm ci --only=production

# Verify installation
ls -la node_modules/
```

### 4. Create production .env file

**CRITICAL:** Do NOT copy .env from development! Create fresh file.

```bash
cd /opt/llm-test-app

# Create .env file
sudo nano .env
```

**Add these values** (replace with your actual values):

```bash
# ========================================
# Environment Settings (REQUIRED)
# ========================================
NODE_ENV=production
APP_ENV=production
PORT=3003

# ========================================
# Azure OpenAI Configuration (REQUIRED)
# ========================================
AZURE_OPENAI_ENDPOINT=https://your-resource-name.openai.azure.com
AZURE_OPENAI_API_KEY=your_production_api_key_here
AZURE_OPENAI_API_VERSION=2024-02-01

# ========================================
# Model Deployments (REQUIRED - must match Azure exactly)
# ========================================
CODING_LLM_DEPLOYMENT_NAME=gpt-5-codex
SMALLEST_LLM_DEPLOYMENT_NAME=gpt-4o-mini
ALLAROUND_LLM_DEPLOYMENT_NAME=gpt-4o
BEST_LLM_DEPLOYMENT_NAME=o1-preview

# ========================================
# Security Configuration (CRITICAL!)
# ========================================

# Session secret - Generate with: openssl rand -base64 32
SESSION_SECRET=YOUR_GENERATED_SECRET_HERE

# CORS - Your Duke deployment URL
ALLOWED_ORIGINS=https://aidemo.dcri.duke.edu

# OAuth (if required by IT)
ENABLE_OAUTH=false
# AZURE_AD_CLIENT_ID=
# AZURE_AD_TENANT_ID=
# AZURE_AD_CLIENT_SECRET=

# Force authentication
REQUIRE_AUTH=false
```

**Generate SESSION_SECRET:**
```bash
# Run this and copy output to SESSION_SECRET in .env
openssl rand -base64 32
```

### 5. Set proper permissions
```bash
cd /opt/llm-test-app

# Restrict .env file (only owner can read)
chmod 600 .env

# App directory permissions
sudo chown -R www-data:www-data /opt/llm-test-app
sudo chmod -R 755 /opt/llm-test-app

# Data directory (for runtime files)
sudo mkdir -p /opt/llm-test-app/src/data
sudo chown -R www-data:www-data /opt/llm-test-app/src/data
sudo chmod 755 /opt/llm-test-app/src/data
```

### 6. Test the application manually
```bash
cd /opt/llm-test-app

# Start app manually (test before making it a service)
node server.js

# In another terminal, test health endpoint
curl http://localhost:3003/health

# Expected: JSON response with model statuses
# Press Ctrl+C to stop the app
```

---

## Configure as System Service

Create a systemd service so the app starts automatically on boot and restarts on failure.

### 1. Create service file
```bash
sudo nano /etc/systemd/system/llm-test-app.service
```

### 2. Add service configuration
```ini
[Unit]
Description=LLM Test Application - DCRI DIAL
Documentation=https://github.com/your-org/test-llm-apis
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/llm-test-app

# Environment
Environment=NODE_ENV=production
EnvironmentFile=/opt/llm-test-app/.env

# Start command
ExecStart=/usr/bin/node server.js

# Restart policy
Restart=on-failure
RestartSec=10s

# Logging
StandardOutput=append:/var/log/llm-test-app/app.log
StandardError=append:/var/log/llm-test-app/error.log
SyslogIdentifier=llm-test-app

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/llm-test-app/src/data /var/log/llm-test-app

[Install]
WantedBy=multi-user.target
```

### 3. Create log directory
```bash
sudo mkdir -p /var/log/llm-test-app
sudo chown www-data:www-data /var/log/llm-test-app
sudo chmod 755 /var/log/llm-test-app
```

### 4. Enable and start service
```bash
# Reload systemd to recognize new service
sudo systemctl daemon-reload

# Enable service (start on boot)
sudo systemctl enable llm-test-app

# Start service now
sudo systemctl start llm-test-app

# Check status
sudo systemctl status llm-test-app
```

**Expected output:**
```
● llm-test-app.service - LLM Test Application - DCRI DIAL
     Loaded: loaded (/etc/systemd/system/llm-test-app.service; enabled)
     Active: active (running) since Sat 2025-01-18 08:00:00 EST
   Main PID: 12345 (node)
      Tasks: 11
     Memory: 128M
```

### 5. Test service is running
```bash
# Test health endpoint
curl http://localhost:3003/health

# Should return JSON with model statuses

# View logs
sudo journalctl -u llm-test-app -f

# Or view log files
sudo tail -f /var/log/llm-test-app/app.log
```

### 6. Useful service commands
```bash
# Stop service
sudo systemctl stop llm-test-app

# Start service
sudo systemctl start llm-test-app

# Restart service (after code updates)
sudo systemctl restart llm-test-app

# View status
sudo systemctl status llm-test-app

# View logs (last 50 lines)
sudo journalctl -u llm-test-app -n 50

# Follow logs in real-time
sudo journalctl -u llm-test-app -f
```

---

## Configure NGINX

### Option A: If /sageapp03 location doesn't exist yet

#### 1. Find the correct NGINX config file
```bash
# List all site configs
ls -la /etc/nginx/sites-available/

# Likely files:
# - default
# - aidemo.dcri.duke.edu
# - aidemo (or similar)

# Check which one has your domain
sudo grep -l "aidemo.dcri.duke.edu" /etc/nginx/sites-available/*

# Use that file for editing (example: default)
sudo nano /etc/nginx/sites-available/default
```

#### 2. Add location block for /sageapp03

Find the `server` block with `server_name aidemo.dcri.duke.edu;` and `listen 443 ssl;`

Add this **inside** that server block:

```nginx
    # LLM Test App - DIAL
    location /sageapp03 {
        # Proxy to Node.js app on port 3003
        proxy_pass http://localhost:3003;
        proxy_http_version 1.1;

        # Forward original request information
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;  # Critical for HTTPS detection

        # WebSocket support (if needed)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_cache_bypass $http_upgrade;

        # Timeouts for long-running LLM requests
        proxy_connect_timeout 60s;
        proxy_send_timeout 300s;     # 5 minutes for sending request
        proxy_read_timeout 300s;     # 5 minutes for LLM to respond

        # Buffer settings
        proxy_buffering off;         # Don't buffer LLM streaming responses
    }
```

**Complete example of what the file might look like:**

```nginx
server {
    listen 443 ssl;
    server_name aidemo.dcri.duke.edu;

    # SSL certificate (already configured by IT)
    ssl_certificate /etc/ssl/certs/aidemo.dcri.duke.edu.crt;
    ssl_certificate_key /etc/ssl/private/aidemo.dcri.duke.edu.key;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;

    # Existing locations
    location / {
        # ... existing config ...
    }

    # NEW: LLM Test App
    location /sageapp03 {
        proxy_pass http://localhost:3003;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_cache_bypass $http_upgrade;
        proxy_connect_timeout 60s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
        proxy_buffering off;
    }
}

# HTTP to HTTPS redirect
server {
    listen 80;
    server_name aidemo.dcri.duke.edu;
    return 301 https://$server_name$request_uri;
}
```

#### 3. Test and reload NGINX
```bash
# ALWAYS test configuration before reloading
sudo nginx -t

# If test passes:
# nginx: configuration file /etc/nginx/nginx.conf test is successful

# Reload NGINX
sudo systemctl reload nginx

# Check NGINX status
sudo systemctl status nginx
```

### Option B: If /sageapp03 location already exists

```bash
# View existing config
sudo grep -A 20 "location /sageapp03" /etc/nginx/sites-available/*

# Verify it points to correct port
# Should see: proxy_pass http://localhost:3003;

# If it points to different port, update it
sudo nano /etc/nginx/sites-available/<config-file>

# Test and reload
sudo nginx -t
sudo systemctl reload nginx
```

---

## Verify Deployment

### 1. Test from VM itself
```bash
# Test health endpoint (internal)
curl http://localhost:3003/health

# Test through NGINX (simulating external request)
curl -H "Host: aidemo.dcri.duke.edu" http://localhost/sageapp03/health

# Test HTTPS redirect (should redirect to HTTPS)
curl -I http://aidemo.dcri.duke.edu/sageapp03

# Test main page
curl -H "Host: aidemo.dcri.duke.edu" https://localhost/sageapp03/ -k
```

### 2. Test from your laptop (external)
```bash
# Test health endpoint
curl https://aidemo.dcri.duke.edu/sageapp03/health

# Expected response: JSON with model statuses
```

### 3. Test in browser
```
https://aidemo.dcri.duke.edu/sageapp03
```

**Expected:**
- Should show DIAL interface with navbar, dashboard, etc.
- Browser shows 🔒 (HTTPS is working)
- No certificate warnings

### 4. Verify security headers
```bash
curl -I https://aidemo.dcri.duke.edu/sageapp03

# Should see headers:
# Strict-Transport-Security: max-age=31536000
# X-Frame-Options: DENY
# X-Content-Type-Options: nosniff
# Content-Security-Policy: (strict CSP policy)
```

### 5. Check application logs
```bash
# View app logs
sudo journalctl -u llm-test-app -n 50

# Or
sudo tail -f /var/log/llm-test-app/app.log

# Should see:
# "Security middleware applied for production environment"
# "Server running on http://localhost:3003"
```

### 6. Check NGINX logs
```bash
# Access log (successful requests)
sudo tail -f /var/log/nginx/access.log | grep sageapp03

# Error log (if any issues)
sudo tail -f /var/log/nginx/error.log
```

---

## Troubleshooting

### App not starting

**Check service status:**
```bash
sudo systemctl status llm-test-app

# If failed, view full logs
sudo journalctl -u llm-test-app -n 100
```

**Common issues:**
- **.env file missing:** Create /opt/llm-test-app/.env
- **Permissions wrong:** `sudo chown -R www-data:www-data /opt/llm-test-app`
- **Port 3003 in use:** `sudo lsof -i :3003` to find process

### 502 Bad Gateway

**Means:** NGINX can't reach your app

**Check:**
```bash
# Is app running?
sudo systemctl status llm-test-app

# Is it listening on 3003?
sudo lsof -i :3003

# Test directly
curl http://localhost:3003/health

# Check NGINX error logs
sudo tail -f /var/log/nginx/error.log
```

**Fix:**
```bash
# Restart app
sudo systemctl restart llm-test-app

# Wait 5 seconds, test again
curl http://localhost:3003/health
```

### 404 Not Found

**Means:** NGINX doesn't have /sageapp03 location configured

**Check:**
```bash
# Search for sageapp03 in NGINX configs
sudo grep -r "sageapp03" /etc/nginx/

# If not found, add location block (see Configure NGINX section)
```

### HTTPS not working / Certificate errors

**Check certificate:**
```bash
# View certificate details
sudo openssl x509 -in /etc/ssl/certs/aidemo.dcri.duke.edu.crt -text -noout

# Check expiration
sudo openssl x509 -in /etc/ssl/certs/aidemo.dcri.duke.edu.crt -enddate -noout

# Verify NGINX has correct path
sudo grep -r "ssl_certificate" /etc/nginx/
```

**Contact IT if:**
- Certificate doesn't exist
- Certificate is expired
- Certificate is for wrong domain

### App works but models fail health check

**Check Azure OpenAI credentials:**
```bash
# View environment (WITHOUT exposing secrets)
sudo systemctl show llm-test-app --property=Environment

# Test API key manually
curl -X POST "https://your-resource.openai.azure.com/openai/deployments/gpt-4o-mini/chat/completions?api-version=2024-02-01" \
  -H "Content-Type: application/json" \
  -H "api-key: YOUR_API_KEY" \
  -d '{"messages":[{"role":"user","content":"test"}],"max_tokens":10}'

# Check app logs for API errors
sudo journalctl -u llm-test-app | grep -i error
```

### CORS errors in browser console

**Check ALLOWED_ORIGINS:**
```bash
# View .env file
sudo cat /opt/llm-test-app/.env | grep ALLOWED_ORIGINS

# Should be:
# ALLOWED_ORIGINS=https://aidemo.dcri.duke.edu

# If wrong, update .env and restart
sudo nano /opt/llm-test-app/.env
sudo systemctl restart llm-test-app
```

### Can't update code

**Deployment workflow:**
```bash
# 1. Navigate to app directory
cd /opt/llm-test-app

# 2. Backup .env (DO NOT git pull over it!)
cp .env .env.backup

# 3. Pull latest code
git pull origin main

# 4. Install any new dependencies
npm ci --only=production

# 5. Restore .env if it was overwritten
cp .env.backup .env

# 6. Restart service
sudo systemctl restart llm-test-app

# 7. Verify it's running
sudo systemctl status llm-test-app
curl http://localhost:3003/health
```

### Disk space issues

**Check disk usage:**
```bash
# Check overall disk space
df -h

# Check app directory size
du -sh /opt/llm-test-app

# Check log file sizes
du -sh /var/log/llm-test-app/*
sudo du -sh /var/log/nginx/*

# Clean old logs if needed
sudo find /var/log/llm-test-app -name "*.log" -mtime +30 -delete
```

---

## Security Checklist for IT Review

Before requesting IT approval, verify:

- [ ] **HTTPS Only:** Application only accessible via https://
- [ ] **No HTTP access:** http:// redirects to https://
- [ ] **Valid SSL Certificate:** No browser warnings
- [ ] **Security Headers:** HSTS, X-Frame-Options, CSP present
- [ ] **CORS Configured:** ALLOWED_ORIGINS set correctly
- [ ] **No Secrets in Code:** All credentials in .env file
- [ ] **Rate Limiting:** Enabled (check with rapid requests)
- [ ] **Authentication:** Verify if ENABLE_OAUTH is required
- [ ] **Logging:** All requests/errors logged
- [ ] **Firewall:** Port 3003 NOT exposed externally
- [ ] **File Permissions:** .env is 600 (only owner readable)
- [ ] **Service User:** App runs as www-data (not root)

### Show IT these commands:

```bash
# 1. Verify HTTPS redirect
curl -I http://aidemo.dcri.duke.edu/sageapp03
# Should show: 301 redirect to https://

# 2. Verify security headers
curl -I https://aidemo.dcri.duke.edu/sageapp03
# Should show: Strict-Transport-Security, X-Frame-Options, etc.

# 3. Verify no secrets exposed
sudo grep -r "api.key\|password\|secret" /opt/llm-test-app/*.js /opt/llm-test-app/src/*.js
# Should only find .env references, no hardcoded values

# 4. Verify port 3003 not exposed
sudo netstat -tuln | grep 3003
# Should show: 127.0.0.1:3003 (localhost only, not 0.0.0.0)

# 5. Verify app runs as non-root
ps aux | grep "node server.js"
# USER column should show: www-data (not root)
```

---

## Quick Reference

### Start/Stop/Restart
```bash
sudo systemctl start llm-test-app    # Start
sudo systemctl stop llm-test-app     # Stop
sudo systemctl restart llm-test-app  # Restart
sudo systemctl status llm-test-app   # Status
```

### View Logs
```bash
sudo journalctl -u llm-test-app -f              # Follow app logs
sudo tail -f /var/log/llm-test-app/app.log     # App stdout
sudo tail -f /var/log/llm-test-app/error.log   # App stderr
sudo tail -f /var/log/nginx/access.log         # NGINX access
sudo tail -f /var/log/nginx/error.log          # NGINX errors
```

### Test Endpoints
```bash
curl http://localhost:3003/health                          # Internal health
curl https://aidemo.dcri.duke.edu/sageapp03/health        # External health
curl -I https://aidemo.dcri.duke.edu/sageapp03            # Check headers
```

### Update App
```bash
cd /opt/llm-test-app
cp .env .env.backup
git pull origin main
npm ci --only=production
cp .env.backup .env
sudo systemctl restart llm-test-app
```

---

**Last Updated:** 2025-01-18
**For:** Duke DCRI VM Deployment
**Domain:** https://aidemo.dcri.duke.edu/sageapp03
