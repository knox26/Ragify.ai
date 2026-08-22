export function SocialProof() {
  return (
    <section className="border-y border-[var(--border-color)] py-10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
        <span className="text-sm text-[var(--text-secondary)]">
          Trusted by research, legal, and finance teams
        </span>
        <span className="text-sm text-[var(--text-secondary)]">
          <strong className="font-semibold font-mono text-[var(--accent)]">
            1M+
          </strong>{" "}
          documents indexed ·{" "}
          <strong className="font-semibold font-mono text-[var(--accent)]">
            5M+
          </strong>{" "}
          cited answers
        </span>
      </div>
    </section>
  );
}
