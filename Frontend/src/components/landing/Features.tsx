import { motion } from 'framer-motion';
import { MessageCircleQuestion, Search, Quote, FileType, AlignLeft, History } from 'lucide-react';


const features = [
  {
    title: 'Natural Language Q&A',
    description: 'Ask questions in plain English and get accurate answers instantly.',
    icon: MessageCircleQuestion,
  },
  {
    title: 'Multi-Document Search',
    description: 'Query across entire folders and libraries simultaneously.',
    icon: Search,
  },
  {
    title: 'Source Citations',
    description: 'Every answer includes clickable references to the exact source text.',
    icon: Quote,
  },
  {
    title: 'PDF & DOCX Support',
    description: 'Upload your most important files in their native formats without conversion.',
    icon: FileType,
  },
  {
    title: 'AI Summaries',
    description: 'Generate concise overviews of long reports and complex research papers.',
    icon: AlignLeft,
  },
  {
    title: 'Chat History',
    description: 'Pick up where you left off with secure, saved conversation threads.',
    icon: History,
  },
];

export function Features() {
  return (
    <section id="features" className="py-24 bg-[var(--bg-primary)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-[var(--text-primary)] mb-4">
            Everything You Need To <br />
            <span className="gradient-text">Understand Documents</span>
          </h2>
          <p className="text-lg text-[var(--text-secondary)]">
            Powerful tools designed to accelerate your research and simplify your workflow.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1, duration: 0.5 }}
              whileHover={{ y: -5, boxShadow: 'var(--card-hover-shadow)' }}
              className="group p-8 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-color)] transition-all duration-300 cursor-default"
              style={{ boxShadow: 'var(--card-shadow)' }}
            >
              <div className="w-12 h-12 rounded-xl icon-bg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                <feature.icon className="w-6 h-6 text-[var(--accent)]" />
              </div>
              <h3 className="text-xl font-bold text-[var(--text-primary)] mb-3">
                {feature.title}
              </h3>
              <p className="text-[var(--text-secondary)] leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
