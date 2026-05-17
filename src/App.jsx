import { useEffect, useMemo, useState, useCallback } from "react";
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
import { claimPayment, createFlowLink, createPendingSend, getClaim, getDashboardRows, getFlow, getUserAssets, markSendComplete, receiptUrl, saveWalletToUser } from "@/lib/data";
import { formatUsd, makeClaimUrl, makeExplorerUrl, makeFlowUrl } from "@/lib/format";
import { makeTinyPdf } from "@/lib/pdf";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

const fxRates = { USDC: 1, EURC: 0.92, BRLA: 5.12, MXN: 16.8, NGN: 1450 };
const ARC_FAUCET_URL = "https://faucet.circle.com";
const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || "http://localhost:3001").replace(/\/$/, "");

/**
 * Custom Circle Hook for managing Auth and Wallet State
 */
function useCircleAuth() {
  const [authenticated, setAuthenticated] = useState(!!localStorage.getItem("circle_user_id"));
  const [user, setUser] = useState(localStorage.getItem("circle_user_id") ? { id: localStorage.getItem("circle_user_id") } : null);
  const [wallet, setWallet] = useState(localStorage.getItem("circle_wallet_address"));
  const [ready, setReady] = useState(true);
  const [showLogin, setShowLogin] = useState(false);

  const refresh = useCallback(async () => {
    const userId = localStorage.getItem("circle_user_id");
    if (!userId) return;
    try {
      const response = await fetch(`${BACKEND_URL}/api/db/user/wallet?id=${userId}`);
      if (!response.ok) {
        // Fallback for direct managed derivation if DB lookup fails
        setWallet(localStorage.getItem("circle_wallet_address"));
        return;
      }
      const data = await response.json();
      if (data.wallet) {
        setWallet(data.wallet);
        localStorage.setItem("circle_wallet_address", data.wallet);
      }
    } catch (err) {
      console.error("Refresh failed:", err);
    }
  }, []);

  useEffect(() => {
    if (authenticated) refresh();
  }, [authenticated, refresh]);

  const login = () => setShowLogin(true);

  const sendOtp = async (email) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/otp/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const ct = res.headers.get("content-type");
      if (!ct || !ct.includes("application/json")) {
        throw new Error(`Server returned non-JSON. Check if VITE_BACKEND_URL is correct.`);
      }
      return res.json();
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  const verifyOtp = async (email, code) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/otp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code })
      });
      const ct = res.headers.get("content-type");
      if (!ct || !ct.includes("application/json")) {
        throw new Error(`Server returned non-JSON. Check if VITE_BACKEND_URL is correct.`);
      }
      const data = await res.json();
      if (data.success) {
        handleLoginSuccess(data);
      }
      return data;
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  const connectExternal = async () => {
    if (!window.ethereum) throw new Error("MetaMask not found. Please install it to connect.");
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    const address = accounts[0];

    const res = await fetch(`${BACKEND_URL}/api/auth/external`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address })
    });
    const data = await res.json();
    if (data.success) {
      handleLoginSuccess(data);
    }
    return data;
  };

  const handleLoginSuccess = (data) => {
    localStorage.setItem("circle_user_id", data.userId);
    localStorage.setItem("circle_wallet_address", data.walletAddress);
    setUser({ id: data.userId, isExternal: data.isExternal });
    setWallet(data.walletAddress);
    setAuthenticated(true);
    setShowLogin(false);
  };

  const logout = () => {
    localStorage.removeItem("circle_user_id");
    localStorage.removeItem("circle_wallet_address");
    setUser(null);
    setAuthenticated(false);
    setWallet(null);
  };

  return { authenticated, user, wallet, setWallet, ready, login, sendOtp, verifyOtp, connectExternal, logout, refresh, showLogin, setShowLogin };
}

function openFaucet() {
  window.open(ARC_FAUCET_URL, "_blank", "noopener,noreferrer");
}

