import { useTranslation } from 'react-i18next';
import { FiClipboard, FiArchive, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import '../i18n.config';

interface AdminSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  activeSection: string;
  onNavigate: (section: string) => void;
}

export default function AdminSidebar({
  collapsed,
  onToggle,
  activeSection,
  onNavigate,
}: AdminSidebarProps) {
  const { t } = useTranslation();

  const links = [
    { section: 'applications', icon: FiClipboard, label: t('admin.sidebar.applications') },
    { section: 'providers', icon: FiArchive, label: t('admin.sidebar.providers') },
  ];

  return (
    <aside
      className="fixed left-0 top-0 h-full z-40 bg-white border-r border-gray-200 flex flex-col transition-[width] duration-200"
      style={{ width: collapsed ? '64px' : '240px' }}
    >
      {/* Logo */}
      <div className="flex items-center h-20 px-4 border-b border-gray-100 shrink-0 overflow-hidden">
        <a href="/" className="flex items-center gap-3">
          <img
            src="/pec-logo.jpeg"
            alt="PATA & CÃO"
            className="h-10 w-auto object-contain shrink-0"
          />
        </a>
      </div>

      {/* Navigation */}
      <nav className="px-3 py-4 space-y-1 flex-1">
        {links.map(({ section, icon: Icon, label }) => {
          const active = activeSection === section;
          return (
            <button
              key={section}
              onClick={() => onNavigate(section)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-display font-bold transition-colors whitespace-nowrap overflow-hidden ${
                active
                  ? 'bg-primary/10 text-primary-dark'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
              }`}
            >
              <Icon className="text-lg shrink-0" />
              {!collapsed && <span>{label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="p-3 border-t border-gray-100">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-center p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
          aria-label={collapsed ? t('admin.sidebar.expand') : t('admin.sidebar.collapse')}
        >
          {collapsed ? <FiChevronRight className="w-5 h-5" /> : <FiChevronLeft className="w-5 h-5" />}
        </button>
      </div>
    </aside>
  );
}
