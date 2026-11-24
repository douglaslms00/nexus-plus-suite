import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  if (!offline) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-[100] flex items-center justify-center gap-2 bg-warning px-3 py-2 text-sm font-medium text-warning-foreground shadow-lg">
      <WifiOff className="h-4 w-4" />
      Sem internet — mostrando os últimos dados vistos. Alterações ficam indisponíveis.
    </div>
  );
}
