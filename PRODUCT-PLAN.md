# Rib Generator — Vollständiger Produkt-Plan

**Version:** 2.0 (2026-03-30)
**Status:** Phase 1 Start
**MVP:** ✅ Live auf Vercel (rib-generator.vercel.app)
**Repo:** https://github.com/ckrauser90/Rib-Generator
**Notion:** 🏺 Rib-Generator Seite

---

Hinweis: Dieses Dokument enthaelt auch historische Ausbauideen.
Es ist nicht die beste Quelle fuer den aktuellen Code-Stand.
Fuer neue Sessions zuerst `docs/AI-START.md`, `CLAUDE.md` und `NEXT-SESSION.md` lesen.

## Vision

> "Das Tool, das jeder Töpfer braucht um seine Formen zu digitalisieren."

- Töpfer fotografieren ihre Gefäße
- KI erstellt automatisch das passende Rib-Profil
- STL-Export für 3D-Druck oder Lasercutting
- Eigene Entwürfe speichern, teilen, wiederverwenden

**Design-Referenz:** www.elemente.de — minimalistisch, warm, iPhone-artige Einfachheit

---

## Zahlungsmodell

### Empfehlung: Freemium + Credit-Pakete (später finalisieren)

| Tier | Preis | Inhalt |
|------|-------|--------|
| **Free** | 0€ | 3 Exporte/Monat, keine Draft-Speicherung |
| **Studio** | 9,90€/Monat | 30 Exporte, 50 Drafts, alle Features |
| **Workshop** | 29€/Monat | Unbegrenzte Exporte, 500 Drafts, Team bis 5 |

**Warum Credit/Paket:** Töpfer sind saisonal (Sommer = mehr, Winter = weniger). Credits übertragbar.

---

## Phasen-Übersicht

```
Phase 1: MVP 2.0          →  Auth + Drafts + neues UI        (2-4 Wochen)
Phase 2: Studio Features  →  KI-Erweiterungen + Workshop      (4-8 Wochen)
Phase 3: Community       →  Gallery + Netzwerk-Effekt        (8-16 Wochen)
```

---

## Phase 1: MVP 2.0 (2-4 Wochen)

**Ziel:** Kern-Produkt mit Auth, Drafts, modernem UI

### Paket A: Supabase Infrastructure ⚙️
**Unabhängig — zuerst**
- [x] ~~Supabase Projekt erstellen~~ (Chris muss selbst machen — Account nötig)
- [x] Database Schema: Users, Drafts, Payments
- [x] Auth: E-Mail + Google OAuth (NextAuth.js mit Supabase Adapter)
- [x] RLS Policies (User sieht nur eigene Drafts)
- [x] Storage Bucket für Thumbnails

### Paket B: Design System 🎨
**Unabhängig — parallel zu A**
- [ ] Farbpalette von elimente.de übernehmen
- [ ] Komponenten-Bibliothek (Cards, Buttons, Inputs)
- [ ] Layout-System (Mobile-First Grid)
- [ ] Dark/Light Mode Tokens
- [ ] Smooth Animations (Card-Reveal, Page-Transitions)

### Paket C: Auth UI + Backend 🔐
**Abhängig: A muss fertig sein**
- [ ] Login/Register Page
- [ ] Google OAuth Flow
- [ ] Profil-Seite (Name, Avatar)
- [ ] Passwort-Reset, Account-Löschung
- [ ] Protected Routes

### Paket D: Draft System Backend 📦
**Abhängig: A muss fertig sein**
- [ ] Draft CRUD API
- [ ] Thumbnail-Generierung (Canvas → PNG)
- [ ] Draft-Liste API (Sort, Search)
- [ ] Payment/Credit Tracking

### Paket E: Draft UI 📁
**Abhängig: B + D müssen fertig sein**
- [ ] Draft-Liste Seite
- [ ] Draft-Card Komponente
- [ ] Empty State (motivierender CTA)
- [ ] Onboarding-Flow (erster Login)

### Paket F: Core Integration 🔗
**Abhängig: C + E müssen fertig sein**
- [ ] Neues UI mit bestehender Kontur-Workflow verbinden
- [ ] Draft speichern nach STL-Export
- [ ] Credit-Counter anzeigen
- [ ] Usage-Limit Handling

