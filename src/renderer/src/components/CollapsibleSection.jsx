import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

export default function CollapsibleSection({ title, children, defaultOpen = false, icon: Icon, badge, color }) {
    const [isOpen, setIsOpen] = useState(defaultOpen)

    return (
        <div style={{ marginBottom: '0.5rem', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
            <button
                type="button"
                className="flex-between"
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    backgroundColor: color || 'var(--card-bg)',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left'
                }}
            >
                <div className="flex" style={{ gap: '0.75rem' }}>
                    {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    {Icon && <Icon size={18} style={{ color: 'var(--primary)' }} />}
                    <span style={{ fontWeight: 600 }}>{title}</span>
                    {badge && (
                        <span style={{
                            fontSize: '0.75rem',
                            padding: '0.1rem 0.5rem',
                            backgroundColor: 'var(--bg)',
                            borderRadius: '10px',
                            border: '1px solid var(--border)'
                        }}>
                            {badge}
                        </span>
                    )}
                </div>
            </button>
            {isOpen && (
                <div style={{ padding: '0.5rem 1rem 1rem 1rem', borderTop: '1px solid var(--border)', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                    {children}
                </div>
            )}
        </div>
    )
}
