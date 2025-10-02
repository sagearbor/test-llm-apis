# Security Configuration Guide

## Overview

This application implements multiple layers of security to protect against common web vulnerabilities and ensure safe deployment in Azure Web App environments.

## Security Features Implemented

### 1. CORS (Cross-Origin Resource Sharing)
**What it does:** Controls which websites can access your API, preventing unauthorized cross-origin requests.

**Configuration:**
- Set `ALLOWED_ORIGINS` environment variable with comma-separated list of allowed domains
- Example: `ALLOWED_ORIGINS=https://myapp.azurewebsites.net,https://mycompany.com`
- In development, localhost is automatically allowed
- Azure Web App URL is automatically added if `AZURE_WEBAPP_URL` is set

### 2. Helmet.js Security Headers
**What it does:** Sets various HTTP headers to protect against well-known web vulnerabilities.

**Headers configured:**
- **Content Security Policy (CSP)** - Prevents XSS attacks
- **X-Frame-Options** - Prevents clickjacking
- **HSTS** - Forces HTTPS connections
- **X-Content-Type-Options** - Prevents MIME type sniffing
- **Referrer Policy** - Controls referrer information
- **X-XSS-Protection** - Basic XSS protection for older browsers

### 3. Rate Limiting
**What it does:** Prevents abuse and DDoS attacks by limiting requests per user.

**Limits:**
- **API endpoints:** 10 requests per minute (production) / 100 (development)
- **Authentication endpoints:** 5 requests per 15 minutes
- **Health checks:** Unlimited (excluded from rate limiting)

### 4. Input Sanitization
**What it does:** Removes potentially malicious content from user inputs.

**Protection against:**
- NoSQL injection attacks
- Script injection (XSS)
- Directory traversal attacks
- Null byte injection

### 5. Session Security
**What it does:** Protects user sessions from hijacking and fixation attacks.

**Features:**
- Cryptographically secure session secrets
- HttpOnly cookies (prevents JavaScript access)
- SameSite=strict (CSRF protection)
- Secure cookies in production (HTTPS only)
- Rolling sessions (extends on activity)
- Custom session name to avoid fingerprinting

### 6. HTTPS Enforcement
**What it does:** Forces all connections to use HTTPS in production.

**How it works:**
- Automatically redirects HTTP to HTTPS
- HSTS header ensures browsers remember to use HTTPS
- Secure cookies require HTTPS

## Environment Variables for Security

### Required in Production
```env
# Session secret (generate with: openssl rand -base64 32)
SESSION_SECRET=your-secure-random-string

# Azure OpenAI credentials
AZURE_OPENAI_ENDPOINT=https://your-instance.openai.azure.com/
AZURE_OPENAI_API_KEY=your-api-key

# Environment
NODE_ENV=production
```

### Optional Security Settings
```env
# CORS configuration
ALLOWED_ORIGINS=https://app1.com,https://app2.com
AZURE_WEBAPP_URL=https://myapp.azurewebsites.net

# Authentication
ENABLE_OAUTH=true
REQUIRE_AUTH=true

# Rate limiting (requests per minute)
RATE_LIMIT_MAX=10
RATE_LIMIT_WINDOW_MS=60000
```

## Deployment Checklist for IT

### Local Testing
- [ ] Run with `NODE_ENV=development`
- [ ] Test CORS with different origins
- [ ] Verify rate limiting works
- [ ] Check security headers in browser DevTools

### VM Deployment (POC)
- [ ] Set `NODE_ENV=production`
- [ ] Configure `SESSION_SECRET` (never use default)
- [ ] Set `ALLOWED_ORIGINS` for your domain
- [ ] Use reverse proxy (nginx) with SSL certificate
- [ ] Configure firewall rules

### Azure Web App Deployment (MVP)
- [ ] Configure Application Settings in Azure Portal:
  - Add all environment variables
  - Enable HTTPS Only
  - Set minimum TLS version to 1.2
- [ ] Configure CORS in Azure Portal if needed (or use app-level CORS)
- [ ] Enable Azure Web Application Firewall (WAF)
- [ ] Configure IP restrictions if needed
- [ ] Enable diagnostic logging
- [ ] Set up Azure Key Vault for secrets (recommended)

## Security Best Practices

### 1. Secrets Management
- **Never** commit secrets to Git
- Use Azure Key Vault for production
- Rotate API keys regularly
- Use different keys for dev/staging/production

### 2. Network Security
- Use private endpoints for Azure OpenAI if possible
- Implement IP allowlisting for sensitive endpoints
- Use Azure Front Door for DDoS protection

### 3. Monitoring
- Enable Azure Application Insights
- Monitor for suspicious patterns:
  - Repeated 401/403 errors
  - High rate of requests from single IP
  - Unusual request patterns
- Set up alerts for security events

### 4. Regular Updates
- Update dependencies monthly: `npm update`
- Check for vulnerabilities: `npm audit`
- Fix critical issues immediately: `npm audit fix`

## Common Security Issues and Solutions

### Issue: "CORS policy: No 'Access-Control-Allow-Origin'"
**Solution:** Add the requesting domain to `ALLOWED_ORIGINS` environment variable

### Issue: "Too many requests"
**Solution:** This is rate limiting working correctly. Adjust limits if needed for legitimate use.

### Issue: "Invalid input detected"
**Solution:** Input contains potentially malicious content. Review and sanitize user input.

### Issue: "SESSION_SECRET must be set in production"
**Solution:** Set a secure SESSION_SECRET environment variable (32+ random characters)

## Security Incident Response

If you detect a security issue:

1. **Immediate Actions:**
   - Enable authentication if not already (`ENABLE_OAUTH=true`)
   - Review Azure logs for suspicious activity
   - Temporarily reduce rate limits if under attack

2. **Investigation:**
   - Check Application Insights for anomalies
   - Review failed authentication attempts
   - Analyze request patterns

3. **Remediation:**
   - Update affected dependencies
   - Rotate compromised credentials
   - Apply additional IP restrictions if needed

## Testing Security

### Manual Security Tests
```bash
# Test CORS (should fail from unauthorized origin)
curl -H "Origin: https://evil.com" http://localhost:3000/api/health

# Test rate limiting (run multiple times quickly)
for i in {1..25}; do curl -X POST http://localhost:3000/chat -H "Content-Type: application/json" -d '{"prompt":"test"}'; done

# Check security headers
curl -I http://localhost:3000

# Test input sanitization
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"prompt":"<script>alert(1)</script>"}'
```

### Automated Security Scanning
Consider using:
- OWASP ZAP for vulnerability scanning
- npm audit for dependency vulnerabilities
- Azure Security Center for cloud security

## Compliance Notes

This configuration helps meet common security requirements:
- **OWASP Top 10** protection
- **PCI DSS** compliance (with additional configuration)
- **GDPR** considerations (secure data handling)
- **SOC 2** security controls

## Support

For security questions or to report vulnerabilities:
- Contact your IT security team immediately
- Do not post security issues publicly
- Use secure channels for sensitive information

## Version History

- v2.0.0 - Added comprehensive security suite (CORS, Helmet, rate limiting)
- v1.5.0 - Enhanced session security
- v1.0.0 - Initial security implementation