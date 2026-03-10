import log from 'electron-log';
import path from 'path';
import { app } from 'electron';

/**
 * Centralized logging service for the application
 * Provides file-based logging for production debugging
 */
export default class LoggingService {
  constructor() {
    this.setupLogging();
  }

  setupLogging() {
    // Configure logging paths
    const userDataPath = app.getPath('userData');
    const logsPath = path.join(userDataPath, 'logs');
    
    log.transports.file.level = 'info';
    log.transports.file.maxSize = 5 * 1024 * 1024; // 5MB per file
    log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
    
    // Set log file paths
    log.transports.file.resolvePathFn = (msg, logPath) => {
      const date = new Date().toISOString().split('T')[0];
      return path.join(logsPath, `${date}-${msg.level}.log`);
    };

    // Also log to console in development
    if (!app.isPackaged) {
      log.transports.console.level = 'debug';
    } else {
      log.transports.console.level = 'error'; // Only errors to console in production
    }

    log.info('Logging service initialized');
    log.info(`Application version: ${app.getVersion()}`);
    log.info(`Platform: ${process.platform}`);
    log.info(`Electron version: ${process.versions.electron}`);
    log.info(`Node version: ${process.versions.node}`);
  }

  // Convenience methods
  info(message, ...args) {
    log.info(message, ...args);
  }

  error(message, ...args) {
    log.error(message, ...args);
  }

  warn(message, ...args) {
    log.warn(message, ...args);
  }

  debug(message, ...args) {
    log.debug(message, ...args);
  }

  // Specialized logging methods
  logPDFError(filePath, error, context = {}) {
    const errorInfo = {
      filePath,
      fileName: path.basename(filePath),
      error: error.message,
      stack: error.stack,
      context,
      timestamp: new Date().toISOString(),
      platform: process.platform,
      electronVersion: process.versions.electron
    };

    this.error('PDF Parsing Error:', errorInfo);
    
    // Also log a user-friendly version
    this.error(`Failed to parse PDF: ${path.basename(filePath)} - ${error.message}`);
  }

  logOCRAttempt(filePath, pageCount, attemptNumber) {
    this.info(`OCR Attempt ${attemptNumber} for ${path.basename(filePath)} (${pageCount} pages)`);
  }

  logOCRSuccess(filePath, textLength, quality) {
    this.info(`OCR Success for ${path.basename(filePath)}: ${textLength} chars extracted, quality: ${quality}`);
  }

  logOCRFailure(filePath, error, attemptNumber) {
    this.error(`OCR Attempt ${attemptNumber} failed for ${path.basename(filePath)}: ${error.message}`);
  }

  logAIDetectionAttempt(filePath, textLength) {
    this.info(`AI Detection Attempt for ${path.basename(filePath)}: ${textLength} chars`);
  }

  logAIDetectionSuccess(filePath, amount, confidence) {
    this.info(`AI Detection Success for ${path.basename(filePath)}: ${amount} (confidence: ${confidence})`);
  }

  logAIDetectionFailure(filePath, error) {
    this.error(`AI Detection Failed for ${path.basename(filePath)}: ${error.message}`);
  }

  // Get log file paths for user access
  getLogFiles() {
    const userDataPath = app.getPath('userData');
    const logsPath = path.join(userDataPath, 'logs');
    return logsPath;
  }

  // Export logs for debugging
  async exportLogs() {
    const fs = require('fs').promises;
    const path = require('path');
    const userDataPath = app.getPath('userData');
    const logsPath = path.join(userDataPath, 'logs');
    
    try {
      const files = await fs.readdir(logsPath);
      const logFiles = files.filter(file => file.endsWith('.log'));
      
      let combinedLogs = '';
      for (const file of logFiles.sort()) {
        const filePath = path.join(logsPath, file);
        const content = await fs.readFile(filePath, 'utf8');
        combinedLogs += `\n\n=== ${file} ===\n${content}`;
      }
      
      return combinedLogs;
    } catch (error) {
      this.error('Failed to export logs:', error);
      return '';
    }
  }
}
