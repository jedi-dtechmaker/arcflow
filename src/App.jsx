import { useEffect, useMemo, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileImage,
  FileText,
  HomeIcon,
  LayoutDashboard,
  Link2,
  Loader2,
  Menu,
  Plus,
  ReceiptText,
  RefreshCcw,
  Send,
  User,
  WalletCards,
  X,
  Bell,
  LogOut,
  Shield,
  Globe,
  Smartphone,
  Settings,
  ChevronRight
} from "lucide-react";
import { createPublicClient, erc20Abi, formatUnits, http } from "viem";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { arcTestnet, ARC_RPC_URL, USDC_ADDRESS } from "@/lib/arc";
import { sendUsdcOnArc } from "@/lib/circle";
import { claimPayment, createFlowLink, createPendingSend, getClaim, getDashboardRows, getFlow, markSendComplete, receiptUrl } from "@/lib/data";
import { formatUsd, makeClaimUrl, makeExplorerUrl, makeFlowUrl } from "@/lib/format";
import { makeTinyPdf } from "@/lib/pdf";
import { isSupabaseConfigured } from "@/lib/supabase";

const fxRates = { USDC: 1, EURC: 0.92, BRLA: 5.12, MXN: 16.8, NGN: 1450 };
const ARC_FAUCET_URL = "https://faucet.circle.com";

function walletAddressFrom(user, wallets) {
  return (
    wallets?.find((item) => item.walletClientType === "privy")?.address ||
    wallets?.[0]?.address ||
    user?.wallet?.address ||
    user?.linkedAccounts?.find((account) => account.type === "wallet")?.address ||
    ""
  );
}

function openFaucet() {
  window.open(ARC_FAUCET_URL, "_blank", "noopener,noreferrer");
}

function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function AppPage({ children }) {
  return <main className="mx-auto flex min-h-[calc(100vh-9rem)] max-w-xl items-center px-4 py-6">{children}</main>;
}

