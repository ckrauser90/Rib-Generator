# Rib Generator – Marktforschung

**Datum:** 30.03.2026  
**Produkt:** KI-basierte Web-App, die aus einem Foto einer Tasse/eines Gefäßes ein Rib-Profil (Werkzeugform für die Töpferscheibe) generiert und als STL-Datei für den 3D-Druck exportiert.  
**Zielgruppe:** Hobby-Töpfer, semi-professionelle Töpfer, Keramik-Workshops

---

## 1. Marktanalyse

### 1.1 Gibt es vergleichbare Tools?

**Kurzantwort: Nein – ein direktes Konkurrenzprodukt (Foto → Rib-Profil-STL) existiert nicht.** Es gibt verwandte Tools in drei Kategorien:

#### Kategorie A: Freie STL-Dateien ( Thingiverse, Printables, Cults3D )
| Plattform | Art des Angebots | Preis | STL-Qualität |
|---|---|---|---|
| Thingiverse | Vorgefertigte Rib-Formen zum Download | Kostenlos | Generisch, nicht anpassbar |
| Printables / Cults3D | Ebenda | Kostenlos | Profilform muss passend gefunden werden |
| **Problem** | Keine Anpassung an individuelle Gefäßformen möglich | — | — |

#### Kategorie B: Online-Designer für Custom Physical Ribs
| Tool | Beschreibung | Preis |
|---|---|---|
| **CustomPotteryRibs.com** | 3-Schritt-Designer (Design → Material → Bestellung), druckt und versendet physische Ribs in PLA/PETG/ABS | Physisches Produkt, kein reiner STL-Download; Versandkosten |
| **LittleChip Tools** | 3D-gedruckte Werkzeuge (Clay Extruder, Tray Cutter), kein Online-Designer für eigene Uploads | Shop-Preise |

**CustomPotteryRibs ist der nächste Verwandte** – aber es ist ein Bestellprozess für physische Produkte, kein KI-Tool und kein STL-Export zum Selberdrucken.

#### Kategorie C: KI-basierte 3D-Generatoren (allgemein)
| Tool | Image-to-3D? | STL-Export? | Domäne |
|---|---|---|---|
| **Meshy AI** | ✅ | ✅ (.fbx, .obj, .stl, .glb, .usdz) | Generisch (Gamedev, 3D-Druck) |
| **Tripo 3D** | ✅ | ✅ (.stl, .obj, .glb) | Generisch |
| **PrintPal** | ✅ | ✅ (.stl, .obj, .glb) | Generisch, auf 3D-Druck fokussiert |
| **Sloyd** | ✅ | ✅ | Generisch (Parametric Editing) |
| **3D Potter Potterware** | Nein (Slider-basiert) | ✅ (nur für Clay-3D-Drucker) | Keramik-spezifisch, aber kein Foto-Upload |
| **PotterDraw** | Nein (Spline-basiert) | ❓ | Keramik, Freeware, veraltet |

**Meshy** ist der stärkste technische Vergleich – aber nicht auf pottery ribs spezialisiert. Die KI versteht keine Rib-Geometrie; Generierung ist Trial-and-Error.

#### Kategorie D: Physische Ribs (Marktpreise als Referenz)
| Marke / Typ | Einzelpreis (USD) | Quelle |
|---|---|---|
| MudTools Polymer Rib (Shape 0–5) | $7,65 – $9,00 | clay-king.com |
| Wiziwig Profile Rib | $18,00 – $25,00 | baileypottery.com |
| Sheffield Pottery Holz-Ribs | $5,00 – $15,00 | sheffield-pottery.com |
| DiamondCore Silicone Ribs | $10,00 – $20,00 | diamondcoretools.com |
| **Outpost Pottery Profile Ribs (Bundle 4er)** | ~$30,00 (~$7,50/Stk) | outpostpottery.com |

**Fazit:** Ein Töpfer gibt **$8–25 pro physischem Rib** aus. Ein digitales STL-Tool muss diesen Referenzpreis im Kopf behalten.

### 1.2 Marktübersicht: Pottery Studio Software Landscape

