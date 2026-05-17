import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import { createWalletClient, http, defineChain, parseUnits, erc20Abi, keccak256, encodePacked } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createClient } from '@supabase/supabase-js';
import multer from 'multer';
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

        const { error } = await supabase.auth.signInWithOtp({
            email,
            options: {
                shouldCreateUser: true
            }
        });

        if (error) throw error;
        res.json({ success: true, message: "OTP sent to your email" });
    } catch (error) {
        console.error('--- OTP SEND FAILURE ---');
        console.error('Error Object:', JSON.stringify(error, null, 2));
        console.error('Error Message:', error.message);
        res.status(500).json({
            error: error.message,
            hint: "Check Supabase Dashboard > Authentication > Logs for details."
        });
    }
});

// 2. Verify OTP
app.post('/api/auth/otp/verify', async (req, res) => {
    try {
        const { email, code } = req.body;
        if (!email || !code) return res.status(400).json({ error: 'Email and code are required' });

        // Try 'signup' type first
        let { data, error } = await supabase.auth.verifyOtp({
            email,
            token: code,
            type: 'signup'
        });

        // If that fails, try 'magiclink'
        if (error) {
            const retry = await supabase.auth.verifyOtp({
                email,
                token: code,
                type: 'magiclink'
            });
            data = retry.data;
            error = retry.error;
        }

        // Final fallback: try 'email' (some versions use this)
        if (error) {
            const retry = await supabase.auth.verifyOtp({
                email,
                token: code,
                type: 'email'
            });
            data = retry.data;
            error = retry.error;
        }

        if (error) throw error;
        handleSuccessfulAuth(res, email, data.user.id);
    } catch (error) {
        console.error('OTP Verify Error:', error);
        res.status(401).json({ error: 'Invalid or expired OTP' });
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
            wallet_address: address.toLowerCase(),
            updated_at: new Date().toISOString()
        }, { onConflict: 'privy_id' });

        if (error) throw error;

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

function handleSuccessfulAuth(res, email, supabaseUid) {
    const wallet = getManagedWallet(email);
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
});
