import fs from 'fs';
import path from 'path';
import { app } from 'electron';

/**
 * Service to manage extraction cache for specific projects.
 */
export default class DocumentCacheService {
  constructor() {
    this.userDataPath = app.getPath('userData');
    this.cacheDir = path.join(this.userDataPath, 'extraction-cache');
    this.ensureDir();
  }

  ensureDir() {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  getCachePath(projectId) {
    return path.join(this.cacheDir, `cache-${projectId}.json`);
  }

  getCache(projectId) {
    const cachePath = this.getCachePath(projectId);
    if (!fs.existsSync(cachePath)) {
      return {};
    }
    return JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
  }

  saveCache(projectId, cacheData) {
    const cachePath = this.getCachePath(projectId);
    fs.writeFileSync(cachePath, JSON.stringify(cacheData, null, 2));
  }

  /**
   * Checks if a file has a valid successful cache entry.
   * @param {string} projectId 
   * @param {string} filePath 
   * @returns {Object|null} - Cache entry if valid and successful, else null.
   */
  getValidEntry(projectId, filePath) {
    const cache = this.getCache(projectId);
    const entry = cache[filePath];
    if (!entry || entry.status !== 'success') return null;

    try {
      const stats = fs.statSync(filePath);
      if (stats.mtime.getTime() === entry.mtime) {
        return entry;
      }
    } catch (e) {
      // File might not exist anymore
    }
    return null;
  }

  updateEntry(projectId, filePath, data) {
    const cache = this.getCache(projectId);
    const stats = fs.statSync(filePath);
    
    cache[filePath] = {
      ...data,
      mtime: stats.mtime.getTime()
    };
    
    this.saveCache(projectId, cache);
  }

  clearCache(projectId) {
    const cachePath = this.getCachePath(projectId);
    if (fs.existsSync(cachePath)) {
      fs.unlinkSync(cachePath);
    }
  }
}

export { DocumentCacheService };
