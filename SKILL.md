---
name: PATA & CÃO Web Development
description: Full-stack pet services platform development workflow covering setup, feature development, and security validation
---

# PATA & CÃO Development Skill

Build the PATA & CÃO platform with confidence. This skill guides your team through project setup, feature development, and critical safety/security checks for a pet services marketplace.

## Quick Start

```
/help

// When starting a new feature or sprint
"Let's build the [feature name] following the PATA & CÃO workflow"

// For security reviews
"Run the pet services security checklist on this code"

// For environment setup
"Set up a fresh PATA & CÃO development environment"
```

## The Workflow

### Phase 1: Project Setup (One-time)

1. **Initialize infrastructure**
   - [ ] Create monorepo structure: `frontend/`, `backend/` (schema lives in `backend/migrations/`)
   - [ ] Set up environment files (`.env.example` with **no secrets**)
   - [ ] Configure database schema with provider verification tables
   - [ ] Document entity relationships (Users, Pets, Providers, Bookings, Reviews)

2. **Establish team standards**
   - [ ] Define API contract (REST/GraphQL endpoints)
   - [ ] Create PR template with security checklist section
   - [ ] Set up linting, testing, and type-checking rules
   - [ ] Document deployment environments (dev, staging, prod)

3. **Verify tooling**
   - [ ] Backend runs locally and connects to database
   - [ ] Frontend builds without errors
   - [ ] Test suite passes (even if minimal)
   - [ ] CI/CD pipeline configured (GitHub Actions, etc.)

### Phase 2: Feature Development (Per Feature)

1. **Pre-development planning**
   - [ ] Define acceptance criteria (what does "done" look like?)
   - [ ] Identify entities touched: User role? Pet data? Provider? Booking state?
   - [ ] Rough API contract (endpoints, request/response shape)
   - [ ] Estimate scope and assign to sprint
   - [ ] **i18n**: List all user-facing strings that need translation

2. **Backend implementation**
   - [ ] Create models and migrations (schema changes)
   - [ ] Build API endpoints with proper request validation
   - [ ] Add database-level constraints and indexes
   - [ ] Write integration tests (real database, not mocks)
   - [ ] Document endpoint behavior in code comments
   - [ ] **Error messages**: Return error codes (not translatable), let frontend handle i18n

3. **Frontend implementation**
   - [ ] Build UI components (container + presentational)
   - [ ] Wire components to API using established patterns
   - [ ] Add form validation and error handling
   - [ ] **i18n**: Wrap all user-facing text in translation keys (no hardcoded strings)
   - [ ] Add translations to `locales/` folder (Spanish, Portuguese, Brazilian Portuguese)
   - [ ] Test golden path and common edge cases
   - [ ] Accessibility check: keyboard navigation, screen reader friendly
   - [ ] **i18n check**: Test at least 2 languages (English, Spanish or Portuguese)

4. **Integration & testing**
   - [ ] End-to-end test: full user journey (in default language)
   - [ ] **i18n test**: Verify all UI text is translated in all supported languages
   - [ ] Cross-browser testing (Chrome, Safari, Firefox)
   - [ ] Mobile/responsive testing
   - [ ] Performance check: no new slow queries or bundle bloat

### Phase 3: Security & Trust Validation

**Before every PR merge, verify:**

1. **Pet health & records security** ⚠️ Critical
   - [ ] Health data never logged, never in error messages
   - [ ] Pet health endpoints require auth + ownership verification
   - [ ] Health records shared only to providers with **confirmed booking**
   - [ ] Audit log: every health record access (who, when, why)
   - [ ] Test: user A cannot view user B's pet health

2. **Provider verification integrity** ⚠️ Critical
   - [ ] Provider fields immutable after approval (no self-edit)
   - [ ] Background check status not client-editable
   - [ ] Verification status change requires admin action (audit trail required)
   - [ ] Expiry tracking: unapproved providers hidden from search after expiry
   - [ ] Unverified providers cannot receive bookings
   - [ ] Test: rejected provider doesn't appear in search

3. **Review & trust signals**
   - [ ] One review per booking (prevent spam)
   - [ ] Reviews link to actual bookings (no fake reviews)
   - [ ] Inappropriate reviews flagged and moderated before publication
   - [ ] Review photos don't leak sensitive data (health info, personal details)

