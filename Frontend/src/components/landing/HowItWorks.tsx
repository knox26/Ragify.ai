import { motion } from "framer-motion";
import { UploadCloud, Cpu, MessageSquareText } from "lucide-react";

const steps = [
  {
    id: 1,
    title: "Upload your documents",
    description:
      "Drop in PDFs, Word docs, or plain text. Everything stays in your private workspace — never shared.",
    tag: "PDF · DOCX · TXT · MD",
    icon: UploadCloud,
  },
  {
    id: 2,
    title: "Ragify indexes meaning",
    description:
      "The engine reads for meaning — not just keywords. Context, relationships, and page-level detail are stored.",
    tag: "Semantic index",
    icon: Cpu,
  },
  {
    id: 3,
    title: "Ask, get cited answers",
    description:
      "Ask in plain language. Every answer links back to the exact passage it came from.",
    tag: "Source citations",
    icon: MessageSquareText,
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-24 lg:py-32 section-alt">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mb-16">
          <p className="eyebrow mb-4" style={{ color: "var(--accent)" }}>
            How it works
          </p>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[var(--text-primary)]">
            From file to answer in seconds.
          </h2>
          <p className="text-lg text-[var(--text-secondary)] mt-4">
            No setup, no configuration. Drop in your documents and start asking
            questions like you're talking to someone who read everything.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-px bg-[var(--border-color)] border border-[var(--border-color)] rounded-2xl overflow-hidden">
          {steps.map((step, index) => (
            <motion.div
              key={step.id}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: index * 0.08 }}
              className="bg-[var(--bg-card)] p-8"
            >
              <div className="flex items-center justify-between mb-8">
                <span className="text-sm font-mono font-semibold text-[var(--accent)]">
                  {String(step.id).padStart(2, "0")}
                </span>
                <div className="h-9 w-9 rounded-lg icon-bg flex items-center justify-center">
                  <step.icon className="w-4 h-4 text-[var(--accent)]" />
                </div>
              </div>
              <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
                {step.title}
              </h3>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-6">
                {step.description}
              </p>
              <span className="inline-flex text-xs font-mono px-2.5 py-1 rounded-full bg-[var(--bg-section)] border border-[var(--border-color)] text-[var(--text-secondary)]">
                {step.tag}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
