import { useState } from 'react'
import { AlertTriangle, Check, X } from 'lucide-react'

export default function ConflictResolver({ conflict, onResolve, onCancel }) {
    const [selectedAmount, setSelectedAmount] = useState('')
    const [manualAmount, setManualAmount] = useState('')

    const handleApply = () => {
        const val = manualAmount || selectedAmount;
        // Normalize comma to dot for parsing
        const normalized = val.toString().replace(',', '.');
        const amount = parseFloat(normalized);
        if (isNaN(amount)) return;
        onResolve(amount);
    }

    return (
        <div className="modal-overlay" style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', zIndex: 1000,
            userSelect: 'text' // Ensure text is selectable/editable
        }}>
            <div className="card" style={{ maxWidth: '600px', width: '90%', maxHeight: '90vh', overflowY: 'auto' }}>
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

                <div className="section" style={{ marginBottom: '1.5rem' }}>
                    <h4>Extracted Candidates</h4>
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
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                        {c.context}
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
