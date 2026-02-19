import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Check, X, Info, Brain, Loader2 } from 'lucide-react'

export default function ConflictResolver({ conflict, onResolve, onCancel }) {
    const { t } = useTranslation()
    const [selectedAmount, setSelectedAmount] = useState('')
    const [manualAmount, setManualAmount] = useState('')
    const [contextWidth, setContextWidth] = useState(50) // Characters to show on each side
    const [lastManualEntry, setLastManualEntry] = useState(null)
    const [aiSettings, setAiSettings] = useState(null)
    const [showAIBtn, setShowAIBtn] = useState(false)
    const [aiLoading, setAiLoading] = useState(false)
    const [aiResult, setAiResult] = useState(null)
    const [aiError, setAiError] = useState('')
    const [aiLoadingStage, setAiLoadingStage] = useState('') // 'extracting' or 'analyzing'

    // Load last manual entry for this file
    useEffect(() => {
        const loadLastEntry = async () => {
            try {
                const entry = await window.api.getManualEntry(conflict.filePath);
                if (entry) {
                    setLastManualEntry(entry);
                }
            } catch (error) {
                console.warn('Failed to load last manual entry:', error);
            }
        };
        loadLastEntry();
    }, [conflict.filePath]);

    // Load AI settings and check if AI button should be shown
    useEffect(() => {
        const checkAIAvailability = async () => {
            try {
                const settings = await window.api.getAISettings();
                setAiSettings(settings);
                
                // Check if AI should be available for this conflict
                const shouldShow = settings.enabled && 
                    (conflict.status === 'failed' || conflict.status === 'ambiguous');
                
                setShowAIBtn(shouldShow);
            } catch (error) {
                console.warn('Failed to load AI settings:', error);
                setShowAIBtn(false);
            }
        };
        checkAIAvailability();
    }, [conflict.status]);

    const handleApply = async () => {
        const val = manualAmount || selectedAmount;
        // Normalize comma to dot for parsing
        const normalized = val.toString().replace(',', '.');
        const amount = parseFloat(normalized);
        if (isNaN(amount)) return;

        // Save manual entry if user typed it manually
        if (manualAmount) {
            try {
                await window.api.saveManualEntry(conflict.filePath, amount);
            } catch (error) {
                console.warn('Failed to save manual entry:', error);
            }
        }

        onResolve(amount);
    }

    const handleAIAnalysis = async () => {
        setAiLoading(true);
        setAiError('');
        setAiResult(null);
        setAiLoadingStage('extracting');

        try {
            // Step 1: Extract full text from PDF
            setAiError(''); // Clear any previous errors
            
            const extractionResult = await window.api.extractPDFText(conflict.filePath);
            
            if (!extractionResult.success) {
                throw new Error(`Text extraction failed: ${extractionResult.error}`);
            }

            const text = extractionResult.text;
            
            if (!text.trim()) {
                throw new Error('No text could be extracted from PDF');
            }

            // Step 2: Analyze extracted text with AI
            setAiLoadingStage('analyzing');
            const result = await window.api.analyzeWithAI(conflict.filePath, text);
            
            if (result.status === 'success') {
                setAiResult(result);
                // Auto-select the AI result
                setSelectedAmount(result.amount.toString());
                setManualAmount('');
            } else {
                setAiError(result.message || 'AI analysis failed');
            }
        } catch (error) {
            console.error('AI analysis error:', error);
            setAiError(error.message || 'AI analysis failed');
        } finally {
            setAiLoading(false);
            setAiLoadingStage('');
        }
    }

    // Dynamically adjust context based on slider
    const getAdjustedContext = (candidate) => {
        if (!candidate.fullContext) {
            // If we don't have full context, use the original
            return candidate.context;
        }

        const { fullContext, matchIndex, matchLength } = candidate.fullContext;
        const start = Math.max(0, matchIndex - contextWidth);
        const end = Math.min(fullContext.length, matchIndex + matchLength + contextWidth);
        const snippet = fullContext.substring(start, end);
        return `...${snippet}...`;
    };

    return (
        <div className="modal-overlay" style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', zIndex: 1000,
            userSelect: 'text' // Ensure text is selectable/editable
        }}>
            <div className="card" style={{ maxWidth: '700px', width: '90%', maxHeight: '90vh', overflowY: 'auto' }}>
                <div className="flex-between" style={{ marginBottom: '1.5rem' }}>
                    <h3 className="flex" style={{ margin: 0 }}>
                        <AlertTriangle style={{ color: 'var(--primary)' }} />
                        {t('conflictResolver.title')}
                    </h3>
                    <button className="btn-ghost" onClick={onCancel}><X size={20} /></button>
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
                    <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{conflict.fileName}</p>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                        {t('projectForm.mappingTable.noMappings')}: {conflict.month} / {conflict.category}
                    </p>
                </div>

                {lastManualEntry && (
                    <div style={{
                        marginBottom: '1.5rem',
                        padding: '0.75rem',
                        backgroundColor: 'var(--bg-secondary)',
                        borderRadius: '0.5rem',
                        border: '1px solid var(--border)'
                    }}>
                        <div className="flex" style={{ gap: '0.5rem', alignItems: 'center' }}>
                            <Info size={16} style={{ color: 'var(--primary)' }} />
                            <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{t('conflictResolver.lastEntry')}</span>
                        </div>
                        <p style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0.5rem 0 0 0', color: 'var(--primary)' }}>
                            {lastManualEntry.amount.toFixed(2)} €
                        </p>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>
                            {t('messages.loadingMetadata')} {new Date(lastManualEntry.timestamp).toLocaleString()}
                        </p>
                    </div>
                )}

                <div className="section" style={{ marginBottom: '1.5rem' }}>
                    <div className="flex-between" style={{ marginBottom: '1rem' }}>
                        <h4 style={{ margin: 0 }}>{t('conflictResolver.candidates')}</h4>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                {t('conflictResolver.context')}:
                            </label>
                            <input
                                type="range"
                                min="20"
                                max="150"
                                value={contextWidth}
                                onChange={(e) => setContextWidth(parseInt(e.target.value))}
                                style={{ width: '120px' }}
                            />
                            <span style={{ fontSize: '0.75rem', fontWeight: 600, minWidth: '40px' }}>
                                {contextWidth}
                            </span>
                        </div>
                    </div>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                        {t('projectForm.mappingTable.mapTo')}:
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {conflict.candidates.length === 0 && (
                            <p style={{ opacity: 0.5, fontStyle: 'italic' }}>{t('conflictResolver.noCandidates')}</p>
                        )}
                        {conflict.candidates.map((c, idx) => (
                            <label
                                key={idx}
                                className={`card flex ${selectedAmount === c.amount.toString() ? 'selected' : ''}`}
                                style={{
                                    cursor: 'pointer', padding: '1rem', border: '1px solid var(--border)',
                                    borderColor: selectedAmount === c.amount.toString() ? 'var(--primary)' : 'var(--border)'
                                }}
                            >
                                <input
                                    type="radio"
                                    name="candidate"
                                    value={c.amount}
                                    checked={selectedAmount === c.amount.toString()}
                                    onChange={(e) => {
                                        setSelectedAmount(e.target.value);
                                        setManualAmount('');
                                    }}
                                    style={{ width: 'auto' }}
                                />
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{c.amount.toFixed(2)} €</div>
                                    <div style={{
                                        fontSize: '0.75rem',
                                        color: 'var(--text-muted)',
                                        fontFamily: 'monospace',
                                        wordBreak: 'break-word',
                                        lineHeight: '1.4'
                                    }}>
                                        {c.fullContext ? getAdjustedContext(c) : c.context}
                                    </div>
                                </div>
                            </label>
                        ))}
                    </div>
                </div>

                {/* AI Analysis Section */}
                {showAIBtn && (
                    <div className="section" style={{ marginBottom: '2rem' }}>
                        <div className="flex-between" style={{ marginBottom: '1rem' }}>
                            <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Brain size={16} />
                                AI Analysis
                            </h4>
                        </div>
                        
                        {aiResult && (
                            <div style={{
                                padding: '1rem',
                                backgroundColor: 'rgba(192, 38, 211, 0.1)',
                                border: '1px solid rgba(192, 38, 211, 0.3)',
                                borderRadius: '8px',
                                marginBottom: '1rem'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                    <Brain size={16} style={{ color: 'var(--primary)' }} />
                                    <span style={{ fontWeight: 600, color: 'var(--primary)' }}>AI Detected Amount</span>
                                </div>
                                <div style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                                    {aiResult.amount.toFixed(2)} €
                                </div>
                                {aiResult.message && (
                                    <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                                        {aiResult.message}
                                    </div>
                                )}
                            </div>
                        )}

                        {aiError && (
                            <div style={{
                                padding: '0.75rem',
                                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                                color: 'var(--error)',
                                borderRadius: '6px',
                                marginBottom: '1rem',
                                fontSize: '0.875rem'
                            }}>
                                {aiError}
                            </div>
                        )}

                        <button
                            className="btn-primary flex"
                            onClick={handleAIAnalysis}
                            disabled={aiLoading}
                            style={{ justifyContent: 'center', gap: '0.5rem' }}
                        >
                            {aiLoading ? (
                                <>
                                    <Loader2 size={16} className="animate-spin" />
                                    {aiLoadingStage === 'extracting' ? 'Extracting text from PDF...' : 'Analyzing with AI...'}
                                </>
                            ) : (
                                <>
                                    <Brain size={16} />
                                    Analyze with AI
                                </>
                            )}
                        </button>
                    </div>
                )}

                <div className="section" style={{ marginBottom: '2rem' }}>
                    <h4>{t('conflictResolver.manualEntry')}</h4>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                        {t('projectForm.mappingTable.noMappings')}:
                    </p>
                    <input
                        type="text"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={manualAmount}
                        autoFocus
                        style={{ fontSize: '1.25rem', fontWeight: 700, padding: '0.75rem' }}
                        onChange={(e) => {
                            // Allow numbers, dots, and commas
                            const val = e.target.value.replace(/[^0-9.,]/g, '');
                            setManualAmount(val);
                            setSelectedAmount('');
                        }}
                    />
                </div>

                <div className="flex-between">
                    <button className="btn-ghost" onClick={onCancel}>{t('common.cancel')}</button>
                    <button
                        className="btn-primary flex"
                        disabled={!selectedAmount && !manualAmount}
                        onClick={handleApply}
                    >
                        <Check size={18} />
                        {t('conflictResolver.apply')}
                    </button>
                </div>
            </div>
        </div>
    )
}
