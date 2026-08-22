import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { RagifyMark } from '../ui/RagifyMark';

export function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { name: 'Capabilities', href: '#features' },
    { name: 'How it works', href: '#how-it-works' },
    { name: 'FAQ', href: '#faq' },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 px-4">
      <div className="max-w-5xl mx-auto">
        {/* Floating pill — detached, full-round, transparent dark, blur */}
        <div
          className={cn(
            'mt-4 rounded-2xl border backdrop-blur-xl backdrop-saturate-150 transition-colors duration-300',
            'border-white/10 bg-white/5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]',
            isScrolled && 'bg-white/10'
          )}
        >
          <div className="flex items-center justify-between h-14 px-3 md:px-4">
            {/* Logo — monochrome mark, white CTA carries the contrast */}
            <Link to="/" className="flex items-center gap-2.5 pl-1 md:pl-2 shrink-0">
              <div className="w-8 h-8 rounded-full bg-[var(--text-primary)] flex items-center justify-center">
                <RagifyMark className="w-4 h-4 text-[var(--bg-primary)]" />
              </div>
              <span className="text-lg font-bold tracking-tight text-[var(--text-primary)]">Ragify</span>
            </Link>

            {/* Center nav — truly centered, muted → white hover */}
            <nav className="hidden md:flex items-center gap-7 absolute left-1/2 -translate-x-1/2">
              {navLinks.map((link) => (
                <a
                  key={link.name}
                  href={link.href}
                  className="text-sm font-medium text-neutral-400 hover:text-white transition-colors"
                >
                  {link.name}
                </a>
              ))}
            </nav>

            {/* Right — solid white pill CTA with dark text */}
            <div className="flex items-center gap-3 shrink-0">
              <Link
                to="/login"
                className="hidden md:block text-sm font-medium text-neutral-300 hover:text-white transition-colors"
              >
                Login
              </Link>
              <Link
                to="/signup"
                className="text-sm font-semibold bg-white text-black px-5 py-2.5 rounded-full hover:bg-neutral-200 transition-colors"
              >
                Get Started
              </Link>

              {/* Mobile Menu Toggle */}
              <button
                className="md:hidden p-1.5 text-[var(--text-primary)]"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              >
                {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu — floating panel below the pill */}
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="md:hidden mt-2 rounded-2xl border border-white/10 bg-[#0a0a0b]/70 backdrop-blur-xl backdrop-saturate-150 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08),0_20px_40px_-12px_rgba(0,0,0,0.6)]"
          >
            <div className="px-4 py-4 flex flex-col gap-1">
              {navLinks.map((link) => (
                <a
                  key={link.name}
                  href={link.href}
                  className="py-2.5 text-base font-medium text-neutral-300 hover:text-white transition-colors"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  {link.name}
                </a>
              ))}
              <div className="h-px bg-[var(--border-color)] my-2" />
              <Link
                to="/login"
                className="py-2.5 text-base font-medium text-neutral-300 hover:text-white transition-colors"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Login
              </Link>
            </div>
          </motion.div>
        )}
      </div>
    </header>
  );
}
