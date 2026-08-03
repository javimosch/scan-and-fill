import fs from 'fs';
import path from 'path';
import { app } from 'electron';

/**
 * Settings management service for AI detection and other app settings
 */
export default class SettingsService {
  constructor() {
    this.settingsPath = null;
    this.settings = {
      aiDetection: {
        enabled: false,
        maxPages: 1,
        apiKey: null,
        model: 'openrouter/free',
        dailyCallLimit: 100
      }
    };
    this.initialize();
  }

  /**
   * Initialize settings service
   */
  initialize() {
    const userDataPath = app ? app.getPath('userData') : path.join(process.cwd(), 'data');
    this.settingsPath = path.join(userDataPath, 'settings.json');
    this.loadSettings();
  }

  /**
   * Load settings from file
   */
  loadSettings() {
    try {
      if (fs.existsSync(this.settingsPath)) {
        const data = fs.readFileSync(this.settingsPath, 'utf8');
        const loadedSettings = JSON.parse(data);
        this.settings = { ...this.settings, ...loadedSettings };
        console.log('[SettingsService] Settings loaded successfully');
      } else {
        this.saveSettings(); // Create default settings file
        console.log('[SettingsService] Default settings created');
      }
    } catch (error) {
      console.error('[SettingsService] Failed to load settings:', error);
    }
  }

  /**
   * Save settings to file
   */
  saveSettings() {
    try {
      const dir = path.dirname(this.settingsPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2));
      console.log('[SettingsService] Settings saved successfully');
    } catch (error) {
      console.error('[SettingsService] Failed to save settings:', error);
    }
  }

  /**
   * Get all settings
   */
  getSettings() {
    return { ...this.settings };
  }

  /**
   * Get AI detection settings
   */
  getAIDetectionSettings() {
    return { ...this.settings.aiDetection };
  }

  /**
   * Update AI detection settings
   */
  updateAIDetectionSettings(newSettings) {
    this.settings.aiDetection = { ...this.settings.aiDetection, ...newSettings };
    this.saveSettings();
    return this.getAIDetectionSettings();
  }

  /**
   * Update specific setting
   */
  updateSetting(key, value) {
    const keys = key.split('.');
    let current = this.settings;
    
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    
    current[keys[keys.length - 1]] = value;
    this.saveSettings();
  }

  /**
   * Get specific setting
   */
  getSetting(key) {
    const keys = key.split('.');
    let current = this.settings;
    
    for (const k of keys) {
      if (current && current[k] !== undefined) {
        current = current[k];
      } else {
        return undefined;
      }
    }
    
    return current;
  }

  /**
   * Reset settings to defaults
   */
  resetSettings() {
    this.settings = {
      aiDetection: {
        enabled: false,
        maxPages: 1,
        apiKey: null,
        model: 'openrouter/free',
        dailyCallLimit: 100
      }
    };
    this.saveSettings();
  }
}
