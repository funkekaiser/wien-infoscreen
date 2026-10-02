"use strict";

/* Copy this file to config.js and adjust everything to your location.
   Stop IDs are Wiener Linien RBL numbers; find yours in the OGD data:
   https://www.wienerlinien.at/ogd_realtime/doku/ogd/wienerlinien-ogd-haltepunkte.csv
   The example uses stops around Stephansplatz. */

const CONFIG = {
  // Your coordinates (weather, air quality; pollen uses the server-side
  // proxy, see Caddyfile + INFOSCREEN_LAT/LON environment variables)
  lat: 48.2083,
  lon: 16.3731,

  // Stops to watch: RBL id + walking minutes from your door.
  // Order here = display order. Rows only render while a line has
  // departures, so night-only stops simply appear at night.
  stops: [
    { id: 4111, walk: 4 },  // U1 Stephansplatz
    { id: 4118, walk: 4 },  // U1 Stephansplatz (other direction)
    { id: 4906, walk: 5 },  // U3 Stephansplatz
    { id: 4911, walk: 5 },  // U3 Stephansplatz (other direction)
    { id: 5505, walk: 7 },  // trams @ Schwedenplatz
    { id: 5506, walk: 7 },
  ],

  // WienMobil Rad (nextbike) stations, nearest first
  bikeStations: [
    { id: "68579304", name: "Stephansplatz U" },
    { id: "68577989", name: "Hoher Markt" },
  ],

  // Allergens that matter to you (lowercase substring of the German name
  // from polleninformation.at). Empty list = show everything in color.
  myAllergens: [],

  wlRefreshMs: 30 * 1000,        // WL asks for >= 15 s between requests
  bikeRefreshMs: 2 * 60 * 1000,  // GBFS feed TTL is 60 s

  // Earliest departure still catchable by grabbing a city bike:
  // roughly half the walking time works well for 5-8 minute walks.
  // Also receives the stop entry, so you can rule the bike tier out where
  // it makes no sense — e.g. in Vienna a bike may ride the U-Bahn but not
  // a tram or bus. Return `walk` to collapse the tier for that stop:
  //   bikeCutoff: (walk, stop) => (stop.bike ? Math.round(walk / 2) : walk),
  bikeCutoff: (walk) => Math.round(walk / 2),

  // Green means "head out now": max minutes you'd wait AT the stop.
  // Longer waits render neutral, no action needed yet.
  maxWaitMin: 5,

  weatherRefreshMs: 10 * 60 * 1000,
  aqiRefreshMs: 15 * 60 * 1000,
  pollenRefreshMs: 3 * 60 * 60 * 1000,
  staleAfterMs: 90 * 1000,       // warn badge when departures data is older
  reloadHour: 4,                 // daily page reload (kiosk hygiene)

  // "dark": the default. "mirror": for a screen behind two-way mirror
  // foil. Pure black everywhere except the information, which is pushed
  // to full brightness. Try it first with ?theme=mirror in the URL.
  theme: "dark",

  // "roll": StandBy-style odometer. "phase": in-place diagonal crossfade.
  clockStyle: "roll",

  // Uptime Kuma status-page integration (minute bar turns red when a
  // monitor is down). Needs the /api/kuma proxy in the Caddyfile.
  kumaEnabled: false,
};
