import { useState, useEffect } from 'react'
import { CheckCircle, AlertCircle, Loader2, AlertTriangle, ArrowRight, Play, X, FileText, Calendar, LayoutGrid, Check, Ban } from 'lucide-react'
import ConflictResolver from './ConflictResolverPDF'
import CollapsibleSection from './CollapsibleSection'

export default function ExecutionView({ project, onClose }) {
    const [scope, setScope] = useState('all')
    const [selectedMonth, setSelectedMonth] = useState('')
    const [progress, setProgress] = useState({ status: 'idle', message: 'Ready to start...', progress: 0 })
    const [summary, setSummary] = useState(null)
    const [error, setError] = useState(null)
    const [activeConflictIdx, setActiveConflictIdx] = useState(null)

    // Standard months for the selector
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

    useEffect(() => {
        const unsubscribe = window.api.onProgress((update) => {
            setProgress(update)
            if (update.status === 'waiting-resolutions' || update.status === 'review-results') {
                setSummary(update.summary)
            }
        })
        return () => unsubscribe()
    }, [])

    const handleStart = async () => {
        try {
            setError(null)
            const runConfig = {
                ...project,
                monthFilter: scope === 'single' ? selectedMonth : null
            }
            await window.api.runProject(runConfig)
        } catch (err) {
            setError(err.message)
            setProgress({ status: 'error', message: 'Failed to run project.' })
        }
    }

    const handleResolveConflict = (amount) => {
        const newSummary = { ...summary }
        const conflict = newSummary.conflicts[activeConflictIdx]

        // Find matching file in summary.files to update it too
        const fileIdx = newSummary.files.findIndex(f => f.filePath === conflict.filePath)
        if (fileIdx !== -1) {
            newSummary.files[fileIdx].resolvedAmount = amount
            newSummary.files[fileIdx].status = 'resolved'
        }

        newSummary.conflicts[activeConflictIdx].resolvedAmount = amount
        setSummary(newSummary)

        // Auto-advance to next unresolved conflict
        let nextIdx = -1;
        // Search forward
        for (let i = activeConflictIdx + 1; i < newSummary.conflicts.length; i++) {
            if (newSummary.conflicts[i].resolvedAmount === undefined) {
                nextIdx = i;
                break;
            }
        }
        // Search backward (wrap around)
        if (nextIdx === -1) {
            for (let i = 0; i < activeConflictIdx; i++) {
                if (newSummary.conflicts[i].resolvedAmount === undefined) {
                    nextIdx = i;
                    break;
                }
            }
        }

        if (nextIdx !== -1) {
            setActiveConflictIdx(nextIdx);
        } else {
            setActiveConflictIdx(null);
        }
    }

    const handleApply = async () => {
        try {
            setProgress({ status: 'writing', message: 'Updating Excel sheet...' })
            await window.api.finalizeProject(project, summary)
            setProgress({ status: 'done', message: 'Excel updated successfully!' })
        } catch (err) {
            setError(err.message)
            setProgress({ status: 'error', message: 'Failed to update Excel.' })
        }
    }

    const groupFiles = (files) => {
        const grouped = {}
        files.forEach(f => {
            if (!grouped[f.month]) grouped[f.month] = {}
            if (!grouped[f.month][f.category]) grouped[f.month][f.category] = []
            grouped[f.month][f.category].push(f)
        })
        return grouped
    }

    const renderScanRecap = () => {
        if (!summary) return null
        const grouped = groupFiles(summary.files)

        return (
            <div style={{ marginTop: '2rem' }}>
                <div className="flex-between" style={{ marginBottom: '1rem' }}>
                    <h3>Scan Recap</h3>
                    <div className="flex" style={{ gap: '1rem', fontSize: '0.875rem' }}>
                        <span className="flex" style={{ color: 'var(--success)' }}><CheckCircle size={14} /> {summary.stats.done + summary.stats.skipped} Done</span>
                        <span className="flex" style={{ color: 'var(--primary)' }}><AlertTriangle size={14} /> {summary.stats.ambiguous} Ambiguous</span>
                        <span className="flex" style={{ color: 'var(--error)' }}><AlertCircle size={14} /> {summary.stats.failed} Failed</span>
                    </div>
                </div>

                {Object.entries(grouped).map(([month, categories]) => (
                    <CollapsibleSection key={month} title={month} icon={Calendar}>
                        {Object.entries(categories).map(([category, files]) => (
                            <CollapsibleSection key={category} title={category} icon={LayoutGrid} defaultOpen={scope === 'single'}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                    {files.map((file, i) => (
                                        <div key={i} className="flex-between" style={{ padding: '0.4rem', fontSize: '0.875rem', opacity: 0.8 }}>
                                            <span className="flex">
                                                <FileText size={14} />
                                                <span style={{ marginLeft: '0.4rem' }}>{file.fileName}</span>
                                                {['success', 'skip', 'resolved'].includes(file.status) && (
                                                    <span style={{ marginLeft: '0.5rem', fontWeight: 600, color: '#34d399' }}>
                                                        ({file.amount.toFixed(2)} €)
                                                    </span>
                                                )}
                                            </span>
                                            <span className={`status-tag ${file.status}`} style={{
                                                padding: '0.1rem 0.5rem',
                                                borderRadius: '4px',
                                                fontSize: '0.7rem',
                                                backgroundColor: file.status === 'skip' ? 'rgba(255,255,255,0.1)' :
                                                    file.status === 'success' ? 'rgba(34,197,94,0.1)' :
                                                        file.status === 'resolved' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.1)',
                                                color: file.status === 'skip' ? 'inherit' :
                                                    file.status === 'success' || file.status === 'resolved' ? '#34d399' : '#f87171'
                                            }}>
                                                {file.status.toUpperCase()}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </CollapsibleSection>
                        ))}
                    </CollapsibleSection>
                ))}
            </div>
        )
    }

    const renderAssignmentPreview = () => {
        if (!summary || summary.conflicts.some(c => c.resolvedAmount === undefined)) return null

        // Calculate dynamic totals including resolutions
        const finalTotals = {}
        summary.files.forEach(f => {
            const amt = f.resolvedAmount !== undefined ? f.resolvedAmount : f.amount;
            if (!finalTotals[f.category]) finalTotals[f.category] = { total: 0, items: [] };
            finalTotals[f.category].total += amt;
            finalTotals[f.category].items.push({ month: f.month, amount: amt });
        });

        const grandTotal = Object.values(finalTotals).reduce((acc, cat) => acc + cat.total, 0);

        return (
            <div style={{ marginTop: '3rem', padding: '2rem', border: '2px solid var(--primary)', borderRadius: '12px', backgroundColor: 'rgba(124, 58, 237, 0.05)' }}>
                <h3 style={{ marginTop: 0 }}>Assignment Preview (Auto-fill)</h3>
                <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>Review the calculated totals per category before applying to Excel.</p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {Object.entries(finalTotals).map(([cat, info]) => (
                        <CollapsibleSection key={cat} title={cat} badge={`${info.total.toFixed(2)} €`} defaultOpen={scope === 'single'}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {info.items.map((item, idx) => (
                                    <div key={idx} className="flex-between" style={{ fontSize: '0.9rem' }}>
                                        <span>{item.month}</span>
                                        <span style={{ fontWeight: 600 }}>{item.amount.toFixed(2)} €</span>
                                    </div>
                                ))}
                            </div>
                        </CollapsibleSection>
                    ))}
                </div>

                <div className="flex-between" style={{ marginTop: '2rem', padding: '1rem', borderTop: '2px solid var(--border)' }}>
                    <span style={{ fontSize: '1.25rem', fontWeight: 700 }}>Grand Total</span>
                    <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary)' }}>{grandTotal.toFixed(2)} €</span>
                </div>

                <div className="flex" style={{ marginTop: '2rem', gap: '1rem' }}>
                    <button className="btn-ghost flex" onClick={onClose} style={{ flex: 1, justifyContent: 'center' }}>
                        <Ban size={18} /> Cancel
                    </button>
                    <button className="btn-primary flex" onClick={handleApply} style={{ flex: 2, justifyContent: 'center' }}>
                        <Check size={18} /> Apply to Excel
                    </button>
                </div>
            </div>
        )
    }

    // --- Main Render Logic ---

    if (progress.status === 'idle') {
        return (
            <div className="card" style={{ maxWidth: '600px', margin: '2rem auto', textAlign: 'center' }}>
                <h2>Processing Scope</h2>
                <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>Choose which months you want to scan and auto-fill.</p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
                    <label className={`card flex ${scope === 'all' ? 'selected' : ''}`} style={{ cursor: 'pointer', padding: '1.5rem', border: '1px solid var(--border)' }}>
                        <input type="radio" name="scope" value="all" checked={scope === 'all'} onChange={() => setScope('all')} style={{ width: 'auto' }} />
                        <div style={{ textAlign: 'left', flex: 1 }}>
                            <div style={{ fontWeight: 700 }}>All (Detect from root)</div>
                            <div style={{ fontSize: '0.875rem', opacity: 0.7 }}>Scans all month folders found in the root directory.</div>
                        </div>
                    </label>

                    <label className={`card flex ${scope === 'single' ? 'selected' : ''}`} style={{ cursor: 'pointer', padding: '1.5rem', border: '1px solid var(--border)' }}>
                        <input type="radio" name="scope" value="single" checked={scope === 'single'} onChange={() => setScope('single')} style={{ width: 'auto' }} />
                        <div style={{ textAlign: 'left', flex: 1 }}>
                            <div style={{ fontWeight: 700 }}>Single Month</div>
                            <select
                                value={selectedMonth}
                                onChange={(e) => { setScope('single'); setSelectedMonth(e.target.value); }}
                                style={{ marginTop: '0.5rem', padding: '0.5rem' }}
                                disabled={scope !== 'single'}
                            >
                                <option value="">Select a month...</option>
                                {months.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>
                    </label>
                </div>

                <div className="flex" style={{ gap: '1rem' }}>
                    <button className="btn-ghost" onClick={onClose} style={{ flex: 1 }}>Cancel</button>
                    <button className="btn-primary flex" onClick={handleStart} style={{ flex: 2, justifyContent: 'center' }} disabled={scope === 'single' && !selectedMonth}>
                        <Play size={18} /> Start Process
                    </button>
                </div>
            </div>
        )
    }

    const pendingConflicts = summary?.conflicts.filter(c => c.resolvedAmount === undefined) || []

    return (
        <div className="card" style={{ maxWidth: '900px', margin: '2rem auto' }}>
            <div className="flex-between" style={{ marginBottom: '2rem' }}>
                <h2 style={{ margin: 0 }}>Processing: {project.name}</h2>
                {(progress.status === 'done' || progress.status === 'error') && (
                    <button className="btn-primary" onClick={onClose}>Close</button>
                )}
            </div>

            <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                {['scanning', 'parsing', 'writing'].includes(progress.status) ? (
                    <Loader2 size={48} className="animate-spin" style={{ color: 'var(--primary)', marginBottom: '1rem' }} />
                ) : progress.status === 'done' ? (
                    <CheckCircle size={48} style={{ color: 'var(--success)', marginBottom: '1rem' }} />
                ) : progress.status === 'error' ? (
                    <AlertCircle size={48} style={{ color: 'var(--error)', marginBottom: '1rem' }} />
                ) : (
                    <CheckCircle size={48} style={{ color: 'var(--primary)', marginBottom: '1rem', opacity: 0.5 }} />
                )}

                <p style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>{progress.message}</p>

                {progress.status === 'parsing' && (
                    <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--bg)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ width: `${progress.progress}%`, height: '100%', backgroundColor: 'var(--primary)', transition: 'width 0.3s ease' }} />
                    </div>
                )}
            </div>

            {(progress.status === 'waiting-resolutions' || progress.status === 'review-results' || progress.status === 'done') && (
                <>
                    {renderScanRecap()}

                    {pendingConflicts.length > 0 && (
                        <div style={{ marginTop: '2rem', padding: '1.5rem', backgroundColor: 'rgba(239, 68, 68, 0.05)', borderRadius: '8px' }}>
                            <h3 className="flex" style={{ color: 'var(--error)' }}><AlertTriangle size={18} /> Action Required: Resolutions</h3>
                            <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {summary.conflicts.map((conflict, idx) => (
                                    <div key={idx} className="card flex-between" style={{ padding: '0.75rem 1rem' }}>
                                        <div style={{ flex: 1 }}>
                                            <div className="flex" style={{ gap: '0.5rem', alignItems: 'center' }}>
                                                <span style={{ fontWeight: 600 }}>{conflict.fileName}</span>
                                                <span style={{
                                                    fontSize: '0.65rem',
                                                    fontWeight: 600,
                                                    padding: '0.15rem 0.4rem',
                                                    borderRadius: '0.25rem',
                                                    backgroundColor: conflict.status === 'failed' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(251, 191, 36, 0.15)',
                                                    color: conflict.status === 'failed' ? 'var(--error)' : '#d97706',
                                                    textTransform: 'uppercase'
                                                }}>
                                                    {conflict.status === 'failed' ? 'Failed' : 'Ambiguous'}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{conflict.month} / {conflict.category}</div>
                                        </div>
                                        {conflict.resolvedAmount !== undefined ? (
                                            <div className="flex" style={{ color: 'var(--success)', fontWeight: 600 }}>
                                                <CheckCircle size={16} /> {conflict.resolvedAmount.toFixed(2)} €
                                            </div>
                                        ) : (
                                            <button className="btn-ghost" onClick={() => setActiveConflictIdx(idx)}>Resolve</button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {progress.status !== 'done' && renderAssignmentPreview()}
                </>
            )}

            {activeConflictIdx !== null && (
                <ConflictResolver
                    key={activeConflictIdx}
                    conflict={summary.conflicts[activeConflictIdx]}
                    onResolve={handleResolveConflict}
                    onCancel={() => setActiveConflictIdx(null)}
                />
            )}

            {error && (
                <div style={{ color: 'var(--error)', marginTop: '2rem', padding: '1rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: '0.5rem' }}>
                    {error}
                </div>
            )}
        </div>
    )
}
