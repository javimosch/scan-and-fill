import { useState, useEffect } from 'react'
import {
  Settings,
  X,
  Key,
  Brain,
  Database,
  Trash2,
  FileText,
  FolderOpen,
  Download
} from 'lucide-react'

export default function SettingsModal({ isOpen, onClose }) {
  const [aiSettings, setAiSettings] = useState({
    enabled: false,
    maxPages: 1,
    apiKey: '',
    model: 'google/gemini-flash-1.5:free'
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [cacheStats, setCacheStats] = useState(null)
  const [logDirectory, setLogDirectory] = useState('')

  useEffect(() => {
    if (isOpen) {
      loadSettings()
    }
  }, [isOpen])

  const loadSettings = async () => {
    try {
      const settings = await window.api.getAISettings()
      setAiSettings(settings)
      const logsPath = await window.api.getLogFiles()
      setLogDirectory(logsPath || '')
      await loadCacheStats()
    } catch (err) {
      setError('Failed to load settings')
    }
  }

  const saveSettings = async () => {
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      await window.api.updateAISettings(aiSettings)
      setSuccess('Settings saved successfully!')
      setTimeout(() => setSuccess(''), 3000)
    } catch (error) {
      console.error('Failed to save settings:', error)
      setError('Failed to save settings')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (field, value) => {
    setAiSettings((prev) => ({
      ...prev,
      [field]: value
    }))
  }

  const loadCacheStats = async () => {
    try {
      const stats = await window.api.getCacheStats()
      setCacheStats(stats)
    } catch (error) {
      console.error('Failed to load cache stats:', error)
    }
  }

  const clearOCRCache = async () => {
    if (
      confirm(
        'Are you sure you want to clear the OCR cache? This will force fresh OCR extraction on next analysis.'
      )
    ) {
      try {
        setLoading(true)
        await window.api.clearOCRCache()
        await loadCacheStats()
        setSuccess('OCR cache cleared successfully')
        setTimeout(() => setSuccess(''), 3000)
      } catch (error) {
        setError('Failed to clear OCR cache: ' + error.message)
      } finally {
        setLoading(false)
      }
    }
  }

  const openLogDirectory = async () => {
    try {
      setLoading(true)
      setError('')
      const result = await window.api.openLogDirectory()

      if (!result?.success) {
        setError(`Failed to open logs folder${result?.error ? `: ${result.error}` : ''}`)
        return
      }

      setSuccess('Opened logs folder')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError('Failed to open logs folder')
    } finally {
      setLoading(false)
    }
  }

  const downloadLogs = async () => {
    try {
      setLoading(true)
      setError('')
      const logs = await window.api.exportLogs()

      if (!logs || !logs.trim()) {
        setError('No logs available to download yet')
        return
      }

      const timestamp = new Date().toISOString().slice(0, 10)
      const blob = new Blob([logs], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `scan-and-fill-logs-${timestamp}.txt`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      setSuccess('Logs downloaded successfully')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError('Failed to download logs')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="modal-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}
    >
      <div
        className="modal-content"
        style={{
          backgroundColor: 'var(--card-bg)',
          borderRadius: '12px',
          padding: '2rem',
          width: '90%',
          maxWidth: '500px',
          maxHeight: '80vh',
          overflowY: 'auto',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.5rem'
          }}
        >
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Settings size={20} />
            Settings
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '0.5rem',
              borderRadius: '6px',
              color: 'var(--text-muted)'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* AI Detection Settings */}
        <div style={{ marginBottom: '2rem' }}>
          <h3
            style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <Brain size={18} />
            AI Detection Settings
          </h3>
          <p style={{ margin: '0 0 1rem 0', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Configure AI-powered fallback detection for when OCR fails to determine exact amounts.
          </p>

          {/* Enable AI Detection */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
            >
              <input
                type="checkbox"
                checked={aiSettings.enabled}
                onChange={(e) => handleChange('enabled', e.target.checked)}
                style={{ width: 'auto' }}
              />
              <span>Enable AI Detection</span>
            </label>
          </div>

          {/* Max Pages */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
              <FileText size={16} style={{ display: 'inline', marginRight: '0.5rem' }} />
              Max PDF pages to trigger AI Scan
            </label>
            <input
              type="number"
              min="1"
              max="10"
              value={aiSettings.maxPages}
              onChange={(e) => handleChange('maxPages', parseInt(e.target.value) || 1)}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                backgroundColor: 'var(--background)',
                color: 'var(--text)'
              }}
            />
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              AI detection will only be used for PDFs with this many pages or fewer
            </p>
          </div>

          {/* API Key */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
              <Key size={16} style={{ display: 'inline', marginRight: '0.5rem' }} />
              API Key (optional for free models)
            </label>
            <input
              type="password"
              value={aiSettings.apiKey}
              onChange={(e) => handleChange('apiKey', e.target.value)}
              placeholder="Enter OpenRouter API key (optional)"
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                backgroundColor: 'var(--card-bg)',
                color: 'var(--text)'
              }}
            />
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Required for paid models only. Free models work without a key.
            </p>
          </div>

          {/* Model */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
              Model
            </label>
            <select
              value={aiSettings.model}
              onChange={(e) => handleChange('model', e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                backgroundColor: 'var(--card-bg)',
                color: 'var(--text)'
              }}
            >
              <option value="google/gemini-flash-1.5:free">Gemini Flash 1.5 (free)</option>
              <option value="openai/gpt-3.5-turbo">GPT-3.5 Turbo - API key required</option>
              <option value="openai/gpt-4">GPT-4 - API key required</option>
              <option value="anthropic/claude-3-haiku">Claude 3 Haiku - API key required</option>
              <option value="anthropic/claude-3-sonnet">Claude 3 Sonnet - API key required</option>
            </select>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Choose the AI model for amount detection
            </p>
          </div>
        </div>

        {/* Logs */}
        <div style={{ marginBottom: '2rem' }}>
          <h3
            style={{
              marginBottom: '1rem',
              fontSize: '1.1rem',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <FileText size={16} />
            Logs
          </h3>

          <p style={{ margin: '0 0 0.75rem 0', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Open the local logs folder or download a combined log file for debugging.
          </p>

          {logDirectory && (
            <p
              style={{
                margin: '0 0 1rem 0',
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
                wordBreak: 'break-all'
              }}
            >
              Path: {logDirectory}
            </p>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              onClick={openLogDirectory}
              disabled={loading}
              className="btn-ghost"
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <FolderOpen size={14} />
              Open Logs Folder
            </button>

            <button
              onClick={downloadLogs}
              disabled={loading}
              className="btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <Download size={14} />
              Download Logs
            </button>
          </div>
        </div>

        {/* Cache Management */}
        <div style={{ marginBottom: '2rem' }}>
          <h3
            style={{
              marginBottom: '1rem',
              fontSize: '1.1rem',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <Database size={16} />
            Cache Management
          </h3>

          {cacheStats && (
            <div
              style={{
                marginBottom: '1rem',
                padding: '0.75rem',
                backgroundColor: 'var(--background)',
                borderRadius: '6px',
                fontSize: '0.875rem'
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: '0.25rem'
                }}
              >
                <span>OCR Entries:</span>
                <span style={{ fontWeight: '500' }}>{cacheStats.ocrEntries}</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: '0.25rem'
                }}
              >
                <span>Manual Entries:</span>
                <span style={{ fontWeight: '500' }}>{cacheStats.manualEntries}</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: '0.25rem'
                }}
              >
                <span>Total Size:</span>
                <span style={{ fontWeight: '500' }}>{cacheStats.totalSize}</span>
              </div>
              {cacheStats.lastUpdated && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Last Updated:</span>
                  <span style={{ fontWeight: '500' }}>
                    {new Date(cacheStats.lastUpdated).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          )}

          <button
            onClick={clearOCRCache}
            disabled={loading}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: loading ? 'var(--border)' : '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.875rem'
            }}
          >
            <Trash2 size={14} />
            {loading ? 'Clearing...' : 'Clear OCR Cache'}
          </button>

          <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Clear OCR cache to force fresh text extraction with improved OCR settings
          </p>
        </div>

        {/* Status Messages */}
        {error && (
          <div
            style={{
              padding: '0.75rem',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              color: 'var(--error)',
              borderRadius: '6px',
              marginBottom: '1rem',
              fontSize: '0.875rem'
            }}
          >
            {error}
          </div>
        )}

        {success && (
          <div
            style={{
              padding: '0.75rem',
              backgroundColor: 'rgba(34, 197, 94, 0.1)',
              color: 'var(--success)',
              borderRadius: '6px',
              marginBottom: '1rem',
              fontSize: '0.875rem'
            }}
          >
            {success}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="btn-ghost" style={{ padding: '0.75rem 1.5rem' }}>
            Cancel
          </button>
          <button
            onClick={saveSettings}
            disabled={loading}
            className="btn-primary"
            style={{
              padding: '0.75rem 1.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            {loading ? (
              <>
                <div
                  style={{
                    width: '16px',
                    height: '16px',
                    border: '2px solid var(--text)',
                    borderTopColor: 'transparent',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                  }}
                ></div>
                Saving...
              </>
            ) : (
              'Save Settings'
            )}
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  )
}
