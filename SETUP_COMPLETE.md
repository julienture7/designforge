# 🎯 Complete Setup Instructions for DesignForge

You have all your credentials! Here's everything you need to do to deploy your app.

## ✅ What You Already Have

- ✅ **Neon Database** - Connection string ready
- ✅ **Upstash Redis** - URL and token ready
- ✅ **Stripe** - Production keys, product ID, and price ID ready
- ✅ **GitHub Repository** - Code is pushed to https://github.com/julienture7/designforge
- ✅ **Gemini API Key** - Already configured
- ✅ **Unsplash API Key** - Already configured

## ⚠️ What You Still Need

You need to set up **Clerk** for authentication. Here's how:

### Step 1: Set Up Clerk (5 minutes)

1. Go to [clerk.com](https://clerk.com) and sign up/login
2. Click **"Create Application"**
3. Choose authentication methods (Email, Google, etc.)
4. After creation, go to **API Keys** in the sidebar
5. Copy these two keys:
   - **Publishable Key** (starts with `pk_`) → `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - **Secret Key** (starts with `sk_`) → `CLERK_SECRET_KEY`
6. In Clerk Dashboard → **Settings** → **Allowed Origins**, add:
   - `http://localhost:3000` (for local dev)
   - `https://your-app.vercel.app` (after deployment - replace with your actual Vercel URL)

---

## 🚀 Deploy to Vercel (10 minutes)

### Step 1: Create Vercel Account

1. Go to [vercel.com](https://vercel.com) and sign up (use GitHub to connect)

### Step 2: Import Your Repository

1. Click **"Add New Project"**
2. Import `julienture7/designforge`
3. Configure:
   - **Framework Preset:** Next.js (auto-detected)
   - **Root Directory:** `generative-ui-platform` ⚠️ **IMPORTANT!**
   - **Build Command:** `npm run build` (auto-detected)
   - **Output Directory:** `.next` (auto-detected)
   - **Install Command:** `npm install` (auto-detected)

### Step 3: Add ALL Environment Variables

Click **"Environment Variables"** and add these **ONE BY ONE**:

#### Required Variables (Copy-paste these):

```
DATABASE_URL
postgresql://neondb_owner:npg_XbK97IuHigdz@ep-holy-tooth-ahpmaha5-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
```

```
GEMINI_API_KEY
AIzaSyDrdaRRVQWiAMB_30UsmeVCA8172wnNPxg
```

```
UNSPLASH_ACCESS_KEY
9IGdFg3pu5uUFApoGKJ-x9EGe3M28izb3ARSIFKsMz4
```

```
CLERK_SECRET_KEY
[Your Clerk Secret Key from Step 1 above]
```

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
[Your Clerk Publishable Key from Step 1 above]
```

```
STRIPE_SECRET_KEY
[Your Stripe Secret Key - starts with sk_live_]
```

```
STRIPE_WEBHOOK_SECRET
[You'll get this after setting up the webhook - see Step 4 below]
```

```
NEXT_PUBLIC_STRIPE_PRICE_ID
price_1SeDBcDRdMRNX7cKZdvCWWk9
```

```
UPSTASH_REDIS_REST_URL
https://subtle-shad-10587.upstash.io
```

```
UPSTASH_REDIS_REST_TOKEN
ASlbAAIncDE4ZTk3YjlmY2M4ODU0NjA3OTViZTM0MWVkMGM1Y2RhMXAxMTA1ODc
```

```
NODE_ENV
production
```

#### Optional Variables:

```
NEXT_PUBLIC_APP_URL
https://your-app.vercel.app
```
(Replace `your-app` with your actual Vercel project name - you'll know after first deploy)

### Step 4: Deploy!

1. Click **"Deploy"** button
2. Wait for build to complete (2-5 minutes)
3. Your app will be live at: `https://your-project-name.vercel.app`

---

## 🔧 Post-Deployment Setup

### Step 1: Run Database Migrations

After first deployment, you need to create the database tables:

**Option A: Via Vercel CLI (Recommended)**
```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Pull environment variables
cd "C:\Users\kiro9\Downloads\Website builder with google API and unsplash API\Website builder with google API and unsplash API\generative-ui-platform"
vercel env pull .env.local

# Run migrations
npx prisma migrate deploy
```

**Option B: Via Vercel Dashboard**
1. Go to your project → **Settings** → **Deploy Hooks**
2. Create a new hook that runs: `npx prisma migrate deploy`
3. Or manually trigger via Vercel CLI (Option A is easier)

### Step 2: Set Up Stripe Webhook

1. Go to [Stripe Dashboard](https://dashboard.stripe.com) → **Developers** → **Webhooks**
2. Click **"Add endpoint"**
3. **Endpoint URL:** `https://your-app.vercel.app/api/webhooks/stripe`
   (Replace `your-app` with your actual Vercel URL)
4. **Description:** `DesignForge subscription management webhook`
5. **Events to send:**
   - Select `checkout.session.completed`
   - Select `customer.subscription.updated`
   - Select `customer.subscription.deleted`
6. Click **"Add endpoint"**
7. Copy the **Signing Secret** (starts with `whsec_`)
8. Go back to Vercel → **Settings** → **Environment Variables**
9. Add/Update: `STRIPE_WEBHOOK_SECRET` = `[the signing secret you just copied]`
10. **Redeploy** your app (Vercel will auto-redeploy when you update env vars, or click "Redeploy")

### Step 3: Update Clerk Allowed Origins

1. Go to [Clerk Dashboard](https://dashboard.clerk.com)
2. Your Application → **Settings** → **Allowed Origins**
3. Add your production URL: `https://your-app.vercel.app`
4. Save

---

## ✅ Verification Checklist

After deployment, test these:

- [ ] Visit your deployed URL - homepage loads
- [ ] Click "Sign Up" - Clerk authentication works
- [ ] Sign in and go to Dashboard - projects list loads
- [ ] Create a new project - generation works
- [ ] Test Stripe payment flow (use test card: `4242 4242 4242 4242`)
- [ ] Check database - tables exist (via Prisma Studio or Neon dashboard)
- [ ] Check Redis - connection works (via Upstash dashboard)

---

## 🎉 You're Live!

Your app is now accessible to everyone at: `https://your-app.vercel.app`

**Next Steps:**
- Share your app URL
- Monitor usage in Vercel Dashboard
- Check Stripe webhook logs to ensure payments work
- Monitor database performance in Neon dashboard

---

## 🔐 Security Notes

⚠️ **IMPORTANT:** You're using **PRODUCTION** Stripe keys. This means:
- Real payments will be processed
- Make sure you test with Stripe test mode first, or use test cards
- Monitor your Stripe dashboard for transactions
- Set up proper error tracking (Sentry) for production

---

## 📞 Quick Reference

**Your Credentials Summary:**
- Database: Neon (connection string provided)
- Redis: Upstash (URL and token provided)
- Stripe: Production keys (provided)
- Clerk: Need to set up (see Step 1 above)
- Gemini: Already configured
- Unsplash: Already configured

**Your URLs:**
- GitHub: https://github.com/julienture7/designforge
- Vercel: https://vercel.com (after deployment)
- Stripe Dashboard: https://dashboard.stripe.com
- Clerk Dashboard: https://dashboard.clerk.com (after setup)
- Neon Dashboard: https://console.neon.tech
- Upstash Dashboard: https://console.upstash.com
