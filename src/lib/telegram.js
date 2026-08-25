/**
 * Telegram Mini App SDK Helper Utilities
 */

export function getTelegramWebApp() {
  if (typeof window !== "undefined" && window.Telegram && window.Telegram.WebApp) {
    return window.Telegram.WebApp;
  }
  return null;
}

export function isTelegramWebApp() {
  const tg = getTelegramWebApp();
  return !!(tg && tg.initData && tg.initData.length > 0);
}

export function getTelegramUser() {
  const tg = getTelegramWebApp();
  if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
    return tg.initDataUnsafe.user;
  }
  return null;
}

export function setupTelegramUI() {
  const tg = getTelegramWebApp();
  if (!tg) return;

  try {
    tg.ready();
    tg.expand();
    if (tg.setHeaderColor) {
      tg.setHeaderColor('#070611');
    }
    if (tg.setBackgroundColor) {
      tg.setBackgroundColor('#070611');
    }
  } catch (err) {
    console.warn("Telegram WebApp setup warning:", err);
  }
}

export function triggerTelegramHaptic(type = "impact", style = "medium") {
  const tg = getTelegramWebApp();
  if (!tg || !tg.HapticFeedback) return;

  try {
    if (type === "impact") {
      tg.HapticFeedback.impactOccurred(style);
    } else if (type === "notification") {
      tg.HapticFeedback.notificationOccurred(style); // 'error' | 'success' | 'warning'
    } else if (type === "selection") {
      tg.HapticFeedback.selectionChanged();
    }
  } catch (err) {
    // Ignore if unsupported
  }
}