```
KOMMERZIELL / ABONNEMENT
├── Potterware (Emerging Objects)
│   ├── Zielgruppe: Clay-3D-Drucker (Potterbot, Lutum)
│   ├── Features: Slider-basiertes Design, kein KI
│   └── Preis: Auf Anfrage / Unternehmenslizenz
│
├── 3D Potter Software
│   ├── Bundle mit 3D-Druckern
│   └── Slicing + Design für Keramik-Drucker
│
GRATIS / COMMUNITY
├── PotterDraw (SourceForge)
│   ├── Kostenlos, spline-basiert
│   └── Veraltet, kein STL-Export ohne Workaround
│
├── Thingiverse / Printables / Cults3D
│   ├── Tausende kostenlose STL-Files
│   └── Kaum ribspezifisch, keine KI
│
KI-GESTÜTZT (GENERISCH)
├── Meshy AI, Tripo 3D, PrintPal, Sloyd
│   ├── Bild → 3D-Modell
│   └── NICHT auf pottery ribs spezialisiert
│
CUSTOM PHYSICAL
├── CustomPotteryRibs.com
│   ├── Online-Designer → physische Ribs
│   └── Kein reiner STL-Download
│
└── LittleChip Tools
    ├── Shop für 3D-gedruckte Werkzeuge
    └── Kein Custom-Designer für eigene Uploads
```

### 1.3 Lücke im Markt (Gap-Analyse)

```
Töpfers Bedürfnis:
  "Ich habe eine Tasse, deren Form ich als Werkzeug
   nachbauen will – als STL zum Selberdrucken."

Aktuelle Optionen:
  ❌ Thingiverse: Kein Foto-Upload → generisches Rib suchen
  ❌ CustomPotteryRibs: Designer → physisches Teil bestellen
  ❌ Meshy/Tripo: KI → aber keine Rib-Domäne, kein Form-Konzept
  ❌ CAD-Software (Fusion360): Zu komplex für Töpfer

→ Genau diese Lücke füllt Rib Generator
```

---

## 2. Zahlungsmodell-Vergleich

### 2.1 Die vier Grundmodelle im Überblick

| Modell | Funktionsweise | Beispiele | Optimal für |
|---|---|---|---|
| **Credit-basiert** | Nutzer kauft Credits → ein Entwurf kostet X Credits | Meshy AI (20 Credits/Generation) | Sporadische Nutzer |
| **Pay-per-Export** | Pro STL-Download X € bezahlen | Etsy STL-Downloads ($3–15/Datei) | Einmalige Nutzung |
| **Monats-Abo** | X €/Monat → Y Inklusiv-Exporte | PrintPal ($10/200/Monat) | Regelmäßige Nutzer |
| **Freemium** | Free-Tier mit Limit + Pro-Upgrade | Tripo, PrintPal | Erst Testen, dann Kaufen |

### 2.2 Vergleich der KI-3D-Generator-Preise (aktuelle Daten)

| Anbieter | Free Tier | Einstiegs-Paid | Mid-Tier | High-Tier |
|---|---|---|---|---|
| **Meshy AI** | 100 Credits/Monat (~10 Bild-zu-3D Generierungen) | Pro: $20/Monat (1.000 Credits → ~50 Modelle) | Studio: $60/Monat (4.000 Credits) | Enterprise: Custom |
| **Tripo 3D** | 300 Credits/Monat (1 Modellgeneration = 40 Credits) | $11,94/Monat (3.000 Credits → ~75 Modelle) | $29,94/Monat (8.000 Credits) | $83,94/Monat (25.000 Credits) |
| **PrintPal** | 10 Generationen/Monat | $10/Monat (200 Generationen) | $25/Monat (500 Generationen) | Custom Enterprise |
| **Sloyd** | Unbegrenzte Generationen (kein Credit-System) | $15/Monat (Plus) | — | — |

**Effektiver Preis pro Modellgeneration (Mid-Tier Vergleich):**

