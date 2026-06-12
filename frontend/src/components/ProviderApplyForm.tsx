import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { providers, uploadImage } from '../services/api';
import { evaluatePassword } from '../utils/password';
import { SERVICE_CATALOG } from '../utils/serviceCatalog';
import {
  formatCPF,
  formatCNPJ,
  formatPhone,
  isValidEmail,
  stripNonDigits,
  validateCPF,
  validateCNPJ,
  validatePhone,
} from '../utils/validation';
import LoginModal from './LoginModal';
import PasswordField from './PasswordField';
import '../i18n.config';

type AccountType = 'pessoa_fisica' | 'pessoa_juridica';

interface FormState {
  // Shared
  email: string;
  password: string;
  phone: string;
  service: string;
  documentType: string;
  documentFileName: string;
  documentImageId: string;
  documentFile: File | null;
  socialLink: string;
  // Apenas PF
  fullName: string;
  birthDate: string;
  cpf: string;
  // Apenas PJ
  legalRepresentative: string;
  businessName: string;
  taxId: string;
}

interface FieldErrors {
  fullName?: string;
  birthDate?: string;
  cpf?: string;
  legalRepresentative?: string;
  businessName?: string;
  taxId?: string;
  phone?: string;
  email?: string;
  password?: string;
  service?: string;
  documentType?: string;
}

const EMPTY: FormState = {
  email: '',
  password: '',
  phone: '',
  service: '',
  documentType: '',
  documentFileName: '',
  documentImageId: '',
  documentFile: null,
  socialLink: '',
  fullName: '',
  birthDate: '',
  cpf: '',
  legalRepresentative: '',
  businessName: '',
  taxId: '',
};

