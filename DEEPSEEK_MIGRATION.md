# DeepSeek API Migration Guide

This document explains the changes made to migrate from Google Gemini API to DeepSeek API.

## Changes Made

### 1. Package Dependencies
- **Removed**: `@ai-sdk/google`
- **Added**: `@ai-sdk/openai`

### 2. Environment Variables
- **Removed**: `GEMINI_API_KEY` and `GOOGLE_GENERATIVE_AI_API_KEY`
- **Added**: `DEEPSEEK_API_KEY`

### 3. API Configuration
- **Base URL**: `https://api.deepseek.com/beta` (DeepSeek Beta endpoint)
- **Model**: `deepseek-chat`
- **Max Tokens**: `8000` (DeepSeek Beta supports up to 8K tokens, increased from standard 4K)

### 4. Updated Files
- `src/app/api/generate/route.ts` - Main generation endpoint
- `src/app/api/edit/route.ts` - Edit endpoint
- `src/env.js` - Environment variable schema
- `package.json` - Dependencies

## Vercel Deployment Setup

### Required Environment Variable

Add the following environment variable in your Vercel project settings:

**Variable Name**: `DEEPSEEK_API_KEY`  
**Value**: `sk-cd34b8bcf1fd4e16a7aaddc65a9a23f7`

### Steps to Add Environment Variable in Vercel

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Click **Add New**
4. Enter:
   - **Name**: `DEEPSEEK_API_KEY`
   - **Value**: `sk-cd34b8bcf1fd4e16a7aaddc65a9a23f7`
   - **Environment**: Select all (Production, Preview, Development)
5. Click **Save**
6. Redeploy your application for the changes to take effect

### Using Vercel CLI

Alternatively, you can add the environment variable using the Vercel CLI:

```bash
vercel env add DEEPSEEK_API_KEY
```

When prompted, enter: `sk-cd34b8bcf1fd4e16a7aaddc65a9a23f7`

Then select all environments (Production, Preview, Development).

### Verify Environment Variable

After adding the environment variable, verify it's set correctly:

```bash
vercel env ls
```

You should see `DEEPSEEK_API_KEY` in the list.

## Local Development Setup

For local development, add the following to your `.env.local` file:

```env
DEEPSEEK_API_KEY=sk-cd34b8bcf1fd4e16a7aaddc65a9a23f7
```

## API Configuration Details

The DeepSeek integration uses:
- **Endpoint**: `https://api.deepseek.com/beta` (Beta endpoint for 8K token support)
- **Model**: `deepseek-chat`
- **Max Tokens**: `8000` (Beta limit)
- **Temperature**: `1.0` for generation, `0.2` for edits

## Migration Notes

- Removed Gemini-specific features (thinkingConfig, thinkingLevel)
- All generation and refinement processes now use DeepSeek
- The existing DeepSeek service (`src/server/services/deepseek.service.ts`) remains unchanged and continues to use the standard DeepSeek endpoint for polish operations

## Testing

After deployment, test the following:
1. Generate a new website from a prompt
2. Edit an existing website
3. Verify refinement passes work correctly
4. Check that all API calls are using DeepSeek

## Troubleshooting

If you encounter issues:

1. **Verify the API key is set correctly** in Vercel environment variables
2. **Check the API key format** - it should start with `sk-`
3. **Ensure you're using the beta endpoint** - `https://api.deepseek.com/beta`
4. **Check Vercel logs** for any API errors
5. **Verify the package is installed** - run `npm install` to ensure `@ai-sdk/openai` is installed