function Avatar({ seed, size = "md" }) {
  const sizes = {
    sm: "h-10 w-10",
    md: "h-14 w-14",
    lg: "h-20 w-20",
    xl: "h-24 w-24"
  };

  // Using DiceBear for premium, randomly generated avatars
  const avatarUrl = `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(seed || 'ArcFlow')}&backgroundColor=6366f1,a855f7,ec4899`;

  return (
    <div className={`shrink-0 overflow-hidden rounded-2xl bg-white/5 border border-white/10 shadow-2xl ${sizes[size]}`}>
      <img 
        src={avatarUrl} 
        alt="Avatar" 
        className="h-full w-full object-cover"
        onError={(e) => {
          e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(seed || 'A')}&background=random`;
        }}
      />
    </div>
  );
}

function SettingsItem({ icon: Icon, label, value, onClick }) {
  return (
    <button 
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-2xl bg-white/5 p-4 border border-white/5 transition hover:bg-white/[0.08] active:scale-[0.98]"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-slate-400">
          <Icon className="h-5 w-5" />
        </span>
        <span className="text-sm font-bold text-slate-300">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-black text-violet-400 uppercase tracking-widest">{value}</span>
        <ChevronRight className="h-4 w-4 text-slate-600" />
      </div>
    </button>
  );
}

function CenteredCard({ children }) {
  return <AppPage><section className="w-full rounded-[2rem] border border-white/10 bg-[#141225] p-6 text-center shadow-xl shadow-black/20">{children}</section></AppPage>;
}

function Field({ label, children }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function MiniFeature({ icon: Icon, title, text }) {
  return (
    <div className="flex gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/10">
        <Icon className="h-5 w-5 text-violet-300" />
      </span>
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-sm text-slate-500">{text}</span>
      </span>
    </div>
  );
}

function LandingCard({ icon: Icon, title, text }) {
  return (
    <article className="rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-xl shadow-black/10">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-200">
        <Icon className="h-6 w-6" />
      </span>
      <h3 className="mt-5 text-xl font-semibold text-white">{title}</h3>
      <p className="mt-2 leading-7 text-slate-400">{text}</p>
    </article>
  );
}

function ProofMetric({ value, label }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-2xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-sm leading-5 text-slate-400">{label}</p>
    </div>
  );
}

function ProofStep({ icon: Icon, title, text }) {
  return (
    <div className="flex gap-4 rounded-2xl bg-[#0c0b19]/70 p-4">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-200">
        <Icon className="h-5 w-5" />
      </span>
      <span>
        <span className="block font-semibold text-white">{title}</span>
        <span className="mt-1 block text-sm leading-6 text-slate-400">{text}</span>
      </span>
    </div>
  );
}

function CapabilityTile({ title, text }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <p className="font-semibold text-white">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-400">{text}</p>
    </div>
  );
}

function DashboardAction({ icon: Icon, label, onClick }) {
  return (
    <button onClick={onClick} className="grid justify-items-center gap-3">
      <span className="flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-white/5 text-violet-300 shadow-lg shadow-black/10 transition hover:bg-white/10 sm:h-24 sm:w-24">
        <Icon className="h-7 w-7" />
      </span>
      <span className="text-base font-semibold text-white sm:text-lg">{label}</span>
    </button>
  );
}

function SuccessState({ result, navigate }) {
  return (
    <div className="arc-pop flex min-h-[34rem] flex-col justify-center gap-5 text-center">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-violet-500/15 text-violet-200">
        <CheckCircle2 className="h-10 w-10" />
      </div>
      <div>
        <h2 className="text-3xl font-semibold">{result.txHash ? "Money sent" : "Claim link ready"}</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">
          {result.txHash ? "Your on-chain proof and receipt metadata are saved." : "Share this link so the recipient can attach a wallet for payout."}
        </p>
      </div>
      {result.txHash ? (
        <a className="break-all rounded-2xl bg-white/5 p-4 text-sm" href={makeExplorerUrl(result.txHash)} target="_blank">
          {result.txHash}
        </a>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Button variant="secondary" className="h-12 rounded-2xl" onClick={() => navigator.clipboard.writeText(makeClaimUrl(result.claimCode))}>
          <Copy className="h-4 w-4" />
          Copy link
        </Button>
        <Button className="h-12 rounded-2xl" onClick={() => navigate("/dashboard")}>
          View activity
          <ArrowUpRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function TopBar({ navigate, notifications, onClear }) {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets } = useWallets();
  const [showNotifs, setShowNotifs] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const wallet = walletAddressFrom(user, wallets);
  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <header className="fixed inset-x-0 top-0 z-50 flex h-20 items-center border-b border-white/5 bg-[#05050a]/60 backdrop-blur-2xl">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6">
        <button onClick={() => navigate("/")} className="flex items-center gap-3 transition-transform hover:scale-105 active:scale-95">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-xl shadow-violet-600/30">
            <WalletCards className="h-6 w-6" />
          </span>
        </button>

        <div className="flex items-center gap-4">
          <button className="hidden text-sm font-bold text-slate-400 transition-colors hover:text-white sm:inline-flex" onClick={() => navigate("/dashboard")}>Dashboard</button>
          
          <div className="relative">
            <button 
              onClick={() => { setShowNotifs(!showNotifs); setShowAccount(false); }}
              className={`flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-slate-400 transition-all hover:bg-white/10 hover:text-white ${unreadCount > 0 ? "text-violet-400" : ""}`}
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && <span className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-violet-600 text-[10px] font-bold text-white flex items-center justify-center border-2 border-[#05050a]">{unreadCount}</span>}
            </button>

            {showNotifs && (
              <div className="absolute right-0 mt-3 w-80 overflow-hidden rounded-[2rem] border border-white/10 bg-[#0a0a0f]/95 shadow-2xl backdrop-blur-3xl animate-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between border-b border-white/5 p-5">
                  <h3 className="text-sm font-black text-white uppercase tracking-widest">Notifications</h3>
                  <button onClick={onClear} className="text-[10px] font-black text-violet-400 hover:text-violet-300">Clear all</button>
                </div>
                <div className="max-h-96 overflow-y-auto p-2">
                  {notifications.length === 0 ? (
                    <div className="py-12 text-center text-[10px] font-black uppercase tracking-widest text-slate-600">All caught up</div>
                  ) : (
                    notifications.map(n => (
                      <div key={n.id} className="flex gap-4 rounded-2xl p-4 transition hover:bg-white/5">
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${n.type === "received" ? "bg-emerald-500/10 text-emerald-400" : "bg-violet-500/10 text-violet-400"}`}>
                          {n.type === "received" ? <ArrowDownLeft className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-white">{n.title}</p>
                          <p className="mt-1 text-xs text-slate-500 line-clamp-2">{n.message}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="h-4 w-px bg-white/10 hidden sm:block" />
          
          <div className="relative">
            <Button 
              variant={authenticated ? "secondary" : "default"} 
              onClick={() => {
                if (authenticated) {
                  setShowAccount(!showAccount);
                  setShowNotifs(false);
                } else {
                  login();
                }
              }} 
              disabled={!ready} 
              className="h-11 rounded-xl px-5 font-bold shadow-xl transition-all"
            >
              {authenticated ? (wallet ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : "SETUP") : "CONNECT"}
            </Button>

            {showAccount && (
              <div className="absolute right-0 mt-3 w-56 overflow-hidden rounded-3xl border border-white/10 bg-[#0a0a0f]/95 p-2 shadow-2xl backdrop-blur-3xl animate-in zoom-in-95 duration-200">
                <div className="mb-2 p-4 pb-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Account</p>
                  <p className="mt-1 truncate text-xs font-bold text-white opacity-60">{user?.email?.address || "Active Session"}</p>
                </div>
                <button 
                  onClick={logout}
                  className="flex w-full items-center gap-3 rounded-2xl p-4 text-sm font-bold text-red-400 transition hover:bg-red-500/10"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

function BottomNav({ path, navigate, onSend }) {
  const items = [
    { label: "Home", icon: LayoutDashboard, href: "/dashboard" },
    { label: "Assets", icon: WalletCards, href: "/profile" },
    { label: "Send", icon: ArrowUpRight, onClick: onSend, primary: true },
    { label: "Pay Me", icon: Link2, href: "/flow/new" },
    { label: "Menu", icon: User, href: "/profile" }
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pb-8 pt-2 px-4 pointer-events-none">
      <div className="flex w-full max-w-md items-center justify-between rounded-[2.5rem] bg-[#0a0a0f]/90 p-2 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-3xl pointer-events-auto border border-white/5">
        {items.map((item) => {
          const Icon = item.icon;
          const active = path === item.href;
          if (item.primary) {
            return (
              <button
                key={item.label}
                onClick={item.onClick}
                className="flex h-16 w-16 -translate-y-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-[0_15px_30px_rgba(139,92,246,0.4)] transition-transform hover:scale-110 active:scale-95"
              >
                <Icon className="h-8 w-8" />
              </button>
            );
          }
          return (
            <button
              key={item.label}
              onClick={() => navigate(item.href)}
              className={`flex flex-col items-center justify-center gap-1.5 px-4 py-2 transition-all ${active ? "text-violet-400" : "text-slate-500 hover:text-slate-300"}`}
            >
              <Icon className="h-6 w-6" />
              <span className="text-[10px] font-black uppercase tracking-tighter">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function ProfilePage() {
  const { authenticated, ready, login, logout, user } = usePrivy();
  const { wallets } = useWallets();
  const { toast } = useToast();
  const wallet = walletAddressFrom(user, wallets);
  const email = user?.email?.address || "No email connected";
  const displayName = user?.email?.address?.split("@")[0] || "User";

  async function copyWallet() {
    if (!wallet) return;
    await navigator.clipboard.writeText(wallet);
    toast({ title: "Wallet address copied" });
  }

  if (!authenticated) return (
    <CenteredCard>
      <div className="py-8">
        <h1 className="text-2xl font-black text-white">Your Profile</h1>
        <p className="mt-3 text-sm text-slate-500">Connect to view your wallet details.</p>
        <Button className="mt-6 h-14 w-full rounded-2xl font-bold shadow-xl shadow-violet-600/20" onClick={login} disabled={!ready}>Connect Wallet</Button>
      </div>
    </CenteredCard>
  );

  return (
    <div className="mx-auto max-w-lg px-6 pb-32 pt-28">
      <section className="glass-card overflow-hidden rounded-[2.5rem] p-8">
        <div className="flex items-center gap-5">
          <Avatar seed={displayName} size="lg" />
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-400">Verified User</p>
            <h1 className="truncate text-2xl font-black text-white">{displayName}</h1>
          </div>
        </div>

        <div className="mt-10 space-y-4">
          <div className="rounded-2xl bg-white/5 p-5 border border-white/5">
            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Linked Email</Label>
            <p className="mt-1 break-all text-lg font-bold text-white">{email}</p>
          </div>
          
          <div className="rounded-2xl bg-white/5 p-5 border border-white/5">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Active Wallet</Label>
              <span className="text-[10px] font-black uppercase tracking-tighter text-emerald-400">On-Chain</span>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <p className="min-w-0 flex-1 break-all font-mono text-xs font-bold text-slate-400">{wallet || "Provisioning..."}</p>
              <button className="text-violet-400 hover:text-white transition" onClick={copyWallet} disabled={!wallet}>
                <Copy className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="mt-10 space-y-3">
           <h3 className="px-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Wallet Settings</h3>
           <SettingsItem icon={Shield} label="Security" value="FaceID" onClick={() => toast({ title: "Security Settings", description: "Biometric authentication is managed by your device." })} />
           <SettingsItem icon={Globe} label="Network" value="Arc Testnet" onClick={() => toast({ title: "Network", description: "You are currently on Arc Testnet (Layer 2)." })} />
           <SettingsItem icon={Smartphone} label="Connected Apps" value="Manage" onClick={() => toast({ title: "Coming Soon", description: "Connected apps management will be available in the next update." })} />
        </div>

        <Button variant="secondary" className="mt-10 h-14 w-full rounded-2xl border border-white/5 bg-white/5 font-bold transition-all hover:bg-red-500/10 hover:text-red-400" onClick={logout}>
          Sign Out
        </Button>
      </section>
    </div>
  );
}

function Dashboard({ navigate, addNotification }) {
  const { authenticated, login, user } = usePrivy();
  const { wallets } = useWallets();
  const wallet = walletAddressFrom(user, wallets);
  const [tab, setTab] = useState("sent");
  const [rows, setRows] = useState([]);
  const [balance, setBalance] = useState("0.00");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (wallet) refresh();
  }, [wallet]);

  async function refresh() {
    if (!wallet || !isSupabaseConfigured) return;
    setLoading(true);
    try {
      const client = createPublicClient({ chain: arcTestnet, transport: http(ARC_RPC_URL) });
      const [dashboardRows, erc20Balance, nativeBalance] = await Promise.all([
        getDashboardRows(wallet).catch((err) => {
          console.warn("Could not fetch activity from Supabase (tables might be missing):", err.message);
          return [];
        }),
        client.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [wallet] }).catch(() => 0n),
        client.getBalance({ address: wallet }).catch(() => 0n)
      ]);
      setRows(dashboardRows);
      
      const erc20Formatted = Number(formatUnits(erc20Balance, 6));
      const nativeFormatted = Number(formatUnits(nativeBalance, 18));
      const totalBalance = Math.max(erc20Formatted, nativeFormatted);
      
      const newBalanceStr = totalBalance.toLocaleString(undefined, { maximumFractionDigits: 2 });
      
      // Notify if balance increased
      if (balance !== "0.00" && totalBalance > Number(balance.replace(/,/g, ''))) {
        addNotification({
          type: "received",
          title: "Payment Received",
          message: `You just received a deposit! New balance: $${newBalanceStr}`
        });
      }

      setBalance(newBalanceStr);
    } catch (err) {
      console.error("Failed to refresh balance:", err);
    } finally {
      setLoading(false);
    }
  }

  if (!authenticated) return <CenteredCard><h1 className="text-3xl font-semibold text-white">Your ArcFlow dashboard</h1><p className="mt-2 text-slate-500">Login once to see sent payments, claims, and receipts.</p><Button className="mt-6 h-12 w-full rounded-2xl" onClick={login}>Login</Button></CenteredCard>;
  const visible = rows.filter((row) => (tab === "sent" ? row.sender_wallet?.toLowerCase() === wallet?.toLowerCase() : row.recipient_wallet?.toLowerCase() === wallet?.toLowerCase()));

  const displayName = user?.email?.address?.split("@")[0] || "ArcFlow User";

  return (
    <main className="min-h-screen bg-[#05050a] pb-40 pt-20">
      <div className="mx-auto max-w-7xl lg:px-8 lg:pt-12">
        <div className="grid gap-0 lg:grid-cols-[1fr_1.2fr] lg:gap-12 lg:pt-12">
          
          {/* Left Column: Immersive Header & Assets */}
          <div className="space-y-0 lg:space-y-8">
            <section className="relative mesh-gradient overflow-hidden pb-16 pt-10 text-center text-white shadow-2xl lg:rounded-[3rem] lg:pb-12">
              <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/40" />
              
              <div className="relative z-10 mx-auto max-w-lg px-6">
                <div className="flex items-center justify-between opacity-90">
                  <Avatar seed={displayName} size="md" />
                  <div className="flex h-10 items-center gap-2 rounded-full bg-white/10 px-4 backdrop-blur">
                    <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Arc Testnet</span>
                  </div>
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 backdrop-blur">
                    <RefreshCcw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} onClick={refresh} />
                  </span>
                </div>

                <div className="mt-10 animate-fade-in-up">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-50">Current Balance</p>
                  <h1 className="mt-2 text-5xl font-black tracking-tight sm:text-6xl">${balance}</h1>
                  <div className="mx-auto mt-5 flex w-fit items-center gap-2 rounded-full bg-white/10 px-3 py-1 backdrop-blur-xl">
                    <WalletCards className="h-3.5 w-3.5 opacity-60" />
                    <span className="text-[9px] font-black uppercase tracking-widest opacity-80">Accounts</span>
                  </div>
                </div>

                <div className="mt-12 flex justify-around gap-2 animate-fade-in-up [animation-delay:200ms]">
                  <HeaderAction icon={Plus} label="Add" onClick={openFaucet} />
                  <HeaderAction icon={ArrowUpRight} label="Send" onClick={() => navigate("/send")} />
                  <HeaderAction icon={Link2} label="Pay Me" onClick={() => navigate("/flow/new")} />
                  <HeaderAction icon={Download} label="Withdraw" onClick={() => setShowWithdraw(true)} />
                </div>
              </div>
            </section>

            <div className="mx-auto max-w-lg px-6 lg:max-w-none lg:px-0">
              <section className="glass-card -translate-y-8 animate-fade-in-up overflow-hidden rounded-[2.5rem] p-6 [animation-delay:400ms] lg:translate-y-0">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="text-xl font-black text-white">Receive assets</h3>
                    <p className="mt-1 text-sm font-medium text-slate-500">Copy your unique address to receive money.</p>
                  </div>
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-600/10 text-violet-400">
                    <WalletCards className="h-6 w-6" />
                  </span>
                </div>
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(wallet);
                    toast({ title: "Address Copied!" });
                  }}
                  className="mt-6 flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-violet-600 font-black text-white shadow-xl shadow-violet-600/40 transition-transform active:scale-95"
                >
                  <Copy className="h-5 w-5" />
                  Copy Address
                </button>
              </section>
            </div>
          </div>

          {/* Right Column: History */}
          <div className="mx-auto w-full max-w-lg px-6 lg:max-w-none lg:px-0">
            <section className="mt-4 lg:mt-0">
              <div className="flex items-center justify-between px-2">
                <h2 className="text-2xl font-black text-white">History</h2>
                <button className="text-[10px] font-black text-violet-400 uppercase tracking-[0.2em] hover:text-violet-300 transition-colors">See All Activity</button>
              </div>

              <div className="mt-6 space-y-4">
                {visible.length === 0 ? <div className="rounded-[2.5rem] border border-dashed border-white/10 p-12 text-center text-sm font-bold text-slate-600">No activity found.</div> : null}
                {visible.map((row) => (
                  <article key={row.id} className="glass-card flex items-center justify-between gap-4 rounded-[2rem] p-5 transition-all hover:bg-white/[0.08] group">
                    <div className="flex min-w-0 items-center gap-4">
                      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${tab === "sent" ? "bg-white/5 text-slate-400" : "bg-emerald-500/10 text-emerald-400"} transition-colors group-hover:bg-violet-500/10 group-hover:text-violet-400`}>
                        {tab === "sent" ? <ArrowUpRight className="h-6 w-6" /> : <ArrowDownLeft className="h-6 w-6" />}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-base font-black text-white group-hover:text-violet-300 transition-colors">{row.note || row.recipient_identifier || "ArcFlow Payment"}</p>
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">{new Date(row.created_at).toLocaleDateString([], { month: "short", day: "numeric" })} • {row.status}</p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-lg font-black text-white">{tab === "sent" ? "-" : "+"} {formatUsd(row.amount_usdc)}</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

function HeaderAction({ icon: Icon, label, onClick }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-2.5 group">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-white shadow-lg backdrop-blur-xl transition-all group-hover:bg-white/20 group-hover:scale-105 group-active:scale-95">
        <Icon className="h-6 w-6" />
      </span>
      <span className="text-[9px] font-black uppercase tracking-widest opacity-60">{label}</span>
    </button>
  );
}

function SetupNotice() {
  return (
    <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100">
      Supabase is still using placeholder keys. Add your real `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env`, then restart `yarn dev`.
    </div>
  );
}

function ClaimPage({ code, addNotification }) {
  const { authenticated, login, user } = usePrivy();
  const { wallets } = useWallets();
  const { toast } = useToast();
  const [transaction, setTransaction] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getClaim(code).then(setTransaction);
  }, [code]);

  async function handleClaim() {
    if (!authenticated) return login();
    const wallet = wallets[0]?.address;
    if (!wallet) return toast({ title: "Wallet is still provisioning", tone: "error" });
    setBusy(true);
    try {
      await claimPayment(code, wallet, user?.id);
      const next = await getClaim(code);
      setTransaction(next);
      toast({ title: "Claim attached", description: "Your wallet is now linked to this proof." });
      addNotification({
        type: "claimed",
        title: "Payment Claimed",
        message: `Success! You've successfully claimed ${formatUsd(transaction.amount_usdc)}.`
      });
    } catch (error) {
      toast({ title: "Claim failed", description: error instanceof Error ? error.message : "Try again.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  if (!transaction) return <CenteredCard><div className="py-20 text-xl font-bold">This claim link was not found.</div></CenteredCard>;
  return (
    <div className="mx-auto max-w-2xl px-4 pb-40 pt-28">
      <section className="glass-card overflow-hidden rounded-[3rem] p-8 text-center sm:p-12">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[2rem] bg-emerald-500/10 text-emerald-400 shadow-2xl shadow-emerald-500/20">
          <ArrowDownLeft className="h-10 w-10" />
        </div>
        <div className="mt-10">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-400">Payment Proof</p>
          <h1 className="mt-4 text-6xl font-black text-white">{formatUsd(transaction.amount_usdc)}</h1>
          <p className="mx-auto mt-4 max-w-sm text-lg font-bold text-slate-400">{transaction.note || "Unspecified purpose"}</p>
        </div>

        <div className="mt-12 grid gap-4">
          {transaction.tx_hash ? (
            <a className="flex h-16 items-center justify-center gap-3 rounded-2xl bg-white/5 font-bold text-white transition hover:bg-white/10" href={makeExplorerUrl(transaction.tx_hash)} target="_blank">
              <ExternalLink className="h-5 w-5 text-violet-400" />
              Verify on ArcScan
            </a>
          ) : (
            <div className="rounded-2xl bg-amber-500/10 p-5 border border-amber-500/20 text-sm font-bold text-amber-200">
              The sender still needs to complete the on-chain transfer.
            </div>
          )}

          {transaction.receipts?.storage_path && (
            <a className="flex h-16 items-center justify-center gap-3 rounded-2xl bg-white/5 font-bold text-white transition hover:bg-white/10" href={receiptUrl(transaction.receipts.storage_path)} target="_blank">
              <Download className="h-5 w-5 text-emerald-400" />
              Download Receipt
            </a>
          )}

          <Button className="h-20 rounded-[2rem] text-xl font-black shadow-2xl shadow-violet-600/40 transition-all hover:scale-[1.02] active:scale-95" onClick={handleClaim} disabled={busy || transaction.status === "claimed"}>
            {busy ? <Loader2 className="h-8 w-8 animate-spin" /> : <CheckCircle2 className="mr-3 h-6 w-6" />}
            {transaction.status === "claimed" ? "Payment Linked" : authenticated ? "Link to my Wallet" : "Connect to Claim"}
          </Button>
        </div>
      </section>
    </div>
  );
}

function NewFlowLink() {
  const { authenticated, login, user } = usePrivy();
  const { wallets } = useWallets();
  const { toast } = useToast();
  const [amount, setAmount] = useState("250");
  const [note, setNote] = useState("Design work");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleCreate() {
    if (!authenticated) return login();
    setBusy(true);
    try {
      const slug = await createFlowLink({ amount: Number(amount), note, creatorPrivyId: user?.id, creatorWallet: wallets[0]?.address });
      const nextUrl = makeFlowUrl(slug);
      setUrl(nextUrl);
      await navigator.clipboard.writeText(nextUrl);
      toast({ title: "Pay Me link copied" });
    } catch (error) {
      toast({ title: "Could not create link", description: error instanceof Error ? error.message : "Try again.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-6 pb-32 pt-28">
      <section className="glass-card overflow-hidden rounded-[2.5rem] p-8">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-xl shadow-violet-600/30">
          <Link2 className="h-8 w-8" />
        </div>
        <div className="mt-8">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-400">Reusable Request</p>
          <h1 className="mt-1 text-2xl font-black text-white">Create a Pay Me Link</h1>
        </div>

        <div className="mt-10 space-y-6">
          <div className="group relative overflow-hidden rounded-2xl bg-white/5 p-6 border border-white/5 transition-all hover:bg-white/[0.08]">
            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Requested Amount</Label>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-600">$</span>
              <input
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-4xl font-black tracking-tight text-white outline-none"
              />
              <span className="text-sm font-black text-slate-500">USDC</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Request Note</Label>
            <Textarea 
              value={note} 
              onChange={(event) => setNote(event.target.value)}
              className="min-h-[100px] rounded-xl border-white/5 bg-white/5 p-4 text-base font-bold focus:border-violet-500/50"
            />
          </div>

          {url && (
            <div className="animate-fade-in-up rounded-xl bg-emerald-500/10 p-4 border border-emerald-500/20">
              <p className="text-[9px] font-black uppercase tracking-widest text-emerald-400">Link Copied!</p>
              <p className="mt-1 break-all font-mono text-xs font-bold text-white">{url}</p>
            </div>
          )}

          <Button className="h-16 w-full rounded-2xl text-lg font-black shadow-xl shadow-violet-600/30 transition-all hover:scale-[1.01] active:scale-95" onClick={handleCreate} disabled={busy}>
            {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <Plus className="mr-2 h-5 w-5" />}
            {authenticated ? "Generate Link" : "Connect Wallet"}
          </Button>
        </div>
      </section>
    </div>
  );
}

function FlowPay({ slug, navigate }) {
  const [flow, setFlow] = useState(null);
  useEffect(() => {
    getFlow(slug).then(setFlow);
  }, [slug]);
  if (!flow) return <CenteredCard>This Pay Me link is not active.</CenteredCard>;
  return (
    <AppPage>
      <section className="rounded-[2rem] border border-white/10 bg-[#141225] p-6 text-center shadow-xl shadow-black/20">
        <p className="text-sm font-medium text-violet-300">Pay Me request</p>
        <h1 className="mt-2 text-5xl font-semibold">{formatUsd(flow.amount_usdc)}</h1>
        <p className="mx-auto mt-3 max-w-sm text-slate-500">{flow.note}</p>
        <Button className="mt-8 h-14 w-full rounded-2xl" onClick={() => navigate(`/send?amount=${encodeURIComponent(flow.amount_usdc)}&note=${encodeURIComponent(flow.note)}&recipient=${encodeURIComponent(flow.creator_wallet || "")}`)}>
          Pay in one tap
          <ArrowUpRight className="h-4 w-4" />
        </Button>
      </section>
    </AppPage>
  );
}

function Home({ navigate, initialParams, onComplete }) {
  const { authenticated, ready, login, user } = usePrivy();
  const { wallets } = useWallets();
  const { toast } = useToast();
  const [amount, setAmount] = useState(initialParams?.amount ?? "");
  const [recipient, setRecipient] = useState(initialParams?.recipient ?? "");
  const [note, setNote] = useState(initialParams?.note ?? "");
  const [asset, setAsset] = useState("USDC");
  const [receipt, setReceipt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const wallet = wallets.find((item) => item.walletClientType === "privy") ?? wallets[0];
  const displayWallet = wallet?.address || walletAddressFrom(user, wallets);

  const preview = useMemo(() => {
    const parsed = Number(amount || 0);
    return Number.isFinite(parsed) ? (parsed * (fxRates[asset] ?? 1)).toLocaleString(undefined, { maximumFractionDigits: 2 }) : "0.00";
  }, [amount, asset]);

  async function handleSend() {
    if (!ready) return;
    if (!authenticated) return login();
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0 || !recipient.trim()) return toast({ title: "Add an amount and recipient", tone: "error" });
    if (!wallet) return toast({ title: "No wallet is ready yet", description: "Privy is still provisioning your embedded wallet.", tone: "error" });

    setBusy(true);
    try {
      const pending = await createPendingSend({ amount: numericAmount, recipient, note, targetAsset: asset, receipt, senderPrivyId: user?.id, senderWallet: wallet.address });
      if (pending.recipientWallet) {
        const txHash = await sendUsdcOnArc({ wallet, recipient: pending.recipientWallet, amount: numericAmount.toString() });
        await markSendComplete(pending.id, txHash, wallet.address);
        setResult({ txHash, claimCode: pending.claimCode });
        toast({ title: "USDC sent", description: "Proof saved and claim link is ready." });
      } else {
        setResult({ claimCode: pending.claimCode });
        toast({ title: "Claim link created", description: "Share it so the recipient can attach their wallet." });
      }
    } catch (error) {
      toast({ title: "Send failed", description: error instanceof Error ? error.message : "Please try again.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  if (result) return <div className="p-6"><SuccessState result={result} navigate={(href) => { onComplete?.(); navigate(href); }} /></div>;

  return (
    <div className="mx-auto max-w-2xl p-6 sm:p-10">
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-violet-400">New Transfer</p>
            <h2 className="mt-2 text-4xl font-black text-white">Send USDC</h2>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 shadow-inner">
            <Send className="h-6 w-6 text-violet-400" />
          </div>
        </div>

        <div className="group relative overflow-hidden rounded-[2.5rem] bg-white/5 p-8 transition-all hover:bg-white/[0.08]">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-violet-600/10 blur-3xl group-hover:bg-violet-600/20" />
          <Label htmlFor="amount" className="text-xs font-black uppercase tracking-widest text-slate-500">Amount to send</Label>
          <div className="mt-4 flex items-baseline gap-3">
            <span className="text-3xl font-black text-slate-600">$</span>
            <input
              id="amount"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-5xl font-black tracking-tight text-white outline-none placeholder:text-slate-800"
            />
            <span className="text-xl font-black text-slate-500">USDC</span>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
          <div className="space-y-2">
            <Label className="text-xs font-black uppercase tracking-widest text-slate-500 ml-1">Recipient</Label>
            <Input 
              placeholder="email, phone, @xhandle, or 0x wallet" 
              value={recipient} 
              onChange={(event) => setRecipient(event.target.value)}
              className="h-16 rounded-2xl border-white/5 bg-white/5 px-5 font-bold focus:border-violet-500/50"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-black uppercase tracking-widest text-slate-500 ml-1">Preview</Label>
            <Select 
              value={asset} 
              onChange={(event) => setAsset(event.target.value)}
              className="h-16 rounded-2xl border-white/5 bg-white/5 px-5 font-bold focus:border-violet-500/50"
            >
              <option>USDC</option>
              <option>EURC</option>
              <option>BRLA</option>
              <option>MXN</option>
              <option>NGN</option>
            </Select>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-2xl bg-violet-600/5 px-5 py-4 border border-violet-500/10">
          <span className="text-sm font-bold text-violet-300/80 uppercase tracking-wider">Recipient receives</span>
          <strong className="text-lg font-black text-white">{preview} {asset}</strong>
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-black uppercase tracking-widest text-slate-500 ml-1">What is it for?</Label>
          <Textarea 
            placeholder="A short note about this payment..." 
            value={note} 
            onChange={(event) => setNote(event.target.value)}
            className="min-h-[100px] rounded-2xl border-white/5 bg-white/5 p-5 font-bold focus:border-violet-500/50"
          />
        </div>

        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-dashed border-white/10 bg-white/5 p-5 transition-all hover:bg-white/[0.08] hover:border-violet-500/30">
          <span className="flex min-w-0 items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/5">
              <FileImage className="h-6 w-6 text-violet-400" />
            </div>
            <span className="truncate font-bold text-slate-300">{receipt ? receipt.name : "Attach proof (PDF/IMG)"}</span>
          </span>
          <span className="text-xs font-black uppercase tracking-widest text-slate-500">OPTIONAL</span>
          <input className="hidden" type="file" accept="image/*,.pdf" onChange={(event) => setReceipt(event.target.files?.[0] ?? null)} />
        </label>

        <Button className="h-20 w-full rounded-[2rem] text-xl font-black shadow-2xl shadow-violet-600/40 transition-all hover:scale-[1.02] active:scale-95" onClick={handleSend} disabled={busy || !ready}>
          {busy ? <Loader2 className="h-8 w-8 animate-spin" /> : <Send className="mr-3 h-6 w-6" />}
          {authenticated ? `PAY ${formatUsd(Number(amount || 0))}` : "CONNECT WALLET"}
        </Button>
      </div>
    </div>
  );
}

function LandingPage({ navigate }) {
  const { authenticated, login } = usePrivy();
  const [menuOpen, setMenuOpen] = useState(false);

  function goTo(href) {
    setMenuOpen(false);
    navigate(href);
  }

  return (
    <main className="overflow-hidden bg-[#05050a]">
      <section className="hero-net relative min-h-screen overflow-hidden px-4 pb-28">
        <div className="net-grid animate-fade-in-up" />
        
        <div className="hero-rise mx-auto flex h-20 max-w-7xl items-center justify-between">
          <button onClick={() => navigate("/")} className="flex items-center gap-3 transition-transform hover:scale-105 active:scale-95">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-xl shadow-violet-600/30">
              <WalletCards className="h-6 w-6" />
            </span>
            <span className="text-2xl font-black tracking-tight text-white italic">ARCIS</span>
          </button>
          
          <div className="relative">
            <button onClick={() => setMenuOpen((value) => !value)} className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white shadow-xl backdrop-blur-xl transition hover:bg-white/10" aria-expanded={menuOpen} aria-label="Open menu">
              <Menu className="h-6 w-6" />
            </button>
            {menuOpen ? (
              <div className="absolute right-0 top-14 z-30 w-56 rounded-2xl border border-white/10 bg-[#05050a]/95 p-2 text-left shadow-2xl shadow-black/50 backdrop-blur-2xl animate-in zoom-in-95 duration-200">
                <button className="block w-full rounded-xl px-4 py-3 text-left text-sm font-bold text-white hover:bg-white/5" onClick={() => goTo("/dashboard")}>Open App</button>
                <button className="block w-full rounded-xl px-4 py-3 text-left text-sm font-bold text-white hover:bg-white/5" onClick={() => goTo("/flow/new")}>Pay Me Link</button>
                <button className="block w-full rounded-xl px-4 py-3 text-left text-sm font-bold text-violet-400 hover:bg-white/5" onClick={() => (authenticated ? goTo("/dashboard") : login())}>{authenticated ? "Dashboard" : "Login"}</button>
              </div>
            ) : null}
          </div>
        </div>
        <div className="net-grid animate-fade-in-up" />
        
        <div className="relative z-10 mx-auto flex max-w-5xl flex-col items-center">
          <button onClick={() => navigate("/dashboard")} className="hero-float mb-8 inline-flex items-center gap-3 rounded-full border border-white/20 bg-white/5 p-1 pr-5 text-sm text-slate-300 shadow-xl backdrop-blur-xl transition hover:bg-white/10">
            <span className="rounded-full bg-violet-600 px-4 py-1.5 font-bold text-white shadow-lg shadow-violet-600/30">NEW</span>
            <span className="font-medium">Introducing ArcFlow v2</span>
            <ArrowUpRight className="h-4 w-4 text-white" />
          </button>

          <h1 className="hero-rise text-6xl font-black tracking-tight text-white sm:text-8xl">
            The proof is <br />
            <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-emerald-400 bg-clip-text text-transparent italic">in the flow.</span>
          </h1>
          
          <p className="hero-rise-delay-1 mt-8 max-w-2xl text-lg font-medium leading-relaxed text-slate-400 sm:text-xl">
            One-tap global USDC sends, reusable Pay Me links, and instant Arc Testnet proof wrapped in premium glassmorphism.
          </p>

          <div className="hero-rise-delay-2 mt-10 flex flex-col gap-4 sm:flex-row">
            <Button className="h-16 rounded-2xl px-8 text-lg font-bold shadow-2xl shadow-violet-600/40 transition-all hover:scale-105 active:scale-95" onClick={() => navigate("/dashboard")}>
              Launch App
              <ArrowUpRight className="ml-2 h-5 w-5" />
            </Button>
            <Button variant="secondary" className="h-16 rounded-2xl border border-white/10 bg-white/5 px-8 text-lg font-bold backdrop-blur-xl transition-all hover:bg-white/10" onClick={() => (authenticated ? navigate("/flow/new") : login())}>
              Create Pay Me link
              <Link2 className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-16 pt-10 md:grid-cols-3">
        <LandingCard icon={Send} title="Send without wallet drama" text="Privy handles login and embedded wallets so users can get started with email, Google, or passkeys." />
        <LandingCard icon={ReceiptText} title="Proof that travels" text="Every transfer can carry a receipt upload, claim link, and ArcScan transaction hash." />
        <LandingCard icon={Link2} title="Reusable requests" text="Freelancers and teams can create Pay Me links for recurring invoices and simple public requests." />
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20">
        <div className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-[#121126] p-5 shadow-2xl shadow-black/20 sm:p-8">
          <div className="pointer-events-none absolute right-[-8rem] top-[-8rem] h-80 w-80 rounded-full bg-violet-500/20 blur-3xl" />
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="relative z-10 flex flex-col justify-between gap-8">
              <div>
                <p className="text-sm font-semibold text-violet-200">Proof layer</p>
                <h2 className="mt-3 max-w-md text-4xl font-semibold leading-tight text-white">
                  A send flow with receipts, links, and Arc proof built in.
                </h2>
                <p className="mt-4 max-w-md leading-7 text-slate-400">
                  ArcFlow is shaped around the real payment moment: who gets paid, why they were paid, and where the proof lives after the money moves.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                <ProofMetric value="USDC" label="Native asset on Arc Testnet" />
                <ProofMetric value="<1m" label="Create a claim or Pay Me link" />
                <ProofMetric value="CSV/PDF" label="Export records when needed" />
              </div>
            </div>

            <div className="relative z-10 grid gap-4">
              <div className="rounded-[2rem] border border-white/10 bg-white/5 p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-slate-400">Transfer packet</p>
                    <h3 className="mt-1 text-2xl font-semibold text-white">$250.00 USDC</h3>
                  </div>
                  <span className="rounded-full bg-violet-500/20 px-3 py-1 text-xs font-semibold text-violet-100">Ready</span>
                </div>
                <div className="mt-5 grid gap-3">
                  <ProofStep icon={Send} title="Send or request" text="Direct wallet transfer, claim link, or reusable Pay Me request." />
                  <ProofStep icon={ReceiptText} title="Attach proof" text="Upload a receipt and store the content hash beside the record." />
                  <ProofStep icon={ExternalLink} title="Verify on ArcScan" text="Save the transaction hash for instant on-chain confirmation." />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <CapabilityTile title="USDC native" text="No fake balance layer. The transfer uses Arc Testnet USDC." />
                <CapabilityTile title="Claim-ready" text="Recipients can open a link, login, and attach their wallet." />
                <CapabilityTile title="Audit trail" text="Sent and received tabs keep proof and exports close." />
              </div>
            </div>
          </div>
        </div>
      </section>

      <LandingFooter navigate={navigate} />
    </main>
  );
}

function LandingFooter({ navigate }) {
  return (
    <footer className="border-t border-white/10 bg-[#0f0e1d] px-4 py-10">
      <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-2">
        <div>
          <button onClick={() => navigate("/")} className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500 text-white shadow-lg shadow-violet-500/25">
              <WalletCards className="h-5 w-5" />
            </span>
            <span className="text-xl font-bold text-white">ArcFlow</span>
          </button>
          <p className="mt-4 max-w-sm text-sm leading-6 text-slate-400">
            One-tap global sends with instant proof. Built for Arc Testnet USDC with Privy login and Supabase-backed receipts.
          </p>
          <p className="mt-4 text-xs text-slate-500">Testnet MVP. Do not use with real funds.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <button onClick={() => navigate("/dashboard")} className="rounded-2xl border border-white/10 bg-white/5 p-5 text-left transition hover:bg-white/10">
            <span className="block text-sm font-semibold text-white">Open app</span>
            <span className="mt-2 block text-sm leading-6 text-slate-400">Send USDC, create requests, and view activity.</span>
          </button>
          <button onClick={() => navigate("/whitepaper")} className="rounded-2xl border border-white/10 bg-white/5 p-5 text-left transition hover:bg-white/10">
            <span className="block text-sm font-semibold text-white">Read whitepaper</span>
            <span className="mt-2 block text-sm leading-6 text-slate-400">Explore ArcFlow's product thesis and MVP architecture.</span>
          </button>
        </div>
      </div>

      <div className="mx-auto mt-10 flex max-w-6xl flex-col gap-3 border-t border-white/10 pt-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <span>© {new Date().getFullYear()} ArcFlow. Powered by Arc Testnet.</span>
        <span>Native USDC: 0x3600...0000</span>
      </div>
    </footer>
  );
}

function WhitepaperPage({ navigate }) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10 pb-28">
      <section className="rounded-[2.5rem] border border-white/10 bg-[#121126] p-6 shadow-2xl shadow-black/20 sm:p-10">
        <button onClick={() => navigate("/")} className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-violet-200 hover:bg-white/10">
          <ArrowDownLeft className="h-4 w-4" />
          Back to home
        </button>

        <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr]">
          <aside>
            <p className="text-sm font-semibold text-violet-200">ArcFlow whitepaper</p>
            <h1 className="mt-3 text-4xl font-semibold leading-tight text-white sm:text-5xl">
              One-tap global sends with instant proof.
            </h1>
            <p className="mt-5 leading-7 text-slate-400">
              ArcFlow is a consumer payment interface for Arc Testnet USDC, designed around simple login, reusable payment links, and receipt-backed records.
            </p>
            <div className="mt-8 grid gap-3">
              <ProofMetric value="Arc" label="Target network: Arc Testnet" />
              <ProofMetric value="USDC" label="Native token for transfers" />
              <ProofMetric value="MVP" label="No custom escrow contract" />
            </div>
          </aside>

          <article className="grid gap-6">
            <WhitepaperSection
              title="Problem"
              text="Cross-border crypto payments still feel too technical for normal users. People need to send money with a clear recipient, a human note, and a receipt trail without learning wallet operations first."
            />
            <WhitepaperSection
              title="Product Thesis"
              text="A stablecoin sender should feel closer to Venmo and Wise than a block explorer. ArcFlow makes login, send, claim, receipt attachment, and proof sharing feel like one consumer workflow."
            />
            <WhitepaperSection
              title="MVP Architecture"
              text="Privy handles embedded wallets and login. Supabase stores users, transactions, receipts, claims, and Flow Links. Viem signs Arc Testnet USDC transfers directly from the user's wallet."
            />
            <WhitepaperSection
              title="Proof Model"
              text="Each completed transfer stores the ArcScan transaction hash. Receipt uploads are stored in Supabase Storage, while a SHA-256 content hash is linked to the transaction record."
            />
            <WhitepaperSection
              title="Current Limits"
              text="Email, phone, and X-handle recipients create a claim/proof link first because this MVP intentionally avoids a custom escrow contract. Before real-money use, write paths should move behind verified backend or Supabase Edge Functions."
            />
            <WhitepaperSection
              title="Roadmap"
              text="Next steps include verified recipient resolution, optional escrow contracts, stronger RLS tied to Privy JWTs, better FX quoting, production audit trails, and ArcLens listing readiness."
            />
          </article>
        </div>
      </section>
    </main>
  );
}

function WhitepaperSection({ title, text }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      <p className="mt-3 leading-7 text-slate-400">{text}</p>
    </section>
  );
}

function WalletDebug({ show }) {
  const { authenticated, ready, user } = usePrivy();
  const { wallets } = useWallets();
  const [waitedTooLong, setWaitedTooLong] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!show || !authenticated || wallets.length > 0) return;
    const timer = setTimeout(() => setWaitedTooLong(true), 12000);
    return () => clearTimeout(timer);
  }, [show, authenticated, wallets.length]);

  useEffect(() => {
    if (waitedTooLong && wallets.length === 0) {
      setError("It looks like the Privy wallet iframe is being blocked or taking too long. Please ensure http://localhost:5173 is added to 'Allowed Origins' in the Privy Dashboard.");
    }
  }, [waitedTooLong, wallets.length]);

  if (!show || !authenticated || wallets.length > 0 || !waitedTooLong) return null;

  return (
    <div className="mx-auto mt-4 max-w-md rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200 shadow-lg animate-in fade-in slide-in-from-top-4">
      <div className="flex gap-3">
        <Loader2 className="h-5 w-5 shrink-0 animate-spin text-red-400" />
        <div>
          <p className="font-bold">Wallet setup hanging?</p>
          <p className="mt-1 leading-6 opacity-80">{error}</p>
          <a href="https://dashboard.privy.io" target="_blank" className="mt-2 inline-block font-semibold text-white underline">Open Privy Dashboard</a>
        </div>
      </div>
    </div>
  );
}

export function App() {
  const { authenticated } = usePrivy();
  const [path, setPath] = useState(window.location.pathname);
  const [showSend, setShowSend] = useState(false);
  const [sendParams, setSendParams] = useState(null);

  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const [showWithdraw, setShowWithdraw] = useState(false);

  function navigate(href) {
    if (href.startsWith("/send")) {
      const params = new URLSearchParams(href.split("?")[1]);
      setSendParams(Object.fromEntries(params.entries()));
      setShowSend(true);
      return;
    }
    window.history.pushState({}, "", href);
    setPath(window.location.pathname);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const claimCode = path.match(/^\/claim\/([^/]+)/)?.[1];
  const flowSlug = path.match(/^\/flow\/([^/]+)/)?.[1];

  const [notifications, setNotifications] = useState([
    { id: 1, type: "received", title: "Money Received", message: "You just received 250 USDC from 0x1a2b...3c4d", read: false },
    { id: 2, type: "claimed", title: "Link Claimed", message: "Your 'Design Work' Pay Me link was claimed by a recipient.", read: false }
  ]);

  const addNotification = (notif) => {
    setNotifications(prev => [{ id: Date.now(), read: false, ...notif }, ...prev]);
  };

  return (
    <div className="min-h-screen text-slate-50">
      {authenticated && path !== "/" ? <TopBar navigate={navigate} notifications={notifications} onClear={() => setNotifications([])} /> : null}
      <WalletDebug show={path !== "/" && authenticated} />
      {path === "/dashboard" ? <Dashboard navigate={navigate} addNotification={addNotification} /> : path === "/profile" ? <ProfilePage /> : path === "/flow/new" ? <NewFlowLink /> : path === "/whitepaper" ? <WhitepaperPage navigate={navigate} /> : claimCode ? <ClaimPage code={claimCode} addNotification={addNotification} /> : flowSlug ? <FlowPay slug={flowSlug} navigate={navigate} /> : <LandingPage navigate={navigate} />}
      {authenticated && path !== "/" && !claimCode ? <BottomNav path={path} navigate={navigate} onSend={() => setShowSend(true)} /> : null}
      
      {showSend && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-[2.5rem] border border-white/10 bg-[#090812] shadow-2xl shadow-black/50">
            <button 
              onClick={() => { setShowSend(false); setSendParams(null); }}
              className="absolute right-6 top-6 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white transition"
            >
              <Plus className="h-6 w-6 rotate-45" />
            </button>
            <div className="p-1">
              <Home navigate={navigate} initialParams={sendParams} onComplete={() => setShowSend(false)} />
            </div>
          </div>
        </div>
      )}

      {showWithdraw && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-500">
          <div className="relative w-full max-w-md overflow-hidden rounded-[2.5rem] border border-white/10 bg-[#090812] shadow-2xl p-8 text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[2rem] bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-xl shadow-violet-600/40">
              <Download className="h-10 w-10" />
            </div>
            <h2 className="mt-8 text-3xl font-black text-white">Bank Withdrawals</h2>
            <p className="mt-4 text-slate-400 font-medium leading-relaxed">
              We're currently bridging Arc Testnet with local banking rails (SEPA, NIP, PIX). This feature will be live on mainnet.
            </p>
            <div className="mt-8 rounded-2xl bg-violet-500/10 p-4 border border-violet-500/20">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-400">Status</span>
              <p className="mt-1 font-bold text-white">Beta Testing in progress</p>
            </div>
            <Button className="mt-10 h-16 w-full rounded-2xl font-black text-lg" onClick={() => setShowWithdraw(false)}>
              Got it
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
