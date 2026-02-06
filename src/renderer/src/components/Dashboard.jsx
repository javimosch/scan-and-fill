import { useTranslation } from 'react-i18next';
import { Folder, Plus, Edit2, Trash2, Play, RefreshCw } from 'lucide-react'
import LanguageSelector from './LanguageSelector';

export default function Dashboard({ projects, onCreate, onEdit, onDelete, onRun }) {
    const { t } = useTranslation();

    return (
        <div>
            <div className="flex-between" style={{ marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>{t('dashboard.recentProjects')}</h2>
                <button className="btn-primary flex" onClick={onCreate}>
                    <Plus size={18} />
                    {t('dashboard.scanNew')}
                </button>
            </div>

            {projects.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                    <Folder size={48} style={{ marginBottom: '1rem', opacity: 0.5, color: 'var(--text-muted)' }} />
                    <p style={{ color: 'var(--text-muted)' }}>{t('dashboard.noProjects')}</p>
                </div>
            ) : (
                <div className="grid">
                    {projects.map((project) => (
                        <div key={project.id} className="card">
                            <div className="flex-between" style={{ marginBottom: '1rem' }}>
                                <h3 style={{ margin: 0 }}>{project.name}</h3>
                                <div className="flex">
                                    <button className="btn-ghost" onClick={() => onEdit(project)} title={t('dashboard.settings')}>
                                        <Edit2 size={16} />
                                    </button>
                                    <button className="btn-ghost" style={{ color: 'var(--error)' }} onClick={() => onDelete(project.id)} title="Delete">
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>

                            <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                                <p style={{ margin: '0.25rem 0' }}>Root: {project.rootPath || 'Not set'}</p>
                                <p style={{ margin: '0.25rem 0' }}>Excel: {project.excelConfig?.filePath?.split('/').pop() || 'Not set'}</p>
                            </div>

                            <div className="flex" style={{ gap: '0.5rem' }}>
                                <button
                                    className="btn-primary flex"
                                    style={{ flex: 1, justifyContent: 'center' }}
                                    onClick={() => onRun(project)}
                                >
                                    <Play size={16} />
                                    {t('scan.startScan')}
                                </button>
                                <button
                                    className="btn-ghost"
                                    title="Force Re-scan"
                                    onClick={() => {
                                        if (confirm('Force a full re-scan? This will ignore the cache for this run.')) {
                                            onRun({ ...project, forceRescan: true });
                                        }
                                    }}
                                >
                                    <RefreshCw size={16} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <LanguageSelector />
        </div>
    )
}
