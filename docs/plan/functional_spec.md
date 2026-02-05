# Functional Specification: scan-and-fill

## 1. Overview
`scan-and-fill` is a cross-platform (Windows/Linux) utility designed to automate the extraction of financial data from PDF files and populate a structured Excel report. While initially conceived for a bookstore's billing needs, the tool is built to be generic and highly configurable for any organization that manages monthly expenses/revenues categorized in folders.

## 2. Key Features
- **Project-Based Organization**: Group extractions by "Project" (e.g., "Billing Year 2026").
- **Multi-Source Extraction**: Scan PDF files from a nested directory structure where folders represent months and sub-folders represent categories.
- **Dynamic Excel Mapping**: Select a target Excel file and tab, then define a mapping between folder names and Excel cells/categories.
- **Totalization**: Automatically sum all extracted amounts for a specific category within a given month.
- **Multilingual Support**: Recognition of month names in English, French, and Spanish.
- **White-labeling**: The tool name and branding can be customized via configuration.

## 3. User Journey & Workflow

### 3.1 Project Setup
1. **Create Project**: User defines a project name (e.g., `2026`).
2. **Select Root Folder**: User selects the directory containing the PDFs (e.g., `~/billing-2026`).
3. **Select Target Excel**: User selects the `.xlsx` or `.xls` file to be updated.
4. **Target Tab**: User selects the specific worksheet (tab) within the Excel file.

### 3.2 Data Mapping
1. **Month Mapping**: User identifies the starting cell for months (e.g., `A2` for "January").
   - The system automatically assumes subsequent months follow horizontally to the right.
2. **Category Mapping**: User maps directory names to Excel category names.
   - **Example**: Directory `achats_enfants` -> Excel Label `Livres Enfants`.
3. **Amount Location**: Configuration (via regex or positional logic) to identify "Total" or "Amount" fields within the PDFs.

### 3.3 Extraction & Filling
1. **Scan**: The tool traverses the root folder.
   - Identifies month folders (e.g., `janvier`, `jan 2026`, `enero 28`).
   - Identifies category sub-folders.
2. **Extraction**: Parses each PDF in the category folders to find currency amounts.
3. **Summation**: Calculates the total for each `[Month, Category]` pair.
4. **Update Excel**: Writes the computed totals into the mapped cells in the selected Excel tab.

## 4. Data Logic & Folder Structure

### 4.1 Folder Hierarchy
The tool expects a structure like:
```text
Root/
├── January/
│   ├── category_A/
│   │   ├── invoice1.pdf
│   │   └── invoice2.pdf
│   └── category_B/
├── February/
│   └── ...
```

### 4.2 Month Recognition
The tool uses a flexible parser for months in ES/FR/EN:
- **EN**: January, Feb, Mar...
- **FR**: Janvier, Févr, Mars...
- **ES**: Enero, Feb, Marz...
- Supports year suffixes (e.g., `Enero 2026`).

### 4.3 Category Mapping Table
A dynamic mapping table allows reconciliation between folder names and Excel row labels:
| Folder Name | Excel Category Name |
| :--- | :--- |
| `achats_enfants` | `Livres Enfants` |
| `bd_comics` | `BD & Comics` |

## 5. Customization
The tool's identity is configurable via a `config.json` or similar:
- `app_name`: "scan-and-fill" (default)
- `supported_languages`: ["en", "fr", "es"]
- `currency_symbols`: ["$", "€", "£"]

## 6. Technical Requirements
- **OS**: Windows, Linux.
- **File Support**: PDF (source), XLSX/XLS (target).
- **Core Engine**: Needs a robust PDF parsing library and an Excel manipulation library that preserves existing formatting.
## 7. Extraction Refinements

### 7.1 Smart Document Caching
- The tool tracks previously processed documents via file paths and modification timestamps.
- Documents with a successful extraction status are skipped in subsequent scans to save time.
- Users can force a "Re-scan" for any specific document or the entire project.

### 7.2 Conflict & Error Resolution
- **Extraction Failure**: If no amount can be reliably extracted, the document is flagged for manual review.
- **Ambiguity Detection**: If the tool detects multiple potential "Total" amounts, it presents them to the user with surrounding text context.
- **Manual Override**: Users can manually input the amount for any PDF directly within the UI.
- **Visual Verification**: Option to preview the PDF within the tool to assist with manual extraction.