| Anbieter | Mid-Tier Preis | Credits | Effektiv $/Modell |
|---|---|---|---|
| Meshy Pro | $20/Monat | 1.000 Credits / 20 Credit pro Modell | ~$0,40 |
| Tripo Pro | $11,94/Monat | 3.000 Credits / 40 Credit pro Modell | ~$0,21 |
| PrintPal Pro | $10/Monat | 200 Generationen (kein Credit-System) | $0,05 |
| Sloyd Plus | $15/Monat | Unlimited | $0,015 (bei 1.000/Monat) |

### 2.3 Für wen funktioniert was?

#### Credit-basiert (Meshy-Stil)
**Vorteile:**
- Flexibel: Nutzer kauft bei Bedarf nach
- Gut für unregelmäßige Nutzer (z.B. Hobby-Töpfer, die 1x/Monat ein Rib brauchen)
- Skalierbar bei seltenem, aber hohem Bedarf

**Nachteile:**
- Psychologisch friction-behaftet: Nutzer zögert wegen Credit-Kauf
- Komplex zu kommunizieren (was kostet ein Rib?)
- Niedrige Conversion (Free → Paid)

**Typische Nutzer:** Gelegenheitsnutzer, Erstkäufer auf Etsy

#### Pay-per-Export (z.B. Etsy-STL-Downloads $3–15)
**Vorteile:**
- Kein Risiko für Nutzer (zahlt nur bei Gefallen)
- Sofort monetarisierbar
- Simpel zu verstehen

**Nachteile:**
- Keine wiederkehrenden Einnahmen
- Kein Community-Aufbau
- Nutzer sucht sich günstigsten Anbieter

**Typische Nutzer:** Einmalige Projekte, Etsy-Käufer

#### Monats-Abo (PrintPal-Stil)
**Vorteile:**
- Vorhersehbare MRR (Monthly Recurring Revenue)
- Nutzer "freezt" seinen Bedarf: 10/Monat oder 200/Monat
- Höhere Retention als Credits

**Nachteile:**
- Friction für neue Nutzer ("Ich muss monatlich zahlen?")
- Nutzer kündigt bei Nicht-Nutzung
- Fairness-Problem: Vielnutzer fühlen sich ggü. Wenignutzer benachteiligt

**Typische Nutzer:** Semi-Profis, Workshops mit regelmäßigem Bedarf

#### Freemium (Free + Pro)
**Vorteile:**
- Niedrige Einstiegshürde
- Viralität: Nutzer zeigt免费 Ergebnisses → andere probieren
- Kann größere Community aufbauen

**Nachteile:**
- Hohe Drop-Off-Rate (viele free, wenige paid)
- Braucht klares Free-Limit das "gerade genug" bietet
- Braucht starkes Upgrade-Argument

**Typische Nutzer:** Hobby-Töpfer, Erstkontakt

### 2.4 Empfehlung für Rib Generator: Hybrid-Modell

