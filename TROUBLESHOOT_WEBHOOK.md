# 🔧 Troubleshoot Webhook Issues

If upgrading to Pro didn't increase credits, the webhook likely didn't fire or failed. Here's how to fix it.

---

## 🔍 Step 1: Check Webhook in Stripe Dashboard

1. **Go to Stripe Dashboard** (make sure you're in **Test mode**)
   - Navigate to **Developers** → **Webhooks**

2. **Find Your Webhook**
   - Look for the webhook pointing to your app
   - Click on it to see details

3. **Check Recent Events**
   - Look at **"Recent events"** section
   - Find `checkout.session.completed` event
   - Click on it to see details

4. **Check Event Status**
   - ✅ **Succeeded (200)** = Webhook was received and processed
   - ❌ **Failed** = Webhook failed (check error message)
   - ⏳ **Pending** = Webhook is being retried

---

## 🐛 Common Issues & Fixes

### Issue 0: 307 Redirect Error (Most Common!)

**Symptoms:**
- Webhook shows **"307 ERR"** or **"Temporary Redirect"** in Stripe Dashboard
- Error message shows redirect from `forgerie.io` to `www.forgerie.io`
- Webhook never succeeds

**Cause:**
- Your webhook URL is set to `https://forgerie.io/api/webhooks/stripe`
- But Vercel redirects `forgerie.io` → `www.forgerie.io`
- Stripe webhooks don't follow redirects - they need a direct 200 response

**Fix:**
1. **Update Webhook URL in Stripe**
   - Go to Stripe Dashboard → **Developers** → **Webhooks**
   - Click on your webhook
   - Click **"Edit"** or the pencil icon
   - Change **Endpoint URL** from:
     - ❌ `https://forgerie.io/api/webhooks/stripe`
   - To:
     - ✅ `https://www.forgerie.io/api/webhooks/stripe`
   - Click **"Save"**

2. **Or Set Primary Domain in Vercel** (Alternative)
   - Go to Vercel Dashboard → **Settings** → **Domains**
   - Set `forgerie.io` as primary domain
   - This prevents redirect to www

3. **Test Again**
   - In Stripe Dashboard → Webhooks → Your webhook
   - Click **"Send test webhook"**
   - Should now succeed with 200 status

---

### Issue 1: Webhook Not Receiving Events

**Symptoms:**
- No events in "Recent events"
- Payment completed but user not upgraded

**Fix:**
1. **Verify Webhook URL**
   - Should be: `https://your-app.vercel.app/api/webhooks/stripe`
   - Or: `https://www.forgerie.io/api/webhooks/stripe` (use www if you have redirect)
   - Make sure it's exactly correct (no trailing slash)
   - **Important:** If you see 307 redirect errors, use the `www` version

2. **Check Webhook Secret**
   - In Stripe Dashboard → Webhooks → Your webhook
   - Click **"Reveal"** next to "Signing secret"
   - Copy it
   - Go to Vercel → Settings → Environment Variables
   - Update `STRIPE_WEBHOOK_SECRET` with the test webhook secret
   - Redeploy

3. **Test Webhook**
   - In Stripe Dashboard → Webhooks → Your webhook
   - Click **"Send test webhook"**
   - Select `checkout.session.completed`
   - Check if it succeeds

### Issue 2: 400 Invalid Signature Error

**Symptoms:**
- Webhook shows **"400 ERR"** with error: `{"error": "Invalid signature"}`
- Events are being sent but failing authentication

**Cause:**
- The webhook signing secret in Vercel doesn't match the one in Stripe
- This happens when you update the webhook URL or create a new webhook

**Fix:**
1. **Get the Correct Webhook Secret**
   - Go to Stripe Dashboard → **Developers** → **Webhooks**
   - Click on your webhook (the one with the correct URL)
   - Click **"Reveal"** next to "Signing secret"
   - Copy the secret (starts with `whsec_...`)

2. **Update in Vercel**
   - Go to Vercel Dashboard → **Settings** → **Environment Variables**
   - Find `STRIPE_WEBHOOK_SECRET`
   - **Update value** with the secret you just copied
   - Make sure it's set for **Production**, **Preview**, and **Development**
   - Click **"Save"**

3. **Redeploy**
   - Vercel will automatically redeploy
   - Or manually trigger: **Deployments** → **Redeploy**

4. **Resend Failed Events**
   - In Stripe Dashboard → Webhooks → Your webhook
   - Find failed events (especially `checkout.session.completed`)
   - Click **"Renvoyer"** (Resend) on each failed event
   - They should now succeed

**Important:** 
- Test mode webhook secret is different from Live mode secret
- Make sure you're using the correct one for your current mode

---

### Issue 3: Webhook Receiving Events But Failing (Other Errors)

**Symptoms:**
- Events show in Stripe Dashboard but status is "Failed"
- Error message in webhook logs (not "Invalid signature")

**Fix:**
1. **Check Webhook Logs**
   - In Stripe Dashboard → Webhooks → Your webhook
   - Click on a failed event
   - Read the error message

2. **Common Errors:**
   - **"Missing userId"** → Checkout session missing metadata
   - **"User not found"** → User ID doesn't exist in database
   - **"Database error"** → Check Vercel logs for details

3. **Check Vercel Logs**
   - Go to Vercel Dashboard → Your Project → **Functions**
   - Click on `/api/webhooks/stripe`
   - Check **"Logs"** tab for errors

### Issue 4: Webhook Succeeds But Credits Not Updated

**Symptoms:**
- Webhook shows "Succeeded (200)"
- User tier is PRO but credits are still 0

**Fix:**
1. **Check Database**
   - The webhook might have updated tier but failed to initialize credits
   - Check if `refinedCredits`, `enhancedCredits`, `ultimateCredits` are set

2. **Manually Initialize Credits** (see Step 2 below)

---

## 🛠️ Step 2: Manually Fix User (Quick Fix)

If the webhook failed, you can manually upgrade the user and set credits:

### Option A: Using Database Query (Recommended)

1. **Get Your User ID**
   - Log in to your app
   - Check browser console or network tab for user ID
   - Or check your database directly

2. **Run SQL Query** (in Neon Dashboard or database client):
```sql
UPDATE "User" 
SET 
  tier = 'PRO',
  subscriptionStatus = 'ACTIVE',
  refinedCredits = 100,
  enhancedCredits = 50,
  ultimateCredits = 25
WHERE email = 'your-email@example.com';
```

### Option B: Using Prisma Studio

1. **Open Prisma Studio**
   ```bash
   cd generative-ui-platform
   npx prisma studio
   ```

2. **Find Your User**
   - Navigate to `User` table
   - Find your user by email

3. **Update User**
   - Set `tier` to `PRO`
   - Set `subscriptionStatus` to `ACTIVE`
   - Set `refinedCredits` to `100`
   - Set `enhancedCredits` to `50`
   - Set `ultimateCredits` to `25`
   - Click **"Save 1 change"**

### Option C: Using Script

1. **Run the create-pro-user script:**
   ```bash
   cd generative-ui-platform
   npx tsx scripts/create-pro-user.ts
   ```
   - This will upgrade the most recent user to Pro

---

## 🔄 Step 3: Re-test Webhook

After fixing the issue, test again:

1. **Cancel Current Subscription** (if exists)
   - In Stripe Dashboard → Subscriptions
   - Cancel the test subscription

2. **Reset User to FREE** (optional)
   ```sql
   UPDATE "User" 
   SET tier = 'FREE', subscriptionStatus = NULL
   WHERE email = 'your-email@example.com';
   ```

3. **Try Upgrade Again**
   - Go to your app → Pricing
   - Click "Upgrade to Pro"
   - Complete checkout with test card

4. **Check Webhook**
   - Go to Stripe Dashboard → Webhooks
   - Check if `checkout.session.completed` event was received
   - Verify it succeeded

---

## 📋 Step 4: Verify Everything Works

After webhook processes successfully:

1. **Check User Tier**
   - Go to your app dashboard
   - You should see "Pro" tier

2. **Check Credits**
   - You should see:
     - Refined Credits: 100
     - Enhanced Credits: 50
     - Ultimate Credits: 25

3. **Test Pro Features**
   - Try "Export HTML" button
   - Try "View Raw HTML" button
   - Try "See Preview" button
   - All should work without upgrade prompts

---

## 🔍 Debugging Checklist

- [ ] Webhook URL is correct in Stripe Dashboard
- [ ] Webhook secret matches in Vercel environment variables
- [ ] Webhook is in **Test mode** (if testing with test cards)
- [ ] Events are being received in Stripe Dashboard
- [ ] Events are succeeding (status 200)
- [ ] Vercel function logs show no errors
- [ ] User tier is updated to PRO in database
- [ ] Credits are initialized (refinedCredits, enhancedCredits, ultimateCredits > 0)

---

## 🚨 Still Not Working?

If webhook still doesn't work:

1. **Check Vercel Function Logs**
   - Vercel Dashboard → Your Project → Functions → `/api/webhooks/stripe` → Logs
   - Look for error messages

2. **Check Stripe Webhook Logs**
   - Stripe Dashboard → Webhooks → Your webhook → Recent events
   - Click on failed events to see error details

3. **Verify Environment Variables**
   - Make sure `STRIPE_SECRET_KEY` is test key (`sk_test_...`)
   - Make sure `STRIPE_WEBHOOK_SECRET` is test webhook secret (`whsec_...`)
   - Make sure `DATABASE_URL` is correct

4. **Test Webhook Manually**
   - In Stripe Dashboard → Webhooks → Your webhook
   - Click **"Send test webhook"**
   - Select `checkout.session.completed`
   - This will help identify if the issue is with the webhook handler

---

## 💡 Pro Tip

For testing, you can temporarily add console.log statements to the webhook handler to see what's happening:

```typescript
// In src/app/api/webhooks/stripe/route.ts
console.log("Webhook received:", event.type);
console.log("Session data:", session);
console.log("User ID:", userId);
```

Then check Vercel function logs to see the output.