4. **Booking security**
   - [ ] User can't double-book same time slot
   - [ ] Provider availability is real-time enforced
   - [ ] Cancellation terms respected (no retroactive cancels)
   - [ ] Payment processed only on confirmed booking (idempotent)

5. **API & auth**
   - [ ] All endpoints require valid auth token
   - [ ] Rate limiting on login, password reset to prevent abuse
   - [ ] Session timeout reasonable (~24h or less)
   - [ ] No secrets in version control (use env vars)
   - [ ] Sensitive endpoints (provider approval, health access) require admin/owner auth

### Phase 4: Deployment & Verification

1. **Staging deployment**
   - [ ] Code merged to main, tests pass
   - [ ] Deployed to staging environment
   - [ ] Smoke test: critical user journeys work (signup → booking → confirmation)
   - [ ] Logs monitored for errors
   - [ ] Stakeholder approval (PM, security, ops)

2. **Production rollout**
   - [ ] Feature flag ready (gradual rollout or full release?)
   - [ ] Database backups confirmed
   - [ ] Monitoring dashboards active (errors, latency, critical queries)
   - [ ] Runbook available (what to do if it breaks?)
   - [ ] Deploy with confidence!

3. **Post-launch**
   - [ ] Monitor for 24h (error rates, user feedback)
   - [ ] Quick fix procedure if critical issues emerge
   - [ ] Metrics review: is the feature meeting acceptance criteria?
   - [ ] Retro: what went well, what to improve next time?

## Image Asset Management

Partner images are decoupled from the main site using **rustfs** (Git-based storage) with intelligent caching.

### When Building Features with Images

1. **Planning Phase**
   - [ ] Identify image types (logos, photos, placeholders)
   - [ ] Determine cache duration (logos: 30d, photos: 15d, pet: 7d)
   - [ ] Plan fallback images for errors
   - [ ] Define validation rules: min/max dimensions, file size, aspect ratio

2. **Backend Implementation**
   - [ ] Create image API endpoints: `GET /api/images/{imageId}`
   - [ ] Add cache headers: `Cache-Control: public, max-age=2592000`
   - [ ] Implement server-side caching (in-memory LRU or Redis)
   - [ ] **Validate server-side**: File type, dimensions, size, aspect ratio
   - [ ] Reject invalid uploads with detailed error messages
   - [ ] Strip EXIF metadata from images before storage
   - [ ] Handle image not found gracefully (return 404 + error message)

3. **Frontend Implementation**
   - [ ] Use `<OptimizedImage>` component (lazy loading)
   - [ ] Add client-side pre-validation (quick feedback)
   - [ ] Never hardcode image paths (use API)
   - [ ] Add fallback image URLs for errors
   - [ ] Test in multiple languages (image filenames may be localized)

4. **Testing**
   - [ ] Verify cache headers are correct: `curl -I /api/images/{id}`
   - [ ] Check cache hit/miss in response: `X-Cache: HIT|MISS`
   - [ ] Test lazy loading with DevTools (Network tab)
   - [ ] Test offline behavior (Service Worker)
   - [ ] **Test invalid uploads**: Too large, wrong format, bad dimensions
   - [ ] Verify error messages are user-friendly & detailed

### Image Validation Rules

**Per-Type Specifications**:

| Type | Min Size | Max Size | Max File | Format | Aspect Ratio |
|------|----------|----------|----------|--------|--------------|
| Logo | 100x50 | 400x200 | 500KB | PNG/JPEG | 1.5–4.0 |
| Facility | 600x400 | 2000x1500 | 5MB | JPEG | 1.0–3.0 |
| Pet Photo | 200x200 | 4000x4000 | 2MB | JPEG/PNG | 0.5–2.0 |

**Validation Layers**:
1. **Client-side** (fast feedback, no security value)
   - MIME type check
   - File size check
   - Dimension check via image load

2. **Server-side** (REQUIRED, security critical)
   - Verify MIME type matches extension (prevent spoofing)
   - Check magic numbers (file headers)
   - Validate dimensions via image library
   - Validate file size
   - Strip EXIF data before storage
   - Reject any validation failure with 400 Bad Request

3. **CI/CD** (GitHub Actions pre-commit)
   - Batch dimension & size validation
   - Metadata.json consistency check
   - Image optimization verification
   - EXIF data verification (should be removed)

