import { isSupabaseConfigured, supabase } from "@/lib/supabase";

function requireSupabase() {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured. Add your real VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env, then restart yarn dev.");
  }
}

export async function createPendingSend(input) {
  requireSupabase();
  const claimCode = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
  const isWalletRecipient = input.recipient.trim().startsWith("0x");
  let receiptId = null;

  if (input.receipt) {
    const bytes = await input.receipt.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const hash = `sha256:${Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
    const ext = input.receipt.name.split(".").pop() || "bin";
    const path = `${claimCode}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("receipts").upload(path, input.receipt, {
      contentType: input.receipt.type || "application/octet-stream"
    });
    if (uploadError) throw new Error(uploadError.message);
    const { data: receipt, error } = await supabase
      .from("receipts")
      .insert({
        storage_path: path,
        file_name: input.receipt.name,
        mime_type: input.receipt.type,
        byte_size: input.receipt.size,
        content_hash: hash
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    receiptId = receipt.id;
  }

  await upsertUser(input.senderPrivyId, input.senderWallet);
  const { data, error } = await supabase
    .from("transactions")
    .insert({
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
    })
    .select("id, claim_code, recipient_wallet")
    .single();
  if (error) throw new Error(error.message);
  return { id: data.id, claimCode: data.claim_code, recipientWallet: data.recipient_wallet ?? "" };
}

export async function markSendComplete(id, txHash, senderWallet) {
  requireSupabase();
  const { error } = await supabase
    .from("transactions")
    .update({ tx_hash: txHash, sender_wallet: senderWallet, status: "completed", completed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function claimPayment(claimCode, wallet, privyId) {
  requireSupabase();
  await upsertUser(privyId, wallet);
  const { error } = await supabase
    .from("transactions")
    .update({ recipient_wallet: wallet, recipient_privy_id: privyId, status: "claimed", claimed_at: new Date().toISOString() })
    .eq("claim_code", claimCode)
    .in("status", ["pending_claim", "completed"]);
  if (error) throw new Error(error.message);
}

export async function createFlowLink(input) {
  requireSupabase();
  await upsertUser(input.creatorPrivyId, input.creatorWallet);
  const slug = crypto.randomUUID().replaceAll("-", "").slice(0, 10);
  const { data, error } = await supabase
    .from("flow_links")
    .insert({ slug, creator_privy_id: input.creatorPrivyId, creator_wallet: input.creatorWallet, amount_usdc: input.amount, note: input.note, active: true })
    .select("slug")
    .single();
  if (error) throw new Error(error.message);
  return data.slug;
}

export async function getClaim(code) {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase
    .from("transactions")
    .select("id, amount_usdc, note, status, tx_hash, claim_code, recipient_identifier, receipt_id, receipts(storage_path, file_name, content_hash)")
    .eq("claim_code", code)
    .single();
  if (error) return null;
  return data;
}

export async function getDashboardRows(wallet) {
  if (!isSupabaseConfigured) return [];
  const lower = wallet.toLowerCase();
  const { data, error } = await supabase
    .from("transactions")
    .select("id, amount_usdc, note, status, tx_hash, claim_code, recipient_identifier, sender_wallet, recipient_wallet, receipt_id, created_at")
    .or(`sender_wallet.ilike.${lower},recipient_wallet.ilike.${lower}`)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getFlow(slug) {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase.from("flow_links").select("*").eq("slug", slug).eq("active", true).single();
  if (error) return null;
  return data;
}

export function receiptUrl(path) {
  return supabase.storage.from("receipts").getPublicUrl(path).data.publicUrl;
}

async function upsertUser(privyId, wallet) {
  requireSupabase();
  if (!privyId && !wallet) return;
  await supabase.from("users").upsert(
    {
      privy_id: privyId ?? wallet,
      wallet_address: wallet,
      updated_at: new Date().toISOString()
    },
    { onConflict: "privy_id" }
  );
}
