"""Descarga las fotografías oficiales de referencia del catálogo femenino."""
import json
from pathlib import Path
from urllib.parse import urlparse

import requests
from lxml import html

root = Path(__file__).resolve().parents[1]
manifest_path = root / 'catalog-assets/women/catalog.json'
items = json.loads(manifest_path.read_text(encoding='utf-8'))
session = requests.Session()
session.headers.update({'User-Agent': 'Mozilla/5.0 (compatible; Grupo18AcademicCatalog/1.0)'})
pages = {}

for item in items:
    if 'imageAlt' in item:
        url = item['sourcePage']
        if url not in pages:
            response = session.get(url, timeout=30)
            response.raise_for_status()
            pages[url] = html.fromstring(response.content)
        matches = [
            image for image in pages[url].xpath('//img')
            if item['imageAlt'].lower() in (image.get('alt') or '').lower()
        ]
        if not matches:
            raise RuntimeError(f"No se encontró imagen oficial para {item['code']}")
        selected = matches[0]
        item['imageUrl'] = selected.get('src')
        if 'images.puma.com' in item['imageUrl']:
            item['imageUrl'] = item['imageUrl'].replace('w_300,h_300', 'w_600,h_600')
    image_response = session.get(item['imageUrl'], timeout=30)
    image_response.raise_for_status()
    content_type = image_response.headers.get('content-type', '').split(';')[0]
    extension = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp'}.get(content_type)
    if not extension or len(image_response.content) < 5000:
        raise RuntimeError(f"Imagen inválida para {item['code']}: {content_type}")
    name = f"{item['code'].lower()}.{extension}"
    (manifest_path.parent / name).write_bytes(image_response.content)
    item['imageFile'] = name
    print(f"{item['code']}: {name} ({len(image_response.content)} bytes)")

manifest_path.write_text(json.dumps(items, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
