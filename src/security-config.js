/**
 * Security Configuration for Azure Web App Deployment
 *
 * This module provides security middleware and configurations for:
 * - CORS (Cross-Origin Resource Sharing)
 * - Security headers (Helmet.js)
 * - Rate limiting
 * - Input sanitization
 */

import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

/**
 * Get CORS configuration based on environment
 */
export function getCorsConfig() {
  const isDevelopment = process.env.NODE_ENV !== 'production';

  // In production, specify exact origins that should have access
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
    : isDevelopment
      ? ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000']
      : [];

  // Add Azure Web App URL if configured
  if (process.env.AZURE_WEBAPP_URL) {
    allowedOrigins.push(process.env.AZURE_WEBAPP_URL);
  }

  return cors({
    origin: function(origin, callback) {
      // Allow requests with no origin (like mobile apps or Postman)
      if (!origin && isDevelopment) return callback(null, true);

      if (!origin) return callback(null, false);

      if (allowedOrigins.length === 0) {
        // If no origins configured, allow same-origin only
        return callback(null, false);
      }

      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error(`CORS policy violation: Origin ${origin} not allowed`));
      }
    },
    credentials: true, // Allow cookies to be sent
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400 // Cache preflight requests for 24 hours
  });
}

/**
 * Configure Helmet.js for security headers
 */
export function getHelmetConfig() {
  const isDevelopment = process.env.NODE_ENV !== 'production';

  // In development, disable CSP entirely for easier testing
  // In production, use STRICTEST CSP - no unsafe-inline anywhere
  return helmet({
    contentSecurityPolicy: isDevelopment ? false : {
      useDefaults: false, // Don't use Helmet's defaults - we want full control
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        blockAllMixedContent: [],
        connectSrc: ["'self'", "https:"], // Allow HTTPS connections for APIs
        fontSrc: ["'self'", "data:"],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
        frameSrc: ["'none'"],
        imgSrc: ["'self'", "data:", "https:"],
        mediaSrc: ["'self'"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"], // STRICT: Only external scripts, NO unsafe-inline
        scriptSrcAttr: ["'none'"], // NO inline event handlers
        styleSrc: ["'self'", "'unsafe-inline'"], // Still allowing inline styles for CSS simplicity
        upgradeInsecureRequests: [],
      },
      reportOnly: false // Set to true to test CSP without blocking
    },
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: true,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    dnsPrefetchControl: true,
    frameguard: { action: 'deny' }, // Prevent clickjacking
    hidePoweredBy: true, // Remove X-Powered-By header
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true
    },
    ieNoOpen: true,
    noSniff: true, // Prevent MIME type sniffing
    originAgentCluster: true,
    permittedCrossDomainPolicies: false,
    referrerPolicy: { policy: "no-referrer" },
    xssFilter: true, // Basic XSS protection
  });
}

/**
 * Create rate limiter for API endpoints
 */
export function createRateLimiter(options = {}) {
  const defaults = {
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 20, // 20 requests per minute
    message: 'Too many requests, please try again later.',
    standardHeaders: true, // Return rate limit info in headers
    legacyHeaders: false,
    // Skip rate limiting for health checks
    skip: (req) => req.path === '/health'
  };

  return rateLimit({ ...defaults, ...options });
}

/**
 * Strict rate limiter for sensitive endpoints
 */
export function createStrictRateLimiter() {
  return createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 requests per 15 minutes
    message: 'Too many attempts, please try again after 15 minutes.'
  });
}

/**
 * Input sanitization middleware - custom implementation for Express 5 compatibility
 * Note: Express 5 makes req.query and req.params read-only, so we only sanitize req.body
 */
