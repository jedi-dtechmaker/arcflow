# ArcFlow

One-tap global sends with instant proof. Feels like Venmo + Wise, powered by Arc.

ArcFlow is a Vite React MVP for Arc Testnet: Privy login, embedded wallets, native USDC sends, receipt-backed proof, claim links, reusable Pay Me links, dashboard history, and exports.

## Stack

- Vite, React 19, Tailwind CSS 4, shadcn-style UI primitives
- Privy embedded wallets and magic login
- Arc Testnet custom EVM chain
- Direct Arc Testnet USDC transfers with viem
- Supabase Postgres and Storage
- Lucide icons

## Arc Testnet

- RPC: `https://rpc.testnet.arc.network`
- Chain ID: `5042002`
- Currency: `USDC`
- Explorer: `https://testnet.arcscan.app`
- Native USDC contract: `0x3600000000000000000000000000000000000000`
- Decimals: `6`

## What Accounts And Keys You Need

You need two required accounts:

- Privy: handles login and creates embedded wallets for users.
- Supabase: stores users, payment records, claim links, Flow Links, and receipt files.

Circle is optional for this MVP:

- The app has a `VITE_CIRCLE_CLIENT_KEY` field reserved for a future frontend-safe Circle App Kit key.
- Do not put a Circle server API key in this Vite app. Server API keys are private and belong only in a backend.
- The app currently sends Arc Testnet USDC directly with `viem`, because the requested Circle App Kit npm package/version was not installable.

Important beginner rule: anything starting with `VITE_` is visible in the browser after you build the app. Only put public/browser-safe values there.

## Get Your Privy Key

1. Go to https://dashboard.privy.io and create an account.
2. Create a new app called `ArcFlow`.
3. Open your app, then go to `Configuration` > `App settings` > `Basics`.
4. Copy the `App ID`.
5. Put it in `.env.local`:

   ```bash
   VITE_PRIVY_APP_ID=paste_your_privy_app_id_here
   ```

6. You may also see an `App Secret`. Do not put it in `.env.local` for this project. This is private and only belongs in a backend server.
7. Enable login methods:
   - Go to the login/authentication settings in Privy.
   - Enable Email.
   - Enable Google if you want Google login.
   - Enable Passkeys if your Privy dashboard plan supports it.
8. Add your local app URL as an allowed origin/client origin if Privy asks for one:

   ```text
   http://localhost:5173
   ```

9. For production later, also add your deployed URL, for example:

   ```text
   https://your-app.vercel.app
   ```

## Configure Arc Testnet In Privy

In your Privy app settings, add Arc Testnet as a custom EVM chain if the dashboard asks you to configure supported chains.

Use these exact values:

```text
Name: Arc Testnet
Chain ID: 5042002
RPC URL: https://rpc.testnet.arc.network
Native currency name: USDC
Native currency symbol: USDC
Native currency decimals: 6
Block explorer: https://testnet.arcscan.app
```

The code also hardcodes this chain in [src/lib/arc.js](src/lib/arc.js), so the app knows how to ask Privy wallets to use Arc Testnet.

## Get Your Supabase Keys

1. Go to https://supabase.com and create an account.
2. Click `New project`.
3. Choose an organization, enter a project name like `arcflow`, create a database password, and select a region near you.
4. Wait for the project to finish provisioning.
5. In your Supabase project, open `Project Settings`.
6. Open `API Keys` or `API`.
7. Copy your `Project URL`. It looks like:

   ```text
   https://your-project-ref.supabase.co
   ```

8. Put it in `.env.local`:

   ```bash
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   ```

9. Copy the browser-safe key:
   - Newer Supabase projects may call it `publishable key` and it may start with `sb_publishable_`.
   - Older Supabase projects may call it `anon public` or `anon key`.

10. Put that key in `.env.local`:

   ```bash
   VITE_SUPABASE_ANON_KEY=paste_your_publishable_or_anon_key_here
   ```

11. Do not copy `service_role`, `secret`, or `sb_secret_...` into this Vite project. Those keys bypass security rules and must only be used on a backend server.

## Create The Supabase Tables

You need to run the database migration before the app can save anything.

Beginner-friendly way:

1. In Supabase, open your project.
2. Click `SQL Editor`.
3. Click `New query`.
4. Open this file in your code editor:

   ```text
   supabase/migrations/0001_arcflow_schema.sql
   ```

5. Copy the whole SQL file.
6. Paste it into the Supabase SQL editor.
7. Click `Run`.

This creates:

- `users`
- `transactions`
- `receipts`
- `flow_links`
- a `receipts` storage bucket
- basic Row Level Security policies for this testnet MVP

You only need to do this once per Supabase project.

