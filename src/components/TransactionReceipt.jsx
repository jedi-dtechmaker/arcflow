import React from "react";
import { formatUsd } from "@/lib/format";

export function TransactionReceipt({ transaction, wallet }) {
    if (!transaction) return null;

    const isSender = transaction.sender_wallet?.toLowerCase() === wallet?.toLowerCase();
    const date = new Date(transaction.created_at).toLocaleString();

    return (
        <div id="receipt-content" className="w-[400px] p-8 text-white rounded-3xl" style={{ backgroundColor: '#05050a', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}>
            <div className="flex flex-col items-center text-center space-y-6">
                {/* Header */}
                <div className="space-y-2">
                    <div className="h-16 w-16 rounded-2xl flex items-center justify-center mx-auto" style={{ background: 'linear-gradient(to bottom right, #7c3aed, #db2777)' }}>
                        <span className="text-2xl font-black italic">A</span>
                    </div>
                    <h1 className="text-xl font-black tracking-widest uppercase">ArcFlow</h1>
                    <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#64748b' }}>Official Transaction Receipt</p>
                </div>

                <div className="w-full h-px" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }} />

                {/* Amount */}
                <div className="space-y-1">
                    <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#64748b' }}>Amount</p>
                    <h2 className="text-4xl font-black">{transaction.amount_usdc ? `$${Number(transaction.amount_usdc).toLocaleString()}` : "N/A"}</h2>
                    <p className="text-xs font-bold" style={{ color: '#10b981' }}>USDC</p>
                </div>

                {/* Details Table */}
                <div className="w-full space-y-4 text-left">
                    <div className="flex justify-between border-b pb-2" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                        <span className="text-[10px] font-black uppercase" style={{ color: '#64748b' }}>Status</span>
                        <span className="text-[10px] font-black uppercase" style={{ color: '#10b981' }}>{transaction.status}</span>
                    </div>
                    <div className="flex justify-between border-b pb-2" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                        <span className="text-[10px] font-black uppercase" style={{ color: '#64748b' }}>Type</span>
                        <span className="text-[10px] font-black uppercase" style={{ color: '#8b5cf6' }}>{transaction.type || 'transfer'}</span>
                    </div>
                    <div className="flex justify-between border-b pb-2" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                        <span className="text-[10px] font-black uppercase" style={{ color: '#64748b' }}>Date</span>
                        <span className="text-[10px] font-bold">{date}</span>
                    </div>
                    <div className="space-y-1">
                        <span className="text-[10px] font-black uppercase" style={{ color: '#64748b' }}>Sender</span>
                        <p className="text-[10px] font-mono break-all" style={{ color: '#cbd5e1' }}>{transaction.sender_wallet || "ArcFlow Faucet"}</p>
                    </div>
                    <div className="space-y-1">
                        <span className="text-[10px] font-black uppercase" style={{ color: '#64748b' }}>Recipient</span>
                        <p className="text-[10px] font-mono break-all" style={{ color: '#cbd5e1' }}>{transaction.recipient_wallet || transaction.recipient_identifier || "ArcFlow User"}</p>
                    </div>
                    {transaction.tx_hash && (
                        <div className="space-y-1">
                            <span className="text-[10px] font-black uppercase" style={{ color: '#64748b' }}>Transaction Hash</span>
                            <p className="text-[10px] font-mono break-all" style={{ color: '#8b5cf6' }}>{transaction.tx_hash}</p>
                        </div>
                    )}
                </div>

                <div className="w-full h-px" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }} />

                {/* Note */}
                <div className="w-full text-center">
                    <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: '#64748b' }}>Note</p>
                    <p className="text-sm font-bold italic" style={{ color: '#94a3b8' }}>"{transaction.note || "No note provided"}"</p>
                </div>

                {/* Footer info */}
                <div className="text-[8px] font-bold uppercase tracking-widest" style={{ color: '#475569' }}>
                    Verified on Arc Testnet • Secure & Decentralized
                </div>
            </div>
        </div>
    );
}
