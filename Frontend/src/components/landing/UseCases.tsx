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
      "Summarize long textbook chapters and prepare for exams by querying your notes.",
    icon: GraduationCap,
  },
  {
    title: "Researchers",
    description:
      "Synthesize findings across dozens of papers with precise source citations.",
    icon: Microscope,
  },
  {
    title: "Lawyers",
    description:
      "Quickly find specific clauses and precedents in massive contract repositories.",
    icon: Scale,
  },
  {
    title: "Teams",
    description:
      "Onboard new members faster by letting them chat with internal wikis and docs.",
    icon: Users,
  },
  {
    title: "Product Managers",
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
    <section className="py-24 section-alt">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[var(--text-primary)] mb-4">
            Built for how you work
          </h2>
          <p className="text-lg text-[var(--text-secondary)]">
            Whatever your field, Ragify adapts to your documents and workflow.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {useCases.map((useCase, index) => (
            <motion.div
              key={useCase.title}
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1, duration: 0.4 }}
              className="p-6 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-color)] hover:border-[var(--accent)] transition-colors group"
            >
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] group-hover:bg-[var(--accent)] group-hover:text-white transition-colors">
                  <useCase.icon className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-[var(--text-primary)]">
                  {useCase.title}
                </h3>
              </div>
              <p className="text-[var(--text-secondary)] leading-relaxed">
                {useCase.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
