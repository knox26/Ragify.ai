import { motion } from 'framer-motion';
import { Star } from 'lucide-react';

const testimonials = [
  {
    name: 'Sarah Jenkins',
    role: 'Lead Researcher, TechBio',
    content: "Ragify has completely transformed our literature review process. What used to take weeks of reading and highlighting now takes minutes. The citations are perfectly accurate.",
    avatar: 'https://i.pravatar.cc/150?u=sarah',
  },
  {
    name: 'Marcus Chen',
    role: 'Corporate Counsel',
    content: "The ability to instantly query across thousands of pages of historical contracts is a game-changer. It's like having an associate who has memorized every document we've ever filed.",
    avatar: 'https://i.pravatar.cc/150?u=marcus',
  },
  {
    name: 'Elena Rodriguez',
    role: 'Product Manager',
    content: "I upload all our customer interview transcripts and feature requests. Ragify helps me identify core user problems instantly instead of manually tagging spreadsheets.",
    avatar: 'https://i.pravatar.cc/150?u=elena',
  },
];

export function Testimonials() {
  return (
    <section className="py-24 bg-[var(--bg-primary)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[var(--text-primary)] mb-4">
            Loved by power users
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {testimonials.map((testimonial, index) => (
            <motion.div
              key={testimonial.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.2, duration: 0.6 }}
              style={{ boxShadow: 'var(--card-shadow)' }}
              className="p-8 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-color)] flex flex-col h-full hover:border-[var(--accent)] transition-colors"
            >
              <div className="flex gap-1 mb-6">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star key={star} className="w-4 h-4 fill-amber-400 text-amber-400" />
                ))}
              </div>
              <p className="text-[var(--text-primary)] text-lg leading-relaxed mb-8 flex-1 font-medium">
                "{testimonial.content}"
              </p>
              <div className="flex items-center gap-4 mt-auto">
                <img
                  src={testimonial.avatar}
                  alt={testimonial.name}
                  className="w-12 h-12 rounded-full border border-[var(--border-color)]"
                  loading="lazy"
                />
                <div>
                  <div className="font-bold text-[var(--text-primary)]">{testimonial.name}</div>
                  <div className="text-sm text-[var(--text-secondary)]">{testimonial.role}</div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
