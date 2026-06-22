import { motion } from "framer-motion";
import {
  ArrowRight,
  Play,
  CheckCircle2,
  FileText,
  MessageSquare,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router-dom";

export function Hero() {
  return (
    <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute inset-0 gradient-mesh -z-10" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="lg:grid lg:grid-cols-12 lg:gap-16 items-center">
          {/* Left Column (Content) */}
          <motion.div
            className="lg:col-span-6 text-center lg:text-left mb-16 lg:mb-0"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--border-color)] bg-[var(--bg-card)] shadow-sm mb-6"
            >
              <Sparkles className="w-4 h-4 text-[var(--accent)]" />
              <span className="text-sm font-medium text-[var(--text-primary)]">
                AI-Powered Document Intelligence
              </span>
            </motion.div>

            <h1 className="text-5xl lg:text-7xl font-extrabold tracking-tight text-[var(--text-primary)] mb-6 leading-[1.1]">
              Chat With Your Documents. <br className="hidden lg:block" />
              <span className="gradient-text">Not Your Search Bar.</span>
            </h1>

            <p className="text-lg lg:text-xl text-[var(--text-secondary)] dark:text-gray-400 mb-10 max-w-2xl mx-auto lg:mx-0">
              Upload PDFs, research papers, contracts, reports, and instantly
              get answers grounded in your content.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 mb-10">
              <Link
                to="/signup"
                className="w-full sm:w-auto px-8 py-4 rounded-full bg-[var(--accent)] text-white font-semibold text-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-2 shadow-lg shadow-violet-500/25"
              >
                Start Free <ArrowRight className="w-5 h-5" />
              </Link>
              <button className="w-full sm:w-auto px-8 py-4 rounded-full bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-color)] font-semibold text-lg hover:bg-[var(--bg-section)] dark:hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2">
                <Play className="w-5 h-5" /> Watch Demo
              </button>
            </div>

            <div className="flex flex-wrap justify-center lg:justify-start gap-x-8 gap-y-4 text-sm font-medium text-[var(--text-secondary)]">
              {["No Credit Card", "Fast Setup", "Secure Uploads"].map(
                (feature) => (
                  <div key={feature} className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[var(--accent)]" />
                    <span>{feature}</span>
                  </div>
                ),
              )}
            </div>
          </motion.div>

          {/* Right Column (Interactive Mockup) */}
          <motion.div
            className="lg:col-span-6 relative"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3, duration: 0.8, ease: "easeOut" }}
          >
            <div className="relative rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-2xl overflow-hidden glow">
              {/* Mockup Header */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border-color-productShowCase)] bg-[var(--bg-card)] ">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-amber-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                </div>
                <div className="ml-4 text-xs font-medium text-[var(--text-primary)] font-mono">
                  ragify.ai/chat
                </div>
              </div>

              {/* Mockup Body */}
              <div className="p-6 grid grid-cols-12 gap-6 h-[400px]">
                {/* Sidebar */}
                <div className="col-span-4 hidden sm:flex flex-col gap-3 border-r border-[var(--border-color-productShowCase)] pr-4">
                  <div className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
                    Sources
                  </div>
                  {[1, 2].map((i) => (
                    <motion.div
                      key={i}
                      className="flex items-center gap-2 p-2 rounded-lg bg-[var(--bg-section)] border border-[var(--border-color)]"
                      whileHover={{ scale: 1.02 }}
                    >
                      <FileText className="w-4 h-4 text-[var(--accent)]" />
                      <div className="flex-1 truncate text-xs font-medium text-[var(--text-primary)]">
                        Q3_Financial_Report.pdf
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* Chat Area */}
                <div className="col-span-12 sm:col-span-8 flex flex-col justify-end gap-4 relative">
                  <motion.div
                    className="self-end max-w-[85%] rounded-2xl rounded-tr-sm bg-[var(--bg-section)] dark:bg-zinc-600 border border-[var(--border-color)] dark:border-zinc-700 p-4 shadow-sm"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.8 }}
                  >
                    <p className="text-sm text-slate-800 dark:text-slate-100 font-medium">
                      What was our total revenue in Q3?
                    </p>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 1.4 }}
                    className="self-start max-w-[95%] rounded-2xl rounded-tl-sm bg-[var(--bg-primary)] border border-[var(--border-color)] p-4 shadow-sm"
                  >
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-[var(--accent)] flex items-center justify-center shrink-0">
                        <Sparkles className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <p className="text-sm text-[var(--text-primary)] leading-relaxed">
                          Based on the{" "}
                          <span className="text-[var(--accent)] cursor-pointer hover:underline">
                            Q3_Financial_Report.pdf
                          </span>
                          , the total revenue was{" "}
                          <strong className="font-semibold">
                            $4.2 million
                          </strong>
                          , representing a 15% year-over-year increase.
                        </p>
                      </div>
                    </div>
                  </motion.div>

                  <div className="mt-4 relative">
                    <input
                      type="text"
                      placeholder="Ask a question..."
                      className="w-full bg-[var(--bg-section)] border border-[var(--border-color)] rounded-xl py-3 pl-4 pr-12 text-sm outline-none focus:border-[var(--accent)] transition-colors"
                      readOnly
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg bg-[var(--accent)] flex items-center justify-center cursor-pointer">
                      <MessageSquare className="w-4 h-4 text-white" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Floating decorative elements */}
            <motion.div
              className="absolute -top-6 -right-6 glass p-4 rounded-xl shadow-lg border border-[var(--border-color)]"
              animate={{ y: [0, -10, 0] }}
              transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-[var(--text-primary)]">
                    Ready
                  </div>
                  <div className="text-xs text-[var(--text-secondary)]">
                    12 documents indexed
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
