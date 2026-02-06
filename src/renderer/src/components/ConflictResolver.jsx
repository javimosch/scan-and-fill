import { useState, useEffect } from 'react'
import { AlertTriangle, Check, X, Info } from 'lucide-react'

export default function ConflictResolver({ conflict, onResolve, onCancel }) {
    const [selectedAmount, setSelectedAmount] = useState('')
    const [manualAmount, setManualAmount] = useState('')
    const [contextWidth, setContextWidth] = useState(50) // Characters to show on each side
    const [lastManualEntry, setLastManualEntry] = useState(null)

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
                        Resolve Conflict
                    </h3>
                    <button className="btn-ghost" onClick={onCancel}><X size={20} /></button>
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
                    <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{conflict.fileName}</p>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                        Located in: {conflict.month} / {conflict.category}
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
                            Entered on {new Date(lastManualEntry.timestamp).toLocaleString()}
                        </p>
                    </div>
                )}

                <div className="section" style={{ marginBottom: '1.5rem' }}>
                    <div className="flex-between" style={{ marginBottom: '1rem' }}>
                        <h4 style={{ margin: 0 }}>Extracted Candidates</h4>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                Context Width:
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
                        Choose the correct amount from the detected values:
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {conflict.candidates.length === 0 && (
                            <p style={{ opacity: 0.5, fontStyle: 'italic' }}>No candidates detected automatically.</p>
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

                <div className="section" style={{ marginBottom: '2rem' }}>
                    <h4>Manual Entry</h4>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                        Or enter the amount manually if none of the above are correct:
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
                    <button className="btn-ghost" onClick={onCancel}>Cancel</button>
                    <button
                        className="btn-primary flex"
                        disabled={!selectedAmount && !manualAmount}
                        onClick={handleApply}
                    >
                        <Check size={18} />
                        Apply Resolution
                    </button>
                </div>
            </div>
        </div>
    )
}
