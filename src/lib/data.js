import { isSupabaseConfigured, supabase } from "@/lib/supabase";

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || "http://localhost:3001").replace(/\/$/, "");

async function api(path, method = "GET", body = null) {
  const options = {
    method,
    headers: { "Content-Type": "application/json" }
  };
  if (body) options.body = JSON.stringify(body);
  const response = await fetch(`${BACKEND_URL}${path}`, options);

  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to communicate with backend");
    return data;
  } else {
    // If not JSON, it's likely a 404/500 HTML page from the frontend host
    throw new Error(`Invalid Response from Backend (${response.status}). Ensure VITE_BACKEND_URL is set correctly in your production .env.`);
  }
}

export async function createPendingSend(input) {
  const claimCode = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
  const isWalletRecipient = input.recipient.trim().startsWith("0x");
  let receiptId = null;

  if (input.receipt) {
    const bytes = await input.receipt.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const hash = `sha256:${Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
    const ext = input.receipt.name.split(".").pop() || "bin";
    const path = `${claimCode}/${crypto.randomUUID()}.${ext}`;

    // Upload via Backend Proxy
    const formData = new FormData();
    formData.append("file", input.receipt);
    formData.append("path", path);

    const uploadResponse = await fetch(`${BACKEND_URL}/api/db/storage/upload`, {
      method: "POST",
      body: formData
    });
    const uploadData = await uploadResponse.json();
    if (!uploadResponse.ok) throw new Error(uploadData.error || "Upload failed");

    // Save metadata via Backend Proxy
    const receiptData = await api("/api/db/receipts", "POST", {
      storage_path: path,
      file_name: input.receipt.name,
      mime_type: input.receipt.type,
      byte_size: input.receipt.size,
      content_hash: hash
    });
    receiptId = receiptData.data.id;
  }

  await upsertUser(input.senderPrivyId, input.senderWallet);
  const res = await api("/api/db/transaction", "POST", {
    sender_privy_id: input.senderPrivyId,
    sender_wallet: input.senderWallet,
    recipient_identifier: input.recipient.trim(),
    recipient_wallet: isWalletRecipient ? input.recipient.trim() : null,
    amount_usdc: input.amount,
    target_asset: input.targetAsset || "USDC",
    note: input.note || "",
    receipt_id: receiptId,
    claim_code: claimCode,
    status: isWalletRecipient ? "sending" : "pending_claim"
  });

  return { id: res.data.id, claimCode: res.data.claim_code, recipientWallet: res.data.recipient_wallet ?? "" };
}

export async function markSendComplete(id, txHash, senderWallet) {
  await api("/api/db/transaction", "POST", {
    id,
    tx_hash: txHash,
    sender_wallet: senderWallet,
    status: "completed",
    completed_at: new Date().toISOString()
  });
}

export async function claimPayment(claimCode, wallet, privyId) {
  await upsertUser(privyId, wallet);
  await api("/api/db/claim/update", "POST", {
    claim_code: claimCode,
    recipient_wallet: wallet,
    recipient_privy_id: privyId,
    status: "claimed",
    claimed_at: new Date().toISOString()
  });
}

export async function createFlowLink(input) {
  await upsertUser(input.creatorPrivyId, input.creatorWallet);
  const slug = crypto.randomUUID().replaceAll("-", "").slice(0, 10);
  const res = await api("/api/db/flow-link", "POST", {
    slug,
    creator_privy_id: input.creatorPrivyId,
    creator_wallet: input.creatorWallet,
    amount_usdc: input.amount,
    note: input.note,
    active: true
  });
  return res.data.slug;
}

export async function getClaim(code) {
  try {
    const res = await api(`/api/db/claim/${code}`);
    return res.data;
  } catch {
    return null;
  }
}

export async function getDashboardRows(wallet) {
  try {
    const res = await api(`/api/db/history?wallet=${wallet}`);
    return res.data ?? [];
  } catch (err) {
    console.warn("Fetch history failed:", err.message);
    return [];
  }
}

export async function getFlow(slug) {
  try {
    const res = await api(`/api/db/flow-link/${slug}`);
    return res.data;
  } catch {
    return null;
  }
}

export function receiptUrl(path) {
  return `https://bmufgvvqtukhiceukhot.supabase.co/storage/v1/object/public/receipts/${path}`;
}

export async function saveWalletToUser(userId, wallet) {
  await upsertUser(userId, wallet);
}

export async function getUserAssets(wallet) {
  try {
    const res = await api(`/api/db/user/assets?wallet=${wallet}`);
    return {
      flows: res.flows || [],
      transactions: res.transactions || []
    };
  } catch (err) {
    console.warn("Fetch user assets failed:", err.message);
    return { flows: [], transactions: [] };
  }
}

async function upsertUser(id, wallet) {
  if (!id && !wallet) return;
  try {
    await api("/api/db/user", "POST", { id, wallet_address: wallet });
  } catch (err) {
    console.warn("User upsert failed:", err.message);
  }
}
