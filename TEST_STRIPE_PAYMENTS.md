# 🧪 Test Stripe Payments (No Real Money)

Complete guide to test your payment flow using Stripe's test mode with fake credit cards.

---

## 📋 Step 1: Get Stripe Test API Keys (5 minutes)

1. **Go to [Stripe Dashboard](https://dashboard.stripe.com)**
   - Log in to your Stripe account

2. **Switch to Test Mode**
   - Look for the toggle in the top right that says **"Test mode"** or **"Live mode"**
   - Click it to switch to **"Test mode"** (it should show a banner saying "Test mode")

3. **Get Your Test Keys**
   - Go to **Developers** → **API keys** (in the left sidebar)
   - You'll see two keys:
     - **Publishable key** (starts with `pk_test_...`)
     - **Secret key** (starts with `sk_test_...`) - Click "Reveal test key" to see it

4. **Copy Both Keys**
   - Keep these keys handy - you'll need them in Step 3

---

## 🛍️ Step 2: Create a Test Product & Price (5 minutes)

1. **In Stripe Dashboard (Test Mode)**
   - Go to **Products** → **Add product**

2. **Create Test Product**
   - **Name:** `Pro Subscription (Test)`
   - **Description:** `Test subscription for Pro tier`
   - **Pricing model:** `Standard pricing`
   - **Price:** `€19.99` (or your desired amount)
   - **Billing period:** `Monthly`
   - Click **"Save product"**

3. **Copy the Price ID**
   - After creating, you'll see a **Price ID** (starts with `price_...`)
   - **Copy this Price ID** - you'll need it in Step 3
   - Example: `price_1Test1234567890`

---

## ⚙️ Step 3: Update Environment Variables in Vercel (5 minutes)

1. **Go to Vercel Dashboard**
   - Your Project → **Settings** → **Environment Variables**

2. **Update Stripe Keys (Temporarily for Testing)**
   - Find `STRIPE_SECRET_KEY`
   - **Update value** to your **test secret key** (`sk_test_...`)
   - **Environment:** Make sure it's set for **Production**, **Preview**, and **Development**
   - Click **"Save"**

3. **Update Stripe Price ID**
   - Find `NEXT_PUBLIC_STRIPE_PRICE_ID`
   - **Update value** to your **test price ID** (`price_1Test...`)
   - **Environment:** Make sure it's set for **Production**, **Preview**, and **Development**
   - Click **"Save"**

4. **Update Webhook Secret (Optional - for webhook testing)**
   - You'll need to create a test webhook endpoint (see Step 4)
   - Or skip this for now if you just want to test checkout

5. **Redeploy**
   - Vercel will automatically redeploy
   - Or manually trigger: **Deployments** → **Redeploy**

---

## 🔗 Step 4: Set Up Test Webhook (Optional - 5 minutes)

To test the full subscription flow including webhooks:

1. **In Stripe Dashboard (Test Mode)**
   - Go to **Developers** → **Webhooks**

2. **Add Endpoint**
   - Click **"Add endpoint"**
   - **Endpoint URL:** `https://your-app.vercel.app/api/webhooks/stripe`
     - Or use your custom domain: `https://forgerie.io/api/webhooks/stripe`
   - **Description:** `Test webhook for subscription management`

3. **Select Events**
   - ✅ `checkout.session.completed`
   - ✅ `customer.subscription.updated`
   - ✅ `customer.subscription.deleted`
   - Click **"Add endpoint"**

4. **Copy Signing Secret**
   - After creating, click on the webhook
   - Click **"Reveal"** next to "Signing secret"
   - Copy the secret (starts with `whsec_...`)

5. **Update in Vercel**
   - Go to Vercel → **Settings** → **Environment Variables**
   - Find `STRIPE_WEBHOOK_SECRET`
   - **Update value** to your **test webhook signing secret** (`whsec_...`)
   - Click **"Save"**

---

## 💳 Step 5: Test Cards to Use

Stripe provides test card numbers that work in test mode. **These cards never charge real money.**

### ✅ Success Cards

**Basic Visa (Always succeeds):**
```
Card Number: 4242 4242 4242 4242
Expiry: Any future date (e.g., 12/25)
CVC: Any 3 digits (e.g., 123)
ZIP: Any 5 digits (e.g., 12345)
```

**3D Secure Authentication (Requires authentication):**
```
Card Number: 4000 0025 0000 3155
Expiry: Any future date
CVC: Any 3 digits
ZIP: Any 5 digits
```
- This will show a popup asking you to authenticate
- Click "Complete authentication" to proceed

### ❌ Failure Cards

**Card Declined:**
```
Card Number: 4000 0000 0000 0002
Expiry: Any future date
CVC: Any 3 digits
ZIP: Any 5 digits
```

**Insufficient Funds:**
```
Card Number: 4000 0000 0000 9995
Expiry: Any future date
CVC: Any 3 digits
ZIP: Any 5 digits
```

**More test cards:** See [Stripe Test Cards](https://stripe.com/docs/testing#cards)

---

## 🧪 Step 6: Test the Payment Flow

1. **Visit Your App**
   - Go to your deployed app (Vercel URL or custom domain)
   - Make sure you're logged in

2. **Go to Pricing Page**
   - Navigate to `/pricing` or click "Upgrade to Pro"

3. **Click "Upgrade" or "Get Started"**
   - This should redirect you to Stripe Checkout

4. **Use Test Card**
   - Enter: `4242 4242 4242 4242`
   - Expiry: `12/25` (or any future date)
   - CVC: `123`
   - ZIP: `12345`
   - Name: Any name
   - Email: Your email (or test email)

5. **Complete Payment**
   - Click **"Subscribe"** or **"Pay"**
   - Should redirect back to your app with success message

6. **Verify in Stripe Dashboard**
   - Go to Stripe Dashboard → **Payments** (Test mode)
   - You should see the test payment
   - Go to **Customers** → Find your test customer
   - Go to **Subscriptions** → See your test subscription

7. **Verify in Your App**
   - Check your dashboard - you should now be a Pro user
   - Try accessing Pro-only features (Export HTML, View Raw HTML)

---

## ✅ Step 7: Verify Everything Works

Test these scenarios:

### ✅ Successful Subscription
- [ ] Checkout completes successfully
- [ ] User is upgraded to Pro tier
- [ ] Pro features are accessible
- [ ] Subscription appears in Stripe Dashboard

### ✅ Webhook Events (if webhook is set up)
- [ ] `checkout.session.completed` event is received
- [ ] User tier is updated in database
- [ ] Subscription status is "ACTIVE"

### ✅ Subscription Management
- [ ] User can access billing portal
- [ ] User can cancel subscription
- [ ] Cancellation webhook updates user tier back to FREE

### ❌ Failed Payments
- [ ] Declined card shows error message
- [ ] User remains on Free tier
- [ ] Error is handled gracefully

---

## 🔄 Step 8: Switch Back to Production (When Ready)

**⚠️ IMPORTANT:** Before going live, switch back to production keys!

1. **Get Production Keys**
   - In Stripe Dashboard, switch to **"Live mode"**
   - Go to **Developers** → **API keys**
   - Copy your **live keys** (`pk_live_...` and `sk_live_...`)

2. **Update Vercel Environment Variables**
   - Update `STRIPE_SECRET_KEY` to production key
   - Update `NEXT_PUBLIC_STRIPE_PRICE_ID` to production price ID
   - Update `STRIPE_WEBHOOK_SECRET` to production webhook secret

3. **Redeploy**
   - Vercel will automatically redeploy

---

## 🐛 Troubleshooting

### Payment Not Working

1. **Check Test Mode**
   - Make sure Stripe Dashboard is in **Test mode**
   - Make sure you're using **test keys** (`sk_test_...`)

2. **Check Environment Variables**
   - Verify keys are updated in Vercel
   - Make sure you redeployed after updating

3. **Check Browser Console**
   - Open browser DevTools (F12)
   - Check for errors in Console tab

4. **Check Stripe Dashboard**
   - Go to **Developers** → **Logs**
   - Look for API errors

### Webhook Not Working

1. **Check Webhook URL**
   - Make sure webhook URL is correct
   - Test by sending a test event in Stripe Dashboard

2. **Check Webhook Secret**
   - Verify `STRIPE_WEBHOOK_SECRET` is set correctly
   - Make sure it matches the signing secret from Stripe

3. **Check Webhook Logs**
   - Go to Stripe Dashboard → **Developers** → **Webhooks**
   - Click on your webhook
   - Check **"Recent events"** for errors

### User Not Upgraded After Payment

1. **Check Webhook**
   - Verify webhook is receiving events
   - Check webhook logs in Stripe Dashboard

2. **Check Database**
   - Verify user tier is updated in database
   - Check subscription status

3. **Check Logs**
   - Check Vercel function logs
   - Look for webhook processing errors

---

## 📚 Additional Resources

- [Stripe Testing Guide](https://stripe.com/docs/testing)
- [Stripe Test Cards](https://stripe.com/docs/testing#cards)
- [Stripe Webhooks Guide](https://stripe.com/docs/webhooks)
- [Stripe Checkout Testing](https://stripe.com/docs/payments/checkout/test-mode)

---

## 🎉 Done!

You can now test your payment flow without spending real money!

**Remember:**
- ✅ Test mode = No real charges
- ✅ Use test cards (`4242 4242 4242 4242`)
- ✅ Switch back to production keys before going live
- ✅ Test both success and failure scenarios