function LoginModal({ onClose, circle }) {
  const [tab, setTab] = useState("email"); // email | wallet
  const [step, setStep] = useState("input"); // input | verify
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();

  async function handleSend(e) {
    if (e) e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError("");
    try {
      const res = await circle.sendOtp(email.trim().toLowerCase());
      if (res.success) setStep("verify");
      else throw new Error(res.error || "Could not send OTP");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify(e) {
    if (e) e.preventDefault();
    if (!otp.trim()) return;
    setBusy(true);
    setError("");
    try {
      const res = await circle.verifyOtp(email.trim().toLowerCase(), otp.trim());
      if (!res.success) throw new Error(res.error || "Invalid OTP");
      toast({ title: "Welcome back!", description: "You are now securely logged in." });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleExternal() {
    setBusy(true);
    setError("");
    try {
      await circle.connectExternal();
      toast({ title: "MetaMask Connected", description: "Your external wallet is linked." });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-xl p-4">
      <div className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-[2.5rem] border border-white/10 bg-[#090812] shadow-2xl animate-in slide-in-from-bottom-10 sm:zoom-in-95 duration-300">
        <div className="relative p-6 sm:p-12">
          <Button variant="ghost" size="icon" className="absolute right-6 top-6 rounded-full text-slate-500 hover:text-white" onClick={onClose}><X className="h-5 w-5" /></Button>

          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-xl shadow-violet-600/30">
              <Shield className="h-8 w-8" />
            </div>
            <h2 className="mt-8 text-3xl font-black tracking-tight text-white">Security Check</h2>
            <p className="mt-3 text-slate-400 font-medium">Connect to your ArcFlow account</p>
          </div>

          <div className="mt-10 flex gap-2 rounded-2xl bg-white/5 p-1.5">
            <button onClick={() => setTab("email")} className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${tab === "email" ? "bg-white/10 text-white shadow-sm" : "text-slate-500 hover:text-slate-300"}`}>Email OTP</button>
            <button onClick={() => setTab("wallet")} className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${tab === "wallet" ? "bg-white/10 text-white shadow-sm" : "text-slate-500 hover:text-slate-300"}`}>Connect Wallet</button>
          </div>

          <div className="mt-8">
            {tab === "email" ? (
              step === "input" ? (
                <form onSubmit={handleSend} className="space-y-6">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Email Address</Label>
                    <Input type="email" placeholder="name@example.com" value={email} onChange={e => setEmail(e.target.value)} className="h-14 rounded-2xl border-white/10 bg-white/5 text-lg font-bold text-white focus:border-violet-500/50" />
                  </div>
                  {error && <p className="text-sm font-bold text-rose-500 ml-1">Error: {error}</p>}
                  <Button disabled={busy} className="h-14 w-full rounded-2xl text-lg font-black shadow-xl shadow-violet-600/30 hover:scale-[1.01] active:scale-95 transition-all">
                    {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : "Verify Identity"}
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleVerify} className="space-y-6">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Enter code sent to {email}</Label>
                    <Input type="text" placeholder="6-digit code" value={otp} onChange={e => setOtp(e.target.value)} className="h-14 rounded-2xl border-white/10 bg-white/5 text-center text-3xl font-black tracking-[0.5em] text-white focus:border-violet-500/50" />
                  </div>
                  {error && <p className="text-sm font-bold text-rose-500 ml-1">{error}</p>}
                  <Button disabled={busy} className="h-14 w-full rounded-2xl text-lg font-black bg-emerald-600 hover:bg-emerald-500 shadow-xl shadow-emerald-600/20">
                    {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : "Complete Login"}
                  </Button>
                  <button type="button" onClick={() => setStep("input")} className="w-full text-xs font-black uppercase tracking-widest text-violet-400 hover:text-violet-300">Wrong email? Go back</button>
                </form>
              )
            ) : (
              <div className="space-y-6">
                <Button onClick={handleExternal} disabled={busy} className="h-16 w-full rounded-2xl border border-white/10 bg-white/5 text-lg font-bold text-white hover:bg-white/10 transition-all flex items-center justify-center gap-3">
                  <img src="https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Mirror_Logo.svg" className="h-8 w-8" alt="MetaMask" />
                  Continue with MetaMask
                </Button>
                <Button onClick={handleExternal} disabled={busy} className="h-16 w-full rounded-2xl border border-white/10 bg-white/5 text-lg font-bold text-white hover:bg-white/10 transition-all flex items-center justify-center gap-3">
                  <Smartphone className="h-7 w-7 text-blue-400" />
                  Coinbase Wallet
                </Button>
                {error && <p className="text-sm font-bold text-rose-500 text-center">{error}</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FundModal({ onClose, wallet, onComplete }) {
  const [amount, setAmount] = useState("500");
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  async function handleFund() {
    setBusy(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/fund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetWallet: wallet, amount: Number(amount) })
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || "Funding failed");
      toast({ title: "Funds requested", description: `We sent ${amount} USDC to your wallet.` });
      onComplete?.();
      onClose();
    } catch (err) {
      toast({ title: "Funding failed", description: err.message, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-md p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-[2.5rem] border border-white/10 bg-[#0e0c1e] p-8 shadow-2xl animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400">
          <Plus className="h-8 w-8" />
        </div>
        <h2 className="mt-6 text-2xl font-black text-white">Add Test Funds</h2>
        <p className="mt-2 text-sm text-slate-400">Request free USDC on Arc Testnet to explore the app.</p>

        <div className="mt-8 space-y-6">
          <div className="space-y-3">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Amount (USDC)</label>
            <div className="relative group">
              <span className="absolute left-5 top-1/2 -translate-y-1/2 text-2xl font-black text-slate-600">$</span>
              <Input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="h-16 pl-10 rounded-2xl border-white/10 bg-white/5 text-2xl font-black text-white focus:border-violet-500/60 transition-all"
                placeholder="0"
              />
            </div>
            <div className="flex gap-2">
              {["100", "500", "1500", "5000"].map(val => (
                <button
                  key={val}
                  onClick={() => setAmount(val)}
                  className={`flex-1 py-2 rounded-xl text-[10px] font-black border transition-all ${amount === val ? "bg-violet-600 border-violet-500 text-white" : "bg-white/5 border-white/5 text-slate-500 hover:bg-white/10"}`}
                >
                  ${val}
                </button>
              ))}
            </div>
          </div>

          <Button onClick={handleFund} disabled={busy} className="h-14 w-full rounded-2xl bg-emerald-600 text-base font-black hover:bg-emerald-500">
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "Request Funds"}
          </Button>
          <Button variant="ghost" className="w-full text-slate-500" onClick={onClose}>Dismiss</Button>
        </div>
      </div>
    </div>
  );
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
  const url = result.claimCode ? makeClaimUrl(result.claimCode) : "";
  const { toast } = useToast();

  return (
    <div className="flex min-h-[34rem] flex-col justify-center gap-8 text-center animate-in fade-in zoom-in-95 duration-500">
      <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-[2.5rem] bg-violet-500/15 text-violet-400 shadow-2xl shadow-violet-500/10">
        {result.claimCode ? <Link2 className="h-12 w-12" /> : <CheckCircle2 className="h-12 w-12" />}
      </div>

      <div>
        <h2 className="text-4xl font-black text-white tracking-tight">{result.txHash ? "Money Sent!" : "Payment Link Created!"}</h2>
        <p className="mx-auto mt-3 max-w-sm text-base font-medium text-slate-500 leading-relaxed">
          {result.txHash ? "Your transfer is complete and the proof has been saved to the blockchain." : "Share this special claim link with the recipient so they can link their wallet."}
        </p>
      </div>

      {result.claimCode && (
        <div className="mx-auto w-full max-w-sm rounded-[2rem] bg-white/5 p-6 border border-white/10 text-left">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400">Your Shareable Link</span>
          <p className="mt-2 break-all font-mono text-sm font-bold text-white mb-6 bg-black/20 p-4 rounded-xl">{url}</p>
          <Button className="w-full h-14 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-white font-black" onClick={() => { navigator.clipboard.writeText(url); toast({ title: "Link Copied!" }); }}>
            <Copy className="mr-2 h-4 w-4" />
            Copy to Clipboard
          </Button>
        </div>
      )}

      {result.txHash && (
        <div className="mx-auto w-full max-w-sm overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 p-4">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-2">Transaction Hash</span>
          <a className="break-all font-mono text-[10px] text-violet-400 hover:text-violet-300" href={makeExplorerUrl(result.txHash)} target="_blank">
            {result.txHash}
          </a>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row justify-center sm:px-12">
        <Button variant="secondary" className="h-14 rounded-2xl bg-white/5 border-white/10 text-white font-bold flex-1" onClick={() => navigate("/dashboard")}>
          Back to Home
        </Button>
      </div>
    </div>
  );
}

function TopBar({ navigate, notifications, onClear, circle }) {
  const { authenticated, login, logout, user, wallet, ready } = circle;
  const [showNotifs, setShowNotifs] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
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
              <div className="fixed sm:absolute top-20 left-4 right-4 sm:left-auto sm:right-0 sm:mt-3 sm:w-80 overflow-hidden rounded-[2rem] border border-white/10 bg-[#0a0a0f]/95 shadow-2xl backdrop-blur-3xl animate-in zoom-in-95 duration-200 z-[100]">
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
    { label: "Assets", icon: WalletCards, href: "/assets" },
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

function AssetsPage({ circle }) {
  const { authenticated, ready, login, wallet } = circle;
  const { toast } = useToast();
  const [assets, setAssets] = useState({ flows: [], transactions: [] });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (wallet) {
      setLoading(true);
      getUserAssets(wallet).then(setAssets).finally(() => setLoading(false));
    }
  }, [wallet]);

  if (!authenticated) return (
    <CenteredCard>
      <div className="py-8">
        <h1 className="text-2xl font-black text-white">Your Assets</h1>
        <p className="mt-3 text-sm text-slate-500">Connect to view your wallet and links.</p>
        <Button className="mt-6 h-14 w-full rounded-2xl font-bold shadow-xl shadow-violet-600/20" onClick={login} disabled={!ready}>Connect Wallet</Button>
      </div>
    </CenteredCard>
  );

  return (
    <div className="mx-auto max-w-lg px-4 pb-32 pt-28">
      <section className="glass-card overflow-hidden rounded-[2.5rem] p-6 sm:p-8">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-400 font-mono">Digital Assets</p>
            <h1 className="text-2xl font-black text-white">My Holdings</h1>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-600/10 text-violet-400">
            <WalletCards className="h-6 w-6" />
          </div>
        </div>

        <div className="mt-10 space-y-8">
          {/* Flows Section */}
          <div className="space-y-4">
            <h3 className="px-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Active Pay Me Links</h3>
            {loading ? (
              <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-slate-700" /></div>
            ) : assets.flows.length === 0 ? (
              <p className="px-1 text-[10px] font-black uppercase text-slate-700">No links created yet</p>
            ) : (
              <div className="space-y-3">
                {assets.flows.map(f => (
                  <div key={f.id} className="group relative flex items-center justify-between rounded-2xl bg-emerald-500/5 p-4 border border-emerald-500/10 transition-all hover:bg-emerald-500/10">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-white">{formatUsd(f.amount_usdc)}</span>
                        <span className="h-3 w-px bg-emerald-500/20" />
                        <span className="text-[10px] font-black uppercase text-emerald-400 tracking-widest">Active</span>
                      </div>
                      <p className="mt-1 truncate text-[10px] font-bold text-slate-500 italic">"{f.note}"</p>
                    </div>
                    <button
                      onClick={() => { navigator.clipboard.writeText(makeFlowUrl(f.slug)); toast({ title: "Flow Link Copied" }); }}
                      className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 shadow-sm transition hover:bg-emerald-500 hover:text-white"
                    >
                      <Link2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="h-px bg-white/5 mx-2" />

          {/* Transactions/Claims Section */}
          <div className="space-y-4">
            <h3 className="px-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Transaction Claims</h3>
            {loading ? (
              <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-slate-700" /></div>
            ) : assets.transactions.length === 0 ? (
              <p className="px-1 text-[10px] font-black uppercase text-slate-700">No transactions yet</p>
            ) : (
              <div className="space-y-3">
                {assets.transactions.map(t => {
                  const isSender = t.sender_wallet?.toLowerCase() === wallet.toLowerCase();
                  const statusColor = t.status === "claimed" || t.status === "completed" ? "text-emerald-400 bg-emerald-400/10" : "text-amber-400 bg-amber-400/10";
                  return (
                    <div key={t.id} className="flex items-center justify-between rounded-2xl bg-white/5 p-4 border border-white/5 overflow-hidden">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${statusColor}`}>
                            {t.status}
                          </span>
                          <span className="text-xs font-black text-white">{formatUsd(t.amount_usdc)}</span>
                        </div>
                        <p className="mt-1 truncate text-[10px] font-bold text-slate-500">
                          {isSender ? `To: ${t.recipient_identifier || "Anonymous"}` : `From: ${t.sender_wallet?.slice(0, 8)}...`}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function ProfilePage({ circle }) {
  const { authenticated, ready, login, logout, user, wallet } = circle;
  const { toast } = useToast();
  const email = user?.id || "No email connected";
  const displayName = user?.id?.split("@")[0] || "User";

  async function copyWallet() {
    if (!wallet) return;
    await navigator.clipboard.writeText(wallet);
    toast({ title: "Wallet address copied" });
  }

  if (!authenticated) return (
    <CenteredCard>
      <div className="py-8 text-center">
        <h1 className="text-2xl font-black text-white">Your Profile</h1>
        <p className="mt-2 text-sm text-slate-500">Connect to manage your account.</p>
        <Button className="mt-6 h-14 w-full rounded-2xl font-bold transition-all" onClick={login} disabled={!ready}>Connect Account</Button>
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
            <p className="mt-1 break-all text-sm font-bold text-white">{email}</p>
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

function Dashboard({ navigate, addNotification, circle, setShowFund, refreshToggle }) {
  const { authenticated, login, user, wallet } = circle;
  const [tab, setTab] = useState("sent");
  const [rows, setRows] = useState([]);
  const [balance, setBalance] = useState("0.00");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (wallet) refresh();
  }, [wallet, refreshToggle]);

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
                  <HeaderAction icon={Plus} label="Add" onClick={() => setShowFund(true)} />
                  <HeaderAction icon={ArrowUpRight} label="Send" onClick={() => navigate("/send")} />
                  <HeaderAction icon={Link2} label="Pay Me" onClick={() => navigate("/flow/new")} />
                  <HeaderAction icon={Download} label="Withdraw" onClick={() => setShowWithdraw(true)} />
                </div>
              </div>
            </section>

            <div className="mx-auto max-w-lg px-6 lg:max-w-none lg:px-0">
              <section className="glass-card mt-4 lg:-translate-y-8 animate-fade-in-up overflow-hidden rounded-[2.5rem] p-6 [animation-delay:400ms] lg:translate-y-0">
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
                {visible.slice(0, 8).map((row) => (
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

function ClaimPage({ code, addNotification, circle, refreshToggle }) {
  const { authenticated, login, user, wallet } = circle;
  const { toast } = useToast();
  const [transaction, setTransaction] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getClaim(code).then(setTransaction);
  }, [code, refreshToggle]);

  async function handleClaim() {
    if (!authenticated) return login();
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
        <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-[2.5rem] bg-emerald-500/10 text-emerald-400 shadow-2xl shadow-emerald-500/20">
          <Download className="h-12 w-12" />
        </div>
        <div className="mt-10">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-400">Incoming Payment</p>
          <h1 className="mt-4 text-6xl font-black text-white">{formatUsd(transaction.amount_usdc)}</h1>

          <div className="mt-6 flex flex-col items-center justify-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 italic">From</span>
            <div className="flex items-center gap-3 rounded-full bg-white/5 px-4 py-2 border border-white/5">
              <Avatar seed={transaction.sender_wallet || "ArcFlow"} size="xs" />
              <span className="text-sm font-bold text-white truncate max-w-[12rem]">{transaction.sender_privy_id || transaction.sender_wallet?.slice(0, 10) + "..."}</span>
            </div>
          </div>

          <p className="mx-auto mt-6 max-w-sm text-lg font-bold text-slate-400">"{transaction.note || "No note added"}"</p>
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

function NewFlowLink({ circle }) {
  const { authenticated, login, user, wallet } = circle;
  const { toast } = useToast();
  const [amount, setAmount] = useState("250");
  const [note, setNote] = useState("Design work");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleCreate() {
    if (!authenticated) return login();
    setBusy(true);
    try {
      const slug = await createFlowLink({ amount: Number(amount), note, creatorPrivyId: user?.id, creatorWallet: wallet });
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
            <div className="fixed inset-0 z-[110] flex items-end justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in slide-in-from-bottom duration-500 sm:items-center">
              <div className="relative w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-[2.5rem] border border-white/10 bg-[#090812] shadow-2xl p-6 sm:p-10 text-center">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[2rem] bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-xl shadow-emerald-500/40">
                  <Link2 className="h-10 w-10" />
                </div>
                <h2 className="mt-8 text-3xl font-black text-white">Link Ready!</h2>
                <p className="mt-4 text-slate-400 font-medium leading-relaxed">
                  Anyone with this link can pay you directly to your ArcFlow wallet.
                </p>
                <div className="mt-8 rounded-2xl bg-white/5 p-5 border border-white/10 text-left">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400">Payment Link</span>
                  <p className="mt-2 break-all font-mono text-sm font-bold text-white selection:bg-emerald-500/30">{url}</p>
                </div>
                <div className="mt-8 grid grid-cols-2 gap-4">
                  <Button variant="secondary" className="h-14 rounded-2xl font-bold" onClick={() => { navigator.clipboard.writeText(url); toast({ title: "Copied!" }); }}>
                    <Copy className="h-4 w-4" />
                    Copy
                  </Button>
                  <Button className="h-14 rounded-2xl font-bold" onClick={() => setUrl("")}>
                    Done
                  </Button>
                </div>
              </div>
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

function Home({ navigate, initialParams, onComplete, circle }) {
  const { authenticated, ready, login, user, wallet } = circle;
  const { toast } = useToast();
  const [amount, setAmount] = useState(initialParams?.amount ?? "");
  const [recipient, setRecipient] = useState(initialParams?.recipient ?? "");
  const [note, setNote] = useState(initialParams?.note ?? "");
  const [asset, setAsset] = useState("USDC");
  const [receipt, setReceipt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [useLink, setUseLink] = useState(false);

  const preview = useMemo(() => {
    const parsed = Number(amount || 0);
    return Number.isFinite(parsed) ? (parsed * (fxRates[asset] ?? 1)).toLocaleString(undefined, { maximumFractionDigits: 2 }) : "0.00";
  }, [amount, asset]);

  async function handleSend() {
    if (!ready) return;
    if (!authenticated) return login();
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) return toast({ title: "Please enter an amount", tone: "error" });
    if (!useLink && !recipient.trim()) return toast({ title: "Add a recipient or check 'Send via Link'", tone: "error" });
    if (!wallet) return toast({ title: "No wallet ready", description: "Please wait for your Circle wallet to be set up.", tone: "error" });

    setBusy(true);
    try {
      const pending = await createPendingSend({
        amount: numericAmount,
        recipient: useLink ? "Claim Link" : recipient,
        note,
        targetAsset: asset,
        receipt,
        senderPrivyId: user?.id,
        senderWallet: wallet
      });
      if (pending.recipientWallet) {
        const txHash = await sendUsdcOnArc({ userId: user.id, recipient: pending.recipientWallet, amount: numericAmount.toString() });
        await markSendComplete(pending.id, txHash, wallet);
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

  if (result) return <div className="p-4 sm:p-6"><SuccessState result={result} navigate={(href) => { onComplete?.(); navigate(href); }} /></div>;

  return (
    <div className="mx-auto max-w-lg p-4 sm:p-10">
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

        <div className="group relative overflow-hidden rounded-[2.5rem] bg-white/5 p-6 sm:p-8 transition-all hover:bg-white/[0.08]">
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

        <button
          onClick={() => { setUseLink(!useLink); if (!useLink) setRecipient(""); }}
          className={`group flex items-center justify-between rounded-2xl border p-5 transition-all ${useLink ? "border-emerald-500/50 bg-emerald-500/10" : "border-white/10 bg-white/5 hover:bg-white/10"}`}
        >
          <div className="flex items-center gap-4">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${useLink ? "bg-emerald-500 text-white" : "bg-white/5 text-slate-500"}`}>
              <Link2 className="h-5 w-5" />
            </div>
            <div className="text-left">
              <h4 className="text-sm font-bold text-white">Send via Link</h4>
              <p className="text-[10px] font-black uppercase text-slate-500 tracking-tight">Recipients can claim in one tap</p>
            </div>
          </div>
          <div className={`h-6 w-11 rounded-full p-1 transition-all ${useLink ? "bg-emerald-500" : "bg-slate-800"}`}>
            <div className={`h-4 w-4 rounded-full bg-white transition-all ${useLink ? "translate-x-5" : "translate-x-0"}`} />
          </div>
        </button>

        {!useLink && (
          <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
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
                <div className="flex h-16 items-center rounded-2xl border border-white/5 bg-white/5 px-5 font-bold text-white italic">
                  {asset}
                </div>
              </div>
            </div>
          </div>
        )}

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

function LandingPage({ navigate, circle }) {
  const { authenticated, login } = circle;
  const [menuOpen, setMenuOpen] = useState(false);

  function goTo(href) {
    setMenuOpen(false);
    navigate(href);
  }

  return (
    <main className="overflow-hidden bg-[#05050a]">
      <section className="hero-net relative min-h-screen overflow-hidden px-4 pb-28">
        <div className="net-grid animate-fade-in-up" />

        <div className="hero-rise relative z-50 mx-auto flex h-20 max-w-7xl items-center justify-between">
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

export function App() {
  const circle = useCircleAuth();
  const { authenticated } = circle;
  const [path, setPath] = useState(window.location.pathname);
  const [showSend, setShowSend] = useState(false);
  const [sendParams, setSendParams] = useState(null);
  const [showFund, setShowFund] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);

  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

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

  const [notifications, setNotifications] = useState([]);
  const [refreshToggle, setRefreshToggle] = useState(0);

  // Real-time synchronization
  useEffect(() => {
    if (!circle.wallet || !isSupabaseConfigured) return;

    const channel = supabase
      .channel('realtime_transactions')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions',
          filter: `sender_wallet=eq.${circle.wallet}`
        },
        () => setRefreshToggle(prev => prev + 1)
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions',
          filter: `recipient_wallet=eq.${circle.wallet}`
        },
        (payload) => {
          setRefreshToggle(prev => prev + 1);
          if (payload.eventType === 'INSERT') {
            setNotifications(prev => [{
              id: Date.now(),
              type: "received",
              title: "Money Received",
              message: `You just received ${payload.new.amount_usdc} USDC!`,
              read: false
            }, ...prev]);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [circle.wallet]);

  return (
    <div className="min-h-screen bg-[#05050a] font-sans text-slate-200">
      {path !== "/" && (
        <TopBar navigate={navigate} notifications={notifications} onClear={() => setNotifications([])} circle={circle} />
      )}

      {path === "/" && <LandingPage navigate={navigate} circle={circle} />}
      {path === "/dashboard" && <Dashboard navigate={navigate} addNotification={(n) => setNotifications([...notifications, { ...n, id: Date.now(), read: false }])} circle={circle} setShowFund={setShowFund} refreshToggle={refreshToggle} />}
      {path === "/assets" && <AssetsPage circle={circle} />}
      {path === "/profile" && <ProfilePage circle={circle} />}
      {claimCode && <ClaimPage code={claimCode} addNotification={(n) => setNotifications([...notifications, { ...n, id: Date.now(), read: false }])} circle={circle} refreshToggle={refreshToggle} />}
      {path === "/flow/new" && <NewFlowLink circle={circle} />}
      {flowSlug && <FlowPay slug={flowSlug} navigate={navigate} />}
      {path === "/whitepaper" && <WhitepaperPage navigate={navigate} />}


      {authenticated && path !== "/" && <BottomNav path={path} navigate={navigate} onSend={() => setShowSend(true)} />}

      {showSend && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-md max-h-[90dvh] overflow-y-auto animate-in slide-in-from-bottom-10 bg-[#090812] rounded-[2.5rem]">
            <div className="p-0">
              <Home initialParams={sendParams} onComplete={() => setShowSend(false)} navigate={navigate} circle={circle} />
            </div>
            <Button variant="ghost" className="mb-4 mx-auto block text-slate-500" onClick={() => { setShowSend(false); setSendParams(null); }}>Dismiss</Button>
          </div>
        </div>
      )}

      {circle.showLogin && (
        <LoginModal
          onClose={() => circle.setShowLogin(false)}
          circle={circle}
        />
      )}

      {showFund && <FundModal onClose={() => setShowFund(false)} wallet={circle.wallet} onComplete={circle.refresh} />}


      {showWithdraw && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-500">
          <div className="relative w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-[2.5rem] border border-white/10 bg-[#090812] shadow-2xl p-6 sm:p-8 text-center">
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
