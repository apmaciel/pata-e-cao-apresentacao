# PATA & CÃO Development Instructions

This project uses a comprehensive development skill to guide all work.

## When working on PATA & CÃO:

1. **Always reference SKILL.md** for the development workflow covering:
   - Project setup & infrastructure
   - Feature development phases
   - Security & trust validation checklists
   - Provider verification workflows
   - Pet health data safeguards
   - Booking & review systems

2. **Tech Stack** (locked):
   - **Frontend**: React + Astro (with Vue.js fallback)
   - **Backend**: Golang + Echo framework
   - **Databases**: PostgreSQL (relational) + Ferret.db (search/documents)

3. **Critical Priorities** (in order):
   - Provider verification & trust (background checks, certifications)
   - Pet health & medical records (security, privacy, audit trails)
   - User/provider reviews (moderation, trust signals)
   - Booking system (concurrency, availability, cancellations)

4. **Before every PR/merge**:
   - Run the Security & Trust Validation checklist from SKILL.md
   - Verify pet health data is not logged or exposed
   - Ensure provider verification is immutable after approval
   - Test access control (users can only see their own data)

5. **Key Files**:
   - `SKILL.md` - Complete development workflow & checklists
   - `README.md` - Project setup & architecture
   - `.github/workflows/` - CI/CD pipelines
   - `docs/SECURITY.md` - Security guidelines (create if needed)

## Quick Commands

To follow the workflow:
```
"Let's build [feature] following the PATA & CÃO workflow"
"Run the provider verification checklist"
"Verify this code meets our pet data safety standards"
```

---

For full details, see `SKILL.md` in the project root.
