import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useInView } from "framer-motion";
import {
  UploadCloud,
  Cpu,
  MessageSquareText,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";

// ─── Data ────────────────────────────────────────────────────────────────────

const steps = [
  {
    id: 1,
    label: "Upload docs",
    heading: "Upload your documents",
    description:
      "Drop in PDFs, Word docs, or plain text. Everything stays in your private workspace — never shared.",
    tag: "PDF · DOCX · TXT",
    icon: UploadCloud,
  },
  {
    id: 2,
    label: "AI indexes",
    heading: "AI builds understanding",
    description:
      "The engine indexes content semantically — not just keywords, but meaning, context, and relationships.",
    tag: "Deep semantic index",
    icon: Cpu,
  },
  {
    id: 3,
    label: "Get answers",
    heading: "Ask anything, get cited answers",
    description:
      "Ask in plain language. Every answer links back to the exact passage it came from.",
    tag: "Source citations",
    icon: MessageSquareText,
  },
];

const AUTOPLAY_DELAY = 3500;

// ─── Connector ───────────────────────────────────────────────────────────────

function Connector({ filled }: { filled: boolean }) {
  return (
    <div className="relative flex-1 h-px bg-[var(--border-color)] mb-7 overflow-hidden">
      <motion.div
        className="absolute inset-y-0 left-0 bg-[var(--text-primary)]"
        initial={{ width: "0%" }}
        animate={{ width: filled ? "100%" : "0%" }}
        transition={{ duration: 0.45, ease: "easeInOut" }}
      />
    </div>
  );
}

// ─── Node ────────────────────────────────────────────────────────────────────

function Node({
  step,
  state,
  onClick,
}: {
  step: (typeof steps)[number];
  state: "active" | "done" | "idle";
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={`Go to step ${step.id}: ${step.heading}`}
      className="flex flex-col items-center gap-2.5 cursor-pointer bg-transparent border-0 p-0 outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded-full"
    >
      {/* Circle */}
      <motion.div
        animate={
          state === "active"
            ? {
                backgroundColor: "var(--text-primary)",
                borderColor: "var(--text-primary)",
                color: "var(--bg-primary)",
              }
            : state === "done"
              ? {
                  backgroundColor: "var(--bg-section)",
                  borderColor: "var(--border-color)",
                  color: "var(--text-secondary)",
                }
              : {
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-color)",
                  color: "var(--text-secondary)",
                }
        }
        transition={{ duration: 0.3 }}
        className="w-11 h-11 rounded-full border flex items-center justify-center text-sm font-medium select-none"
        style={{ border: "1.5px solid var(--border-color)" }}
      >
        {String(step.id).padStart(2, "0")}
      </motion.div>

      {/* Label */}
      <span
        className="text-xs font-medium transition-colors duration-300 "
        style={{
          color:
            state === "active"
              ? "var(--text-primary)"
              : "var(--text-secondary)",
        }}
      >
        {step.label}
      </span>
    </button>
  );
}

// ─── Detail Card ─────────────────────────────────────────────────────────────

