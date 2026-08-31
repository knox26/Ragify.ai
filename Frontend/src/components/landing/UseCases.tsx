import { motion } from "framer-motion";
import {
  GraduationCap,
  Microscope,
  Scale,
  Users,
  Target,
  Briefcase,
} from "lucide-react";

const useCases = [
  {
    title: "Students",
    description:
      "Summarize textbook chapters and quiz your lecture notes before exams.",
    icon: GraduationCap,
  },
  {
    title: "Researchers",
    description:
      "Synthesize findings across dozens of papers, with precise citations.",
    icon: Microscope,
  },
  {
    title: "Lawyers",
    description:
      "Find specific clauses and precedents in massive contract repositories.",
    icon: Scale,
  },
  {
    title: "Teams",
    description:
      "Onboard new members faster by letting them chat with internal wikis and docs.",
    icon: Users,
  },
  {
    title: "Product managers",
    description:
      "Extract insights from hundreds of customer interview transcripts instantly.",
    icon: Target,
  },
  {
    title: "Consultants",
    description:
      "Analyze client reports and industry documents to deliver faster insights.",
    icon: Briefcase,
  },
];

export function UseCases() {
  return (
    <section id="use-cases" className="py-24 lg:py-32">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mb-16">
          <p className="eyebrow mb-4" style={{ color: "var(--accent)" }}>
            Built for how you work
          </p>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[var(--text-primary)]">
            Whoever reads the most, wins the most.
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-[var(--border-color)] border border-[var(--border-color)] rounded-2xl overflow-hidden">
          {useCases.map((useCase, index) => (
            <motion.div
              key={useCase.title}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.35, delay: index * 0.05 }}
              className="bg-[var(--bg-card)] p-6 group"
            >
              <useCase.icon className="w-5 h-5 text-[var(--accent)] mb-5" />
              <h3 className="text-base font-semibold text-[var(--text-primary)] mb-1.5">
                {useCase.title}
              </h3>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                {useCase.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
