import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Save, X, Plus, Trash2, FolderPlus, Loader2, Calendar, Target, FolderSearch, FileSearch } from 'lucide-react'

export default function ProjectForm({ project, onSave, onCancel }) {
    const { t } = useTranslation()
    const initialProject = {
        ...project,
        categoryMapping: project.categoryMapping || {},
        excelConfig: project.excelConfig || {
            filePath: '',
            sheetName: '',
            monthStartCell: 'B1',
            categoryColumn: 'A',
            categoryRowsMap: {}
        }
    }

    const [formData, setFormData] = useState(initialProject)
    const [excelMetadata, setExcelMetadata] = useState({ tabs: [], categories: {}, months: [] })
    const [loadingMetadata, setLoadingMetadata] = useState(false)
    const [newFolderName, setNewFolderName] = useState('')
    const [showAddRow, setShowAddRow] = useState(false)

    const formDataRef = useRef(formData)
    useEffect(() => { formDataRef.current = formData }, [formData])

    useEffect(() => {
        if (formData.excelConfig.filePath) {
            loadExcelMetadata()
        }
    }, [formData.excelConfig.filePath, formData.excelConfig.sheetName, formData.excelConfig.categoryColumn, formData.excelConfig.monthStartCell])

    const loadExcelMetadata = async () => {
        setLoadingMetadata(true)
        try {
            const metadata = await window.api.getExcelMetadata(
                formData.excelConfig.filePath,
                formData.excelConfig.sheetName,
                formData.excelConfig.categoryColumn,
                formData.excelConfig.monthStartCell
            )
            setExcelMetadata(metadata)

            if (Object.keys(formDataRef.current.categoryMapping).length > 0) {
                const updatedRowsMap = { ...formDataRef.current.excelConfig.categoryRowsMap }
                let changed = false;

                Object.values(formDataRef.current.categoryMapping).forEach(label => {
                    if (label && metadata.categories[label] !== undefined) {
                        const newRow = metadata.categories[label].row;
                        if (updatedRowsMap[label] !== newRow) {
                            updatedRowsMap[label] = newRow;
                            changed = true;
                        }
                    }
                });

                if (changed) {
                    setFormData(prev => ({
                        ...prev,
                        excelConfig: { ...prev.excelConfig, categoryRowsMap: updatedRowsMap }
                    }));
                }
            }
        } catch (error) {
            console.error('Failed to load excel metadata:', error)
        } finally {
            setLoadingMetadata(false)
        }
    }

    const handleChange = (e) => {
        const { name, value } = e.target
        setFormData(prev => ({ ...prev, [name]: value }))
    }

    const handleExcelConfigChange = (e) => {
        const { name, value } = e.target
        setFormData(prev => ({
            ...prev,
            excelConfig: { ...prev.excelConfig, [name]: value }
        }))
    }

    const handleCategoryMappingChange = (folderName, excelLabel) => {
        const catInfo = excelMetadata.categories[excelLabel]
        const rowNumber = catInfo ? catInfo.row : null

        setFormData(prev => ({
            ...prev,
            categoryMapping: { ...prev.categoryMapping, [folderName]: excelLabel },
            excelConfig: {
                ...prev.excelConfig,
                categoryRowsMap: {
                    ...prev.excelConfig.categoryRowsMap,
                    [excelLabel]: rowNumber
                }
            }
        }))
    }

    const addMappingRow = (e) => {
        if (e) e.preventDefault()
        if (newFolderName && !formData.categoryMapping[newFolderName]) {
            setFormData(prev => ({
                ...prev,
                categoryMapping: { ...prev.categoryMapping, [newFolderName]: '' }
            }))
            setNewFolderName('')
            setShowAddRow(false)
        }
    }

    const removeMappingRow = (folderName) => {
        const newMapping = { ...formData.categoryMapping }
        delete newMapping[folderName]
        setFormData(prev => ({ ...prev, categoryMapping: newMapping }))
    }

    const handleSelectDirectory = async () => {
        const path = await window.api.selectDirectory()
        if (path) {
            setFormData(prev => ({ ...prev, rootPath: path }))
        }
    }

    const handleSelectFile = async () => {
        const path = await window.api.selectFile([
            { name: 'Spreadsheets', extensions: ['xlsx', 'ods'] },
            { name: 'All Files', extensions: ['*'] }
        ])
        if (path) {
            setFormData(prev => ({
                ...prev,
                excelConfig: { ...prev.excelConfig, filePath: path }
            }))
        }
    }

    const handleSubmit = (e) => {
        e.preventDefault()
        onSave(formData)
    }

    return (
        <form className="card" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div className="flex-between">
                <h2 style={{ margin: 0 }}>{project.name ? t('projectForm.editTitle') : t('projectForm.newProject')}</h2>
                <div className="flex">
                    <button type="button" className="btn-ghost" onClick={onCancel}>
                        <X size={18} />
                    </button>
                    <button type="submit" className="btn-primary flex" disabled={loadingMetadata}>
                        <Save size={18} />
                        {t('projectForm.saveProject')}
                    </button>
                </div>
            </div>

            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                <div className="section">
                    <h3>{t('projectForm.generalSettings')}</h3>
                    <div className="input-group">
                        <label>{t('projectForm.projectName')}</label>
                        <input name="name" value={formData.name} onChange={handleChange} required placeholder={t('projectForm.projectNamePlaceholder')} />
                    </div>
                    <div className="input-group">
                        <label>{t('projectForm.rootFolder')}</label>
                        <div className="flex" style={{ gap: '0.5rem' }}>
                            <input name="rootPath" value={formData.rootPath} onChange={handleChange} required placeholder={t('projectForm.rootFolderPlaceholder')} style={{ flex: 1 }} />
                            <button type="button" className="btn-ghost" onClick={handleSelectDirectory} title={t('projectForm.selectDirectory')}>
                                <FolderSearch size={18} />
                            </button>
                        </div>
                    </div>
                </div>

                <div className="section">
                    <h3>{t('projectForm.spreadsheetSettings')}</h3>
                    <div className="input-group">
                        <label>{t('projectForm.filePath')}</label>
                        <div className="flex" style={{ gap: '0.5rem' }}>
                            <input name="filePath" value={formData.excelConfig.filePath} onChange={handleExcelConfigChange} required placeholder={t('projectForm.filePathPlaceholder')} style={{ flex: 1 }} />
                            <button type="button" className="btn-ghost" onClick={handleSelectFile} title={t('projectForm.selectSpreadsheet')}>
                                <FileSearch size={18} />
                            </button>
                        </div>
                    </div>
                    <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div className="input-group">
                            <label>{t('projectForm.sheetTab')} {loadingMetadata && <Loader2 size={12} className="animate-spin inline" />}</label>
                            <select name="sheetName" value={formData.excelConfig.sheetName} onChange={handleExcelConfigChange} required>
                                <option value="">{t('projectForm.selectTab')}</option>
                                {excelMetadata.tabs.map(tab => <option key={tab} value={tab}>{tab}</option>)}
                            </select>
                        </div>
                        <div className="input-group">
                            <label>{t('projectForm.monthStartCell')}</label>
                            <input name="monthStartCell" value={formData.excelConfig.monthStartCell} onChange={handleExcelConfigChange} placeholder={t('projectForm.monthStartCellPlaceholder')} />
                        </div>
                    </div>
                    <div className="input-group" style={{ marginTop: '0.5rem' }}>
                        <label>{t('projectForm.categoryColumn')}</label>
                        <input name="categoryColumn" value={formData.excelConfig.categoryColumn} onChange={handleExcelConfigChange} placeholder={t('projectForm.categoryColumnPlaceholder')} />
                    </div>
                </div>
            </div>

            {excelMetadata.months.length > 0 && (
                <div className="section" style={{ backgroundColor: 'rgba(124, 58, 237, 0.05)', padding: '1rem', borderRadius: '8px' }}>
                    <h4 className="flex" style={{ marginTop: 0, fontSize: '0.9rem' }}><Calendar size={16} /> {t('projectForm.inferredMonthMapping')}</h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', marginTop: '0.5rem' }}>
                        {excelMetadata.months.map((m, idx) => (
                            <div key={idx} style={{ fontSize: '0.8rem' }}>
                                <span style={{ fontWeight: 700 }}>{m.month}:</span> <span style={{ color: 'var(--primary)' }}>{m.address}</span>
                                <div style={{ fontSize: '0.7rem', opacity: 0.6 }}>"{m.label}"</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="section">
                <div className="flex-between" style={{ marginBottom: '1rem' }}>
                    <h3 className="flex">
                        {t('projectForm.categoryMapping')}
                        {loadingMetadata && <Loader2 size={16} className="animate-spin" style={{ marginLeft: '1rem' }} />}
                    </h3>
                    {!showAddRow ? (
                        <button type="button" className="btn-ghost flex" onClick={() => setShowAddRow(true)} style={{ color: 'var(--primary)' }}>
                            <Plus size={16} /> {t('projectForm.addFolderMapping')}
                        </button>
                    ) : (
                        <div className="flex" style={{ gap: '0.5rem' }}>
                            <input type="text" placeholder={t('projectForm.folderNamePlaceholder')} value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} style={{ width: '250px', padding: '0.4rem' }} autoFocus onKeyDown={(e) => e.key === 'Enter' && addMappingRow(e)} />
                            <button type="button" className="btn-primary" onClick={addMappingRow}><FolderPlus size={16} /></button>
                            <button type="button" className="btn-ghost" onClick={() => { setShowAddRow(false); setNewFolderName(''); }}><X size={16} /></button>
                        </div>
                    )}
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                            <th style={{ padding: '0.5rem' }}>{t('projectForm.mappingTable.subFolderName')}</th>
                            <th style={{ padding: '0.5rem' }}>{t('projectForm.mappingTable.excelCategoryLabel')}</th>
                            <th style={{ padding: '0.5rem' }}>{t('projectForm.mappingTable.targetCell')}</th>
                            <th style={{ padding: '0.5rem' }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {Object.keys(formData.categoryMapping).length === 0 && (
                            <tr>
                                <td colSpan="4" style={{ padding: '2rem', textAlign: 'center', opacity: 0.5 }}>
                                    {t('projectForm.mappingTable.noMappings')}
                                </td>
                            </tr>
                        )}
                        {Object.entries(formData.categoryMapping).map(([folderName, excelLabel]) => (
                            <tr key={folderName} style={{ borderTop: '1px solid var(--border)' }}>
                                <td style={{ padding: '0.5rem' }}><code>{folderName}</code></td>
                                <td style={{ padding: '0.5rem' }}>
                                    <select value={excelLabel} onChange={(e) => handleCategoryMappingChange(folderName, e.target.value)} style={{ padding: '0.4rem', width: '100%' }} disabled={loadingMetadata}>
                                        <option value="">{loadingMetadata ? t('messages.loadingMetadata') : t('projectForm.mappingTable.mapTo')}</option>
                                        {Object.entries(excelMetadata.categories).map(([label, info]) => (
                                            <option key={label} value={label}>{label} ({info.address})</option>
                                        ))}
                                        {excelLabel && !excelMetadata.categories[excelLabel] && (
                                            <option value={excelLabel}>{excelLabel} ({t('messages.notFound')})</option>
                                        )}
                                    </select>
                                </td>
                                <td style={{ padding: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                    {excelLabel && excelMetadata.categories[excelLabel] && excelMetadata.months.length > 0 ? (
                                        <span className="flex" style={{ color: 'var(--success)' }}>
                                            <Target size={12} /> Row {excelMetadata.categories[excelLabel].row}
                                        </span>
                                    ) : '-'}
                                </td>
                                <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                                    <button type="button" className="btn-ghost" style={{ color: 'var(--error)' }} onClick={() => removeMappingRow(folderName)}><Trash2 size={14} /></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </form>
    )
}