function DetailCard({
  step,
  activeIndex,
  total,
  onPrev,
  onNext,
  onDot,
}: {
  step: (typeof steps)[number];
  activeIndex: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onDot: (i: number) => void;
}) {
  const Icon = step.icon;

  return (
    <div
      className="rounded-2xl border"
      style={{
        borderColor: "var(--border-color)",
        backgroundColor: "var(--bg-card)",
        padding: "1.5rem 1.75rem",
        minHeight: "140px",
      }}
    >
      {/* Content row */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="flex items-start gap-4"
        >
          {/* Icon */}
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: "var(--bg-section)" }}
          >
            <Icon size={18} style={{ color: "var(--text-secondary)" }} />
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <h3
              className="text-sm font-semibold mb-1.5"
              style={{ color: "var(--text-primary)" }}
            >
              {step.heading}
            </h3>
            <p
              className="text-sm leading-relaxed mb-3"
              style={{ color: "var(--text-secondary)" }}
            >
              {step.description}
            </p>
            <span
              className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full"
              style={{
                backgroundColor: "var(--bg-section)",
                color: "var(--text-secondary)",
                border: "0.5px solid var(--border-color)",
              }}
            >
              {step.tag}
            </span>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Nav row */}
      <div className="flex items-center justify-between mt-5">
        {/* Dot indicators */}
        <div className="flex items-center gap-1.5">
          {Array.from({ length: total }).map((_, i) => (
            <button
              key={i}
              onClick={() => onDot(i)}
              aria-label={`Go to step ${i + 1}`}
              className="h-1.5 rounded-full transition-all duration-300 cursor-pointer border-0 p-0"
              style={{
                width: i === activeIndex ? "18px" : "6px",
                backgroundColor:
                  i === activeIndex
                    ? "var(--text-primary)"
                    : "var(--border-color)",
              }}
            />
          ))}
        </div>

        {/* Prev / Next */}
        <div className="flex items-center gap-2">
          <button
            onClick={onPrev}
            disabled={activeIndex === 0}
            className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg border transition-all duration-200 disabled:opacity-30 cursor-pointer bg-transparent"
            style={{
              borderColor: "var(--border-color)",
              color: "var(--text-secondary)",
            }}
          >
            <ArrowLeft size={12} />
            Prev
          </button>
          <button
            onClick={onNext}
            disabled={activeIndex === steps.length - 1}
            className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg border transition-all duration-200 disabled:opacity-30 cursor-pointer bg-transparent"
            style={{
              borderColor: "var(--border-color)",
              color: "var(--text-secondary)",
            }}
          >
            Next
            <ArrowRight size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Section Header ──────────────────────────────────────────────────────────

function SectionHeader() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="text-center max-w-2xl mx-auto mb-14"
    >
      <p
        className="text-xs font-semibold uppercase tracking-widest mb-3"
        style={{ color: "var(--accent)" }}
      >
        The process
      </p>
      <h2
        className="text-3xl md:text-4xl font-bold tracking-tight mb-4"
        style={{ color: "var(--text-primary)" }}
      >
        From file to answer in seconds
      </h2>
      <p className="text-base" style={{ color: "var(--text-secondary)" }}>
        No setup, no configuration. Drop in your documents and start asking
        questions like you're talking to someone who read everything.
      </p>
    </motion.div>
  );
}

// ─── Main Export ─────────────────────────────────────────────────────────────

export function HowItWorks() {
  const [activeIndex, setActiveIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const resetTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % steps.length);
    }, AUTOPLAY_DELAY);
  };

  useEffect(() => {
    resetTimer();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const goTo = (i: number) => {
    setActiveIndex(i);
    resetTimer();
  };

  const goPrev = () => goTo(Math.max(0, activeIndex - 1));
  const goNext = () => goTo(Math.min(steps.length - 1, activeIndex + 1));

  const trackRef = useRef<HTMLDivElement>(null);
  const trackInView = useInView(trackRef, { once: true, margin: "-60px" });

  return (
    <section
      id="how-it-works"
      className="py-24 overflow-hidden"
      style={{ backgroundColor: "var(--bg-section)" }}
    >
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader />

        {/* Track */}
        <motion.div
          ref={trackRef}
          initial={{ opacity: 0, y: 16 }}
          animate={trackInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
          className="flex items-center mb-6"
        >
          {steps.map((step, i) => (
            <div key={step.id} className="contents">
              <Node
                step={step}
                state={
                  i === activeIndex
                    ? "active"
                    : i < activeIndex
                      ? "done"
                      : "idle"
                }
                onClick={() => goTo(i)}
              />
              {i < steps.length - 1 && <Connector filled={i < activeIndex} />}
            </div>
          ))}
        </motion.div>

        {/* Detail card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={trackInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.2, ease: "easeOut" }}
        >
          <DetailCard
            step={steps[activeIndex]}
            activeIndex={activeIndex}
            total={steps.length}
            onPrev={goPrev}
            onNext={goNext}
            onDot={goTo}
          />
        </motion.div>
      </div>
    </section>
  );
}
