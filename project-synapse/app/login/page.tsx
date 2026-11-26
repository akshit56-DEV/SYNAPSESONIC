"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Info,
  Lock,
  Mail,
} from "lucide-react";
import { ElectricLogo } from "@/components/brand-logo";
import { Aurora } from "@/components/motion/Aurora";
import { ClickSpark } from "@/components/motion/ClickSpark";
import { LatticeLoader } from "@/components/motion/LatticeLoader";
import {
  supabase,
  isSupabaseConfigured,
  signInWithGoogle,
  signInWithEmailPassword,
  signUpWithEmailPassword,
} from "@/lib/supabase";

type AuthMode = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setCheckingSession(false);
      return;
    }

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (data.session?.user) {
          router.replace("/workspace");
        } else {
          setCheckingSession(false);
        }
      })
      .catch(() => {
        setCheckingSession(false);
      });
  }, [router]);

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    setError(null);
    const { error: authError } = await signInWithGoogle();
    if (authError) {
      setError(authError);
      setGoogleLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!password || password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setSubmitting(true);
    setError(null);

    if (mode === "signin") {
      const { user, error: signInError } = await signInWithEmailPassword(
        cleanEmail,
        password
      );
      if (signInError || !user) {
        setError(signInError || "Invalid email or password.");
        setSubmitting(false);
        return;
      }
      router.push("/workspace");
      return;
    }

    const { user, needsConfirmation, error: signUpError } =
      await signUpWithEmailPassword(cleanEmail, password);
    setSubmitting(false);

    if (signUpError || !user) {
      setError(signUpError || "Unable to create account.");
      return;
    }

    if (needsConfirmation) {
      setConfirmationSent(true);
      return;
    }

    router.push("/workspace");
  }

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-[#0B0B0C] flex items-center justify-center">
        <LatticeLoader size={28} label="Checking Session" />
      </div>
    );
  }

  return (
    <ClickSpark
      sparkColor="#C6F432"
      sparkCount={6}
      sparkSize={10}
      sparkRadius={22}
      duration={380}
    >
      <div className="min-h-screen bg-[#0B0B0C] text-zinc-100 flex flex-col items-center justify-center p-5 sm:p-6 relative overflow-hidden">
        <Aurora
          colorStops={["#C6F432", "#10B981", "#5227FF"]}
          direction="top"
          mouseInteraction={true}
          blend={0.5}
          amplitude={1.0}
          dpr={2}
        />

        <Link
          href="/"
          className="relative z-10 sm:absolute sm:top-6 sm:left-6 mb-5 sm:mb-0 self-start flex items-center gap-2 text-zinc-400 hover:text-white text-xs font-mono uppercase tracking-wider transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Home</span>
        </Link>

        <div className="relative z-10 w-full max-w-[420px] bg-[#141416]/90 backdrop-blur-2xl border border-white/10 rounded-2xl px-6 sm:px-8 py-8 shadow-[0_28px_90px_rgba(0,0,0,0.72)] overflow-hidden">
          {/* Subtle top specular sheen */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent"
          />

          <div className="flex flex-col items-start mb-6">
            <Link href="/" className="inline-flex mb-5" aria-label="SynapseSonic">
              <ElectricLogo size="lg" />
            </Link>
            <h1 className="text-2xl font-semibold text-white tracking-tight">
              {confirmationSent
                ? "Confirm your email"
                : mode === "signin"
                  ? "Welcome back"
                  : "Create your account"}
            </h1>
            <p className="text-sm text-zinc-400 mt-1.5 leading-relaxed">
              {confirmationSent
                ? "One quick click to activate your SynapseSonic workspace."
                : "Keep your 3D knowledge graphs, forged bridges, and mastery progress synced everywhere."}
            </p>
          </div>

          {!isSupabaseConfigured ? (
            <div className="px-4 py-3.5 rounded-xl bg-[#0B0B0C] border border-white/10 text-xs text-zinc-400 leading-relaxed flex items-start gap-2.5">
              <Info className="w-4 h-4 text-[#C6F432] shrink-0 mt-0.5" />
              <span>
                Cloud sync is not configured yet. Add Supabase environment
                variables to enable account sign-in.
              </span>
            </div>
          ) : confirmationSent ? (
            <div className="space-y-5 animate-[ssAuthFade_220ms_ease-out]">
              <div className="p-4 rounded-xl bg-[#C6F432]/10 border border-[#C6F432]/30 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-[#C6F432] shrink-0 mt-0.5" />
                <div className="text-sm text-zinc-200 leading-relaxed">
                  Check your email and click the confirmation link to enter{" "}
                  <span className="font-semibold text-white">SynapseSonic</span>.
                  <div className="mt-1.5 text-xs text-zinc-400 break-all">
                    Sent to {email.trim()}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setConfirmationSent(false);
                  setMode("signin");
                  setPassword("");
                  setError(null);
                }}
                className="w-full px-5 py-3 rounded-xl bg-[#0B0B0C] border border-white/15 hover:border-white/30 text-sm font-medium text-zinc-200 transition-colors cursor-pointer"
              >
                Back to Sign In
              </button>
            </div>
          ) : (
            <div className="space-y-5 animate-[ssAuthFade_220ms_ease-out]">
              {/* Sign In / Create Account Segmented Toggle */}
              <div
                role="tablist"
                aria-label="Authentication mode"
                className="grid grid-cols-2 p-1 rounded-xl bg-[#0B0B0C] border border-white/10"
              >
                {(
                  [
                    { id: "signin", label: "Sign In" },
                    { id: "signup", label: "Create Account" },
                  ] as const
                ).map((tab) => {
                  const active = mode === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => {
                        setMode(tab.id);
                        setError(null);
                      }}
                      className={`py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        active
                          ? "bg-[#C6F432] text-[#0B0B0C] shadow-sm"
                          : "text-zinc-400 hover:text-white"
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* Email + Password Form */}
              <form onSubmit={handleSubmit} className="space-y-3.5">
                <div>
                  <label
                    htmlFor="login-email"
                    className="block text-[11px] font-mono uppercase tracking-wider text-zinc-400 mb-1.5"
                  >
                    Email address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="login-email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (error) setError(null);
                      }}
                      placeholder="you@example.com"
                      disabled={submitting || googleLoading}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#0B0B0C] border border-white/15 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#C6F432] transition-colors disabled:opacity-60"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="login-password"
                    className="block text-[11px] font-mono uppercase tracking-wider text-zinc-400 mb-1.5"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="login-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete={
                        mode === "signin" ? "current-password" : "new-password"
                      }
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (error) setError(null);
                      }}
                      placeholder={
                        mode === "signup" ? "At least 6 characters" : "••••••••"
                      }
                      disabled={submitting || googleLoading}
                      className="w-full pl-10 pr-11 py-2.5 rounded-xl bg-[#0B0B0C] border border-white/15 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#C6F432] transition-colors disabled:opacity-60"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {error && (
                  <p className="text-xs text-red-400 leading-relaxed">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={submitting || googleLoading}
                  className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#C6F432] text-[#0B0B0C] hover:bg-[#d4f75c] text-sm font-semibold transition-all cursor-pointer disabled:opacity-60 disabled:cursor-wait shadow-[0_0_24px_rgba(198,244,50,0.18)]"
                >
                  {submitting ? (
                    <>
                      <LatticeLoader size={16} color="#09090B" />
                      <span>
                        {mode === "signin"
                          ? "Signing in..."
                          : "Creating account..."}
                      </span>
                    </>
                  ) : (
                    <>
                      <span>
                        {mode === "signin" ? "Sign In" : "Create Account"}
                      </span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              {/* Hairline "or" Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider">
                  or
                </span>
                <div className="flex-1 h-px bg-white/10" />
              </div>

              {/* Google OAuth */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={googleLoading || submitting}
                className={`w-full flex items-center justify-center gap-3 px-5 py-3 rounded-xl text-sm font-semibold transition-all ${
                  googleLoading
                    ? "bg-white/90 text-zinc-900 cursor-wait"
                    : "bg-white text-zinc-950 hover:bg-zinc-100 shadow-[0_6px_24px_rgba(255,255,255,0.12)] cursor-pointer"
                }`}
              >
                {googleLoading ? (
                  <>
                    <LatticeLoader size={16} color="#09090B" />
                    <span>Connecting...</span>
                  </>
                ) : (
                  <>
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      className="shrink-0"
                      aria-hidden="true"
                    >
                      <path
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        fill="#4285F4"
                      />
                      <path
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        fill="#34A853"
                      />
                      <path
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        fill="#FBBC05"
                      />
                      <path
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        fill="#EA4335"
                      />
                    </svg>
                    <span>Continue with Google</span>
                  </>
                )}
              </button>
            </div>
          )}

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider">
              or
            </span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          <Link
            href="/workspace"
            className="flex items-center justify-center w-full px-5 py-2.5 rounded-xl bg-[#0B0B0C] text-zinc-200 border border-white/10 text-sm font-medium hover:border-white/25 hover:text-white transition-colors"
          >
            Continue as Guest →
          </Link>

          <p className="mt-4 text-[11px] text-zinc-500 text-center leading-relaxed">
            Instant access in Guest Mode. Sign in anytime for multi-device cloud
            sync.
          </p>
        </div>

        <style>{`
          @keyframes ssAuthFade {
            from { opacity: 0; transform: translateY(6px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    </ClickSpark>
  );
}
