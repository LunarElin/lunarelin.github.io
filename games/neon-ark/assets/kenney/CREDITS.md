# Kenney asset credits

Downloaded from the official Kenney website on 2026-10-20.

## Space Shooter Remastered

Author: Kenney Vleugels / Kenney.
Source: https://kenney.nl/assets/space-shooter-remastered
License: Creative Commons Zero (CC0). Original text: LICENSE-space-shooter.txt
Archive: https://kenney.nl/media/pages/assets/space-shooter-remastered/2cbf3c45c8-1774771931/kenney_space-shooter-remastered.zip
Archive SHA-256: 0EDBE0AB5CDA6C44901D8C42F150268FDFA0C8D48492098669F37E9C296929B5

The Space Shooter PNG files below were copied without pixel modifications. CSS positions and rotates the original engine flames behind the shuttle body and supplies glow and animation.

| Local file | Original archive path |
| --- | --- |
| engine-blue.png | PNG/Effects/fire01.png |
| engine-gold.png | PNG/Effects/fire16.png |
| starfield.png | Backgrounds/darkPurple.png |
| upgrade-armor.png | PNG/Power-ups/shield_silver.png |
| upgrade-coil.png | PNG/Power-ups/powerupRed_bolt.png |
| upgrade-dock.png | PNG/UI/playerLife2_blue.png |
| upgrade-pierce.png | PNG/Power-ups/powerupGreen_bolt.png |

The existing game and portfolio icon, `../../icon.svg`, still contains an unmodified Kenney `PNG/playerShip2_blue.png` as an embedded PNG data URL. This is the icon's only ship source; it does not request a separate PNG. Embedded image SHA-256: `c8b490d7658bd2ee0f0bd6eb761d0dd3cce7a6381efd9831bb62e75aa1348352`.

## Project-authored transport artwork

On 2026-10-23, the four fighter PNGs were replaced in gameplay with a single rounded transport-shuttle silhouette drawn directly as inline SVG in `../../art.mjs`. The body, light and shadow faces, three seat windows, passenger helmet silhouettes and outlined direction arrow are project-authored vector shapes, not copies of Kenney ship geometry. The body uses the four game colors. The three windows reflect the actual 0–3 passengers aboard; all colors use the same shape. Only the engine flame images in this composition come from Kenney, as listed above.

The unused separate fighter files `ship-cyan.png`, `ship-lime.png`, `ship-orange.png` and `ship-pink.png` were removed. Their former archive paths were `PNG/playerShip2_blue.png`, `PNG/playerShip3_green.png`, `PNG/playerShip2_orange.png` and `PNG/playerShip1_red.png`, respectively. The original embedded cyan icon remains unchanged.

## Planets

Author: Kenney.
Source: https://kenney.nl/assets/planets
License: Creative Commons Zero (CC0). Original text: LICENSE-planets.txt
Archive: https://kenney.nl/media/pages/assets/planets/512b578338-1677495391/kenney_planets.zip
Archive SHA-256: 289386E1CBC4A9A727654795B857C1F3F3447B170C7BA1CEEB9B007D1B84F683

| Local file | Original archive path |
| --- | --- |
| planet-cyan.png | Planets/planet05.png |
| planet-purple.png | Planets/planet04.png |

On 2026-10-21, both planet images were resized from 1280×1280 to 384×384 with Lanczos resampling and re-encoded as optimized RGBA PNGs for the small in-game planet display. The transparent background, color, aspect ratio and complete planet silhouette are preserved; resizing changes pixel samples. This reduces their combined size from 637,989 to 94,697 bytes and their decoded RGBA memory from 12.5 MiB to 1.125 MiB. No external image requests are used.

Only the nine PNG files listed in the asset tables are retained: two engine flames, two planets, one starfield and four upgrade icons. The 13 older combat sprites (enemy UFO, meteors, fragments, lasers, impacts, shield ring and obsolete upgrade icons) were removed on 2026-10-21, followed by the four separate fighter PNGs on 2026-10-23.

All images are hosted with the game; gameplay does not request images from Kenney.
Upgrade symbols are decorative art for passive upgrades, not usable or purchasable items.