export default function ProviderApplyForm() {
  const { t } = useTranslation();
  const [accountType, setAccountType] = useState<AccountType>('pessoa_fisica');
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);

  const isPF = accountType === 'pessoa_fisica';

  const documentTypes = isPF
    ? [
        { value: 'cpf', label: t('providerApply.docTypes.cpf') },
        { value: 'rg', label: t('providerApply.docTypes.rg') },
        { value: 'cnh', label: t('providerApply.docTypes.cnh') },
      ]
    : [
        { value: 'cnpj', label: t('providerApply.docTypes.cnpj') },
        { value: 'contrato_social', label: t('providerApply.docTypes.contratoSocial') },
      ];

  // Lista de serviços filtrada para as três categorias oferecidas durante a
  // aplicação de prestador. Mantenha valores alinhados com SERVICE_CATALOG para
  // o filtro de busca e registros de prestadores permanecerem consistentes.
  const serviceOptions = SERVICE_CATALOG.filter(({ value }) =>
    ['boarding', 'walking', 'training'].includes(value),
  ).map(({ value, labelKey }) => ({
    value,
    label: t(labelKey),
  }));

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name as keyof FieldErrors]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, phone: formatPhone(e.target.value) }));
    if (errors.phone) setErrors((prev) => ({ ...prev, phone: undefined }));
  };

  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, cpf: formatCPF(e.target.value) }));
    if (errors.cpf) setErrors((prev) => ({ ...prev, cpf: undefined }));
  };

  const handleTaxIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, taxId: formatCNPJ(e.target.value) }));
    if (errors.taxId) setErrors((prev) => ({ ...prev, taxId: undefined }));
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setForm((prev) => ({
      ...prev,
      documentFileName: file ? file.name : '',
      documentFile: file || null,
      documentImageId: '', // clear stale ID when a new file is picked
    }));
  };

  const handleAccountTypeChange = (next: AccountType) => {
    setAccountType(next);
    // Reset doc type when PF/PJ flips so a PF-only doc isn't submitted for PJ.
    setForm((prev) => ({ ...prev, documentType: '' }));
    setErrors({});
  };

  const validate = (): FieldErrors => {
    const errs: FieldErrors = {};

    if (isPF) {
      if (!form.fullName.trim()) errs.fullName = t('providerApply.errors.fullNameRequired');
      if (!form.birthDate) errs.birthDate = t('providerApply.errors.birthDateRequired');
      if (!form.cpf.trim()) {
        errs.cpf = t('providerApply.errors.cpfRequired');
      } else if (!validateCPF(form.cpf)) {
        errs.cpf = t('providerApply.errors.cpfInvalid');
      }
    } else {
      if (!form.legalRepresentative.trim())
        errs.legalRepresentative = t('providerApply.errors.legalRepRequired');
      if (!form.businessName.trim())
        errs.businessName = t('providerApply.errors.companyNameRequired');
      if (!form.taxId.trim()) {
        errs.taxId = t('providerApply.errors.cnpjRequired');
      } else if (!validateCNPJ(form.taxId)) {
        errs.taxId = t('providerApply.errors.cnpjInvalid');
      }
    }

    if (!form.phone.trim()) {
      errs.phone = t('providerApply.errors.phoneRequired');
    } else if (!validatePhone(form.phone)) {
      errs.phone = t('providerApply.errors.phoneInvalid');
    }

    if (!form.email) {
      errs.email = t('auth.errors.emailRequired');
    } else if (!isValidEmail(form.email)) {
      errs.email = t('auth.errors.emailInvalid');
    }

    if (!form.password) {
      errs.password = t('auth.errors.passwordRequired');
    } else if (!evaluatePassword(form.password).valid) {
      errs.password = t('password.errorWeak');
    }

    if (!form.service) errs.service = t('providerApply.errors.serviceRequired');
    if (!form.documentType) errs.documentType = t('providerApply.errors.documentTypeRequired');

    return errs;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setApiError(null);
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setLoading(true);
    try {
      // Upload document file first if selected, so we get a real storage-backed ID.
      let documentImageId: string | undefined;
      if (form.documentFile && !form.documentImageId) {
        const uploaded = await uploadImage(form.documentFile, 'document');
        documentImageId = uploaded.imageId;
      }

      const base = {
        email: form.email,
        password: form.password,
        phone: stripNonDigits(form.phone),
        accountType,
        service: form.service,
        documentType: form.documentType,
        documentFileName: form.documentFileName || undefined,
        documentImageId: documentImageId || form.documentImageId || undefined,
        socialLink: form.socialLink.trim() || undefined,
      };

      const payload = isPF
        ? {
            ...base,
            fullName: form.fullName.trim(),
            taxId: stripNonDigits(form.cpf),
            birthDate: form.birthDate,
          }
        : {
            ...base,
            fullName: form.legalRepresentative.trim(),
            businessName: form.businessName.trim(),
            taxId: stripNonDigits(form.taxId),
          };

      await providers.register(payload);
      setSuccess(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('auth.errors.generic');
      setApiError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="max-w-3xl mx-auto">
        <h1 className="font-display font-black text-3xl sm:text-4xl text-footer uppercase tracking-wide mb-6">
          {t('providerApply.successTitle')}
        </h1>
        <div className="bg-cream-tan/70 rounded-3xl px-6 py-8 sm:px-10 sm:py-10 space-y-6">
          <p className="font-display font-bold text-sm uppercase tracking-wide text-footer leading-relaxed">
            {t('providerApply.successIntro')}
          </p>
          <hr className="border-footer/30" />
          <div>
            <h2 className="font-display font-black text-2xl text-footer uppercase tracking-wide mb-4">
              {t('providerApply.timelineTitle')}
            </h2>
            <ul className="space-y-3 font-display font-bold text-sm uppercase tracking-wide text-footer/80">
              <li>&gt; {t('providerApply.timelineStep1')}</li>
              <li>&gt; {t('providerApply.timelineStep2')}</li>
              <li>&gt; {t('providerApply.timelineStep3')}</li>
            </ul>
          </div>
          <div className="flex justify-center pt-2">
            <a
              href="/"
              className="px-12 py-3 bg-primary hover:bg-primary-dark text-white font-display font-bold text-base uppercase tracking-wide rounded-lg transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-cream-tan"
            >
              {t('providerApply.concludeCta')}
            </a>
          </div>
        </div>
      </div>
    );
  }

  const inputClass = (hasError?: boolean) =>
    `w-full px-4 py-3 rounded-xl bg-white text-gray-900 text-sm border ${
      hasError ? 'border-red-400 ring-1 ring-red-200' : 'border-gray-200'
    } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-transparent transition-shadow`;

  const labelClass = 'block font-display font-bold text-xs uppercase tracking-wider text-footer/80 mb-1.5';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-8 max-w-5xl mx-auto">
      {/* Sidebar: PF/PJ toggle */}
      <aside>
        <div className="border-2 border-primary rounded-2xl p-4 bg-cream-tan/70">
          <h3 className="font-display font-bold text-xs uppercase tracking-wide text-footer mb-3">
            {t('providerApply.actsAs')}:
          </h3>
          <div className="space-y-2">
            {(['pessoa_fisica', 'pessoa_juridica'] as AccountType[]).map((value) => (
              <label
                key={value}
                className="flex items-center gap-3 cursor-pointer font-sans text-sm text-footer"
              >
                <input
                  type="radio"
                  name="accountType"
                  value={value}
                  checked={accountType === value}
                  onChange={() => handleAccountTypeChange(value)}
                  className="w-4 h-4 text-primary focus-visible:ring-primary"
                />
                <span>
                  {value === 'pessoa_fisica'
                    ? t('providerApply.pessoaFisica')
                    : t('providerApply.pessoaJuridica')}
                </span>
              </label>
            ))}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div>
        {/* Heading block */}
        <div className="text-center mb-6">
          <h1 className="font-display font-black text-3xl sm:text-4xl text-footer uppercase tracking-wide">
            {t('providerApply.title')}
          </h1>
          <p className="mt-3 font-display font-bold text-sm text-footer uppercase tracking-wide">
            {t('providerApply.subtitle')}
          </p>
          <p className="mt-4 font-display font-bold text-sm uppercase tracking-wide text-footer">
            {t('providerApply.alreadyHave')}{' '}
            <button
              type="button"
              onClick={() => setLoginOpen(true)}
              className="text-primary hover:text-primary-dark underline"
            >
              {t('providerApply.doLogin')}
            </button>
          </p>
        </div>

        {/* Tan card with form */}
        <div className="bg-cream-tan/70 rounded-3xl px-5 py-6 sm:px-10 sm:py-10">
          <h2 className="text-center font-display font-black text-lg uppercase tracking-wide text-footer mb-6">
            {isPF ? t('providerApply.formHeading') : t('providerApply.formHeadingPJ')}
          </h2>

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            {isPF ? (
              <>
                <div>
                  <label htmlFor="ap-fullName" className={labelClass}>{t('providerApply.fullName')}</label>
                  <input
                    id="ap-fullName"
                    type="text"
                    name="fullName"
                    value={form.fullName}
                    onChange={handleChange}
                    placeholder={t('providerApply.fullName')}
                    autoComplete="name"
                    className={inputClass(!!errors.fullName)}
                  />
                  {errors.fullName && (
                    <p className="mt-1 text-xs text-red-600 font-medium">{errors.fullName}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="ap-birthDate" className={labelClass}>{t('providerApply.birthDate')}</label>
                    <input
                      id="ap-birthDate"
                      type="date"
                      name="birthDate"
                      value={form.birthDate}
                      onChange={handleChange}
                      className={inputClass(!!errors.birthDate)}
                    />
                    {errors.birthDate && (
                      <p className="mt-1 text-xs text-red-600 font-medium">{errors.birthDate}</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="ap-phone" className={labelClass}>{t('providerApply.phone')}</label>
                    <input
                      id="ap-phone"
                      type="tel"
                      name="phone"
                      value={form.phone}
                      onChange={handlePhoneChange}
                      placeholder="(11) 91234-5678"
                      autoComplete="tel"
                      className={inputClass(!!errors.phone)}
                    />
                    {errors.phone && (
                      <p className="mt-1 text-xs text-red-600 font-medium">{errors.phone}</p>
                    )}
                  </div>
                </div>

                <div>
                  <label htmlFor="ap-cpf" className={labelClass}>{t('providerApply.cpf').replace(':', '')}</label>
                  <input
                    id="ap-cpf"
                    type="text"
                    name="cpf"
                    value={form.cpf}
                    onChange={handleCpfChange}
                    placeholder="000.000.000-00"
                    inputMode="numeric"
                    className={inputClass(!!errors.cpf)}
                  />
                  {errors.cpf && (
                    <p className="mt-1 text-xs text-red-600 font-medium">{errors.cpf}</p>
                  )}
                </div>
              </>
            ) : (
              <>
                <div>
                  <label htmlFor="ap-legalRep" className={labelClass}>{t('providerApply.legalRepresentative')}</label>
                  <input
                    id="ap-legalRep"
                    type="text"
                    name="legalRepresentative"
                    value={form.legalRepresentative}
                    onChange={handleChange}
                    placeholder={t('providerApply.legalRepresentative')}
                    autoComplete="name"
                    className={inputClass(!!errors.legalRepresentative)}
                  />
                  {errors.legalRepresentative && (
                    <p className="mt-1 text-xs text-red-600 font-medium">{errors.legalRepresentative}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="ap-bizName" className={labelClass}>{t('providerApply.razaoSocial')}</label>
                  <input
                    id="ap-bizName"
                    type="text"
                    name="businessName"
                    value={form.businessName}
                    onChange={handleChange}
                    placeholder={t('providerApply.razaoSocial')}
                    autoComplete="organization"
                    className={inputClass(!!errors.businessName)}
                  />
                  {errors.businessName && (
                    <p className="mt-1 text-xs text-red-600 font-medium">{errors.businessName}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="ap-taxId" className={labelClass}>{t('providerApply.cnpj')}</label>
                    <input
                      id="ap-taxId"
                      type="text"
                      name="taxId"
                      value={form.taxId}
                      onChange={handleTaxIdChange}
                      placeholder="00.000.000/0000-00"
                      inputMode="numeric"
                      className={inputClass(!!errors.taxId)}
                    />
                    {errors.taxId && (
                      <p className="mt-1 text-xs text-red-600 font-medium">{errors.taxId}</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="ap-phone-pj" className={labelClass}>{t('providerApply.phone')}</label>
                    <input
                      id="ap-phone-pj"
                      type="tel"
                      name="phone"
                      value={form.phone}
                      onChange={handlePhoneChange}
                      placeholder="(11) 91234-5678"
                      autoComplete="tel"
                      className={inputClass(!!errors.phone)}
                    />
                    {errors.phone && (
                      <p className="mt-1 text-xs text-red-600 font-medium">{errors.phone}</p>
                    )}
                  </div>
                </div>
              </>
            )}

            <div>
              <label htmlFor="ap-email" className={labelClass}>{t('providerApply.email')}</label>
              <input
                id="ap-email"
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                placeholder={t('providerApply.email')}
                autoComplete="email"
                className={inputClass(!!errors.email)}
              />
              {errors.email && <p className="mt-1 text-xs text-red-600 font-medium">{errors.email}</p>}
            </div>

            <div>
              <label htmlFor="ap-password" className={labelClass}>{t('providerApply.password')}</label>
              <PasswordField
                name="password"
                value={form.password}
                onChange={(v) => {
                  setForm((prev) => ({ ...prev, password: v }));
                  if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
                }}
                placeholder={t('providerApply.password')}
                autoComplete="new-password"
                className={inputClass(!!errors.password)}
                hasError={!!errors.password}
                showStrength
              />
              {errors.password && (
                <p className="mt-1 text-xs text-red-600 font-medium">{errors.password}</p>
              )}
            </div>

            <div>
              <label htmlFor="ap-service" className={labelClass}>{t('search.serviceType')}</label>
              <select
                id="ap-service"
                name="service"
                value={form.service}
                onChange={handleChange}
                className={inputClass(!!errors.service)}
              >
                <option value="">{t('providerApply.servicePlaceholder')}</option>
                {serviceOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {errors.service && (
                <p className="mt-1 text-xs text-red-600 font-medium">{errors.service}</p>
              )}
            </div>

            <p className="text-center text-xs text-footer/60 font-medium py-2">
              {t('providerApply.docExplanation')}
            </p>

            <div>
              <label htmlFor="ap-docType" className={labelClass}>{t('providerApply.documentTypePlaceholder')}</label>
              <select
                id="ap-docType"
                name="documentType"
                value={form.documentType}
                onChange={handleChange}
                className={inputClass(!!errors.documentType)}
              >
                <option value="">{t('providerApply.documentTypePlaceholder')}</option>
                {documentTypes.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {errors.documentType && (
                <p className="mt-1 text-xs text-red-600 font-medium">{errors.documentType}</p>
              )}
            </div>

            <div>
              <span className={labelClass}>{t('providerApply.uploadDocument')}</span>
              <label
                htmlFor="documentFile"
                className={`flex items-center justify-between px-4 py-3 rounded-xl bg-white border border-gray-200 cursor-pointer hover:border-primary/50 transition-colors ${
                  form.documentFileName ? 'border-primary/50 bg-primary-light/10' : ''
                }`}
              >
                <span className={`text-sm truncate flex-1 ${form.documentFileName ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
                  {form.documentFileName || t('providerApply.uploadDocument')}
                </span>
                <span className="text-footer/40 text-base">▾</span>
              </label>
              <input
                id="documentFile"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={handleFile}
                className="sr-only"
              />
            </div>

            <div>
              <label htmlFor="ap-socialLink" className={labelClass}>{t('providerApply.socialLink')}</label>
              <input
                id="ap-socialLink"
                type="url"
                name="socialLink"
                value={form.socialLink}
                onChange={handleChange}
                placeholder="https://"
                className={inputClass(false)}
              />
            </div>

            {apiError && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-md px-4 py-3 text-sm">
                {apiError}
              </div>
            )}

            <div className="pt-4 flex justify-center">
              <button
                type="submit"
                disabled={loading}
                className="px-12 py-3 bg-primary hover:bg-primary-dark text-white font-display font-bold text-base uppercase tracking-wide rounded-lg transition-colors duration-200 disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-cream-tan"
              >
                {loading ? t('auth.loading') : t('providerApply.submit')}
              </button>
            </div>
          </form>
        </div>
      </div>

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </div>
  );
}
