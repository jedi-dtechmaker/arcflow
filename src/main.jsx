import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/App";
import { ToastProvider } from "@/components/ui/toast";
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
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>
);