```
┌─────────────────────────────────────────────────────────────┐
│  RIB GENERATOR – EMPFOHLENES PREISMODELL                  │
├─────────────────────────────────────────────────────────────┤
│  FREE TIER                                                  │
│  • 3 Rib-Generationen/Monat                                 │
│  • STL-Download (Standard-Qualität)                         │
│  • Kein Account nötig (oder einfache Registrierung)        │
│  → Ziel: Ausprobieren, Viralität                            │
├─────────────────────────────────────────────────────────────┤
│  PRO (Credit-basiert add-on)                                │
│  • Abo: €7,99/Monat ODER €19,99/Monat                      │
│  • 5 Credits/Monat (Pro) oder 20 Credits (Pro+)            │
│  • 1 Generation = 1 Credit (einfache Kommunikation!)       │
│  • Höhere Auflösung, priorisierte Queue                    │
├─────────────────────────────────────────────────────────────┤
│  WORKSHOP / TEAM                                            │
│  • €29,99/Monat                                             │
│  • 5 Team-Members                                           │
│  • 50 Credits/Monat geteilt                                 │
│  • Bulk-Download, Team-History                              │
├─────────────────────────────────────────────────────────────┤
│  PAY-PER-EXPORT (als Alternative)                           │
│  • €2,99 pro Einzel-Export (ohne Abo)                       │
│  • Für Nutzer die kein Abo wollen                           │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Preis-Positionierung

### 3.1 Referenzrahmen: Physische Ribs vs. Digitale STL

| Produktkategorie | Einzelpreis | Nutzungsszenario |
|---|---|---|
| Günstiges Import-Rib (Amazon) | $3–8 | Wegwerftool, mindere Qualität |
| Marken-Rib (MudTools, Wiziwig) | $8–25 | Hochwertig, aber generisch |
| Custom 3D-gedrucktes Rib (CustomPotteryRibs) | ~$15–40 + Versand | Passgenau, aber physisch bestellen |
| **Rib Generator (digital)** | **€2–20/Export oder €7,99/Monat** | **Passgenau, sofort STL, selbst drucken** |

### 3.2 Segmentierung: Hobby vs. Semi-Profi vs. Workshop

| Segment | Bedarf | Zahlungsbereitschaft | Empfohlenes Modell |
|---|---|---|---|
| **Hobby-Töpfer** | Gelegentlich (1–3 Ribs/Monat) | Niedrig ($5–10/Monat äquivalent) | Freemium: 3 Free + Credit-Nachkauf oder €2,99/Export |
| **Semi-Profi** | Regelmäßig (5–15/Monat) | Mittel ($10–20/Monat) | Pro-Abo: €7,99–19,99/Monat |
| **Keramik-Workshop** | Hoch (20–50/Monat, mehrere Nutzer) | Hoch ($30–60/Monat für Team) | Workshop-Abo: €29,99/Monat für 5 Nutzer |
| **Kommerzielle Werkstatt** | Sehr hoch | Sehr hoch | Custom Enterprise: €99+/Monat, API-Zugang |

### 3.3 Wettbewerbspreisanalyse

| Wettbewerber | Modell | Effektiver Preis | Einschränkung |
|---|---|---|---|
| Etsy STL Downloads | Pay-per-File | $3–15 einmalig | Kein KI, muss passendes Design finden |
| CustomPotteryRibs.com | Physisches Produkt | $15–40 + Versand | Lieferzeit, kein STL-Download |
| Meshy AI (Image-to-3D) | Credit + Abo | ~$0,40/Modell (Pro) | Generisch, keine Rib-Spezialisierung |
| PrintPal | Abo | $10/Monat (200/Monat) | Generisch |
| Thingiverse | Kostenlos | $0 | Kein KI, generische Designs |

### 3.4 Preis-Empfehlung für Rib Generator

```
STRATEGISCHE PREISPOSITIONIERUNG:

Referenzpunkt:      $8–25 (physisches Marken-Rib)
Wettbewerbsvorteil:  Digitale Kopie = sofort, günstiger, anpassbar
psychologischer Anker: "Billiger als ein physisches Rib"

┌──────────────────────────────────────────────────────┐
│  FREE       →  3 Exports/Monat                      │
│              →  Generiert Conversion & Virality       │
├──────────────────────────────────────────────────────┤
│  STARTER    →  €4,99/Monat                           │
│              →  10 Exports/Monat (oder Pay-per €1,99) │
├──────────────────────────────────────────────────────┤
│  PRO        →  €12,99/Monat                           │
│              →  30 Exports/Monat                      │
│              →  Hohe Auflösung STL, Priority Queue    │
├──────────────────────────────────────────────────────┤
│  WORKSHOP   →  €34,99/Monat                          │
│              →  100 Exports/Monat, 5 Team-Members     │
├──────────────────────────────────────────────────────┤
│  PAY-PER    →  €3,49/Export (ohne Abo)              │
│              →  Für einmalige Nutzer                  │
└──────────────────────────────────────────────────────┘

BEGRÜNDUNG:
- Pro-Preis (€12,99) = ~$14 → entspricht 1-2 physischen Ribs
  → Aber: unbegrenzte Iterationen, sofort, anpassbar