## Optional Circle Key

For this MVP, you can leave this empty:

```bash
VITE_CIRCLE_CLIENT_KEY=
```

If Circle gives you a frontend-safe Client Key or Kit Key for App Kit:

1. Go to the Circle developer console.
2. Open the API/client/kit keys area.
3. Create or copy the key meant for frontend SDK or kit usage.
4. Put it in `.env.local`:

   ```bash
   VITE_CIRCLE_CLIENT_KEY=paste_frontend_safe_circle_key_here
   ```

Do not put a Circle API key, Circle Mint key, or any server-side secret in this Vite app. Circle API keys are private and should only be used from a backend server.

## Local Setup

1. Make sure Node.js and Yarn are installed:

   ```bash
   node --version
   yarn --version
   ```

   If either command fails, install Node.js LTS first from https://nodejs.org, then run:

   ```bash
   corepack enable
   corepack prepare yarn@stable --activate
   ```

   On Kali or Debian-based Linux, if `corepack` is missing, run:

   ```bash
   sudo apt update
   sudo apt install -y nodejs npm node-corepack
   corepack enable
   corepack prepare yarn@stable --activate
   yarn --version
   ```

   If `sudo apt install node-corepack` fails with `404 Not Found`, your package list is stale. Run this first, then try again:

   ```bash
   sudo apt update --fix-missing
   sudo apt install -y nodejs npm node-corepack
   ```

   If Corepack still gives trouble, use npm to install Yarn:

   ```bash
   sudo apt install -y nodejs npm
   sudo npm install -g yarn
   yarn --version
   ```

   If Kali apt keeps failing before it installs `npm`, use `nvm` instead. This installs Node.js inside your home folder and avoids the broken apt package:

   ```bash
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
   source ~/.zshrc
   nvm install --lts
   node --version
   npm --version
   corepack enable
   corepack prepare yarn@stable --activate
   yarn --version
   ```

   If `corepack` still is not available after installing Node with `nvm`, run:

   ```bash
   npm install -g yarn
   yarn --version
   ```

2. Install dependencies with yarn:

   ```bash
   yarn
   ```

3. Copy environment variables:

   ```bash
   cp .env.example .env.local
   ```

4. Fill in `.env.local`:

   ```bash
   VITE_APP_URL=http://localhost:5173
   VITE_PRIVY_APP_ID=paste_your_privy_app_id_here
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=paste_your_publishable_or_anon_key_here
   VITE_CIRCLE_CLIENT_KEY=
   ```

5. Start the app:

   ```bash
   yarn dev
   ```

6. Open `http://localhost:5173`.

7. Click `Login`, sign in with Privy, and copy the wallet address shown in the header.

## Get Testnet USDC

Use Circle's faucet: https://faucet.circle.com

Fund the Privy embedded wallet shown in the ArcFlow header. You can copy the wallet address after logging in.

## Testing With Two Wallets

1. Open ArcFlow in one browser profile and login as Sender A.
2. Fund Sender A with Arc Testnet USDC from the faucet.
3. Open another browser/profile and login as Recipient B.
4. Copy Recipient B's wallet address.
5. Back as Sender A, send USDC to Recipient B's `0x...` address and attach a receipt.
6. Confirm the tx hash on ArcScan and check Sender A's Sent tab.
7. As Recipient B, open Dashboard and confirm the Received tab and balance.
8. Test an email/phone/X recipient by sending to an identifier. ArcFlow creates a claim link because no wallet is known yet; the recipient can login and attach their wallet to the payment proof.

## Deploy To Vercel

1. Push the repo to GitHub.
2. Import the project in Vercel.
3. Add the same environment variables from `.env.example`.
4. Set `VITE_APP_URL` to your Vercel URL or custom domain.
5. Deploy.
6. Add the production domain to Privy's allowed origins.

## ArcLens Later

When ArcLens listings open, submit:

- App name: `ArcFlow`
- Tagline: `One-tap global sends with instant proof.`
- Network: Arc Testnet
- Core contract/token: native USDC `0x3600000000000000000000000000000000000000`
- Demo URL and test credentials/instructions
- Screenshots of Send, Claim, Flow Link, and Dashboard

## Notes

Direct on-chain sends require a wallet address. Email, phone, and X handle recipients create a claim/proof link first, since this MVP intentionally avoids a custom escrow contract. The recipient can attach their wallet through Privy, and the sender can complete the payout using the revealed wallet.

This is intentionally a Vite-only app. Because there is no server runtime in Vite, Supabase writes use anon-key RLS policies for testnet usability. For real money, put the write paths behind Supabase Edge Functions or a small backend that verifies Privy JWTs.
