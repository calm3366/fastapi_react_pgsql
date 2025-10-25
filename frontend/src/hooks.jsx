// frontend/src/hooks.jsx
import React, { createContext, useContext, useCallback, useState } from "react";

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState({ message: "", type: "" });

  const showToast = useCallback((message, type = "success", ttl = 5000) => {
    setToast({ message, type });
    if (ttl) setTimeout(() => setToast({ message: "", type: "" }), ttl);
  }, []);

  return (
    <ToastContext.Provider value={{ toast, showToast }}>
      {children}
      {toast.message && (
        <div
          className={`app-toast app-toast-${toast.type}`}
          style={{
            position: "fixed",
            right: 16,
            top: 16,
            zIndex: 9999,
            padding: "10px 14px",
            borderRadius: 6,
            background: toast.type === "error" ? "#b00020" : "#1b6",
            color: "#fff",
            boxShadow: "0 4px 12px rgba(0,0,0,0.12)"
          }}
        >
          {toast.message}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToastContext() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToastContext must be used within ToastProvider");
  return ctx;
}
