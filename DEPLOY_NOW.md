# 🚀 DEPLOY NOW - Complete Setup Guide

You have all your credentials! Follow these steps to deploy your app.

---

## ⚠️ STEP 1: Set Up Clerk (5 minutes) - REQUIRED

You need Clerk for authentication. Here's how:

1. **Go to [clerk.com](https://clerk.com)** and sign up/login
2. **Click "Create Application"**
3. **Choose authentication methods:**
   - Email (required)
   - Google (optional but recommended)
   - Any others you want
4. **After creation, go to "API Keys"** in the sidebar
5. **Copy these TWO keys:**
   - **Publishable Key** (starts with `pk_`) → Save this for `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - **Secret Key** (starts with `sk_`) → Save this for `CLERK_SECRET_KEY`

**⚠️ Don't proceed until you have both Clerk keys!**

---

## 🚀 STEP 2: Deploy to Vercel (10 minutes)

### 2.1 Create Vercel Account

1. Go to [vercel.com](https://vercel.com)
2. Sign up with GitHub (connect your GitHub account)

### 2.2 Import Your Repository

1. Click **"Add New Project"** or **"Import Project"**
2. Find and select: **`julienture7/designforge`**
3. Click **"Import"**

### 2.3 Configure Project Settings

**⚠️ CRITICAL:** Set the **Root Directory**!

1. In project settings, find **"Root Directory"**
2. Click **"Edit"**
3. Select: **`generative-ui-platform`**
4. Click **"Save"**

**Other settings (auto-detected, just verify):**
- Framework Preset: **Next.js** ✅
- Build Command: `npm run build` ✅
- Output Directory: `.next` ✅
- Install Command: `npm install` ✅

### 2.4 Add Environment Variables

Click **"Environment Variables"** and add these **ONE BY ONE**:

#### Copy-Paste These Exactly:

**1. DATABASE_URL**
```
postgresql://neondb_owner:npg_XbK97IuHigdz@ep-holy-tooth-ahpmaha5-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
```

**2. GEMINI_API_KEY**
```
AIzaSyDrdaRRVQWiAMB_30UsmeVCA8172wnNPxg
```

**3. UNSPLASH_ACCESS_KEY**
```
9IGdFg3pu5uUFApoGKJ-x9EGe3M28izb3ARSIFKsMz4
```

**4. CLERK_SECRET_KEY**
```
[Paste your Clerk Secret Key from Step 1]
```

**5. NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY**
```
[Paste your Clerk Publishable Key from Step 1]
```

**6. STRIPE_SECRET_KEY**
```
[Your Stripe Secret Key - starts with sk_live_]
```

**7. STRIPE_WEBHOOK_SECRET**
```
[Leave empty for now - you'll add this after deployment in Step 3]
```

**8. NEXT_PUBLIC_STRIPE_PRICE_ID**
```
price_1SeDBcDRdMRNX7cKZdvCWWk9
```

**9. UPSTASH_REDIS_REST_URL**
```
https://subtle-shad-10587.upstash.io
```

**10. UPSTASH_REDIS_REST_TOKEN**
```
ASlbAAIncDE4ZTk3YjlmY2M4ODU0NjA3OTViZTM0MWVkMGM1Y2RhMXAxMTA1ODc
```

**11. NODE_ENV**
```
production
```

**12. NEXT_PUBLIC_APP_URL** (Optional - add after first deploy)
```
https://your-app.vercel.app
```
(Replace `your-app` with your actual Vercel project name)

### 2.5 Deploy!

1. Click **"Deploy"** button
2. Wait 2-5 minutes for build
3. **Note your deployment URL** (e.g., `https://designforge-abc123.vercel.app`)

---

## 🔧 STEP 3: Post-Deployment Setup

### 3.1 Run Database Migrations

After deployment, create database tables:

**Option A: Via Vercel CLI (Easiest)**

```powershell
# Install Vercel CLI (if not installed)
npm i -g vercel

# Login to Vercel
vercel login

# Navigate to your project
cd "C:\Users\kiro9\Downloads\Website builder with google API and unsplash API\Website builder with google API and unsplash API\generative-ui-platform"

# Pull environment variables
vercel env pull .env.local

# Run migrations
npx prisma migrate deploy
```

**Option B: Via Vercel Dashboard**

1. Go to your project → **Settings** → **Deploy Hooks**
2. Create a new hook:
   - Name: `Run Migrations`
   - Command: `npx prisma migrate deploy`
3. Trigger the hook manually

### 3.2 Set Up Stripe Webhook

1. **Go to [Stripe Dashboard](https://dashboard.stripe.com)**
2. **Developers** → **Webhooks** → **Add endpoint**
3. **Endpoint URL:** `https://YOUR-VERCEL-URL.vercel.app/api/webhooks/stripe`
   - Replace `YOUR-VERCEL-URL` with your actual Vercel URL from Step 2.5
4. **Description:** `DesignForge subscription management webhook`
5. **Events to send:**
   - ✅ `checkout.session.completed`
   - ✅ `customer.subscription.updated`
   - ✅ `customer.subscription.deleted`
6. Click **"Add endpoint"**
7. **Copy the Signing Secret** (starts with `whsec_`)
8. **Go back to Vercel:**
   - Project → **Settings** → **Environment Variables**
   - Find `STRIPE_WEBHOOK_SECRET`
   - Update it with the signing secret you just copied
   - Save (Vercel will auto-redeploy)

### 3.3 Update Clerk Allowed Origins

1. **Go to [Clerk Dashboard](https://dashboard.clerk.com)**
2. Your Application → **Settings** → **Allowed Origins**
3. **Add:**
   - `https://YOUR-VERCEL-URL.vercel.app` (your production URL)
   - `http://localhost:3000` (for local development)
4. **Save**

---

## ✅ STEP 4: Verify Everything Works

Test these in order:

1. **Homepage:** Visit your Vercel URL - should load
2. **Sign Up:** Click "Sign Up" - Clerk modal should appear
3. **Create Account:** Sign up with email
4. **Dashboard:** Should redirect to dashboard after signup
5. **Create Project:** Click "New Design" - should work
6. **Generate:** Try generating a design - should work
7. **Payments:** Test Stripe checkout (use test card: `4242 4242 4242 4242`)

---

## 🎉 Success!

Your app is now live and accessible to everyone!

**Your Production URL:** `https://YOUR-VERCEL-URL.vercel.app`

---

## 📋 Quick Reference

### Your Credentials Summary:

✅ **Database (Neon):**
- Connection String: `postgresql://neondb_owner:npg_XbK97IuHigdz@ep-holy-tooth-ahpmaha5-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require`

✅ **Redis (Upstash):**
- URL: `https://subtle-shad-10587.upstash.io`
- Token: `ASlbAAIncDE4ZTk3YjlmY2M4ODU0NjA3OTViZTM0MWVkMGM1Y2RhMXAxMTA1ODc`

✅ **Stripe:**
- Secret Key: `[Your Stripe Secret Key - starts with sk_live_]`
- Publishable Key: `[Your Stripe Publishable Key - starts with pk_live_]`
- Price ID: `price_1SeDBcDRdMRNX7cKZdvCWWk9`
- Product ID: `prod_TbQ1hoPXznX0Yf`

✅ **Gemini API:** `AIzaSyDrdaRRVQWiAMB_30UsmeVCA8172wnNPxg`

✅ **Unsplash API:** `9IGdFg3pu5uUFApoGKJ-x9EGe3M28izb3ARSIFKsMz4`

⏳ **Clerk:** Need to set up (see Step 1)

---

## 🐛 Troubleshooting

**Build fails?**
- Check all environment variables are set correctly
- Verify Root Directory is `generative-ui-platform`
- Check build logs in Vercel

**Database error?**
- Run: `npx prisma migrate deploy` (see Step 3.1)
- Check DATABASE_URL format is correct

**Auth not working?**
- Verify Clerk keys are correct
- Check Clerk allowed origins includes your Vercel URL

**Payments not working?**
- Verify Stripe webhook is set up (Step 3.2)
- Check webhook secret matches in Vercel
- Test with Stripe test mode first

---

## 🔐 Security Reminder

⚠️ **You're using PRODUCTION Stripe keys!**
- Real payments will be processed
- Test with Stripe test cards first: `4242 4242 4242 4242`
- Monitor your Stripe dashboard
- Set up webhook properly (Step 3.2)

---

## 📞 Need Help?

- Vercel Docs: https://vercel.com/docs
- Clerk Docs: https://clerk.com/docs
- Stripe Docs: https://stripe.com/docs
- Neon Docs: https://neon.tech/docs
