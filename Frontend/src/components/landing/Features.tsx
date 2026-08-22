import { ArrowUpRight, MessageCircleQuestion, Search, Quote, FileType, AlignLeft, History } from "lucide-react";
import { motion } from "framer-motion";

const features = [
  {
    title: "Natural language Q&A",
    description:
      "Ask in plain English — “which contracts mention liability caps?” — and get a straight answer, not a keyword match.",
    icon: MessageCircleQuestion,
  },
  {
    title: "Answers with receipts",
    description:
      "Every factual claim carries a numbered citation. Jump to the exact paragraph in the source document.",
    icon: Quote,
  },
  {
    title: "Multi-document search",
    description:
      "Query across folders and libraries at once. One question, dozens of files, a single synthesized answer.",
    icon: Search,
  },
  {
    title: "Native file support",
    description:
      "PDF, DOCX, TXT, and Markdown — upload in the format you already work with. No conversion step.",
    icon: FileType,
  },
  {
    title: "AI summaries",
    description:
      "Condense long reports and dense research into concise overviews, with the source still one click away.",
    icon: AlignLeft,
  },
  {
    title: "Searchable history",
    description:
      "Every conversation is saved and searchable. Pick up where you left off, or revisit a decision later.",
    icon: History,
  },
];

export function Features() {
  return (
    <section id="features" className="py-24 lg:py-32">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-12 gap-12">
          {/* Sticky heading */}
          <div className="lg:col-span-4">
            <p className="eyebrow mb-4">Capabilities</p>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[var(--text-primary)] mb-4">
              Built for people
              <br />
              who actually read.
            </h2>
            <p className="text-lg text-[var(--text-secondary)]">
              Not a search bar. Not a chat bot guessing on the open web. A
              workspace that turns your documents into answers you can trust.
            </p>
          </div>

          {/* Editorial list */}
          <div className="lg:col-span-8 border-t border-[var(--border-color)]">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: index * 0.05 }}
                className="group border-b border-[var(--border-color)] py-7 flex items-start gap-6"
              >
                <span className="text-sm font-mono text-[var(--text-secondary)] pt-1 w-8 shrink-0">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="flex-1">
                  <h3 className="text-xl font-semibold text-[var(--text-primary)] flex items-center gap-2">
                    {feature.title}
                    <ArrowUpRight className="w-4 h-4 text-[var(--accent)] opacity-0 group-hover:opacity-100 transition-opacity" />
                  </h3>
                  <p className="text-[var(--text-secondary)] mt-2 max-w-xl leading-relaxed">
                    {feature.description}
                  </p>
                </div>
                <feature.icon className="w-6 h-6 text-[var(--text-secondary)]/60 group-hover:text-[var(--accent)] transition-colors shrink-0 mt-1" />
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
