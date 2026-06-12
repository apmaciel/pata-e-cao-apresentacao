import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FiMenu, FiX } from 'react-icons/fi';
// import LanguageSelector from './LanguageSelector';
import LoginModal from './LoginModal';
import { auth, getCurrentUser, type UserProfile } from '../services/api';
import '../i18n.config';

// initialFor renders a single-letter avatar fallback. We pick the first letter
// of fullName (or email) so logged-in identity stays visible even when the
// usuário ainda não enviou foto.
function initialFor(user: UserProfile): string {
  const source = (user.fullName?.trim() || user.email || '?').trim();
  return source.charAt(0).toUpperCase();
}

interface AccountMenuProps {
  user: UserProfile;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onLogout: () => void;
}

// AccountMenu wraps the avatar trigger and the popover menu. The "Painel
// Administrativo" entry is only rendered for users whose role landed as
// "admin" in the auth response — driven by the backend ADMIN_EMAILS allowlist.
function AccountMenu({ user, open, onToggle, onClose, onLogout }: AccountMenuProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const isAdmin = user.role === 'admin';
  const isProvider = user.role === 'provider';

  // Close on outside click + ESC. The menu opens against the header which is
  // fixed-positioned, so anchoring the listener to document keeps it reliable
  // regardless of where the user clicks.
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, onClose]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={user.fullName || user.email}
        className="w-11 h-11 rounded-full bg-primary text-white font-display font-bold text-base flex items-center justify-center shadow-sm border-2 border-white hover:border-primary-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 transition-all"
      >
        {initialFor(user)}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-100 overflow-hidden"
        >
          {!isAdmin && (
          <a
            href={isProvider ? '/providers/detail' : '#'}
            role="menuitem"
            className="block px-4 py-3 text-sm text-primary-dark hover:bg-gray-50 border-b border-gray-100"
          >
            {isProvider ? t('account.myProviderProfile') : t('account.viewProfile')}
          </a>
          )}
          {isAdmin && (
            <a
              href="/admin"
              role="menuitem"
              className="block px-4 py-3 text-sm text-primary-dark hover:bg-gray-50 border-b border-gray-100"
            >
              {t('account.adminPanel')}
            </a>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={onLogout}
            className="block w-full text-left px-4 py-3 text-sm text-primary-dark hover:bg-gray-50"
          >
            {t('account.logout')}
          </button>
        </div>
      )}
    </div>
  );
}

