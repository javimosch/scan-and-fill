# Feature Plan: Maximize Window on Startup

**Date**: February 6, 2026  
**Status**: 🟡 PLANNED  
**Priority**: LOW  
**Complexity**: TRIVIAL  

---

## Overview

Start the application with a **maximized window** instead of fixed dimensions (900x670). This provides a better user experience with more screen real estate for viewing and interacting with the UI.

---

## Current Behavior

**File**: `src/main/index.js` (lines 18-22)

```javascript
const mainWindow = new BrowserWindow({
  width: 900,
  height: 670,
  show: false,
  autoHideMenuBar: true,
  // ...
})
```

**Current State**:
- Fixed window size: 900px × 670px
- Opens in center of screen
- User must manually maximize if desired

---

## Proposed Change

Add Electron's `maximize()` method to maximize window after creation.

### Option 1: Direct Maximize (Recommended)
```javascript
function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    // ... existing config
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.maximize()  // ← ADD THIS
    mainWindow.show()
  })
  
  // ... rest of code
}
```

### Option 2: With Fallback Dimensions
```javascript
const mainWindow = new BrowserWindow({
  width: 900,
  height: 670,
  show: false,
  autoHideMenuBar: true,
  // ... existing config
})

mainWindow.on('ready-to-show', () => {
  mainWindow.maximize()
  mainWindow.show()
})
```

---

## Impact Analysis

### Benefits
✅ Better UX - More screen space
✅ Professional appearance
✅ Matches user expectations
✅ Shows content without extra scrolling

### Trade-offs
⚠️ Window dimensions no longer predictable
⚠️ Layout must be responsive (already is)
⚠️ Cannot rely on fixed sizing for features

### Browser Support
✅ Works on Windows
✅ Works on macOS
✅ Works on Linux (most window managers)

---

## Implementation Details

### Files to Modify
1. **src/main/index.js** (lines 30-32)
   - Move `mainWindow.maximize()` call
   - Execute before `mainWindow.show()`

### Testing Checklist
- [ ] Window opens maximized
- [ ] Works on Windows
- [ ] Works on macOS
- [ ] Works on Linux
- [ ] Layout responsive (no cut-off content)
- [ ] Dashboard displays properly
- [ ] Forms display properly
- [ ] Modals/dialogs position correctly

### Code Diff

```javascript
// BEFORE
mainWindow.on('ready-to-show', () => {
  mainWindow.show()
})

// AFTER
mainWindow.on('ready-to-show', () => {
  mainWindow.maximize()
  mainWindow.show()
})
```

---

## Alternatives Considered

### Option A: Set to Screen Size
```javascript
const { screen } = require('electron')
const { width, height } = screen.getPrimaryDisplay().workAreaSize
const mainWindow = new BrowserWindow({ width, height })
```
**Pros**: No need for maximize() call
**Cons**: Ignores window manager decorations on some OSes

### Option B: Remember Last Window State
```javascript
// Store window state on close, restore on open
```
**Pros**: Respects user preferences
**Cons**: More complex, requires storage

### Option C: No Change (Current)
**Pros**: Predictable sizing
**Cons**: Not maximized by default

**Recommendation**: Use Option 1 (Direct Maximize) - simplest and most effective

---

## Implementation Steps

### Step 1: Update Main Process
Edit `src/main/index.js` at line 30-32:
```javascript
mainWindow.on('ready-to-show', () => {
  mainWindow.maximize()
  mainWindow.show()
})
```

### Step 2: Verify Responsive Layout
- No hardcoded sizes in components
- Flexbox/CSS Grid handles resizing
- Dashboard grid adapts to screen width
- Forms and modals use responsive sizing

### Step 3: Test on Multiple Platforms
```bash
npm run build
npm run preview  # Test on development machine

# Or build distributable
npm run build:win   # Windows
npm run build:mac   # macOS  
npm run build:linux # Linux
```

### Step 4: Verify No Regressions
- [ ] All views display correctly at max size
- [ ] PDF viewer works in maximized window
- [ ] Forms have proper margins
- [ ] Modal dialogs center correctly
- [ ] No overflow or cut-off content

---

## Effort Estimate

| Task | Duration |
|------|----------|
| Code change | 2 minutes |
| Testing | 10 minutes |
| Build verification | 5 minutes |
| Documentation | 10 minutes |
| **Total** | **~25 minutes** |

---

## Risk Assessment

### Low Risk ✅
- Single line change
- Electron API is stable
- No impact on business logic
- Easy to revert if needed

### Compatibility
- ✅ All Electron versions support `maximize()`
- ✅ All platforms (Win, Mac, Linux)
- ✅ No breaking changes
- ✅ Backward compatible

---

## Future Considerations

### Window State Persistence
Could save/restore window state:
```javascript
// src/main/services/WindowStateService.js
class WindowStateService {
  saveState(window) { /* ... */ }
  restoreState(window) { /* ... */ }
}
```

### Responsive Breakpoints
Monitor window resize for responsive adjustments:
```javascript
mainWindow.on('resize', () => {
  const [width, height] = mainWindow.getSize()
  mainWindow.webContents.send('window-resized', { width, height })
})
```

---

## Success Criteria

✅ Window opens maximized on startup
✅ No layout issues at maximum size
✅ All views functional
✅ Build succeeds
✅ No console errors
✅ Cross-platform compatibility verified

---

## Rollout Plan

### Phase 1: Development
- [ ] Implement change
- [ ] Test locally
- [ ] Verify responsive layout

### Phase 2: Testing
- [ ] Test on Windows
- [ ] Test on macOS
- [ ] Test on Linux
- [ ] Test with different screen resolutions

### Phase 3: Deployment
- [ ] Merge to main
- [ ] Update build artifacts
- [ ] Release in next version

---

## Related Issues/PRs

- None yet (new feature)

---

## Sign-Off

**Status**: 🟡 PLANNED (Ready for implementation)

**Estimated Effort**: 25 minutes  
**Complexity**: Trivial  
**Risk**: Low  
**Recommended Action**: Implement in next iteration

---

*Plan created: February 6, 2026*
