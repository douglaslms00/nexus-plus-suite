import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  INACTIVITY_LIMIT_MS,
  INACTIVITY_WARNING_BEFORE_MS,
  clearActivity,
  getLastActivity,
  getRememberMe,
  touchActivity,
} from "@/lib/session-inactivity";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "click", "scroll", "touchstart"] as const;
const CHECK_INTERVAL_MS = 15_000;
const TOUCH_THROTTLE_MS = 30_000;

function formatRemaining(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m <= 0) return `${s}s`;
  return `${m}min ${String(s).padStart(2, "0")}s`;
}

/**
 * Vigia global de inatividade. Deve ser montado uma única vez (no root).
 * - Se "permanecer conectado" estiver ativo, não faz nada.
 * - Caso contrário, desloga após 1h sem interação, com aviso 5 min antes.
 */
export function SessionInactivityGuard() {
  const navigate = useNavigate();
  const { location } = useRouterState();
  const [hasSession, setHasSession] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [remainingMs, setRemainingMs] = useState(INACTIVITY_WARNING_BEFORE_MS);
  const lastTouchRef = useRef(0);
  const loggingOutRef = useRef(false);
  const locationRef = useRef(location.pathname);
  locationRef.current = location.pathname;

  const doLogout = useCallback(
    async (reason: "idle" | "manual-warn") => {
      if (loggingOutRef.current) return;
      loggingOutRef.current = true;
      setShowWarning(false);
      try {
        await supabase.auth.signOut();
      } catch (e) {
        console.warn("[sessão] falha ao encerrar por inatividade:", e);
      } finally {
        clearActivity();
        toast.info("Sessão encerrada após 1 hora de inatividade.");
        navigate({ to: "/auth", replace: true, search: { expired: "1", reset: undefined } });
        // Fallback caso a navegação SPA não dispare (ex.: rota pública)
        if (locationRef.current !== "/auth") {
          window.setTimeout(() => {
            if (window.location.pathname !== "/auth") window.location.href = "/auth?expired=1";
          }, 500);
        }
        loggingOutRef.current = false;
      }
      void reason;
    },
    [navigate],
  );

  // Acompanha estado de autenticação
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setHasSession(!!data.session);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      setHasSession(!!session);
      if (event === "SIGNED_IN") {
        // Se é um login novo (sem last-activity), inicializa o relógio.
        if (!getRememberMe() && getLastActivity() == null) touchActivity();
        setShowWarning(false);
      }
      if (event === "SIGNED_OUT") {
        clearActivity();
        setShowWarning(false);
      }
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Registra atividade (throttled) — só quando o controle está ativo
  useEffect(() => {
    if (!hasSession) return;
    if (locationRef.current === "/auth") return;
    if (getRememberMe()) return;

    const onActivity = () => {
      const now = Date.now();
      if (now - lastTouchRef.current < TOUCH_THROTTLE_MS) return;
      lastTouchRef.current = now;
      touchActivity(now);
      // Qualquer interação fecha o aviso e reinicia a contagem
      setShowWarning(false);
    };

    // Garante um marco inicial caso o login não tenha registrado
    if (getLastActivity() == null) {
      lastTouchRef.current = Date.now();
      touchActivity();
    }

    ACTIVITY_EVENTS.forEach((ev) =>
      window.addEventListener(ev, onActivity, { passive: true }),
    );
    return () => {
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, onActivity));
    };
  }, [hasSession, location.pathname]);

  // Verificação periódica do tempo ocioso
  useEffect(() => {
    if (!hasSession) {
      setShowWarning(false);
      return;
    }
    if (getRememberMe()) {
      setShowWarning(false);
      return;
    }
    if (location.pathname === "/auth") {
      setShowWarning(false);
      return;
    }

    const tick = () => {
      if (getRememberMe()) {
        setShowWarning(false);
        return;
      }
      const last = getLastActivity();
      if (last == null) {
        touchActivity();
        return;
      }
      const idle = Date.now() - last;
      const remaining = INACTIVITY_LIMIT_MS - idle;
      if (remaining <= 0) {
        void doLogout("idle");
      } else if (remaining <= INACTIVITY_WARNING_BEFORE_MS) {
        setRemainingMs(remaining);
        setShowWarning(true);
      } else {
        setShowWarning(false);
      }
    };

    tick();
    const id = window.setInterval(tick, CHECK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [hasSession, location.pathname, doLogout]);

  const handleStayConnected = useCallback(() => {
    lastTouchRef.current = Date.now();
    touchActivity();
    setShowWarning(false);
    toast.success("Sessão mantida — contador de inatividade reiniciado.");
  }, []);

  if (!showWarning || !hasSession) return null;

  return (
    <Dialog open={showWarning} onOpenChange={(open) => !open && handleStayConnected()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sessão expirando por inatividade</DialogTitle>
          <DialogDescription>
            Você será desconectado automaticamente em{" "}
            <strong className="text-foreground">{formatRemaining(remainingMs)}</strong> por
            segurança, após 1 hora sem atividade.
          </DialogDescription>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Para evitar o logout, marque &quot;Permanecer conectado&quot; ao entrar — ou clique
          abaixo para continuar agora.
        </p>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => void doLogout("manual-warn")}>
            Sair agora
          </Button>
          <Button onClick={handleStayConnected}>Continuar conectado</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
