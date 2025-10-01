/**
 * File Cleanup Service
 *
 * Automatically deletes old uploaded files to prevent storage buildup.
 * Features:
 * - Periodic cleanup (every 10 minutes)
 * - Age-based deletion (files older than retention period)
 * - Session cleanup on logout
 * - Graceful shutdown
 */

import fs from 'fs/promises';
import path from 'path';

const UPLOAD_BASE_DIR = '/tmp/llm-uploads';
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const FILE_RETENTION_HOURS = parseInt(process.env.FILE_RETENTION_HOURS || '1', 10);
const FILE_RETENTION_MS = FILE_RETENTION_HOURS * 60 * 60 * 1000;

let cleanupInterval = null;

/**
 * Start the cleanup service
 */
export function startCleanupService() {
  console.log(`Starting file cleanup service (retention: ${FILE_RETENTION_HOURS}h, interval: 10min)`);

  // Initial cleanup
  cleanupOldFiles().catch(err => {
    console.error('Initial cleanup failed:', err);
  });

  // Schedule periodic cleanup
  cleanupInterval = setInterval(() => {
    cleanupOldFiles().catch(err => {
      console.error('Cleanup failed:', err);
    });
  }, CLEANUP_INTERVAL_MS);
}

/**
 * Stop the cleanup service
 */
export function stopCleanupService() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    console.log('Cleanup service stopped');
  }
}

/**
 * Clean up old files
 */
async function cleanupOldFiles() {
  try {
    const now = Date.now();
    let filesDeleted = 0;
    let directoriesDeleted = 0;

    // Check if upload directory exists
    try {
      await fs.access(UPLOAD_BASE_DIR);
    } catch {
      // Directory doesn't exist, nothing to clean
      return;
    }

    // Get all session directories
    const sessionDirs = await fs.readdir(UPLOAD_BASE_DIR);

    for (const sessionId of sessionDirs) {
      const sessionPath = path.join(UPLOAD_BASE_DIR, sessionId);

      // Skip if not a directory
      const stats = await fs.stat(sessionPath);
      if (!stats.isDirectory()) continue;

      // Get all files in session directory
      const files = await fs.readdir(sessionPath);
      let sessionHasFiles = false;

      for (const file of files) {
        const filePath = path.join(sessionPath, file);
        const fileStats = await fs.stat(filePath);

        // Delete if older than retention period
        const age = now - fileStats.mtimeMs;
        if (age > FILE_RETENTION_MS) {
          await fs.unlink(filePath);
          filesDeleted++;
          console.log(`Deleted old file: ${sessionId}/${file} (age: ${Math.round(age / 60000)}min)`);
        } else {
          sessionHasFiles = true;
        }
      }

      // Delete empty session directory
      if (!sessionHasFiles) {
        const remainingFiles = await fs.readdir(sessionPath);
        if (remainingFiles.length === 0) {
          await fs.rmdir(sessionPath);
          directoriesDeleted++;
          console.log(`Deleted empty session directory: ${sessionId}`);
        }
      }
    }

    if (filesDeleted > 0 || directoriesDeleted > 0) {
      console.log(`Cleanup complete: ${filesDeleted} files, ${directoriesDeleted} directories deleted`);
    }

  } catch (error) {
    console.error('Error during cleanup:', error);
  }
}

/**
 * Clean up all files for a specific session (on logout)
 */
export async function cleanupSession(sessionId) {
  if (!sessionId) return;

  try {
    const sessionPath = path.join(UPLOAD_BASE_DIR, sessionId);

    // Check if session directory exists
    try {
      await fs.access(sessionPath);
    } catch {
      // Directory doesn't exist, nothing to clean
      return;
    }

    // Delete all files in session
    const files = await fs.readdir(sessionPath);
    for (const file of files) {
      const filePath = path.join(sessionPath, file);
      await fs.unlink(filePath);
    }

    // Delete session directory
    await fs.rmdir(sessionPath);

    console.log(`Cleaned up session: ${sessionId} (${files.length} files deleted)`);

  } catch (error) {
    console.error(`Error cleaning up session ${sessionId}:`, error);
  }
}

/**
 * Get storage statistics
 */
export async function getStorageStats() {
  try {
    let totalFiles = 0;
    let totalSize = 0;
    const sessions = [];

    // Check if upload directory exists
    try {
      await fs.access(UPLOAD_BASE_DIR);
    } catch {
      return { totalFiles: 0, totalSize: 0, sessions: [] };
    }

    const sessionDirs = await fs.readdir(UPLOAD_BASE_DIR);

    for (const sessionId of sessionDirs) {
      const sessionPath = path.join(UPLOAD_BASE_DIR, sessionId);

      try {
        const stats = await fs.stat(sessionPath);
        if (!stats.isDirectory()) continue;

        const files = await fs.readdir(sessionPath);
        let sessionSize = 0;

        for (const file of files) {
          const filePath = path.join(sessionPath, file);
          const fileStats = await fs.stat(filePath);
          sessionSize += fileStats.size;
        }

        totalFiles += files.length;
        totalSize += sessionSize;

        sessions.push({
          sessionId,
          fileCount: files.length,
          size: sessionSize
        });
      } catch (err) {
        console.error(`Error reading session ${sessionId}:`, err);
      }
    }

    return {
      totalFiles,
      totalSize,
      totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
      sessions
    };

  } catch (error) {
    console.error('Error getting storage stats:', error);
    return { totalFiles: 0, totalSize: 0, sessions: [] };
  }
}
