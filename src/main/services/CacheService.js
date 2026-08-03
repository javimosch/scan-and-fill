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
    this.aiCacheDir = path.join(this.cacheDir, 'ai');
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
    if (!fs.existsSync(this.aiCacheDir)) {
      fs.mkdirSync(this.aiCacheDir, { recursive: true });
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
  getStats() {
    try {
      // Count OCR cache files
      let ocrEntries = 0;
      try {
        const files = fs.readdirSync(this.ocrCacheDir);
        ocrEntries = files.filter(file => file.endsWith('.json')).length;
      } catch (error) {
        // Directory doesn't exist yet
        ocrEntries = 0;
      }
      
      // Count manual entries
      let manualEntries = 0;
      try {
        if (fs.existsSync(this.manualEntriesPath)) {
          const manualData = JSON.parse(fs.readFileSync(this.manualEntriesPath, 'utf8'));
          manualEntries = Object.keys(manualData).length;
        }
      } catch (error) {
        manualEntries = 0;
      }
      
      // Calculate total cache size
      let totalSize = 0;
      try {
        if (fs.existsSync(this.cacheDir)) {
          const stats = fs.statSync(this.cacheDir);
          totalSize = stats.size;
        }
      } catch (error) {
        totalSize = 0;
      }
      
      return {
        ocrEntries,
        manualEntries,
        totalEntries: ocrEntries + manualEntries,
        totalSize: `${(totalSize / 1024).toFixed(2)} KB`,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      return { 
        ocrEntries: 0, 
        manualEntries: 0, 
        totalEntries: 0, 
        totalSize: '0 KB',
        lastUpdated: null
      };
    }
  }

  /**
   * Get cached AI detection result by key
   */
  getAIDetectionCache(key) {
    try {
      const cachePath = path.join(this.aiCacheDir, `${key}.json`);
      if (fs.existsSync(cachePath)) {
        const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        console.log(`[CacheService] AI detection cache hit for ${key.substring(0, 16)}...`);
        return data.result;
      }
    } catch (error) {
      console.warn(`[CacheService] Failed to read AI detection cache:`, error.message);
    }
    return null;
  }

  /**
   * Save AI detection result to cache
   */
  setAIDetectionCache(key, result) {
    try {
      if (!fs.existsSync(this.aiCacheDir)) {
        fs.mkdirSync(this.aiCacheDir, { recursive: true });
      }

      const cachePath = path.join(this.aiCacheDir, `${key}.json`);
      const data = {
        key,
        timestamp: new Date().toISOString(),
        result
      };

      fs.writeFileSync(cachePath, JSON.stringify(data, null, 2), 'utf8');
      console.log(`[CacheService] AI detection result cached for ${key.substring(0, 16)}...`);
    } catch (error) {
      console.warn(`[CacheService] Failed to save AI detection cache:`, error.message);
    }
  }

  /**
   * Get today's AI detection API call usage
   */
  getAIDetectionUsage() {
    try {
      const usagePath = path.join(this.cacheDir, 'ai-usage.json');
      const today = new Date().toISOString().split('T')[0];

      if (fs.existsSync(usagePath)) {
        const data = JSON.parse(fs.readFileSync(usagePath, 'utf8'));
        if (data.date === today) {
          return data;
        }
      }

      return { date: today, count: 0 };
    } catch (error) {
      console.warn('[CacheService] Failed to read AI detection usage:', error.message);
      return { date: new Date().toISOString().split('T')[0], count: 0 };
    }
  }

  /**
   * Increment today's AI detection API call count
   */
  incrementAIDetectionUsage() {
    try {
      const usagePath = path.join(this.cacheDir, 'ai-usage.json');
      const usage = this.getAIDetectionUsage();

      usage.count += 1;
      fs.writeFileSync(usagePath, JSON.stringify(usage, null, 2), 'utf8');
      console.log(`[CacheService] AI detection usage: ${usage.count} calls today`);
      return usage;
    } catch (error) {
      console.warn('[CacheService] Failed to record AI detection usage:', error.message);
      return { date: new Date().toISOString().split('T')[0], count: 0 };
    }
  }

  /**
   * Clear OCR cache (JSON-based)
   */
  async clearOCRCacheJSON() {
    try {
      // Remove all OCR cache files
      try {
        const files = fs.readdirSync(this.ocrCacheDir);
        for (const file of files) {
          if (file.endsWith('.json')) {
            fs.unlinkSync(path.join(this.ocrCacheDir, file));
          }
        }
        console.log(`[CacheService] Cleared ${files.length} OCR cache files`);
      } catch (error) {
        // Directory doesn't exist or is empty
        console.log('[CacheService] OCR cache directory empty or not found');
      }
      
      console.log('[CacheService] OCR cache cleared successfully');
    } catch (error) {
      console.error('[CacheService] Failed to clear OCR cache:', error);
      throw error;
    }
  }

  /**
   * Get cache file path
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
