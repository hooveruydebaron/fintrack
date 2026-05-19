# FinTrack — Deploy to Vercel

A personal finance app with accounts, transactions, budgets, bills, investments, and reports.

---

## How to deploy (no coding required)

### Step 1 — Install Node.js
Download and install from https://nodejs.org (choose the LTS version).

### Step 2 — Create a GitHub account
Go to https://github.com and sign up for a free account if you don't have one.

### Step 3 — Create a new GitHub repository
1. Click the **+** icon in the top right → **New repository**
2. Name it `fintrack`
3. Set it to **Private**
4. Click **Create repository**

### Step 4 — Upload these files to GitHub
1. On your new repo page, click **uploading an existing file**
2. Drag and drop the entire `fintrack` folder contents
3. Click **Commit changes**

### Step 5 — Deploy with Vercel (free)
1. Go to https://vercel.com and sign in with GitHub
2. Click **Add New → Project**
3. Select your `fintrack` repository
4. Leave all settings as default
5. Click **Deploy**

Vercel will build and give you a live URL like `https://fintrack-abc123.vercel.app` — that's your app!

---

## Your data
All data is stored in your browser's localStorage. It stays private and never leaves your device.

## Updating the app
If you make changes and push them to GitHub, Vercel automatically redeploys.