export function getSanitizer() {
  return (req, res, next) => {
    // Function to recursively sanitize objects
    const sanitize = (obj) => {
      if (!obj || typeof obj !== 'object') return obj;

      const cleaned = Array.isArray(obj) ? [] : {};

      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          // Skip keys that look like NoSQL injection
          if (typeof key === 'string' && (key.startsWith('$') || key.includes('.'))) {
            console.warn(`Blocked potentially malicious key: ${key} from IP: ${req.ip}`);
            continue;
          }

          if (typeof obj[key] === 'string') {
            // Remove null bytes and other dangerous characters
            cleaned[key] = obj[key].replace(/\0/g, '').replace(/[\$]/g, '_');
          } else if (typeof obj[key] === 'object') {
            cleaned[key] = sanitize(obj[key]);
          } else {
            cleaned[key] = obj[key];
          }
        }
      }
      return cleaned;
    };

    // Only sanitize body (mutable in Express 5)
    if (req.body && typeof req.body === 'object') {
      req.body = sanitize(req.body);
    }

    next();
  };
}

/**
 * Custom security middleware for additional checks
 */
export function customSecurityMiddleware(req, res, next) {
  // Check for common attack patterns
  const suspiciousPatterns = [
    /<script/gi,
    /javascript:/gi,
    /on\w+\s*=/gi, // onclick, onload, etc.
    /\.\.\//g, // Directory traversal
    /\0/g, // Null bytes
  ];

  const checkValue = (value) => {
    if (typeof value === 'string') {
      for (const pattern of suspiciousPatterns) {
        if (pattern.test(value)) {
          console.warn(`Blocked suspicious request from IP: ${req.ip}, Pattern: ${pattern}`);
          return false;
        }
      }
    }
    return true;
  };

  // Check all request inputs
  const inputs = [
    ...(req.body ? Object.values(req.body) : []),
    ...(req.query ? Object.values(req.query) : []),
    ...(req.params ? Object.values(req.params) : [])
  ];

  for (const input of inputs) {
    if (!checkValue(input)) {
      return res.status(400).json({
        error: 'Invalid input detected. Request blocked for security reasons.'
      });
    }
  }

  next();
}

/**
 * Environment-specific security configurations
 */
export function getEnvironmentConfig() {
  const isProd = process.env.NODE_ENV === 'production';

  return {
    // Force HTTPS in production
    forceHttps: isProd,

    // Require authentication in production
    requireAuth: isProd || process.env.REQUIRE_AUTH === 'true',

    // Stricter rate limits in production
    rateLimit: isProd ? {
      windowMs: 1 * 60 * 1000,
      max: 10 // 10 requests per minute in production
    } : {
      windowMs: 1 * 60 * 1000,
      max: 100 // More lenient in development
    },

    // Session configuration
    session: {
      secure: isProd, // Secure cookies in production
      sameSite: isProd ? 'strict' : 'lax',
      httpOnly: true,
      maxAge: isProd
        ? 1000 * 60 * 60 * 2  // 2 hours in production
        : 1000 * 60 * 60 * 24  // 24 hours in development
    }
  };
}

/**
 * HTTPS redirect middleware for production
 */
export function httpsRedirect(req, res, next) {
  if (process.env.NODE_ENV === 'production' &&
      !req.secure &&
      req.get('x-forwarded-proto') !== 'https') {
    return res.redirect('https://' + req.get('host') + req.url);
  }
  next();
}

/**
 * Apply all security configurations to an Express app
 */
export function applySecurityMiddleware(app) {
  const env = getEnvironmentConfig();

  // HTTPS redirect (should be first)
  if (env.forceHttps) {
    app.use(httpsRedirect);
  }

  // Security headers
  app.use(getHelmetConfig());

  // CORS
  app.use(getCorsConfig());

  // Input sanitization
  app.use(getSanitizer());

  // Custom security checks
  app.use(customSecurityMiddleware);

  // Rate limiting (apply to all routes)
  app.use('/api/', createRateLimiter(env.rateLimit));
  app.use('/chat', createRateLimiter(env.rateLimit));

  // Strict rate limiting for auth endpoints
  app.use('/login', createStrictRateLimiter());
  app.use('/auth/', createStrictRateLimiter());

  console.log(`Security middleware applied for ${process.env.NODE_ENV || 'development'} environment`);
}

export default {
  getCorsConfig,
  getHelmetConfig,
  createRateLimiter,
  createStrictRateLimiter,
  getSanitizer,
  customSecurityMiddleware,
  getEnvironmentConfig,
  httpsRedirect,
  applySecurityMiddleware
};