import React, { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, User, ChevronRight, ReceiptText } from "lucide-react";
import { formatUsd } from "@/lib/format";

export function TransactionHistory({ rows = [], wallet, onSelectTx }) {
  const [tab, setTab] = useState("all"); // all | sent | received

  const filteredRows = rows.filter((row) => {
    if (tab === "all") return true;
    const isSent = row.sender_wallet?.toLowerCase() === wallet?.toLowerCase() && row.type !== "deposit";
    if (tab === "sent") return isSent;
    if (tab === "received") return !isSent || row.type === "deposit";
    return true;
  });

  return (
    <div className="w-full mt-8">
      {/* Header & Filter Tabs */}
      <div className="flex items-center justify-between px-1 mb-4">
        <h3 className="text-base font-black text-white">Transaction History</h3>
        <div className="flex items-center gap-1 bg-white/5 rounded-full p-1 border border-white/10">
          {["all", "sent", "received"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1 text-[10px] font-black uppercase tracking-wider rounded-full transition-all ${
                tab === t
                  ? "bg-violet-600 text-white shadow-md shadow-violet-600/30"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* List Container */}
      <div className="space-y-3">
        {filteredRows.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/10 p-10 text-center text-xs font-bold text-slate-500">
            No transactions found for this view.
          </div>
        ) : (
          filteredRows.slice(0, 15).map((row) => {
            const isSent = row.sender_wallet?.toLowerCase() === wallet?.toLowerCase() && row.type !== "deposit";
            const isLogin = row.type === "login";
            const isDeposit = row.type === "deposit";

            return (
              <article
                key={row.id}
                onClick={() => onSelectTx(row)}
                className="glass-card flex items-center justify-between gap-3 rounded-2xl p-4 transition-all hover:bg-white/[0.08] cursor-pointer group active:scale-[0.99]"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  {/* Icon Badge */}
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors ${
                      isLogin
                        ? "bg-violet-500/10 text-violet-400 border border-violet-500/20"
                        : isDeposit || !isSent
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : "bg-white/5 text-slate-400 border border-white/10"
                    }`}
                  >
                    {isLogin ? (
                      <User className="h-5 w-5" />
                    ) : isDeposit || !isSent ? (
                      <ArrowDownLeft className="h-5 w-5" />
                    ) : (
                      <ArrowUpRight className="h-5 w-5" />
                    )}
                  </div>

                  {/* Transaction Details */}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-white group-hover:text-violet-300 transition-colors">
                      {isLogin ? "Session Login" : row.note || row.recipient_identifier || "ArcFlow USDC Transfer"}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] font-semibold text-slate-400">
                        {new Date(row.created_at).toLocaleDateString([], { month: "short", day: "numeric" })}
                      </span>
                      <span className="h-1 w-1 rounded-full bg-slate-600" />
                      <span
                        className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded-full ${
                          row.status === "claimed" || row.status === "completed"
                            ? "text-emerald-400 bg-emerald-400/10"
                            : "text-amber-400 bg-amber-400/10"
                        }`}
                      >
                        {row.status || "completed"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Amount Readout */}
                <div className="shrink-0 text-right flex items-center gap-2">
                  <div>
                    {!isLogin && (
                      <p className={`text-base font-black ${!isSent || isDeposit ? "text-emerald-400" : "text-white"}`}>
                        {!isSent || isDeposit ? "+" : "-"} {formatUsd(row.amount_usdc || 0)}
                      </p>
                    )}
                    {isLogin && <p className="text-xs font-bold text-slate-500">—</p>}
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-600 group-hover:text-white transition" />
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
