import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import CacheService from './CacheService.js';

/**
 * AI Detection Service for OCR fallback using OpenRouter API
 */
export default class AIDetectionService {
  constructor() {
    this.isEnabled = false;
    this.maxPages = 1;
    this.apiKey = null;
    this.model = 'openrouter/free';
    this.dailyCallLimit = 100;
    this.settingsPath = null;
    this.cache = new CacheService();
  }

  /**
   * Initialize AI detection service with settings
   */
  initialize(settings = {}) {
    this.isEnabled = settings.enabled || false;
    this.maxPages = settings.maxPages || 1;
    this.apiKey = settings.apiKey || null;
    this.model = settings.model || 'openrouter/free';
    this.dailyCallLimit = settings.dailyCallLimit || 100;
  }

  /**
   * Check if AI detection should be used for fallback
   */
  shouldUseFallback(status, pageCount) {
    return (
      this.isEnabled &&
      (status === 'failed' || status === 'ambiguous') &&
      pageCount <= this.maxPages
    );
  }

  /**
   * Generate a cache key for AI detection results
   */
  getCacheKey(text, pdfContext = {}) {
    const raw = `${pdfContext.fileName || 'unknown'}:${this.model || 'default'}:${text}`;
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  /**
   * Check the daily API call cap before calling OpenRouter
   */
  checkDailyCallLimit() {
    const usage = this.cache.getAIDetectionUsage();
    if (usage.count >= this.dailyCallLimit) {
      console.warn(`[AIDetectionService] Daily API call limit reached (${usage.count}/${this.dailyCallLimit})`);
      return {
        allowed: false,
        message: `Daily AI detection limit reached (${usage.count}/${this.dailyCallLimit}). Try again tomorrow or increase the limit in Settings.`
      };
    }
    return { allowed: true };
  }

  /**
   * Record an API call against the daily cap
   */
  recordApiCall() {
    return this.cache.incrementAIDetectionUsage();
  }

  /**
   * Extract amount from PDF text using AI
   */
  async extractAmountFromText(text, pdfContext = {}) {
    if (!this.isEnabled) {
      throw new Error('AI detection is disabled');
    }

    const cacheKey = this.getCacheKey(text, pdfContext);
    const cached = this.cache.getAIDetectionCache(cacheKey);
    if (cached) {
      console.log('[AIDetectionService] Returning cached AI result for', pdfContext.fileName || 'unknown');
      return { ...cached, fromCache: true };
    }

    try {
      console.log('[AIDetectionService] Text length for AI analysis:', text.length);
      console.log('[AIDetectionService] Text sample:', text.substring(0, 200) + (text.length > 200 ? '...' : ''));
      
      // Validate text quality before sending to AI
      const quality = this.assessTextQuality(text);
      
      console.log('[AIDetectionService] Text quality assessment:', quality);
      
      if (!quality.isAcceptable) {
        console.warn('[AIDetectionService] Text quality is too poor for AI analysis');
        
        const suggestions = [];
        if (quality.wordCount < 2) suggestions.push('Document may need to be scanned at higher resolution');
        if (!quality.hasNumbers) suggestions.push('Document may not contain visible amounts');
        if (!quality.hasCurrency) suggestions.push('Currency symbols may not be present or visible');
        
        return { 
          status: 'failed', 
          amount: 0, 
          candidates: [], 
          message: `Text quality too poor for AI analysis (${quality.wordCount} meaningful words detected). ${suggestions.length > 0 ? 'Suggestions: ' + suggestions.join(', ') : ''}` 
        };
      }
      
      const limitCheck = this.checkDailyCallLimit();
      if (!limitCheck.allowed) {
        return { status: 'failed', amount: 0, candidates: [], message: limitCheck.message };
      }

      this.recordApiCall();
      const prompt = this.buildPrompt(text, pdfContext);
      const response = await this.callOpenRouterWithRetry(prompt);
      
      console.log('[AIDetectionService] Raw AI response:', response);
      
      // Handle empty AI responses
      if (!response || response.trim().length === 0) {
        console.warn('[AIDetectionService] AI returned empty response');
        return { 
          status: 'failed', 
          amount: 0, 
          candidates: [], 
          message: 'AI returned empty response - text may be too poor quality for analysis' 
        };
      }
      
      const result = this.parseResponse(response);
      this.cache.setAIDetectionCache(cacheKey, result);
      return result;
    } catch (error) {
      console.error('[AIDetectionService] AI detection failed:', error);
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
        
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt - 1) * 1000;
        console.log(`[AIDetectionService] Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Assess text quality to determine if it's suitable for AI analysis
   */
  assessTextQuality(text) {
    const meaningfulWords = text.split(/\s+/).filter(word => word.length > 2);
    const wordCount = meaningfulWords.length;
    const hasNumbers = /\d/.test(text);
    const hasCurrency = /[€$£]/.test(text);
    const hasAmountPattern = /\d+[.,]\d+/.test(text);
    const charCount = text.replace(/\s+/g, '').length;
    
    // Calculate quality score
    let score = 0;
    score += wordCount * 2; // Each meaningful word is worth 2 points
    score += hasNumbers ? 5 : 0; // Numbers are valuable
    score += hasCurrency ? 10 : 0; // Currency symbols are very valuable
    score += hasAmountPattern ? 15 : 0; // Amount patterns are most valuable
    score += charCount > 50 ? 5 : 0; // Reasonable length
    
    return {
      score,
      wordCount,
      hasNumbers,
      hasCurrency,
      hasAmountPattern,
      charCount,
      isAcceptable: score >= 10 || (wordCount >= 2 && hasNumbers)
    };
  }

  /**
   * Build prompt for OpenRouter API
   */
  buildPrompt(text, context) {
    // Give the model more of the garbled OCR text so it can reason about
    // structure and context, while staying within free model token budgets.
    const maxTextLength = 3000;
    const cleanText = text
      .replace(/[\r\n]+/g, '\n')
      .replace(/\s+/g, ' ')
      .trim();
    const truncated = cleanText.length > maxTextLength
      ? cleanText.substring(0, maxTextLength).replace(/\s+\S*$/, '') + '...'
      : cleanText;

    return `Extract the final total payable amount from this poorly OCR-scanned invoice or receipt.

File: ${context?.fileName || 'unknown'}
Pages: ${context?.pageCount || 1}

OCR text (may contain errors):
"""
${truncated}
"""

Instructions:
- Return exactly one line: AMOUNT: <currency><number> or AMOUNT: NOT_FOUND
- Prefer the final total the customer must pay, e.g. "net a payer", "total TTC", "total due", or "amount".
- Ignore account numbers, IBAN, SIRET, dates, phone numbers, quantities, percentages, and discount lines.
- Do not use thousands separators; use a dot or comma only as the decimal separator.

Format: AMOUNT: €123.45 or AMOUNT: NOT_FOUND`;
  }

  /**
   * Call OpenRouter API
   */
  async callOpenRouter(prompt) {
    const apiKey = this.apiKey || process.env.OPENROUTER_API_KEY;
    const isFreeModel = this.model.includes('free');
    
    console.log('[AIDetectionService] API call details:', {
      model: this.model,
      isFreeModel,
      hasApiKey: !!apiKey,
      promptLength: prompt.length
    });
    
    // Simplified headers for free model compatibility
    const headers = {
      'Content-Type': 'application/json'
    };
    
    // Only add optional headers for paid models
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
      headers['HTTP-Referer'] = 'https://scan-and-fill.app';
      headers['X-Title'] = 'Scan and Fill AI Detection';
    }
    
    // Adjust max_tokens based on model type
    const maxTokens = isFreeModel ? 15 : 30;
    
    console.log('[AIDetectionService] Using max_tokens:', maxTokens);
    
    // Simplified request body for free model
    const requestBody = {
      model: this.model,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.1,
      max_tokens: maxTokens
    };
    
    console.log('[AIDetectionService] Request body:', JSON.stringify(requestBody, null, 2));
    
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    });
    
    console.log('[AIDetectionService] API response status:', response.status);
    console.log('[AIDetectionService] API response headers:', Object.fromEntries(response.headers.entries()));
    
    if (!response.ok) {
      const error = await response.text();
      console.error('[AIDetectionService] API error response:', error);
      throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }
    
    const data = await response.json();
    console.log('[AIDetectionService] API response data:', JSON.stringify(data, null, 2));
    
    if (!data.choices || data.choices.length === 0) {
      console.error('[AIDetectionService] No choices in API response:', data);
      throw new Error('No response from OpenRouter API');
    }
    
    const content = data.choices[0].message.content;
    console.log('[AIDetectionService] Extracted content:', `"${content}"`);
    
    return content.trim();
  }

  /**
   * Parse AI response to extract amount
   */
  parseResponse(response) {
    const cleaned = response.trim();
    console.log('[AIDetectionService] Parsing AI response:', cleaned);
    
    // Check for NOT_FOUND response
    if (cleaned === 'AMOUNT: NOT_FOUND' || cleaned.toLowerCase().includes('not_found')) {
      return { status: 'failed', amount: 0, candidates: [], message: 'AI could not find amount' };
    }

    // Multiple regex patterns to catch various formats
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
        console.log('[AIDetectionService] Regex matched pattern:', pattern.toString());
        console.log('[AIDetectionService] Extracted amount string:', amountStr);
        
        const numericAmount = this.parseAmountString(amountStr);
        
        if (numericAmount > 0) {
          return {
            status: 'success',
            amount: numericAmount,
            candidates: [numericAmount],
            message: `AI detected amount: ${amountStr}`
          };
        }
      }
    }

    console.log('[AIDetectionService] No regex patterns matched');
    return { status: 'failed', amount: 0, candidates: [], message: 'AI response format invalid' };
  }

  /**
   * Parse amount string to number.
   * Handles both European (1.234,56) and US/UK (1,234.56) formats,
   * including spaces used as thousands separators.
   */
  parseAmountString(amountStr) {
    // Remove currency symbols and whitespace
    let raw = amountStr.replace(/[$€£\s]/g, '');

    if (!/[\d.,]/.test(raw)) {
      return 0;
    }

    const dotIndex = raw.lastIndexOf('.');
    const commaIndex = raw.lastIndexOf(',');
    const lastSepIndex = Math.max(dotIndex, commaIndex);

    if (dotIndex !== -1 && commaIndex !== -1) {
      // Both separators present: the rightmost one is the decimal separator.
      const integer = raw.slice(0, lastSepIndex).replace(/[.,]/g, '');
      const fractional = raw.slice(lastSepIndex + 1).replace(/[.,]/g, '');
      raw = `${integer}.${fractional}`;
    } else if (lastSepIndex !== -1) {
      // Only one separator: use the number of trailing digits to decide.
      const integer = raw.slice(0, lastSepIndex).replace(/[.,]/g, '');
      const fractional = raw.slice(lastSepIndex + 1).replace(/[.,]/g, '');

      if (fractional.length === 2) {
        // Two trailing digits -> decimal separator.
        raw = `${integer}.${fractional}`;
      } else if (fractional.length === 3) {
        // Three trailing digits -> thousands separator (currency rarely uses 3 decimals).
        raw = integer + fractional;
      } else {
        // 1, 4+, or missing trailing digits -> treat as decimal separator.
        raw = `${integer}.${fractional}`;
      }
    }

    const amount = parseFloat(raw);
    return isNaN(amount) ? 0 : amount;
  }

  /**
   * Get current settings
   */
  getSettings() {
    return {
      enabled: this.isEnabled,
      maxPages: this.maxPages,
      apiKey: this.apiKey ? '***configured***' : null,
      model: this.model,
      dailyCallLimit: this.dailyCallLimit
    };
  }

  /**
   * Update settings
   */
  updateSettings(newSettings) {
    this.initialize(newSettings);
  }
}
