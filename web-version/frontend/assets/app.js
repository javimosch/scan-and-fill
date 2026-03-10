const { createApp, ref, computed, onMounted } = Vue;

const STORAGE_KEY = 'scan-and-fill-web-state-v1';
const HANDLE_DB_NAME = 'scan-and-fill-handles';

createApp({
  setup() {
    const state = ref(loadState());
    const currentView = ref('dashboard');
    const editingProject = ref(null);
    const execProject = ref(null);
    const runResult = ref(null);
    const isRunning = ref(false);
    const error = ref('');
    const successMsg = ref('');
    const importText = ref('');
    const showAdvanced = ref(false);
    const excelMetadata = ref({ tabs: [], categories: {}, months: [] });
    const loadingMetadata = ref(false);
    const newFolderName = ref('');
    const showAddMapping = ref(false);
    const pdfCount = ref(0);
    const conflictIdx = ref(null);
    const conflictSelectedAmount = ref('');
    const conflictManualAmount = ref('');
    const execStep = ref('ready');

    const projects = computed(() => state.value.projects || []);

    const currentConflict = computed(() => {
      if (conflictIdx.value === null || !runResult.value) return null;
      return runResult.value.conflicts[conflictIdx.value] || null;
    });

    const unresolvedConflicts = computed(() => {
      if (!runResult.value) return [];
      return runResult.value.conflicts.filter(c => c.resolvedAmount === undefined);
    });

    const allResolved = computed(() => {
      if (!runResult.value || runResult.value.conflicts.length === 0) return true;
      return unresolvedConflicts.value.length === 0;
    });

    const groupedResults = computed(() => {
      if (!runResult.value) return {};
      const grouped = {};
      for (const f of runResult.value.files) {
        if (!grouped[f.month]) grouped[f.month] = {};
        if (!grouped[f.month][f.category]) grouped[f.month][f.category] = [];
        grouped[f.month][f.category].push(f);
      }
      return grouped;
    });

    const finalizeTotals = computed(() => {
      if (!runResult.value) return {};
      const totals = {};
      for (const f of runResult.value.files) {
        const amt = f.resolvedAmount !== undefined ? f.resolvedAmount : (f.status === 'success' ? f.amount : 0);
        if (!totals[f.category]) totals[f.category] = 0;
        totals[f.category] += amt;
      }
      return totals;
    });

    const grandTotal = computed(() => {
      return Object.values(finalizeTotals.value).reduce((a, b) => a + b, 0);
    });

    const metadataCategories = computed(() => Object.keys(excelMetadata.value.categories || {}));
    const metadataMonths = computed(() => excelMetadata.value.months || []);
    const metadataTabs = computed(() => excelMetadata.value.tabs || []);

    const openSections = ref({});
    function toggleSection(key) {
      openSections.value[key] = !openSections.value[key];
    }
    function isSectionOpen(key) {
      return !!openSections.value[key];
    }

    onMounted(async () => {
      await restoreHandlePermissions();
    });

    function persist() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.value));
    }

    function showError(msg) {
      error.value = msg;
      setTimeout(() => { if (error.value === msg) error.value = ''; }, 8000);
    }

    function showSuccess(msg) {
      successMsg.value = msg;
      setTimeout(() => { if (successMsg.value === msg) successMsg.value = ''; }, 5000);
    }

    // ---- Dashboard ----
    function addProject() {
      const project = {
        id: String(Date.now()),
        name: 'New Project',
        categoryMapping: {},
        excelConfig: { sheetName: '', monthStartCell: 'B1', categoryColumn: 'A', categoryRowsMap: {} },
        fileAccess: { folderHandleKey: '', spreadsheetHandleKey: '', spreadsheetName: '' }
      };
      state.value.projects.push(project);
      persist();
      openEditProject(project);
    }

    function deleteProject(id) {
      if (!confirm('Delete this project? This cannot be undone.')) return;
      state.value.projects = state.value.projects.filter(p => p.id !== id);
      persist();
    }

    function getProjectStatus(project) {
      const hasFolder = !!project.fileAccess.folderHandleKey;
      const hasSpreadsheet = !!project.fileAccess.spreadsheetHandleKey;
      const hasMappings = Object.keys(project.categoryMapping || {}).length > 0;
      return { hasFolder, hasSpreadsheet, hasMappings };
    }

    function openEditProject(project) {
      editingProject.value = JSON.parse(JSON.stringify(project));
      excelMetadata.value = { tabs: [], categories: {}, months: [] };
      currentView.value = 'editProject';
      if (editingProject.value.fileAccess.spreadsheetHandleKey) {
        loadMetadata();
      }
    }

    function openExecution(project) {
      execProject.value = JSON.parse(JSON.stringify(project));
      runResult.value = null;
      execStep.value = 'ready';
      pdfCount.value = 0;
      currentView.value = 'execution';
      countPdfs();
    }

    function goToDashboard() {
      currentView.value = 'dashboard';
      editingProject.value = null;
      execProject.value = null;
      runResult.value = null;
    }

    function exportJson() {
      const blob = new Blob([JSON.stringify(state.value, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'scan-and-fill-state-' + Date.now() + '.json';
      link.click();
      URL.revokeObjectURL(link.href);
    }

    function importJsonReplaceAll() {
      try {
        const parsed = JSON.parse(importText.value);
        if (!Array.isArray(parsed.projects)) throw new Error('Invalid state file');
        state.value = parsed;
        persist();
        importText.value = '';
        showSuccess('State imported successfully');
      } catch (e) {
        showError('Import failed: ' + e.message);
      }
    }

    // ---- Edit Project ----
    async function connectFolder() {
      if (!editingProject.value || !window.showDirectoryPicker) {
        showError('Your browser does not support folder selection. Please use Chrome or Edge.');
        return;
      }
      try {
        const handle = await window.showDirectoryPicker();
        const key = 'folder:' + editingProject.value.id;
        await saveHandle(key, handle);
        editingProject.value.fileAccess.folderHandleKey = key;
      } catch (e) {
        if (e.name !== 'AbortError') showError('Folder connection failed: ' + e.message);
      }
    }

    async function connectSpreadsheet() {
      if (!editingProject.value || !window.showOpenFilePicker) {
        showError('Your browser does not support file selection. Please use Chrome or Edge.');
        return;
      }
      try {
        const [handle] = await window.showOpenFilePicker({
          multiple: false,
          types: [{ description: 'Spreadsheet', accept: { 'application/*': ['.xlsx', '.ods'] } }]
        });
        const key = 'spreadsheet:' + editingProject.value.id;
        await saveHandle(key, handle);
        editingProject.value.fileAccess.spreadsheetHandleKey = key;
        editingProject.value.fileAccess.spreadsheetName = handle.name;
        await loadMetadata();
      } catch (e) {
        if (e.name !== 'AbortError') showError('Spreadsheet connection failed: ' + e.message);
      }
    }

    async function loadMetadata() {
      if (!editingProject.value) return;
      loadingMetadata.value = true;
      try {
        const file = await getSpreadsheetFile(editingProject.value);
        if (!file) { loadingMetadata.value = false; return; }
        const form = new FormData();
        form.append('spreadsheet', file, file.name);
        form.append('sheetName', editingProject.value.excelConfig.sheetName || '');
        form.append('categoryColumn', editingProject.value.excelConfig.categoryColumn || 'A');
        form.append('monthStartCell', editingProject.value.excelConfig.monthStartCell || 'B1');
        const serverUrl = state.value.serverUrl || '';
        const response = await fetch(serverUrl + '/api/v1/excel/metadata', { method: 'POST', body: form });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error?.message || 'Metadata failed');
        excelMetadata.value = payload.metadata;
        // Auto-update categoryRowsMap
        const mapping = editingProject.value.categoryMapping || {};
        editingProject.value.excelConfig.categoryRowsMap = buildCategoryRowsMap(mapping, payload.metadata.categories || {});
      } catch (e) {
        showError('Load metadata failed: ' + e.message);
      } finally {
        loadingMetadata.value = false;
      }
    }

    function addMappingRow() {
      const name = newFolderName.value.trim();
      if (!name) return;
      if (editingProject.value.categoryMapping[name] !== undefined) {
        showError('Folder "' + name + '" already exists in mappings');
        return;
      }
      editingProject.value.categoryMapping[name] = '';
      newFolderName.value = '';
      showAddMapping.value = false;
    }

    function updateMappingLabel(folderName, excelLabel) {
      editingProject.value.categoryMapping[folderName] = excelLabel;
      editingProject.value.excelConfig.categoryRowsMap = buildCategoryRowsMap(
        editingProject.value.categoryMapping,
        excelMetadata.value.categories || {}
      );
    }

    function deleteMappingRow(folderName) {
      const newMapping = { ...editingProject.value.categoryMapping };
      delete newMapping[folderName];
      editingProject.value.categoryMapping = newMapping;
      editingProject.value.excelConfig.categoryRowsMap = buildCategoryRowsMap(
        newMapping, excelMetadata.value.categories || {}
      );
    }

    function saveProject() {
      if (!editingProject.value) return;
      const idx = state.value.projects.findIndex(p => p.id === editingProject.value.id);
      if (idx !== -1) {
        state.value.projects[idx] = JSON.parse(JSON.stringify(editingProject.value));
      } else {
        state.value.projects.push(JSON.parse(JSON.stringify(editingProject.value)));
      }
      persist();
      showSuccess('Project saved');
      goToDashboard();
    }

    // ---- Execution ----
    async function countPdfs() {
      try {
        if (!execProject.value) return;
        const folderHandle = await getHandle(execProject.value.fileAccess.folderHandleKey);
        if (!folderHandle) return;
        const files = await gatherPdfFiles(folderHandle);
        pdfCount.value = files.length;
      } catch (e) {
        pdfCount.value = 0;
      }
    }

    async function runScan() {
      isRunning.value = true;
      error.value = '';
      runResult.value = null;
      execStep.value = 'scanning';
      try {
        const folderHandle = await getHandle(execProject.value.fileAccess.folderHandleKey);
        if (!folderHandle) throw new Error('Connect project folder first (edit the project)');
        const pdfFiles = await gatherPdfFiles(folderHandle);
        if (pdfFiles.length === 0) throw new Error('No PDF files found in the selected folder');
        pdfCount.value = pdfFiles.length;

        const form = new FormData();
        const paths = [];
        for (const file of pdfFiles) {
          form.append('pdfFiles', file.blob, file.relativePath);
          paths.push(file.relativePath);
        }
        form.append('paths', JSON.stringify(paths));
        form.append('project', JSON.stringify(execProject.value));

        const serverUrl = state.value.serverUrl || '';
        const response = await fetch(serverUrl + '/api/v1/run', { method: 'POST', body: form });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error?.message || 'Run failed');
        runResult.value = payload.summary;
        if (payload.summary.conflicts && payload.summary.conflicts.length > 0) {
          execStep.value = 'resolve';
        } else {
          execStep.value = 'finalize';
        }
      } catch (e) {
        showError(e.message);
        execStep.value = 'ready';
      } finally {
        isRunning.value = false;
      }
    }

    function openConflictModal(idx) {
      conflictIdx.value = idx;
      conflictSelectedAmount.value = '';
      conflictManualAmount.value = '';
    }

    function closeConflictModal() {
      conflictIdx.value = null;
      conflictSelectedAmount.value = '';
      conflictManualAmount.value = '';
    }

    function onKeydown(e) {
      if (e.key === 'Escape' && conflictIdx.value !== null) closeConflictModal();
    }

    onMounted(() => { document.addEventListener('keydown', onKeydown); });

    function applyConflictResolution() {
      const val = conflictManualAmount.value || conflictSelectedAmount.value;
      const normalized = String(val).replace(',', '.');
      const amount = parseFloat(normalized);
      if (isNaN(amount)) { showError('Please enter a valid amount'); return; }

      const conflict = runResult.value.conflicts[conflictIdx.value];
      conflict.resolvedAmount = amount;

      const fileIdx = runResult.value.files.findIndex(f => f.filePath === conflict.filePath);
      if (fileIdx !== -1) {
        runResult.value.files[fileIdx].resolvedAmount = amount;
        runResult.value.files[fileIdx].status = 'resolved';
      }

      // Auto-advance to next unresolved
      let nextIdx = -1;
      for (let i = conflictIdx.value + 1; i < runResult.value.conflicts.length; i++) {
        if (runResult.value.conflicts[i].resolvedAmount === undefined) { nextIdx = i; break; }
      }
      if (nextIdx === -1) {
        for (let i = 0; i < conflictIdx.value; i++) {
          if (runResult.value.conflicts[i].resolvedAmount === undefined) { nextIdx = i; break; }
        }
      }

      if (nextIdx !== -1) {
        openConflictModal(nextIdx);
      } else {
        closeConflictModal();
        execStep.value = 'finalize';
      }
    }

    async function finalizeAndDownload() {
      error.value = '';
      try {
        const file = await getSpreadsheetFile(execProject.value);
        if (!file) throw new Error('Connect spreadsheet first (edit the project)');
        const form = new FormData();
        form.append('spreadsheet', file, file.name);
        form.append('payload', JSON.stringify({ project: execProject.value, summary: runResult.value }));
        const serverUrl = state.value.serverUrl || '';
        const response = await fetch(serverUrl + '/api/v1/finalize', { method: 'POST', body: form });
        if (!response.ok) {
          const payload = await response.json();
          throw new Error(payload.error?.message || 'Finalize failed');
        }
        const blob = await response.blob();
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'updated-' + file.name;
        link.click();
        URL.revokeObjectURL(link.href);
        execStep.value = 'done';
        showSuccess('Spreadsheet updated and downloaded!');
      } catch (e) {
        showError(e.message);
      }
    }

    return {
      state, currentView, editingProject, execProject, runResult, isRunning,
      error, successMsg, importText, showAdvanced, excelMetadata, loadingMetadata,
      newFolderName, showAddMapping, pdfCount, conflictIdx, conflictSelectedAmount,
      conflictManualAmount, execStep, projects, currentConflict, unresolvedConflicts,
      allResolved, groupedResults, finalizeTotals, grandTotal, metadataCategories,
      metadataMonths, metadataTabs, openSections, toggleSection, isSectionOpen,
      persist, addProject, deleteProject, getProjectStatus, openEditProject,
      openExecution, goToDashboard, exportJson, importJsonReplaceAll, connectFolder,
      connectSpreadsheet, loadMetadata, addMappingRow, updateMappingLabel,
      deleteMappingRow, saveProject, countPdfs, runScan, openConflictModal,
      closeConflictModal, applyConflictResolution, finalizeAndDownload, showError
    };
  },
  template: `
<div style="min-height:100vh;padding:1rem 1.5rem;max-width:1100px;margin:0 auto">

  <!-- Header -->
  <div class="glass-panel fade-in" style="padding:1rem 1.5rem;margin-bottom:1.5rem">
    <div class="flex-between">
      <div>
        <h1 style="font-size:1.4rem;font-weight:800;margin:0">\u{1F4CA} scan-and-fill</h1>
        <div class="text-xs text-muted">Extract amounts from PDFs into your spreadsheet</div>
      </div>
      <button v-if="currentView !== 'dashboard'" class="btn btn-ghost btn-sm" @click="goToDashboard">\u2190 Back</button>
    </div>
  </div>

  <!-- Alerts -->
  <div v-if="error" class="alert alert-error mb-4 fade-in">\u26A0 {{ error }}</div>
  <div v-if="successMsg" class="alert alert-success mb-4 fade-in">\u2713 {{ successMsg }}</div>

  <!-- ==================== DASHBOARD ==================== -->
  <div v-if="currentView === 'dashboard'" class="fade-in">
    <div class="flex-between mb-4">
      <h2 style="font-size:1.15rem;font-weight:700;margin:0">Your Projects</h2>
      <button class="btn btn-primary" @click="addProject">\uFF0B New Project</button>
    </div>

    <div v-if="projects.length === 0" class="card empty-state">
      <div class="empty-icon">\u{1F4C1}</div>
      <p>No projects yet. Create one to get started.</p>
    </div>

    <div v-else class="grid-2" style="margin-bottom:2rem">
      <div v-for="project in projects" :key="project.id" class="card card-hover" style="cursor:default">
        <div class="flex-between mb-2">
          <div style="font-weight:700;font-size:1rem">{{ project.name }}</div>
          <button class="btn btn-ghost btn-sm" style="color:var(--error)" @click="deleteProject(project.id)" title="Delete">\u{1F5D1}</button>
        </div>
        <div class="flex-col gap-1 mb-4" style="font-size:0.8rem;color:var(--text-muted)">
          <div class="flex gap-2" style="align-items:center">
            <span class="status-dot" :class="getProjectStatus(project).hasFolder ? 'connected' : 'disconnected'"></span>
            Folder: {{ getProjectStatus(project).hasFolder ? 'Connected' : 'Not connected' }}
          </div>
          <div class="flex gap-2" style="align-items:center">
            <span class="status-dot" :class="getProjectStatus(project).hasSpreadsheet ? 'connected' : 'disconnected'"></span>
            Spreadsheet: {{ project.fileAccess.spreadsheetName || 'Not connected' }}
          </div>
          <div class="flex gap-2" style="align-items:center">
            <span class="status-dot" :class="getProjectStatus(project).hasMappings ? 'connected' : 'disconnected'"></span>
            Mappings: {{ Object.keys(project.categoryMapping || {}).length }} configured
          </div>
        </div>
        <div class="flex gap-2">
          <button class="btn btn-outline btn-sm" @click="openEditProject(project)">\u270E Edit</button>
          <button class="btn btn-primary btn-sm" style="flex:1" @click="openExecution(project)">\u25B6 Run Scan</button>
        </div>
      </div>
    </div>

    <!-- Advanced section -->
    <div class="card" style="margin-top:1rem">
      <div class="collapsible-header" @click="showAdvanced = !showAdvanced">
        <span style="font-weight:600;font-size:0.9rem">\u2699 Advanced Settings</span>
        <span class="arrow" :class="{open: showAdvanced}">\u25B8</span>
      </div>
      <div v-if="showAdvanced" class="collapsible-body" style="padding-top:1rem">
        <div class="form-group mb-4">
          <label>Backend URL (leave empty for same server)</label>
          <input class="form-input" v-model="state.serverUrl" @change="persist" placeholder="http://localhost:8787" />
        </div>
        <div class="flex gap-2 mb-4">
          <button class="btn btn-outline btn-sm" @click="exportJson">\u{1F4E4} Export State</button>
        </div>
        <div class="form-group">
          <label>Import State (replaces everything)</label>
          <textarea class="form-textarea" v-model="importText" rows="4" placeholder="Paste exported JSON here..."></textarea>
          <button class="btn btn-warning btn-sm mt-2" @click="importJsonReplaceAll" :disabled="!importText">\u{1F4E5} Import & Replace</button>
        </div>
      </div>
    </div>
  </div>

  <!-- ==================== EDIT PROJECT ==================== -->
  <div v-if="currentView === 'editProject' && editingProject" class="fade-in">
    <div class="card mb-4">
      <div class="flex-between mb-4">
        <h2 style="font-size:1.15rem;font-weight:700;margin:0">\u270E Edit Project</h2>
        <div class="flex gap-2">
          <button class="btn btn-ghost btn-sm" @click="goToDashboard">Cancel</button>
          <button class="btn btn-primary btn-sm" @click="saveProject">\u{1F4BE} Save</button>
        </div>
      </div>

      <!-- Project Name -->
      <div class="form-group mb-4">
        <label>Project Name</label>
        <input class="form-input" v-model="editingProject.name" placeholder="My accounting project" />
      </div>

      <!-- File Connections -->
      <div class="section-title">File Connections</div>
      <div class="grid-2 mb-4">
        <div class="card" style="padding:1rem">
          <div class="flex gap-2 mb-2" style="align-items:center">
            <span class="status-dot" :class="editingProject.fileAccess.folderHandleKey ? 'connected' : 'disconnected'"></span>
            <span style="font-weight:600;font-size:0.9rem">\u{1F4C1} PDF Folder</span>
          </div>
          <p class="text-xs text-muted mb-2">Folder with month/category/pdf structure</p>
          <button class="btn btn-outline btn-sm btn-block" @click="connectFolder">
            {{ editingProject.fileAccess.folderHandleKey ? '\u{1F504} Reconnect' : 'Connect Folder' }}
          </button>
        </div>
        <div class="card" style="padding:1rem">
          <div class="flex gap-2 mb-2" style="align-items:center">
            <span class="status-dot" :class="editingProject.fileAccess.spreadsheetHandleKey ? 'connected' : 'disconnected'"></span>
            <span style="font-weight:600;font-size:0.9rem">\u{1F4C4} Spreadsheet</span>
          </div>
          <p class="text-xs text-muted mb-2">{{ editingProject.fileAccess.spreadsheetName || 'No file selected' }}</p>
          <button class="btn btn-outline btn-sm btn-block" @click="connectSpreadsheet">
            {{ editingProject.fileAccess.spreadsheetHandleKey ? '\u{1F504} Change' : 'Connect Spreadsheet' }}
          </button>
        </div>
      </div>

      <!-- Excel Config -->
      <div class="section-title">Spreadsheet Configuration</div>
      <div class="grid-3 mb-4">
        <div class="form-group">
          <label>Sheet Tab <span v-if="loadingMetadata" class="spinner" style="width:12px;height:12px;border-width:2px;vertical-align:middle"></span></label>
          <select class="form-select" v-model="editingProject.excelConfig.sheetName" @change="loadMetadata">
            <option value="">Select a tab...</option>
            <option v-for="tab in metadataTabs" :key="tab" :value="tab">{{ tab }}</option>
          </select>
        </div>
        <div class="form-group">
          <label>Month Start Cell</label>
          <input class="form-input" v-model="editingProject.excelConfig.monthStartCell" placeholder="B1" @change="loadMetadata" />
        </div>
        <div class="form-group">
          <label>Category Column</label>
          <input class="form-input" v-model="editingProject.excelConfig.categoryColumn" placeholder="A" @change="loadMetadata" />
        </div>
      </div>

      <!-- Detected Months -->
      <div v-if="metadataMonths.length > 0" class="mb-4" style="padding:0.75rem;background:var(--primary-light);border-radius:8px">
        <div style="font-size:0.8rem;font-weight:600;color:var(--primary);margin-bottom:0.5rem">\u{1F4C5} Detected Months</div>
        <div class="flex gap-2" style="flex-wrap:wrap">
          <span v-for="m in metadataMonths" :key="m.address" class="badge badge-info">
            {{ m.month }} ({{ m.address }})
          </span>
        </div>
      </div>

      <!-- Category Mapping -->
      <div class="section-title">Category Mapping</div>
      <p class="text-xs text-muted mb-2">Map your folder names to spreadsheet category labels</p>

      <div v-if="Object.keys(editingProject.categoryMapping).length === 0 && !showAddMapping" class="text-center text-muted" style="padding:2rem;font-size:0.9rem">
        No mappings yet. Click below to add your first folder mapping.
      </div>

      <div v-else>
        <!-- Mapping header -->
        <div class="mapping-row" style="font-size:0.75rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;border-bottom:2px solid var(--border)">
          <div>Folder Name</div>
          <div>Spreadsheet Category</div>
          <div>Row</div>
          <div></div>
        </div>
        <!-- Mapping rows -->
        <div v-for="(excelLabel, folderName) in editingProject.categoryMapping" :key="folderName" class="mapping-row">
          <div class="folder-name">{{ folderName }}</div>
          <select class="form-select" :value="excelLabel" @change="updateMappingLabel(folderName, $event.target.value)" style="padding:0.4rem">
            <option value="">-- Select category --</option>
            <option v-for="cat in metadataCategories" :key="cat" :value="cat">{{ cat }}</option>
          </select>
          <div class="row-info">
            <span v-if="excelLabel && excelMetadata.categories[excelLabel]">Row {{ excelMetadata.categories[excelLabel].row }}</span>
            <span v-else class="text-muted">-</span>
          </div>
          <button class="btn btn-ghost btn-sm" style="color:var(--error)" @click="deleteMappingRow(folderName)">\u{1F5D1}</button>
        </div>
      </div>

      <!-- Add mapping -->
      <div class="mt-4">
        <div v-if="!showAddMapping">
          <button class="btn btn-outline btn-sm" @click="showAddMapping = true">\uFF0B Add Folder Mapping</button>
        </div>
        <div v-else class="flex gap-2" style="align-items:center">
          <input class="form-input" v-model="newFolderName" placeholder="Enter folder name..." @keyup.enter="addMappingRow" style="max-width:300px" />
          <button class="btn btn-primary btn-sm" @click="addMappingRow">Add</button>
          <button class="btn btn-ghost btn-sm" @click="showAddMapping = false; newFolderName = ''">Cancel</button>
        </div>
      </div>
    </div>
  </div>

  <!-- ==================== EXECUTION ==================== -->
  <div v-if="currentView === 'execution' && execProject" class="fade-in">
    <div class="card mb-4">
      <div class="flex-between mb-4">
        <div>
          <h2 style="font-size:1.15rem;font-weight:700;margin:0">\u25B6 {{ execProject.name }}</h2>
          <div class="text-xs text-muted mt-2" v-if="pdfCount > 0">{{ pdfCount }} PDF files found in folder</div>
        </div>
      </div>

      <!-- Stepper -->
      <div class="stepper mb-4">
        <div class="step" :class="{active: execStep === 'ready' || execStep === 'scanning', done: execStep !== 'ready' && execStep !== 'scanning'}">
          <span class="step-num">1</span> Scan
        </div>
        <div class="step-divider"></div>
        <div class="step" :class="{active: execStep === 'resolve', done: execStep === 'finalize' || execStep === 'done'}">
          <span class="step-num">2</span> Resolve
        </div>
        <div class="step-divider"></div>
        <div class="step" :class="{active: execStep === 'finalize', done: execStep === 'done'}">
          <span class="step-num">3</span> Finalize
        </div>
      </div>

      <!-- Ready state -->
      <div v-if="execStep === 'ready'" class="text-center" style="padding:2rem 0">
        <p class="text-muted mb-4">Ready to scan {{ pdfCount }} PDF files and extract amounts.</p>
        <button class="btn btn-primary btn-lg" @click="runScan" :disabled="pdfCount === 0">
          \u25B6 Start Scan
        </button>
      </div>

      <!-- Scanning state -->
      <div v-if="execStep === 'scanning'" class="text-center" style="padding:3rem 0">
        <div class="spinner spinner-lg" style="margin-bottom:1rem"></div>
        <p style="font-size:1.1rem;font-weight:600">Processing {{ pdfCount }} files...</p>
        <p class="text-sm text-muted">This may take a moment depending on file count and size.</p>
      </div>

      <!-- Results -->
      <div v-if="runResult && (execStep === 'resolve' || execStep === 'finalize' || execStep === 'done')">
        <!-- Stats -->
        <div class="flex gap-3 mb-4" style="flex-wrap:wrap">
          <span class="badge badge-success">\u2713 {{ runResult.stats.done }} extracted</span>
          <span v-if="runResult.stats.ambiguous > 0" class="badge badge-warning">\u26A0 {{ runResult.stats.ambiguous }} ambiguous</span>
          <span v-if="runResult.stats.failed > 0" class="badge badge-error">\u2715 {{ runResult.stats.failed }} failed</span>
          <span class="badge badge-neutral">{{ runResult.stats.total }} total</span>
        </div>

        <!-- Grouped results -->
        <div class="section-title">Scan Results</div>
        <div v-for="(categories, month) in groupedResults" :key="month" class="mb-2">
          <div class="collapsible-header" @click="toggleSection('month-' + month)">
            <span style="font-weight:600">\u{1F4C5} {{ month }}</span>
            <span class="arrow" :class="{open: isSectionOpen('month-' + month)}">\u25B8</span>
          </div>
          <div v-if="isSectionOpen('month-' + month)" class="collapsible-body">
            <div v-for="(files, category) in categories" :key="category" class="mb-2">
              <div class="collapsible-header" @click="toggleSection('cat-' + month + '-' + category)" style="padding:0.5rem 0.75rem">
                <span style="font-weight:500;font-size:0.9rem">\u{1F5C2} {{ category }} ({{ files.length }})</span>
                <span class="arrow" :class="{open: isSectionOpen('cat-' + month + '-' + category)}">\u25B8</span>
              </div>
              <div v-if="isSectionOpen('cat-' + month + '-' + category)" style="padding-left:1.5rem">
                <div v-for="file in files" :key="file.filePath" class="file-card">
                  <div class="file-info">
                    <div class="file-name">\u{1F4C4} {{ file.fileName }}</div>
                    <div class="file-meta">{{ file.message || '' }}</div>
                  </div>
                  <span v-if="file.status === 'success' || file.status === 'resolved'" class="badge badge-success">{{ (file.resolvedAmount !== undefined ? file.resolvedAmount : file.amount).toFixed(2) }}</span>
                  <span v-else-if="file.status === 'ambiguous'" class="badge badge-warning">ambiguous</span>
                  <span v-else class="badge badge-error">failed</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Conflicts -->
        <div v-if="runResult.conflicts.length > 0 && execStep === 'resolve'" class="mt-6">
          <div class="section-title">\u26A0 Conflicts to Resolve ({{ unresolvedConflicts.length }} remaining)</div>
          <div class="flex-col gap-2">
            <div v-for="(conflict, idx) in runResult.conflicts" :key="idx" class="card" style="padding:0.75rem 1rem">
              <div class="flex-between">
                <div>
                  <div style="font-weight:600">{{ conflict.fileName }}</div>
                  <div class="text-xs text-muted">{{ conflict.month }} / {{ conflict.category }}</div>
                </div>
                <div class="flex gap-2" style="align-items:center">
                  <span v-if="conflict.resolvedAmount !== undefined" class="badge badge-success">\u2713 {{ conflict.resolvedAmount.toFixed(2) }}</span>
                  <span v-else :class="conflict.status === 'failed' ? 'badge badge-error' : 'badge badge-warning'">{{ conflict.status }}</span>
                  <button v-if="conflict.resolvedAmount === undefined" class="btn btn-primary btn-sm" @click="openConflictModal(idx)">Resolve</button>
                  <button v-else class="btn btn-ghost btn-sm" @click="openConflictModal(idx)">Edit</button>
                </div>
              </div>
            </div>
          </div>
          <div v-if="allResolved" class="mt-4 text-center">
            <button class="btn btn-success btn-lg" @click="execStep = 'finalize'">\u279C Continue to Finalize</button>
          </div>
        </div>

        <!-- Finalize -->
        <div v-if="execStep === 'finalize'" class="mt-6">
          <div class="summary-box">
            <div style="font-size:1rem;font-weight:700;margin-bottom:1rem">\u{1F4CB} Finalize Preview</div>
            <div v-for="(total, category) in finalizeTotals" :key="category" class="summary-row">
              <span>{{ category }}</span>
              <span style="font-weight:600">{{ total.toFixed(2) }}</span>
            </div>
            <div class="summary-row summary-total">
              <span>Grand Total</span>
              <span style="color:var(--primary)">{{ grandTotal.toFixed(2) }}</span>
            </div>
          </div>
          <div class="flex gap-3 mt-4" style="justify-content:center">
            <button class="btn btn-outline" @click="goToDashboard">Cancel</button>
            <button class="btn btn-success btn-lg" @click="finalizeAndDownload">\u{1F4E5} Finalize & Download</button>
          </div>
        </div>

        <!-- Done -->
        <div v-if="execStep === 'done'" class="text-center mt-6" style="padding:2rem 0">
          <div style="font-size:3rem;margin-bottom:1rem">\u2713</div>
          <p style="font-size:1.1rem;font-weight:600;color:var(--success)">Spreadsheet updated and downloaded!</p>
          <button class="btn btn-outline mt-4" @click="goToDashboard">Back to Dashboard</button>
        </div>
      </div>
    </div>
  </div>

  <!-- ==================== CONFLICT MODAL ==================== -->
  <div v-if="conflictIdx !== null && currentConflict" class="modal-overlay" @click.self="closeConflictModal">
    <div class="modal-content">
      <div class="modal-header">
        <h3>\u26A0 Resolve Conflict</h3>
        <button class="btn btn-ghost btn-sm" @click="closeConflictModal">\u2715</button>
      </div>
      <div class="modal-body">
        <div class="mb-4">
          <div style="font-weight:700">{{ currentConflict.fileName }}</div>
          <div class="text-sm text-muted">{{ currentConflict.month }} / {{ currentConflict.category }}</div>
          <div class="text-xs text-muted mt-2" v-if="currentConflict.message">{{ currentConflict.message }}</div>
        </div>

        <div v-if="currentConflict.candidates && currentConflict.candidates.length > 0" class="mb-4">
          <div class="section-title">Detected Amounts</div>
          <p class="text-xs text-muted mb-2">Select the correct amount:</p>
          <div class="flex-col gap-2">
            <label v-for="(candidate, cidx) in currentConflict.candidates" :key="cidx"
              class="candidate-option" :class="{selected: conflictSelectedAmount === String(candidate)}">
              <input type="radio" name="candidate" :value="String(candidate)"
                v-model="conflictSelectedAmount" @change="conflictManualAmount = ''" />
              <div>
                <span style="font-weight:700;font-size:1.1rem">{{ typeof candidate === 'number' ? candidate.toFixed(2) : candidate }}</span>
              </div>
            </label>
          </div>
        </div>

        <div class="mb-2">
          <div class="section-title">Or Enter Manually</div>
          <input class="form-input" type="text" inputmode="decimal" placeholder="0.00"
            v-model="conflictManualAmount" @input="conflictSelectedAmount = ''" style="font-size:1.1rem;font-weight:700" />
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" @click="closeConflictModal">Cancel</button>
        <button class="btn btn-primary" :disabled="!conflictSelectedAmount && !conflictManualAmount" @click="applyConflictResolution">
          \u2713 Apply
        </button>
      </div>
    </div>
  </div>

</div>
  `
}).mount('#app');

