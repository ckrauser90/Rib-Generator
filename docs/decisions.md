# Entscheidungen – Rib Generator

Format nach dem Vorbild des web_baukasten: Datum, Entscheidung, Begründung, verworfene Alternativen.

---

## R-001 · 2026-10-05 · Easy Flow: Variante A mit Lupe aus B

**Entscheidung:** Der Standard-Ablauf wird Foto → Start/Ende → Fertig im Stil von Variante A
(Atelier, aktuelle Markenfarben), ergänzt um die Lupe beim Ziehen von Start/Ende aus Variante B.
Die heutigen Regler wandern in einen optionalen Pro-/Erweitert-Modus.

**Begründung:** Weniger Entscheidungen für Töpfer; die Lupe gibt es technisch schon (`lensPoint`).

**Verworfen:** Variante B (Kamera mit Live-Tipps) – zu aufwendig für den Start;
Variante C (Foto-Check statt Tipps vorab) – als spätere Ergänzung denkbar.

Entwürfe: https://claude.ai/artifact/KsnrMyon2mTQK5ihqjLqMM · Details: `docs/EASY-FLOW-PLAN.md`

---

## R-002 · 2026-10-06 · Segmentierung bleibt bei MediaPipe `magic_touch`

**Entscheidung:** MediaPipe Interactive Segmenter bleibt das Verfahren der App. BiRefNet lite
wird nicht eingebaut. Das Labor (`npm run lab:compare`) bleibt als Messwerkzeug für jede
künftige Änderung an der Erkennung.

**Begründung (Vergleichstest, Bericht https://claude.ai/artifact/TqHoE5g6qVAEoeUh9cgbFk):**

- *Satz A, 12 synthetische Bilder mit exakter Sollkontur:* Die rohe BiRefNet-Maske ist schärfer
  (0,01–0,05 mm gegenüber 0,07–0,28 mm). Nach der Kontur-Strecke der App, die die Kante am Foto
  einrastet, liegen beide bei 0,04–0,16 mm – weit unter dem 0,5-mm-Ziel. BiRefNet hat aber 3
  Ausreißer (Hintergrundobjekt mitgenommen 10 mm, weiß auf weiß 3 mm, erfundener Deckel 1,3 mm),
  MediaPipe keinen auf der Arbeitsseite.
- *Satz B, 11 echte Fotos (Schalen, Tassen, Kerzenhalter, Babyflasche):* In 7 Fotos liefern beide
  praktisch dieselbe Kante (≤ 0,4 mm Abstand). Wo sie sich unterscheiden, gewinnt bei der
  Sichtprüfung MediaPipe 3× (Tasse auf Regal: BiRefNet nimmt Regal und Rollenhalter mit;
  Kerzenhalter: BiRefNet nimmt Deko dahinter mit; verwackelte Tasse: BiRefNet nimmt Hand,
  Hocker und Papier mit), BiRefNet 1× (Babyflasche: MediaPipe läuft unten in die Hand).
- Entscheidungsregeln vorab festgelegt: Kriterium 1 (Genauigkeit) und 3 (Sichtprüfung
  ≥ 2 von 3) nicht erfüllt. BiRefNet sucht „das Hauptobjekt“ im Bild, MediaPipe das Objekt am
  Startpunkt – für unruhige Küchen- und Werkstattfotos ist Letzteres robuster.
- Zusätzlich: BiRefNet bräuchte ~224 MB Download im Browser.

**Verworfen:** BiRefNet als Standard; BiRefNet als Rückfall (seine Fehler sind gerade dort, wo
MediaPipe gut ist). Offen als Idee, nicht beauftragt: Schnittmenge beider Masken, falls Hände im
Bild ein häufiges Problem werden.

**Folgen für das Produkt (aus den echten Fotos):**

- Das Foto entscheidet mehr als das Modell. Gefäß in der Hand, Aufnahme schräg von oben und
  Verwacklung verfälschen die Kante bei beiden Verfahren. Die Foto-Tipps im Easy Flow sollen
  deshalb ausdrücklich sagen: Gefäß **abstellen**, Kamera **auf halber Höhe**, ruhig halten.
- Henkel und Finger im Henkel landen in der Maske. Die automatische Seitenwahl muss die Seite
  ohne Henkel nehmen.
