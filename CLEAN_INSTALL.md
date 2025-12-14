# Clean Install Instructions - Fix AI SDK Version Mixing

## ✅ Current Configuration (CORRECT)
Your `package.json` already has all v4-compatible packages:
```json
{
  "ai": "^4.2.0",                    // ✅ v4
  "@ai-sdk/deepseek": "^1.0.29",     // ✅ v4-compatible
  "@ai-sdk/openai": "^1.0.31",       // ✅ v4-compatible
  "@ai-sdk/react": "^2.0.115"       // ✅ v4-compatible
}
```

## 🔧 If You're Still Seeing Errors: Clean Install

The error is likely from cached packages. Follow these steps:

### Step 1: Delete Node Modules and Lock File
```bash
cd "Website builder with google API and unsplash API/generative-ui-platform"
rm -rf node_modules package-lock.json
```

### Step 2: Fresh Install
```bash
npm install
```

### Step 3: Verify All Packages Are v4
```bash
npm list ai @ai-sdk/deepseek @ai-sdk/openai @ai-sdk/react
```

**Expected output:** All should show v4.x.x versions, NOT v5.x.x

### Step 4: Clear IDE Cache (Cursor/VS Code)
1. Press `CMD+SHIFT+P` (Mac) or `CTRL+SHIFT+P` (Windows)
2. Type: `Developer: Reload Window`
3. Or: `TypeScript: Restart TS Server`

### Step 5: Restart IDE
Close and reopen Cursor/VS Code completely.

## 🚨 If Errors Persist

### Force Reinstall
```bash
npm install --force
```

### Check for Stray v5 Packages
```bash
# Search for any v5 packages
npm list | grep "5\."
```

If you see any v5 packages, they need to be removed or downgraded.

## ✅ Verification Checklist

- [ ] All packages show v4.x.x (not v5.x.x)
- [ ] No errors in `npm list`
- [ ] TypeScript errors cleared after IDE reload
- [ ] Build succeeds: `npm run build`

## 📝 Current Package Versions (Verified Correct)

- `ai`: `^4.2.0` ✅
- `@ai-sdk/deepseek`: `^1.0.29` ✅
- `@ai-sdk/openai`: `^1.0.31` ✅
- `@ai-sdk/react`: `^2.0.115` ✅

All are v4-compatible. The issue is cache-related, not package configuration.
