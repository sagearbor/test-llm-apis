/**
 * File Upload Middleware
 *
 * Configures multer for secure file uploads with strict validation.
 * Security features:
 * - File type whitelist
 * - File size limits
 * - Session-based storage isolation
 * - Sanitized filenames
 */

import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import sanitize from 'sanitize-filename';
import crypto from 'crypto';

// File upload configuration from environment or defaults
const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '10', 10);
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// Comprehensive file type whitelist (extensions only)
const ALLOWED_EXTENSIONS = new Set([
  // Documents
  '.txt', '.md', '.rtf',
  '.pdf',
  '.docx', '.doc',
  '.xlsx', '.xls',
  '.pptx', '.ppt',
  '.odt', '.ods', '.odp',
  '.csv', '.tsv',

  // Code & Scripts
  '.py', '.js', '.ts', '.java', '.kt', '.cpp', '.c', '.h', '.cs',
  '.go', '.rs', '.rb', '.php', '.swift', '.r', '.sql', '.scala',
  '.sh', '.ps1',

  // Data & Config
  '.json', '.jsonl', '.xml', '.yaml', '.yml', '.toml', '.ini', '.cfg',

  // Data Science
  '.ipynb', '.pbix', '.rmd', '.parquet',

  // Web
  '.html', '.htm', '.css', '.scss', '.sass', '.jsx', '.tsx', '.vue', '.svelte',

  // Markup
  '.tex', '.rst', '.adoc',

  // Archives
  '.zip'
]);

// Blocked extensions (executable files)
const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.dll', '.so', '.dylib', '.bat', '.cmd', '.app',
  '.msi', '.deb', '.rpm', '.jar', '.scr', '.vbs', '.apk', '.ipa',
  '.env'  // Prevent uploading secrets
]);

/**
 * Configure multer storage with session-based isolation
 */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Create session-specific directory
    // To find temp dir at runtime: node -p "require('os').tmpdir()"
    const sessionId = req.session?.id || 'anonymous';
    const uploadDir = path.join(os.tmpdir(), 'llm-uploads', sessionId);

    // Ensure directory exists
    fs.mkdirSync(uploadDir, { recursive: true });

    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate secure random filename but preserve extension
    const ext = path.extname(file.originalname).toLowerCase();
    const randomId = crypto.randomBytes(16).toString('hex');
    const safeName = sanitize(file.originalname);

    // Store original filename in metadata
    req.fileMetadata = {
      originalName: safeName,
      uploadedAt: new Date().toISOString()
    };

    cb(null, `${randomId}${ext}`);
  }
});

/**
 * File filter for validation
 */
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();

  // Check blocked extensions first
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return cb(new Error(`File type ${ext} is not allowed for security reasons`), false);
  }

  // Check allowed extensions
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return cb(new Error(`File type ${ext} is not supported. Allowed types: ${Array.from(ALLOWED_EXTENSIONS).join(', ')}`), false);
  }

  cb(null, true);
};

/**
 * Create multer upload instance
 */
export const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 1  // One file per upload
  }
});

/**
 * Rate limiting tracker (in-memory, simple implementation)
 */
const uploadCounts = new Map();

// Clean up old entries every hour
setInterval(() => {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  for (const [key, data] of uploadCounts.entries()) {
    if (data.resetTime < oneHourAgo) {
      uploadCounts.delete(key);
    }
  }
}, 60 * 60 * 1000);

/**
 * Rate limiting middleware
 */
export function rateLimitUpload(req, res, next) {
  const sessionId = req.session?.id || req.ip;
  const limit = parseInt(process.env.UPLOAD_RATE_LIMIT_PER_HOUR || '10', 10);

  const now = Date.now();
  const data = uploadCounts.get(sessionId);

  if (!data || data.resetTime < now) {
    // New hour, reset counter
    uploadCounts.set(sessionId, {
      count: 1,
      resetTime: now + 60 * 60 * 1000
    });
    return next();
  }

  if (data.count >= limit) {
    return res.status(429).json({
      error: 'Too many uploads',
      message: `Upload limit of ${limit} files per hour exceeded. Try again later.`
    });
  }

  data.count++;
  next();
}

/**
 * Get upload directory for session
 */
export function getUploadDir(sessionId) {
  return path.join(os.tmpdir(), 'llm-uploads', sessionId || 'anonymous');
}

/**
 * Check if file extension is allowed
 */
export function isAllowedExtension(filename) {
  const ext = path.extname(filename).toLowerCase();
  return ALLOWED_EXTENSIONS.has(ext) && !BLOCKED_EXTENSIONS.has(ext);
}
