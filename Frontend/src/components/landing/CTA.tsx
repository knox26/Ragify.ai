import { motion } from "framer-motion";
import { ArrowRight, Calendar } from "lucide-react";
import { Link } from "react-router-dom";

export function CTA() {
  return (
    <section className="relative py-32 overflow-hidden bg-[var(--bg-primary)]">
      {/* Background Gradients */}
      <div className="absolute inset-0 gradient-mesh opacity-50 dark:opacity-30" />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-4xl md:text-6xl font-extrabold tracking-tight text-[var(--text-primary)] mb-6">
            Turn Documents Into <br className="hidden sm:block" />
            <span className="gradient-text">Conversations</span>
          </h2>

          <p className="text-xl md:text-2xl text-[var(--text-secondary)] mb-10 max-w-2xl mx-auto">
            Stop searching. Start understanding. Join thousands of users who are
            already saving hours every week.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/signup"
              className="w-full sm:w-auto px-8 py-4 rounded-full bg-[var(--accent)] text-white font-semibold text-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-2 shadow-xl shadow-violet-500/25 hover:scale-105 transform duration-300"
            >
              Start Free <ArrowRight className="w-5 h-5" />
            </Link>
            <button className="w-full sm:w-auto px-8 py-4 rounded-full bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-color)] font-semibold text-lg hover:bg-[var(--bg-section)] transition-colors flex items-center justify-center gap-2 hover:scale-105 transform duration-300">
              <Calendar className="w-5 h-5" /> Book Demo
            </button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
