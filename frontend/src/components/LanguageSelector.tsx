import { useTranslation } from 'react-i18next';
import { FiChevronDown } from 'react-icons/fi';

interface Language {
  code: string;
  flag: string;
  label: string;
}

const LANGUAGES: Language[] = [
  { code: 'pt-BR', flag: '🇧🇷', label: 'Português (Brasil)' },
  { code: 'pt', flag: '🇵🇹', label: 'Português' },
  { code: 'es', flag: '🇪🇸', label: 'Español' },
  { code: 'en', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', label: 'English' },
];

export default function LanguageSelector() {
  const { i18n } = useTranslation();

  const current = LANGUAGES.find((l) => l.code === i18n.language) ?? LANGUAGES[0];

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const code = e.target.value;
    i18n.changeLanguage(code);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('i18nextLng', code);
    }
  };

  return (
    <div className="relative inline-flex items-center">
      <span className="absolute left-2 pointer-events-none text-base leading-none">
        {current.flag}
      </span>
      <select
        value={i18n.language}
        onChange={handleChange}
        data-test="language-selector"
        className="appearance-none pl-8 pr-7 py-1.5 text-sm font-medium rounded-lg border border-gray-200 bg-white text-gray-700 cursor-pointer transition-colors duration-200 hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-transparent"
        aria-label="Select language"
      >
        {LANGUAGES.map(({ code, flag, label }) => (
          <option key={code} value={code}>
            {flag} {label}
          </option>
        ))}
      </select>
      <span className="absolute right-2 pointer-events-none text-gray-400">
        <FiChevronDown className="w-4 h-4" />
      </span>
    </div>
  );
}
