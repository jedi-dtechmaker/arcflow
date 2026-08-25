import React from "react";
import { LayoutDashboard, WalletCards, ArrowUpRight, Link2, User } from "lucide-react";

export function BottomNav({ path, navigate, onSend }) {
  const items = [
    { label: "Home", icon: LayoutDashboard, href: "/dashboard" },
    { label: "Assets", icon: WalletCards, href: "/assets" },
    { label: "Send", icon: ArrowUpRight, onClick: onSend, primary: true },
    { label: "Pay Me", icon: Link2, href: "/flow/new" },
    { label: "Menu", icon: User, href: "/profile" }
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pb-6 pt-2 px-4 pointer-events-none">
      <div className="flex w-full max-w-md items-center justify-between rounded-[2.5rem] bg-[#0a0916]/90 p-2 shadow-[0_20px_50px_rgba(0,0,0,0.7)] backdrop-blur-2xl pointer-events-auto border border-white/10">
        {items.map((item) => {
          const Icon = item.icon;
          const active = path === item.href;

          if (item.primary) {
            return (
              <button
                key={item.label}
                onClick={item.onClick}
                className="flex h-15 w-15 -translate-y-6 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 via-indigo-600 to-fuchsia-600 text-white shadow-[0_12px_25px_rgba(124,58,237,0.5)] border border-white/20 transition-transform hover:scale-110 active:scale-95"
                title="Quick Transfer"
              >
                <Icon className="h-7 w-7" />
              </button>
            );
          }

          return (
            <button
              key={item.label}
              onClick={() => navigate(item.href)}
              className={`flex flex-col items-center justify-center gap-1 px-3 py-1.5 transition-all ${
                active ? "text-violet-400 font-bold" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[9px] font-black uppercase tracking-tighter">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
