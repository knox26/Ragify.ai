import { motion } from 'framer-motion';

export function SocialProof() {
  const stats = [
    { label: 'Active Users', value: '10,000+' },
    { label: 'Documents Processed', value: '1M+' },
    { label: 'Questions Answered', value: '5M+' },
  ];

  return (
    <section className="py-14 section-alt">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <p className="text-sm font-semibold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>
            Trusted by teams and learners worldwide
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.2, duration: 0.6 }}
              className="flex flex-col gap-2"
            >
              <div className="text-4xl md:text-5xl font-extrabold text-[var(--text-primary)] tracking-tight">
                {stat.value}
              </div>
              <div className="text-sm font-medium text-[var(--text-secondary)]">
                {stat.label}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
