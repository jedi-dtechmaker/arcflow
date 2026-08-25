import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import { createWalletClient, http, defineChain, parseUnits, erc20Abi, keccak256, encodePacked } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createClient } from '@supabase/supabase-js';
import multer from 'multer';
import { startBotServer } from './bot.js';
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        server: 'ArcFlow Backend',
        version: '1.2.0',
        timestamp: new Date().toISOString(),
        supabaseConfigured: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        circleConfigured: !!process.env.CIRCLE_API_KEY
    });
});

const upload = multer({ storage: multer.memoryStorage() });

const PORT = process.env.PORT || 3001;

// Supabase Configuration (Server-side God Mode)
const supabaseUrl = process.env.SUPABASE_URL || "https://bmufgvvqtukhiceukhot.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
    console.warn("WARNING: SUPABASE_SERVICE_ROLE_KEY is missing from backend/.env. Database operations will fail.");
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Arc Testnet Configuration
const arcTestnet = defineChain({
    id: 5042002,
    name: "Arc Testnet",
    nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
    rpcUrls: { default: { http: [process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network"] } },
});
const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";

/**
 * DETERMINISTIC WALLET WORKAROUND
 * Derives a private key from (email + CIRCLE_API_KEY)
 * This provides a STABLE address for every user without complex Circle setup.
 */
function getManagedWallet(userId) {
    if (!userId) return null;
    const salt = process.env.CIRCLE_API_KEY || "arcflow-salt";
    // Generate a deterministic 32-byte key from the email
    const entropy = keccak256(encodePacked(['string', 'string'], [userId.toLowerCase(), salt]));
    const account = privateKeyToAccount(entropy);
    return { address: account.address, id: userId };
}

// --- AUTH & IDENTITY ENDPOINTS ---

// 1. Send OTP
app.post('/api/auth/otp/send', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email is required' });

        const { data, error } = await supabase.auth.signInWithOtp({
            email: email.trim().toLowerCase(),
            options: { shouldCreateUser: true }
        });

        if (error) {
            console.error('Supabase signInWithOtp Error:', error);
            return res.status(400).json({ 
                error: error.message || 'Failed to send OTP. Please check your Supabase Email provider settings or SMTP limit.' 
            });
        }

        res.json({ success: true, message: "OTP sent to your email" });
    } catch (error) {
        console.error('OTP Send Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// 2. Verify OTP
app.post('/api/auth/otp/verify', async (req, res) => {
    try {
        const { email, code } = req.body;
        if (!email || !code) return res.status(400).json({ error: 'Email and code are required' });

        const cleanEmail = email.trim().toLowerCase();
        const cleanCode = code.trim();

        // Try 'signup' type first
        let { data, error } = await supabase.auth.verifyOtp({
            email: cleanEmail,
            token: cleanCode,
            type: 'signup'
        });

        // If that fails, try 'magiclink'
        if (error) {
            const retry = await supabase.auth.verifyOtp({
                email: cleanEmail,
                token: cleanCode,
                type: 'magiclink'
            });
            data = retry.data;
            error = retry.error;
        }

        // Final fallback: try 'email'
        if (error) {
            const retry = await supabase.auth.verifyOtp({
                email: cleanEmail,
                token: cleanCode,
                type: 'email'
            });
            data = retry.data;
            error = retry.error;
        }

        if (error) {
            console.error('Supabase verifyOtp Error:', error);
            return res.status(401).json({ error: error.message || 'Invalid or expired OTP code' });
        }

        await handleSuccessfulAuth(res, cleanEmail, data?.user?.id || cleanEmail);
    } catch (error) {
        console.error('OTP Verify Error:', error);
        res.status(401).json({ error: error.message || 'Invalid or expired OTP' });
    }
});

// 2.5 Telegram 1-Tap Auth Endpoint (Real deterministic wallet for Telegram user)
app.post('/api/auth/telegram', async (req, res) => {
    try {
        const { telegramId, username, firstName } = req.body;
        if (!telegramId) return res.status(400).json({ error: 'Telegram ID is required' });

        const userId = `telegram:${telegramId}`;
        const wallet = getManagedWallet(userId);

        try {
            await supabase.from('users').upsert({
                privy_id: userId,
                wallet_address: wallet.address,
                email: username ? `@${username}` : firstName || `tg_${telegramId}`
            }, { onConflict: 'privy_id' });
        } catch (dbErr) {
            console.warn("Could not save telegram user to DB:", dbErr.message);
        }

        res.json({
            success: true,
            userId,
            walletAddress: wallet.address,
            username: username ? `@${username}` : firstName,
            isTelegram: true
        });
    } catch (error) {
        console.error('Telegram Auth Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 3. External Wallet Login
app.post('/api/auth/external', async (req, res) => {
    try {
        const { address } = req.body;
        if (!address) return res.status(400).json({ error: 'Wallet address is required' });

        // External wallets don't get a managed wallet (they use their own), 
        // but we still track them as users.
        const { error } = await supabase.from('users').upsert({
            privy_id: address.toLowerCase(),
            wallet_address: address.toLowerCase()
        }, { onConflict: 'privy_id' });

        if (error) throw error;

        // Log Login Activity for External Wallet
        try {
            await supabase.from('transactions').insert({
                sender_privy_id: address.toLowerCase(),
                sender_wallet: address.toLowerCase(),
                recipient_wallet: address.toLowerCase(), // Self-reference for login
                amount_usdc: 0,
                status: 'completed',
                type: 'login',
                note: 'Logged in with external wallet',
                created_at: new Date().toISOString()
            });
        } catch (err) {
            console.warn("Could not log external login activity:", err.message);
        }

        res.json({
            success: true,
            userId: address.toLowerCase(),
            walletAddress: address.toLowerCase(),
            isExternal: true
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

async function handleSuccessfulAuth(res, email, supabaseUid) {
    const wallet = getManagedWallet(email);

    // Log Login Activity
    try {
        console.log(`[DB] Logging login for: ${email}`);
        const { error: insertErr } = await supabase.from('transactions').insert({
            sender_privy_id: email,
            sender_wallet: wallet.address,
            recipient_wallet: wallet.address, // Self-reference
            amount_usdc: 0,
            status: 'completed',
            type: 'login',
            note: 'Logged in to platform',
            created_at: new Date().toISOString()
        });
        if (insertErr) console.error("[DB] Login log error:", insertErr.message);
        else console.log("[DB] Login log successful");
    } catch (err) {
        console.warn("[DB] Could not log login activity:", err.message);
    }

    try {
        console.log(`[DB] Upserting user: ${email}`);
        const { error: upsertErr } = await supabase.from('users').upsert({
            privy_id: email,
            wallet_address: wallet.address
        }, { onConflict: 'privy_id' });

        if (upsertErr) {
            console.error("[DB] User upsert error:", upsertErr.message);
            // We don't throw here to allow login to continue even if tracking fails
        } else {
            console.log("[DB] User upsert successful");
        }
    } catch (err) {
        console.warn("[DB] User upsert failed unexpectedly:", err.message);
    }

    console.log(`[AUTH] Login successful for: ${email}`);
    res.json({
        success: true,
        userId: email,
        walletAddress: wallet.address,
        isExternal: false
    });
}

// 3. Initiate a Managed Transfer (Uses the derived key to sign)
app.post('/api/circle/transfer', async (req, res) => {
    try {
        const { userId, destinationAddress, amount } = req.body;
        if (!userId || !destinationAddress || !amount) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        const salt = process.env.CIRCLE_API_KEY || "arcflow-salt";
        const entropy = keccak256(encodePacked(['string', 'string'], [userId.toLowerCase(), salt]));

        // Ensure hex prefix for privateKeyToAccount
        const key = entropy.startsWith('0x') ? entropy : `0x${entropy}`;
        const account = privateKeyToAccount(key);

        const walletClient = createWalletClient({
            account,
            chain: arcTestnet,
            transport: http()
        });

        const txHash = await walletClient.writeContract({
            address: USDC_ADDRESS,
            abi: erc20Abi,
            functionName: "transfer",
            args: [destinationAddress, parseUnits(amount.toString(), 6)]
        });

        res.json({
            success: true,
            txHash
        });
    } catch (error) {
        console.error('Error creating transfer:', error);
        res.status(500).json({ error: error.message || 'Error creating transfer' });
    }
});


// 3. In-App Faucet: Send USDC to the user from the Treasury Wallet
app.post('/api/fund', async (req, res) => {
    try {
        const { targetWallet, amount } = req.body;

        if (!targetWallet) return res.status(400).json({ error: 'targetWallet is required' });
        if (!amount || isNaN(amount) || amount <= 0) return res.status(400).json({ error: 'Valid amount is required' });

        // Safety check to prevent treasury drain
        const requestedAmount = Number(amount);
        if (requestedAmount > 5000) {
            return res.status(400).json({ error: 'Maximum testnet deposit per request is $5,000 USDC.' });
        }

        if (!process.env.TREASURY_PRIVATE_KEY) {
            return res.status(500).json({ error: 'TREASURY_PRIVATE_KEY is not configured on the backend.' });
        }

        // Ensure hex prefix
        const key = process.env.TREASURY_PRIVATE_KEY.startsWith('0x')
            ? process.env.TREASURY_PRIVATE_KEY
            : `0x${process.env.TREASURY_PRIVATE_KEY}`;
        const account = privateKeyToAccount(key);

        const walletClient = createWalletClient({
            account,
            chain: arcTestnet,
            transport: http()
        });

        const txHash = await walletClient.writeContract({
            address: USDC_ADDRESS,
            abi: erc20Abi,
            functionName: "transfer",
            args: [targetWallet, parseUnits(requestedAmount.toString(), 6)]
        });

        // Log Deposit Activity
        try {
            await supabase.from('transactions').insert({
                recipient_wallet: targetWallet,
                amount_usdc: requestedAmount,
                status: 'completed',
                type: 'deposit',
                tx_hash: txHash,
                note: 'Testnet Faucet Deposit',
                created_at: new Date().toISOString()
            });
        } catch (err) {
            console.warn("Could not log deposit activity:", err.message);
        }

        res.json({ success: true, txHash, amount: requestedAmount });
    } catch (error) {
        console.error('Error funding wallet:', error);
        res.status(500).json({ error: error.message || 'Failed to fund wallet' });
    }
});

// --- DATABASE PROXY ENDPOINTS (Bypass 401s) ---

// 1. Get User wallet
app.get('/api/db/user/wallet', async (req, res) => {
    try {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: 'id is required' });

        // Try DB first
        const { data, error } = await supabase
            .from('users')
            .select('wallet_address')
            .eq('privy_id', id)
            .single();

        if (data?.wallet_address) {
            return res.json({ success: true, wallet: data.wallet_address });
        }

        // Fallback: If email, derive managed wallet
        if (id.includes('@')) {
            const wallet = getManagedWallet(id);
            return res.json({ success: true, wallet: wallet.address });
        }

        res.status(404).json({ error: 'Wallet not found' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2. Fetch History
app.get('/api/db/history', async (req, res) => {
    try {
        const { wallet } = req.query;
        if (!wallet) return res.status(400).json({ error: 'wallet is required' });
        const lower = wallet.toLowerCase();
        console.log(`[DB] Fetching history for: ${lower}`);
        const { data, error } = await supabase
            .from('transactions')
            .select('*')
            .or(`sender_wallet.ilike.${lower},recipient_wallet.ilike.${lower}`)
            .order('created_at', { ascending: false });
        if (error) throw error;
        console.log(`[DB] History results: ${data?.length || 0}`);
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2. Get Claim
app.get('/api/db/claim/:code', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('transactions')
            .select('*, receipts(storage_path, file_name, content_hash)')
            .eq('claim_code', req.params.code)
            .single();
        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        res.status(404).json({ error: 'Claim not found' });
    }
});

// New: Update Claim (For claiming links)
app.post('/api/db/claim/update', async (req, res) => {
    try {
        const { claim_code, ...updates } = req.body;
        const { data, error } = await supabase
            .from('transactions')
            .update(updates)
            .eq('claim_code', claim_code)
            .in('status', ['pending_claim', 'completed'])
            .select()
            .single();
        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 3. Save/Update Transaction
app.post('/api/db/transaction', async (req, res) => {
    try {
        const { id, ...body } = req.body;
        let result;
        if (id) {
            result = await supabase.from('transactions').update(body).eq('id', id).select().single();
        } else {
            // Default to 'transfer' if type not provided
            if (!body.type) body.type = 'transfer';
            result = await supabase.from('transactions').insert(body).select().single();
        }
        if (result.error) throw result.error;
        res.json({ success: true, data: result.data });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 4. Create Flow Link
app.post('/api/db/flow-link', async (req, res) => {
    try {
        const { data, error } = await supabase.from('flow_links').insert(req.body).select().single();
        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 5. Get Flow Link
app.get('/api/db/flow-link/:slug', async (req, res) => {
    try {
        const { data, error } = await supabase.from('flow_links').select('*').eq('slug', req.params.slug).eq('active', true).single();
        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        res.status(404).json({ error: 'Flow link not found' });
    }
});

// 6. Upsert User
app.post('/api/db/user', async (req, res) => {
    try {
        const { id, wallet_address } = req.body;
        const { error } = await supabase.from('users').upsert({
            privy_id: id || wallet_address,
            wallet_address,
            updated_at: new Date().toISOString()
        }, { onConflict: 'privy_id' });
        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 7. Storage Proxy: Upload to Receipts bucket
app.post('/api/db/storage/upload', upload.single('file'), async (req, res) => {
    try {
        const { path } = req.body;
        const file = req.file;
        if (!file || !path) return res.status(400).json({ error: 'File and path are required' });

        const { data, error } = await supabase.storage
            .from('receipts')
            .upload(path, file.buffer, {
                contentType: file.mimetype,
                upsert: true
            });

        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 8. Save Receipt Metadata
app.post('/api/db/receipts', async (req, res) => {
    try {
        const { data, error } = await supabase.from('receipts').insert(req.body).select().single();
        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 11. Get User Assets (Flows + Pending Claims)
app.get('/api/db/user/assets', async (req, res) => {
    try {
        const { wallet } = req.query;
        if (!wallet) return res.status(400).json({ error: 'wallet is required' });
        const lower = wallet.toLowerCase();
        console.log(`[DB] Fetching assets for: ${lower}`);

        const [flows, txs] = await Promise.all([
            supabase.from('flow_links').select('*').ilike('creator_wallet', lower).order('created_at', { ascending: false }),
            supabase.from('transactions').select('*').or(`sender_wallet.ilike.${lower},recipient_wallet.ilike.${lower}`).order('created_at', { ascending: false })
        ]);

        console.log(`[DB] Assets flows: ${flows.data?.length || 0}, txs: ${txs.data?.length || 0}`);

        res.json({
            success: true,
            flows: flows.data || [],
            transactions: txs.data || []
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`ArcFlow backend running on http://localhost:${PORT}`);
    startBotServer();
});
