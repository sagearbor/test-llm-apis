/**
 * Azure AD OAuth Authentication
 *
 * Uses Microsoft Authentication Library (MSAL) for OAuth 2.0 authentication.
 *
 * Setup instructions:
 * 1. Register app in Azure Portal (Entra ID > App registrations)
 * 2. Set Redirect URI: https://your-app.azurewebsites.net/auth/redirect
 * 3. Add environment variables (see .env.example)
 */

import * as msal from '@azure/msal-node';

// Check if OAuth is enabled
const isAuthEnabled = process.env.ENABLE_OAUTH === 'true';

// MSAL configuration (only if OAuth is enabled)
let cca = null;

if (isAuthEnabled) {
  const msalConfig = {
    auth: {
      clientId: process.env.AZURE_AD_CLIENT_ID || '',
      authority: `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID || 'common'}`,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET || '',
    },
    system: {
      loggerOptions: {
        loggerCallback(loglevel, message, containsPii) {
          if (!containsPii) {
            console.log(message);
          }
        },
        piiLoggingEnabled: false,
        logLevel: msal.LogLevel.Warning,
      }
    }
  };

  // Create MSAL instance
  cca = new msal.ConfidentialClientApplication(msalConfig);
  console.log('OAuth is enabled - authentication required');
} else {
  console.log('OAuth is disabled - running in open mode');
}

/**
 * Get authorization URL for login redirect
 */
export function getAuthUrl(redirectUri) {
  if (!isAuthEnabled) return null;

  const authCodeUrlParameters = {
    scopes: ['user.read'],
    redirectUri: redirectUri,
  };

  return cca.getAuthCodeUrl(authCodeUrlParameters);
}

/**
 * Exchange authorization code for tokens
 */
export async function getTokenFromCode(code, redirectUri) {
  if (!isAuthEnabled) return null;

  const tokenRequest = {
    code: code,
    scopes: ['user.read'],
    redirectUri: redirectUri,
  };

  const response = await cca.acquireTokenByCode(tokenRequest);
  return response;
}

/**
 * Middleware to protect routes with authentication
 */
export function requireAuth(req, res, next) {
  // Skip auth if not enabled
  if (!isAuthEnabled) {
    return next();
  }

  // Check if user is authenticated
  if (req.session && req.session.isAuthenticated) {
    return next();
  }

  // Redirect to login if not authenticated
  res.redirect('/login');
}

/**
 * Get authentication status
 */
export function isAuthenticated(req) {
  if (!isAuthEnabled) return true; // Always authenticated if auth is disabled
  return req.session && req.session.isAuthenticated === true;
}

/**
 * Check if OAuth is configured and enabled
 */
export function isOAuthEnabled() {
  return isAuthEnabled;
}
