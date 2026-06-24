import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle, AlertCircle, Loader2, AlertTriangle, ArrowRight, Play, X, FileText, Calendar, LayoutGrid, Check, Ban, Pencil } from 'lucide-react'
import ConflictResolver from './ConflictResolverPDF'
import CollapsibleSection from './CollapsibleSection'

export default function ExecutionView({ project, reviewMode = false, onClose }) {
    const { t } = useTranslation()
    const [scope, setScope] = useState('all')
    const [selectedMonth, setSelectedMonth] = useState('')
    const [progress, setProgress] = useState(reviewMode
        ? { status: 'loading', message: t('execution.loadingProject'), progress: 0 }
        : { status: 'idle', message: t('execution.readyToStart'), progress: 0 })
    const [summary, setSummary] = useState(null)
    const [error, setError] = useState(null)
    const [activeConflictIdx, setActiveConflictIdx] = useState(null)
    const [mappingReport, setMappingReport] = useState(null)
    const [editingFile, setEditingFile] = useState(null)

    // Standard months for the selector - use fallback if translation not ready
    const monthsTranslated = t('execution.months', { returnObjects: true })
    const months = Array.isArray(monthsTranslated) ? monthsTranslated : ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

    useEffect(() => {
        const unsubscribe = window.api.onProgress((update) => {
            setProgress(update)
            if (update.status === 'waiting-resolutions' || update.status === 'review-results') {
                setSummary(update.summary)
            }
            if (update.status === 'mapping-results') {
                setMappingReport(update.mappingReport)
            }
        })
        return () => unsubscribe()
    }, [])

    // Review mode: load the project's cached results (no PDF parsing) so the user
    // can edit amounts / fix conflicts / apply without launching a scan.
    useEffect(() => {
        if (!reviewMode) return
        let cancelled = false
        ;(async () => {
            try {
                const s = await window.api.loadProjectState(project)
                if (cancelled) return
                setSummary(s)
                setProgress({ status: 'review-results', message: t('execution.reviewLoaded', { count: s.stats.total }) })
            } catch (err) {
                if (cancelled) return
                setError(err.message)
                setProgress({ status: 'error', message: 'Failed to load project state.' })
            }
        })()
        return () => { cancelled = true }
    }, [reviewMode])

    // Re-extract a single file on demand (used from the resolver to fix a conflict
    // or correct an extracted value without re-scanning the whole project).
    const handleReExtract = (filePath) => window.api.extractSingleFile(project, filePath)

    const handleStart = async () => {
        try {
            setError(null)
            setMappingReport(null)
            const runConfig = {
                ...project,
                monthFilter: scope === 'single' ? selectedMonth : null,
                mappingOnly: scope === 'mapping'
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

        // Persist the resolution so a future resume skips this file
        if (project?.id) window.api.cacheResolution(project.id, conflict.filePath, amount)

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

    // TODO: skip an entire category — mark its unresolved (ambiguous/failed) files
    // as skipped (counted as 0) so they no longer block applying.
    const handleSkipCategory = (category) => {
        const newSummary = { ...summary }
        newSummary.conflicts = newSummary.conflicts.map(c =>
            (c.category === category && c.resolvedAmount === undefined)
                ? { ...c, resolvedAmount: 0, skipped: true }
                : c
        )
        newSummary.files = newSummary.files.map(f =>
            (f.category === category && f.resolvedAmount === undefined && !['success', 'resolved'].includes(f.status))
                ? { ...f, resolvedAmount: 0, status: 'skip' }
                : f
        )
        setSummary(newSummary)
        if (activeConflictIdx !== null && newSummary.conflicts[activeConflictIdx]?.category === category) {
            setActiveConflictIdx(null)
        }
    }

    // Edit any file's amount (including already-extracted ones) via the resolver
    // modal, then persist so a future resume keeps the edit.
    const handleEditAmount = (amount) => {
        if (!editingFile) return
        const newSummary = { ...summary }
        const fileIdx = newSummary.files.findIndex(f => f.filePath === editingFile.filePath)
        if (fileIdx !== -1) {
            newSummary.files[fileIdx] = { ...newSummary.files[fileIdx], amount, resolvedAmount: amount, status: 'resolved' }
        }
        const cIdx = newSummary.conflicts.findIndex(c => c.filePath === editingFile.filePath)
        if (cIdx !== -1) newSummary.conflicts[cIdx].resolvedAmount = amount
        setSummary(newSummary)
        if (project?.id) window.api.cacheResolution(project.id, editingFile.filePath, amount)
        setEditingFile(null)
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

    // TODO: success rate — share of files with a usable amount (extracted,
    // resolved, or skipped), recomputed live as conflicts are resolved/skipped.
    const computeSuccessRate = () => {
        const total = summary.stats.total || summary.files.length
        if (!total) return { pct: 0, resolved: 0, total: 0 }
        const resolved = summary.files.filter(f =>
            f.resolvedAmount !== undefined || ['success', 'skip', 'resolved'].includes(f.status)
        ).length
        return { pct: Math.round((resolved / total) * 100), resolved, total }
    }

    const renderScanRecap = () => {
        if (!summary) return null
        const grouped = groupFiles(summary.files)
        const rate = computeSuccessRate()
        const rateColor = rate.pct >= 90 ? 'var(--success)' : rate.pct >= 60 ? '#d97706' : 'var(--error)'

        return (
            <div style={{ marginTop: '2rem' }}>
                <div className="flex-between" style={{ marginBottom: '1rem' }}>
                    <h3>{t('execution.scanRecap')}</h3>
                    <div className="flex" style={{ gap: '1rem', fontSize: '0.875rem', alignItems: 'center' }}>
                        <span title={`${rate.resolved}/${rate.total}`} style={{ fontWeight: 700, padding: '0.15rem 0.6rem', borderRadius: '999px', backgroundColor: 'rgba(255,255,255,0.06)', color: rateColor }}>
                            {t('execution.successRate')}: {rate.pct}%
                        </span>
                        <span className="flex" style={{ color: 'var(--success)' }}><CheckCircle size={14} /> {summary.stats.done + summary.stats.skipped} {t('execution.done')}</span>
                        <span className="flex" style={{ color: 'var(--primary)' }}><AlertTriangle size={14} /> {summary.stats.ambiguous} {t('execution.ambiguous')}</span>
                        <span className="flex" style={{ color: 'var(--error)' }}><AlertCircle size={14} /> {summary.stats.failed} {t('execution.failed')}</span>
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
                                            <span className="flex" style={{ gap: '0.4rem', alignItems: 'center' }}>
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
                                                <button className="btn-ghost flex" title={t('common.edit')} onClick={() => setEditingFile({ ...file, candidates: file.candidates || [] })} style={{ padding: '0.15rem 0.35rem' }}>
                                                    <Pencil size={13} />
                                                </button>
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
        if (!summary) return null
        // TODO: allow applying even when resolutions are pending — unresolved
        // items simply count as 0 (shown as a warning below).
        const pendingCount = summary.conflicts.filter(c => c.resolvedAmount === undefined).length

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
                <h3 style={{ marginTop: 0 }}>{t('conflictResolver.title')} - {t('execution.title')}</h3>
                <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>{t('projectForm.mappingTable.noMappings')}</p>

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
                    <span style={{ fontSize: '1.25rem', fontWeight: 700 }}>{t('conflictResolver.title')}</span>
                    <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary)' }}>{grandTotal.toFixed(2)} €</span>
                </div>

                {pendingCount > 0 && (
                    <div className="flex" style={{ marginTop: '1rem', padding: '0.75rem 1rem', gap: '0.5rem', color: '#d97706', backgroundColor: 'rgba(251, 191, 36, 0.1)', borderRadius: '8px', fontSize: '0.875rem' }}>
                        <AlertTriangle size={16} /> {t('execution.pendingWarning', { count: pendingCount })}
                    </div>
                )}

                <div className="flex" style={{ marginTop: '2rem', gap: '1rem' }}>
                    <button className="btn-ghost flex" onClick={onClose} style={{ flex: 1, justifyContent: 'center' }}>
                        <Ban size={18} /> {t('common.cancel')}
                    </button>
                    <button className="btn-primary flex" onClick={handleApply} style={{ flex: 2, justifyContent: 'center' }}>
                        <Check size={18} /> {pendingCount > 0 ? t('execution.applyAnyway') : t('conflictResolver.apply')}
                    </button>
                </div>
            </div>
        )
    }

    // TODO: "only analyze mapping" — show discovered categories and whether each
    // maps to a spreadsheet row, without any PDF parsing.
    const renderMappingReport = () => {
        if (!mappingReport) return null
        const { categories, mappedCount } = mappingReport
        return (
            <div style={{ marginTop: '2rem' }}>
                <div className="flex-between" style={{ marginBottom: '1rem' }}>
                    <h3 className="flex" style={{ gap: '0.5rem' }}><LayoutGrid size={18} /> {t('execution.mappingTitle')}</h3>
                    <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                        {t('execution.mappingSummary', { mapped: mappedCount, total: categories.length })}
                    </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    {categories.map((c, i) => {
                        const isMapped = c.mappedRow != null && c.mappedRow !== ''
                        return (
                            <div key={i} className="card flex-between" style={{ padding: '0.5rem 0.75rem', fontSize: '0.875rem' }}>
                                <span className="flex" style={{ gap: '0.5rem' }}>
                                    <LayoutGrid size={14} />
                                    <span style={{ fontWeight: 600 }}>{c.category}</span>
                                    <span style={{ opacity: 0.6 }}>· {c.fileCount} {t('execution.filesCount')} · {c.months.length} {t('execution.scopeSingle').toLowerCase()}</span>
                                </span>
                                {isMapped ? (
                                    <span className="flex" style={{ color: '#34d399', fontWeight: 600, gap: '0.3rem' }}>
                                        <Check size={14} /> {t('execution.mapped')} · {t('execution.excelRow')} {c.mappedRow}
                                    </span>
                                ) : (
                                    <span className="flex" style={{ color: '#f87171', fontWeight: 600, gap: '0.3rem' }}>
                                        <Ban size={14} /> {t('execution.unmapped')}
                                    </span>
                                )}
                            </div>
                        )
                    })}
                </div>
            </div>
        )
    }

    // --- Main Render Logic ---

    if (progress.status === 'idle') {
        return (
            <div className="card" style={{ maxWidth: '600px', margin: '2rem auto', textAlign: 'center' }}>
                <h2>{t('execution.title')}</h2>
                <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>{t('execution.selectMonth')}</p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
                    <label className={`card flex ${scope === 'all' ? 'selected' : ''}`} style={{ cursor: 'pointer', padding: '1.5rem', border: '1px solid var(--border)' }}>
                        <input type="radio" name="scope" value="all" checked={scope === 'all'} onChange={() => setScope('all')} style={{ width: 'auto' }} />
                        <div style={{ textAlign: 'left', flex: 1 }}>
                            <div style={{ fontWeight: 700 }}>{t('execution.scopeAll')}</div>
                            <div style={{ fontSize: '0.875rem', opacity: 0.7 }}>{t('projectForm.mappingTable.noMappings')}</div>
                        </div>
                    </label>

                    <label className={`card flex ${scope === 'single' ? 'selected' : ''}`} style={{ cursor: 'pointer', padding: '1.5rem', border: '1px solid var(--border)' }}>
                        <input type="radio" name="scope" value="single" checked={scope === 'single'} onChange={() => setScope('single')} style={{ width: 'auto' }} />
                        <div style={{ textAlign: 'left', flex: 1 }}>
                            <div style={{ fontWeight: 700 }}>{t('execution.scopeSingle')}</div>
                            <select
                                value={selectedMonth}
                                onChange={(e) => { setScope('single'); setSelectedMonth(e.target.value); }}
                                style={{ marginTop: '0.5rem', padding: '0.5rem' }}
                                disabled={scope !== 'single'}
                            >
                                <option value="">{t('execution.selectMonth')}</option>
                                {months.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>
                    </label>

                    <label className={`card flex ${scope === 'mapping' ? 'selected' : ''}`} style={{ cursor: 'pointer', padding: '1.5rem', border: '1px solid var(--border)' }}>
                        <input type="radio" name="scope" value="mapping" checked={scope === 'mapping'} onChange={() => setScope('mapping')} style={{ width: 'auto' }} />
                        <div style={{ textAlign: 'left', flex: 1 }}>
                            <div className="flex" style={{ fontWeight: 700, gap: '0.4rem' }}><LayoutGrid size={16} /> {t('execution.scopeMapping')}</div>
                            <div style={{ fontSize: '0.875rem', opacity: 0.7 }}>{t('execution.scopeMappingDesc')}</div>
                        </div>
                    </label>
                </div>

                <div className="flex" style={{ gap: '1rem' }}>
                    <button className="btn-ghost" onClick={onClose} style={{ flex: 1 }}>{t('common.cancel')}</button>
                    <button className="btn-primary flex" onClick={handleStart} style={{ flex: 2, justifyContent: 'center' }} disabled={scope === 'single' && !selectedMonth}>
                        <Play size={18} /> {scope === 'mapping' ? t('execution.analyzeMapping') : t('execution.startScan')}
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
                {(progress.status === 'done' || progress.status === 'error' || progress.status === 'mapping-results') && (
                    <button className="btn-primary" onClick={onClose}>{t('common.close')}</button>
                )}
            </div>

            <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                {['scanning', 'parsing', 'writing', 'loading'].includes(progress.status) ? (
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

            {progress.status === 'mapping-results' && renderMappingReport()}

            {(progress.status === 'waiting-resolutions' || progress.status === 'review-results' || progress.status === 'done') && (
                <>
                    {renderScanRecap()}

                    {pendingConflicts.length > 0 && (
                        <div style={{ marginTop: '2rem', padding: '1.5rem', backgroundColor: 'rgba(239, 68, 68, 0.05)', borderRadius: '8px' }}>
                            <h3 className="flex" style={{ color: 'var(--error)' }}><AlertTriangle size={18} /> Action Required: Resolutions</h3>
                            <div className="flex" style={{ flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
                                {[...new Set(pendingConflicts.map(c => c.category))].map(cat => (
                                    <button key={cat} className="btn-ghost flex" style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem', gap: '0.3rem' }} onClick={() => handleSkipCategory(cat)}>
                                        <Ban size={12} /> {t('execution.skipCategory')}: {cat}
                                    </button>
                                ))}
                            </div>
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
                    remainingConflicts={pendingConflicts.length}
                    onResolve={handleResolveConflict}
                    onReExtract={handleReExtract}
                    onCancel={() => setActiveConflictIdx(null)}
                />
            )}

            {editingFile && (
                <ConflictResolver
                    key={editingFile.filePath}
                    conflict={editingFile}
                    remainingConflicts={0}
                    onResolve={handleEditAmount}
                    onReExtract={handleReExtract}
                    onCancel={() => setEditingFile(null)}
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
