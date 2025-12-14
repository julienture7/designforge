# 🚀 Complete Deployment Guide for DesignForge

This guide will help you deploy your DesignForge application to production so it's accessible to everyone.

## 📋 Prerequisites

Before deploying, make sure you have:
- [ ] A GitHub account
- [ ] A Vercel account (free tier works)
- [ ] API keys ready (Gemini, Unsplash, Clerk, Stripe, Upstash)

---

## 🎯 Step-by-Step Deployment

### Step 1: Prepare Your Code

1. **Commit and push to GitHub:**
   ```bash
   cd "generative-ui-platform"
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/designforge.git
   git push -u origin main
   ```

### Step 2: Set Up Database (PostgreSQL)

Choose one option:

#### Option A: Vercel Postgres (Easiest - Recommended)
1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Create a new project or go to your project
3. Go to **Storage** → **Create Database** → **Postgres**
4. Copy the `DATABASE_URL` connection string

#### Option B: Neon (Free PostgreSQL)
1. Go to [Neon.tech](https://neon.tech)
2. Sign up and create a new project
3. Copy the connection string from the dashboard

#### Option C: Supabase (Free PostgreSQL)
1. Go to [Supabase.com](https://supabase.com)
2. Create a new project
3. Go to **Settings** → **Database** → Copy connection string

**After setting up database:**
```bash
# Run migrations to create tables
npx prisma migrate deploy
# Or if using db push
npx prisma db push
```

### Step 3: Set Up Clerk Authentication

1. Go to [Clerk.com](https://clerk.com) and sign up
2. Create a new application
3. Go to **API Keys** and copy:
   - **Publishable Key** → `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - **Secret Key** → `CLERK_SECRET_KEY`
4. Configure **Allowed Origins** in Clerk dashboard:
   - Add your production URL (e.g., `https://your-app.vercel.app`)

### Step 4: Set Up Stripe (for Payments)

1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Get your **Secret Key** → `STRIPE_SECRET_KEY`
3. Create a product and price in Stripe Dashboard
4. Copy the **Price ID** → `NEXT_PUBLIC_STRIPE_PRICE_ID`
5. Set up webhook:
   - Go to **Developers** → **Webhooks** → **Add endpoint**
   - URL: `https://your-app.vercel.app/api/webhooks/stripe`
   - Events to listen: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
   - Copy **Signing Secret** → `STRIPE_WEBHOOK_SECRET`

### Step 5: Set Up Upstash Redis

1. Go to [Upstash.com](https://upstash.com) and sign up
2. Create a new Redis database
3. Copy:
   - **REST URL** → `UPSTASH_REDIS_REST_URL`
   - **REST Token** → `UPSTASH_REDIS_REST_TOKEN`

### Step 6: Deploy to Vercel

#### Method 1: Deploy via Vercel Dashboard (Recommended)

1. Go to [Vercel.com](https://vercel.com) and sign in
2. Click **Add New Project**
3. Import your GitHub repository
4. Configure project:
   - **Framework Preset:** Next.js
   - **Root Directory:** `generative-ui-platform`
   - **Build Command:** `npm run build` (or `npm run build`)
   - **Output Directory:** `.next` (auto-detected)
   - **Install Command:** `npm install`

5. **Add Environment Variables** (Click "Environment Variables"):
   
   **Required Server Variables:**
   ```
   DATABASE_URL=your_postgres_connection_string
   GEMINI_API_KEY=AIzaSyDrdaRRVQWiAMB_30UsmeVCA8172wnNPxg
   UNSPLASH_ACCESS_KEY=9IGdFg3pu5uUFApoGKJ-x9EGe3M28izb3ARSIFKsMz4
   CLERK_SECRET_KEY=your_clerk_secret_key
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
   STRIPE_SECRET_KEY=your_stripe_secret_key
   STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret
   NEXT_PUBLIC_STRIPE_PRICE_ID=your_stripe_price_id
   UPSTASH_REDIS_REST_URL=your_upstash_redis_url
   UPSTASH_REDIS_REST_TOKEN=your_upstash_redis_token
   NODE_ENV=production
   ```

   **Optional Variables:**
   ```
   NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
   SENTRY_DSN=your_sentry_dsn (optional)
   CRON_SECRET=generate_random_string (for cron security)
   DEEPSEEK_API_KEY=your_deepseek_key (optional)
   ```

6. Click **Deploy**

#### Method 2: Deploy via Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
cd generative-ui-platform
vercel

# Follow prompts, then set environment variables:
vercel env add DATABASE_URL
vercel env add GEMINI_API_KEY
vercel env add UNSPLASH_ACCESS_KEY
# ... add all other variables

# Deploy to production
vercel --prod
```

### Step 7: Run Database Migrations

After first deployment, run migrations:

```bash
# Option 1: Via Vercel CLI
vercel env pull .env.local
npx prisma migrate deploy

# Option 2: Via Vercel Dashboard
# Go to your project → Settings → Deploy Hooks
# Create a deploy hook that runs: npx prisma migrate deploy
```

Or add to `package.json`:
```json
"scripts": {
  "postdeploy": "prisma migrate deploy"
}
```

### Step 8: Configure Custom Domain (Optional)

1. In Vercel Dashboard → **Settings** → **Domains**
2. Add your domain
3. Follow DNS configuration instructions
4. Update `NEXT_PUBLIC_APP_URL` to your custom domain

### Step 9: Verify Everything Works

1. ✅ Visit your deployed URL
2. ✅ Test user sign-up/sign-in
3. ✅ Test creating a project
4. ✅ Test generating a design
5. ✅ Test Stripe payment flow (use test mode first)
6. ✅ Check database connection
7. ✅ Verify Redis is working

---

## 🔧 Troubleshooting

### Database Connection Issues
- Check `DATABASE_URL` format: `postgresql://user:password@host:port/database?sslmode=require`
- Ensure database allows connections from Vercel IPs
- Run `npx prisma migrate deploy` after deployment

### Environment Variables Not Working
- Make sure variables are set in Vercel Dashboard
- Redeploy after adding new variables
- Check variable names match exactly (case-sensitive)

### Build Failures
- Check build logs in Vercel Dashboard
- Ensure all dependencies are in `package.json`
- Verify TypeScript errors are fixed

### API Errors
- Check API keys are correct
- Verify rate limits aren't exceeded
- Check CORS settings in Clerk/Stripe

---

## 📊 Post-Deployment Checklist

- [ ] Database migrations run successfully
- [ ] Environment variables are set
- [ ] Clerk authentication works
- [ ] Stripe webhook is configured
- [ ] Redis connection works
- [ ] API keys are valid
- [ ] Custom domain configured (if using)
- [ ] SSL certificate is active
- [ ] Error tracking (Sentry) is set up
- [ ] Analytics is configured (optional)

---

## 🎉 You're Live!

Your app should now be accessible at `https://your-app.vercel.app`

**Next Steps:**
- Monitor usage in Vercel Dashboard
- Set up error tracking (Sentry)
- Configure analytics
- Set up monitoring alerts
- Review Stripe webhook logs
- Monitor database performance

---

## 💰 Cost Estimates (Free Tier)

- **Vercel:** Free (Hobby plan) - 100GB bandwidth/month
- **Clerk:** Free (up to 10,000 MAU)
- **Stripe:** 2.9% + $0.30 per transaction
- **Upstash Redis:** Free (10K commands/day)
- **Neon/Supabase:** Free tier available
- **Gemini API:** Pay-as-you-go
- **Unsplash API:** Free (50 requests/hour)

---

## 🔐 Security Reminders

1. ✅ Never commit `.env` files to Git
2. ✅ Use production API keys (not development keys)
3. ✅ Enable 2FA on all service accounts
4. ✅ Regularly rotate API keys
5. ✅ Monitor for unusual activity
6. ✅ Set up rate limiting
7. ✅ Use HTTPS only (Vercel does this automatically)

---

## 📞 Need Help?

- Vercel Docs: https://vercel.com/docs
- Clerk Docs: https://clerk.com/docs
- Stripe Docs: https://stripe.com/docs
- Prisma Docs: https://www.prisma.io/docs
