#!/usr/bin/env python3
"""Geometry build for Rome Experience.

Stages
  cells   : admin-1 units x AWMC Roman extents (60 BC, AD 117, AD 200) -> atomic cells (cached pickle)
  regions : assign cells to authored region seeds -> data/geo/regions.json (+ mapshaper simplify)
  base    : basemap layers (land, lakes, rivers, ancient water, roads, aqueducts, labels) -> data/geo/*.json

Usage: python3 tools/build_geo.py [cells] [regions] [base]
"""
import json, glob, os, sys, pickle, math, subprocess, collections
from shapely.geometry import shape, mapping, MultiPoint, Point, box
from shapely.ops import unary_union, transform
from shapely import voronoi_polygons, make_valid
from shapely.strtree import STRtree
from pyproj import Transformer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.environ.get('SRC', os.path.join(ROOT, '..', 'srcdata'))
OUT = os.path.join(ROOT, 'data', 'geo')
CACHE = os.path.join(SRC, 'cells.pkl')
BBOX = (-14.0, 7.0, 76.0, 66.0)
os.makedirs(OUT, exist_ok=True)

fwd = Transformer.from_crs('EPSG:4326', '+proj=laea +lat_0=42 +lon_0=25 +datum=WGS84 +units=m', always_xy=True).transform
inv = Transformer.from_crs('+proj=laea +lat_0=42 +lon_0=25 +datum=WGS84 +units=m', 'EPSG:4326', always_xy=True).transform
P = lambda g: transform(fwd, g)
U = lambda g: transform(inv, g)
KM2 = 1e6


