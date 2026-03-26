import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { supabase, supabaseConfigured } from "@/lib/supabase";

export function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"error" | "info">("error");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (!supabaseConfigured) {
      setMessageTone("error");
      setMessage(
        "Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env",
      );
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessageTone("info");
        setMessage(
          "Revisa tu correo para confirmar la cuenta (si está activado).",
        );
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
    } catch (err: unknown) {
      setMessageTone("error");
      setMessage(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="tf-panel w-full max-w-md p-8">
        <h1 className="mb-1 font-display text-3xl font-bold text-ui-ink">
          Together Farm
        </h1>
        <p className="mb-6 text-sm font-medium text-ui-ink/80">
          {mode === "login" ? "Entrar" : "Crear cuenta"}
        </p>
        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ui-ink/70">
              Email
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="tf-input"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ui-ink/70">
              Contraseña
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="tf-input"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="tf-btn-primary w-full py-3 text-base"
          >
            {busy ? "…" : mode === "login" ? "Entrar" : "Registrarse"}
          </button>
        </form>
        <p className="mt-5 text-center text-sm">
          <button
            type="button"
            className="font-bold text-pastel-sky underline decoration-2 underline-offset-2 hover:text-ui-ink"
            onClick={() =>
              setMode((m) => (m === "login" ? "signup" : "login"))
            }
          >
            {mode === "login"
              ? "¿Sin cuenta? Registrarse"
              : "¿Ya tienes cuenta? Entrar"}
          </button>
        </p>
        {message && (
          <p
            className={
              messageTone === "error"
                ? "mt-4 rounded-2xl border-2 border-red-400 bg-red-50 px-3 py-2 text-sm font-medium text-red-800"
                : "mt-4 rounded-2xl border-2 border-pastel-mint bg-pastel-mint/30 px-3 py-2 text-sm font-medium text-ui-ink"
            }
          >
            {message}
          </p>
        )}
        <p className="mt-8 text-center text-xs text-ui-ink/60">
          <Link to="/" className="tf-link text-xs">
            Volver
          </Link>
        </p>
      </div>
    </div>
  );
}
