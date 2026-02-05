import { useState, useEffect } from 'react'
import { CheckCircle, AlertCircle, Loader2, AlertTriangle, ArrowRight } from 'lucide-react'
import ConflictResolver from './ConflictResolver'

export default function ExecutionView({ project, onClose }) {
    const [progress, setProgress] = useState({ status: 'idle', message: 'Ready to start...', progress: 0 })
    const [summary, setSummary] = useState(null)
    const [error, setError] = useState(null)
    const [activeConflictIdx, setActiveConflictIdx] = useState(null)

    useEffect(() => {
        runProject()

        const unsubscribe = window.api.onProgress((update) => {
            setProgress(update)
            if (update.status === 'waiting-resolutions') {
                setSummary(update.summary)
            } else if (update.status === 'done') {
                // Final success
            }
        })

        return () => unsubscribe()
    }, [])

    const runProject = async () => {
        try {
            await window.api.runProject(project)
        } catch (err) {
            setError(err.message)
            setProgress({ status: 'error', message: 'Failed to run project.' })
        }
    }

    const handleResolveConflict = (amount) => {
        const newSummary = { ...summary }
        newSummary.conflicts[activeConflictIdx].resolvedAmount = amount
        setSummary(newSummary)
        setActiveConflictIdx(null)
    }

    const handleFinalize = async () => {
        try {
            setProgress({ status: 'writing', message: 'Updating Excel sheet...' })
            await window.api.finalizeProject(project, summary)
            setProgress({ status: 'done', message: 'Process completed successfully!' })
        } catch (err) {
            setError(err.message)
            setProgress({ status: 'error', message: 'Failed to update Excel.' })
        }
    }

    const pendingConflicts = summary?.conflicts.filter(c => c.resolvedAmount === undefined) || []

    return (
        <div className="card" style={{ maxWidth: '800px', margin: '2rem auto' }}>
            <div className="flex-between" style={{ marginBottom: '2rem' }}>
                <h2 style={{ margin: 0 }}>Processing: {project.name}</h2>
                {(progress.status === 'done' || progress.status === 'error') && (
                    <button className="btn-primary" onClick={onClose}>Close</button>
                )}
            </div>

            <div style={{ textAlign: 'center', padding: '2rem 0', borderBottom: summary ? '1px solid var(--border)' : 'none' }}>
                {progress.status === 'scanning' || progress.status === 'parsing' || progress.status === 'writing' ? (
                    <Loader2 size={48} className="animate-spin" style={{ color: 'var(--primary)', marginBottom: '1rem' }} />
                ) : progress.status === 'done' ? (
                    <CheckCircle size={48} style={{ color: 'var(--success)', marginBottom: '1rem' }} />
                ) : progress.status === 'error' ? (
                    <AlertCircle size={48} style={{ color: 'var(--error)', marginBottom: '1rem' }} />
                ) : progress.status === 'waiting-resolutions' ? (
                    <AlertTriangle size={48} style={{ color: 'var(--primary)', marginBottom: '1rem' }} />
                ) : null}

                <p style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>{progress.message}</p>

                {(progress.status === 'parsing') && (
                    <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--bg)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div
                            style={{
                                width: `${progress.progress}%`,
                                height: '100%',
                                backgroundColor: 'var(--primary)',
                                transition: 'width 0.3s ease'
                            }}
                        />
                    </div>
                )}
            </div>

            {progress.status === 'waiting-resolutions' && summary && (
                <div style={{ marginTop: '2rem' }}>
                    <div className="flex-between">
                        <h3>Conflicts & Issues ({pendingConflicts.length} pending)</h3>
                        {pendingConflicts.length === 0 && (
                            <button className="btn-primary flex" onClick={handleFinalize}>
                                Finalize & Update Excel
                                <ArrowRight size={18} />
                            </button>
                        )}
                    </div>

                    <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {summary.conflicts.map((conflict, idx) => (
                            <div key={idx} className="card flex-between" style={{ padding: '0.75rem 1rem', border: '1px solid var(--border)' }}>
                                <div>
                                    <div style={{ fontWeight: 600 }}>{conflict.fileName}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        {conflict.month} / {conflict.category} • {conflict.status.toUpperCase()}
                                    </div>
                                </div>
                                {conflict.resolvedAmount !== undefined ? (
                                    <div className="flex" style={{ color: 'var(--success)', fontWeight: 600 }}>
                                        <CheckCircle size={16} /> {conflict.resolvedAmount.toFixed(2)} €
                                    </div>
                                ) : (
                                    <button className="btn-ghost" onClick={() => setActiveConflictIdx(idx)}>
                                        Resolve
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {progress.status === 'done' && (
                <div style={{ marginTop: '2rem', textAlign: 'center' }}>
                    <p style={{ color: 'var(--text-muted)' }}>All files processed and Excel sheet updated.</p>
                </div>
            )}

            {activeConflictIdx !== null && (
                <ConflictResolver
                    conflict={summary.conflicts[activeConflictIdx]}
                    onResolve={handleResolveConflict}
                    onCancel={() => setActiveConflictIdx(null)}
                />
            )}

            {error && (
                <div style={{ color: 'var(--error)', marginTop: '1rem', padding: '1rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: '0.5rem' }}>
                    {error}
                </div>
            )}
        </div>
    )
}
