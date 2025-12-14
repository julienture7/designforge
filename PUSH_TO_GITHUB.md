# 🚀 Push to GitHub - Quick Instructions

## Step 1: Create Repository on GitHub

1. Go to https://github.com/new
2. Repository name: `designforge` (or any name you prefer)
3. Description: "AI-powered website builder with Google Gemini and Unsplash"
4. Choose: **Public** or **Private**
5. **DO NOT** initialize with README, .gitignore, or license (we already have these)
6. Click **Create repository**

## Step 2: Push Your Code

After creating the repo, run these commands in your terminal:

```bash
cd "c:\Users\kiro9\Downloads\Website builder with google API and unsplash API\generative-ui-platform"

# Add remote (replace YOUR_REPO_NAME with your actual repo name)
git remote add origin https://github.com/julienture7/YOUR_REPO_NAME.git

# Push to GitHub
git branch -M main
git push -u origin main
```

**Or if you prefer SSH:**
```bash
git remote add origin git@github.com:julienture7/YOUR_REPO_NAME.git
git branch -M main
git push -u origin main
```

## ✅ Done!

Your code is now on GitHub and ready to deploy to Vercel!