---

## Phase 2: Studio Features (4-8 Wochen)

### KI-Erweiterungen
- [ ] **KI-Hintergrundentfernung** (Foto → sauberes Gefäß)
- [ ] **Form-Vergleich** — zwei Entwürfe übereinanderlegen
- [ ] **Symmetrie-Analyse** — ist die Form symmetrisch?
- [ ] **Maßstab-Rechner** — von Foto zu mm konvertieren

### Workshop-Features
- [ ] **Template-Bibliothek** — vorgefertigte Rib-Formen (Becher, Schale, Teller, Vase)
- [ ] **Form-Verfeinerung** — Kontur-Punkte manuell verschieben
- [ ] **Batch-Export** — mehrere Drafts als ZIP

### Team-Features (Workshop-Tier)
- [ ] Geteilter Workspace für Workshops
- [ ] Entwürfe teilen via Link
- [ ] Kommentar-Funktion

### Monetarisierung
- [ ] Stripe Integration
- [ ] Credit-Paket kaufen
- [ ] Usage-Tracking

---

## Phase 3: Community & Skalierung (8-16 Wochen)

### Community
- [ ] **Entwürfe teilen** — öffentliche Gallery (Inspiration)
- [ ] **Profil-Seite** — sehen welche Entwürfe ein Nutzer hat
- [ ] **"Mein Profil"-Links** — Töpfer können ihre Arbeit präsentieren

### AI-Erweiterungen
- [ ] **Automatische Form-Klassifizierung** — erkennt "Becher", "Schale", "Vase"
- [ ] **AI-Vorschläge** — "Menschen die diese Form mögen..."
- [ ] **Style-Transfer** — Umriss auf anderes Design übertragen

### Marketplace (langfristig)
- [ ] Rib-Formen verkaufen (Töpfer können Designs anbieten)
- [ ] Commission-Modell (Platform nimmt X%)

---

## Qualitätssicherung (QA)

### Automatisiert
- [ ] **TypeScript strict mode** — keine type errors
- [ ] **Build succeeds** — npm run build muss fehlerfrei durchlaufen
- [ ] **Unit Tests** — für kritische Funktionen (contour.ts, perspective.ts)
- [ ] **Lint** — eslint/prettier passes

### Manuell (vor jedem Push)
- [ ] **Storybook/CD** — neue Komponenten in Storybook dokumentieren
- [ ] **Mobile Test** — auf echtem Handy (iOS + Android)
- [ ] **Browser Test** — Chrome, Safari, Firefox
- [ ] **STL-Export Test** — generierte STL in PrusaSlicer/Cura öffnen und prüfen

### Test-Strategie
```
Vor jedem Commit/Push:
  ├── npm run build     → muss erfolgreich sein
  ├── npm run lint      → keine Errors
  └── npm test         → alle Tests grün

Vor jedem Deployment:
  ├── Manuelle Prüfung auf Mobile
  ├── Kontur-Erkennung testen (verschiedene Tassen)
  └── STL-Export verifizieren (in 3D-Software öffnen)
```

### Error Monitoring
- [ ] **Sentry** für Runtime-Fehler (Frontend)
- [ ] **Vercel Analytics** für Performance-Monitoring
- [ ] **Stripe Alerts** für Payment-Fehler

### Deployment-Regeln
- [ ] **Feature-Branches** für alle Pakete
- [ ] **PR-Review** vor Merge in main
- [ ] **Auto-Deploy** von main auf Vercel Preview
- [ ] **Manual Promote** von Preview → Production

---

## Sicherheits-Anforderungen

### absolute Priorität
- [ ] **Bilder werden NICHT dauerhaft gespeichert** — nur temporär für Draft-Verarbeitung
- [ ] Alternativ: Bilder verschlüsselt speichern (AES-256)
- [ ] Keine Trainings-Daten für KI-Modelle
- [ ] DSGVO-konform: Privacy Policy, Cookie-Banner, DPA

