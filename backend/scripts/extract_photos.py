#!/usr/bin/env python3
"""
Extrait les photos du PDF et les associe aux joueurs en base (ordre alphabétique).
"""

import fitz
import os
import unicodedata
import subprocess
import json

PDF_PATH = "/Users/romaricnagel/Downloads/43213134d.pdf"
OUT_DIR = "/Users/romaricnagel/scr-social-manager/backend/uploads/joueurs"

def normalize(s):
    """Normalise une chaîne : minuscules, sans accents, espaces/tirets → underscore."""
    nfkd = unicodedata.normalize('NFD', s)
    ascii_str = nfkd.encode('ascii', 'ignore').decode('ascii')
    return ascii_str.lower().replace(' ', '_').replace('-', '_').replace("'", '_')

# ── 1. Récupérer les joueurs depuis la DB (ordre alphabétique) ──────────────
result = subprocess.run(
    ['psql', 'scr_social_manager', '-t', '-A', '-F', '\t', '-c',
     'SELECT id, nom, prenom FROM joueurs ORDER BY nom ASC, prenom ASC'],
    capture_output=True, text=True
)
if result.returncode != 0:
    print("Erreur psql:", result.stderr)
    exit(1)

joueurs = []
for line in result.stdout.strip().split('\n'):
    if line:
        parts = line.split('\t')
        if len(parts) == 3:
            joueurs.append({'id': int(parts[0]), 'nom': parts[1], 'prenom': parts[2]})

print(f"✅ {len(joueurs)} joueurs récupérés depuis la DB")
for j in joueurs[:5]:
    print(f"   {j['id']:3} | {j['nom']} {j['prenom']}")
print("   ...")

# ── 2. Extraire les images du PDF dans l'ordre d'apparition ─────────────────
doc = fitz.open(PDF_PATH)
images = []
seen_xrefs = set()

for page_num, page in enumerate(doc):
    page_imgs = page.get_images(full=True)
    print(f"   Page {page_num + 1}: {len(page_imgs)} image(s)")
    for img in page_imgs:
        xref = img[0]
        if xref in seen_xrefs:
            continue
        seen_xrefs.add(xref)
        base_image = doc.extract_image(xref)
        images.append({
            'data': base_image['image'],
            'ext': base_image['ext'],
            'width': base_image['width'],
            'height': base_image['height'],
        })

print(f"\n✅ {len(images)} images extraites du PDF")

# ── 3. Vérification ──────────────────────────────────────────────────────────
if len(images) != len(joueurs):
    print(f"⚠️  ATTENTION : {len(images)} images ≠ {len(joueurs)} joueurs")
    print("Continuer quand même ? (o/n)")
    if input().strip().lower() != 'o':
        exit(1)

# ── 4. Sauvegarder + mettre à jour la DB ─────────────────────────────────────
os.makedirs(OUT_DIR, exist_ok=True)
updates = []

for i, joueur in enumerate(joueurs):
    img = images[i]
    filename = f"{normalize(joueur['nom'])}_{normalize(joueur['prenom'])}.jpg"
    filepath = os.path.join(OUT_DIR, filename)

    with open(filepath, 'wb') as f:
        f.write(img['data'])

    photo_url = f"/uploads/joueurs/{filename}"
    updates.append((photo_url, joueur['id']))
    print(f"   [{i+1:2}] {joueur['nom']} {joueur['prenom']} → {filename} ({img['width']}x{img['height']})")

# ── 5. Mettre à jour la DB via psql ──────────────────────────────────────────
sql_parts = []
for photo_url, jid in updates:
    sql_parts.append(f"UPDATE joueurs SET photo='{photo_url}' WHERE id={jid};")

sql = '\n'.join(sql_parts)
result = subprocess.run(
    ['psql', 'scr_social_manager', '-c', sql],
    capture_output=True, text=True
)
if result.returncode != 0:
    print("Erreur psql UPDATE:", result.stderr)
    exit(1)

print(f"\n✅ {len(updates)} joueurs mis à jour en base avec leur photo")
print("   Dossier : " + OUT_DIR)
