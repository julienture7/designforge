# AI SDK Version Compatibility Fix

## Current Status
We're using **AI SDK v4.2.0** which should NOT have the LanguageModelV1/V2 mismatch error.

## If You're Seeing the Error

### Option 1: Clear Cache (Most Likely Fix)
The error often comes from IDE/TypeScript cache issues, especially in Cursor:

1. **In Cursor/VS Code:**
   - Press `CMD+SHIFT+P` (Mac) or `CTRL+SHIFT+P` (Windows)
   - Type: `Developer: Reload Window`
   - Restart the IDE

2. **Clear Node Modules:**
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

3. **Restart TypeScript Server:**
   - `CMD+SHIFT+P` → `TypeScript: Restart TS Server`

### Option 2: Stay on v4.2.0 (Current - Recommended)
Our current setup is correct:
```json
{
  "ai": "^4.2.0",
  "@ai-sdk/deepseek": "^1.0.29",
  "@ai-sdk/openai": "^1.0.31"
}
```

All packages are v4-compatible. The error shouldn't occur.

### Option 3: Upgrade to v5 (If Needed)
If you want to upgrade to AI SDK v5, update ALL packages:

```json
{
  "ai": "^5.0.8",
  "@ai-sdk/deepseek": "^2.0.0",  // Check latest v5-compatible version
  "@ai-sdk/openai": "^2.0.5",
  "@ai-sdk/react": "^3.0.0"  // Update if needed
}
```

**Note:** In v5, `maxTokens` parameter might have changed. Check the v5 documentation.

## Verification
After fixing, verify all packages are the same version:
```bash
npm list ai @ai-sdk/deepseek @ai-sdk/openai
```

All should show v4.x.x or all v5.x.x - no mixing!
