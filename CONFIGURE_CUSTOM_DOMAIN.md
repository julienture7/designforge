# 🌐 Configure Custom Domain: forgerie.io

Complete guide to set up your custom domain `forgerie.io` with your Vercel deployment.

---

## 📋 Step 1: Add Domain in Vercel (5 minutes)

1. **Go to your Vercel Dashboard**
   - Visit [vercel.com](https://vercel.com) and log in
   - Select your project (`designforge`)

2. **Navigate to Domain Settings**
   - Click **Settings** → **Domains** (in the left sidebar)

3. **Add Your Domain**
   - Click **"Add"** or **"Add Domain"**
   - Enter: `forgerie.io`
   - Click **"Add"**

4. **Vercel will show DNS configuration**
   - You'll see instructions for configuring DNS records
   - **Keep this page open** - you'll need it for Step 2

---

## 🔧 Step 2: Configure DNS Records (10-30 minutes)

The DNS configuration depends on where you purchased your domain. Common registrars:
- **Namecheap**
- **GoDaddy**
- **Google Domains**
- **Cloudflare**
- **Others**

### 2.1 Find Your DNS Settings

1. Log in to your domain registrar
2. Find **DNS Settings** or **Domain Management**
3. Look for **DNS Records** or **Name Servers**

### 2.2 Add DNS Records

Vercel will show you the exact records to add. Typically, you'll need:

**Option A: A Record (Root Domain)**
```
Type: A
Name: @ (or leave blank, or forgerie.io)
Value: [IP address from Vercel]
TTL: Auto (or 3600)
```

**Option B: CNAME Record (Recommended)**
```
Type: CNAME
Name: @ (or leave blank, or forgerie.io)
Value: cname.vercel-dns.com
TTL: Auto (or 3600)
```

**For www subdomain (optional but recommended):**
```
Type: CNAME
Name: www
Value: cname.vercel-dns.com
TTL: Auto (or 3600)
```

### 2.3 Wait for DNS Propagation

- DNS changes can take **5 minutes to 48 hours** to propagate
- Usually takes **15-30 minutes**
- You can check status in Vercel Dashboard → Settings → Domains
- Status will show **"Valid Configuration"** when ready

---

## ⚙️ Step 3: Update Environment Variables (2 minutes)

1. **Go to Vercel Dashboard**
   - Your Project → **Settings** → **Environment Variables**

2. **Add/Update `NEXT_PUBLIC_APP_URL`**
   - **Name:** `NEXT_PUBLIC_APP_URL`
   - **Value:** `https://forgerie.io`
   - **Environment:** Select **Production**, **Preview**, and **Development**
   - Click **"Save"**

3. **Redeploy**
   - Vercel will automatically redeploy when you save
   - Or manually trigger: **Deployments** → **Redeploy**

---

## 🔐 Step 4: Update Clerk Allowed Origins (2 minutes)

1. **Go to [Clerk Dashboard](https://dashboard.clerk.com)**
   - Log in and select your application

2. **Navigate to Settings**
   - **Settings** → **Allowed Origins** (in the left sidebar)

3. **Add Your Custom Domain**
   - Click **"Add Origin"** or **"+"**
   - Enter: `https://forgerie.io`
   - Click **"Save"**

4. **Also add www (if you set it up):**
   - Add: `https://www.forgerie.io` (if you configured www subdomain)

5. **Keep localhost for development:**
   - Make sure `http://localhost:3000` is still in the list

---

## 💳 Step 5: Update Stripe Webhook URL (3 minutes)

1. **Go to [Stripe Dashboard](https://dashboard.stripe.com)**
   - Log in to your Stripe account

2. **Navigate to Webhooks**
   - **Developers** → **Webhooks**

3. **Find Your Existing Webhook**
   - Look for the webhook pointing to your Vercel URL (e.g., `https://your-app.vercel.app/api/webhooks/stripe`)

4. **Update the Webhook URL**
   - Click on the webhook
   - Click **"Edit"** or the pencil icon
   - Change **Endpoint URL** to: `https://forgerie.io/api/webhooks/stripe`
   - Click **"Save"**

5. **Test the Webhook (Optional)**
   - Click **"Send test webhook"** to verify it's working
   - Or wait for a real event to test

---

## ✅ Step 6: Verify Everything Works (5 minutes)

Test these in order:

1. **Domain is Live**
   - Visit `https://forgerie.io` in your browser
   - Should load your app (not show Vercel default page)

2. **HTTPS is Working**
   - Check that the URL shows `https://` (not `http://`)
   - Vercel automatically provisions SSL certificates

3. **Sign Up/Sign In**
   - Click "Sign Up" or "Sign In"
   - Clerk modal should appear and work correctly

4. **Create a Project**
   - Try creating a new design
   - Should work without errors

5. **Stripe Checkout (Test)**
   - Try upgrading to Pro tier
   - Checkout should redirect correctly
   - After payment, should redirect back to `https://forgerie.io`

---

## 🔄 Step 7: Optional - Redirect www to Root (Recommended)

If you set up both `forgerie.io` and `www.forgerie.io`, you should redirect one to the other:

1. **In Vercel Dashboard** → **Settings** → **Domains**
2. **Set Primary Domain**
   - Choose `forgerie.io` as primary
   - Vercel will automatically redirect `www.forgerie.io` → `forgerie.io`

Or configure redirect in your DNS/registrar settings.

---

## 🐛 Troubleshooting

### Domain Not Working After 30 Minutes

1. **Check DNS Propagation**
   - Use [whatsmydns.net](https://www.whatsmydns.net) to check if DNS has propagated
   - Enter `forgerie.io` and check if it points to Vercel

2. **Check Vercel Domain Status**
   - Vercel Dashboard → Settings → Domains
   - Should show **"Valid Configuration"**
   - If it shows an error, check the error message

3. **Verify DNS Records**
   - Make sure you added the correct records
   - Double-check the values from Vercel

### SSL Certificate Not Working

- Vercel automatically provisions SSL certificates
- Wait 5-10 minutes after DNS propagates
- If still not working after 1 hour, contact Vercel support

### Clerk Authentication Not Working

- Make sure `https://forgerie.io` is in Clerk's **Allowed Origins**
- Check that `NEXT_PUBLIC_APP_URL` is set to `https://forgerie.io`
- Clear browser cache and try again

### Stripe Webhook Not Working

- Verify webhook URL is `https://forgerie.io/api/webhooks/stripe`
- Check Stripe Dashboard → Webhooks → Recent events
- Make sure `STRIPE_WEBHOOK_SECRET` is set in Vercel environment variables

---

## 📝 Summary Checklist

- [ ] Added `forgerie.io` domain in Vercel
- [ ] Configured DNS records at your registrar
- [ ] Waited for DNS propagation (15-30 minutes)
- [ ] Updated `NEXT_PUBLIC_APP_URL` to `https://forgerie.io` in Vercel
- [ ] Added `https://forgerie.io` to Clerk Allowed Origins
- [ ] Updated Stripe webhook URL to `https://forgerie.io/api/webhooks/stripe`
- [ ] Tested domain is accessible
- [ ] Tested authentication works
- [ ] Tested payments work

---

## 🎉 Done!

Your app is now live at **https://forgerie.io**!

You can share this URL with users, and it will work just like your Vercel URL, but with your custom domain.

---

## 📚 Additional Resources

- [Vercel Domain Documentation](https://vercel.com/docs/concepts/projects/domains)
- [Clerk Domain Configuration](https://clerk.com/docs/deployments/overview)
- [Stripe Webhook Setup](https://stripe.com/docs/webhooks)
