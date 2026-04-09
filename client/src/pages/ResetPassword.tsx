import { useState, useEffect } from "react";
import { useLocation } from "wouter";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [token, setToken] = useState("");
  const [, setLocation] = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token");
    if (!t) {
      setStatus("error");
      setMessage("Invalid reset link.");
    } else {
      setToken(t);
    }
  }, []);

  const handleSubmit = async () => {
    if (!password || password.length < 8) {
      setMessage("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setMessage("Passwords do not match.");
      return;
    }
    setStatus("loading");
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (res.ok) {
        setStatus("success");
        setMessage("Password reset! Redirecting to login...");
        setTimeout(() => setLocation("/"), 2000);
      } else {
        const data = await res.json();
        setStatus("error");
        setMessage(data.error || "Failed to reset password.");
      }
    } catch {
      setStatus("error");
      setMessage("Network error. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-card border border-border rounded-xl p-8 shadow-lg">
        <h1 className="text-2xl font-bold text-center mb-2">Reset Password</h1>
        <p className="text-muted-foreground text-center mb-6">Enter your new password below.</p>
        {status !== "success" && (
          <div className="space-y-4">
            <input
              type="password"
              placeholder="New password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <input
              type="password"
              placeholder="Confirm new password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {message && (
              <p className="text-sm text-red-500">{message}</p>
            )}
            <button
              onClick={handleSubmit}
              disabled={status === "loading"}
              className="w-full bg-primary text-primary-foreground py-2 rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
            >
              {status === "loading" ? "Resetting..." : "Reset Password"}
            </button>
          </div>
        )}
        {status === "success" && (
          <p className="text-green-500 text-center">{message}</p>
        )}
        {status === "error" && !token && (
          <p className="text-red-500 text-center">{message}</p>
        )}
      </div>
    </div>
  );
}