- Workshop-Preis unter den $200/Monat von Meshy Studio
- Pay-per-export über Etsy ($3–15), aber einfacher (kein Suchen)
```

---

## 4. Sicherheitsanforderungen & Vertrauen

### 4.1 Was die Keramik-Community braucht, um einer Web-App zu vertrauen

Die Keramik-Community ist traditionell, handwerklich und skeptisch gegenüber "Black-Box"-Technologie. Vertrauen baut sich auf vier Säulen auf:

#### Säule 1: Datenschutz & Kontrolle über eigene Bilder

**Bedenken von Töpfern:**
- "Meine Tassen/Designs sind meine geistiges Eigentum – werden sie für KI-Training verwendet?"
- "Was passiert mit meinem Foto? Wer hat Zugriff?"
- "Ich habe handgemachte Unikate – das ist mein kreativer Wert."

**Anforderungen an Rib Generator:**
```
☑ Explizite Zusicherung: "Deine Bilder werden NICHT für KI-Training verwendet"
☑ Bilder werden nach Verarbeitung gelöscht (keine dauerhafte Speicherung)
☑ Optional: Lokale Bildverarbeitung / Edge-Computing (kein Upload nötig)
☑ Keine Weitergabe an Dritte
☑ DSGVO-konforme Datenschutzerklärung (lesbar, nicht in 40-Seiten-Legal)
```

#### Säule 2: Transparenz bei der KI-Generierung

- Erklärbare KI: "Das ist das Profil, das wir aus deinem Foto erstellt haben" (mit Vorschau)
- Bearbeitungsmöglichkeit: Nutzer soll das generierte Profil anpassen können (Kurve, Dicke, Lippe)
- Keine "schwarze Box" – zumindest einfache Parameter zum Tunen

#### Säule 3: Community- & Social Proof

| Vertrauenssignal | Umsetzungsidee |
|---|---|
| Testimonials | Echte Töpfer zeigen ihre selbstgedruckten Ribs |
| Workshop-Partner | Keramik-Workshops als Early Adopters gewinnen |
| Before/After | Foto-Upload → generiertes STL → gedrucktes Rib → Ergebnis |
| Open Source / Audit | Teile des Prozesses offenlegen |
| Datenschutz-Badge | "Verified: Kein KI-Training, keine Bildspeicherung" |
| Reddit/Forum-Präsenz | Aktiv in r/Pottery, r/Ceramics, deutschen Keramik-Foren |

#### Säule 4: Zuverlässigkeit & Qualität

- Konsistente STL-Qualität (keine "verpixelten" Ergebnisse)
- Schnelle Generierung (< 30 Sekunden als Ziel)
- Funktionale 3D-Druckbarkeit (Keine löchrigen meshes, printbare Wandstärken)
- Support: E-Mail oder Discord für Probleme

### 4.2 DSGVO / GDPR Überlegungen

#### Was ist personenbezogen / sensitiv?

| Datentyp | Risiko | Maßnahme |
|---|---|---|
| **Hochgeladene Fotos** | Können Gesichter, Hände, Hintergründe mit Privatleben enthalten → personenbezogene Daten | Bilder sofort nach Generierung löschen, keine Speicherung |
| **Generierte STL-Dateien** | technisch nicht personenbezogen | Aber: Eigentumsrecht muss klar sein (Lizenz) |
| **E-Mail-Adressen (Login)** | Personendaten | DSGVO-konforme Speicherung, Auskunftslöschung ermöglichen |
| **Zahlungsdaten** | Über Payment-Provider (Stripe etc.), nicht selbst speichern | PCI-DSS-konform |
| **IP-Adressen / Logs** | Können personenidentifizierbar sein | Anonymisierung / kurze Retention |

#### Konkrete DSGVO-Maßnahmen für Rib Generator:

```
1. RECHTLICHE BASIS
   └── Art. 6 Abs. 1 lit. b DSGVO: Vertragserfüllung (Bereitstellung des Dienstes)
   └── KEINE Einwilligung für Marketing nötig für Basic-Nutzung

2. DATENMINIMIERUNG
   └── Nur so viel erheben wie nötig
   └── Keine Account-Pflicht für Free-Tier wenn möglich
   └── Fotos werden NICHT auf Server gespeichert (nur transient verarbeitet)

3. LÖSCHKONZEPT
   └── Fotos: Sofort nach STL-Generierung löschen (max. 24h wenn Debugging nötig)
   └── STL-Dateien: Auf Wunsch des Nutzers löschen
   └── Account-Daten: Auf Wunsch vollständig löschen (Art. 17 DSGVO)

