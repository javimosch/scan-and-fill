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
  }
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
