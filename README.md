# wien-infoscreen

A calm, glanceable hallway kiosk for Vienna: live public transit with a
traffic-light "can I still catch it?" system, city bikes, weather, air
quality, personal pollen risk, and a clock that rolls like the one on
your lock screen. One static page, no build step, no frameworks.

*(screenshot coming)*

## What it shows

- **Departures board** (Wiener Linien realtime): one row per line and
  direction, next three departures. The colors answer "what happens if I
  leave right now": amber = leave immediately, green = head out, short
  wait at the stop, neutral = reachable but you'd stand around, red =
  only catchable if you ride a city bike to the stop, dimmed = gone.
  Cooling ❄ per vehicle, ≈ marks schedule-only entries, disruption
  banner from the official feed, and night lines appear automatically
  when they start running (rows exist only while a line has departures).
- **WienMobil Rad**: bikes at your stations; child-seat and e-bike
  counts, amber when almost empty.
- **Weather** (Open-Meteo): current + 12 hours + 12 days as two aligned
  strips, temperatures on a continuous warm/cool color ramp, rain
  probability as a fill bar along each tile's bottom edge, UV badge when
  sunscreen is advised, day/night icons including a composited
  moon-behind-cloud that Unicode forgot to ship.
- **Sun path**: the day's actual solar elevation curve (NOAA arithmetic,
  no API) as a small horizon widget in the weather card — night runs
  flat, dawn and dusk dip below the line in twilight purple-pink-orange,
  the day arcs in gold: tall in summer, low and short in winter. A sun
  dot glides along it (the moon takes over at night, in its current
  phase), with sunrise/sunset times and their day-to-day drift in
  minutes (+1′/−1′) — twilight needs no timestamps when you can see it.
- **Air quality** (Open-Meteo, European AQI): verdict pill plus per-
  pollutant tiles that light up in the band color of whichever pollutant
  is driving a bad index.
- **Pollen** (polleninformation.at): your personal risk headline computed
  from just the allergens you configure, per-allergen chips with
  tomorrow-trend arrows, 3-day outlook, everything else greyed out with
  a small intensity dot.
- **Clock**: StandBy-style rolling digits (spring easing, right-to-left
  cascade), a minute-progress bar instead of ticking seconds — it sweeps
  back at the rollover in sync with the digits and doubles as a health
  light (amber: a data source is failing; red: your Uptime Kuma reports
  a monitor down). Occasion line for weather advice and holidays
  (Austrian, Jewish via proper Hebrew-calendar arithmetic, full/new
  moon). And if the sun is out in Los Angeles, the LA clock will tell
  you it's another day of sun.

## Design principles

- Color highlight = urgency only, never decoration.
- No ink on non-information: nothing renders when it has nothing to say.
- Nothing on screen moves faster than the data (the only animations are
  the minute rollover and the hourly strip advancing by one tile).

## Data sources

| Source | Auth | Notes |
|---|---|---|
| Wiener Linien OGD realtime | none | proxied (no CORS upstream) |
| Open-Meteo forecast + air quality | none | called directly from the browser |
| polleninformation.at | free API key | proxied, key stays server-side |
| nextbike GBFS (WienMobil Rad) | none | called directly |
| Uptime Kuma status page | none | optional, proxied |

## Quick start

```sh
cp site/config.example.js site/config.js   # edit: your stops, coords, allergens
cp compose.example.yaml compose.yaml       # edit: coordinates + pollen API key
docker compose up -d                       # serves on :8080
```

Any static file server works for the page itself; the bundled Caddyfile
additionally provides the two tiny API proxies (Wiener Linien, pollen)
that the browser cannot call directly. Point a TLS-terminating reverse
proxy at the container and a fullscreen browser at the page. Built and
tested on a Raspberry Pi driving a 1920×1080 landscape screen.

## Configuration

Everything personal lives in `site/config.js` (gitignored): coordinates,
stop IDs and walking minutes, bike stations, your allergen list, and the
tuning knobs (bike cutoff, max wait for "green", clock animation style).
See `site/config.example.js` for the documented template.

## License

MIT
