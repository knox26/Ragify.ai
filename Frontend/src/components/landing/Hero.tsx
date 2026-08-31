import { motion } from "framer-motion";
import { ArrowRight, BadgeCheck, FileText, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

/**
 * Footnote marker — the signature. The answer reads like a printed page;
 * every factual claim carries a footnote marker resolving to a real quote.
 */
function FootnoteMarker({ n }: { n: number }) {
  return (
    <sup className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-[var(--accent-2)] text-white text-[10px] font-mono font-semibold align-super mx-0.5 -translate-y-1 cursor-pointer hover:opacity-85 transition-opacity">
      {n}
    </sup>
  );
}

const footnotes = [
  {
    n: 1,
    ref: "Q3_Financial_Report.pdf · p.14",
    quote:
      "Enterprise expansion across EMEA drove +$6.4M in Q3, led by new partnership agreements signed in DACH and Nordic.",
  },
  {
    n: 2,
    ref: "Q3_Financial_Report.pdf · p.17",
    quote: "API V2 launched in September, contributing $3.1M in new ARR.",
  },
];

export function Hero() {
  return (
    <section className="relative pt-32 pb-24 lg:pt-44 lg:pb-32 overflow-hidden">
      {/* Ambient background — blue gradient wash behind the headline */}
      <div className="absolute inset-0 hero-mesh" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Headline */}
        <motion.div
          className="max-w-4xl mx-auto text-center"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--border-color)] bg-[var(--bg-card)] font-mono text-xs uppercase tracking-widest text-[var(--text-secondary)] mb-8">
            <Sparkles className="w-4 h-4 text-[var(--accent)]" />
            Grounded in your files
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-[var(--text-primary)] leading-[1.05]">
            <span className="gradient-text">
              Ask your documents
              <br />
              anything.
            </span>
          </h1>

          <p className="mt-6 text-lg lg:text-xl text-[var(--text-secondary)] max-w-2xl mx-auto">
            Upload PDFs, contracts, and reports. Then talk to them like a
            colleague who's read everything — every answer comes with the exact
            page it came from.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/signup"
              className="w-full sm:w-auto px-8 py-4 rounded-full bg-[var(--accent)] text-white font-semibold text-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-2 shadow-lg shadow-[var(--accent-glow)]"
            >
              Start free <ArrowRight className="w-5 h-5" />
            </Link>
            <a
              href="#answer"
              className="w-full sm:w-auto px-8 py-4 rounded-full bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-color)] font-semibold text-lg hover:bg-[var(--bg-section)] transition-colors"
            >
              See a cited answer
            </a>
          </div>
        </motion.div>

        {/* Live answer — the answer as a printed page with footnotes.
            Editorial, not chat. Every claim carries a footnote that quotes
            the source passage verbatim. */}
        <motion.div
          id="answer"
          className="mt-20 max-w-3xl mx-auto card rounded-2xl overflow-hidden scroll-mt-24"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: "easeOut" }}
        >
          {/* Sheet header */}
          <div className="flex items-center gap-3 px-6 py-4 border-b border-[var(--border-color)] bg-[var(--bg-section)]/60">
            <div className="h-8 w-8 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4 text-[var(--accent)]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-mono font-medium text-[var(--text-primary)] truncate">
                Q3_Financial_Report.pdf
              </p>
              <p className="text-xs font-mono text-[var(--text-secondary)] flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                23 sources indexed
              </p>
            </div>
            <span className="text-xs font-mono text-[var(--text-secondary)] shrink-0">
              ask.ragify.ai
            </span>
          </div>

          {/* The page */}
          <div className="px-8 py-8 sm:px-10 sm:py-10">
            {/* query line */}
            <p className="text-xs eyebrow mb-3" style={{ color: "var(--accent)" }}>
              Ask
            </p>
            <p className="text-xl font-medium text-[var(--text-primary)]">
              What drove our revenue growth in Q3?
            </p>

            {/* answer body — printed copy */}
            <p className="mt-8 text-lg leading-[1.9] text-[var(--text-primary)]">
              Revenue grew{" "}
              <strong className="font-mono font-semibold">15%</strong>{" "}
              year-over-year to{" "}
              <strong className="font-mono font-semibold">$42.7M</strong>.
              The growth was driven by enterprise expansion in EMEA
              <FootnoteMarker n={1} /> and the launch of API&nbsp;V2
              <FootnoteMarker n={2} />, with both contributing meaningful
              new recurring revenue in the quarter.
            </p>

            {/* footnote rule */}
            <div className="mt-10 mb-4 border-t border-[var(--border-color)]" />

            {/* footnotes — quoted source passages */}
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

          {/* footer */}
          <div className="px-8 py-4 border-t border-[var(--border-color)] bg-[var(--bg-section)]/60 flex items-center justify-between">
            <span className="text-xs font-mono text-[var(--text-secondary)]">
              gpt-4o · 142ms
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs font-mono text-[var(--text-secondary)]">
              <BadgeCheck className="w-3.5 h-3.5 text-[var(--accent-2)]" />
              Every claim is cited
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
