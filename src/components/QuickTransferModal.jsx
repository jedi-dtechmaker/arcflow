import React, { useState, useMemo } from "react";
import { X, Send, Link2, FileImage, Loader2, ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";

export function QuickTransferModal({
  onClose,
  initialRecipient = "",
  initialAmount = "",
  initialNote = "",
  wallet,
  onSendMoney,
  busy
}) {
  const { toast } = useToast();
  const [recipient, setRecipient] = useState(initialRecipient);
  const [amount, setAmount] = useState(initialAmount || "50");
  const [note, setNote] = useState(initialNote || "");
  const [useLink, setUseLink] = useState(false);
  const [receipt, setReceipt] = useState(null);

  const numericAmount = useMemo(() => {
    const parsed = parseFloat(amount);
    return isNaN(parsed) ? 0 : parsed;
  }, [amount]);

  const avatarUrl = useMemo(() => {
    const seed = recipient.trim() || "Recipient";
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}&backgroundColor=b6e3f4,c0aede,d1d4f9`;
  }, [recipient]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (numericAmount <= 0) {
      toast({ title: "Please enter an amount", tone: "error" });
      return;
    }
    if (!useLink && !recipient.trim()) {
      toast({ title: "Please specify a recipient", tone: "error" });
      return;
    }
    onSendMoney({
      amount: numericAmount,
      recipient: useLink ? "Claim Link" : recipient,
      note,
      receipt,
      useLink
    });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-xl p-0 sm:p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div
        className="w-full max-w-md max-h-[92dvh] overflow-y-auto rounded-t-[2.5rem] sm:rounded-[2.5rem] border border-white/10 bg-[#090814] shadow-2xl animate-in slide-in-from-bottom duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 sm:p-8">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <h2 className="text-xl font-black text-white tracking-tight">Quick Transfer</h2>
            <button
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-slate-400 hover:text-white transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            {/* Recipient Contact Card */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 flex items-center gap-3">
              <img
                src={avatarUrl}
                alt="Recipient"
                className="h-12 w-12 rounded-xl object-cover border border-white/10 bg-white/10"
              />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">To Recipient</p>
                {useLink ? (
                  <p className="text-sm font-bold text-emerald-400">Shareable Claim Link</p>
                ) : (
                  <Input
                    type="text"
                    placeholder="email, phone, @handle or 0x wallet"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    className="h-9 border-none bg-transparent p-0 text-sm font-bold text-white focus-visible:ring-0 placeholder:text-slate-600"
                  />
                )}
              </div>
            </div>

            {/* Toggle Link Mode */}
            <button
              type="button"
              onClick={() => setUseLink(!useLink)}
              className={`w-full flex items-center justify-between p-3.5 rounded-xl border transition-all text-xs font-bold ${
                useLink ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-white/5 border-white/5 text-slate-400 hover:bg-white/10"
              }`}
            >
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                <span>Send via Claim Link (No recipient wallet needed)</span>
              </div>
              <div className={`h-4 w-8 rounded-full p-0.5 transition-colors ${useLink ? "bg-emerald-500" : "bg-slate-700"}`}>
                <div className={`h-3 w-3 rounded-full bg-white transition-transform ${useLink ? "translate-x-4" : "translate-x-0"}`} />
              </div>
            </button>

            {/* Source Card Selector */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">Source Card / Wallet</p>
              <div className="flex items-center justify-between text-xs font-bold text-white">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-violet-500" />
                  <span>Arc Testnet Embedded Wallet</span>
                </div>
                <span className="font-mono text-slate-400">
                  {wallet ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : "Ready"}
                </span>
              </div>
            </div>

            {/* Amount Entry */}
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-wider text-slate-500 ml-1">Enter Amount</Label>
              <div className="relative flex items-center rounded-2xl border border-white/10 bg-white/5 p-4 focus-within:border-violet-500/50 transition">
                <span className="text-3xl font-black text-violet-400 mr-2">$</span>
                <input
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-transparent text-3xl font-black text-white outline-none placeholder:text-slate-700"
                />
                <span className="text-xs font-black uppercase tracking-widest text-slate-500">USDC</span>
              </div>

              {/* Amount Quick Preset Chips */}
              <div className="flex gap-2 pt-1">
                {["10", "50", "100", "500"].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setAmount(preset)}
                    className={`flex-1 py-1.5 rounded-xl text-xs font-bold border transition ${
                      amount === preset
                        ? "bg-violet-600 border-violet-500 text-white"
                        : "bg-white/5 border-white/5 text-slate-400 hover:bg-white/10"
                    }`}
                  >
                    ${preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Note Field */}
            <div className="space-y-1">
              <Label className="text-[10px] font-black uppercase tracking-wider text-slate-500 ml-1">Add a note (optional)</Label>
              <Textarea
                placeholder="e.g. groceries, freelance payment, design work..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="min-h-[70px] rounded-xl border-white/10 bg-white/5 p-3 text-xs font-medium text-white focus:border-violet-500/50"
              />
            </div>

            {/* File Proof Attachment */}
            <label className="flex items-center justify-between rounded-xl border border-dashed border-white/15 bg-white/5 p-3 text-xs cursor-pointer hover:bg-white/10 transition">
              <div className="flex items-center gap-2 text-slate-300 truncate">
                <FileImage className="h-4 w-4 text-violet-400 shrink-0" />
                <span className="truncate">{receipt ? receipt.name : "Attach proof (PDF or Image)"}</span>
              </div>
              <span className="text-[9px] font-black text-slate-500 uppercase">Optional</span>
              <input type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => setReceipt(e.target.files?.[0] || null)} />
            </label>

            {/* Fee & Summary Breakdown */}
            <div className="rounded-2xl bg-white/[0.03] p-4 border border-white/5 space-y-2 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Network fee (Arc Testnet)</span>
                <span className="text-emerald-400 font-bold">$0.00 USDC</span>
              </div>
              <div className="flex justify-between font-bold text-white pt-2 border-t border-white/5">
                <span>Total amount</span>
                <span className="text-base text-violet-300">${numericAmount.toFixed(2)} USDC</span>
              </div>
            </div>

            {/* Submit Action Button */}
            <Button
              type="submit"
              disabled={busy}
              className="h-14 w-full rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-black text-base shadow-xl shadow-violet-600/30 transition-all hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-2"
            >
              {busy ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <>
                  <span>Send ${numericAmount.toFixed(2)} USDC</span>
                  <ArrowRight className="h-5 w-5" />
                </>
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
