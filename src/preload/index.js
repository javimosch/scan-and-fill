import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  getProjects: () => ipcRenderer.invoke('get-projects'),
  saveProject: (project) => ipcRenderer.invoke('save-project', project),
  deleteProject: (projectId) => ipcRenderer.invoke('delete-project', projectId),
  getExcelMetadata: (filePath, sheetName, categoryColumn, monthStartCell) => 
    ipcRenderer.invoke('get-excel-metadata', filePath, sheetName, categoryColumn, monthStartCell),
  runProject: (project) => ipcRenderer.invoke('run-project', project),
  finalizeProject: (project, summary) => ipcRenderer.invoke('finalize-project', project, summary),
  clearProjectCache: (projectId) => ipcRenderer.invoke('clear-project-cache', projectId),
  onProgress: (callback) => {
    const subscription = (_event, progress) => callback(progress)
    ipcRenderer.on('process-progress', subscription)
    return () => ipcRenderer.removeListener('process-progress', subscription)
  },
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  selectFile: (filters) => ipcRenderer.invoke('select-file', filters),
  getManualEntry: (filePath) => ipcRenderer.invoke('get-manual-entry', filePath),
  saveManualEntry: (filePath, amount) => ipcRenderer.invoke('save-manual-entry', filePath, amount),
  openPath: (path) => ipcRenderer.invoke('open-path', path),
  // Settings API
  getSettings: () => ipcRenderer.invoke('get-settings'),
  getAISettings: () => ipcRenderer.invoke('get-ai-settings'),
  updateAISettings: (settings) => ipcRenderer.invoke('update-ai-settings', settings),
  updateSetting: (key, value) => ipcRenderer.invoke('update-setting', key, value),
  // OCR cache management
  getCacheStats: () => ipcRenderer.invoke('get-cache-stats'),
  clearOCRCache: () => ipcRenderer.invoke('clear-ocr-cache'),
  // AI Analysis API
  analyzeWithAI: (filePath, text) => ipcRenderer.invoke('analyze-with-ai', filePath, text),
  extractPDFText: (filePath) => ipcRenderer.invoke('extract-pdf-text', filePath)
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  window.electron = electronAPI
  window.api = api
}
