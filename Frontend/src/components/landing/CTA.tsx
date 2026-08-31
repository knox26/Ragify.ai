import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

export function CTA() {
  return (
    <section id="get-started" className="relative py-28 lg:py-36 overflow-hidden">
      <div className="absolute inset-0 gradient-mesh" />

      <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <p className="eyebrow mb-4">Get started</p>
          <h2 className="mb-6">
            <span className="block text-4xl md:text-6xl font-bold tracking-tighter text-[var(--text-primary)] leading-[1.05]">
              Stop searching.
            </span>
            <span className="block text-4xl md:text-6xl font-bold tracking-tighter text-[var(--text-primary)] leading-[1.05]">
              Start <span className="text-[var(--accent)]">asking.</span>
            </span>
          </h2>
          <p className="text-lg md:text-xl text-[var(--text-secondary)] max-w-xl mx-auto mb-10">
            Upload your first document in under a minute. No credit card
            required.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/signup"
              className="w-full sm:w-auto px-8 py-4 rounded-full bg-[var(--accent)] text-white font-semibold text-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-2 shadow-lg shadow-[var(--accent-glow)]"
            >
              Start free <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
