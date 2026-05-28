import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { auth, getToken } from '../services/api';
import AdminSidebar from './AdminSidebar';
import ApplicationsPanel from './ApplicationsPanel';
import ProvidersPanel from './ProvidersPanel';
import '../i18n.config';

const SECTIONS = ['applications', 'providers'] as const;
type Section = typeof SECTIONS[number];

export default function AdminShell() {
  const { t } = useTranslation();

  const [sessionReady, setSessionReady] = useState(!!getToken());
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeSection, setActiveSection] = useState<Section>('applications');

  // Session restore on mount
  useEffect(() => {
    if (getToken()) { setSessionReady(true); return; }
    let cancelled = false;
    auth.refresh().then((resp) => {
      if (cancelled) return;
      if (resp && resp.user.role === 'admin') {
        setSessionReady(true);
      } else if (resp && resp.user.role !== 'admin') {
        setSessionError(t('admin.errors.notAdmin'));
      } else {
        setSessionError(t('admin.errors.notAuthenticated'));
      }
    }).catch(() => {
      if (!cancelled) setSessionError(t('admin.errors.notAuthenticated'));
    });
    return () => { cancelled = true; };
  }, [t]);

  // Hash-based routing
  useEffect(() => {
    const resolve = () => {
      const hash = window.location.hash.replace('#', '') || 'applications';
      if (SECTIONS.includes(hash as Section)) setActiveSection(hash as Section);
    };
    resolve();
    window.addEventListener('hashchange', resolve);
    return () => window.removeEventListener('hashchange', resolve);
  }, []);

  const navigate = useCallback((section: string) => {
    window.location.hash = section;
  }, []);

  return (
    <div className="min-h-screen bg-cream">
      <AdminSidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((v) => !v)}
        activeSection={activeSection}
        onNavigate={navigate}
      />

      <div
        className="transition-[margin] duration-200 p-6 sm:p-8 lg:p-10 pt-24"
        style={{ marginLeft: sidebarCollapsed ? '64px' : '240px' }}
      >
        {sessionError && (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-md px-4 py-3 text-sm mb-6">
            {sessionError}
          </div>
        )}

        {!sessionReady && !sessionError && (
          <p className="text-sm text-gray-500">{t('auth.loading')}</p>
        )}

        {sessionReady && (
          <>
            {activeSection === 'applications' && <ApplicationsPanel sessionReady={sessionReady} />}
            {activeSection === 'providers' && <ProvidersPanel sessionReady={sessionReady} />}
          </>
        )}
      </div>
    </div>
  );
}
