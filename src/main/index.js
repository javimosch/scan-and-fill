import { app, shell, BrowserWindow, ipcMain, dialog, protocol, net } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import icon from '../../resources/icon.png?asset'
import ProjectService from './services/ProjectService.js'
import MainService from './services/MainService.js'
import SettingsService from './services/SettingsService.js'
import ParserService from './services/ParserService.js'
import CacheService from './services/CacheService.js'

const projectService = new ProjectService()
const mainService = new MainService()
const settingsService = new SettingsService()
const parserService = new ParserService()

// Register custom protocol for local files (PDF preview)
protocol.registerSchemesAsPrivileged([
  { scheme: 'app-file', privileges: { secure: true, supportFetchAPI: true, standard: true } }
])

function createWindow() {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.maximize()
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Handle app-file:// protocol
  // Handle app-file:// protocol
  protocol.handle('app-file', (request) => {
    try {
      const parsed = new URL(request.url)
      let filePath = parsed.pathname
      
      // On some systems/versions, standard schemes might parse the first path segment as hostname
      // e.g. app-file://home/user -> hostname='home', pathname='/user'
      // We need to reconstruct the absolute path
      if (parsed.hostname) {
        filePath = join('/', parsed.hostname, filePath)
      }

      filePath = decodeURIComponent(filePath)
      
      // Handle Windows drive letters if needed (usually treated as pathname /C:/...)
      // pathToFileURL handles this if format is correct.
      
      return net.fetch(pathToFileURL(filePath).toString())
    } catch (e) {
      console.error('[app-file] Protocol error:', e)
      return new Response('Bad Request', { status: 400 })
    }
  })

  // Set app user model id for windows
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.javimosch.scan-and-fill');
  }

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  app.on('browser-window-created', (_, window) => {
    if (!app.isPackaged) {
      window.webContents.openDevTools();
    } else {
       // Disable shortcuts in production if needed, or leave default
       window.setMenu(null); 
    }
  })

  // IPC handlers for scan-and-fill
  ipcMain.handle('get-projects', () => projectService.getProjects())
  ipcMain.handle('save-project', (_, project) => projectService.saveProject(project))
  ipcMain.handle('delete-project', (_, projectId) => projectService.deleteProject(projectId))
  
  ipcMain.handle('get-excel-metadata', (_, filePath, sheetName, categoryColumn, monthStartCell) => 
    mainService.getExcelMetadata(filePath, sheetName, categoryColumn, monthStartCell)
  )

  ipcMain.handle('run-project', (event, project) => {
    return mainService.runProcess(project, (progress) => {
      event.sender.send('process-progress', progress)
    })
  })

  ipcMain.handle('finalize-project', (_, project, summary) => {
    return mainService.finalizeProcess(project, summary)
  })

  ipcMain.handle('clear-project-cache', (_, projectId) => {
    mainService.cache.clearCache(projectId)
  })

  ipcMain.handle('select-directory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    return result.filePaths[0]
  })

  ipcMain.handle('select-file', async (_, filters) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: filters || [
        { name: 'Spreadsheets', extensions: ['xlsx', 'ods'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    return result.filePaths[0]
  })

  ipcMain.handle('get-manual-entry', (_, filePath) => {
    return mainService.getManualEntry(filePath)
  })

  ipcMain.handle('save-manual-entry', (_, filePath, amount) => {
    return mainService.setManualEntry(filePath, amount)
  })

  ipcMain.handle('open-path', async (_, path) => {
    try {
        await shell.openPath(path)
        return { success: true }
    } catch (error) {
        console.error('Failed to open path:', error)
        return { success: false, error: error.message }
    }
  })

  // Settings IPC handlers
  ipcMain.handle('get-settings', () => {
    return settingsService.getSettings()
  })

  ipcMain.handle('get-ai-settings', () => {
    return settingsService.getAIDetectionSettings()
  })

  ipcMain.handle('update-ai-settings', (_, settings) => {
    return settingsService.updateAIDetectionSettings(settings)
  })

  ipcMain.handle('update-setting', (_, key, value) => {
    return settingsService.updateSetting(key, value)
  })

  ipcMain.handle('get-cache-stats', async () => {
    try {
      const cache = new CacheService();
      const stats = cache.getStats();
      return stats;
    } catch (error) {
      console.error('Failed to get cache stats:', error);
      throw error;
    }
  });

  ipcMain.handle('clear-ocr-cache', async () => {
    try {
      const cache = new CacheService();
      await cache.clearOCRCacheJSON();
      return { success: true };
    } catch (error) {
      console.error('Failed to clear OCR cache:', error);
      throw error;
    }
  });

  ipcMain.handle('analyze-with-ai', async (_, filePath, text) => {
    try {
      const aiSettings = settingsService.getAIDetectionSettings()
      const pageCount = parserService.getPageCount(filePath)
      
      if (!aiSettings.enabled) {
        throw new Error('AI detection is disabled')
      }
      
      if (pageCount > aiSettings.maxPages) {
        throw new Error(`PDF has ${pageCount} pages, but AI is limited to ${aiSettings.maxPages} pages`)
      }
      
      const pdfContext = {
        fileName: require('path').basename(filePath),
        pageCount
      }
      
      return await parserService.manualAIAnalysis(text, pdfContext, aiSettings)
    } catch (error) {
      console.error('Manual AI analysis failed:', error)
      throw error
    }
  })

  ipcMain.handle('extract-pdf-text', async (_, filePath) => {
    try {
      const text = await parserService.extractFullText(filePath)
      return { success: true, text }
    } catch (error) {
      console.error('PDF text extraction failed:', error)
      return { success: false, error: error.message }
    }
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
