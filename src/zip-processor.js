/**
 * ZIP File Processing Module
 *
 * Safely processes ZIP files with comprehensive security measures:
 * - Zip bomb detection
 * - File type validation
 * - Size limits
 * - Nesting depth limits
 * - Recursive processing
 */

import AdmZip from 'adm-zip';
import path from 'path';
import os from 'os';
import { isAllowedExtension } from './upload-middleware.js';

// Security limits
const MAX_UNCOMPRESSED_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_FILES_IN_ZIP = 100;
const MAX_NESTING_DEPTH = 2;
const ZIP_BOMB_RATIO = 100; // Reject if compression ratio > 100:1

// Dangerous executables that block entire ZIP
const DANGEROUS_EXTENSIONS = new Set([
  '.exe', '.dll', '.so', '.dylib', '.bat', '.cmd', '.app',
  '.msi', '.deb', '.rpm', '.jar', '.scr', '.vbs', '.apk', '.ipa'
]);

/**
 * Process ZIP file and extract text from all valid files
 * @param {string} zipPath - Path to ZIP file
 * @param {number} nestingLevel - Current nesting depth
 * @returns {Promise<{text: string, filesProcessed: number, warnings: string[]}>}
 */
export async function processZipFile(zipPath, nestingLevel = 0) {
  if (nestingLevel > MAX_NESTING_DEPTH) {
    throw new Error(`ZIP nesting too deep (max ${MAX_NESTING_DEPTH} levels)`);
  }

  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();

  // Security checks
  const validation = validateZipSecurity(entries);
  if (!validation.safe) {
    throw new Error(validation.reason);
  }

  let combinedText = '';
  let filesProcessed = 0;
  const warnings = [];

  // Process each file in the ZIP
  for (const entry of entries) {
    if (entry.isDirectory) continue;

    const filename = entry.entryName;
    const ext = path.extname(filename).toLowerCase();

    // Check for dangerous files
    if (DANGEROUS_EXTENSIONS.has(ext)) {
      throw new Error(`ZIP contains dangerous file type: ${filename}`);
    }

    // Skip files not in whitelist
    if (!isAllowedExtension(filename)) {
      warnings.push(`Skipped unsupported file: ${filename}`);
      continue;
    }

    try {
      // Handle nested ZIPs
      if (ext === '.zip') {
        if (nestingLevel >= MAX_NESTING_DEPTH) {
          warnings.push(`Skipped nested ZIP (too deep): ${filename}`);
          continue;
        }

        // Extract nested ZIP to temp location and process
        // To find temp dir at runtime: node -p "require('os').tmpdir()"
        const tempPath = path.join(os.tmpdir(), `nested-${Date.now()}.zip`);
        const fs = await import('fs/promises');
        await fs.writeFile(tempPath, entry.getData());

        const nestedResult = await processZipFile(tempPath, nestingLevel + 1);
        combinedText += `\n--- Nested ZIP: ${filename} ---\n`;
        combinedText += nestedResult.text;
        filesProcessed += nestedResult.filesProcessed;
        warnings.push(...nestedResult.warnings);

        // Clean up temp file
        await fs.unlink(tempPath);
      } else {
        // Process regular file
        const content = await processZipEntry(entry);
        if (content) {
          combinedText += `\n--- File: ${filename} ---\n`;
          combinedText += content;
          combinedText += '\n';
          filesProcessed++;
        }
      }
    } catch (error) {
      warnings.push(`Failed to process ${filename}: ${error.message}`);
    }
  }

  return {
    text: combinedText,
    filesProcessed,
    warnings
  };
}

/**
 * Validate ZIP file security
 */
function validateZipSecurity(entries) {
  let totalUncompressedSize = 0;
  let totalCompressedSize = 0;
  let fileCount = 0;

  for (const entry of entries) {
    if (entry.isDirectory) continue;

    fileCount++;
    totalUncompressedSize += entry.header.size;
    totalCompressedSize += entry.header.compressedSize;

    // Check file count
    if (fileCount > MAX_FILES_IN_ZIP) {
      return {
        safe: false,
        reason: `Too many files in ZIP (max ${MAX_FILES_IN_ZIP})`
      };
    }

    // Check total size
    if (totalUncompressedSize > MAX_UNCOMPRESSED_SIZE) {
      return {
        safe: false,
        reason: `ZIP uncompressed size exceeds limit (${MAX_UNCOMPRESSED_SIZE / 1024 / 1024}MB)`
      };
    }
  }

  // Zip bomb detection: Check compression ratio
  if (totalCompressedSize > 0) {
    const ratio = totalUncompressedSize / totalCompressedSize;
    if (ratio > ZIP_BOMB_RATIO) {
      return {
        safe: false,
        reason: `Suspicious compression ratio (${ratio.toFixed(1)}:1) - possible zip bomb`
      };
    }
  }

  return { safe: true };
}

/**
 * Process a single entry from ZIP file
 */
async function processZipEntry(entry) {
  const ext = path.extname(entry.entryName).toLowerCase();
  const data = entry.getData();

  // Text-based files - extract directly
  const textExtensions = [
    '.txt', '.md', '.json', '.xml', '.yaml', '.yml', '.csv', '.tsv',
    '.py', '.js', '.ts', '.java', '.cpp', '.c', '.h', '.cs', '.go',
    '.rs', '.rb', '.php', '.swift', '.sql', '.html', '.css', '.sh'
  ];

  if (textExtensions.includes(ext)) {
    return data.toString('utf-8');
  }

  // For other supported formats (PDF, DOCX, etc.), would need to write to temp file
  // and use file-processor.js - keeping it simple for now
  return `[Binary file: ${entry.entryName} - ${entry.header.size} bytes]`;
}
