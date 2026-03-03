"use strict";
const electron = require("electron");
const path = require("path");
const url = require("url");
const fs = require("fs");
const os = require("os");
const child_process = require("child_process");
const pdfParse = require("pdf-parse");
const Tesseract = require("tesseract.js");
const crypto = require("crypto");
const ExcelJS = require("exceljs");
const XLSX = require("xlsx");
const icon = path.join(__dirname, "../../resources/icon.png");
class ProjectService {
  constructor() {
    this._projectsFilePath = null;
  }
  get projectsFilePath() {
    if (!this._projectsFilePath) {
      const userDataPath = electron.app.getPath("userData");
      this._projectsFilePath = path.join(userDataPath, "projects.json");
      this.init();
    }
    return this._projectsFilePath;
  }
  init() {
    if (!fs.existsSync(this.projectsFilePath)) {
      fs.writeFileSync(this.projectsFilePath, JSON.stringify({ projects: [] }, null, 2));
    }
  }
  getProjects() {
    const data = fs.readFileSync(this.projectsFilePath, "utf-8");
    return JSON.parse(data).projects;
  }
  saveProject(project) {
    const data = JSON.parse(fs.readFileSync(this.projectsFilePath, "utf-8"));
    const index = data.projects.findIndex((p) => p.id === project.id);
    if (index !== -1) {
      data.projects[index] = { ...data.projects[index], ...project };
    } else {
      data.projects.push(project);
    }
    fs.writeFileSync(this.projectsFilePath, JSON.stringify(data, null, 2));
    return project;
  }
  deleteProject(projectId) {
    const data = JSON.parse(fs.readFileSync(this.projectsFilePath, "utf-8"));
    data.projects = data.projects.filter((p) => p.id !== projectId);
    fs.writeFileSync(this.projectsFilePath, JSON.stringify(data, null, 2));
  }
}
class ScannerService {
  /**
   * Month patterns including abbreviations for English, French, and Spanish.
   */
  static MONTH_RULES = [
    { index: 0, en: ["january", "jan"], fr: ["janvier", "janv"], es: ["enero", "ene"] },
    { index: 1, en: ["february", "feb"], fr: ["fevrier", "février", "fevr", "févr"], es: ["febrero", "feb"] },
    { index: 2, en: ["march", "mar"], fr: ["mars"], es: ["marzo", "mar"] },
    { index: 3, en: ["april", "apr"], fr: ["avril", "avr"], es: ["abril", "abr"] },
    { index: 4, en: ["may"], fr: ["mai"], es: ["mayo"] },
    { index: 5, en: ["june", "jun"], fr: ["juin"], es: ["junio", "jun"] },
    { index: 6, en: ["july", "jul"], fr: ["juillet", "juil"], es: ["julio", "jul"] },
    { index: 7, en: ["august", "aug"], fr: ["aout", "août"], es: ["agosto", "ago"] },
    { index: 8, en: ["september", "sep", "sept"], fr: ["septembre", "sept"], es: ["septiembre", "sep", "sept"] },
    { index: 9, en: ["october", "oct"], fr: ["octobre", "oct"], es: ["octubre", "oct"] },
    { index: 10, en: ["november", "nov"], fr: ["novembre", "nov"], es: ["noviembre", "nov"] },
    { index: 11, en: ["december", "dec"], fr: ["decembre", "décembre", "dec", "déc"], es: ["diciembre", "dic"] }
  ];
  /**
   * Scans the root folder for month directories and category sub-folders.
   * @param {string} rootPath - The root path to scan.
   * @param {Object} categoryMapping - Optional mapping of folder name to category label.
   * @returns {Promise<Object>} - A structured object containing detected files by month and category.
   */
  async scan(rootPath, categoryMapping = {}) {
    if (!fs.existsSync(rootPath)) {
      throw new Error(`Path does not exist: ${rootPath}`);
    }
    const result = {
      projectRoot: rootPath,
      months: {}
    };
    const topLevelFolders = fs.readdirSync(rootPath, { withFileTypes: true }).filter((dirent) => dirent.isDirectory()).map((dirent) => dirent.name);
    for (const folderName of topLevelFolders) {
      const monthInfo = this.identifyMonth(folderName);
      if (monthInfo) {
        if (categoryMapping && categoryMapping.monthFilter) {
          const filterInfo = this.identifyMonth(categoryMapping.monthFilter);
          if (filterInfo && filterInfo.index !== monthInfo.index) {
            continue;
          }
        }
        const monthKey = monthInfo.standardName;
        if (!result.months[monthKey]) {
          result.months[monthKey] = {
            index: monthInfo.index,
            originalName: folderName,
            categories: {}
          };
        }
        const monthPath = path.join(rootPath, folderName);
        const categoryFolders = fs.readdirSync(monthPath, { withFileTypes: true }).filter((dirent) => dirent.isDirectory()).map((dirent) => dirent.name);
        for (const catFolderName of categoryFolders) {
          const categoryName = categoryMapping[catFolderName] || catFolderName;
          const categoryPath = path.join(monthPath, catFolderName);
          const pdfFiles = fs.readdirSync(categoryPath).filter((file) => file.toLowerCase().endsWith(".pdf")).map((file) => path.join(categoryPath, file));
          if (pdfFiles.length > 0) {
            if (!result.months[monthKey].categories[categoryName]) {
              result.months[monthKey].categories[categoryName] = [];
            }
            result.months[monthKey].categories[categoryName].push(...pdfFiles);
          }
        }
      }
    }
    return result;
  }
  /**
   * Identifies if a folder name matches a month in supported languages.
   * @param {string} folderName 
   * @returns {Object|null} - Month metadata.
   */
  identifyMonth(folderName) {
    const normalized = folderName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    for (const rule of ScannerService.MONTH_RULES) {
      const variants = [
        ...rule.en,
        ...rule.fr.map((m) => m.normalize("NFD").replace(/[\u0300-\u036f]/g, "")),
        ...rule.es
      ];
      const regex = new RegExp(`(^|[^a-z])(${variants.join("|")})([^a-z]|$)`, "i");
      if (regex.test(normalized)) {
        return {
          index: rule.index,
          standardName: rule.en[0]
        };
      }
    }
    return null;
  }
}
ScannerService.MONTHS_MAPPING = [
  { en: "january", fr: "janvier", es: "enero" },
  { en: "february", fr: "fevrier", es: "febrero" },
  { en: "march", fr: "mars", es: "marzo" },
  { en: "april", fr: "avril", es: "abril" },
  { en: "may", fr: "mai", es: "mayo" },
  { en: "june", fr: "juin", es: "junio" },
  { en: "july", fr: "juillet", es: "julio" },
  { en: "august", fr: "aout", es: "agosto" },
  { en: "september", fr: "septembre", es: "septiembre" },
  { en: "october", fr: "octobre", es: "octubre" },
  { en: "november", fr: "novembre", es: "noviembre" },
  { en: "december", fr: "decembre", es: "diciembre" }
];
class CacheService {
  constructor() {
    const userDataPath = electron.app ? electron.app.getPath("userData") : path.join(os.tmpdir(), "scan-and-fill-test");
    this.cacheDir = path.join(userDataPath, "pdf-cache");
    this.ocrCacheDir = path.join(this.cacheDir, "ocr");
    this.manualEntriesPath = path.join(this.cacheDir, "manual-entries.json");
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
    return crypto.createHash("sha256").update(buffer).digest("hex");
  }
  /**
   * Get cached OCR result for a PDF
   */
  getOCRCache(filePath) {
    try {
      const hash = this.getFileHash(filePath);
      const cachePath = path.join(this.ocrCacheDir, `${hash}.json`);
      if (fs.existsSync(cachePath)) {
        const data = JSON.parse(fs.readFileSync(cachePath, "utf8"));
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
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        text
      };
      fs.writeFileSync(cachePath, JSON.stringify(data, null, 2), "utf8");
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
        return JSON.parse(fs.readFileSync(this.manualEntriesPath, "utf8"));
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
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      };
      fs.writeFileSync(this.manualEntriesPath, JSON.stringify(entries, null, 2), "utf8");
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
      files.forEach((file) => {
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
      let ocrEntries = 0;
      try {
        const files = fs.readdirSync(this.ocrCacheDir);
        ocrEntries = files.filter((file) => file.endsWith(".json")).length;
      } catch (error) {
        ocrEntries = 0;
      }
      let manualEntries = 0;
      try {
        if (fs.existsSync(this.manualEntriesPath)) {
          const manualData = JSON.parse(fs.readFileSync(this.manualEntriesPath, "utf8"));
          manualEntries = Object.keys(manualData).length;
        }
      } catch (error) {
        manualEntries = 0;
      }
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
        lastUpdated: (/* @__PURE__ */ new Date()).toISOString()
      };
    } catch (error) {
      return {
        ocrEntries: 0,
        manualEntries: 0,
        totalEntries: 0,
        totalSize: "0 KB",
        lastUpdated: null
      };
    }
  }
  /**
   * Clear OCR cache (JSON-based)
   */
  async clearOCRCacheJSON() {
    try {
      try {
        const files = fs.readdirSync(this.ocrCacheDir);
        for (const file of files) {
          if (file.endsWith(".json")) {
            fs.unlinkSync(path.join(this.ocrCacheDir, file));
          }
        }
        console.log(`[CacheService] Cleared ${files.length} OCR cache files`);
      } catch (error) {
        console.log("[CacheService] OCR cache directory empty or not found");
      }
      console.log("[CacheService] OCR cache cleared successfully");
    } catch (error) {
      console.error("[CacheService] Failed to clear OCR cache:", error);
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
class AIDetectionService {
  constructor() {
    this.isEnabled = false;
    this.maxPages = 1;
    this.apiKey = null;
    this.model = "openrouter/free";
    this.settingsPath = null;
  }
  /**
   * Initialize AI detection service with settings
   */
  initialize(settings = {}) {
    this.isEnabled = settings.enabled || false;
    this.maxPages = settings.maxPages || 1;
    this.apiKey = settings.apiKey || null;
    this.model = settings.model || "openrouter/free";
  }
  /**
   * Check if AI detection should be used for fallback
   */
  shouldUseFallback(status, pageCount) {
    return this.isEnabled && (status === "failed" || status === "ambiguous") && pageCount <= this.maxPages;
  }
  /**
   * Extract amount from PDF text using AI
   */
  async extractAmountFromText(text, pdfContext = {}) {
    if (!this.isEnabled) {
      throw new Error("AI detection is disabled");
    }
    try {
      console.log("[AIDetectionService] Text length for AI analysis:", text.length);
      console.log("[AIDetectionService] Text sample:", text.substring(0, 200) + (text.length > 200 ? "..." : ""));
      const quality = this.assessTextQuality(text);
      console.log("[AIDetectionService] Text quality assessment:", quality);
      if (!quality.isAcceptable) {
        console.warn("[AIDetectionService] Text quality is too poor for AI analysis");
        const suggestions = [];
        if (quality.wordCount < 2) suggestions.push("Document may need to be scanned at higher resolution");
        if (!quality.hasNumbers) suggestions.push("Document may not contain visible amounts");
        if (!quality.hasCurrency) suggestions.push("Currency symbols may not be present or visible");
        return {
          status: "failed",
          amount: 0,
          candidates: [],
          message: `Text quality too poor for AI analysis (${quality.wordCount} meaningful words detected). ${suggestions.length > 0 ? "Suggestions: " + suggestions.join(", ") : ""}`
        };
      }
      const prompt = this.buildPrompt(text, pdfContext);
      const response = await this.callOpenRouterWithRetry(prompt);
      console.log("[AIDetectionService] Raw AI response:", response);
      if (!response || response.trim().length === 0) {
        console.warn("[AIDetectionService] AI returned empty response");
        return {
          status: "failed",
          amount: 0,
          candidates: [],
          message: "AI returned empty response - text may be too poor quality for analysis"
        };
      }
      return this.parseResponse(response);
    } catch (error) {
      console.error("[AIDetectionService] AI detection failed:", error);
      throw new Error(`AI detection failed: ${error.message}`);
    }
  }
  /**
   * Call OpenRouter API with retry logic
   */
  async callOpenRouterWithRetry(prompt, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[AIDetectionService] API attempt ${attempt}/${maxRetries}`);
        return await this.callOpenRouter(prompt);
      } catch (error) {
        console.warn(`[AIDetectionService] API attempt ${attempt} failed:`, error.message);
        if (attempt === maxRetries) {
          throw error;
        }
        const delay = Math.pow(2, attempt - 1) * 1e3;
        console.log(`[AIDetectionService] Waiting ${delay}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  /**
   * Assess text quality to determine if it's suitable for AI analysis
   */
  assessTextQuality(text) {
    const meaningfulWords = text.split(/\s+/).filter((word) => word.length > 2);
    const wordCount = meaningfulWords.length;
    const hasNumbers = /\d/.test(text);
    const hasCurrency = /[€$£]/.test(text);
    const hasAmountPattern = /\d+[.,]\d+/.test(text);
    const charCount = text.replace(/\s+/g, "").length;
    let score = 0;
    score += wordCount * 2;
    score += hasNumbers ? 5 : 0;
    score += hasCurrency ? 10 : 0;
    score += hasAmountPattern ? 15 : 0;
    score += charCount > 50 ? 5 : 0;
    return {
      score,
      wordCount,
      hasNumbers,
      hasCurrency,
      hasAmountPattern,
      charCount,
      isAcceptable: score >= 10 || wordCount >= 2 && hasNumbers
    };
  }
  /**
   * Build prompt for OpenRouter API
   */
  buildPrompt(text, context) {
    return `Amount from: ${text.substring(0, 200)}
Format: AMOUNT: €123.45 or AMOUNT: NOT_FOUND`;
  }
  /**
   * Call OpenRouter API
   */
  async callOpenRouter(prompt) {
    const apiKey = this.apiKey || process.env.OPENROUTER_API_KEY;
    const isFreeModel = this.model.includes("free");
    console.log("[AIDetectionService] API call details:", {
      model: this.model,
      isFreeModel,
      hasApiKey: !!apiKey,
      promptLength: prompt.length
    });
    const headers = {
      "Content-Type": "application/json"
    };
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
      headers["HTTP-Referer"] = "https://scan-and-fill.app";
      headers["X-Title"] = "Scan and Fill AI Detection";
    }
    const maxTokens = isFreeModel ? 15 : 30;
    console.log("[AIDetectionService] Using max_tokens:", maxTokens);
    const requestBody = {
      model: this.model,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.1,
      max_tokens: maxTokens
    };
    console.log("[AIDetectionService] Request body:", JSON.stringify(requestBody, null, 2));
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody)
    });
    console.log("[AIDetectionService] API response status:", response.status);
    console.log("[AIDetectionService] API response headers:", Object.fromEntries(response.headers.entries()));
    if (!response.ok) {
      const error = await response.text();
      console.error("[AIDetectionService] API error response:", error);
      throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }
    const data = await response.json();
    console.log("[AIDetectionService] API response data:", JSON.stringify(data, null, 2));
    if (!data.choices || data.choices.length === 0) {
      console.error("[AIDetectionService] No choices in API response:", data);
      throw new Error("No response from OpenRouter API");
    }
    const content = data.choices[0].message.content;
    console.log("[AIDetectionService] Extracted content:", `"${content}"`);
    return content.trim();
  }
  /**
   * Parse AI response to extract amount
   */
  parseResponse(response) {
    const cleaned = response.trim();
    console.log("[AIDetectionService] Parsing AI response:", cleaned);
    if (cleaned === "AMOUNT: NOT_FOUND" || cleaned.toLowerCase().includes("not_found")) {
      return { status: "failed", amount: 0, candidates: [], message: "AI could not find amount" };
    }
    const patterns = [
      // Structured format: AMOUNT: €123.45
      /AMOUNT:\s*([$€£]\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/i,
      // Structured format: AMOUNT: 123.45€
      /AMOUNT:\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?\s*[$€£])/i,
      // Original format: €123.45
      /([$€£]\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/i,
      // Original format: 123.45€
      /(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?\s*[$€£])/i,
      // Just numbers as fallback
      /(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/i
    ];
    for (const pattern of patterns) {
      const match = cleaned.match(pattern);
      if (match) {
        const amountStr = match[1];
        console.log("[AIDetectionService] Regex matched pattern:", pattern.toString());
        console.log("[AIDetectionService] Extracted amount string:", amountStr);
        const numericAmount = this.parseAmountString(amountStr);
        if (numericAmount > 0) {
          return {
            status: "success",
            amount: numericAmount,
            candidates: [numericAmount],
            message: `AI detected amount: ${amountStr}`
          };
        }
      }
    }
    console.log("[AIDetectionService] No regex patterns matched");
    return { status: "failed", amount: 0, candidates: [], message: "AI response format invalid" };
  }
  /**
   * Parse amount string to number
   */
  parseAmountString(amountStr) {
    const cleaned = amountStr.replace(/[$€£\s]/g, "");
    const normalized = cleaned.replace(/,/g, ".");
    const amount = parseFloat(normalized);
    return isNaN(amount) ? 0 : amount;
  }
  /**
   * Get current settings
   */
  getSettings() {
    return {
      enabled: this.isEnabled,
      maxPages: this.maxPages,
      apiKey: this.apiKey ? "***configured***" : null,
      model: this.model
    };
  }
  /**
   * Update settings
   */
  updateSettings(newSettings) {
    this.initialize(newSettings);
  }
}
class SettingsService {
  constructor() {
    this.settingsPath = null;
    this.settings = {
      aiDetection: {
        enabled: false,
        maxPages: 1,
        apiKey: null,
        model: "openrouter/free"
      }
    };
    this.initialize();
  }
  /**
   * Initialize settings service
   */
  initialize() {
    const userDataPath = electron.app ? electron.app.getPath("userData") : path.join(process.cwd(), "data");
    this.settingsPath = path.join(userDataPath, "settings.json");
    this.loadSettings();
  }
  /**
   * Load settings from file
   */
  loadSettings() {
    try {
      if (fs.existsSync(this.settingsPath)) {
        const data = fs.readFileSync(this.settingsPath, "utf8");
        const loadedSettings = JSON.parse(data);
        this.settings = { ...this.settings, ...loadedSettings };
        console.log("[SettingsService] Settings loaded successfully");
      } else {
        this.saveSettings();
        console.log("[SettingsService] Default settings created");
      }
    } catch (error) {
      console.error("[SettingsService] Failed to load settings:", error);
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
      console.log("[SettingsService] Settings saved successfully");
    } catch (error) {
      console.error("[SettingsService] Failed to save settings:", error);
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
    const keys = key.split(".");
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
    const keys = key.split(".");
    let current = this.settings;
    for (const k of keys) {
      if (current && current[k] !== void 0) {
        current = current[k];
      } else {
        return void 0;
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
        model: "openrouter/free"
      }
    };
    this.saveSettings();
  }
}
class ParserService {
  constructor() {
    this._cache = null;
    this._aiDetection = new AIDetectionService();
    this._settings = new SettingsService();
  }
  // Lazy-initialize cache to avoid accessing electron.app before it's ready
  get cache() {
    if (!this._cache) {
      this._cache = new CacheService();
    }
    return this._cache;
  }
  /**
   * Extracts the total amount from a PDF file.
   * @param {string} filePath - Path to the PDF file.
   * @param {Object} options - Configuration for extraction patterns.
   * @returns {Promise<Object>} - The extraction result object.
   */
  async extractAmount(filePath, options = {}) {
    let parser = null;
    try {
      const dataBuffer = fs.readFileSync(filePath);
      parser = new pdfParse.PDFParse({ data: dataBuffer });
      const data = await parser.getText();
      let text = data.text;
      if (!text || text.trim().length < 50) {
        console.log(`[ParserService] Normal extraction failed (text length: ${text?.length || 0}). Triggering OCR for AI analysis...`);
        text = await this.performOCR(filePath);
      }
      let result = this.findAmountInText(text, options.pattern);
      if (this._aiDetection.shouldUseFallback(result.status, this.getPageCount(filePath))) {
        console.log(`[ParserService] OCR result: ${result.status}. Triggering AI detection fallback...`);
        try {
          const aiSettings = this._settings.getAIDetectionSettings();
          this._aiDetection.initialize(aiSettings);
          const pdfContext = {
            fileName: path.basename(filePath),
            pageCount: this.getPageCount(filePath)
          };
          const aiResult = await this._aiDetection.extractAmountFromText(text, pdfContext);
          if (aiResult.status === "success") {
            console.log(`[ParserService] AI detection successful: ${aiResult.amount}`);
            return {
              ...aiResult,
              method: "ai",
              fallback: true,
              originalResult: result
            };
          } else {
            console.log(`[ParserService] AI detection failed: ${aiResult.message}`);
            return {
              ...result,
              method: "ocr",
              fallbackAttempted: true,
              fallbackError: aiResult.message
            };
          }
        } catch (aiError) {
          console.error(`[ParserService] AI detection error:`, aiError);
          return {
            ...result,
            method: "ocr",
            fallbackAttempted: true,
            fallbackError: aiError.message
          };
        }
      }
      return {
        ...result,
        method: "ocr",
        fallbackAttempted: false
      };
    } catch (error) {
      console.error(`Error parsing PDF ${filePath}:`, error);
      return { status: "failed", amount: 0, candidates: [], message: error.message };
    } finally {
      if (parser) {
        await parser.destroy();
      }
    }
  }
  /**
   * Performs OCR on the PDF by converting pages to images first.
   * Checks cache first to avoid re-processing.
   */
  async performOCR(filePath) {
    const cachedText = this.cache.getOCRCache(filePath);
    if (cachedText) {
      console.log(`[ParserService] Using cached OCR result (${cachedText.length} characters)`);
      return cachedText;
    }
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ocr-"));
    try {
      const baseName = path.basename(filePath, ".pdf");
      const outputPrefix = path.join(tempDir, "page");
      console.log(`[ParserService] Converting PDF to images in ${tempDir}...`);
      let pdftoppmCommand;
      if (process.platform === "win32") {
        const isDev = !electron.app.isPackaged;
        const popplerPath = isDev ? path.join(process.cwd(), "build", "poppler-windows", "poppler-25.12.0", "Library", "bin", "pdftoppm.exe") : path.join(process.resourcesPath, "poppler-windows", "poppler-25.12.0", "Library", "bin", "pdftoppm.exe");
        if (!fs.existsSync(popplerPath)) {
          throw new Error(`Poppler binary not found at ${popplerPath}. Please ensure poppler-windows is properly bundled.`);
        }
        console.log(`[ParserService] Using poppler binary: ${popplerPath}`);
        pdftoppmCommand = `"${popplerPath}"`;
      } else {
        pdftoppmCommand = "pdftoppm";
      }
      child_process.execSync(`${pdftoppmCommand} -png -r 600 "${filePath}" "${outputPrefix}"`);
      const files = fs.readdirSync(tempDir).filter((f) => f.startsWith("page") && f.endsWith(".png")).sort();
      let fullText = "";
      console.log(`[ParserService] Running Tesseract OCR on ${files.length} pages...`);
      for (const file of files) {
        const imagePath = path.join(tempDir, file);
        console.log(`[ParserService] Processing OCR for ${file}...`);
        let bestText = "";
        let bestQuality = 0;
        const ocrConfigs = [
          {
            name: "enhanced_french",
            languages: "fra+eng",
            config: {
              tessedit_ocr_engine_mode: 3,
              tessedit_pageseg_mode: 6,
              preserve_interword_spaces: "1",
              tessedit_char_whitelist: "0123456789.,€$£ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzàâäéèêëïîôöùûüÿç"
            }
          },
          {
            name: "standard_french",
            languages: "fra+eng",
            config: {
              tessedit_ocr_engine_mode: 3,
              tessedit_pageseg_mode: 3,
              preserve_interword_spaces: "1"
            }
          },
          {
            name: "auto_layout",
            languages: "fra+eng",
            config: {
              tessedit_ocr_engine_mode: 3,
              tessedit_pageseg_mode: 1,
              preserve_interword_spaces: "1"
            }
          },
          {
            name: "basic_french",
            languages: "fra+eng",
            config: {
              tessedit_ocr_engine_mode: 1,
              tessedit_pageseg_mode: 6
            }
          }
        ];
        for (const ocrConfig of ocrConfigs) {
          try {
            console.log(`[ParserService] Trying OCR config: ${ocrConfig.name}`);
            const { data: { text: ocrText } } = await Tesseract.recognize(
              imagePath,
              ocrConfig.languages,
              {
                logger: () => {
                },
                // Reduce log noise during multiple attempts
                ...ocrConfig.config
              }
            );
            const quality2 = this.assessOCRQuality(ocrText);
            console.log(`[ParserService] OCR config ${ocrConfig.name}: quality=${quality2.score}, words=${quality2.wordCount}, text="${ocrText.substring(0, 50)}${ocrText.length > 50 ? "..." : ""}"`);
            if (quality2.score > bestQuality) {
              bestQuality = quality2.score;
              bestText = ocrText;
            }
          } catch (ocrError) {
            console.warn(`[ParserService] OCR config ${ocrConfig.name} failed:`, ocrError.message);
          }
        }
        console.log(`[ParserService] Best OCR result for ${file}: "${bestText.substring(0, 100)}${bestText.length > 100 ? "..." : ""}" (${bestText.length} chars, quality=${bestQuality})`);
        fullText += bestText + "\n";
      }
      console.log(`[ParserService] OCR completed. Extracted ${fullText.length} characters.`);
      const quality = this.assessOCRQuality(fullText);
      console.log(`[ParserService] OCR quality assessment: score=${quality.score}, words=${quality.wordCount}, hasNumbers=${quality.hasNumbers}, hasCurrency=${quality.hasCurrency}, hasAmountPattern=${quality.hasAmountPattern}`);
      if (!quality.isAcceptable) {
        console.warn("[ParserService] OCR quality is poor - text may not be suitable for AI analysis");
        console.warn("[ParserService] OCR text sample:", fullText.replace(/\s+/g, " ").trim().substring(0, 200));
        const suggestions = [];
        if (quality.wordCount < 2) suggestions.push("Try scanning at higher resolution");
        if (!quality.hasNumbers) suggestions.push("Ensure the document contains visible numbers");
        if (!quality.hasCurrency) suggestions.push("Check if currency symbols are present");
        console.warn("[ParserService] Suggestions:", suggestions.join(", "));
      }
      this.cache.setOCRCache(filePath, fullText);
      return fullText;
    } catch (error) {
      console.error("[ParserService] OCR failed:", error);
      throw new Error(`OCR failed: ${error.message}`);
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (e) {
        console.warn(`[ParserService] Failed to cleanup temp dir ${tempDir}:`, e.message);
      }
    }
  }
  /**
   * Extract full text from PDF for AI analysis
   */
  async extractFullText(filePath) {
    try {
      const dataBuffer = fs.readFileSync(filePath);
      const parser = new pdfParse.PDFParse({ data: dataBuffer });
      const data = await parser.getText();
      let text = data.text;
      if (!text || text.trim().length < 50) {
        console.log(`[ParserService] Normal extraction failed (text length: ${text?.length || 0}). Triggering OCR for AI analysis...`);
        text = await this.performOCR(filePath);
      }
      console.log(`[ParserService] Extracted ${text.length} characters for AI analysis`);
      return text;
    } catch (error) {
      console.error("[ParserService] Failed to extract text for AI analysis:", error);
      throw new Error(`Text extraction failed: ${error.message}`);
    }
  }
  /**
   * Manual AI analysis for conflict resolution
   */
  async manualAIAnalysis(text, pdfContext, aiSettings) {
    try {
      this._aiDetection.initialize(aiSettings);
      const result = await this._aiDetection.extractAmountFromText(text, pdfContext);
      return {
        ...result,
        method: "ai",
        manual: true,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      };
    } catch (error) {
      console.error("[ParserService] Manual AI analysis failed:", error);
      throw error;
    }
  }
  /**
   * Assess OCR quality to determine if text is suitable for AI analysis
   */
  assessOCRQuality(text) {
    const meaningfulWords = text.split(/\s+/).filter((word) => word.length > 2);
    const wordCount = meaningfulWords.length;
    const hasNumbers = /\d/.test(text);
    const hasCurrency = /[€$£]/.test(text);
    const hasAmountPattern = /\d+[.,]\d+/.test(text);
    const charCount = text.replace(/\s+/g, "").length;
    let score = 0;
    score += wordCount * 2;
    score += hasNumbers ? 5 : 0;
    score += hasCurrency ? 10 : 0;
    score += hasAmountPattern ? 15 : 0;
    score += charCount > 50 ? 5 : 0;
    return {
      score,
      wordCount,
      hasNumbers,
      hasCurrency,
      hasAmountPattern,
      charCount,
      isAcceptable: score >= 10 || wordCount >= 2 && hasNumbers
    };
  }
  /**
   * Get page count from PDF
   */
  getPageCount(filePath) {
    try {
      const stats = fs.statSync(filePath);
      const sizeInMB = stats.size / (1024 * 1024);
      return Math.max(1, Math.ceil(sizeInMB));
    } catch (error) {
      console.warn(`[ParserService] Could not estimate page count: ${error.message}`);
      return 1;
    }
  }
  /**
   * Logic to find the amount in extracted text.
   * Returns candidates and a status.
   * @param {string} text 
   * @param {string} customPattern - Optional regex pattern.
   * @returns {Object}
   */
  findAmountInText(text, customPattern) {
    if (customPattern) {
      const regex = new RegExp(customPattern, "i");
      const match = text.match(regex);
      if (match && match[1]) {
        const amount = parseFloat(match[1].replace(",", "."));
        return { status: "success", amount, candidates: [{ amount, context: match[0] }] };
      }
    }
    const lines = text.split("\n");
    const supremeKeywords = [
      "total ttc",
      "ttc",
      "net a payer",
      "net à payer",
      "total à payer",
      "total a payer",
      "net à régler",
      "net a régler",
      "à payer",
      "a payer",
      "total à régler",
      "total a régler",
      "net a payer en €",
      "net à payer en €",
      "montant ttc",
      "total eur ttc",
      "total eur",
      "a votre debit",
      "total net a payer",
      "total net ttc",
      "net a payer ttc",
      "net a payer ttc en euros",
      "net à payer ttc en euros"
    ];
    const strongKeywords = [
      "total due",
      "amount due",
      "balance due",
      "total facturado",
      "total factura",
      "total general",
      "amount",
      "montant",
      "importe",
      "sum",
      "total:",
      "payer",
      "regler"
    ];
    const secondaryKeywords = [
      "total ht",
      "net ht",
      "hors taxe",
      "total net ht",
      "ht",
      "total ht net",
      "total marchandise"
    ];
    const genericKeywords = [
      "total",
      "net"
    ];
    const subtotalKeywords = [...secondaryKeywords];
    const ignoreWords = [
      "poids",
      "weight",
      "kg",
      "volume",
      "qty",
      "quantité",
      "quantity",
      "qte",
      "quantite",
      "articles",
      "items",
      "unité",
      "unités",
      "indemnité",
      "pénalité",
      "intérêt",
      "intérêts",
      "penalite",
      "indemnite",
      "interet",
      "iban",
      "siret",
      "siren",
      "ean",
      "bic",
      "swift",
      "rib",
      "account",
      "compte",
      "no.",
      "ref",
      "colis",
      "nb colis",
      "livraison",
      "capital",
      "social",
      "société",
      "page",
      "of",
      "sur",
      "bord",
      "bordereau",
      "commande",
      "réf",
      "noël",
      "noel",
      "échéance",
      "echeance",
      "escompte",
      "remise",
      "p.u.",
      "taux",
      "tva",
      "tél",
      "tel",
      "route",
      "rue",
      "avenue",
      "adresse"
    ];
    const candidates = [];
    const currencySymbols = ["€", "$", "£", "chf"];
    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i].toLowerCase();
      const canonicalLine = rawLine.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\s\.]/g, "");
      let tier = 0;
      const check = (k) => {
        const canonicalK = k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\s\.]/g, "");
        return canonicalLine.includes(canonicalK);
      };
      if (supremeKeywords.some(check)) tier = 3;
      else if (strongKeywords.some(check)) tier = 2;
      else if (secondaryKeywords.some(check)) tier = 1;
      else if (genericKeywords.some(check)) tier = 1;
      if (tier > 1 && subtotalKeywords.some(check)) {
        tier = 1;
      }
      if (tier > 0) {
        if (ignoreWords.some((w) => rawLine.includes(w))) continue;
        const linesToScan = [lines[i]];
        let lookahead = 0;
        if (tier === 3) lookahead = 20;
        else if (tier === 2) lookahead = 5;
        else lookahead = 1;
        for (let j = 1; j <= lookahead; j++) {
          if (i + j < lines.length) linesToScan.push(lines[i + j]);
        }
        linesToScan.forEach((scanLine, idx) => {
          if (ignoreWords.some((w) => scanLine.toLowerCase().includes(w))) {
            return;
          }
          const isSameLine = idx === 0;
          const found = this.extractAllNumbersWithContext(scanLine);
          found.forEach((c) => {
            c.tier = tier;
            const ctxLower = c.context.toLowerCase();
            let priority = 1;
            if (currencySymbols.some((s) => ctxLower.includes(s))) priority = 2;
            if (isSameLine) priority += 2;
            c.priority = priority;
          });
          candidates.push(...found);
        });
      }
    }
    if (candidates.length === 0) {
      const allNumbers2 = this.extractAllNumbersWithContext(text);
      if (allNumbers2.length > 0) {
        allNumbers2.forEach((c) => {
          c.tier = 0;
          c.priority = 1;
        });
        return { status: "ambiguous", amount: 0, candidates: allNumbers2.slice(-5) };
      }
      return { status: "failed", amount: 0, candidates: [] };
    }
    const maxTier = Math.max(...candidates.map((c) => c.tier || 0));
    let filtered = candidates.filter((c) => c.tier === maxTier);
    const candidatesMap = /* @__PURE__ */ new Map();
    filtered.forEach((c) => {
      const existing = candidatesMap.get(c.amount);
      if (!existing || (c.priority || 0) > (existing.priority || 0)) {
        candidatesMap.set(c.amount, c);
      }
    });
    const uniqueCandidates = Array.from(candidatesMap.values());
    if (uniqueCandidates.length === 1) {
      return { status: "success", amount: uniqueCandidates[0].amount, candidates: uniqueCandidates };
    } else if (uniqueCandidates.length > 1) {
      const highPriority = uniqueCandidates.filter((c) => c.priority === 2);
      const pool = highPriority.length > 0 ? highPriority : uniqueCandidates;
      if (pool.length === 1) {
        return { status: "success", amount: pool[0].amount, candidates: pool };
      }
      const maxPriority = Math.max(...pool.map((c) => c.priority || 0));
      const bestPool = pool.filter((c) => c.priority === maxPriority);
      if (bestPool.length === 1) {
        return { status: "success", amount: bestPool[0].amount, candidates: bestPool };
      }
      const sorted = [...bestPool].sort((a, b) => b.amount - a.amount);
      if (sorted.length >= 3) {
        const sumOfothers = sorted[1].amount + sorted[2].amount;
        if (Math.abs(sorted[0].amount - sumOfothers) < 0.05) {
          return { status: "success", amount: sorted[0].amount, candidates: [sorted[0]] };
        }
      }
      if (sorted.length > 1 && sorted[0].amount > 10 && sorted[sorted.length - 1].amount < 5) {
        const significantPool = bestPool.filter((c) => c.amount >= 5);
        if (significantPool.length === 1) {
          return { status: "success", amount: significantPool[0].amount, candidates: significantPool };
        }
      }
      if (bestPool.length <= 2 && sorted[0].amount > sorted[1].amount * 1.5 && sorted[0].amount < sorted[1].amount * 10) {
        return { status: "success", amount: sorted[0].amount, candidates: sorted };
      }
      return { status: "ambiguous", amount: 0, candidates: uniqueCandidates };
    }
    const allNumbers = this.extractAllNumbersWithContext(text);
    if (allNumbers.length > 0) {
      return { status: "ambiguous", amount: 0, candidates: allNumbers.slice(-5) };
    }
    return { status: "failed", amount: 0, candidates: [] };
  }
  extractAllNumbersWithContext(text) {
    const regex = /(\d+(?:[\s\.]\d{3})*(?:[\.,]\d{1,2})?)/g;
    const results = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
      const rawMatch = match[1];
      const endChar = text[match.index + rawMatch.length];
      const prevChar = text[match.index - 1];
      if (/[a-zA-Z\-]/.test(prevChar || "") || /[a-zA-Z\-]/.test(endChar || "")) {
        continue;
      }
      const startIdx = Math.max(0, match.index - 30);
      const endIdx = Math.min(text.length, match.index + rawMatch.length + 30);
      const fullContext = text.substring(startIdx, endIdx).toLowerCase();
      const identifierKeywords = ["iban", "siret", "siren", "ean", "bic", "swift", "rib", "compte", "account", "ref", "n°", "page", "of", "sur", "bord", "commande", "réf"];
      if (identifierKeywords.some((k) => fullContext.includes(k))) {
        continue;
      }
      if (/(\d+)\s*[/]\s*\d+/.test(fullContext) || /--\s*\d+\s*--/.test(fullContext)) {
        continue;
      }
      if (/202[0-9]/.test(rawMatch) && !rawMatch.includes(",") && !rawMatch.includes(".")) {
        continue;
      }
      if (/0[1-9](\s?\d{2}){4}/.test(fullContext) || /tél|tel|phone/.test(fullContext)) {
        continue;
      }
      if (/\b\d{5}\b/.test(rawMatch) && rawMatch.length === 5 && !rawMatch.includes(".") && !rawMatch.includes(",")) {
        continue;
      }
      if (rawMatch.replace(/[\s\.]/g, "").length > 12) {
        continue;
      }
      if (text[match.index + rawMatch.length] === "%" || fullContext.includes("%")) {
        continue;
      }
      const isDatePart = /\d+\/\d+/.test(fullContext) || /\/\d+/.test(fullContext);
      if (isDatePart && rawMatch.length <= 4) {
        continue;
      }
      let raw = rawMatch.replace(/\s/g, "");
      if (raw.includes(".") && raw.includes(",")) {
        raw = raw.replace(/\./g, "").replace(",", ".");
      } else if (raw.includes(",")) {
        raw = raw.replace(",", ".");
      }
      const amount = parseFloat(raw);
      if (amount > 0.01 && amount < 1e6 && !isNaN(amount)) {
        const start = Math.max(0, match.index - 50);
        const end = Math.min(text.length, match.index + rawMatch.length + 50);
        const context = text.substring(start, end).replace(/\n/g, " ").replace(/\s+/g, " ").trim();
        results.push({
          amount,
          context: `...${context}...`,
          fullContext: {
            fullContext: text,
            matchIndex: match.index,
            matchLength: rawMatch.length
          }
        });
      }
    }
    return results;
  }
}
class ExcelService {
  isODS(filePath) {
    return filePath.toLowerCase().endsWith(".ods");
  }
  /**
   * Updates a spreadsheet sheet with the extracted totals.
   */
  async updateSheet(filePath, sheetName, mapping, data) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    if (this.isODS(filePath)) {
      return this.updateODS(filePath, sheetName, mapping, data);
    } else {
      return this.updateXLSX(filePath, sheetName, mapping, data);
    }
  }
  async updateXLSX(filePath, sheetName, mapping, data) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.getWorksheet(sheetName);
    if (!worksheet) {
      throw new Error(`Worksheet not found: ${sheetName}`);
    }
    const { monthStartCell, categoryColumn, categoryRows } = mapping;
    const startCell = worksheet.getCell(monthStartCell);
    const startCol = startCell.col;
    const baseMonthValue = startCell.value ? startCell.value.toString() : "";
    const scanner = new ScannerService();
    const baseMonthInfo = scanner.identifyMonth(baseMonthValue);
    const baseMonthIdx = baseMonthInfo ? baseMonthInfo.index : 0;
    for (const [monthName, categories] of Object.entries(data)) {
      const monthInfo = scanner.identifyMonth(monthName);
      if (!monthInfo) continue;
      const currentMonthIdx = monthInfo.index;
      const colOffset = currentMonthIdx - baseMonthIdx;
      const col = startCol + colOffset;
      for (const [categoryName, total] of Object.entries(categories)) {
        const row = categoryRows[categoryName];
        if (row) {
          const cell = worksheet.getRow(row).getCell(col);
          cell.value = total;
          cell.numFmt = "#,##0.00";
        }
      }
    }
    await workbook.xlsx.writeFile(filePath);
  }
  async updateODS(filePath, sheetName, mapping, data) {
    const workbook = XLSX.readFile(filePath, { cellStyles: true, cellNF: true, cellDates: true });
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      throw new Error(`Worksheet not found: ${sheetName}`);
    }
    const { monthStartCell, categoryColumn, categoryRows } = mapping;
    const start = XLSX.utils.decode_cell(monthStartCell);
    const startCol = start.c;
    const startRow = start.r;
    const startCellAddr = XLSX.utils.encode_cell({ r: startRow, c: startCol });
    const baseMonthValue = worksheet[startCellAddr] ? worksheet[startCellAddr].v.toString() : "";
    const scanner = new ScannerService();
    const baseMonthInfo = scanner.identifyMonth(baseMonthValue);
    const baseMonthIdx = baseMonthInfo ? baseMonthInfo.index : 0;
    for (const [monthName, categories] of Object.entries(data)) {
      const monthInfo = scanner.identifyMonth(monthName);
      if (!monthInfo) continue;
      const currentMonthIdx = monthInfo.index;
      const colOffset = currentMonthIdx - baseMonthIdx;
      const col = startCol + colOffset;
      for (const [categoryName, total] of Object.entries(categories)) {
        const row = categoryRows[categoryName];
        if (row) {
          const addr = XLSX.utils.encode_cell({ r: row - 1, c: col });
          worksheet[addr] = { v: total, t: "n", z: "#,##0.00" };
        }
      }
    }
    XLSX.writeFile(workbook, filePath);
  }
  /**
   * Gets comprehensive metadata from an Excel or ODS file.
   */
  async getMetadata(filePath, sheetName, categoryColumn = "A", monthStartCell = "B1") {
    if (!fs.existsSync(filePath)) return { tabs: [], categories: {}, months: [] };
    if (this.isODS(filePath)) {
      return this.getODSMetadata(filePath, sheetName, categoryColumn, monthStartCell);
    } else {
      return this.getXLSXMetadata(filePath, sheetName, categoryColumn, monthStartCell);
    }
  }
  async getXLSXMetadata(filePath, sheetName, categoryColumn, monthStartCell) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const tabs = workbook.worksheets.map((ws) => ws.name);
    const worksheet = workbook.getWorksheet(sheetName) || workbook.worksheets[0];
    if (!worksheet) return { tabs, categories: {}, months: [] };
    const categories = {};
    if (categoryColumn) {
      worksheet.eachRow((row, rowNumber) => {
        try {
          const cell = row.getCell(categoryColumn);
          const value = cell.value;
          if (value && typeof value === "string") {
            const label = value.trim();
            categories[label] = {
              row: rowNumber,
              address: cell.address
            };
          }
        } catch (e) {
        }
      });
    }
    const months = [];
    const scanner = new ScannerService();
    try {
      const startCell = worksheet.getCell(monthStartCell);
      const startCol = startCell.col;
      const startRow = startCell.row;
      for (let i = 0; i < 12; i++) {
        const cell = worksheet.getRow(startRow).getCell(startCol + i);
        const val = cell.value ? cell.value.toString() : "";
        const monthInfo = scanner.identifyMonth(val);
        if (monthInfo) {
          months.push({
            label: val,
            month: monthInfo.standardName,
            address: cell.address
          });
        }
      }
    } catch (e) {
    }
    return { tabs, categories, months };
  }
  async getODSMetadata(filePath, sheetName, categoryColumn, monthStartCell) {
    const workbook = XLSX.readFile(filePath, { cellStyles: true, cellNF: true, cellDates: true });
    const tabs = workbook.SheetNames;
    const worksheet = workbook.Sheets[sheetName] || workbook.Sheets[tabs[0]];
    if (!worksheet) return { tabs, categories: {}, months: [] };
    const categories = {};
    if (categoryColumn) {
      const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1:A1");
      for (let r = range.s.r; r <= range.e.r; r++) {
        const addr = categoryColumn + (r + 1);
        const cell = worksheet[addr];
        if (cell && cell.v && typeof cell.v === "string") {
          const label = cell.v.trim();
          categories[label] = {
            row: r + 1,
            address: addr
          };
        }
      }
    }
    const months = [];
    const scanner = new ScannerService();
    try {
      const start = XLSX.utils.decode_cell(monthStartCell);
      for (let i = 0; i < 12; i++) {
        const addr = XLSX.utils.encode_cell({ r: start.r, c: start.c + i });
        const cell = worksheet[addr];
        const val = cell && cell.v ? cell.v.toString() : "";
        const monthInfo = scanner.identifyMonth(val);
        if (monthInfo) {
          months.push({
            label: val,
            month: monthInfo.standardName,
            address: addr
          });
        }
      }
    } catch (e) {
    }
    return { tabs, categories, months };
  }
  /**
   * @deprecated Use getMetadata
   */
  async getSheetNames(filePath) {
    const res = await this.getMetadata(filePath);
    return res.tabs;
  }
  /**
   * @deprecated Use getMetadata
   */
  async findCategories(filePath, sheetName, categoryColumn = "A") {
    const res = await this.getMetadata(filePath, sheetName, categoryColumn);
    const simple = {};
    Object.entries(res.categories).forEach(([k, v]) => simple[k] = v.row);
    return simple;
  }
}
class DocumentCacheService {
  constructor() {
    this._cacheDir = null;
  }
  get cacheDir() {
    if (!this._cacheDir) {
      this._cacheDir = path.join(electron.app.getPath("userData"), "extraction-cache");
      this.ensureDir();
    }
    return this._cacheDir;
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
    return JSON.parse(fs.readFileSync(cachePath, "utf-8"));
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
    if (!entry || entry.status !== "success") return null;
    try {
      const stats = fs.statSync(filePath);
      if (stats.mtime.getTime() === entry.mtime) {
        return entry;
      }
    } catch (e) {
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
class MainService {
  constructor() {
    this.scanner = new ScannerService();
    this.parser = new ParserService();
    this.excel = new ExcelService();
    this.cache = new DocumentCacheService();
  }
  /**
   * Proxies Excel metadata extraction.
   */
  async getExcelMetadata(filePath, sheetName, categoryColumn, monthStartCell) {
    return this.excel.getMetadata(filePath, sheetName, categoryColumn, monthStartCell);
  }
  /**
   * Orchestrates the document scanning and parsing process.
   */
  async runProcess(project, onProgress) {
    onProgress({ status: "scanning", message: "Scanning directory structure..." });
    const scanResult = await this.scanner.scan(project.rootPath, {
      ...project.categoryMapping,
      monthFilter: project.monthFilter
    });
    const summary = {
      projects: project.name,
      files: [],
      // { month, category, fileName, status, amount, candidates, message }
      totals: {},
      // { month: { category: amount } }
      conflicts: [],
      stats: { done: 0, skipped: 0, failed: 0, ambiguous: 0, total: 0 }
    };
    const monthsToProcess = Object.keys(scanResult.months);
    let processedFiles = 0;
    const totalFiles = monthsToProcess.reduce(
      (acc, m) => acc + Object.values(scanResult.months[m].categories).reduce((acc2, c) => acc2 + c.length, 0),
      0
    );
    summary.stats.total = totalFiles;
    for (const monthName of monthsToProcess) {
      const monthData = scanResult.months[monthName];
      if (!summary.totals[monthName]) summary.totals[monthName] = {};
      for (const [categoryName, filePaths] of Object.entries(monthData.categories)) {
        let categoryTotal = 0;
        for (const filePath of filePaths) {
          processedFiles++;
          const fileName = filePath.split("/").pop();
          onProgress({
            status: "parsing",
            message: `Parsing ${fileName}...`,
            progress: Math.round(processedFiles / totalFiles * 100)
          });
          let result = null;
          if (!project.forceRescan) {
            const cached = this.cache.getValidEntry(project.id, filePath);
            if (cached) {
              result = { status: "success", amount: cached.amount, skipped: true };
            }
          }
          if (!result) {
            result = await this.parser.extractAmount(filePath);
            if (result.status === "success") {
              this.cache.updateEntry(project.id, filePath, {
                amount: result.amount,
                status: "success"
              });
            }
          }
          const fileInfo = {
            month: monthName,
            category: categoryName,
            fileName,
            filePath,
            status: result.skipped ? "skip" : result.status,
            amount: result.amount || 0,
            message: result.message
          };
          summary.files.push(fileInfo);
          if (result.status === "success") {
            categoryTotal += result.amount;
            summary.stats.done += result.skipped ? 0 : 1;
            if (result.skipped) summary.stats.skipped++;
          } else if (result.status === "ambiguous") {
            summary.stats.ambiguous++;
            summary.conflicts.push({
              ...fileInfo,
              candidates: result.candidates,
              type: "ambiguity"
            });
          } else {
            summary.stats.failed++;
            summary.conflicts.push({
              ...fileInfo,
              candidates: result.candidates || [],
              type: "failure"
            });
          }
        }
        summary.totals[monthName][categoryName] = categoryTotal;
      }
    }
    if (summary.conflicts.length > 0) {
      onProgress({ status: "waiting-resolutions", message: "Conflicts detected. Please resolve them.", summary });
    } else {
      onProgress({ status: "review-results", message: "Scan complete. Review results.", summary });
    }
    return summary;
  }
  /**
   * Finalizes the process by updating the Excel file.
   */
  async finalizeProcess(project, summary) {
    const finalTotals = { ...summary.totals };
    summary.files.forEach((f) => {
      if (f.resolvedAmount !== void 0) {
        if (!finalTotals[f.month]) finalTotals[f.month] = {};
        if (!finalTotals[f.month][f.category]) finalTotals[f.month][f.category] = 0;
        finalTotals[f.month][f.category] += f.resolvedAmount;
      }
    });
    const mapping = {
      monthStartCell: project.excelConfig.monthStartCell,
      categoryColumn: project.excelConfig.categoryColumn,
      categoryRows: project.excelConfig.categoryRowsMap
    };
    await this.excel.updateSheet(
      project.excelConfig.filePath,
      project.excelConfig.sheetName,
      mapping,
      finalTotals
    );
    return { success: true };
  }
  getManualEntry(filePath) {
    return this.parser.cache.getManualEntry(filePath);
  }
  setManualEntry(filePath, amount) {
    return this.parser.cache.setManualEntry(filePath, amount);
  }
}
const projectService = new ProjectService();
const mainService = new MainService();
const settingsService = new SettingsService();
const parserService = new ParserService();
electron.protocol.registerSchemesAsPrivileged([
  { scheme: "app-file", privileges: { secure: true, supportFetchAPI: true, standard: true } }
]);
function createWindow() {
  const mainWindow = new electron.BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...process.platform === "linux" ? { icon } : {},
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false
    }
  });
  mainWindow.on("ready-to-show", () => {
    mainWindow.maximize();
    mainWindow.show();
  });
  mainWindow.webContents.setWindowOpenHandler((details) => {
    electron.shell.openExternal(details.url);
    return { action: "deny" };
  });
  if (!electron.app.isPackaged && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}
electron.app.whenReady().then(() => {
  electron.protocol.handle("app-file", (request) => {
    try {
      const parsed = new URL(request.url);
      let filePath = parsed.pathname;
      if (parsed.hostname) {
        filePath = path.join("/", parsed.hostname, filePath);
      }
      filePath = decodeURIComponent(filePath);
      return electron.net.fetch(url.pathToFileURL(filePath).toString());
    } catch (e) {
      console.error("[app-file] Protocol error:", e);
      return new Response("Bad Request", { status: 400 });
    }
  });
  if (process.platform === "win32") {
    electron.app.setAppUserModelId("com.javimosch.scan-and-fill");
  }
  electron.app.on("browser-window-created", (_, window) => {
    if (!electron.app.isPackaged) {
      window.webContents.openDevTools();
    } else {
      window.setMenu(null);
    }
  });
  electron.ipcMain.handle("get-projects", () => projectService.getProjects());
  electron.ipcMain.handle("save-project", (_, project) => projectService.saveProject(project));
  electron.ipcMain.handle("delete-project", (_, projectId) => projectService.deleteProject(projectId));
  electron.ipcMain.handle(
    "get-excel-metadata",
    (_, filePath, sheetName, categoryColumn, monthStartCell) => mainService.getExcelMetadata(filePath, sheetName, categoryColumn, monthStartCell)
  );
  electron.ipcMain.handle("run-project", (event, project) => {
    return mainService.runProcess(project, (progress) => {
      event.sender.send("process-progress", progress);
    });
  });
  electron.ipcMain.handle("finalize-project", (_, project, summary) => {
    return mainService.finalizeProcess(project, summary);
  });
  electron.ipcMain.handle("clear-project-cache", (_, projectId) => {
    mainService.cache.clearCache(projectId);
  });
  electron.ipcMain.handle("select-directory", async () => {
    const result = await electron.dialog.showOpenDialog({
      properties: ["openDirectory"]
    });
    return result.filePaths[0];
  });
  electron.ipcMain.handle("select-file", async (_, filters) => {
    const result = await electron.dialog.showOpenDialog({
      properties: ["openFile"],
      filters: filters || [
        { name: "Spreadsheets", extensions: ["xlsx", "ods"] },
        { name: "All Files", extensions: ["*"] }
      ]
    });
    return result.filePaths[0];
  });
  electron.ipcMain.handle("get-manual-entry", (_, filePath) => {
    return mainService.getManualEntry(filePath);
  });
  electron.ipcMain.handle("save-manual-entry", (_, filePath, amount) => {
    return mainService.setManualEntry(filePath, amount);
  });
  electron.ipcMain.handle("open-path", async (_, path2) => {
    try {
      await electron.shell.openPath(path2);
      return { success: true };
    } catch (error) {
      console.error("Failed to open path:", error);
      return { success: false, error: error.message };
    }
  });
  electron.ipcMain.handle("get-settings", () => {
    return settingsService.getSettings();
  });
  electron.ipcMain.handle("get-ai-settings", () => {
    return settingsService.getAIDetectionSettings();
  });
  electron.ipcMain.handle("update-ai-settings", (_, settings) => {
    return settingsService.updateAIDetectionSettings(settings);
  });
  electron.ipcMain.handle("update-setting", (_, key, value) => {
    return settingsService.updateSetting(key, value);
  });
  electron.ipcMain.handle("get-cache-stats", async () => {
    try {
      const cache = new CacheService();
      const stats = cache.getStats();
      return stats;
    } catch (error) {
      console.error("Failed to get cache stats:", error);
      throw error;
    }
  });
  electron.ipcMain.handle("clear-ocr-cache", async () => {
    try {
      const cache = new CacheService();
      await cache.clearOCRCacheJSON();
      return { success: true };
    } catch (error) {
      console.error("Failed to clear OCR cache:", error);
      throw error;
    }
  });
  electron.ipcMain.handle("analyze-with-ai", async (_, filePath, text) => {
    try {
      const aiSettings = settingsService.getAIDetectionSettings();
      const pageCount = parserService.getPageCount(filePath);
      if (!aiSettings.enabled) {
        throw new Error("AI detection is disabled");
      }
      if (pageCount > aiSettings.maxPages) {
        throw new Error(`PDF has ${pageCount} pages, but AI is limited to ${aiSettings.maxPages} pages`);
      }
      const pdfContext = {
        fileName: require("path").basename(filePath),
        pageCount
      };
      return await parserService.manualAIAnalysis(text, pdfContext, aiSettings);
    } catch (error) {
      console.error("Manual AI analysis failed:", error);
      throw error;
    }
  });
  electron.ipcMain.handle("extract-pdf-text", async (_, filePath) => {
    try {
      const text = await parserService.extractFullText(filePath);
      return { success: true, text };
    } catch (error) {
      console.error("PDF text extraction failed:", error);
      return { success: false, error: error.message };
    }
  });
  electron.ipcMain.on("ping", () => console.log("pong"));
  createWindow();
  electron.app.on("activate", function() {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
