#!/usr/bin/env bash
# Downloads the open geodata the build uses into ../srcdata (outside the repo).
# Natural Earth (public domain) and the Ancient World Mapping Center geodata (ODbL).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${SRC:-$ROOT/../srcdata}"
mkdir -p "$SRC/ne"
NE=https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson
for f in ne_10m_admin_1_states_provinces ne_10m_land ne_10m_rivers_lake_centerlines ne_10m_rivers_europe ne_10m_lakes ne_10m_lakes_europe ne_10m_geography_marine_polys ne_10m_geography_regions_points ne_50m_land ne_10m_minor_islands; do
  [ -f "$SRC/ne/$f.geojson" ] || curl -sSfL -o "$SRC/ne/$f.geojson" "$NE/$f.geojson"
done
if [ ! -d "$SRC/awmc" ]; then
  git clone --depth 1 --filter=blob:none --no-checkout https://github.com/AWMC/geodata "$SRC/awmc"
  git -C "$SRC/awmc" sparse-checkout init --no-cone
  git -C "$SRC/awmc" sparse-checkout set '/Cultural-Data/**/*.geojson' '/Physical Data/inland_water/*.geojson' '/LICENSE.txt'
  git -C "$SRC/awmc" checkout
fi
echo "sources in $SRC"
