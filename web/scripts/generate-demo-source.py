#!/usr/bin/env python3
"""Refresh authoring snapshots; Astropy is a generation-only dependency.

Run in an isolated environment with astropy==7.2.0, then run generate-demo.mjs.
The application and the offline JSON generator do not import Astropy or fetch data.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import math
from pathlib import Path
import urllib.parse
import urllib.request

import astropy
from astropy import units as u
from astropy.coordinates import SkyCoord, get_constellation
from astropy.utils import iers


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "assets/data/astronomy"
ENDPOINT = "https://exoplanetarchive.ipac.caltech.edu/TAP/sync"
SOURCE_RADIUS_PC = 100
COLUMNS = [
    "pl_name", "hostname", "pl_letter", "pl_controv_flag", "sy_snum", "sy_pnum",
    "cb_flag", "sy_dist", "ra", "dec", "disc_year", "discoverymethod",
    "pl_orbper", "pl_orbperlim", "pl_orbper_reflink", "st_spectype", "st_teff",
    "st_tefflim", "st_teff_reflink", "st_rad", "st_radlim", "st_rad_reflink",
    "st_age", "st_agelim", "st_age_reflink", "sy_dist_reflink", "disc_refname",
]
QUERY = (
    f"select {','.join(COLUMNS)} from pscomppars "
    "where pl_controv_flag=0 and sy_snum=1 and cb_flag=0 "
    "and hostname in (select hostname from pscomppars "
    f"where sy_dist<={SOURCE_RADIUS_PC} and ra is not null and dec is not null) "
    "order by hostname,pl_name"
)


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    retrieved = dt.datetime.now(dt.timezone.utc)
    date = retrieved.date().isoformat()
    url = ENDPOINT + "?" + urllib.parse.urlencode({"query": QUERY, "format": "json"})
    request = urllib.request.Request(url, headers={"User-Agent": "HackUniverse demo catalog authoring"})
    with urllib.request.urlopen(request, timeout=120) as response:
        payload = response.read()
    rows = json.loads(payload)
    if not isinstance(rows, list) or not rows:
        raise ValueError("NASA did not return a nonempty row array")
    if len({row["pl_name"] for row in rows}) != len(rows):
        raise ValueError("The source contains duplicate planet names")
    raw_path = OUTPUT / f"nasa-pscomppars-{date}.json"
    raw_path.write_bytes(payload)

    hosts = {}
    for row in sorted(rows, key=lambda value: (value["hostname"], value["pl_name"])):
        if all(isinstance(row[key], (int, float)) and math.isfinite(row[key]) for key in ("ra", "dec")):
            hosts.setdefault(row["hostname"], row)
    if set(hosts) != {row["hostname"] for row in rows}:
        raise ValueError("A selected host has no usable sky coordinates")
    names = sorted(hosts)
    iers.conf.auto_download = False
    coordinates = SkyCoord(
        ra=[hosts[name]["ra"] for name in names] * u.deg,
        dec=[hosts[name]["dec"] for name in names] * u.deg,
        frame="icrs",
    )
    abbreviations = get_constellation(coordinates, short_name=True)
    full_names = get_constellation(coordinates)
    assignments = {
        name: {
            "abbreviation": str(abbreviation),
            # Astropy 7.2's bundled full-name table spells this Ophiucus;
            # the IAU's official nominative is Ophiuchus.
            "name": "Ophiuchus" if abbreviation == "Oph" else str(full_name),
            "raDeg": hosts[name]["ra"],
            "decDeg": hosts[name]["dec"],
        }
        for name, abbreviation, full_name in zip(names, abbreviations, full_names)
    }
    constellation_path = OUTPUT / f"iau-constellations-{date}.json"
    write_json(constellation_path, {
        "method": "Astropy get_constellation: ICRS coordinates precessed to B1875; Roman 1987 IAU boundaries",
        "astropyVersion": astropy.__version__,
        "source": "https://docs.astropy.org/en/stable/api/astropy.coordinates.get_constellation.html",
        "iauReference": "https://www.iau.org/IAU/Astronomy-FAQs/Constellations.aspx",
        "hosts": assignments,
    })
    manifest = {
        "retrievedAt": retrieved.isoformat(),
        "sourceRadiusPc": SOURCE_RADIUS_PC,
        "table": "pscomppars",
        "endpoint": ENDPOINT,
        "query": QUERY,
        "format": "json",
        "url": url,
        "rawSnapshot": raw_path.name,
        "rawSha256": hashlib.sha256(payload).hexdigest(),
        "constellationSnapshot": constellation_path.name,
        "constellationSha256": hashlib.sha256(constellation_path.read_bytes()).hexdigest(),
        "planetRows": len(rows),
        "hosts": len(hosts),
        "tableDocumentation": "https://exoplanetarchive.ipac.caltech.edu/docs/API_PS_columns.html",
        "compositeCaveats": "https://exoplanetarchive.ipac.caltech.edu/docs/pscp_calc.html",
        "attribution": "NASA Exoplanet Archive, operated by Caltech under contract with NASA's Exoplanet Exploration Program; individual parameter references are retained in the raw snapshot.",
        "attributionGuidance": "https://exoplanetarchive.ipac.caltech.edu/docs/acknowledge.html",
    }
    write_json(OUTPUT / "source-manifest.json", manifest)
    print(json.dumps({"rawSnapshot": raw_path.name, "planetRows": len(rows), "hosts": len(hosts), "constellations": len(set(abbreviations))}))


if __name__ == "__main__":
    main()
