# Build Plan: Cross-Platform Packaging for Linux/Windows

**Date**: February 6, 2026  
**Status**: 🟡 PLANNED  
**Priority**: MEDIUM  
**Timeline**: 1-2 hours per platform  

---

## Overview

Create a **comprehensive build and packaging plan** for distributing the scan-and-fill application on **Linux** and **Windows** platforms. This includes creating installers, testing, and documentation.

---

## Current State

### Existing Infrastructure ✅

**Package.json Scripts**:
```json
"build": "electron-vite build",
"build:unpack": "npm run build && electron-builder --dir",
"build:win": "npm run build && electron-builder --win",
"build:linux": "npm run build && electron-builder --linux"
```

**electron-builder.yml Configuration** ✅
- Windows: NSIS installer (`.exe`)
- Linux: AppImage, snap, deb packages
- macOS: DMG (not in scope)
- Signing/notarization: Basic setup, no code signing configured

---

## Build Targets

### Windows (NSIS Installer)

**Current Config** (electron-builder.yml lines 13-18):
```yaml
win:
  executableName: scan-and-fill
nsis:
  artifactName: ${name}-${version}-setup.${ext}
  shortcutName: ${productName}
  uninstallDisplayName: ${productName}
  createDesktopShortcut: always
```

**Output**: 
- Installer: `scan-and-fill-{version}-setup.exe`
- Portable: `scan-and-fill-{version}.exe` (optional)

**Features**:
- Desktop shortcut creation
- Uninstall support
- System integration

### Linux (Multiple Formats)

**Current Config** (electron-builder.yml lines 30-38):
```yaml
linux:
  target:
    - AppImage
    - snap
    - deb
  maintainer: electronjs.org
  category: Utility
appImage:
  artifactName: ${name}-${version}.${ext}
```

**Output Formats**:
- **AppImage**: `scan-and-fill-{version}.AppImage` (universal, single file)
- **DEB**: `scan-and-fill-{version}.deb` (Debian/Ubuntu)
- **snap**: `scan-and-fill-{version}.snap` (Snapcraft)

---

## Prerequisites

### Windows Build Requirements
- Node.js (already have)
- npm/yarn (already have)
- Windows machine OR Windows-compatible build environment
- Optional: Code signing certificate for production releases

### Linux Build Requirements
- Node.js (already have)
- npm/yarn (already have)
- Linux machine OR container environment
- Optional: GPG key for package signing
- Build tools: `build-essential`, `fakeroot`, `dpkg`

### Common Requirements
- All platforms: `npm install` completed
- All platforms: Current version in `package.json`
- All platforms: Application tested on dev build

---

## Build Process

### Phase 1: Windows Build

#### Step 1.1: Prepare Environment
```bash
# Verify Node.js and npm
node --version  # Should be v18+
npm --version

# Install dependencies (if not already done)
npm install

# Verify build succeeds
npm run build
```

#### Step 1.2: Build Windows Installer
```bash
# Run the Windows build script
npm run build:win

# Outputs to: dist/
# - scan-and-fill-{version}-setup.exe (installer)
# - scan-and-fill-{version}.exe (portable, optional)
```

#### Step 1.3: Verify Build Output
```bash
# Check dist folder
ls -lh dist/scan-and-fill-*

# Expected output:
# scan-and-fill-1.0.0-setup.exe (~150-200 MB)
```

#### Step 1.4: Test Installation
1. Download `scan-and-fill-{version}-setup.exe`
2. Run installer
3. Verify:
   - Installation completes without errors
   - Desktop shortcut created
   - App launches successfully
   - All features work (forms, execution, conflict resolution)
   - Language switching works (EN/FR)

---

### Phase 2: Linux Build

#### Step 2.1: Prepare Environment
```bash
# On Linux machine or container
node --version  # Should be v18+
npm --version

npm install
npm run build
```

