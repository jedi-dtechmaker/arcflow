import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PrivyProvider } from "@privy-io/react-auth";
import { App } from "@/App";
import { ToastProvider } from "@/components/ui/toast";
import { arcTestnet } from "@/lib/arc";
import "@/styles.css";

const originalError = console.error;
console.error = (...args) => {
  const msg = args.map(arg => String(arg)).join(" ");
  if (
    msg.includes("cannot be a descendant of") || 
    msg.includes("cannot contain a nested") ||
    msg.includes("Hydration failed") ||
    msg.includes("did not match")
  ) {
    return;
  }
  originalError.apply(console, args);
};

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <PrivyProvider
      appId={import.meta.env.VITE_PRIVY_APP_ID || ""}
      config={{
        loginMethods: ["email", "google", "passkey"],
        defaultChain: arcTestnet,
        supportedChains: [arcTestnet],
        embeddedWallets: {
          createOnLogin: "users-without-wallets",
          requireUserPasswordOnCreate: false,
          showWalletUIs: true
        },
        appearance: {
          accentColor: "#14b8a6",
          logo: "/icon.svg"
        }
      }}
    >
      <ToastProvider>
        <App />
      </ToastProvider>
    </PrivyProvider>
  </StrictMode>
);
