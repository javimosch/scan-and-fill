import { getStoredLang, setStoredLang, translate } from './i18n.js';

const { createApp, ref, computed, onMounted } = Vue;

const STORAGE_KEY = 'scan-and-fill-web-state-v1';
const HANDLE_DB_NAME = 'scan-and-fill-handles';
const SCAN_CACHE_DB = 'scan-and-fill-scan-cache';
const LAST_MANUAL_KEY = 'scan-and-fill-last-manual';

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
    const pdfBlobUrl = ref(null);
    const pdfZoom = ref(125);
    const showPdf = ref(true);
    const pdfLoading = ref(false);
    const scanCacheTimestamp = ref(null);
    const scanProgress = ref({ current: 0, total: 0, currentFile: '' });
    const lastManualEntry = ref((() => { try { return localStorage.getItem(LAST_MANUAL_KEY) || ''; } catch { return ''; } })());
    const showShortcuts = ref(false);
    const lang = ref(getStoredLang());

    function t(key, params) {
      let str = translate(lang.value, key);
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          str = str.replace('{' + k + '}', v);
        }
      }
      return str;
    }

    function setLang(newLang) {
      lang.value = newLang;
      setStoredLang(newLang);
    }

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

    function formatCacheTime(ts) {
      const diff = Date.now() - ts;
      if (diff < 60000) return t('cache.justNow');
      if (diff < 3600000) return Math.floor(diff / 60000) + ' ' + t('cache.minAgo');
      if (diff < 86400000) return Math.floor(diff / 3600000) + t('cache.hAgo');
      return new Date(ts).toLocaleString();
    }

    // ---- Dashboard ----
    function addProject() {
      const project = {
        id: String(Date.now()),
        name: t('dashboard.newProjectDefault'),
        categoryMapping: {},
        excelConfig: { sheetName: '', monthStartCell: 'B1', categoryColumn: 'A', categoryRowsMap: {} },
        fileAccess: { folderHandleKey: '', spreadsheetHandleKey: '', spreadsheetName: '' }
      };
      state.value.projects.push(project);
      persist();
      openEditProject(project);
    }

    function deleteProject(id) {
      if (!confirm(t('dashboard.deleteConfirm'))) return;
      state.value.projects = state.value.projects.filter(p => p.id !== id);
      persist();
      clearScanCache(id).catch(() => {});
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

    async function openExecution(project) {
      execProject.value = JSON.parse(JSON.stringify(project));
      runResult.value = null;
      execStep.value = 'ready';
      pdfCount.value = 0;
      scanCacheTimestamp.value = null;
      currentView.value = 'execution';
      countPdfs();
      try {
        const cached = await getScanCache(project.id);
        if (cached && cached.summary) {
          runResult.value = cached.summary;
          scanCacheTimestamp.value = cached.timestamp;
          const hasUnresolved = cached.summary.conflicts &&
            cached.summary.conflicts.some(c => c.resolvedAmount === undefined);
          execStep.value = hasUnresolved ? 'resolve' : 'finalize';
        }
      } catch (e) { /* cache miss is fine */ }
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
        if (!Array.isArray(parsed.projects)) throw new Error(t('dashboard.invalidStateFile'));
        state.value = parsed;
        persist();
        importText.value = '';
        showSuccess(t('dashboard.stateImported'));
      } catch (e) {
        showError(t('dashboard.importFailed') + ': ' + e.message);
      }
    }

    // ---- Edit Project ----
    async function connectFolder() {
      if (!editingProject.value || !window.showDirectoryPicker) {
        showError(t('editProject.browserNoFolder'));
        return;
      }
      try {
        const handle = await window.showDirectoryPicker();
        const key = 'folder:' + editingProject.value.id;
        await saveHandle(key, handle);
        editingProject.value.fileAccess.folderHandleKey = key;
      } catch (e) {
        if (e.name !== 'AbortError') showError(t('editProject.folderFailed') + ': ' + e.message);
      }
    }

    async function connectSpreadsheet() {
      if (!editingProject.value || !window.showOpenFilePicker) {
        showError(t('editProject.browserNoFile'));
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
        if (e.name !== 'AbortError') showError(t('editProject.spreadsheetFailed') + ': ' + e.message);
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
        showError(t('editProject.metadataFailed') + ': ' + e.message);
      } finally {
        loadingMetadata.value = false;
      }
    }

    function addMappingRow() {
      const name = newFolderName.value.trim();
      if (!name) return;
      if (editingProject.value.categoryMapping[name] !== undefined) {
        showError('"' + name + '" ' + t('editProject.folderExists'));
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
      showSuccess(t('editProject.projectSaved'));
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

    async function runScan(clearResolutions) {
      isRunning.value = true;
      error.value = '';
      execStep.value = 'scanning';
      scanProgress.value = { current: 0, total: 0, currentFile: '' };

      const oldResolutions = new Map();
      if (!clearResolutions && runResult.value) {
        for (const c of (runResult.value.conflicts || [])) {
          if (c.resolvedAmount !== undefined) oldResolutions.set(c.filePath, c.resolvedAmount);
        }
        for (const f of (runResult.value.files || [])) {
          if (f.resolvedAmount !== undefined) oldResolutions.set(f.filePath, f.resolvedAmount);
        }
      }
      runResult.value = null;

      try {
        const folderHandle = await getHandle(execProject.value.fileAccess.folderHandleKey);
        if (!folderHandle) throw new Error(t('execution.connectFolderFirst'));
        const pdfFiles = await gatherPdfFiles(folderHandle);
        if (pdfFiles.length === 0) throw new Error(t('execution.noPdfsFound'));
        pdfCount.value = pdfFiles.length;
        scanProgress.value.total = pdfFiles.length;

        const summary = {
          project: execProject.value.name || 'Unnamed',
          files: [],
          totals: {},
          conflicts: [],
          stats: { done: 0, skipped: 0, failed: 0, ambiguous: 0, total: pdfFiles.length }
        };

        const serverUrl = state.value.serverUrl || '';
        for (let i = 0; i < pdfFiles.length; i++) {
          const file = pdfFiles[i];
          scanProgress.value.current = i + 1;
          scanProgress.value.currentFile = file.relativePath.split('/').pop();

          try {
            const form = new FormData();
            form.append('pdfFile', file.blob, file.relativePath);
            form.append('relativePath', file.relativePath);
            form.append('project', JSON.stringify(execProject.value));
            const response = await fetch(serverUrl + '/api/v1/extract-single', { method: 'POST', body: form });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error?.message || 'Extract failed');

            const r = payload.result;
            const fileInfo = { month: r.month, category: r.category, fileName: r.fileName, filePath: r.filePath, status: r.status, amount: r.amount || 0, message: r.message };
            summary.files.push(fileInfo);
            if (!summary.totals[r.month]) summary.totals[r.month] = {};
            if (!summary.totals[r.month][r.category]) summary.totals[r.month][r.category] = 0;

            if (r.status === 'success') {
              summary.totals[r.month][r.category] += r.amount;
              summary.stats.done += 1;
            } else if (r.status === 'ambiguous') {
              summary.stats.ambiguous += 1;
              summary.conflicts.push({ ...fileInfo, type: 'ambiguity', candidates: r.candidates || [] });
            } else {
              summary.stats.failed += 1;
              summary.conflicts.push({ ...fileInfo, type: 'failure', candidates: r.candidates || [] });
            }
          } catch (e) {
            const failName = file.relativePath.split('/').pop();
            summary.files.push({ month: 'Unknown', category: 'Unknown', fileName: failName, filePath: file.relativePath, status: 'failed', amount: 0, message: e.message });
            summary.stats.failed += 1;
          }
        }

        if (oldResolutions.size > 0) {
          for (const conflict of summary.conflicts) {
            const oldAmt = oldResolutions.get(conflict.filePath);
            if (oldAmt !== undefined) {
              conflict.resolvedAmount = oldAmt;
              const fi = summary.files.findIndex(f => f.filePath === conflict.filePath);
              if (fi !== -1) { summary.files[fi].resolvedAmount = oldAmt; summary.files[fi].status = 'resolved'; }
            }
          }
          for (const file of summary.files) {
            if (file.status === 'success' && oldResolutions.has(file.filePath)) {
              file.resolvedAmount = oldResolutions.get(file.filePath);
            }
          }
        }

        runResult.value = summary;
        scanCacheTimestamp.value = Date.now();
        saveScanCache(execProject.value.id, summary).catch(() => {});
        const hasUnresolved = summary.conflicts.some(c => c.resolvedAmount === undefined);
        execStep.value = (summary.conflicts.length > 0 && hasUnresolved) ? 'resolve' : 'finalize';
      } catch (e) {
        showError(e.message);
        execStep.value = 'ready';
      } finally {
        isRunning.value = false;
        scanProgress.value = { current: 0, total: 0, currentFile: '' };
      }
    }

    async function forceRescan() {
      scanCacheTimestamp.value = null;
      if (execProject.value) {
        clearScanCache(execProject.value.id).catch(() => {});
      }
      await runScan(true);
    }

    async function openConflictModal(idx) {
      conflictIdx.value = idx;
      conflictSelectedAmount.value = '';
      const conflict = runResult.value.conflicts[idx];
      if (conflict && conflict.resolvedAmount !== undefined) {
        conflictManualAmount.value = String(conflict.resolvedAmount);
      } else {
        conflictManualAmount.value = lastManualEntry.value || '';
      }
      await loadPdfForConflict();
    }

    function closeConflictModal() {
      conflictIdx.value = null;
      conflictSelectedAmount.value = '';
      conflictManualAmount.value = '';
      if (pdfBlobUrl.value) {
        URL.revokeObjectURL(pdfBlobUrl.value);
        pdfBlobUrl.value = null;
      }
    }

    function editFileAmount(file) {
      let idx = runResult.value.conflicts.findIndex(c => c.filePath === file.filePath);
      if (idx === -1) {
        runResult.value.conflicts.push({
          filePath: file.filePath,
          fileName: file.fileName,
          month: file.month,
          category: file.category,
          type: 'edit',
          candidates: file.amount ? [{ amount: file.amount, context: '' }] : [],
          status: file.status,
          resolvedAmount: file.amount,
          message: file.message || ''
        });
        idx = runResult.value.conflicts.length - 1;
      }
      openConflictModal(idx);
    }

    async function loadPdfForConflict() {
      if (pdfBlobUrl.value) {
        URL.revokeObjectURL(pdfBlobUrl.value);
        pdfBlobUrl.value = null;
      }
      pdfLoading.value = true;
      try {
        const conflict = currentConflict.value;
        if (!conflict || !execProject.value) return;
        const folderHandle = await getHandle(execProject.value.fileAccess.folderHandleKey);
        if (!folderHandle) return;
        const fileHandle = await findFileInFolder(folderHandle, conflict.filePath);
        if (!fileHandle) return;
        const file = await fileHandle.getFile();
        pdfBlobUrl.value = URL.createObjectURL(file);
      } catch (e) {
        console.warn('Could not load PDF for preview:', e.message);
      } finally {
        pdfLoading.value = false;
      }
    }

    function onKeydown(e) {
      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        const tag = (e.target?.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
        e.preventDefault();
        showShortcuts.value = !showShortcuts.value;
        return;
      }
      if (showShortcuts.value && e.key === 'Escape') {
        showShortcuts.value = false;
        return;
      }
      if (conflictIdx.value === null) return;
      if (e.key === 'Escape') closeConflictModal();
      if (e.key === 'Enter' && (conflictSelectedAmount.value || conflictManualAmount.value)) {
        e.preventDefault();
        applyConflictResolution();
      }
    }

    onMounted(() => { document.addEventListener('keydown', onKeydown); });

    function evaluateAmountExpression(input) {
      const normalized = String(input).replace(/,/g, '.').trim();
      if (normalized.includes('+')) {
        const parts = normalized.split('+').map(p => parseFloat(p.trim()));
        if (parts.some(isNaN)) return NaN;
        return Math.round(parts.reduce((a, b) => a + b, 0) * 100) / 100;
      }
      return parseFloat(normalized);
    }

    function applyConflictResolution() {
      const val = conflictManualAmount.value || conflictSelectedAmount.value;
      const amount = evaluateAmountExpression(val);
      if (isNaN(amount)) { showError(t('conflict.invalidAmount')); return; }

      if (conflictManualAmount.value) {
        lastManualEntry.value = String(amount);
        try { localStorage.setItem(LAST_MANUAL_KEY, String(amount)); } catch {}
      }

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
      if (execProject.value && runResult.value) {
        saveScanCache(execProject.value.id, runResult.value).catch(() => {});
      }
    }

    async function finalizeAndDownload() {
      error.value = '';
      try {
        const file = await getSpreadsheetFile(execProject.value);
        if (!file) throw new Error(t('execution.connectSpreadsheetFirst'));
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
        showSuccess(t('execution.doneMessage'));
      } catch (e) {
        showError(e.message);
      }
    }

    return {
      state, currentView, editingProject, execProject, runResult, isRunning,
      error, successMsg, importText, showAdvanced, excelMetadata, loadingMetadata,
      newFolderName, showAddMapping, pdfCount, conflictIdx, conflictSelectedAmount,
      conflictManualAmount, execStep, pdfBlobUrl, pdfZoom, showPdf, pdfLoading,
      scanCacheTimestamp, scanProgress, lastManualEntry, showShortcuts, lang,
      projects, currentConflict, unresolvedConflicts,
      allResolved, groupedResults, finalizeTotals, grandTotal, metadataCategories,
      metadataMonths, metadataTabs, openSections, toggleSection, isSectionOpen,
      persist, addProject, deleteProject, getProjectStatus, openEditProject,
      openExecution, goToDashboard, exportJson, importJsonReplaceAll, connectFolder,
      connectSpreadsheet, loadMetadata, addMappingRow, updateMappingLabel,
      deleteMappingRow, saveProject, countPdfs, runScan, forceRescan, openConflictModal,
      closeConflictModal, applyConflictResolution, editFileAmount, finalizeAndDownload, showError,
      formatCacheTime, t, setLang
    };
  },
  template: `
<div style="min-height:100vh;padding:1rem 1.5rem;max-width:1100px;margin:0 auto">

  <!-- Header -->
  <div class="glass-panel fade-in" style="padding:1rem 1.5rem;margin-bottom:1.5rem">
    <div class="flex-between">
      <div>
        <h1 style="font-size:1.4rem;font-weight:800;margin:0">\u{1F4CA} {{ t('header.title') }}</h1>
        <div class="text-xs text-muted">{{ t('header.subtitle') }}</div>
      </div>
      <div style="display:flex;align-items:center;gap:0.75rem">
        <button class="btn btn-ghost btn-sm" @click="showShortcuts = true" title="Keyboard shortcuts (?)" style="font-size:1rem;padding:0.3rem 0.5rem">\u2328</button>
        <select class="lang-select" :value="lang" @change="setLang($event.target.value)">
          <option value="en">EN</option>
          <option value="fr">FR</option>
        </select>
        <button v-if="currentView !== 'dashboard'" class="btn btn-ghost btn-sm" @click="goToDashboard">{{ t('header.back') }}</button>
      </div>
    </div>
  </div>

  <!-- Alerts -->
  <div v-if="error" class="alert alert-error mb-4 fade-in">\u26A0 {{ error }}</div>
  <div v-if="successMsg" class="alert alert-success mb-4 fade-in">\u2713 {{ successMsg }}</div>

  <!-- ==================== DASHBOARD ==================== -->
  <div v-if="currentView === 'dashboard'" class="fade-in">
    <div class="flex-between mb-4">
      <h2 style="font-size:1.15rem;font-weight:700;margin:0">{{ t('dashboard.yourProjects') }}</h2>
      <button class="btn btn-primary" @click="addProject">{{ t('dashboard.newProject') }}</button>
    </div>

    <div v-if="projects.length === 0" class="card empty-state">
      <div class="empty-icon">\u{1F4C1}</div>
      <p>{{ t('dashboard.noProjectsTitle') }}</p>
    </div>

    <div v-else class="grid-2" style="margin-bottom:2rem">
      <div v-for="project in projects" :key="project.id" class="card card-hover" style="cursor:default">
        <div class="flex-between mb-2">
          <div style="font-weight:700;font-size:1rem">{{ project.name }}</div>
          <button class="btn btn-ghost btn-sm" style="color:var(--error)" @click="deleteProject(project.id)" :title="t('editProject.cancel')">\u{1F5D1}</button>
        </div>
        <div class="flex-col gap-1 mb-4" style="font-size:0.8rem;color:var(--text-muted)">
          <div class="flex gap-2" style="align-items:center">
            <span class="status-dot" :class="getProjectStatus(project).hasFolder ? 'connected' : 'disconnected'"></span>
            {{ t('dashboard.folder') }}: {{ getProjectStatus(project).hasFolder ? t('dashboard.connected') : t('dashboard.notConnected') }}
          </div>
          <div class="flex gap-2" style="align-items:center">
            <span class="status-dot" :class="getProjectStatus(project).hasSpreadsheet ? 'connected' : 'disconnected'"></span>
            {{ t('dashboard.spreadsheet') }}: {{ project.fileAccess.spreadsheetName || t('dashboard.notConnected') }}
          </div>
          <div class="flex gap-2" style="align-items:center">
            <span class="status-dot" :class="getProjectStatus(project).hasMappings ? 'connected' : 'disconnected'"></span>
            {{ t('dashboard.mappings') }}: {{ Object.keys(project.categoryMapping || {}).length }} {{ t('dashboard.configured') }}
          </div>
        </div>
        <div class="flex gap-2">
          <button class="btn btn-outline btn-sm" @click="openEditProject(project)">{{ t('dashboard.edit') }}</button>
          <button class="btn btn-primary btn-sm" style="flex:1" @click="openExecution(project)">{{ t('dashboard.runScan') }}</button>
        </div>
      </div>
    </div>

    <!-- Advanced section -->
    <div class="card" style="margin-top:1rem">
      <div class="collapsible-header" @click="showAdvanced = !showAdvanced">
        <span style="font-weight:600;font-size:0.9rem">{{ t('dashboard.advancedSettings') }}</span>
        <span class="arrow" :class="{open: showAdvanced}">\u25B8</span>
      </div>
      <div v-if="showAdvanced" class="collapsible-body" style="padding-top:1rem">
        <div class="form-group mb-4">
          <label>{{ t('dashboard.backendUrl') }}</label>
          <input class="form-input" v-model="state.serverUrl" @change="persist" placeholder="http://localhost:8787" />
        </div>
        <div class="flex gap-2 mb-4">
          <button class="btn btn-outline btn-sm" @click="exportJson">{{ t('dashboard.exportState') }}</button>
        </div>
        <div class="form-group">
          <label>{{ t('dashboard.importState') }}</label>
          <textarea class="form-textarea" v-model="importText" rows="4" :placeholder="t('dashboard.importPlaceholder')"></textarea>
          <button class="btn btn-warning btn-sm mt-2" @click="importJsonReplaceAll" :disabled="!importText">{{ t('dashboard.importReplace') }}</button>
        </div>
      </div>
    </div>
  </div>

  <!-- ==================== EDIT PROJECT ==================== -->
  <div v-if="currentView === 'editProject' && editingProject" class="fade-in">
    <div class="card mb-4">
      <div class="flex-between mb-4">
        <h2 style="font-size:1.15rem;font-weight:700;margin:0">{{ t('editProject.title') }}</h2>
        <div class="flex gap-2">
          <button class="btn btn-ghost btn-sm" @click="goToDashboard">{{ t('editProject.cancel') }}</button>
          <button class="btn btn-primary btn-sm" @click="saveProject">{{ t('editProject.save') }}</button>
        </div>
      </div>

      <!-- Project Name -->
      <div class="form-group mb-4">
        <label>{{ t('editProject.projectName') }}</label>
        <input class="form-input" v-model="editingProject.name" :placeholder="t('editProject.projectNamePlaceholder')" />
      </div>

      <!-- File Connections -->
      <div class="section-title">{{ t('editProject.fileConnections') }}</div>
      <div class="grid-2 mb-4">
        <div class="card" style="padding:1rem">
          <div class="flex gap-2 mb-2" style="align-items:center">
            <span class="status-dot" :class="editingProject.fileAccess.folderHandleKey ? 'connected' : 'disconnected'"></span>
            <span style="font-weight:600;font-size:0.9rem">{{ t('editProject.pdfFolder') }}</span>
          </div>
          <p class="text-xs text-muted mb-2">{{ t('editProject.pdfFolderDesc') }}</p>
          <button class="btn btn-outline btn-sm btn-block" @click="connectFolder">
            {{ editingProject.fileAccess.folderHandleKey ? t('editProject.reconnect') : t('editProject.connectFolder') }}
          </button>
        </div>
        <div class="card" style="padding:1rem">
          <div class="flex gap-2 mb-2" style="align-items:center">
            <span class="status-dot" :class="editingProject.fileAccess.spreadsheetHandleKey ? 'connected' : 'disconnected'"></span>
            <span style="font-weight:600;font-size:0.9rem">{{ t('editProject.spreadsheetLabel') }}</span>
          </div>
          <p class="text-xs text-muted mb-2">{{ editingProject.fileAccess.spreadsheetName || t('editProject.noFileSelected') }}</p>
          <button class="btn btn-outline btn-sm btn-block" @click="connectSpreadsheet">
            {{ editingProject.fileAccess.spreadsheetHandleKey ? t('editProject.changeFile') : t('editProject.connectSpreadsheet') }}
          </button>
        </div>
      </div>

      <!-- Excel Config -->
      <div class="section-title">{{ t('editProject.spreadsheetConfig') }}</div>
      <div class="grid-3 mb-4">
        <div class="form-group">
          <label>{{ t('editProject.sheetTab') }} <span v-if="loadingMetadata" class="spinner" style="width:12px;height:12px;border-width:2px;vertical-align:middle"></span></label>
          <select class="form-select" v-model="editingProject.excelConfig.sheetName" @change="loadMetadata">
            <option value="">{{ t('editProject.selectTab') }}</option>
            <option v-for="tab in metadataTabs" :key="tab" :value="tab">{{ tab }}</option>
          </select>
        </div>
        <div class="form-group">
          <label>{{ t('editProject.monthStartCell') }}</label>
          <input class="form-input" v-model="editingProject.excelConfig.monthStartCell" placeholder="B1" @change="loadMetadata" />
        </div>
        <div class="form-group">
          <label>{{ t('editProject.categoryColumn') }}</label>
          <input class="form-input" v-model="editingProject.excelConfig.categoryColumn" placeholder="A" @change="loadMetadata" />
        </div>
      </div>

      <!-- Detected Months -->
      <div v-if="metadataMonths.length > 0" class="mb-4" style="padding:0.75rem;background:var(--primary-light);border-radius:8px">
        <div style="font-size:0.8rem;font-weight:600;color:var(--primary);margin-bottom:0.5rem">{{ t('editProject.detectedMonths') }}</div>
        <div class="flex gap-2" style="flex-wrap:wrap">
          <span v-for="m in metadataMonths" :key="m.address" class="badge badge-info">
            {{ m.month }} ({{ m.address }})
          </span>
        </div>
      </div>

      <!-- Category Mapping -->
      <div class="section-title">{{ t('editProject.categoryMapping') }}</div>
      <p class="text-xs text-muted mb-2">{{ t('editProject.categoryMappingDesc') }}</p>

      <div v-if="Object.keys(editingProject.categoryMapping).length === 0 && !showAddMapping" class="text-center text-muted" style="padding:2rem;font-size:0.9rem">
        {{ t('editProject.noMappings') }}
      </div>

      <div v-else>
        <!-- Mapping header -->
        <div class="mapping-row" style="font-size:0.75rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;border-bottom:2px solid var(--border)">
          <div>{{ t('editProject.folderName') }}</div>
          <div>{{ t('editProject.spreadsheetCategory') }}</div>
          <div>{{ t('editProject.row') }}</div>
          <div></div>
        </div>
        <!-- Mapping rows -->
        <div v-for="(excelLabel, folderName) in editingProject.categoryMapping" :key="folderName" class="mapping-row">
          <div class="folder-name">{{ folderName }}</div>
          <select class="form-select" :value="excelLabel" @change="updateMappingLabel(folderName, $event.target.value)" style="padding:0.4rem">
            <option value="">{{ t('editProject.selectCategory') }}</option>
            <option v-for="cat in metadataCategories" :key="cat" :value="cat">{{ cat }}</option>
          </select>
          <div class="row-info">
            <span v-if="excelLabel && excelMetadata.categories[excelLabel]">{{ t('editProject.row') }} {{ excelMetadata.categories[excelLabel].row }}</span>
            <span v-else class="text-muted">-</span>
          </div>
          <button class="btn btn-ghost btn-sm" style="color:var(--error)" @click="deleteMappingRow(folderName)">\u{1F5D1}</button>
        </div>
      </div>

      <!-- Add mapping -->
      <div class="mt-4">
        <div v-if="!showAddMapping">
          <button class="btn btn-outline btn-sm" @click="showAddMapping = true">{{ t('editProject.addFolderMapping') }}</button>
        </div>
        <div v-else class="flex gap-2" style="align-items:center">
          <input class="form-input" v-model="newFolderName" :placeholder="t('editProject.enterFolderName')" @keyup.enter="addMappingRow" style="max-width:300px" />
          <button class="btn btn-primary btn-sm" @click="addMappingRow">{{ t('editProject.add') }}</button>
          <button class="btn btn-ghost btn-sm" @click="showAddMapping = false; newFolderName = ''">{{ t('editProject.cancel') }}</button>
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
          <div class="text-xs text-muted mt-2" v-if="pdfCount > 0">{{ pdfCount }} {{ t('execution.pdfFilesFound') }}</div>
        </div>
        <button v-if="scanCacheTimestamp && !isRunning" class="btn btn-outline btn-sm" @click="forceRescan">{{ t('execution.rescan') }}</button>
      </div>

      <!-- Stepper -->
      <div class="stepper mb-4">
        <div class="step" :class="{active: execStep === 'ready' || execStep === 'scanning', done: execStep !== 'ready' && execStep !== 'scanning'}">
          <span class="step-num">1</span> {{ t('execution.stepScan') }}
        </div>
        <div class="step-divider"></div>
        <div class="step" :class="{active: execStep === 'resolve', done: execStep === 'finalize' || execStep === 'done'}">
          <span class="step-num">2</span> {{ t('execution.stepResolve') }}
        </div>
        <div class="step-divider"></div>
        <div class="step" :class="{active: execStep === 'finalize', done: execStep === 'done'}">
          <span class="step-num">3</span> {{ t('execution.stepFinalize') }}
        </div>
      </div>

      <!-- Ready state -->
      <div v-if="execStep === 'ready'" class="text-center" style="padding:2rem 0">
        <p class="text-muted mb-4">{{ t('execution.readyToScan', { count: pdfCount }) }}</p>
        <button class="btn btn-primary btn-lg" @click="runScan" :disabled="pdfCount === 0">
          {{ t('execution.startScan') }}
        </button>
      </div>

      <!-- Scanning state -->
      <div v-if="execStep === 'scanning'" class="text-center" style="padding:3rem 0">
        <div class="spinner spinner-lg" style="margin-bottom:1rem"></div>
        <p style="font-size:1.1rem;font-weight:600">{{ t('execution.processing', { count: pdfCount }) }}</p>
        <p class="text-sm text-muted">{{ t('execution.processingHint') }}</p>
        <div v-if="scanProgress.total > 0" style="margin-top:1.5rem;max-width:500px;margin-left:auto;margin-right:auto">
          <div class="progress-bar" style="height:10px">
            <div class="progress-fill" :style="{ width: Math.round(scanProgress.current / scanProgress.total * 100) + '%' }"></div>
          </div>
          <p class="text-sm" style="margin-top:0.5rem;font-weight:600">{{ scanProgress.current }} {{ t('execution.progressOf') }} {{ scanProgress.total }}</p>
          <p class="text-xs text-muted" style="margin-top:0.25rem">{{ scanProgress.currentFile }}</p>
        </div>
      </div>

      <!-- Results -->
      <div v-if="runResult && (execStep === 'resolve' || execStep === 'finalize' || execStep === 'done')">
        <!-- Stats -->
        <div class="flex gap-3 mb-4" style="flex-wrap:wrap">
          <span class="badge badge-success">\u2713 {{ runResult.stats.done }} {{ t('execution.extracted') }}</span>
          <span v-if="runResult.stats.ambiguous > 0" class="badge badge-warning">\u26A0 {{ runResult.stats.ambiguous }} {{ t('execution.ambiguous') }}</span>
          <span v-if="runResult.stats.failed > 0" class="badge badge-error">\u2715 {{ runResult.stats.failed }} {{ t('execution.failed') }}</span>
          <span class="badge badge-neutral">{{ runResult.stats.total }} {{ t('execution.total') }}</span>
        </div>
        <div v-if="scanCacheTimestamp" class="alert alert-info mb-2" style="font-size:0.8rem;display:flex;align-items:center;justify-content:space-between">
          <span>{{ t('execution.cachedResults', { time: formatCacheTime(scanCacheTimestamp) }) }}</span>
          <button class="btn btn-ghost btn-sm" style="font-size:0.75rem" @click="forceRescan" :disabled="isRunning">{{ t('execution.rescanAll') }}</button>
        </div>

        <!-- Grouped results -->
        <div class="section-title">{{ t('execution.scanResults') }}</div>
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
                  <div style="display:flex;align-items:center;gap:0.5rem">
                    <span v-if="file.status === 'success' || file.status === 'resolved'" class="badge badge-success">{{ (file.resolvedAmount !== undefined ? file.resolvedAmount : file.amount).toFixed(2) }}</span>
                    <span v-else-if="file.status === 'ambiguous'" class="badge badge-warning">{{ t('execution.ambiguous') }}</span>
                    <span v-else class="badge badge-error">{{ t('execution.failed') }}</span>
                    <button class="btn btn-ghost btn-sm" @click.stop="editFileAmount(file)" :title="t('execution.editAmount')" style="padding:0.2rem 0.4rem;font-size:0.75rem">\u270E</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Conflicts -->
        <div v-if="runResult.conflicts.length > 0 && execStep === 'resolve'" class="mt-6">
          <div class="section-title">{{ t('execution.conflictsToResolve') }} ({{ unresolvedConflicts.length }} {{ t('execution.remaining') }})</div>
          <div class="flex-col gap-2">
            <div v-for="(conflict, idx) in runResult.conflicts" :key="idx" class="card" style="padding:0.75rem 1rem">
              <div class="flex-between">
                <div>
                  <div style="font-weight:600">{{ conflict.fileName }}</div>
                  <div class="text-xs text-muted">{{ conflict.month }} / {{ conflict.category }}</div>
                </div>
                <div class="flex gap-2" style="align-items:center">
                  <span v-if="conflict.resolvedAmount !== undefined" class="badge badge-success">\u2713 {{ conflict.resolvedAmount.toFixed(2) }}</span>
                  <span v-else :class="conflict.status === 'failed' ? 'badge badge-error' : 'badge badge-warning'">{{ conflict.status === 'failed' ? t('execution.failed') : t('execution.ambiguous') }}</span>
                  <button v-if="conflict.resolvedAmount === undefined" class="btn btn-primary btn-sm" @click="openConflictModal(idx)">{{ t('execution.resolve') }}</button>
                  <button v-else class="btn btn-ghost btn-sm" @click="openConflictModal(idx)">{{ t('dashboard.edit') }}</button>
                </div>
              </div>
            </div>
          </div>
          <div v-if="allResolved" class="mt-4 text-center">
            <button class="btn btn-success btn-lg" @click="execStep = 'finalize'">{{ t('execution.continueFinalize') }}</button>
          </div>
        </div>

        <!-- Finalize -->
        <div v-if="execStep === 'finalize'" class="mt-6">
          <div class="summary-box">
            <div style="font-size:1rem;font-weight:700;margin-bottom:1rem">{{ t('execution.finalizePreview') }}</div>
            <div v-for="(total, category) in finalizeTotals" :key="category" class="summary-row">
              <span>{{ category }}</span>
              <span style="font-weight:600">{{ total.toFixed(2) }}</span>
            </div>
            <div class="summary-row summary-total">
              <span>{{ t('execution.grandTotal') }}</span>
              <span style="color:var(--primary)">{{ grandTotal.toFixed(2) }}</span>
            </div>
          </div>
          <div class="flex gap-3 mt-4" style="justify-content:center">
            <button class="btn btn-outline" @click="goToDashboard">{{ t('conflict.cancel') }}</button>
            <button class="btn btn-success btn-lg" @click="finalizeAndDownload">{{ t('execution.finalizeDownload') }}</button>
          </div>
        </div>

        <!-- Done -->
        <div v-if="execStep === 'done'" class="text-center mt-6" style="padding:2rem 0">
          <div style="font-size:3rem;margin-bottom:1rem">\u2713</div>
          <p style="font-size:1.1rem;font-weight:600;color:var(--success)">{{ t('execution.doneMessage') }}</p>
          <button class="btn btn-outline mt-4" @click="goToDashboard">{{ t('execution.backToDashboard') }}</button>
        </div>
      </div>
    </div>
  </div>

  <!-- ==================== KEYBOARD SHORTCUTS ==================== -->
  <div v-if="showShortcuts" class="modal-overlay" @click.self="showShortcuts = false" style="z-index:1100">
    <div class="shortcuts-panel">
      <div class="flex-between mb-4">
        <h3 style="margin:0;font-size:1.1rem;font-weight:700">\u2328 {{ t('shortcuts.title') }}</h3>
        <button class="btn btn-ghost btn-sm" @click="showShortcuts = false">\u2715</button>
      </div>
      <div>
        <div class="shortcut-row"><kbd>Enter</kbd><span>{{ t('shortcuts.enter') }}</span></div>
        <div class="shortcut-row"><kbd>Escape</kbd><span>{{ t('shortcuts.escape') }}</span></div>
        <div class="shortcut-row"><kbd>?</kbd><span>{{ t('shortcuts.question') }}</span></div>
        <div class="shortcut-row"><kbd>Ctrl+Scroll</kbd><span>{{ t('shortcuts.ctrlScroll') }}</span></div>
      </div>
    </div>
  </div>

  <!-- ==================== CONFLICT MODAL ==================== -->
  <div v-if="conflictIdx !== null && currentConflict" class="modal-overlay" @click.self="closeConflictModal">
    <div class="conflict-modal" :class="{'conflict-modal--with-pdf': showPdf && pdfBlobUrl}">
      <!-- Header -->
      <div class="conflict-modal__header">
        <div style="display:flex;align-items:center;gap:0.75rem">
          <h3 style="margin:0;font-size:1.1rem;font-weight:700">{{ t('conflict.title') }}</h3>
          <span v-if="unresolvedConflicts.length > 0" class="badge badge-error">{{ unresolvedConflicts.length }} {{ t('execution.remaining') }}</span>
        </div>
        <div style="display:flex;align-items:center;gap:0.5rem">
          <button class="btn btn-ghost btn-sm" @click="showPdf = !showPdf">
            {{ t('conflict.pdfLabel') }} {{ showPdf ? t('conflict.hidePdf') : t('conflict.showPdf') }}
          </button>
          <button class="btn btn-ghost btn-sm" @click="closeConflictModal">\u2715</button>
        </div>
      </div>

      <!-- Split content -->
      <div class="conflict-modal__body">
        <!-- PDF Preview Panel -->
        <div v-if="showPdf" class="conflict-modal__pdf-panel">
          <div class="pdf-toolbar">
            <span style="font-weight:600;font-size:0.85rem">{{ t('conflict.pdfPreview') }}</span>
            <div style="display:flex;align-items:center;gap:0.4rem">
              <span class="text-xs text-muted" style="font-style:italic;margin-right:0.5rem">{{ t('conflict.zoomHint') }}</span>
              <button class="btn btn-ghost btn-sm" @click="pdfZoom = Math.max(50, pdfZoom - 25)" :disabled="pdfZoom <= 50">
                \u2796
              </button>
              <span style="font-size:0.75rem;min-width:45px;text-align:center;font-weight:600">{{ pdfZoom }}%</span>
              <button class="btn btn-ghost btn-sm" @click="pdfZoom = Math.min(300, pdfZoom + 25)" :disabled="pdfZoom >= 300">
                \u2795
              </button>
            </div>
          </div>
          <div class="pdf-viewer">
            <div v-if="pdfLoading" class="flex-center" style="height:100%">
              <div class="spinner spinner-lg"></div>
            </div>
            <div v-else-if="!pdfBlobUrl" class="flex-center" style="height:100%;color:var(--text-muted);flex-direction:column;gap:0.5rem">
              <span style="font-size:2rem;opacity:0.3">\u{1F4C4}</span>
              <span style="font-size:0.85rem">{{ t('conflict.pdfNotAvailable') }}</span>
            </div>
            <iframe v-else :src="pdfBlobUrl" :style="{ width: pdfZoom + '%' }" style="border:none;height:100%;min-height:600px"></iframe>
          </div>
        </div>

        <!-- Candidates Panel -->
        <div class="conflict-modal__candidates-panel">
          <div style="flex:1;overflow-y:auto;padding:1.25rem">
            <!-- File info -->
            <div class="mb-4">
              <div style="font-weight:700;font-size:1rem">{{ currentConflict.fileName }}</div>
              <div class="text-sm text-muted">{{ currentConflict.month }} / {{ currentConflict.category }}</div>
              <div class="text-xs text-muted mt-2" v-if="currentConflict.message">{{ currentConflict.message }}</div>
            </div>

            <!-- Candidates with context -->
            <div v-if="currentConflict.candidates && currentConflict.candidates.length > 0" class="mb-4">
              <div class="section-title">{{ t('conflict.detectedAmounts') }}</div>
              <p class="text-xs text-muted mb-2">{{ t('conflict.selectCorrectAmount') }}</p>
              <div class="flex-col gap-2">
                <label v-for="(candidate, cidx) in currentConflict.candidates" :key="cidx"
                  class="candidate-option" :class="{selected: conflictSelectedAmount === String(candidate.amount != null ? candidate.amount : candidate)}">
                  <input type="radio" name="candidate"
                    :value="String(candidate.amount != null ? candidate.amount : candidate)"
                    v-model="conflictSelectedAmount" @change="conflictManualAmount = ''" />
                  <div style="flex:1;min-width:0">
                    <div style="font-weight:700;font-size:1.1rem">
                      {{ (candidate.amount != null ? candidate.amount : candidate).toFixed(2) }} \u20AC
                    </div>
                    <div v-if="candidate.context" class="candidate-context">
                      {{ candidate.context }}
                    </div>
                  </div>
                </label>
              </div>
            </div>

            <!-- No candidates -->
            <div v-else class="mb-4" style="padding:1.5rem;text-align:center;color:var(--text-muted);font-style:italic">
              {{ t('conflict.noCandidates') }}
            </div>

            <!-- Manual entry -->
            <div class="mb-2">
              <div class="section-title">{{ t('conflict.manualEntry') }}</div>
              <div v-if="lastManualEntry" class="last-entry-hint" @click="conflictManualAmount = lastManualEntry; conflictSelectedAmount = ''">
                <span style="color:var(--primary);font-weight:600">{{ t('conflict.lastEntry') }}:</span>
                <span style="font-weight:700;font-size:0.95rem">{{ lastManualEntry }}</span>
                <span class="text-xs text-muted" style="margin-left:auto">{{ t('conflict.lastEntryClick') }}</span>
              </div>
              <input class="form-input" type="text" inputmode="decimal" placeholder="0.00"
                v-model="conflictManualAmount" @input="conflictSelectedAmount = ''" style="font-size:1.15rem;font-weight:700;padding:0.75rem" />
              <p class="text-xs text-muted" style="margin-top:0.35rem;font-style:italic">{{ t('conflict.sumHint') }}</p>
            </div>
          </div>

          <!-- Footer -->
          <div class="conflict-modal__footer">
            <button class="btn btn-ghost" @click="closeConflictModal">{{ t('conflict.cancel') }}</button>
            <button class="btn btn-primary" :disabled="!conflictSelectedAmount && !conflictManualAmount" @click="applyConflictResolution">
              {{ t('conflict.apply') }}
            </button>
          </div>
        </div>
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

async function findFileInFolder(folderHandle, relativePath) {
  const parts = relativePath.split(/[\\/]/).filter(Boolean);
  let current = folderHandle;
  for (let i = 0; i < parts.length - 1; i++) {
    try {
      current = await current.getDirectoryHandle(parts[i]);
    } catch {
      return null;
    }
  }
  try {
    return await current.getFileHandle(parts[parts.length - 1]);
  } catch {
    return null;
  }
}

function openScanCacheDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SCAN_CACHE_DB, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('cache');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getScanCache(projectId) {
  const db = await openScanCacheDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('cache', 'readonly');
    const req = tx.objectStore('cache').get('scan:' + projectId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function saveScanCache(projectId, summary) {
  const db = await openScanCacheDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('cache', 'readwrite');
    tx.objectStore('cache').put({ summary, timestamp: Date.now() }, 'scan:' + projectId);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function clearScanCache(projectId) {
  const db = await openScanCacheDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('cache', 'readwrite');
    tx.objectStore('cache').delete('scan:' + projectId);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
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