See `docs/IMAGES.md` → "Validation Architecture" for complete implementation examples (Golang backend, React frontend, GitHub Actions).

### Image Storage Structure

```
rustfs/
├── images/
│   ├── partner-1/logo.jpg
│   ├── partner-1/gallery/*.jpg
│   ├── partner-2/...
│   └── defaults/
│       ├── pet-placeholder.jpg
│       └── provider-placeholder.jpg
├── metadata.json  # Image manifest with versions & hashes
└── README.md      # Partner upload guidelines
```

### Cache Layers

| Layer | Storage | Duration | Use Case |
|-------|---------|----------|----------|
| Browser | LocalStorage + ServiceWorker | 30 days | Client-side caching |
| Server | In-memory LRU or Redis | 7 days | Reduce rustfs fetches |
| CDN | CloudFlare/CDN | 90 days | Future optimization |

### Key Endpoints

```
GET /api/images/{imageId}
  → Returns binary image with Cache-Control headers

GET /api/images/{imageId}/metadata
  → Returns { url, width, height, hash, cacheMaxAge }

POST /api/admin/cache/invalidate (admin only)
  → Clears cache for specific images
```

See `docs/IMAGES.md` for complete image management guide, caching strategy, and implementation examples.

---

PATA & CÃO must support **Spanish (es)**, **Portuguese (pt)**, and **Brazilian Portuguese (pt-BR)**.

### Frontend i18n Setup

1. **Library**: `react-i18next` + `i18next`
   ```bash
   npm install i18next react-i18next i18next-browser-languagedetector
   ```

2. **Project Structure**
   ```
   frontend/
   ├── src/
   │   ├── locales/
   │   │   ├── es/
   │   │   │   └── translation.json      # Spanish
   │   │   ├── pt/
   │   │   │   └── translation.json      # Portuguese (Portugal)
   │   │   ├── pt-BR/
   │   │   │   └── translation.json      # Brazilian Portuguese
   │   │   └── en/
   │   │       └── translation.json      # English (reference/fallback)
   │   ├── i18n.config.ts               # i18next configuration
   │   ├── components/
   │   └── pages/
   ```

3. **Configuration File** (`src/i18n.config.ts`)
   ```typescript
   import i18n from 'i18next';
   import { initReactI18next } from 'react-i18next';
   import LanguageDetector from 'i18next-browser-languagedetector';
   
   i18n
     .use(LanguageDetector)  // Auto-detect browser language
     .use(initReactI18next)
     .init({
       fallbackLng: 'pt-BR',  // Fallback to Brazilian Portuguese
       ns: ['translation'],
       defaultNS: 'translation',
       resources: {
         es: { translation: require('./locales/es/translation.json') },
         pt: { translation: require('./locales/pt/translation.json') },
         'pt-BR': { translation: require('./locales/pt-BR/translation.json') },
         en: { translation: require('./locales/en/translation.json') },
       },
       detection: {
         order: ['localStorage', 'navigator', 'htmlTag'],
         caches: ['localStorage'],
       },
     });
   ```

4. **Translation Keys Format** (`locales/pt-BR/translation.json`)
   ```json
   {
     "common": {
       "home": "Início",
       "about": "Sobre",
       "contact": "Contato"
     },
     "pet": {
       "addPet": "Adicionar Pet",
       "petProfile": "Perfil do Pet",
       "healthRecords": "Histórico de Saúde"
     },
     "provider": {
       "searchProviders": "Buscar Prestadores",
       "verifiedBadge": "Verificado",
       "booking": "Agendar"
     },
     "errors": {
       "invalidEmail": "Email inválido",
       "petNotFound": "Pet não encontrado"
     }
   }
   ```

5. **Using Translations in Components**
   ```jsx
   import { useTranslation } from 'react-i18next';
   
   export function PetProfile() {
     const { t, i18n } = useTranslation();
     
     return (
       <>
         <h1>{t('pet.petProfile')}</h1>
         <button onClick={() => i18n.changeLanguage('es')}>
           {t('languages.spanish')}
         </button>
       </>
     );
   }
   ```

