"use client";

import { useState } from "react";
import { auth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "../../lib/firebase";

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
      window.location.href = "/";
    } catch (err: any) {
      if (err.code === "auth/configuration-not-found") {
        setError(
          "Firebase Auth is not yet activated in this project's Firebase Console. Enable 'Email/Password' in Firebase Console > Authentication > Sign-in method, or click 'Continue in Demo Mode' below to test immediately."
        );
      } else {
        setError(err.message || "An error occurred during authentication.");
      }
    } finally {
      setLoading(false);
    }
  }

  function enterDemoMode() {
    sessionStorage.setItem("demo_user", email || "clinician@rounds.ai");
    window.location.href = "/";
  }

  return (
    <main>
      <header>
        <div>
          <p className="eyebrow">CLINICIAN PORTAL</p>
          <h1>RoundsAI Authentication</h1>
        </div>
      </header>
      <section className="input-card" style={{ maxWidth: "420px", margin: "2rem auto" }}>
        <h2>{isLogin ? "Sign In" : "Sign Up"}</h2>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "1rem" }}>
            <label htmlFor="email" style={{ display: "block", marginBottom: "0.5rem" }}>Email</label>
            <input 
              id="email" 
              type="email" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              required 
              style={{ width: "100%", padding: "0.5rem", border: "1px solid var(--line)", borderRadius: "4px" }} 
            />
          </div>
          <div style={{ marginBottom: "1rem" }}>
            <label htmlFor="password" style={{ display: "block", marginBottom: "0.5rem" }}>Password</label>
            <input 
              id="password" 
              type="password" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              required 
              style={{ width: "100%", padding: "0.5rem", border: "1px solid var(--line)", borderRadius: "4px" }} 
            />
          </div>
          <button disabled={loading} style={{ width: "100%", marginBottom: "0.75rem" }}>
            {loading ? "PROCESSING..." : (isLogin ? "SIGN IN" : "SIGN UP")}
          </button>
        </form>

        <div style={{ borderTop: "1px solid var(--line)", marginTop: "1rem", paddingTop: "1rem" }}>
          <button 
            type="button" 
            onClick={enterDemoMode}
            className="secondary"
            style={{ width: "100%", padding: "0.5rem", background: "var(--pale)", border: "1px solid var(--line)", cursor: "pointer", fontWeight: 600 }}
          >
            ⚡ Continue in Demo Mode (Skip Auth)
          </button>
        </div>

        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #f87171", borderRadius: "6px", padding: "0.75rem", marginTop: "1rem", color: "#991b1b", fontSize: "0.85rem", lineHeight: "1.4" }}>
            <p style={{ margin: 0, fontWeight: 600 }}>⚠ Authentication Notice</p>
            <p style={{ margin: "0.25rem 0 0" }}>{error}</p>
          </div>
        )}

        <div style={{ textAlign: "center", marginTop: "1rem" }}>
          <button 
            type="button" 
            className="secondary" 
            onClick={() => setIsLogin(!isLogin)}
            style={{ border: "none", background: "none", color: "var(--blue)", cursor: "pointer", textDecoration: "underline", fontSize: "0.875rem" }}
          >
            {isLogin ? "Need an account? Sign up" : "Already have an account? Sign in"}
          </button>
        </div>
      </section>
      <p className="disclaimer" style={{ textAlign: "center", marginTop: "2rem", color: "var(--muted)", fontSize: "0.875rem" }}>
        <strong>Clinician Disclaimer:</strong> This system is for authorized clinical personnel only. Access is monitored and logged.
      </p>
    </main>
  );
}
