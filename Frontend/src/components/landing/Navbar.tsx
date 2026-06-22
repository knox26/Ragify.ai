import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Menu, X, Moon, Sun, Search } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';
export function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { name: 'Features', href: '#features' },
    { name: 'How It Works', href: '#how-it-works' },
    { name: 'Pricing', href: '#pricing' },
    { name: 'FAQ', href: '#faq' },
  ];

  return (
    <header
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300 border-b',
        isScrolled
          ? 'glass border-[var(--border-color)] py-3'
          : 'bg-transparent border-transparent py-5'
      )}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[var(--accent)] flex items-center justify-center">
              <Search className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight text-[var(--text-primary)]">Ragify</span>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                className="text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                {link.name}
              </a>
            ))}
          </nav>

          {/* Actions */}
          <div className="hidden md:flex items-center gap-4">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-full hover:bg-[var(--bg-card)] transition-colors border border-transparent hover:border-[var(--border-color)]"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? (
                <Sun className="w-5 h-5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors" />
              ) : (
                <Moon className="w-5 h-5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors" />
              )}
            </button>
            <Link
              to="/login"
              className="text-sm font-medium text-[var(--text-primary)] hover:opacity-80 transition-opacity"
            >
              Login
            </Link>
            <Link
              to="/signup"
              className="text-sm font-medium bg-[var(--text-primary)] text-[var(--bg-primary)] px-4 py-2 rounded-full hover:scale-105 transition-transform"
            >
              Get Started
            </Link>
          </div>

          {/* Mobile Menu Toggle */}
          <button
            className="md:hidden p-2 text-[var(--text-primary)]"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="md:hidden glass absolute top-full left-0 right-0 border-b border-[var(--border-color)]"
        >
          <div className="px-4 py-6 flex flex-col gap-4">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                className="text-base font-medium text-[var(--text-primary)]"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {link.name}
              </a>
            ))}
            <div className="h-px bg-[var(--border-color)] w-full my-2" />
            <div className="flex items-center justify-between">
              <span className="text-base font-medium text-[var(--text-primary)]">Theme</span>
              <button
                onClick={toggleTheme}
                className="p-2 rounded-full bg-[var(--bg-card)] border border-[var(--border-color)]"
              >
                {theme === 'dark' ? <Sun className="w-5 h-5 text-[var(--text-primary)]" /> : <Moon className="w-5 h-5 text-[var(--text-primary)]" />}
              </button>
            </div>
            <Link
              to="/login"
              className="w-full text-center py-3 text-base font-medium text-[var(--text-primary)] border border-[var(--border-color)] rounded-lg mt-2"
            >
              Login
            </Link>
            <Link
              to="/signup"
              className="w-full text-center py-3 text-base font-medium bg-[var(--text-primary)] text-[var(--bg-primary)] rounded-lg"
            >
              Get Started
            </Link>
          </div>
        </motion.div>
      )}
    </header>
  );
}
