const LANG_KEY = 'scan-and-fill-lang';

const locales = {
  en: {
    header: {
      title: 'scan-and-fill',
      subtitle: 'Extract amounts from PDFs into your spreadsheet',
      back: '\u2190 Back'
    },
    dashboard: {
      yourProjects: 'Your Projects',
      newProject: '\uFF0B New Project',
      newProjectDefault: 'New Project',
      noProjectsTitle: 'No projects yet. Create one to get started.',
      folder: 'Folder',
      spreadsheet: 'Spreadsheet',
      mappings: 'Mappings',
      connected: 'Connected',
      notConnected: 'Not connected',
      configured: 'configured',
      edit: '\u270E Edit',
      runScan: '\u25B6 Run Scan',
      deleteConfirm: 'Delete this project? This cannot be undone.',
      advancedSettings: '\u2699 Advanced Settings',
      backendUrl: 'Backend URL (leave empty for same server)',
      exportState: '\u{1F4E4} Export State',
      importState: 'Import State (replaces everything)',
      importPlaceholder: 'Paste exported JSON here...',
      importReplace: '\u{1F4E5} Import & Replace',
      stateImported: 'State imported successfully',
      importFailed: 'Import failed',
      invalidStateFile: 'Invalid state file'
    },
    editProject: {
      title: '\u270E Edit Project',
      save: '\u{1F4BE} Save',
      cancel: 'Cancel',
      projectName: 'Project Name',
      projectNamePlaceholder: 'My accounting project',
      fileConnections: 'File Connections',
      pdfFolder: '\u{1F4C1} PDF Folder',
      pdfFolderDesc: 'Folder with month/category/pdf structure',
      reconnect: '\u{1F504} Reconnect',
      connectFolder: 'Connect Folder',
      spreadsheetLabel: '\u{1F4C4} Spreadsheet',
      noFileSelected: 'No file selected',
      changeFile: '\u{1F504} Change',
      connectSpreadsheet: 'Connect Spreadsheet',
      spreadsheetConfig: 'Spreadsheet Configuration',
      sheetTab: 'Sheet Tab',
      selectTab: 'Select a tab...',
      monthStartCell: 'Month Start Cell',
      categoryColumn: 'Category Column',
      detectedMonths: '\u{1F4C5} Detected Months',
      categoryMapping: 'Category Mapping',
      categoryMappingDesc: 'Map your folder names to spreadsheet category labels',
      noMappings: 'No mappings yet. Click below to add your first folder mapping.',
      folderName: 'Folder Name',
      spreadsheetCategory: 'Spreadsheet Category',
      row: 'Row',
      selectCategory: '-- Select category --',
      addFolderMapping: '\uFF0B Add Folder Mapping',
      enterFolderName: 'Enter folder name...',
      add: 'Add',
      folderExists: 'already exists in mappings',
      projectSaved: 'Project saved',
      browserNoFolder: 'Your browser does not support folder selection. Please use Chrome or Edge.',
      browserNoFile: 'Your browser does not support file selection. Please use Chrome or Edge.',
      folderFailed: 'Folder connection failed',
      spreadsheetFailed: 'Spreadsheet connection failed',
      metadataFailed: 'Load metadata failed'
    },
    execution: {
      pdfFilesFound: 'PDF files found in folder',
      rescan: '\u{1F504} Re-scan',
      stepScan: 'Scan',
      stepResolve: 'Resolve',
      stepFinalize: 'Finalize',
      readyToScan: 'Ready to scan {count} PDF files and extract amounts.',
      startScan: '\u25B6 Start Scan',
      processing: 'Processing {count} files...',
      processingHint: 'This may take a moment depending on file count and size.',
      progressOf: 'of',
      extracted: 'extracted',
      ambiguous: 'ambiguous',
      failed: 'failed',
      total: 'total',
      cachedResults: '\u{1F4CB} Cached results from {time}',
      rescanAll: '\u{1F504} Re-scan All',
      scanResults: 'Scan Results',
      conflictsToResolve: '\u26A0 Conflicts to Resolve',
      remaining: 'remaining',
      resolve: 'Resolve',
      continueFinalize: '\u279C Continue to Finalize',
      finalizePreview: '\u{1F4CB} Finalize Preview',
      grandTotal: 'Grand Total',
      finalizeDownload: '\u{1F4E5} Finalize & Download',
      doneMessage: 'Spreadsheet updated and downloaded!',
      backToDashboard: 'Back to Dashboard',
      connectFolderFirst: 'Connect project folder first (edit the project)',
      noPdfsFound: 'No PDF files found in the selected folder',
      connectSpreadsheetFirst: 'Connect spreadsheet first (edit the project)',
      editAmount: 'Edit amount'
    },
    conflict: {
      title: '\u26A0 Resolve Conflict',
      hidePdf: 'Hide',
      showPdf: 'Show',
      pdfLabel: '\u{1F4C4} PDF',
      pdfPreview: '\u{1F4C4} PDF Preview',
      pdfNotAvailable: 'PDF preview not available',
      detectedAmounts: 'Detected Amounts (HT)',
      selectCorrectAmount: 'Select the correct amount:',
      noCandidates: 'No amount candidates detected. Enter the amount manually below.',
      manualEntry: 'Manual Entry',
      cancel: 'Cancel',
      apply: '\u2713 Apply',
      invalidAmount: 'Please enter a valid amount',
      zoomHint: 'Ctrl + scroll to zoom',
      sumHint: 'Use + to add amounts (e.g. 11.91+2155.76)',
      lastEntry: 'Last entry',
      lastEntryClick: 'Click to use'
    },
    language: {
      label: 'Language',
      en: 'English',
      fr: 'Français'
    },
    shortcuts: {
      title: 'Keyboard Shortcuts',
      enter: 'Apply amount & next conflict',
      escape: 'Close dialog',
      question: 'Toggle shortcuts help',
      ctrlScroll: 'Zoom PDF preview'
    },
    cache: {
      justNow: 'just now',
      minAgo: 'min ago',
      hAgo: 'h ago'
    }
  },
  fr: {
    header: {
      title: 'scan-and-fill',
      subtitle: 'Extraire les montants des PDF vers votre tableur',
      back: '\u2190 Retour'
    },
    dashboard: {
      yourProjects: 'Vos Projets',
      newProject: '\uFF0B Nouveau Projet',
      newProjectDefault: 'Nouveau Projet',
      noProjectsTitle: 'Aucun projet. Créez-en un pour commencer.',
      folder: 'Dossier',
      spreadsheet: 'Tableur',
      mappings: 'Mappages',
      connected: 'Connecté',
      notConnected: 'Non connecté',
      configured: 'configuré(s)',
      edit: '\u270E Modifier',
      runScan: '\u25B6 Lancer le Scan',
      deleteConfirm: 'Supprimer ce projet ? Cette action est irréversible.',
      advancedSettings: '\u2699 Paramètres Avancés',
      backendUrl: 'URL du Backend (laisser vide pour le même serveur)',
      exportState: '\u{1F4E4} Exporter l\'État',
      importState: 'Importer l\'État (remplace tout)',
      importPlaceholder: 'Collez le JSON exporté ici...',
      importReplace: '\u{1F4E5} Importer & Remplacer',
      stateImported: 'État importé avec succès',
      importFailed: 'Échec de l\'importation',
      invalidStateFile: 'Fichier d\'état invalide'
    },
    editProject: {
      title: '\u270E Modifier le Projet',
      save: '\u{1F4BE} Enregistrer',
      cancel: 'Annuler',
      projectName: 'Nom du Projet',
      projectNamePlaceholder: 'Mon projet comptable',
      fileConnections: 'Connexions Fichiers',
      pdfFolder: '\u{1F4C1} Dossier PDF',
      pdfFolderDesc: 'Dossier avec structure mois/catégorie/pdf',
      reconnect: '\u{1F504} Reconnecter',
      connectFolder: 'Connecter Dossier',
      spreadsheetLabel: '\u{1F4C4} Tableur',
      noFileSelected: 'Aucun fichier sélectionné',
      changeFile: '\u{1F504} Changer',
      connectSpreadsheet: 'Connecter Tableur',
      spreadsheetConfig: 'Configuration du Tableur',
      sheetTab: 'Onglet',
      selectTab: 'Sélectionner un onglet...',
      monthStartCell: 'Cellule Début Mois',
      categoryColumn: 'Colonne Catégorie',
      detectedMonths: '\u{1F4C5} Mois Détectés',
      categoryMapping: 'Mappage des Catégories',
      categoryMappingDesc: 'Associez vos noms de dossiers aux catégories du tableur',
      noMappings: 'Aucun mappage. Cliquez ci-dessous pour ajouter votre premier mappage.',
      folderName: 'Nom du Dossier',
      spreadsheetCategory: 'Catégorie Tableur',
      row: 'Ligne',
      selectCategory: '-- Sélectionner catégorie --',
      addFolderMapping: '\uFF0B Ajouter Mappage',
      enterFolderName: 'Entrez le nom du dossier...',
      add: 'Ajouter',
      folderExists: 'existe déjà dans les mappages',
      projectSaved: 'Projet enregistré',
      browserNoFolder: 'Votre navigateur ne supporte pas la sélection de dossiers. Utilisez Chrome ou Edge.',
      browserNoFile: 'Votre navigateur ne supporte pas la sélection de fichiers. Utilisez Chrome ou Edge.',
      folderFailed: 'Échec de connexion au dossier',
      spreadsheetFailed: 'Échec de connexion au tableur',
      metadataFailed: 'Échec du chargement des métadonnées'
    },
    execution: {
      pdfFilesFound: 'fichiers PDF trouvés dans le dossier',
      rescan: '\u{1F504} Re-scanner',
      stepScan: 'Scanner',
      stepResolve: 'Résoudre',
      stepFinalize: 'Finaliser',
      readyToScan: 'Prêt à scanner {count} fichiers PDF et extraire les montants.',
      startScan: '\u25B6 Lancer le Scan',
      processing: 'Traitement de {count} fichiers...',
      processingHint: 'Cela peut prendre un moment selon le nombre et la taille des fichiers.',
      progressOf: 'sur',
      extracted: 'extraits',
      ambiguous: 'ambigus',
      failed: 'échoués',
      total: 'total',
      cachedResults: '\u{1F4CB} Résultats en cache depuis {time}',
      rescanAll: '\u{1F504} Re-scanner Tout',
      scanResults: 'Résultats du Scan',
      conflictsToResolve: '\u26A0 Conflits à Résoudre',
      remaining: 'restant(s)',
      resolve: 'Résoudre',
      continueFinalize: '\u279C Continuer vers Finalisation',
      finalizePreview: '\u{1F4CB} Aperçu Finalisation',
      grandTotal: 'Total Général',
      finalizeDownload: '\u{1F4E5} Finaliser & Télécharger',
      doneMessage: 'Tableur mis à jour et téléchargé !',
      backToDashboard: 'Retour au Tableau de Bord',
      connectFolderFirst: 'Connectez d\'abord le dossier du projet (modifiez le projet)',
      noPdfsFound: 'Aucun fichier PDF trouvé dans le dossier sélectionné',
      connectSpreadsheetFirst: 'Connectez d\'abord le tableur (modifiez le projet)',
      editAmount: 'Modifier le montant'
    },
    conflict: {
      title: '\u26A0 Résoudre le Conflit',
      hidePdf: 'Masquer',
      showPdf: 'Afficher',
      pdfLabel: '\u{1F4C4} PDF',
      pdfPreview: '\u{1F4C4} Aperçu PDF',
      pdfNotAvailable: 'Aperçu PDF non disponible',
      detectedAmounts: 'Montants Détectés (HT)',
      selectCorrectAmount: 'Sélectionnez le montant correct :',
      noCandidates: 'Aucun montant candidat détecté. Saisissez le montant manuellement ci-dessous.',
      manualEntry: 'Saisie Manuelle',
      cancel: 'Annuler',
      apply: '\u2713 Appliquer',
      invalidAmount: 'Veuillez entrer un montant valide',
      zoomHint: 'Ctrl + molette pour zoomer',
      sumHint: 'Utilisez + pour additionner (ex: 11.91+2155.76)',
      lastEntry: 'Dernière saisie',
      lastEntryClick: 'Cliquer pour utiliser'
    },
    language: {
      label: 'Langue',
      en: 'English',
      fr: 'Français'
    },
    shortcuts: {
      title: 'Raccourcis Clavier',
      enter: 'Appliquer le montant & conflit suivant',
      escape: 'Fermer la boîte de dialogue',
      question: 'Afficher/masquer les raccourcis',
      ctrlScroll: 'Zoomer l\'aperçu PDF'
    },
    cache: {
      justNow: 'à l\'instant',
      minAgo: 'min',
      hAgo: 'h'
    }
  }
};

function getStoredLang() {
  try {
    return localStorage.getItem(LANG_KEY) || 'en';
  } catch {
    return 'en';
  }
}

function setStoredLang(lang) {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch { /* ignore */ }
}

function translate(lang, key) {
  const parts = key.split('.');
  let val = locales[lang];
  for (const p of parts) {
    if (val == null) return key;
    val = val[p];
  }
  return val != null ? val : key;
}

export { locales, getStoredLang, setStoredLang, translate };
