# ⚡ Quick Deploy Checklist

## 🚀 Fastest Path to Production (15 minutes)

### 1. Push to GitHub (2 min)
```bash
cd generative-ui-platform
git init
git add .
git commit -m "Ready for deployment"
git remote add origin https://github.com/YOUR_USERNAME/designforge.git
git push -u origin main
```

### 2. Create Accounts (5 min)
- [ ] [Vercel](https://vercel.com) - Free account
- [ ] [Neon.tech](https://neon.tech) - Free PostgreSQL
- [ ] [Clerk.com](https://clerk.com) - Free auth
- [ ] [Upstash.com](https://upstash.com) - Free Redis
- [ ] [Stripe.com](https://stripe.com) - Payment processing

### 3. Get Your Keys (5 min)

**Database (Neon):**
1. Create project → Copy `DATABASE_URL`

**Clerk:**
1. Create app → Copy `Publishable Key` and `Secret Key`

**Stripe:**
1. Dashboard → API Keys → Copy `Secret Key`
2. Products → Create product → Copy `Price ID`
3. Webhooks → Add endpoint → Copy `Signing Secret`

**Upstash:**
1. Create database → Copy `REST URL` and `REST Token`

**You Already Have:**
- ✅ Gemini API Key: `AIzaSyDrdaRRVQWiAMB_30UsmeVCA8172wnNPxg`
- ✅ Unsplash Access Key: `9IGdFg3pu5uUFApoGKJ-x9EGe3M28izb3ARSIFKsMz4`

### 4. Deploy to Vercel (3 min)

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your GitHub repo
3. **Add Environment Variables:**

```
DATABASE_URL=postgresql://...
GEMINI_API_KEY=AIzaSyDrdaRRVQWiAMB_30UsmeVCA8172wnNPxg
UNSPLASH_ACCESS_KEY=9IGdFg3pu5uUFApoGKJ-x9EGe3M28izb3ARSIFKsMz4
CLERK_SECRET_KEY=sk_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PRICE_ID=price_...
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
NODE_ENV=production
```

4. Click **Deploy**

### 5. Run Database Setup (1 min)

After deployment, in Vercel Dashboard:
- Go to **Deployments** → Click on latest deployment
- Open **Functions** tab → Find any API route
- Or use Vercel CLI:
```bash
vercel env pull .env.local
npx prisma migrate deploy
```

### 6. Configure Webhooks

**Stripe Webhook:**
- URL: `https://your-app.vercel.app/api/webhooks/stripe`
- Events: `customer.subscription.*`

**Clerk:**
- Add production URL to allowed origins

### ✅ Done! Your app is live at: `https://your-app.vercel.app`

---

## 🐛 Common Issues & Quick Fixes

**Build fails?**
- Check all env vars are set
- Look at build logs in Vercel

**Database error?**
- Run: `npx prisma migrate deploy`
- Check `DATABASE_URL` format

**Auth not working?**
- Verify Clerk keys are correct
- Check allowed origins in Clerk dashboard

**Payments not working?**
- Use Stripe test mode first
- Verify webhook URL is correct
- Check webhook secret matches

---

## 📝 Environment Variables Reference

Copy-paste this list when setting up Vercel:

```
✅ DATABASE_URL
✅ GEMINI_API_KEY
✅ UNSPLASH_ACCESS_KEY
✅ CLERK_SECRET_KEY
✅ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
✅ STRIPE_SECRET_KEY
✅ STRIPE_WEBHOOK_SECRET
✅ NEXT_PUBLIC_STRIPE_PRICE_ID
✅ UPSTASH_REDIS_REST_URL
✅ UPSTASH_REDIS_REST_TOKEN
✅ NODE_ENV=production
```

Optional:
```
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
CRON_SECRET=random_string_here
SENTRY_DSN=...
```

---

## 🎯 What Happens After Deployment?

1. Vercel builds your app automatically
2. Database tables are created (after migration)
3. Users can sign up via Clerk
4. Designs can be generated
5. Payments work via Stripe
6. Everything is cached via Redis

**You're ready to share with the world! 🌍**