6. **Language Selector Component**
   ```jsx
   export function LanguageSelector() {
     const { i18n } = useTranslation();
     
     return (
       <select value={i18n.language} onChange={(e) => i18n.changeLanguage(e.target.value)}>
         <option value="pt-BR">Português (Brasil)</option>
         <option value="pt">Português (Portugal)</option>
         <option value="es">Español</option>
         <option value="en">English</option>
       </select>
     );
   }
   ```

### Backend i18n Considerations

1. **Error Messages**: Return error codes, not translatable text
   ```json
   {
     "error": "INVALID_EMAIL",
     "message": "Validation failed for email field"
   }
   ```

2. **Data-Driven Content**: Store in database with language flags
   ```go
   type Provider struct {
     ID   string
     Name string
     Bio  string
     // No translations here — store in separate table or handle in frontend
   }
   ```

3. **API Responses**: Use consistent language codes (ISO 639-1 + region)
   - `pt-BR` for Brazilian Portuguese
   - `pt` for Portuguese (Portugal)
   - `es` for Spanish
   - `en` for English

### Testing i18n

1. **Unit Tests**: Verify translation keys exist
   ```typescript
   describe('i18n', () => {
     it('should have all keys in all languages', () => {
       const es = require('./locales/es/translation.json');
       const ptBR = require('./locales/pt-BR/translation.json');
       const pt = require('./locales/pt/translation.json');
       
       expect(Object.keys(es)).toEqual(Object.keys(ptBR));
       expect(Object.keys(es)).toEqual(Object.keys(pt));
     });
   });
   ```

2. **E2E Tests**: Test language switching
   ```typescript
   it('should switch language when user selects', () => {
     cy.visit('/');
     cy.get('select[data-test="language-selector"]').select('es');
     cy.contains('Buscar Prestadores'); // Spanish text
   });
   ```

3. **Translation Completeness**: Before each release, verify no missing keys
   - Run linter to detect hardcoded strings in JSX
   - Validate all keys are present in all language files

### Localization Checklist

- [ ] i18next + react-i18next installed
- [ ] Locale folder structure created (es, pt, pt-BR, en)
- [ ] Translation configuration in `i18n.config.ts`
- [ ] All user-facing text wrapped in `t()` function
- [ ] Language selector component added to layout
- [ ] Locale stored in localStorage
- [ ] Form validation & error messages translated
- [ ] API error codes mapped to translations (frontend)
- [ ] Tests verify translation key completeness
- [ ] Date/time formatting respects locale
- [ ] Currency formatting respects locale (if needed)

---

## Domain Feature Workflows

### Pet Health & Records

When implementing pet profiles and health tracking:

1. **Data model** (Backend)
   - [ ] Pet table: name, breed, age, photo, owner_id
   - [ ] Health records table: vaccination date, allergies, medications, special needs
   - [ ] Vet contact info (encrypted, visible only to owner & their selected providers)
   - [ ] Add `is_sensitive=true` flag for health data (triggers extra audit logging)

2. **Access control** (Backend)
   - [ ] Only pet owner can view/edit their own pet's records
   - [ ] Providers see pet health only for **confirmed bookings** (not before)
   - [ ] Log every health record access: who viewed, when, from what context

3. **UI/UX** (Frontend)
   - [ ] Pet profile page: edit form with validation (required fields only)
   - [ ] Health history timeline (read-only to users)
   - [ ] Provider sees relevant info before accepting a booking
   - [ ] Confirm: pet health data not searchable/discoverable by other users

4. **Testing**
   - [ ] Unit: pet creation, health record updates
   - [ ] Integration: user A cannot access user B's pet health
   - [ ] E2E: add pet → provide health info → provider views before booking

### Trust & Reviews

When building the trust layer:

1. **Review system** (Backend)
   - [ ] Review table: rating (1-5), text, photos, reviewer_id, provider_id, booking_id
   - [ ] Link review to actual booking (no fake reviews for non-customers)
   - [ ] Response system: provider can reply to reviews
   - [ ] Trust signal: average rating, review recency, number of reviews