// ---- Helper functions ----

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      serverUrl: parsed.serverUrl || '',
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      currentProjectId: parsed.currentProjectId || null,
      uiSettings: parsed.uiSettings || {}
    };
  } catch {
    return { serverUrl: '', projects: [], currentProjectId: null, uiSettings: {} };
  }
}

async function gatherPdfFiles(folderHandle, base = '') {
  const files = [];
  for await (const [name, handle] of folderHandle.entries()) {
    const rel = base ? base + '/' + name : name;
    if (handle.kind === 'directory') {
      files.push(...(await gatherPdfFiles(handle, rel)));
    } else if (handle.kind === 'file' && name.toLowerCase().endsWith('.pdf')) {
      const file = await handle.getFile();
      files.push({ relativePath: rel, blob: file });
    }
  }
  return files;
}

async function getSpreadsheetFile(project) {
  const handle = await getHandle(project?.fileAccess?.spreadsheetHandleKey || '');
  return handle ? handle.getFile() : null;
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(HANDLE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('handles');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function buildCategoryRowsMap(mapping, categories) {
  const rows = {};
  for (const label of Object.values(mapping || {})) {
    if (!label) continue;
    const row = categories?.[label]?.row;
    if (row) rows[label] = row;
  }
  return rows;
}

async function saveHandle(key, handle) {
  if (!key) return;
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').put(handle, key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function getHandle(key) {
  if (!key) return null;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('handles', 'readonly');
    const req = tx.objectStore('handles').get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function restoreHandlePermissions() {
  try {
    const db = await openDb();
    await new Promise((resolve) => {
      const tx = db.transaction('handles', 'readonly');
      const req = tx.objectStore('handles').getAll();
      req.onsuccess = async () => {
        const handles = req.result || [];
        for (const handle of handles) {
          if (!handle?.queryPermission) continue;
          const status = await handle.queryPermission({ mode: 'read' });
          if (status !== 'granted') {
            try { await handle.requestPermission({ mode: 'read' }); } catch {}
          }
        }
        resolve();
      };
      req.onerror = () => resolve();
    });
  } catch {
    // IndexedDB not available
  }
}
