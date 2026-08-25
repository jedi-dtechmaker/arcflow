import React from "react";
import { ArrowUpRight, ArrowDownLeft, Plus, Link2, Copy, RefreshCcw, WalletCards } from "lucide-react";
import { useToast } from "@/components/ui/toast";

export function BalanceCard({
  balance,
  wallet,
  loading,
  onRefresh,
  onSend,
  onReceive,
  onFund,
  onPayMe
}) {
  const { toast } = useToast();

  const handleCopyWallet = () => {
    if (!wallet) return;
    navigator.clipboard.writeText(wallet);
    toast({ title: "Wallet Address Copied", description: wallet });
  };

  return (
    <div className="w-full">
      {/* Card Stack Container */}
      <div className="card-stack-container">
        {/* Card Stack Layers behind */}
        <div className="stacked-card-bg-2" />
        <div className="stacked-card-bg-1" />

        {/* Active Balance Card */}
        <div className="stacked-card-main p-6 sm:p-8 text-white relative">
          {/* Card Header */}
          <div className="flex items-center justify-between z-10 relative">
            <div className="flex items-center gap-3">
              <div className="flex h-9 items-center gap-2 rounded-full bg-black/20 px-3.5 py-1 backdrop-blur-md border border-white/10">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-widest text-white/90">Arc Testnet</span>
              </div>
            </div>

            <button
              onClick={onRefresh}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 backdrop-blur-md border border-white/10 transition-transform active:scale-95 hover:bg-white/20"
              title="Refresh Balance"
            >
              <RefreshCcw className={`h-4 w-4 text-white ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>

          {/* Main Balance Display */}
          <div className="mt-8 z-10 relative">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/70">Total Balance</p>
            <div className="mt-1 flex items-baseline gap-2">
              <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-white">
                ${balance || "0.00"}
              </h1>
              <span className="text-sm font-bold text-white/80 uppercase">USDC</span>
            </div>
          </div>

          {/* Card Details / Wallet Footer */}
          <div className="mt-8 pt-4 border-t border-white/15 flex items-center justify-between z-10 relative text-xs font-mono text-white/80">
            <div className="flex items-center gap-2">
              <WalletCards className="h-4 w-4 opacity-80" />
              <span>{wallet ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : "Wallet Ready"}</span>
            </div>
            <button
              onClick={handleCopyWallet}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/20 hover:bg-black/40 backdrop-blur border border-white/10 text-[10px] font-sans font-bold uppercase tracking-wider transition"
            >
              <Copy className="h-3 w-3" />
              <span>Copy</span>
            </button>
          </div>
        </div>
      </div>

      {/* Pill Action Buttons below Card */}
      <div className="mt-6 grid grid-cols-4 gap-2 sm:gap-3">
        <button
          onClick={onSend}
          className="flex flex-col items-center justify-center gap-2 py-3 px-2 rounded-2xl bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 text-violet-300 transition-all hover:scale-[1.02] active:scale-95 shadow-lg shadow-violet-600/10"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-violet-600 text-white shadow-md shadow-violet-600/40">
            <ArrowUpRight className="h-5 w-5" />
          </span>
          <span className="text-xs font-bold tracking-tight text-white">Send</span>
        </button>

        <button
          onClick={onReceive}
          className="flex flex-col items-center justify-center gap-2 py-3 px-2 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 transition-all hover:scale-[1.02] active:scale-95"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white border border-white/10">
            <ArrowDownLeft className="h-5 w-5" />
          </span>
          <span className="text-xs font-bold tracking-tight text-white">Receive</span>
        </button>

        <button
          onClick={onFund}
          className="flex flex-col items-center justify-center gap-2 py-3 px-2 rounded-2xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/20 text-emerald-400 transition-all hover:scale-[1.02] active:scale-95"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500 text-white shadow-md shadow-emerald-500/30">
            <Plus className="h-5 w-5" />
          </span>
          <span className="text-xs font-bold tracking-tight text-white">Add Funds</span>
        </button>

        <button
          onClick={onPayMe}
          className="flex flex-col items-center justify-center gap-2 py-3 px-2 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 transition-all hover:scale-[1.02] active:scale-95"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white border border-white/10">
            <Link2 className="h-5 w-5" />
          </span>
          <span className="text-xs font-bold tracking-tight text-white">Pay Link</span>
        </button>
      </div>
    </div>
  );
}
