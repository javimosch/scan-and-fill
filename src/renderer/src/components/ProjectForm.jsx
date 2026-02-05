import { useState, useEffect } from 'react'
import { Save, X, Plus, Trash2, FolderPlus } from 'lucide-react'

export default function ProjectForm({ project, onSave, onCancel }) {
    // Ensure categoryMapping is always an object
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
    const [excelMetadata, setExcelMetadata] = useState({ tabs: [], categories: {} })
    const [newFolderName, setNewFolderName] = useState('')
    const [showAddRow, setShowAddRow] = useState(false)

    useEffect(() => {
        if (formData.excelConfig.filePath) {
            loadExcelMetadata()
        }
    }, [formData.excelConfig.filePath, formData.excelConfig.sheetName, formData.excelConfig.categoryColumn])

    const loadExcelMetadata = async () => {
        try {
            const metadata = await window.api.getExcelMetadata(
                formData.excelConfig.filePath,
                formData.excelConfig.sheetName,
                formData.excelConfig.categoryColumn
            )
            setExcelMetadata(metadata)
        } catch (error) {
            console.error('Failed to load excel metadata:', error)
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
        const rowNumber = excelMetadata.categories[excelLabel] || null

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

    const handleSubmit = (e) => {
        e.preventDefault()
        onSave(formData)
    }

    return (
        <form className="card" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div className="flex-between">
                <h2 style={{ margin: 0 }}>{project.name ? 'Edit Project' : 'New Project'}</h2>
                <div className="flex">
                    <button type="button" className="btn-ghost" onClick={onCancel}>
                        <X size={18} />
                    </button>
                    <button type="submit" className="btn-primary flex">
                        <Save size={18} />
                        Save Project
                    </button>
                </div>
            </div>

            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                <div className="section">
                    <h3>1. General Settings</h3>
                    <div className="input-group">
                        <label>Project Name</label>
                        <input
                            name="name"
                            value={formData.name}
                            onChange={handleChange}
                            required
                            placeholder="e.g. Bookstore Billing 2026"
                        />
                    </div>
                    <div className="input-group">
                        <label>Root Folder (PDFs Path)</label>
                        <input
                            name="rootPath"
                            value={formData.rootPath}
                            onChange={handleChange}
                            required
                            placeholder="/home/user/billing-2026"
                        />
                    </div>
                </div>

                <div className="section">
                    <h3>2. Excel Settings</h3>
                    <div className="input-group">
                        <label>Excel File Path (.xlsx)</label>
                        <input
                            name="filePath"
                            value={formData.excelConfig.filePath}
                            onChange={handleExcelConfigChange}
                            required
                            placeholder="/home/user/billing_sheet.xlsx"
                        />
                    </div>
                    <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div className="input-group">
                            <label>Sheet (Tab)</label>
                            <select
                                name="sheetName"
                                value={formData.excelConfig.sheetName}
                                onChange={handleExcelConfigChange}
                                required
                            >
                                <option value="">Select a tab...</option>
                                {excelMetadata.tabs.map(tab => (
                                    <option key={tab} value={tab}>{tab}</option>
                                ))}
                            </select>
                        </div>
                        <div className="input-group">
                            <label>Month Start Cell</label>
                            <input
                                name="monthStartCell"
                                value={formData.excelConfig.monthStartCell}
                                onChange={handleExcelConfigChange}
                                placeholder="e.g. B1"
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className="section">
                <div className="flex-between" style={{ marginBottom: '1rem' }}>
                    <h3>3. Category Mapping</h3>
                    {!showAddRow ? (
                        <button type="button" className="btn-ghost flex" onClick={() => setShowAddRow(true)} style={{ color: 'var(--primary)' }}>
                            <Plus size={16} /> Add Folder Mapping
                        </button>
                    ) : (
                        <div className="flex" style={{ gap: '0.5rem' }}>
                            <input
                                type="text"
                                placeholder="Folder Name (e.g. achats_enfants)"
                                value={newFolderName}
                                onChange={(e) => setNewFolderName(e.target.value)}
                                style={{ width: '250px', padding: '0.4rem' }}
                                autoFocus
                                onKeyDown={(e) => e.key === 'Enter' && addMappingRow(e)}
                            />
                            <button type="button" className="btn-primary" onClick={addMappingRow}>
                                <FolderPlus size={16} />
                            </button>
                            <button type="button" className="btn-ghost" onClick={() => { setShowAddRow(false); setNewFolderName(''); }}>
                                <X size={16} />
                            </button>
                        </div>
                    )}
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                            <th style={{ padding: '0.5rem' }}>Sub-Folder Name</th>
                            <th style={{ padding: '0.5rem' }}>Excel Category Label</th>
                            <th style={{ padding: '0.5rem' }}>Row</th>
                            <th style={{ padding: '0.5rem' }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {Object.keys(formData.categoryMapping).length === 0 && (
                            <tr>
                                <td colSpan="4" style={{ padding: '2rem', textAlign: 'center', opacity: 0.5 }}>
                                    No mappings defined. Click "Add Folder Mapping" to start.
                                </td>
                            </tr>
                        )}
                        {Object.entries(formData.categoryMapping).map(([folderName, excelLabel]) => (
                            <tr key={folderName} style={{ borderTop: '1px solid var(--border)' }}>
                                <td style={{ padding: '0.5rem' }}><code>{folderName}</code></td>
                                <td style={{ padding: '0.5rem' }}>
                                    <select
                                        value={excelLabel}
                                        onChange={(e) => handleCategoryMappingChange(folderName, e.target.value)}
                                        style={{ padding: '0.4rem' }}
                                    >
                                        <option value="">Map to...</option>
                                        {Object.keys(excelMetadata.categories).map(cat => (
                                            <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                    </select>
                                </td>
                                <td style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>
                                    {excelMetadata.categories[excelLabel] || '-'}
                                </td>
                                <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                                    <button type="button" className="btn-ghost" style={{ color: 'var(--error)' }} onClick={() => removeMappingRow(folderName)}>
                                        <Trash2 size={14} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </form>
    )
}