### Access Control
- [ ] JWT-Auth mit kurzer Lebensdauer + Refresh-Token
- [ ] Rate Limiting auf API-Endpunkte
- [ ] CSP Headers (Content Security Policy)
- [ ] Keine PII in Logs

### Backup & Recovery
- [ ] Drafts werden täglich gesichert
- [ ] User können ihre Daten exportieren (DSGVO Art. 20)
- [ ] Account-Deletion löscht alle Daten unwiderruflich

---

## Technische Architektur

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (Next.js 15)                │
│   React 19 · TypeScript · TailwindCSS                  │
│   MediaPipe (Browser-seitig — kein Backend für Segm.)   │
└──────────────────────┬──────────────────────────────────┘
                       │
          ┌────────────┴────────────┐
          │      Supabase           │
          │  Auth · Database · Store │
          └────────────┬────────────┘
                       │
          ┌────────────┴────────────┐
          │      Stripe             │
          │  Payments · Subs        │
          └─────────────────────────┘
```

### Warum Supabase:
- Auth eingebaut (Google, E-Mail)
- Postgres für relationale Daten
- RLS (Row Level Security)
- Günstiger als Firebase

---

## Offene Fragen

- [ ] Speicherort der Bilder: Cloudflare R2 vs. Supabase Storage
- [ ] KI-Hintergrundentfernung: Browser-seitig vs. Backend
- [ ] Zahlungsmodell finalisieren (später)
- [ ] Team-Größe Workshop: Max 5 oder unbegrenzt?

### Paket A — Offene Fragen (Supabase)

- [ ] **Chris muss Supabase Account haben** und ein Projekt erstellen unter https://app.supabase.com
- [ ] **Google OAuth Credentials nötig** — Chris muss in Google Cloud Console ein Project erstellen und OAuth Credentials generieren
- [ ] **Stripe Account später** für Payments (Phase 2)
- [ ] **SQL Migration ausführen** — Chris muss die Migration in Supabase Dashboard ausführen unter SQL Editor

### Paket A — Fortschritt ✅

- [x] `.env.local` erstellt (alle Supabase + NextAuth Variablen)
- [x] `.env.example` erstellt (als Template für andere Entwickler)
- [x] `supabase/migrations/001_initial_schema.sql` erstellt mit:
  - Tables: profiles, drafts, payments, usage
  - Indexes auf user_id, created_at
  - RLS Policies (profiles, drafts, payments, usage)
  - Auto-create profile trigger
  - Storage Bucket "thumbnails" mit Policies
- [x] `lib/supabase-admin.ts` erstellt (Service-Role Client)
- [x] API Routes erstellt:
  - `/app/api/auth/[...nextauth]/route.ts` — NextAuth.js mit Google OAuth + Supabase Adapter
  - `/app/api/drafts/route.ts` — GET (list), POST (create)
  - `/app/api/drafts/[id]/route.ts` — GET, PUT, DELETE
  - `/app/api/drafts/[id]/thumbnail/route.ts` — POST (upload thumbnail)

---

## Subagenten-Nutzung

### Muster:
```
Paket A (Supabase)    → Subagent 1
Paket B (Design)      → Subagent 2 (parallel)
Paket C (Auth)        → Subagent 3
Paket D (Draft BE)    → Subagent 4 (parallel zu C)
Paket E (Draft UI)    → Subagent 5
Paket F (Integration) → Clawy (koordiniert)
```

### Regeln:
- Jeder Subagent bekommt: SPEC.md + relevantes Paket
- Clawy macht Code-Review bevor Push
- Bei Prod-Änderungen: Chris informieren VOR Push
- RTK nutzen für CLI-Commands (Token-Sparen)

---

## Changelog

| Datum | Was |
|-------|-----|
| 2026-03-30 | Vollständiger Produkt-Plan erstellt |
| 2026-03-30 | Phase 1 gestartet (Supabase + Design parallel) |
| 2026-03-30 | Marktrecherche abgeschlossen (kein direktes Konkurrenzprodukt) |
| 2026-03-30 | Design-Referenz: elimente.de |
| 2026-03-30 | Zahlungsmodell: Freemium + Credit-Pakete (später finalisieren) |