2. **Provider badges** (Backend + Frontend)
   - [ ] "Verified" badge: linked to background check status
   - [ ] "Trusted" badge: >4.5 rating + 10+ reviews + <30 days active
   - [ ] "Response time" badge: provider responds to bookings <2hrs
   - [ ] Update badges nightly (don't recalculate on every page load)

3. **Review moderation** (Backend)
   - [ ] Flag inappropriate reviews (spam, profanity)
   - [ ] Manual review required before publication
   - [ ] Prevent review deletion (only redaction for safety)
   - [ ] Audit trail: who flagged, who approved/rejected, when

4. **UI** (Frontend)
   - [ ] Show reviews on provider profile (newest first, verified reviews marked)
   - [ ] Review form post-booking: required for cancellations, optional for completed
   - [ ] Prevent multi-reviews per booking (one review per booking_id)
   - [ ] Photos in reviews: validate not sensitive data leaks

### Provider Verification

Critical workflow for safety:

1. **Verification pipeline** (Backend)
   - [ ] Application form: name, certifications, background check consent, references
   - [ ] Background check request: trigger external service (or manual review initially)
   - [ ] Certification upload & validation (e.g., PDF with expiry date)
   - [ ] Provider status: `pending` → `under_review` → `approved` / `rejected`
   - [ ] Expiry tracking: recertification reminders at 30/60/90 days before expiry

2. **Admin dashboard** (Backend + Frontend)
   - [ ] Queue of pending verifications (sortable by date)
   - [ ] Review checklist: background check ✓, certifications ✓, references called ✓
   - [ ] Approval or rejection (with reason sent to provider)
   - [ ] Audit log: who verified, decision, timestamp, notes

3. **Provider visibility** (Backend)
   - [ ] Unverified providers are **hidden** from search/browse
   - [ ] Providers can apply even if rejected (with new docs)
   - [ ] Verification status visible in provider dashboard (transparency)
   - [ ] Email notifications: pending → approved → expiry reminders

4. **Testing**
   - [ ] Unit: status transitions (pending → approved only)
   - [ ] Integration: rejected provider cannot receive bookings
   - [ ] E2E: admin approves provider → provider appears in search

## Tech Stack (Locked)

**Frontend:** React + Astro (with Vue.js as fallback for component flexibility)
- Astro for static generation + islands for interactive components
- React for complex interactive UIs (provider search, booking flow)
- Vue.js for specific components if needed

**Backend:** Golang with Echo framework
- Echo for HTTP routing and middleware
- Type safety and performance for provider verification & booking logic
- Concurrency for real-time availability updates

**Database:** PostgreSQL + Ferret.db
- PostgreSQL: relational data (users, pets, providers, bookings)
- Ferret.db: document storage + full-text search for pet services discovery

**Image Storage:** rustfs (Decoupled, Git-Based)
- Partner images stored in https://github.com/rustfs/rustfs
- Multi-layer caching: Browser (30d) → Server (7d) → CDN (90d)
- Image API endpoints: `/api/images/{imageId}`
- Service Worker pre-caching for critical images

**Key architectural decision:** Dual database lets you keep provider verification & bookings in PostgreSQL (transactional safety) while using Ferret.db for full-text search on provider profiles & pet needs. External image storage keeps site lean and images independently managed by partners.

## Troubleshooting

**Q: Feature works locally but fails in staging**
→ Check environment variables, database schema differences, API secrets

**Q: Provider verification data out of sync**
→ Audit log the discrepancy, verify background check status, check for concurrent updates

**Q: Booking double-booked despite safeguards**
→ Race condition detected: add database-level unique constraint on (provider_id, date, time_slot), review transaction isolation level

**Q: Tests pass but users report issues**
→ Integration tests not covering real user journey. Add end-to-end tests and cross-browser testing.

## File Structure Reference

```
pata-e-cao/
├── frontend/              # React/Vue app
│   ├── src/
│   │   ├── components/    # UI components
│   │   ├── pages/         # Route pages
│   │   ├── services/      # API calls
│   │   └── utils/         # Helpers
│   ├── package.json
│   └── .env.example
├── backend/               # Node/Python API
│   ├── src/
│   │   ├── models/        # Database models
│   │   ├── routes/        # API endpoints
│   │   ├── middleware/    # Auth, validation
│   │   └── utils/         # Helpers
│   ├── migrations/        # Database schema
│   ├── tests/             # Integration & unit tests
│   ├── package.json (or requirements.txt)
│   └── .env.example
├── SKILL.md               # This file
├── README.md              # Project overview
└── .github/workflows/     # CI/CD
```

---

**Last updated:** 2026-05-02  
**Owner:** Team  
**Status:** Active
