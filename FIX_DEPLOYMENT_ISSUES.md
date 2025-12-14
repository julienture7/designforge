# 🔧 Fix Deployment Issues

## Issue 1: Database Tables Don't Exist ❌

**Error:** `The table public.User does not exist in the current database`

**Solution:** Run database migrations

### Option A: Via Vercel CLI (Recommended)

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

### Option B: Via Vercel Dashboard

1. Go to your Vercel project → **Settings** → **Deploy Hooks**
2. Create a new hook:
   - Name: `Run Migrations`
   - Command: `npx prisma migrate deploy`
3. Trigger the hook manually

---

## Issue 2: Clerk Using Development Keys ⚠️

**Error:** `Clerk has been loaded with development keys`

**Solution:** Update Clerk keys in Vercel

1. Go to [Clerk Dashboard](https://dashboard.clerk.com)
2. Make sure you're in **Production** mode (not Development)
3. Go to **API Keys**
4. Copy the **Production** keys:
   - **Publishable Key** (starts with `pk_live_`)
   - **Secret Key** (starts with `sk_live_`)
5. Go to Vercel → **Settings** → **Environment Variables**
6. Update:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` = `[Production Publishable Key]`
   - `CLERK_SECRET_KEY` = `[Production Secret Key]`
7. **Redeploy** your app (Vercel will auto-redeploy when you update env vars)

---

## Issue 3: Deprecated redirectUrl Warning

This is just a warning, not an error. The code already uses `fallbackRedirectUrl` which is correct. You can ignore this warning, or we can update the code to remove any remaining `redirectUrl` props.

---

## ✅ After Fixing

1. **Run migrations** (Issue 1) - This creates all database tables
2. **Update Clerk keys** (Issue 2) - This enables production authentication
3. **Test again** - Sign up/login should work now

---

## Quick Checklist

- [ ] Run `npx prisma migrate deploy` (creates database tables)
- [ ] Update Clerk keys to production keys in Vercel
- [ ] Redeploy app
- [ ] Test sign up/login flow
- [ ] Verify dashboard loads after login
