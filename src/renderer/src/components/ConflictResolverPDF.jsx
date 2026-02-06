import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Check, X, Info, ZoomIn, ZoomOut, FileText, ExternalLink } from 'lucide-react'

export default function ConflictResolverWithPDF({ conflict, remainingConflicts, onResolve, onCancel }) {
    const { t } = useTranslation()
    const [selectedAmount, setSelectedAmount] = useState('')
    const [manualAmount, setManualAmount] = useState('')
    const [contextWidth, setContextWidth] = useState(50)
    const [lastManualEntry, setLastManualEntry] = useState(null)
    const [pdfZoom, setPdfZoom] = useState(100)
    const [showPdf, setShowPdf] = useState(true)

    useEffect(() => {
        const loadLastEntry = async () => {
            try {
                const entry = await window.api.getManualEntry(conflict.filePath);
                if (entry) {
                    setLastManualEntry(entry);
                    setManualAmount(entry.amount.toString());
                }
            } catch (error) {
                console.warn('Failed to load last manual entry:', error);
            }
        };
        loadLastEntry();
    }, [conflict.filePath]);

    const handleApply = async () => {
        const val = manualAmount || selectedAmount;
        const normalized = val.toString().replace(',', '.');
        const amount = parseFloat(normalized);
        if (isNaN(amount)) return;

        if (manualAmount) {
            try {
                await window.api.saveManualEntry(conflict.filePath, amount);
            } catch (error) {
                console.warn('Failed to save manual entry:', error);
            }
        }

        onResolve(amount);
    }

    const getAdjustedContext = (candidate) => {
        if (!candidate.fullContext) return candidate.context;
        const { fullContext, matchIndex, matchLength } = candidate.fullContext;
        const start = Math.max(0, matchIndex - contextWidth);
        const end = Math.min(fullContext.length, matchIndex + matchLength + contextWidth);
        return `...${fullContext.substring(start, end)}...`;
    };

    return (
        <div className="modal-overlay" style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.9)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', zIndex: 1000,
            padding: '1rem'
        }}>
            <div className="card" style={{
                maxWidth: showPdf ? '1400px' : '700px',
                width: '95%',
                maxHeight: '95vh',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
            }}>
                {/* Header */}
                <div className="flex-between" style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <h3 className="flex" style={{ margin: 0, gap: '0.5rem' }}>
                            <AlertTriangle style={{ color: 'var(--primary)' }} />
                            {t('conflictResolver.title')}
                        </h3>
                        {remainingConflicts > 0 && (
                            <span style={{
                                fontSize: '0.75rem',
                                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                                color: 'var(--error)',
                                padding: '0.25rem 0.6rem',
                                borderRadius: '1rem',
                                fontWeight: 700
                            }}>
                                {remainingConflicts} {t('conflictResolver.remaining')}
                            </span>
                        )}
                    </div>
                    <div className="flex" style={{ gap: '0.5rem' }}>
                        <button
                            className="btn-ghost"
                            onClick={() => setShowPdf(!showPdf)}
                            title={showPdf ? t('conflictResolver.hidePdf') : t('conflictResolver.showPdf')}
                        >
                            <FileText size={20} />
                        </button>
                        <button className="btn-ghost" onClick={onCancel}><X size={20} /></button>
                    </div>
                </div>

                {/* Content */}
                <div style={{
                    display: 'flex',
                    flex: 1,
                    overflow: 'hidden',
                    gap: showPdf ? '0' : '0'
                }}>
                    {/* PDF Preview */}
                    {showPdf && (
                        <div style={{
                            flex: '0 0 50%',
                            display: 'flex',
                            flexDirection: 'column',
                            borderRight: '1px solid var(--border)',
                            overflow: 'hidden'
                        }}>
                            <div className="flex-between" style={{ padding: '1rem', borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
                                <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{t('conflictResolver.pdfPreview')}</span>
                                <div className="flex" style={{ gap: '0.5rem' }}>
                                    <button
                                        className="btn-ghost"
                                        onClick={() => setPdfZoom(Math.max(50, pdfZoom - 25))}
                                        disabled={pdfZoom <= 50}
                                        style={{ padding: '0.25rem 0.5rem' }}
                                    >
                                        <ZoomOut size={16} />
                                    </button>
                                    <span style={{ fontSize: '0.75rem', minWidth: '50px', textAlign: 'center', alignSelf: 'center' }}>
                                        {pdfZoom}%
                                    </span>
                                    <button
                                        className="btn-ghost"
                                        onClick={() => setPdfZoom(Math.min(200, pdfZoom + 25))}
                                        disabled={pdfZoom >= 200}
                                        style={{ padding: '0.25rem 0.5rem' }}
                                    >
                                        <ZoomIn size={16} />
                                    </button>
                                    <button
                                        className="btn-ghost"
                                        onClick={() => window.api.openPath(conflict.filePath)}
                                        title={t('conflictResolver.openInSystemViewer')}
                                        style={{ padding: '0.25rem 0.5rem', marginLeft: '0.5rem' }}
                                    >
                                        <ExternalLink size={16} />
                                    </button>
                                </div>
                            </div>
                            <div style={{ flex: 1, overflow: 'auto', backgroundColor: '#525252', padding: '1rem' }}>
                                <iframe
                                    src={`app-file://${conflict.filePath}#zoom=${pdfZoom}`}
                                    style={{
                                        width: '100%',
                                        height: '100%',
                                        border: 'none',
                                        backgroundColor: 'white'
                                    }}
                                    title={t('conflictResolver.pdfPreview')}
                                />
                            </div>
                        </div>
                    )}

                    {/* Candidates Panel */}
                    <div style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden'
                    }}>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
                            <div style={{ marginBottom: '1.5rem' }}>
                                <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{conflict.fileName}</p>
                                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                                    {conflict.month} / {conflict.category}
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
                                        <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>Last Manual Entry</span>
                                    </div>
                                    <p style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0.5rem 0 0 0', color: 'var(--primary)' }}>
                                        {lastManualEntry.amount.toFixed(2)} €
                                    </p>
                                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>
                                        {new Date(lastManualEntry.timestamp).toLocaleString()}
                                    </p>
                                </div>
                            )}

                            <div style={{ marginBottom: '1.5rem' }}>
                                <div className="flex-between" style={{ marginBottom: '1rem' }}>
                                    <h4 style={{ margin: 0 }}>{t('conflictResolver.candidates')}</h4>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('conflictResolver.context')}:</label>
                                        <input
                                            type="range"
                                            min="20"
                                            max="150"
                                            value={contextWidth}
                                            onChange={(e) => setContextWidth(parseInt(e.target.value))}
                                            style={{ width: '100px' }}
                                        />
                                        <span style={{ fontSize: '0.75rem', fontWeight: 600, minWidth: '30px' }}>{contextWidth}</span>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    {conflict.candidates.length === 0 && (
                                        <p style={{ opacity: 0.5, fontStyle: 'italic' }}>{t('conflictResolver.noCandidates')}</p>
                                    )}
                                    {conflict.candidates.map((c, idx) => (
                                        <label
                                            key={idx}
                                            style={{
                                                cursor: 'pointer', padding: '1rem', border: '1px solid',
                                                borderColor: selectedAmount === c.amount.toString() ? 'var(--primary)' : 'var(--border)',
                                                borderRadius: '0.5rem',
                                                backgroundColor: selectedAmount === c.amount.toString() ? 'rgba(99, 102, 241, 0.05)' : 'transparent',
                                                display: 'flex',
                                                gap: '0.75rem'
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
                                                style={{ width: 'auto', marginTop: '0.25rem' }}
                                            />
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{c.amount.toFixed(2)} €</div>
                                                <div style={{
                                                    fontSize: '0.75rem',
                                                    color: 'var(--text-muted)',
                                                    fontFamily: 'monospace',
                                                    wordBreak: 'break-word',
                                                    lineHeight: '1.4',
                                                    marginTop: '0.25rem'
                                                }}>
                                                    {c.fullContext ? getAdjustedContext(c) : c.context}
                                                </div>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <h4>{t('conflictResolver.manualEntry')}</h4>
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    placeholder="0.00"
                                    value={manualAmount}
                                    style={{ fontSize: '1.25rem', fontWeight: 700, padding: '0.75rem', width: '100%' }}
                                    onChange={(e) => {
                                        const val = e.target.value.replace(/[^0-9.,]/g, '');
                                        setManualAmount(val);
                                        setSelectedAmount('');
                                    }}
                                />
                            </div>
                        </div>

                        <div className="flex-between" style={{ padding: '1.5rem', borderTop: '1px solid var(--border)' }}>
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
            </div>
        </div>
    )
}
