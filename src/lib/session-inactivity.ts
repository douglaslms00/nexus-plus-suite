/**
 * Controle de sessão por inatividade.
 *
 * Regra: após 1 hora sem interação, o usuário é deslogado automaticamente,
 * exceto quando marcou "Permanecer conectado" na tela de login.
 */

export const INACTIVITY_LIMIT_MS = 60 * 60 * 1000; // 1 hora
/** Quanto tempo antes do logout o aviso é exibido. */
export const INACTIVITY_WARNING_BEFORE_MS = 5 * 60 * 1000; // 5 minutos

export const REMEMBER_ME_KEY = "gestaopro:remember-me";
export const LAST_ACTIVITY_KEY = "gestaopro:last-activity";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

/** true = usuário optou por NÃO ser desconectado automaticamente. */
export function getRememberMe(): boolean {
  if (!canUseStorage()) return false;
  try {
    return window.localStorage.getItem(REMEMBER_ME_KEY) === "1";
  } catch {
    return false;
  }
}

export function setRememberMe(value: boolean): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(REMEMBER_ME_KEY, value ? "1" : "0");
  } catch {
    // storage indisponível (modo privado etc.) — ignora
  }
}

export function getLastActivity(): number | null {
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(LAST_ACTIVITY_KEY);
    if (!raw) return null;
    const ts = Number(raw);
    return Number.isFinite(ts) && ts > 0 ? ts : null;
  } catch {
    return null;
  }
}

/** Registra o momento atual como última atividade. */
export function touchActivity(now: number = Date.now()): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
  } catch {
    // ignora
  }
}

export function clearActivity(): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(LAST_ACTIVITY_KEY);
  } catch {
    // ignora
  }
}

/** Quanto tempo (ms) falta para o logout automático. Null = sem controle ativo. */
export function getIdleMs(now: number = Date.now()): number | null {
  const last = getLastActivity();
  if (last == null) return null;
  return Math.max(0, now - last);
}
