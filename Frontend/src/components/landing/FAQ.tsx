import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

const faqs = [
  {
    question: 'What file formats are supported?',
    answer: 'Currently, Ragify supports PDF, DOCX, TXT, CSV, and Markdown files. We are actively working on adding support for spreadsheets (XLSX) and presentation formats (PPTX) in the near future.',
  },
  {
    question: 'How secure are my documents?',
    answer: 'Security is our top priority. All documents are encrypted both in transit and at rest using AES-256 encryption. We never use your private documents to train our foundation models, and you can delete your data at any time.',
  },
  {
    question: 'Can I chat across multiple documents?',
    answer: 'Yes! You can organize documents into specific "Workspaces" and ask questions that require synthesizing information from dozens or even hundreds of files simultaneously.',
  },
  {
    question: 'Does Ragify provide citations?',
    answer: 'Absolutely. Every factual claim made by the AI includes a clickable citation that takes you directly to the source document and highlights the exact paragraph where the information was found.',
  },
  {
    question: 'Is there a free plan?',
    answer: 'Yes, we offer a generous free tier that includes up to 50 document uploads and 500 questions per month. No credit card is required to get started.',
  },
];

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="py-24 section-alt">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[var(--text-primary)] mb-4">
            Frequently Asked Questions
          </h2>
        </div>

        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <div
              key={index}
              className="border border-[var(--border-color)] bg-[var(--bg-card)] rounded-2xl overflow-hidden transition-colors hover:border-[var(--accent)]"
            >
              <button
                className="w-full px-6 py-5 flex items-center justify-between text-left"
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
              >
                <span className="font-semibold text-lg text-[var(--text-primary)]">
                  {faq.question}
                </span>
                <ChevronDown
                  className={cn(
                    "w-5 h-5 text-[var(--text-secondary)] transition-transform duration-300",
                    openIndex === index ? "rotate-180 text-[var(--accent)]" : ""
                  )}
                />
              </button>
              <AnimatePresence>
                {openIndex === index && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                  >
                    <div className="px-6 pb-5 text-[var(--text-secondary)] leading-relaxed">
                      {faq.answer}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