4. DATENVERARBEITUNGSVERTRAG (AVV)
   └── Bei Nutzung von Cloud-APIs (OpenAI, Stability AI, etc.)
   └── Server-Host (z.B. Vercel, Railway, AWS)
   └── Payment-Provider (Stripe)
   → DSGVO-konforme Auftragsverarbeitungsverträge abschließen

5. DATENSPEICHERORT
   └── EU-Server bevorzugen (z.B. Hetzner EU, AWS Frankfurt)
   └── Falls US-Cloud: Standardvertragsklauseln (SCCs) prüfen

6. DATENSCHUTZERKLÄRUNG (Privacy Policy)
   └── Lesbar formuliert (kein 8-Seiten-Legal-Deutsch)
   └── Klar: Was speichern wir? Wie lange? Wer hat Zugriff?
   └── Einwilligung für Marketing (Newsletter) separat und optional

7. COOKIES
   └── Consent-Banner (für EU-Nutzer) wenn Analytics/Session-Cookies
   └── Alternativ: Cookiefreie Analytics (Plausible, Fathom)

8. OPT-OUT MECHANISMEN
   └── "Mein Account → Alle meine Daten herunterladen"
   └── "Mein Account → Account und alle Daten löschen"
```

### 4.3 KI-Trainings-Datensatz: Besondere Sensibilität

**Kritischer Punkt:** Viele Töpfer haben Angst, dass ihre Designs/Photos für KI-Training verwendet werden – besonders relevante Bilder = urheberrechtlich geschütztes Design.

**Empfehlung:**
- **Explizite, prominente Aussage:** "Wir nutzen deine Fotos NIEMALS für KI-Training"
- **Technisch absichern:** Bilder werden nur für die aktuelle Session verarbeitet, dann verworfen
- **Optional:** Lokale Verarbeitung (Browser-seitig) für maximale Privacy
- **Kein Dataset** – keine Sammlung von User-Generierten Inhalten für Training

---

## 5. Zusammenfassung & Handlungsempfehlungen

### 5.1 Markt-Chancen

- **Direkter Mitbewerber:** Keiner (Einzigartigkeits-Alleinstellung)
- **Indirekte Konkurrenz:** Generische KI-3D-Tools (Meshy, Tripo) + STL-Marktplätze
- **Marktlücke:** Töpfer brauchen ein spezialisiertes, einfaches Tool für Rib-Design aus Fotos
- **Timing:** 3D-Drucker in Privathaushalten wachsen, Keramik erlebt Renaissance (Pottery-Boom seit 2020)

### 5.2 Preismatrix (Empfehlung)

| Tier | Monatlich | Credits/Exports | Best for |
|---|---|---|---|
| Free | €0 | 3/Monat | Ersttest, Virality |
| Starter | €4,99 | 10/Monat | Gelegenheitsnutzer |
| Pro | €12,99 | 30/Monat | Semi-Profis |
| Workshop | €34,99 | 100/Monat, 5 User | Keramik-Workshops |
| Pay-per | €3,49 | 1 Export | Einmalige Nutzung |
| Enterprise | Custom | Unlimited + API | Kommerzielle Nutzung |

### 5.3 Prioritäten für Launch

1. **Datenschutz prominent kommunizieren** (Killer-Argument gegenüber generischen KI-Tools)
2. **Freemium mit 3 Free-Exports** (niedrige Einstiegshürde, dann Up-Sell)
3. **Workshop-Partner als Early Adopters** (Glaubwürdigkeit, Testimonials)
4. **Einfache STL-Qualität** (das Tool muss druckbare Ergebnisse liefern, nicht nur schöne Bilder)
5. **Nischen-Community-Marketing** (r/Pottery, Keramik-Foren, Instagram)

---

*Quellen:* Thingiverse, Printables, Cults3D, CustomPotteryRibs.com, LittleChip Tools, Meshy.ai, Tripo3D.ai, PrintPal.io, Sloyd.ai, 3D Potter, Potterware/Emerging Objects, Sheffield Pottery, Bailey Pottery, Clay-King, Sloyd AI Blog (3D AI Price Comparison 2026), Wiziwig Tools
