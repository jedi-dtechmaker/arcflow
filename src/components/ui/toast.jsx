import { createContext, useContext, useMemo, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const value = useMemo(
    () => ({
      toast: (toast) => {
        const id = crypto.randomUUID();
        setItems((current) => [...current, { ...toast, id }]);
        window.setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), 4200);
      }
    }),
    []
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 grid w-[calc(100vw-2rem)] gap-2 sm:w-96">
        {items.map((item) => (
          <div key={item.id} className="rounded-lg border bg-white p-4 shadow-lg dark:bg-slate-950">
            <div className="flex gap-3">
              {item.tone === "error" ? <XCircle className="h-5 w-5 text-red-500" /> : <CheckCircle2 className="h-5 w-5 text-teal-500" />}
              <div>
                <p className="font-medium">{item.title}</p>
                {item.description ? <p className="mt-1 text-sm text-slate-500">{item.description}</p> : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}
