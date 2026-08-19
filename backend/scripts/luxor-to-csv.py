#!/usr/bin/env python3
"""Turn the Luxor wholesale price list into a catalogue import CSV.

The spreadsheet is a supplier price list, so its figures are what Booklab PAYS.
Per the product owner (2026-08-19) the buying price is the **price per packet,
excluding VAT** - the "Price per pkt EXCL of VAT" column.

Selling prices are deliberately left blank: the sheet contains none, and the
markup is still to be confirmed. The importer treats a blank cell as "leave
alone", so prices can be filled in later without disturbing anything else.

Usage:
    python luxor-to-csv.py "<xlsx>" <out.csv>
"""
import csv
import re
import sys
import zipfile
from xml.etree import ElementTree as ET

M = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'

# Existing catalogue entries that already cover a line in this sheet. They keep
# their own SKU and their own selling prices; only the cost is refreshed.
ALREADY_IN_CATALOGUE = {
    ('18101F/20 BOX', 'Black'): 'ST02702',   # Inkglide 0.7mm Black, 20 pack
    ('18102/25 BOX', 'Blue'): 'ST02089',     # Inkglide 1.0mm Blue, 25 pack
    ('1222C', None): 'ST01891',              # Refillable Permanent Marker Chisel
    ('1223C', None): 'ST01887',              # Refillable Whiteboard Marker Chisel
    ('423', 'Orange'): 'ST01119',            # Eco Textliter Orange, dozen
}

COLOUR_ABBR = {'black': 'BLK', 'blue': 'BLU', 'red': 'RED', 'green': 'GRN',
               'yellow': 'YEL', 'orange': 'ORG', 'pink': 'PNK', 'purple': 'PPL',
               'violet': 'VLT', 'assorted': 'AST'}


def read_rows(path):
    z = zipfile.ZipFile(path)
    shared = []
    root = ET.fromstring(z.read('xl/sharedStrings.xml'))
    for si in root.findall('{%s}si' % M):
        shared.append(''.join(t.text or '' for t in si.iter('{%s}t' % M)))

    def colnum(ref):
        n = 0
        for ch in re.match(r'[A-Z]+', ref).group():
            n = n * 26 + (ord(ch) - 64)
        return n - 1

    out = []
    sheet = ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
    for row in sheet.iter('{%s}row' % M):
        cells = {}
        for c in row.findall('{%s}c' % M):
            ref = c.get('r')
            v = c.find('{%s}v' % M)
            if not ref or v is None:
                continue
            cells[colnum(ref)] = (shared[int(v.text)] if c.get('t') == 's' else v.text or '').strip()
        if 2 in cells and 3 in cells and re.search(r'\d', str(cells.get(1, ''))):
            out.append({
                'row': row.get('r'),
                'code': cells.get(2, ''),
                'name': cells.get(3, ''),
                'colour': cells.get(4, ''),
                'packing': cells.get(5, ''),
                'pkt_excl': cells.get(9 - 1, ''),   # I column: price per pkt EXCL VAT
            })
    return out


def clean_name(name):
    # "Permanet" is a typo in the source; the catalogue already spells it correctly.
    name = name.replace('Permanet', 'Permanent')
    return re.sub(r'\s+', ' ', name).strip(' -')


def pack_label(packing):
    p = packing.strip()
    m = re.match(r'^(\d+)\s*pcs?$', p, re.I)
    if m:
        return 'packet of %s' % m.group(1)
    if re.match(r'^wallet of \d+$', p, re.I):
        return p.lower()
    return p.lower()


def make_sku(code, colour):
    c = re.sub(r'[^A-Za-z0-9]+', '', code).upper()
    return 'LUX-%s-%s' % (c, COLOUR_ABBR.get(colour.lower(), (colour[:3] or 'STD').upper()))


def main():
    src, dest = sys.argv[1], sys.argv[2]
    rows = read_rows(src)

    seen = set()
    new_items, existing_updates, skipped = [], [], []

    for r in rows:
        key = (r['code'], r['colour'], r['name'].strip().lower(), r['packing'])
        if key in seen:
            skipped.append(r)
            continue
        seen.add(key)

        try:
            cost = round(float(r['pkt_excl']), 2)
        except (TypeError, ValueError):
            skipped.append(r)
            continue

        sku = (ALREADY_IN_CATALOGUE.get((r['code'], r['colour']))
               or ALREADY_IN_CATALOGUE.get((r['code'], None)))
        if sku:
            if not any(u['sku'] == sku for u in existing_updates):
                existing_updates.append({'sku': sku, 'cost': cost, 'from': r})
            continue

        title = '%s - %s (%s)' % (clean_name(r['name']), r['colour'], pack_label(r['packing']))
        new_items.append({
            'Item name': title,
            'SKU': make_sku(r['code'], r['colour']),
            'Category': 'Stationery',
            'Buying price': '%.2f' % cost,
            'Retail': '',
            'Wholesale': '',
            'School': '',
        })

    by_sku = {}
    for it in new_items:
        by_sku.setdefault(it['SKU'], []).append(it)
    clashes = {k: v for k, v in by_sku.items() if len(v) > 1}

    # The sheet reuses item codes 701-704 for two different products, so a plain
    # code+colour SKU would collide and the second row would overwrite the first.
    # Disambiguate with the model number out of the name rather than dropping a
    # row or silently picking a winner.
    for sku, group in clashes.items():
        for it in group:
            nums = re.findall(r'\b(\d{2,3})\b', it['Item name'])
            suffix = nums[0] if nums else str(group.index(it) + 1)
            it['SKU'] = '%s-%s' % (sku, suffix)

    with open(dest, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=['Item name', 'SKU', 'Category',
                                          'Buying price', 'Retail', 'Wholesale', 'School'])
        w.writeheader()
        for it in new_items:
            w.writerow(it)

    still = {}
    for it in new_items:
        still.setdefault(it['SKU'], []).append(it)
    unresolved = {k: v for k, v in still.items() if len(v) > 1}

    print('source rows                : %d' % len(rows))
    print('duplicate rows skipped     : %d' % len(skipped))
    print('already in catalogue       : %d  (cost refresh only)' % len(existing_updates))
    for u in existing_updates:
        print('    %-9s %-46s -> %8.2f' % (u['sku'], clean_name(u['from']['name'])[:46], u['cost']))
    print('new products written       : %d  -> %s' % (len(new_items), dest))
    if clashes:
        print('\nCHECK THESE - the sheet gives one item code to two products:')
        for k, v in clashes.items():
            for it in v:
                print('   %-16s %s' % (it['SKU'], it['Item name']))
    if unresolved:
        print('\n!! STILL CLASHING - do not import until resolved:')
        for k in unresolved:
            print('   %s' % k)


if __name__ == '__main__':
    main()
