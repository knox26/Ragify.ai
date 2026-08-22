import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, BadgeCheck, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import { RagifyMark } from "../ui/RagifyMark";

/**
 * AuthLayout — the sign-in / sign-up stage.
 *
 * Deliberately not a centered glass card. It extends the landing's
 * "data command" language: full-bleed dark stage, hero mesh wash, floating
 * pill nav, mono eyebrows. The right column carries the landing's signature —
 * the cited-answer sheet — so the thing you're signing in to is visible
 * before you sign in.
 */

interface AuthLayoutProps {
  /** Mono uppercase section label, e.g. "Ragify · Sign in" */
  eyebrow: string;
  title: ReactNode;
  subtitle: string;
  children: ReactNode;
}

/** Footnote marker — the magenta badge from the landing hero. */
function FootnoteMarker({ n }: { n: number }) {
  return (
    <sup className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-[var(--accent-2)] text-white text-[10px] font-mono font-semibold align-super mx-0.5 -translate-y-1">
      {n}
    </sup>
  );
}

const footnotes = [
  {
    n: 1,
    ref: "Security_Report.pdf · p.3",
    quote:
      "MFA became mandatory for every employee account on May 12, closing the last standing access gap.",
  },
  {
    n: 2,
    ref: "Security_Report.pdf · p.6",
    quote:
      "Vendor review now runs quarterly; two high-risk dependencies were replaced in June.",
  },
];

/** The cited-answer sheet — Ragify's signature device, echoed from the hero. */
function AnswerSheet() {
  return (
    <div className="card rounded-2xl overflow-hidden">
      {/* Sheet header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-[var(--border-color)] bg-[var(--bg-section)]/60">
        <div className="h-8 w-8 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] flex items-center justify-center shrink-0">
          <FileText className="w-4 h-4 text-[var(--accent)]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-mono font-medium text-[var(--text-primary)] truncate">
            workspace.ragify.ai
          </p>
          <p className="text-xs font-mono text-[var(--text-secondary)] flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            4 documents indexed
          </p>
        </div>
        <span className="text-xs font-mono text-[var(--text-secondary)] shrink-0">
          ask.ragify.ai
        </span>
      </div>

      {/* The page */}
      <div className="px-8 py-8">
        <p className="text-xs eyebrow mb-3" style={{ color: "var(--accent)" }}>
          Ask
        </p>
        <p className="text-lg font-medium text-[var(--text-primary)]">
          What changed in our security posture last quarter?
        </p>
        <p className="mt-6 text-[15px] leading-[1.9] text-[var(--text-primary)]">
          Access control tightened across the board. MFA became mandatory for
          every account<FootnoteMarker n={1} />, and the vendor review cycle now
          runs quarterly — which surfaced two high-risk dependencies, replaced
          in June<FootnoteMarker n={2} />.
        </p>

        <div className="mt-8 mb-4 border-t border-[var(--border-color)]" />

        <div className="space-y-3">
          {footnotes.map((f) => (
            <div key={f.n} className="flex gap-3">
              <span className="text-xs font-mono font-semibold text-[var(--accent-2)] pt-0.5 shrink-0">
                {f.n}.
              </span>
              <div>
                <p className="text-xs font-mono text-[var(--text-secondary)] mb-0.5">
                  {f.ref}
                </p>
                <p className="text-sm italic text-[var(--text-secondary)] leading-relaxed">
                  “{f.quote}”
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Sheet footer */}
      <div className="px-8 py-4 border-t border-[var(--border-color)] bg-[var(--bg-section)]/60 flex items-center justify-between">
        <span className="text-xs font-mono text-[var(--text-secondary)]">
          gpt-4o · 142ms
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs font-mono text-[var(--text-secondary)]">
          <BadgeCheck className="w-3.5 h-3.5 text-[var(--accent-2)]" />
          Every claim is cited
        </span>
      </div>
    </div>
  );
}

/** Floating pill nav — the same treatment as the landing navbar, minus anchors. */
function AuthHeader() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 px-4">
      <div className="max-w-6xl mx-auto mt-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl backdrop-saturate-150 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]">
          <div className="flex items-center justify-between h-14 px-3 md:px-4">
            <Link to="/" className="flex items-center gap-2.5 pl-1 shrink-0">
              <div className="w-8 h-8 rounded-full bg-[var(--text-primary)] flex items-center justify-center">
                <RagifyMark className="w-4 h-4 text-[var(--bg-primary)]" />
              </div>
              <span className="text-lg font-bold tracking-tight text-[var(--text-primary)]">
                Ragify
              </span>
            </Link>
            <Link
              to="/"
              className="hidden sm:flex items-center gap-1.5 text-sm font-medium text-neutral-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to home
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}

/** Divider — mono utility voice, like the rest of the page. */
export function AuthDivider({ label = "Or continue with" }: { label?: string }) {
  return (
    <div className="mt-6 flex items-center gap-4">
      <div className="flex-1 h-px bg-white/10" />
      <span className="text-xs font-mono uppercase tracking-widest text-[var(--text-secondary)]">
        {label}
      </span>
      <div className="flex-1 h-px bg-white/10" />
    </div>
  );
}

/** Social buttons — quiet pills in the floating-nav language. */
export function SocialButtons() {
  return (
    <div className="mt-6 grid grid-cols-2 gap-4">
      <button
        type="button"
        className="flex items-center justify-center gap-2 py-2.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
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
        <span className="text-sm font-medium text-[var(--text-primary)]">
          Google
        </span>
      </button>
      <button
        type="button"
        className="flex items-center justify-center gap-2 py-2.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
      >
        <svg
          className="w-5 h-5"
          fill="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
            clipRule="evenodd"
          />
        </svg>
        <span className="text-sm font-medium text-[var(--text-primary)]">
          GitHub
        </span>
      </button>
    </div>
  );
}

export function AuthLayout({
  eyebrow,
  title,
  subtitle,
  children,
}: AuthLayoutProps) {
  return (
    <div className="landing min-h-screen bg-[var(--bg-primary)] relative overflow-hidden selection:bg-[var(--accent)] selection:text-white">
      {/* Ambient wash — same as the hero */}
      <div className="absolute inset-0 hero-mesh" />

      <AuthHeader />

      <main className="relative z-10 min-h-screen flex items-center">
        <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 pt-28 pb-16">
          <div className="grid lg:grid-cols-[1.05fr_1fr] gap-14 lg:gap-16 items-center">
            {/* Left — the form, set directly on the mesh like the hero headline */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            >
              <p className="text-xs eyebrow mb-5" style={{ color: "var(--accent)" }}>
                {eyebrow}
              </p>
              <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-[var(--text-primary)] leading-[1.08]">
                {title}
              </h1>
              <p className="mt-4 text-base sm:text-lg text-[var(--text-secondary)] max-w-md">
                {subtitle}
              </p>
              <div className="mt-10 max-w-md">{children}</div>
            </motion.div>

            {/* Right — what you're signing in to */}
            <motion.div
              className="hidden lg:block"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.15, ease: "easeOut" }}
            >
              <AnswerSheet />
            </motion.div>
          </div>
        </div>
      </main>
    </div>
  );
}
