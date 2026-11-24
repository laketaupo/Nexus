# Prompt: "My role"-view

Voeg een view **My role** toe aan het Views-menu van deze procesapp (L1 t/m L4). Volg de bestaande conventies van de codebase.

**Data:** gebruik de bestaande kolommen `R`, `A`, `S`, `C`, `I` per stap (rolnamen gescheiden door `;`, hoofdletterongevoelig). Geen nieuwe kolommen. Een stap is een node zonder kinderen (meestal L4).

**Gedrag**
- Gebruiker kiest een rol uit een lijst (A-Z, met aantal stappen). Onthoud rol, modus en letterfilter in local storage.
- Toon de hele procesboom met codes: `1 – S&OP`, `1.1 – …`, `1.1.1.1 – …`.
- Takken waarin de rol voorkomt: open, code in accentkleur, vetgedrukt, rechts "N steps". Overige takken: gedimd en ingeklapt, wel aanklikbaar om te openen.
- L1 t/m L3: geen kader of achtergrond. Alleen L4-stappen van de rol krijgen een kaart met een gekleurde balk links en ronde RASCI-letters (meerdere mogelijk). Kleuren: R blauw, A oranje-rood, S groen, C oker, I grijs; balk krijgt de kleur van de zwaarste letter (A > R > S > C > I).
- Schakelaar: **Whole process** / **Only my steps** (alleen takken met de rol).
- Letterchips bovenaan met totalen per letter; klikken filtert (meerdere tegelijk, "Show all letters" wist).
- Klik op een stap: sluit de view en open de stap in de procesweergave, kort gemarkeerd. Escape sluit de view.
- Lege toestanden: geen data, geen rol gekozen, geen stappen voor het filter.

**Klaar als:** bovenstaande werkt in licht en donker thema en op 390 px breed, en er zijn unit tests voor rollen verzamelen, letters per stap en stappen tellen met en zonder filter.