def load(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def fix(g):
    if not g.is_valid:
        g = make_valid(g)
    if g.geom_type == 'GeometryCollection':
        g = unary_union([p for p in g.geoms if p.geom_type in ('Polygon', 'MultiPolygon')])
    return g.buffer(0)


def extent(name):
    fs = load(f'{SRC}/awmc/Cultural-Data/political_shading/{name}/{name}.geojson')['features']
    return fix(P(unary_union([fix(shape(f['geometry'])) for f in fs if f['geometry']])))


def build_cells():
    adm = load(f'{SRC}/ne/ne_10m_admin_1_states_provinces.geojson')['features']
    bb = box(*BBOX)
    zones = {'in60bc': extent('roman_empire_bce_60'), 'in117': extent('roman_empire_ce_117_extent'),
             'in200': extent('roman_empire_ce_200_extent')}
    zones = {k: v.buffer(1500).buffer(-1500) for k, v in zones.items()}  # close slivers
    cells = []
    for f in adm:
        p = f['properties']
        g = shape(f['geometry'])
        if not g.intersects(bb):
            continue
        g = fix(g.intersection(bb))
        if g.is_empty:
            continue
        gp = fix(P(g))
        iso = p['iso_a2'] if p['iso_a2'] and len(p['iso_a2']) == 2 else p['adm0_a3']
        pieces = [(gp, {})]
        for zk, zg in zones.items():
            nxt = []
            for geom, flags in pieces:
                if not geom.intersects(zg):
                    nxt.append((geom, {**flags, zk: False}))
                    continue
                a, b = geom.intersection(zg), geom.difference(zg)
                for gg, val in ((a, True), (b, False)):
                    gg = fix(gg)
                    if gg.area > 2 * KM2:
                        nxt.append((gg, {**flags, zk: val}))
            pieces = nxt
        for geom, flags in pieces:
            cells.append({'g': geom, 'iso': iso, 'adm1': p['name'], 'area': geom.area / KM2, **flags})
    print('cells', len(cells))
    with open(CACHE, 'wb') as fh:
        pickle.dump(cells, fh)


def load_regions():
    regs = []
    for path in sorted(glob.glob(os.path.join(ROOT, 'content', 'territory', '**', '*.json'), recursive=True)):
        d = load(path)
        for r in d.get('regions', []):
            r['_file'] = os.path.relpath(path, ROOT)
            regs.append(r)
    seen = set()
    out = []
    for r in regs:
        if r['id'] in seen:
            print('dup region', r['id'])
            continue
        seen.add(r['id'])
        out.append(r)
    return out


def compatible(cell, r):
    if cell['iso'] not in r.get('countries', []):
        return False
    for k, v in (r.get('zone') or {}).items():
        if k in cell and cell[k] != v:
            return False
    return True


def build_regions(simplify='12%'):
    cells = pickle.load(open(CACHE, 'rb'))
    regs = load_regions()
    for r in regs:
        r['_pt'] = Point(fwd(*r['seed']))
    by_iso = collections.defaultdict(list)
    for r in regs:
        for c in r.get('countries', []):
            by_iso[c].append(r)
    parts = collections.defaultdict(list)
    orphans = 0
    for c in cells:
        cand = [r for r in by_iso.get(c['iso'], []) if compatible(c, r)]
        if not cand:
            cand = by_iso.get(c['iso'], [])
        if not cand:
            # nearest seed anywhere within 400 km
            near = sorted(regs, key=lambda r: r['_pt'].distance(c['g'].centroid))[:1]
            if near and near[0]['_pt'].distance(c['g']) < 400e3:
                cand = near
        if not cand:
            orphans += 1
            continue
        if len(cand) == 1:
            parts[cand[0]['id']].append(c['g'])
            continue
        # restrict to the few nearest candidates, then voronoi
        cent = c['g'].centroid
        cand = sorted(cand, key=lambda r: r['_pt'].distance(cent))[:12]
        vor = voronoi_polygons(MultiPoint([r['_pt'] for r in cand]), extend_to=c['g'].envelope.buffer(2e6))
        pieces = []
        for v in vor.geoms:
            owner = next(r for r in cand if v.contains(r['_pt']) or v.distance(r['_pt']) < 1)
            inter = c['g'].intersection(v)
            if not inter.is_empty and inter.area > 0:
                pieces.append((owner, inter))
        if not pieces:
            continue
        pieces.sort(key=lambda x: -x[1].area)
        inside = sum(1 for r in cand if c['g'].contains(r['_pt']))
        if inside < 2 and (c['area'] < 25000 or pieces[0][1].area / c['g'].area > 0.85):
            parts[pieces[0][0]['id']].append(c['g'])
        else:
            for owner, inter in pieces:
                if inter.area / KM2 > 50:
                    parts[owner['id']].append(fix(inter))
                else:
                    parts[pieces[0][0]['id']].append(fix(inter))
    feats = []
    for i, r in enumerate(regs):
        if r['id'] not in parts:
            print('empty region', r['id'], r['_file'])
            continue
        g = fix(unary_union(parts[r['id']]))
        feats.append({'type': 'Feature', 'properties': {'rid': i, 'id': r['id'], 'area': round(g.area / KM2)},
                      'geometry': mapping(U(g))})
    print('regions', len(feats), 'orphan cells', orphans)
    tmp = os.path.join(SRC, 'regions_raw.geojson')
    json.dump({'type': 'FeatureCollection', 'features': feats}, open(tmp, 'w'))
    subprocess.run(['mapshaper', tmp, '-simplify', simplify, 'keep-shapes', 'planar',
                    '-filter-slivers', 'min-area=3km2', '-o', 'precision=0.001', 'format=geojson',
                    os.path.join(OUT, 'regions.json')], check=True)
    # label points (pole of inaccessibility approximation via representative point)
    lab = []
    for f in feats:
        g = shape(f['geometry'])
        big = max(g.geoms, key=lambda x: x.area) if g.geom_type == 'MultiPolygon' else g
        pt = big.representative_point()
        lab.append({'type': 'Feature', 'properties': {'id': f['properties']['id'], 'area': f['properties']['area']},
                    'geometry': {'type': 'Point', 'coordinates': [round(pt.x, 3), round(pt.y, 3)]}})
    json.dump({'type': 'FeatureCollection', 'features': lab}, open(os.path.join(OUT, 'region_labels.json'), 'w'))


def ms(inp, out, *args):
    subprocess.run(['mapshaper', inp, *args, '-o', 'precision=0.001', 'format=geojson', 'geojson-type=FeatureCollection', out], check=True)


def build_base():
    bb = ','.join(map(str, BBOX))
    ne = f'{SRC}/ne'
    aw = f'{SRC}/awmc/Cultural-Data'
    ms(f'{ne}/ne_10m_land.geojson', f'{OUT}/land.json', '-clip', f'bbox={bb}', '-simplify', '14%', 'keep-shapes',
       '-filter-slivers', 'min-area=4km2', '-filter-fields', '')
    ms(f'{ne}/ne_50m_land.geojson', f'{OUT}/land_lo.json', '-clip', f'bbox={bb}', '-simplify', '25%', '-filter-fields', '')
    ms(f'{ne}/ne_10m_lakes.geojson', f'{OUT}/lakes.json', '-clip', f'bbox={bb}', '-filter', 'scalerank<=6',
       '-simplify', '15%', '-filter-fields', 'name,scalerank')
    ms(f'{ne}/ne_10m_rivers_lake_centerlines.geojson', f'{OUT}/rivers.json', '-clip', f'bbox={bb}',
       '-filter', 'scalerank<=8 && featurecla!="Lake Centerline"', '-simplify', '20%', '-filter-fields', 'name,scalerank')
    ms(f'{ne}/ne_10m_geography_marine_polys.geojson', f'{OUT}/marine_raw.json', '-clip', f'bbox={bb}', '-filter-fields', 'name,scalerank,featurecla')
    # AWMC
    ms(f'{aw}/roads/roads.geojson', f'{OUT}/roads.json', '-simplify', '25%',
       '-each', 'major=(Major_or_M=="1"?1:0), known=(Known_or_a=="1"?1:0), tp=timeperiod||timeperi_1||"", name=Name||en_name||""',
       '-filter-fields', 'major,known,tp,name')
    ms(f'{aw}/aqueducts/aqueducts.geojson', f'{OUT}/aqueducts.json', '-simplify', '40%',
       '-each', 'name=Name||en_name||"", tp=(Archaic?"A":"")+(Classical?"C":"")+(Hellenisti?"H":"")+(Roman?"R":"")+(Late_Antiq?"L":"")',
       '-filter-fields', 'name,tp')
    ms(f'{aw}/walls/walls.geojson', f'{OUT}/walls.json', '-filter-fields', 'timeperiod')
    ms(f'{aw}/canals/canals.geojson', f'{OUT}/canals.json', '-filter-fields', 'Name,timeperiod')
    ms(f'{aw}/regional_name_linework/regional_names_linework.geojson', f'{OUT}/labels_regional.json', '-simplify', '30%',
       '-each', 't=TITLE, k=TYPE, a=P_MIN_DATE||0, b=P_MAX_DATE||0', '-filter', '!!t && t!="Untitled"', '-filter-fields', 't,k,a,b')
    ms(f'{SRC}/awmc/Physical Data/inland_water/inland-water-OSM.geojson', f'{OUT}/ancient_water.json',
       '-filter', 'SHAPE_AREA>0.002 && TYPE!="swamp" || SHAPE_AREA>0.02', '-simplify', '20%', '-each', 'k=TYPE, n=TITLE!="Untitled"?TITLE:(EN_NAME||NAME||"")',
       '-filter-fields', 'k,n')
    # marine labels to points
    d = load(f'{OUT}/marine_raw.json')
    pts = []
    for f in d['features']:
        if not f['properties'].get('name'):
            continue
        g = shape(f['geometry'])
        pt = g.representative_point()
        pts.append({'type': 'Feature', 'properties': {'name': f['properties']['name'], 'r': f['properties'].get('scalerank', 5)},
                    'geometry': {'type': 'Point', 'coordinates': [round(pt.x, 3), round(pt.y, 3)]}})
    json.dump({'type': 'FeatureCollection', 'features': pts}, open(f'{OUT}/marine_labels.json', 'w'))
    os.remove(f'{OUT}/marine_raw.json')
    # Roman extents for reference overlays
    for name, out in [('roman_empire_bce_60', 'extent_60bc'), ('roman_empire_ce_117_extent', 'extent_117'),
                      ('roman_empire_ce_200_extent', 'extent_200')]:
        ms(f'{aw}/political_shading/{name}/{name}.geojson', f'{OUT}/{out}.json', '-dissolve', '-simplify', '15%')
    for name, out in [('roman_empire_ce_200_provinces', 'provinces_200_lines'),
                      ('roman_empire_provinces post_diocletian', 'provinces_dioc_lines')]:
        ms(f'{aw}/political_shading/{name}/{name}.geojson', f'{OUT}/{out}.json', '-simplify', '25%', '-filter-fields', '')


if __name__ == '__main__':
    stages = sys.argv[1:] or ['cells', 'regions', 'base']
    if 'cells' in stages:
        build_cells()
    if 'regions' in stages:
        build_regions()
    if 'base' in stages:
        build_base()
    for f in sorted(glob.glob(f'{OUT}/*.json')):
        print(f'{os.path.getsize(f)/1024:8.0f} KB  {os.path.basename(f)}')
