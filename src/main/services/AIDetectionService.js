import fs from 'fs';
import path from 'path';

/**
 * AI Detection Service for OCR fallback using OpenRouter API
 */
export default class AIDetectionService {
  constructor() {
    this.isEnabled = false;
    this.maxPages = 1;
    this.apiKey = null;
    this.model = 'google/gemini-flash-1.5:free';
    this.settingsPath = null;
  }

  /**
   * Initialize AI detection service with settings
   */
  initialize(settings = {}) {
    this.isEnabled = settings.enabled || false;
    this.maxPages = settings.maxPages || 1;
    this.apiKey = settings.apiKey || null;
    this.model = settings.model || 'google/gemini-flash-1.5:free';
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
   * Extract amount from PDF text using AI
   */
  async extractAmountFromText(text, pdfContext = {}) {
    if (!this.isEnabled) {
      throw new Error('AI detection is disabled');
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
      
      return this.parseResponse(response);
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
    const { fileName = 'unknown.pdf', pageCount = 1 } = context || {};
    const cleanedText = text
      .replace(/[\r\n]+/g, '\n')
      .replace(/\s+/g, ' ')
      .trim();
    // Include more of the OCR text so the model sees the full context for
    // longer scanned receipts (e.g. METRO / LECLERC cases in issue #4).
    const maxTextLength = 4000;
    const sampleText = cleanedText.length > maxTextLength
      ? cleanedText.substring(0, maxTextLength).replace(/\s+\S*$/, '') + '...'
      : cleanedText;

    return `You are extracting a total amount from a poorly OCR-scanned invoice or receipt.

File: ${fileName}
Pages: ${pageCount}

OCR text (may contain errors):
"""
${sampleText}
"""

Instructions:
- Return exactly one line: AMOUNT: <currency><number> or AMOUNT: NOT_FOUND
- Prefer the Total HT (hors taxe) amount. If no HT line is visible, use the final total payable (TTC / net à payer / total due / amount).
- Ignore account numbers, IBAN, SIRET, dates, phone numbers, quantities, percentages, discount lines and article prices.
- Do not use thousands separators; use a dot or comma only as the decimal separator.
- If the amount is unclear from the text, return AMOUNT: NOT_FOUND.

Format: AMOUNT: €123.45 or AMOUNT: NOT_FOUND`;
  }

  /**
   * Call OpenRouter API
   */
  async callOpenRouter(prompt) {
    const apiKey = this.apiKey || process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      throw new Error('OpenRouter API key is missing. Free models also require an API key for authentication.');
    }

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
    if (cleaned.toLowerCase().includes('not_found')) {
      return { status: 'failed', amount: 0, candidates: [], message: 'AI could not find amount' };
    }

    // Prefer a structured "AMOUNT: <value>" line and parse the value directly.
    const amountLineMatch = cleaned.match(/^AMOUNT:\s*(.+)$/im);
    if (amountLineMatch) {
      const amountStr = amountLineMatch[1].trim();
      console.log('[AIDetectionService] Extracted amount string from AMOUNT line:', amountStr);

      const numericAmount = this.parseAmountString(amountStr);

      if (numericAmount > 0) {
        return {
          status: 'success',
          amount: numericAmount,
          aiExtracted: true,
          candidates: [numericAmount],
          message: `AI detected amount: ${amountStr}`
        };
      }
    }

    // Fallback: look for any number near a currency symbol, allowing spaces
    // between digit groups (e.g. "1 234,56 €" or "6 .930€").
    const fallbackPatterns = [
      /([$€£]\s*\d[\d\s.,]*)/,
      /(\d[\d\s.,]*\s*[$€£])/,
      /(\d[\d.,]+)/
    ];

    for (const pattern of fallbackPatterns) {
      const match = cleaned.match(pattern);
      if (match) {
        const amountStr = match[1].replace(/\s/g, '');
        console.log('[AIDetectionService] Regex matched pattern:', pattern.toString());
        console.log('[AIDetectionService] Extracted amount string:', amountStr);

        const numericAmount = this.parseAmountString(amountStr);

        if (numericAmount > 0) {
          return {
            status: 'success',
            amount: numericAmount,
            aiExtracted: true,
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
   * Parse amount string to number
   */
  parseAmountString(amountStr) {
    // Remove currency symbols and whitespace
    let cleaned = amountStr.replace(/[$€£\s]/g, '');

    // No separators: parse directly
    if (!/[.,]/.test(cleaned)) {
      const amount = parseFloat(cleaned);
      return isNaN(amount) ? 0 : amount;
    }

    // Determine the rightmost separator (decimal or thousands)
    const lastDot = cleaned.lastIndexOf('.');
    const lastComma = cleaned.lastIndexOf(',');
    const lastSeparator = lastDot > lastComma ? '.' : ',';

    const sepIndex = cleaned.lastIndexOf(lastSeparator);
    const beforeLast = cleaned.substring(0, sepIndex);
    const lastPart = cleaned.substring(sepIndex + 1);

    if (lastPart.length <= 2) {
      // Rightmost separator is a decimal point; remove all thousands separators
      const thousands = beforeLast.replace(/[.,]/g, '');
      cleaned = `${thousands}.${lastPart}`;
    } else {
      // Rightmost separator is a thousands separator; remove all separators
      cleaned = cleaned.replace(/[.,]/g, '');
    }

    const amount = parseFloat(cleaned);
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