#### Step 2.2: Build Linux Packages
```bash
# Build all Linux targets (AppImage, deb, snap)
npm run build:linux

# Outputs to: dist/
# - scan-and-fill-{version}.AppImage
# - scan-and-fill-{version}.deb
# - scan-and-fill-{version}.snap
```

#### Step 2.3: Verify Build Outputs
```bash
# Check all package formats
ls -lh dist/scan-and-fill-*

# Expected:
# scan-and-fill-{version}.AppImage (~150-200 MB)
# scan-and-fill-{version}.deb (~100-150 MB)
# scan-and-fill-{version}.snap (~150-200 MB)
```

#### Step 2.4: Test Each Format

**AppImage Test**:
```bash
chmod +x scan-and-fill-{version}.AppImage
./scan-and-fill-{version}.AppImage
# Should launch app directly
```

**DEB Test** (on Debian/Ubuntu):
```bash
sudo dpkg -i scan-and-fill-{version}.deb
scan-and-fill  # Should run from command line
# Verify uninstall: sudo apt remove scan-and-fill
```

**snap Test** (if snapd installed):
```bash
sudo snap install ./scan-and-fill-{version}.snap --dangerous
snap run scan-and-fill
```

---

## Detailed Build Commands

### Windows Build
```bash
cd /path/to/scan-and-fill

# Full build pipeline
npm run build:win

# Or manually:
npm run build                          # Create build output
npx electron-builder --win             # Package for Windows
```

### Linux Build
```bash
cd /path/to/scan-and-fill

# Full build pipeline
npm run build:linux

# Or manually:
npm run build                          # Create build output
npx electron-builder --linux           # Package for Linux
```

### Cross-Platform Build
```bash
# Build for both platforms (requires cross-platform setup)
npm run build && npx electron-builder --win --linux
```

---

## Build Output Structure

After running builds, the `dist/` folder contains:

```
dist/
├── scan-and-fill-1.0.0-setup.exe         (Windows installer)
├── scan-and-fill-1.0.0.exe               (Windows portable)
├── scan-and-fill-1.0.0.AppImage          (Linux universal)
├── scan-and-fill-1.0.0.deb               (Debian/Ubuntu)
├── scan-and-fill-1.0.0.snap              (Snapcraft)
└── builder-effective-config.yaml         (Build config used)
```

---

## Configuration Deep Dive

### electron-builder.yml Analysis

**Current Version Settings**:
```yaml
appId: com.electron.app
productName: scan-and-fill
```

**Recommended Updates for Production**:
```yaml
# Better app ID (reverse domain)
appId: com.scan-and-fill.app

# Include version from package.json
productName: "Scan & Fill"  # Display name

# Add copyright
copyright: "Copyright © 2026 Scan & Fill Contributors"

# Add categories
categories:
  - Utility
  - Office
```

### Windows-Specific Config

**Current NSIS Settings** ✅
- Installer executable name: `scan-and-fill-{version}-setup.exe`
- Desktop shortcut: Always created
- Uninstall support: Yes
- Program Files location: Default

**Optional Enhancements**:
```yaml
win:
  executableName: scan-and-fill
  certificateFile: path/to/cert.pfx  # For code signing
  certificatePassword: ${CERT_PASSWORD}
  signingHashAlgorithms:
    - sha256
  sign: ./customSign.js  # Custom signing script

nsis:
  oneClick: false        # User selects install location
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: always
  createStartMenuShortcut: true
  shortcutName: "Scan & Fill"
```

### Linux-Specific Config

**Current Settings** ✅
- Targets: AppImage, deb, snap
- Maintainer: electronjs.org (should update)
- Category: Utility

**Recommended Updates**:
```yaml
linux:
  target:
    - AppImage
    - deb
    - snap
  maintainer: "your-email@example.com"
  maintainerEmail: "your-email@example.com"
  category: Utility
  description: "Scan and auto-fill expense documents into spreadsheets"
  desktop:
    Categories: Utility;Office

deb:
  depends:
    - gconf2
    - gconf-service
    - libappindicator1
    - libnotify4
    - libxtst6
    - xdg-utils

appImage:
  artifactName: ${name}-${version}.${ext}

snap:
  publish:
    provider: snapcraft
```

