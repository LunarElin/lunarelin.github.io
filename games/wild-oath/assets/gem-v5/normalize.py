"""Deterministic slicing/encoding of the selected generated atlas family.

No drawing, recoloring, generative editing, or source-file modification occurs here.
Run with the bundled Python/Pillow and --source-dir pointing at the generation archive.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
PORTRAIT = "exec-bda28004-be2e-4929-b2c6-9dd2c8f12cb9.png"
FORM_SOURCE = "exec-9660f3fe-8ecc-41f9-aade-f142d15d4cf7.png"
FORM_Y = [0, 510, 985, 1536]
FORM_IDS = ["wolf", "bear", "wyvern"]
SHEETS = {
    "A": ("exec-cb903ce3-0649-4e34-b4f4-02a365f1b331.png", [0, 296, 574, 887],
          "claw bite bark mend sap venom thorns storm pounce".split()),
    "B": ("exec-3c7b990a-2ae7-422f-88db-03f2c2c1af00.png", [0, 296, 583, 887],
          "ancient moonwell frost wildheart ember nettle static harvest".split()),
    "C": ("exec-e63d9e5d-31d0-4dd0-b401-d5a0d8b98b33.png", [0, 295, 590, 887],
          "sprout hide trample talon renewal kindle rally harry".split()),
}
X = [0, 592, 1183, 1774]
SUBJECTS = ["wolf", "bear", "wyvern", "druid", "guardian", "clearing"]


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def encode(image: Image.Image, quality: int) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="WEBP", quality=quality, method=6, exact=True)
    return buffer.getvalue()


def source(path: Path) -> tuple[Image.Image, dict]:
    data = path.read_bytes()
    image = Image.open(io.BytesIO(data)).convert("RGB")
    return image, {
        "kind": "generated", "tool": "OpenAI built-in image_gen",
        "model": "not exposed by tool", "generation_id": "not exposed by tool",
        "original": path.name + " retained in generated-image archive; not shipped",
        "source_sha256": digest(data), "size": list(image.size),
    }


def record(path: str, data: bytes, size: tuple[int, int]) -> dict:
    return {"file": path, "size": list(size), "bytes": len(data), "sha256": digest(data),
            "alpha": "opaque", "color_space": "sRGB", "filtering": "smooth",
            "status": "Technical constraints and native-scale stationary contact-sheet review passed; representative runtime review is recorded in ../../GEM-ART-UPDATE.md"}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--preview", type=Path)
    args = parser.parse_args()
    portrait_source, portrait_provenance = source(args.source_dir / PORTRAIT)
    assert portrait_source.size == (1536, 1024)
    portrait_image = portrait_source.resize((1152, 768), Image.Resampling.LANCZOS)
    portrait_provenance.update(reference="none; project character brief and requested broad animation style",
                               prompt_record="prompts/portraits.txt")
    cards, source_records = [], []
    for sheet_id, (filename, y, ids) in SHEETS.items():
        image, provenance = source(args.source_dir / filename)
        assert image.size == (1774, 887)
        provenance.update(sheet=sheet_id, reference="Selected original portrait " + PORTRAIT,
                          grid=[3, 3], cell_aspect=[2, 1], grid_boundaries={"x": X, "y": y},
                          prompt_record="prompts/cards-" + sheet_id.lower() + ".txt")
        source_records.append(provenance)
        for index, card_id in enumerate(ids):
            col, row = index % 3, index // 3
            box = [X[col] + (2 if col else 0), y[row] + (2 if row else 0),
                   X[col + 1] - (2 if col < 2 else 0), y[row + 1] - (2 if row < 2 else 0)]
            panel = image.crop(box).resize((320, 160), Image.Resampling.LANCZOS)
            cards.append((card_id, panel, {"source_sheet": sheet_id, "atlas_cell": [col, row],
                                          "crop_box": box, "pivot": [.5, .5],
                                          "collision_role": "none; action illustration only"}))
    assert len(cards) == 25 and len({row[0] for row in cards}) == 25
    form_source, form_provenance = source(args.source_dir / FORM_SOURCE)
    assert form_source.size == (1024, 1536)
    form_provenance.update(reference="Selected original portrait " + PORTRAIT,
                           grid=[1, 3], cell_aspect=[2, 1],
                           grid_boundaries={"x": [0, 1024], "y": FORM_Y},
                           prompt_record="prompts/forms.txt")
    form_images = []
    for row, form_id in enumerate(FORM_IDS):
        box = [0, FORM_Y[row] + (2 if row else 0), 1024,
               FORM_Y[row + 1] - (2 if row < 2 else 0)]
        panel = form_source.crop(box).resize((320, 160), Image.Resampling.LANCZOS)
        form_images.append((form_id, panel, {"atlas_cell": [0, row], "crop_box": box,
                                            "pivot": [.5, .5], "collision_role": "none; transformation card illustration only"}))
    card_quality = 78
    while True:
        encoded = [(card_id, encode(image, card_quality), meta) for card_id, image, meta in cards]
        card_bytes = sum(len(data) for _, data, _ in encoded)
        if card_bytes <= 350000 or card_quality <= 74:
            break
        card_quality -= 2
    form_quality = 78
    while True:
        encoded_forms = [(form_id, encode(image, form_quality), meta) for form_id, image, meta in form_images]
        form_bytes = sum(len(data) for _, data, _ in encoded_forms)
        if card_bytes + form_bytes + len(encode(portrait_image, 80)) <= 550000 or form_quality <= 74:
            break
        form_quality -= 2
    portrait_quality = 80
    while True:
        portrait_data = encode(portrait_image, portrait_quality)
        if card_bytes + form_bytes + len(portrait_data) <= 550000 or portrait_quality <= 74:
            break
        portrait_quality -= 2
    assert card_bytes <= 430000 and card_bytes + form_bytes + len(portrait_data) <= 650000
    (ROOT / "cards").mkdir(exist_ok=True)
    (ROOT / "forms").mkdir(exist_ok=True)
    (ROOT / "portraits.webp").write_bytes(portrait_data)
    assets = []
    for card_id, data, meta in encoded:
        filename = "cards/" + card_id + ".webp"
        (ROOT / filename).write_bytes(data)
        assets.append({"id": card_id, **record(filename, data, (320, 160)), **meta,
                       "webp_quality": card_quality})
    forms = []
    for form_id, data, meta in encoded_forms:
        filename = "forms/" + form_id + ".webp"
        (ROOT / filename).write_bytes(data)
        forms.append({"id": form_id, **record(filename, data, (320, 160)), **meta,
                      "webp_quality": form_quality})
    portrait = record("portraits.webp", portrait_data, (1152, 768))
    portrait.update(grid=[3, 2], cell=[384, 384], subjects=SUBJECTS, webp_quality=portrait_quality)
    board_data = (ROOT / "board.svg").read_bytes()
    manifest = {
        "version": 5, "date": "2026-10-30", "family": "Wild Oath jewel magical mascots",
        "visual_target": "Root selected the generated large-eyed, rounded magical forest mascot family; saturated jewel colors, glossy soft 3D forms, readable original silhouettes.",
        "sources": {"portraits": portrait_provenance, "cards": source_records, "forms": form_provenance},
        "normalization": {"method": "Visually and pixel-edge verified full panels sliced at recorded unequal row boundaries; 2 source pixels excluded at internal seams; full-panel Lanczos resize, no center crop, repaint or recolor.",
                          "webp_method": 6, "portrait_webp_quality": portrait_quality,
                          "card_webp_quality": card_quality, "form_webp_quality": form_quality,
                          "card_output": [320, 160], "form_output": [320, 160],
                          "unused_cells": "B and C bottom-right empty cells not shipped"},
        "portrait": portrait, "assets": assets, "forms": forms,
        "board": {"file": "board.svg", "size": [512, 512], "bytes": len(board_data),
                  "sha256": digest(board_data), "kind": "original project-authored SVG",
                  "source": "board.svg editable vector source; no external image input",
                  "pivot": [.5, .5], "collision_role": "none; repeating visual background only",
                  "status": "XML syntax checked; board viewed in PC and phone-sized in-app browser viewports; see ../../GEM-ART-UPDATE.md"},
        "portrait_bytes": len(portrait_data),
        "card_bytes": card_bytes, "form_bytes": form_bytes,
        "total_bytes": len(portrait_data) + card_bytes + form_bytes,
        "budget": {"preferred_total_bytes": 550000, "preferred_card_bytes": 350000,
                   "hard_total_bytes": 650000, "hard_card_bytes": 430000},
        "review_scope": "Source atlases selected by root; numerical seam, dimensions, hashes, opaque WebP and byte budget checked. Stationary contact sheet reviewed at 130px portraits and 160x80/80x40 card scale. Representative draft, camp, battle and catalogue runtime review is recorded in ../../GEM-ART-UPDATE.md; this does not cover physical mobile devices or measured performance.",
    }
    (ROOT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if args.preview:
        canvas = Image.new("RGB", (960, 1000), "#30234e")
        draw = ImageDraw.Draw(canvas)
        decoded_portrait = Image.open(ROOT / "portraits.webp").convert("RGB")
        for index, subject in enumerate(SUBJECTS):
            x, y = index * 160, 0
            col, row = index % 3, index // 3
            cell = decoded_portrait.crop((col * 384, row * 384, (col + 1) * 384, (row + 1) * 384))
            canvas.paste(cell.resize((130, 130), Image.Resampling.LANCZOS), (x + 15, y))
            draw.text((x + 15, 135), subject, fill="white")
        for index, (card_id, image, _) in enumerate(cards):
            image = Image.open(ROOT / "cards" / (card_id + ".webp")).convert("RGB")
            x, y = (index % 5) * 192, 160 + (index // 5) * 137
            canvas.paste(image.resize((160, 80), Image.Resampling.LANCZOS), (x + 16, y))
            canvas.paste(image.resize((80, 40), Image.Resampling.LANCZOS), (x + 16, y + 83))
            draw.text((x + 100, y + 93), card_id, fill="white")
        for index, form_id in enumerate(FORM_IDS):
            image = Image.open(ROOT / "forms" / (form_id + ".webp")).convert("RGB")
            x, y = index * 320 + 64, 855
            canvas.paste(image.resize((160, 80), Image.Resampling.LANCZOS), (x, y))
            canvas.paste(image.resize((80, 40), Image.Resampling.LANCZOS), (x, y + 83))
            draw.text((x + 84, y + 93), "form " + form_id, fill="white")
        args.preview.parent.mkdir(parents=True, exist_ok=True)
        canvas.save(args.preview)
    print(json.dumps({"portraits": len(portrait_data), "cards": card_bytes, "forms": form_bytes,
                      "total": len(portrait_data) + card_bytes + form_bytes, "portrait_quality": portrait_quality,
                      "card_quality": card_quality, "form_quality": form_quality,
                      "assets": len(assets), "form_assets": len(forms)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
