import { motion } from 'framer-motion';
import { FileText, Search, Sparkles, CheckCircle2, Bot } from 'lucide-react';

export function ProductShowcase() {
  return (
    <section className="py-24 bg-[var(--bg-primary)] overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-[var(--text-primary)] mb-4">
            See It In Action
          </h2>
          <p className="text-lg text-[var(--text-secondary)]">
            A seamless interface combining your documents with powerful AI capabilities.
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8 }}
          className="relative rounded-3xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-2xl overflow-hidden glow"
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 h-[600px] lg:h-[700px]">
            {/* Left: Document Library */}
            <div className="hidden lg:flex lg:col-span-4 border-r border-[var(--border-color)] flex-col" style={{ backgroundColor: 'var(--bg-section)' }}>
              <div className="p-4 border-b border-[var(--border-color)]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
                  <input
                    type="text"
                    placeholder="Search documents..."
                    className="w-full bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg py-2 pl-9 pr-4 text-sm outline-none"
                    readOnly
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
                {[
                  { name: 'Q3_Financials.pdf', status: 'Ready', active: true },
                  { name: 'Product_Roadmap_2024.docx', status: 'Ready', active: false },
                  { name: 'Legal_Terms_v2.pdf', status: 'Indexing...', active: false },
                  { name: 'User_Research_Notes.txt', status: 'Ready', active: false },
                ].map((doc, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-3 p-3 rounded-xl border ${
                      doc.active 
                        ? 'border-[var(--accent)] bg-[var(--accent)]/5 dark:bg-[var(--accent)]/10' 
                        : 'border-[var(--border-color)] bg-[var(--bg-card)]'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${doc.active ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)] dark:text-gray-300'}`}>
                        {doc.name}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {doc.status === 'Ready' ? (
                          <CheckCircle2 className="w-3 h-3 text-green-500" />
                        ) : (
                          <div className="w-3 h-3 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
                        )}
                        <span className="text-xs text-[var(--text-secondary)]">{doc.status}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: AI Chat */}
            <div className="col-span-1 lg:col-span-8 flex flex-col relative bg-[var(--bg-primary)]">
              {/* Chat Header */}
              <div className="p-4 border-b border-[var(--border-color)] flex items-center gap-3">
                <Bot className="w-5 h-5 text-[var(--accent)]" />
                <span className="font-semibold text-[var(--text-primary)]">Ragify Assistant</span>
              </div>

              {/* Chat Messages */}
              <div className="flex-1 p-6 overflow-y-auto flex flex-col gap-6">
                <div className="flex flex-col gap-4">
                  <div className="self-end max-w-[80%] rounded-2xl rounded-tr-sm bg-[var(--bg-section)] dark:bg-zinc-800 border border-[var(--border-color)] dark:border-zinc-700 p-4 shadow-sm">
                    <p className="text-[var(--text-primary)] dark:text-slate-100 font-medium">Can you summarize the key product milestones for Q4?</p>
                  </div>
                  
                  <div className="self-start max-w-[85%] rounded-2xl rounded-tl-sm bg-[var(--bg-card)] border border-[var(--border-color)] p-5 shadow-sm">
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-[var(--accent)] flex items-center justify-center shrink-0">
                        <Sparkles className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1 space-y-4">
                        <p className="text-[var(--text-primary)] leading-relaxed">
                          Based on the <span className="px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 text-sm cursor-pointer hover:underline font-medium">Product_Roadmap_2024.docx [1]</span>, the key milestones for Q4 are:
                        </p>
                        <ul className="list-disc pl-5 text-[var(--text-primary)] space-y-2">
                          <li><strong>Launch API V2:</strong> Scheduled for October 15th <span className="text-xs text-[var(--text-secondary)] ml-1">[2]</span></li>
                          <li><strong>Enterprise SSO Integration:</strong> Targeting November rollout</li>
                          <li><strong>Mobile App Beta:</strong> Expected by end of December <span className="text-xs text-[var(--text-secondary)] ml-1">[1]</span></li>
                        </ul>
                        
                        <div className="pt-3 mt-3 border-t border-[var(--border-color)] flex items-center gap-2">
                          <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase">Sources:</span>
                          <span className="text-xs px-2 py-1 rounded bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800 cursor-pointer hover:border-[var(--accent)] transition-colors">
                            [1] Roadmap_2024 (Page 12)
                          </span>
                          <span className="text-xs px-2 py-1 rounded bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800 cursor-pointer hover:border-[var(--accent)] transition-colors">
                            [2] API_Specs (Page 3)
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Typing Indicator */}
                  <div className="self-start flex gap-2 items-center text-[var(--text-secondary)] px-4 py-2">
                    <Sparkles className="w-4 h-4 animate-pulse text-[var(--accent)]" />
                    <span className="text-sm">Ragify is analyzing...</span>
                  </div>
                </div>
              </div>

              {/* Chat Input */}
              <div className="p-4 bg-[var(--bg-primary)] border-t border-[var(--border-color)]">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Ask about your documents..."
                    className="w-full bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl py-4 pl-4 pr-12 outline-none focus:border-[var(--accent)] transition-colors shadow-sm"
                    readOnly
                  />
                  <button className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-[var(--accent)] text-white hover:opacity-90 transition-opacity">
                    <Search className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
