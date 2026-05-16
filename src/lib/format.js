import { ARC_EXPLORER_URL } from "@/lib/arc";

export function formatUsd(value) {
  return new Intl.NumberFormat("en", { style: "currency", currency: "USD" }).format(Number.isFinite(value) ? value : 0);
}

export function makeExplorerUrl(txHash) {
  return `${ARC_EXPLORER_URL}/tx/${txHash}`;
}

export function appUrl() {
  return import.meta.env.VITE_APP_URL || window.location.origin;
}

export function makeClaimUrl(code) {
  return `${appUrl()}/claim/${code}`;
}

export function makeFlowUrl(slug) {
  return `${appUrl()}/flow/${slug}`;
}