---

## Testing Checklist

### Pre-Build Testing
- [ ] Latest code committed
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] `npm run dev` works correctly
- [ ] All features tested manually
  - [ ] Dashboard view
  - [ ] Project creation
  - [ ] File selection
  - [ ] Execution/scanning
  - [ ] Conflict resolution
  - [ ] Language switching (EN/FR)

### Windows Build Testing
- [ ] Build completes without errors
- [ ] Installer `.exe` created (100+ MB)
- [ ] Installer runs without errors
- [ ] Application launches after installation
- [ ] Desktop shortcut works
- [ ] Uninstall works cleanly
- [ ] All features functional
- [ ] Window opens maximized ✅

### Linux Build Testing (AppImage)
- [ ] Build completes without errors
- [ ] AppImage file created (100+ MB)
- [ ] AppImage is executable
- [ ] App launches from AppImage
- [ ] All features functional
- [ ] Can be placed anywhere and still runs
- [ ] Window opens maximized ✅

### Linux Build Testing (DEB)
- [ ] DEB package created
- [ ] Installation: `sudo dpkg -i *.deb` succeeds
- [ ] Command-line launch works: `scan-and-fill`
- [ ] Desktop shortcut created
- [ ] Uninstall: `sudo apt remove scan-and-fill` works
- [ ] All features functional

### Linux Build Testing (snap)
- [ ] snap package created (if applicable)
- [ ] Installation via snapcraft works
- [ ] Launch from snap works
- [ ] Permissions/confinement working

---

## Troubleshooting Guide

### Build Failures

**Issue**: "Cannot find module 'electron-builder'"
```bash
# Solution:
npm install
npm run build:win  # or build:linux
```

**Issue**: "Icon not found"
```bash
# Verify build resources exist:
ls build/icon.png
ls build/icons/  # For different sizes
```

**Issue**: "Wine not found" (building Windows on Linux)
```bash
# If cross-building Windows from Linux:
sudo apt-get install wine wine32 wine64
```

### Package Failures

**Issue**: NSIS installer creation fails
```bash
# Verify permissions and disk space
df -h
# Rebuild:
npm run build:win
```

**Issue**: DEB dependencies not found
```bash
# Run on Debian/Ubuntu system
# Or update dependencies in electron-builder.yml
```

---

## Distribution Strategy

### For Windows Users

**Option A: Direct Download**
- Host `scan-and-fill-{version}-setup.exe` on website
- Users download and run installer
- Automatic desktop shortcut

**Option B: Windows Store** (future)
- Publish MSIX package to Microsoft Store
- Easier updates via Store
- Requires App Store account

### For Linux Users

**Option A: AppImage** (Recommended for all distributions)
- Single executable file
- No installation required
- Can be placed anywhere
- Works on any Linux distro with glibc

**Option B: DEB** (For Debian/Ubuntu users)
- Native installation via `dpkg` or `apt`
- Automatic dependency resolution
- System integration
- Easier uninstall

**Option C: snap** (Canonical's approach)
- Confined/sandboxed
- Automatic updates
- Easy distribution via Snapcraft
- Larger package size

---

## Version Management

### Current Version
```json
// package.json
{
  "name": "scan-and-fill",
  "version": "1.0.0",
  ...
}
```

### Versioning Scheme
- **Major**: Major features or breaking changes (1.0.0)
- **Minor**: New features, backward compatible (1.1.0)
- **Patch**: Bug fixes (1.0.1)

### Version Workflow
1. Update `package.json` version
2. Update `CHANGELOG.md` with changes
3. Tag release in git
4. Run build for all platforms
5. Upload to distribution channels
