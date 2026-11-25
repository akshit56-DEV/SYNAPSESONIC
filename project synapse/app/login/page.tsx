"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Info, Mail, RotateCw } from "lucide-react";
import { ElectricLogo } from "@/components/brand-logo";
import { Aurora } from "@/components/motion/Aurora";
import { ClickSpark } from "@/components/motion/ClickSpark";
import { LatticeLoader } from "@/components/motion/LatticeLoader";
import { CodeSlots } from "@/components/motion/CodeSlots";
import {
  supabase,
  isSupabaseConfigured,
  signInWithGoogle,
  sendEmailOtp,
  verifyEmailOtp,
} from "@/lib/supabase";

type AuthStep = "email" | "otp";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<AuthStep>("email");
  const [googleLoading, setGoogleLoading] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const verifyingLockRef = useRef(false);

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

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setInterval(() => {
      setCooldown((c) => (c > 1 ? c - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [cooldown]);

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    setError(null);
    const { error: authError } = await signInWithGoogle();
    if (authError) {
      setError(authError);
      setGoogleLoading(false);
    }
  }

  async function handleSendOtp(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const clean = email.trim();
    if (!clean || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      setError("Please enter a valid email address.");
      return;
    }

    setSendingOtp(true);
    setError(null);
    const { error: otpError } = await sendEmailOtp(clean);
    setSendingOtp(false);

    if (otpError) {
      setError(otpError);
      return;
    }

    setOtpCode("");
    setCooldown(60);
    setStep("otp");
  }

  async function handleVerifyOtp(tokenOverride?: string) {
    const token = (tokenOverride ?? otpCode).trim();
    if (token.length !== 6 || verifyingLockRef.current) return;

    verifyingLockRef.current = true;
    setVerifyingOtp(true);
    setError(null);

    const { data, error: verifyError } = await verifyEmailOtp(email, token);
    if (verifyError || !data?.session) {
      setError(
        verifyError || "Invalid or expired code. Please check and try again."
      );
      setVerifyingOtp(false);
      verifyingLockRef.current = false;
      return;
    }

    router.push("/workspace");
  }

  async function handleResendOtp() {
    if (cooldown > 0 || sendingOtp) return;
    setSendingOtp(true);
    setError(null);
    const { error: otpError } = await sendEmailOtp(email);
    setSendingOtp(false);

    if (otpError) {
      setError(otpError);
      return;
    }
    setOtpCode("");
    setCooldown(60);
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
      <div className="min-h-screen bg-[#0B0B0C] text-zinc-100 flex flex-col items-center justify-center p-6 relative overflow-hidden">
        <Aurora />

        <Link
          href="/"
          className="relative z-10 sm:absolute sm:top-6 sm:left-6 mb-6 sm:mb-0 self-start flex items-center gap-2 text-zinc-400 hover:text-white text-xs font-mono uppercase tracking-wider transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Home</span>
        </Link>

        <div className="relative z-10 w-full max-w-[420px] bg-[#141416]/90 backdrop-blur-2xl border border-white/10 rounded-2xl px-8 py-9 shadow-[0_28px_90px_rgba(0,0,0,0.72)] overflow-hidden">
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
              Sync your decks across devices
            </h1>
            <p className="text-sm text-zinc-400 mt-1.5 leading-relaxed">
              Keep your 3D knowledge graphs, forged bridges, and mastery
              progress backed up automatically.
            </p>
          </div>

          <div className="h-px bg-white/10 mb-6" />

          {!isSupabaseConfigured ? (
            <div className="px-4 py-3.5 rounded-xl bg-[#0B0B0C] border border-white/10 text-xs text-zinc-400 leading-relaxed flex items-start gap-2.5">
              <Info className="w-4 h-4 text-[#C6F432] shrink-0 mt-0.5" />
              <span>
                Cloud sync is not configured yet. Add Supabase environment
                variables to enable Google or Email OTP sign-in.
              </span>
            </div>
          ) : step === "email" ? (
            <div
              key="step-email"
              className="space-y-5 animate-[ssAuthFade_220ms_ease-out]"
            >
              {/* Google OAuth */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={googleLoading || sendingOtp}
                className={`w-full flex items-center justify-center gap-3 px-5 py-3.5 rounded-xl text-sm font-semibold transition-all ${
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

              {/* Hairline Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider whitespace-nowrap">
                  or continue with email
                </span>
                <div className="flex-1 h-px bg-white/10" />
              </div>

              {/* Email Input + Send Login Code */}
              <form onSubmit={handleSendOtp} className="space-y-3">
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
                      disabled={sendingOtp || googleLoading}
                      className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#0B0B0C] border border-white/15 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#C6F432] transition-colors disabled:opacity-60"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={sendingOtp || googleLoading}
                  className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#C6F432] text-[#0B0B0C] hover:bg-[#d4f75c] text-sm font-semibold transition-all cursor-pointer disabled:opacity-60 disabled:cursor-wait shadow-[0_0_24px_rgba(198,244,50,0.18)]"
                >
                  {sendingOtp ? (
                    <>
                      <LatticeLoader size={16} color="#09090B" />
                      <span>Sending Code...</span>
                    </>
                  ) : (
                    <>
                      <span>Send Login Code</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </div>
          ) : (
            <div
              key="step-otp"
              className="space-y-5 animate-[ssAuthFade_220ms_ease-out]"
            >
              <div className="space-y-1.5">
                <p className="text-sm text-zinc-300 leading-relaxed">
                  Enter the 6-digit code sent to{" "}
                  <span className="font-semibold text-white break-all">
                    {email.trim()}
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setStep("email");
                    setOtpCode("");
                    setError(null);
                    verifyingLockRef.current = false;
                  }}
                  className="text-xs font-mono text-[#C6F432] hover:underline cursor-pointer"
                >
                  Change email
                </button>
              </div>

              <CodeSlots
                value={otpCode}
                onChange={(val) => {
                  setOtpCode(val);
                  if (error) setError(null);
                }}
                onComplete={(code) => void handleVerifyOtp(code)}
                disabled={verifyingOtp}
                hasError={Boolean(error)}
              />

              <button
                type="button"
                onClick={() => void handleVerifyOtp()}
                disabled={otpCode.length !== 6 || verifyingOtp}
                className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#C6F432] text-[#0B0B0C] hover:bg-[#d4f75c] text-sm font-semibold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_24px_rgba(198,244,50,0.18)]"
              >
                {verifyingOtp ? (
                  <>
                    <LatticeLoader size={16} color="#09090B" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <span>Verify &amp; Enter</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>Didn&apos;t receive it?</span>
                <button
                  type="button"
                  onClick={() => void handleResendOtp()}
                  disabled={cooldown > 0 || sendingOtp || verifyingOtp}
                  className="inline-flex items-center gap-1.5 font-mono text-zinc-200 hover:text-[#C6F432] disabled:text-zinc-500 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <RotateCw
                    className={`w-3.5 h-3.5 ${sendingOtp ? "animate-spin" : ""}`}
                  />
                  <span>
                    {cooldown > 0
                      ? `Resend in ${cooldown}s`
                      : sendingOtp
                        ? "Sending..."
                        : "Resend code"}
                  </span>
                </button>
              </div>
            </div>
          )}

          {error && (
            <p className="mt-3 text-xs text-red-400 leading-relaxed">{error}</p>
          )}

          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider">
              or
            </span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          <Link
            href="/workspace"
            className="flex items-center justify-center w-full px-5 py-3 rounded-xl bg-[#0B0B0C] text-zinc-200 border border-white/10 text-sm font-medium hover:border-white/25 hover:text-white transition-colors"
          >
            Continue as Guest →
          </Link>

          <p className="mt-5 text-[11px] text-zinc-500 text-center leading-relaxed">
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