export default function Header() {
  const { t } = useTranslation();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'signin' | 'signup'>('signin');
  const [user, setUser] = useState<UserProfile | null>(getCurrentUser());
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [currentPath, setCurrentPath] = useState(() => {
    if (typeof window !== 'undefined') return window.location.pathname + window.location.search;
    return '/';
  });

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handleScroll, { passive: true });
    setCurrentPath(window.location.pathname + window.location.search);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Keep currentPath in sync on popstate (back/forward).
  useEffect(() => {
    const handlePop = () => setCurrentPath(window.location.pathname + window.location.search);
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  // Restore session on mount via the httpOnly refresh cookie.
  useEffect(() => {
    if (user) return;
    let cancelled = false;
    auth.refresh().then((resp) => {
      if (!cancelled && resp) setUser(resp.user);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openLogin = () => {
    setModalMode('signin');
    setModalOpen(true);
    setIsMenuOpen(false);
  };

  const handleLogout = async () => {
    await auth.logout();
    setUser(null);
    setAccountMenuOpen(false);
    window.location.href = '/';
  };

  function isActive(href: string): boolean {
    // Normalise trailing slashes so /providers/?service=x matches /providers?service=x.
    const normalized = currentPath.replace(/\/\?/, '?').replace(/\/$/, '');
    // For hash links, only match when on the home page.
    if (href.startsWith('/#')) {
      const pathOnly = normalized.split('?')[0];
      return pathOnly === '/' || pathOnly === '';
    }
    // For links with query params, match the full path+query so only the
    // exact matching service link lights up — not all six at once.
    if (href.includes('?')) {
      return normalized === href || normalized.startsWith(href + '&');
    }
    // For plain path links, match the path portion only.
    const pathOnly = normalized.split('?')[0];
    return pathOnly === href || pathOnly.startsWith(href + '/') || pathOnly === href + '/';
  }

  // Query params use the canonical service codes from serviceCatalog so the
  // featured nav links land on the same filter values the search dropdown
  // and the provider registration form persist.
  const navLinks = [
    { href: '/providers?service=boarding', label: t('nav.hospedagem') },
    { href: '/providers?service=walking', label: t('nav.passeadores') },
    { href: '/providers?service=training', label: t('nav.adestradores') },
    { href: '/#sobre', label: t('nav.sobre') },
  ];

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-50 bg-white transition-shadow duration-200 ${
          isScrolled ? 'shadow-md' : 'shadow-sm'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">

            {/* Logo */}
            <a href="/" className="flex-shrink-0">
              <img
                src="/pec-logo.jpeg"
                alt="PATA & CÃO"
                width={240}
                height={96}
                className="h-24 w-auto object-contain"
              />
            </a>

            {/* Desktop nav */}
            <nav className="hidden lg:flex items-center gap-8" aria-label="Main navigation">
              {navLinks.map(({ href, label }) => (
                <a
                  key={href}
                  href={href}
                  className={`font-display font-bold text-sm uppercase tracking-wide transition-colors duration-200 relative pb-1 ${
                    isActive(href)
                      ? 'text-primary'
                      : 'text-primary-dark hover:text-primary'
                  }`}
                >
                  {label}
                  {isActive(href) && (
                    <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 bg-primary rounded-full" />
                  )}
                </a>
              ))}
              {/* CTA nav link — visually distinct */}
              <a
                href="/providers/apply"
                className={`font-display font-bold text-sm uppercase tracking-wide transition-colors duration-200 relative pb-1 ${
                  isActive('/providers/apply')
                    ? 'text-primary'
                    : 'text-primary hover:text-primary-dark'
                }`}
              >
                {t('nav.divulgue')}
                {isActive('/providers/apply') && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 bg-primary rounded-full" />
                )}
              </a>
            </nav>

            {/* Language selector (desktop) — temporarily disabled, will be re-enabled later */}
            {/* <div className="hidden lg:block">
              <LanguageSelector />
            </div> */}

            {/* Auth control (desktop) */}
            <div className="hidden lg:flex items-center gap-3">
              {user ? (
                <AccountMenu
                  user={user}
                  open={accountMenuOpen}
                  onToggle={() => setAccountMenuOpen((v) => !v)}
                  onClose={() => setAccountMenuOpen(false)}
                  onLogout={handleLogout}
                />
              ) : (
                <button
                  type="button"
                  onClick={openLogin}
                  className="font-display font-bold text-sm uppercase tracking-wide text-primary-dark hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded transition-colors duration-200"
                >
                  {t('auth.signInCta')}
                </button>
              )}
            </div>

            {/* Mobile hamburger */}
            <button
              className="lg:hidden p-2 rounded-lg text-primary-dark hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-colors duration-200"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label="Toggle menu"
              aria-expanded={isMenuOpen}
              aria-controls="mobile-menu"
            >
              {isMenuOpen ? <FiX className="w-6 h-6" /> : <FiMenu className="w-6 h-6" />}
            </button>
          </div>

          {/* Mobile menu */}
          {isMenuOpen && (
            <div id="mobile-menu" role="navigation" aria-label="Mobile navigation" className="lg:hidden border-t border-gray-100 py-4 space-y-1">
              {navLinks.map(({ href, label }) => (
                <a
                  key={href}
                  href={href}
                  className={`block px-4 py-3 font-display font-bold text-sm uppercase tracking-wide transition-colors duration-200 ${
                    isActive(href)
                      ? 'text-primary bg-primary-light/50 rounded-lg'
                      : 'text-primary-dark hover:text-primary hover:bg-primary-light/30 rounded-lg'
                  }`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  {label}
                </a>
              ))}
              <a
                href="/providers/apply"
                className={`block px-4 py-3 font-display font-bold text-sm uppercase tracking-wide transition-colors duration-200 ${
                  isActive('/providers/apply')
                    ? 'text-primary bg-primary-light/50 rounded-lg'
                    : 'text-primary hover:text-primary-dark hover:bg-primary-light/30 rounded-lg'
                }`}
                onClick={() => setIsMenuOpen(false)}
              >
                {t('nav.divulgue')}
              </a>
              {user ? (
                <>
                  <a
                    href={user.role === 'provider' ? '/providers/detail' : '/account'}
                    onClick={() => setIsMenuOpen(false)}
                    className={`block px-4 py-3 font-display font-bold text-sm uppercase tracking-wide transition-colors duration-200 ${
                      isActive('/providers/detail') || isActive('/account')
                        ? 'text-primary bg-primary-light/50 rounded-lg'
                        : 'text-primary-dark hover:text-primary hover:bg-primary-light/30 rounded-lg'
                    }`}
                  >
                    {user.role === 'provider' ? t('account.myProviderProfile') : t('account.viewProfile')}
                  </a>
                  {user.role !== 'provider' && (
                  <a
                    href="/pets"
                    onClick={() => setIsMenuOpen(false)}
                    className={`block px-4 py-3 font-display font-bold text-sm uppercase tracking-wide transition-colors duration-200 ${
                      isActive('/pets')
                        ? 'text-primary bg-primary-light/50 rounded-lg'
                        : 'text-primary-dark hover:text-primary hover:bg-primary-light/30 rounded-lg'
                    }`}
                  >
                    {t('account.managePets')}
                  </a>
                  )}
                  {user.role === 'admin' && (
                    <a
                      href="/admin"
                      onClick={() => setIsMenuOpen(false)}
                      className={`block px-4 py-3 font-display font-bold text-sm uppercase tracking-wide transition-colors duration-200 ${
                        isActive('/admin')
                          ? 'text-primary bg-primary-light/50 rounded-lg'
                          : 'text-primary-dark hover:text-primary hover:bg-primary-light/30 rounded-lg'
                      }`}
                    >
                      {t('account.adminPanel')}
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      handleLogout();
                      setIsMenuOpen(false);
                    }}
                    className="block w-full text-left px-4 py-3 font-display font-bold text-sm uppercase tracking-wide text-primary-dark hover:text-primary hover:bg-primary-light/30 rounded-lg transition-colors duration-200"
                  >
                    {t('account.logout')}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={openLogin}
                  className="block w-full text-left px-4 py-3 font-display font-bold text-sm uppercase tracking-wide text-primary-dark hover:text-primary hover:bg-primary-light/30 rounded-lg transition-colors duration-200"
                >
                  {t('auth.signInCta')}
                </button>
              )}
              {/* Language selector (mobile) — temporarily disabled, will be re-enabled later */}
              {/* <div className="px-4 pt-2">
                <LanguageSelector />
              </div> */}
            </div>
          )}
        </div>
      </header>

      <LoginModal
        open={modalOpen}
        initialMode={modalMode}
        onClose={() => setModalOpen(false)}
        onAuthenticated={(u) => setUser(u)}
      />
    </>
  );
}
