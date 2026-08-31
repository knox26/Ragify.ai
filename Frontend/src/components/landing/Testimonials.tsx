import { motion } from "framer-motion";
import { Star } from "lucide-react";

const testimonials = [
  {
    name: "Sarah Jenkins",
    role: "Lead Researcher, TechBio",
    initials: "SJ",
    content:
      "What used to take weeks of reading and highlighting now takes minutes. The citations are perfectly accurate.",
  },
  {
    name: "Marcus Chen",
    role: "Corporate Counsel",
    initials: "MC",
    content:
      "It's like having an associate who has memorized every contract we've ever filed. Instant, and always grounded in the source.",
  },
  {
    name: "Elena Rodriguez",
    role: "Product Manager",
    initials: "ER",
    content:
      "I upload all our customer transcripts and feature requests. Ragify surfaces core user problems instead of me tagging spreadsheets.",
  },
];

export function Testimonials() {
  return (
    <section className="py-24 lg:py-32 section-alt">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mb-16">
          <p className="eyebrow mb-4">Word of mouth</p>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[var(--text-primary)]">
            Loved by the people who read for a living.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-[var(--border-color)] border border-[var(--border-color)] rounded-2xl overflow-hidden">
          {testimonials.map((testimonial, index) => (
            <motion.div
              key={testimonial.name}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: index * 0.08 }}
              className="bg-[var(--bg-card)] p-8 flex flex-col"
            >
              <div className="flex gap-0.5 mb-6">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star key={star} className="w-4 h-4 fill-[var(--accent-2)] text-[var(--accent-2)]" />
                ))}
              </div>
              <p className="text-[var(--text-primary)] leading-relaxed mb-8 flex-1">
                “{testimonial.content}”
              </p>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full icon-bg flex items-center justify-center text-sm font-semibold text-[var(--accent)]">
                  {testimonial.initials}
                </div>
                <div>
                  <div className="font-medium text-[var(--text-primary)]">
                    {testimonial.name}
                  </div>
                  <div className="text-sm font-mono text-[var(--text-secondary)]">
                    {testimonial.role}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
