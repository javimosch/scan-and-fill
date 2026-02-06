import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import { app } from 'electron';

/**
 * Service to cache OCR results and manual entries
 */
export default class CacheService {
  constructor() {
    // Try to get Electron app data path, fallback to temp directory for testing
    // app will be undefined if running in pure Node.js context (unit tests)
    const userDataPath = app ? app.getPath('userData') : path.join(os.tmpdir(), 'scan-and-fill-test');
    
    this.cacheDir = path.join(userDataPath, 'pdf-cache');
    this.ocrCacheDir = path.join(this.cacheDir, 'ocr');
    this.manualEntriesPath = path.join(this.cacheDir, 'manual-entries.json');
    
    // Ensure cache directories exist
    this.ensureCacheDirectories();
  }

  ensureCacheDirectories() {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
    if (!fs.existsSync(this.ocrCacheDir)) {
      fs.mkdirSync(this.ocrCacheDir, { recursive: true });
    }
  }

  /**
   * Generate a hash for a PDF file based on its content
   */
  getFileHash(filePath) {
    const buffer = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Get cached OCR result for a PDF
   */
  getOCRCache(filePath) {
    try {
      const hash = this.getFileHash(filePath);
      const cachePath = path.join(this.ocrCacheDir, `${hash}.json`);
      
      if (fs.existsSync(cachePath)) {
        const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        console.log(`[CacheService] OCR cache hit for ${path.basename(filePath)}`);
        return data.text;
      }
    } catch (error) {
      console.warn(`[CacheService] Failed to read OCR cache:`, error.message);
    }
    return null;
  }

  /**
   * Save OCR result to cache
   */
  setOCRCache(filePath, text) {
    try {
      const hash = this.getFileHash(filePath);
      const cachePath = path.join(this.ocrCacheDir, `${hash}.json`);
      
      const data = {
        fileName: path.basename(filePath),
        timestamp: new Date().toISOString(),
        text
      };
      
      fs.writeFileSync(cachePath, JSON.stringify(data, null, 2), 'utf8');
      console.log(`[CacheService] OCR result cached for ${path.basename(filePath)}`);
    } catch (error) {
      console.warn(`[CacheService] Failed to save OCR cache:`, error.message);
    }
  }

  /**
   * Get all manual entries
   */
  getManualEntries() {
    try {
      if (fs.existsSync(this.manualEntriesPath)) {
        return JSON.parse(fs.readFileSync(this.manualEntriesPath, 'utf8'));
      }
    } catch (error) {
      console.warn(`[CacheService] Failed to read manual entries:`, error.message);
    }
    return {};
  }

  /**
   * Get manual entry for a specific file
   */
  getManualEntry(filePath) {
    const entries = this.getManualEntries();
    const hash = this.getFileHash(filePath);
    return entries[hash] || null;
  }

  /**
   * Save manual entry for a file
   */
  setManualEntry(filePath, amount) {
    try {
      const entries = this.getManualEntries();
      const hash = this.getFileHash(filePath);
      
      entries[hash] = {
        fileName: path.basename(filePath),
        amount,
        timestamp: new Date().toISOString()
      };
      
      fs.writeFileSync(this.manualEntriesPath, JSON.stringify(entries, null, 2), 'utf8');
      console.log(`[CacheService] Manual entry saved for ${path.basename(filePath)}: ${amount}`);
    } catch (error) {
      console.warn(`[CacheService] Failed to save manual entry:`, error.message);
    }
  }

  /**
   * Clear OCR cache (for maintenance)
   */
  clearOCRCache() {
    try {
      const files = fs.readdirSync(this.ocrCacheDir);
      files.forEach(file => {
        fs.unlinkSync(path.join(this.ocrCacheDir, file));
      });
      console.log(`[CacheService] Cleared ${files.length} OCR cache entries`);
    } catch (error) {
      console.warn(`[CacheService] Failed to clear OCR cache:`, error.message);
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    try {
      const ocrFiles = fs.readdirSync(this.ocrCacheDir);
      const manualEntries = this.getManualEntries();
      
      return {
        ocrCacheCount: ocrFiles.length,
        manualEntryCount: Object.keys(manualEntries).length,
        cacheDir: this.cacheDir
      };
    } catch (error) {
      return {
        ocrCacheCount: 0,
        manualEntryCount: 0,
        cacheDir: this.cacheDir
      };
    }
  }
}

export { CacheService };
