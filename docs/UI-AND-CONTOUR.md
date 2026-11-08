# Easy Flow und Konturglättung

Stand: 2026-11-08, Branch `fix/iphone-guided-camera`.

## Oberfläche

Der bestätigte Atelier-Entwurf wird im bestehenden Easy Flow umgesetzt: gestrichelte
Referenzkontur und durchgezogener grüner Arbeitsabschnitt, klare Beschriftung,
Rückgängig für die letzte Ankeränderung, automatische Anker, bestätigtes Höhenmaß,
einklappbare Schwindung und Foto-/3D-Vergleich vor dem Export. Die Startseite behält
eine leichte Gefäßillustration. Das generierte Fotomotiv des Entwurfs ist kein App-Asset.

Die Maßbestätigung wird bei einem neuen Foto und jeder Änderung der Höhe zurückgesetzt,
auch über den Pro-Modus. Ein Seitenwechsel oder eine neue Erkennung verwirft die alte
Ankerhistorie. Die STL heißt etwa `Rib_136.4x65x4.2mm.stl`: Höhe mit Schwindungsausgleich,
aufgelöste Breite und Dicke in Millimetern, auf eine Nachkommastelle gerundet.
Die Rundung betrifft nur den Namen. Der Downloadhinweis nennt Millimeter und 100 % Größe.

Die geführte Kamera erlaubt das Abschalten des Selbstauslösers. Der manuelle Auslöser
bleibt bis zum laufenden Videobild deaktiviert. Lagesensor und Kamera bleiben getrennt;
Kameradaten und normale Kamera als Ausweichmöglichkeit liegen hinter „Kamerahilfe“.

## Erkennung und Glättung

Drei bisherige Rundungen auf halbe Pixel wurden aus der Bildkanten-Verfeinerung und
der abschließenden Konturstabilisierung entfernt. Die bestehenden lokalen Grenzen
bleiben erhalten. Dadurch wird eine bereits geglättete Kante nicht wieder gerastert.
Da die Bildkanten-Verfeinerung den ganzen Pfad optimiert, können sich daraus auch
andere lokale Kandidaten ergeben; dies ist eine bewusste Änderung der Konturextraktion.

Die stärkere Rib-Glättung erkennt vorab anhaltende Extremstellen auf beiden Seiten
(auch spiegelverkehrt). Sie nutzt die vorhandene Kerbenerkennung mit Vorglättung,
Mindesttiefe und Nachbarschaft, ohne einen spitzen Winkel zu verlangen. Eine
Referenzhöhe von 120 mm macht die Schwellen unabhängig von der Fotoauflösung;
sie ist keine neue Messung der realen Gefäßhöhe. An diesen Merkmalen wird das
Rohprofil stärker gewichtet. Das Grundfilter entfernt weiterhin Pixelstufen.

Das erkannte Profil bleibt die Quelle; die Glättung verändert seine Daten nicht.
`displayWorkProfile` bleibt separat, mit maximal 0,9 Pixel horizontaler Abweichung.
`geometryWorkProfile` ist für Rib und STL zuständig. Es werden keine Wölbungen erfunden,
die in der Erkennungsmaske fehlen. Modellfehler oder schwacher Bildkontrast können
daher weiterhin verlorene Details verursachen.

## Prüfungen

- Unit-Tests für scharfe und runde Wölbungen, beide Seiten, mehrere Auflösungen,
  starke Glättung, Treppenreduktion, gerade Wand und unveränderte Eingabedaten.
- Synthetische Konturmaske prüft die grüne Anzeige und Subpixel-Koordinaten.
- Browser-Tests für Maßbestätigung, Foto-/3D-Wechsel, Downloadnamen, mobile
  Ankeränderung mit Rückgängig/Reset und abgeschalteten Kamera-Selbstauslöser.
- Manueller Diagnosevergleich am bestehenden Bubble-Foto `tasse-1.jpg`, mit derselben
  echten MediaPipe-Maske: Summe absoluter zweiter x-Differenzen sank links von 540,33
  auf 414,46 und rechts von 571,70 auf 421,24 (weniger Rasterwechsel). Diese Kennzahl
  ist kein Nachweis vollständiger Übereinstimmung mit der realen Gefäßform.
- Echtes iPhone und Passform eines gedruckten Werkzeugs noch nicht geprüft.

Verifikation abgeschlossen: 98 Unit-Tests, 38 Browser-Tests, 7 Header-Tests sowie
öffentlicher statischer Build. Die echte MediaPipe-Prüfung unter lokalem Wrangler
mit generierter CSP besteht im Worker und im Rückfallpfad; beide liefern dieselbe
STL mit 41.812 Dreiecken und 2.090.684 Bytes. Der öffentliche Build ignoriert die
Mock-URL-Option. Dies vergleicht die beiden aktuellen Laufzeitpfade, nicht die neue
Konturgeometrie mit einer früheren Version. Mobile Chromium-Prüfung mit 390 × 844:
keine horizontale Überbreite und keine Überlappung von Sucher und Kamerabedienung.
