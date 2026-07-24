"use strict";

/* ── Config ──────────────────────────────────────────────────── */

// CONFIG comes from config.js (see config.example.js)

const $ = (id) => document.getElementById(id);

// Odometer roll for the clock: only the digits that change roll over —
// the old glyph slides up and out while the new one rises into place.
function setClockDigits(str) {
  const clock = $("clock");
  if (clock.children.length !== str.length) {
    clock.textContent = "";
    for (const ch of str) {
      const slot = document.createElement("span");
      slot.className = ch === ":" ? "digit colon" : "digit";
      slot.textContent = ch;
      clock.appendChild(slot);
    }
    return;
  }
  const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";
  // stagger ranks: rightmost changed digit phases first
  const changed = [...str].map((ch, i) => ({ ch, i }))
    .filter(({ ch, i }) => clock.children[i].textContent !== ch && !clock.children[i]._busy);
  changed.forEach(({ ch, i }, k) => {
    const slot = clock.children[i];
    slot._busy = true;
    const old = document.createElement("span");
    old.className = "roll";
    old.textContent = slot.textContent;
    const neu = document.createElement("span");
    neu.className = "roll";
    neu.textContent = ch;
    slot.textContent = "";
    slot.append(old, neu);
    const finish = () => { slot.textContent = ch; slot._busy = false; };
    if (CONFIG.clockStyle === "roll") {
      // StandBy odometer: both glyphs travel up through the window.
      // Spring curve (overshoot past rest, settle back) gives the roll
      // its physicality; multi-digit changes cascade right-to-left.
      const SPRING = "cubic-bezier(0.34, 1.3, 0.64, 1)";
      const delay = (changed.length - 1 - k) * 40;
      neu.style.opacity = "0";
      old.animate(
        [{ transform: "translateY(0)", opacity: 1 }, { transform: "translateY(-100%)", opacity: 0 }],
        { duration: 600, delay, easing: EASE, fill: "forwards" });
      neu.animate(
        [{ transform: "translateY(100%)", opacity: 0 }, { transform: "translateY(0)", opacity: 1 }],
        { duration: 600, delay, easing: SPRING, fill: "forwards" }).onfinish = finish;
    } else {
      // page-phase: crossfade in place with a soft diagonal drift,
      // right-to-left stagger when several digits change at once
      const delay = (changed.length - 1 - k) * 90;
      neu.style.opacity = "0";
      old.animate(
        [{ transform: "translate(0,0)", opacity: 1 }, { transform: "translate(-7%,-9%)", opacity: 0 }],
        { duration: 520, delay, easing: EASE, fill: "forwards" });
      neu.animate(
        [{ transform: "translate(7%,9%)", opacity: 0 }, { transform: "translate(0,0)", opacity: 1 }],
        { duration: 520, delay, easing: EASE, fill: "forwards" }).onfinish = finish;
    }
  });
}

// Strip update that SLIDES one tile left when the window advanced by one
// (hour rollover / midnight), instead of snapping to the new content.
function setStrip(el, html, firstKey, secondKey) {
  const shifted = el.dataset.second === firstKey && el.children.length > 1;
  if (shifted) {
    const step = el.children[1].getBoundingClientRect().x -
      el.children[0].getBoundingClientRect().x;
    el.style.transition = "transform 0.7s ease";
    el.style.transform = "translateX(-" + step + "px)";
    setTimeout(() => {
      el.style.transition = "none";
      el.style.transform = "";
      el.innerHTML = html;
      if (el.lastElementChild) {
        el.lastElementChild.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 450 });
      }
    }, 720);
  } else if (el.innerHTML !== html) {
    el.innerHTML = html;
  }
  el.dataset.first = firstKey;
  el.dataset.second = secondKey;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/* ── Clock ───────────────────────────────────────────────────── */

const fmtDate = new Intl.DateTimeFormat("de-AT", {
  weekday: "long", day: "numeric", month: "long",
});
const fmtLA = new Intl.DateTimeFormat("de-AT", {
  hour: "2-digit", minute: "2-digit", timeZone: "America/Los_Angeles",
});

let lastReloadCheck = "";
let lastGreetKey = "";
let WX = null;   // today's weather context, set by renderWeather

/* ── Greeting: one muted line of warmth, context-picked, hourly ── */

// Occasions only — the line exists when it has something to say
// (weather advice, holidays); otherwise it stays empty. Informative,
// emoji-tagged, not jokey.

function easterSunday(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  return new Date(y, Math.floor((h + l - 7 * m + 114) / 31) - 1,
    ((h + l - 7 * m + 114) % 31) + 1);
}

/* Hebrew calendar (Dershowitz-Reingold molad arithmetic) — deterministic
   math, verified against 14 known Pesach + 3 Hanukkah dates. Local
   computation over an API: calendars don't change, networks fail. */
function hebElapsedDays(h) {
  const months = 235 * Math.floor((h - 1) / 19) + 12 * ((h - 1) % 19) +
    Math.floor((7 * ((h - 1) % 19) + 1) / 19);
  const parts = 204 + 793 * (months % 1080);
  const hours = 5 + 12 * months + 793 * Math.floor(months / 1080) + Math.floor(parts / 1080);
  let day = 1 + 29 * months + Math.floor(hours / 24);
  const p = 1080 * (hours % 24) + (parts % 1080);
  const leap = (y) => (7 * y + 1) % 19 < 7;
  if (p >= 19440 ||
      (day % 7 === 2 && p >= 9924 && !leap(h)) ||
      (day % 7 === 1 && p >= 16789 && leap(h - 1))) day += 1;
  if ([0, 3, 5].includes(day % 7)) day += 1;
  return day;
}
// anchor: Rosh Hashanah 5787 = 2026-09-12
const HEB_EPOCH_MS = Date.UTC(2026, 8, 12) - hebElapsedDays(5787) * 864e5;
const roshHashanah = (h) => new Date(HEB_EPOCH_MS + hebElapsedDays(h) * 864e5);
const hebYearLen = (h) => Math.round((roshHashanah(h + 1) - roshHashanah(h)) / 864e5);

function jewishHolidayLines(now) {
  const ymd = (d) => d.getUTCFullYear() * 1e4 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  const today = now.getFullYear() * 1e4 + (now.getMonth() + 1) * 100 + now.getDate();
  const gy = now.getFullYear();
  const out = [];
  const add = (dateUTC, offsetDays, label) => {
    if (ymd(new Date(dateUTC.getTime() + offsetDays * 864e5)) === today) out.push(label);
  };
  // spring set hangs off Pesach (15 Nisan) of Hebrew year gy+3760
  const hSpring = gy + 3760;
  const rhS = roshHashanah(hSpring);
  const ylenS = hebYearLen(hSpring);
  const leapS = (7 * hSpring + 1) % 19 < 7;
  const pesach = new Date(rhS.getTime() +
    (30 + (ylenS % 10 === 5 ? 30 : 29) + ([353, 383].includes(ylenS) ? 29 : 30) +
     29 + 30 + (leapS ? 59 : 29) + 14) * 864e5);
  add(pesach, -30, "Purim 🎭");
  add(pesach, 0, "Pessach 🍷");
  add(pesach, 50, "Schawuot ✡️");
  // fall set hangs off Rosh Hashanah of Hebrew year gy+3761
  const hFall = gy + 3761;
  const rhF = roshHashanah(hFall);
  add(rhF, 0, "Rosch haSchana 🍎🍯");
  add(rhF, 1, "Rosch haSchana 🍎🍯");
  add(rhF, 9, "Jom Kippur ✡️");
  add(rhF, 14, "Sukkot 🌿");
  // Chanukka: 25 Kislev, 8 days — can spill into January of the NEXT year
  for (const h of [gy + 3760, gy + 3761]) {
    const rh = roshHashanah(h);
    const cheshvan = [355, 385].includes(hebYearLen(h)) ? 30 : 29;
    for (let i = 0; i < 8; i++) add(rh, 54 + cheshvan + i, "Chanukka 🕎");
  }
  return out;
}

/* Moon: synodic arithmetic (29.530589 d from the 2000-01-06 18:14 UTC
   new moon) — within hours for decades, no API needed. */
const SYNODIC = 29.53058867;
function moonAge(d) {
  const age = ((d - Date.UTC(2000, 0, 6, 18, 14)) / 864e5) % SYNODIC;
  return age < 0 ? age + SYNODIC : age;
}
const MOON_PHASES = ["🌑", "🌒", "🌓", "🌔", "🌕", "🌖", "🌗", "🌘"];
function moonPhaseEmoji(d) {
  return MOON_PHASES[Math.round(moonAge(d) / SYNODIC * 8) % 8];
}
function moonLines(now) {
  const age = moonAge(now);
  if (Math.abs(age - SYNODIC / 2) < 0.5) return ["Vollmond 🌕"];
  if (age < 0.5 || age > SYNODIC - 0.5) return ["Neumond 🌑"];
  return [];
}

function holidayLines(now) {
  const md = (now.getMonth() + 1) * 100 + now.getDate();
  const fixed = {
    101: "Neujahr 🎆", 106: "Heilige Drei Könige 👑", 214: "Valentinstag 🌹",
    501: "Staatsfeiertag 🇦🇹", 815: "Mariä Himmelfahrt",
    1026: "Nationalfeiertag 🇦🇹", 1031: "Halloween 🎃", 1101: "Allerheiligen 🕯️",
    1208: "Mariä Empfängnis", 1224: "Frohe Weihnachten! 🎄",
    1225: "Frohe Weihnachten! 🎄", 1226: "Stefanitag 🎄",
    1231: "Guten Rutsch! 🎇",
  };
  const out = fixed[md] ? [fixed[md]] : [];
  const easter = easterSunday(now.getFullYear());
  const dayDiff = Math.round((now - new Date(easter.getFullYear(), easter.getMonth(), easter.getDate())) / 864e5);
  const movable = {
    "-2": "Karfreitag", 0: "Frohe Ostern! 🐣", 1: "Ostermontag 🐣",
    39: "Christi Himmelfahrt", 49: "Pfingsten", 50: "Pfingstmontag",
    60: "Fronleichnam",
  };
  if (movable[dayDiff]) out.push(movable[dayDiff]);
  return out.concat(jewishHolidayLines(now), moonLines(now));
}

function weatherLines(now) {
  const out = [];
  if (!WX) return out;
  if (WX.rainSoon >= 50) out.push("Schirm einpacken ☔");
  if (WX.uvAhead >= 3) {
    if (WX.uv >= 6) out.push("UV " + Math.round(WX.uv) + " heute, Sonnencreme! 🧴");
    else if (now.getHours() < 12) out.push("Sonnencreme nicht vergessen 🧴");
  }
  if (WX.tMax >= 34) out.push("Bis " + Math.round(WX.tMax) + "° heute, viel trinken! 🥵");
  else if (WX.tMax >= 30) out.push("Heiß heute: bis " + Math.round(WX.tMax) + "° 🌡️");
  if (WX.tMax <= 3) out.push("Kalt heute, warm anziehen! 🧣");
  if (WX.tMaxTomorrow - WX.tMax <= -8)
    out.push("Morgen deutlich kühler: " + Math.round(WX.tMaxTomorrow) + "° 🌡️");
  else if (WX.tMaxTomorrow - WX.tMax >= 8)
    out.push("Morgen noch heißer: " + Math.round(WX.tMaxTomorrow) + "° 🌡️");
  return out;
}

function hash32(x) {
  x = Math.imul(x ^ (x >>> 16), 2246822507);
  x = Math.imul(x ^ (x >>> 13), 3266489909);
  return (x ^ (x >>> 16)) >>> 0;
}

function updateGreeting(now) {
  const h = now.getHours();
  const key = now.toDateString() + h + (WX ? "w" : "");
  if (key === lastGreetKey) return;
  lastGreetKey = key;
  const lines = holidayLines(now).concat(weatherLines(now));
  const seed = now.getFullYear() * 1e6 + (now.getMonth() + 1) * 1e4 + now.getDate() * 100 + h;
  $("greet").textContent = lines.length ? lines[hash32(seed) % lines.length] : "";
}

function tick() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  setClockDigits(hh + ":" + mm);
  // seconds as a gliding bar: animate toward the NEXT second so the
  // motion is continuous; on rollover it sweeps back to zero with the
  // same easing as the digit roll happening at that moment
  const bar = $("min-bar");
  const s = now.getSeconds();
  if (s === 0) {
    // the 0.65s sweep-back lands exactly where real time is when it ends:
    // at the 0.65-second mark — which doubles as the never-vanishing stub
    bar.style.transition = "width 0.65s cubic-bezier(0.2, 0.8, 0.2, 1)";
    bar.style.width = ((0.65 / 60) * 100).toFixed(2) + "%";
  } else {
    bar.style.transition = "width 1s linear";
    bar.style.width = (((s + 1) / 60) * 100).toFixed(1) + "%";
  }
  // plain info updates — the main clock is the only element that performs
  $("date").textContent = fmtDate.format(now);
  $("wc-la").textContent = fmtLA.format(now);
  updateGreeting(now);
  renderSunPath(now);

  // Daily reload at CONFIG.reloadHour:00 (guard so it fires once per minute-window)
  const stamp = now.toDateString() + now.getHours();
  if (now.getHours() === CONFIG.reloadHour && now.getMinutes() === 0 && lastReloadCheck !== stamp) {
    lastReloadCheck = stamp;
    location.reload();
  }

  updateStaleBadge(now);
}

/* ── Self-diagnosis: the minute bar is the health indicator ─────
   red = Uptime Kuma reports a monitor down; amber = this page's own
   data fetches are failing or a JS error fired. */

const HEALTH = {};
let kumaDown = false;

function markHealth(name, ok) {
  HEALTH[name] = ok;
  const bar = $("min-bar");
  const anyFail = Object.values(HEALTH).some((v) => v === false);
  bar.classList.toggle("down", kumaDown);
  bar.classList.toggle("warn", !kumaDown && anyFail);
}

window.addEventListener("error", () => markHealth("js", false));

/* ── Wiener Linien departures ────────────────────────────────── */

let wlLastOk = 0;

const BADGE_CLASS = { ptMetro: "metro", ptTram: "tram", ptBusCity: "bus", ptBusNight: "bus" };

function countdownOf(dep, now) {
  const t = dep.departureTime || {};
  if (typeof t.countdown === "number") return t.countdown;
  const iso = t.timeReal || t.timePlanned;
  if (!iso) return null;
  return Math.round((new Date(iso).getTime() - now) / 60000);
}

async function fetchWL() {
  try {
    const qs = CONFIG.stops.map((s) => "stopId=" + s.id).join("&") +
      "&activateTrafficInfo=stoerunglang&activateTrafficInfo=stoerungkurz" +
      "&activateTrafficInfo=aufzugsinfo";
    const res = await fetch("/api/wl/monitor?" + qs, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    renderWL(data.data.monitors || []);
    renderAlerts(data.data.trafficInfos || []);
    wlLastOk = Date.now();
    markHealth("wl", true);
  } catch (err) {
    console.warn("WL fetch failed:", err);
    markHealth("wl", false);
  }
}

function renderWL(monitors) {
  const now = Date.now();
  // Collect departures per (line, destination) — NOT per stop: late
  // evenings WL sometimes lists one direction's departures on BOTH
  // platform monitors of the same station, which rendered as duplicate
  // rows. Same line+destination means the same ride, so pool them.
  const byKey = new Map();

  for (const mon of monitors) {
    const props = mon.locationStop && mon.locationStop.properties;
    const rbl = props && props.attributes && props.attributes.rbl;
    const cfg = CONFIG.stops.find((s) => s.id === rbl);
    if (!cfg) continue;
    for (const line of mon.lines || []) {
      const towards = (line.towards || "").trim();
      const key = line.name + "|" + towards.toLowerCase();
      let row = byKey.get(key);
      if (!row) {
        row = {
          order: CONFIG.stops.indexOf(cfg),
          walk: cfg.walk,
          cutoff: CONFIG.bikeCutoff(cfg.walk),
          name: line.name,
          towards,
          type: line.type,
          all: [],
        };
        byKey.set(key, row);
      }
      for (const d of (line.departures && line.departures.departure) || []) {
        const c = countdownOf(d, now);
        if (c === null || c < 0) continue;
        row.all.push({
          c,
          cool: !!(d.vehicle && d.vehicle.cooling),
          sched: !(d.departureTime && d.departureTime.timeReal),  // planned, no realtime
        });
      }
    }
  }

  // Lines without any departure vanish (day lines at night, night buses
  // during the day) — the transition period simply shows both.
  const rows = [...byKey.values()].filter((r) => r.all.length > 0);
  for (const r of rows) {
    // realtime first within the same minute, so deduping keeps it
    r.all.sort((a, b) => a.c - b.c || a.sched - b.sched);
    // merged groups can list the same trip twice — drop same-minute repeats
    r.all = r.all.filter((d, i) => i === 0 || d.c !== r.all[i - 1].c);
    // Three tiers: red = too late on foot but catchable by bike
    // (≥ the stop's bike cutoff), green/amber = first one reachable on
    // foot, plain = later ones. At most two red so a foot-reachable
    // departure stays visible; raw dimmed list as fallback.
    const byBike = r.all.filter((d) => d.c >= r.cutoff && d.c < r.walk);
    const onFoot = r.all.filter((d) => d.c >= r.walk);
    r.deps = byBike
      .slice(0, onFoot.length ? 2 : 3)
      .concat(onFoot)
      .slice(0, 3);
    if (r.deps.length === 0) r.deps = r.all.slice(0, 3);
  }

  rows.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

  let html = "";
  for (const r of rows) {
    const badge = BADGE_CLASS[r.type] || "bus";
    let cells = "";
    if (r.deps.length === 0) {
      cells = '<div class="t-none">keine Abfahrt</div>';
    } else {
      let nextMarked = false;
      for (const d of r.deps) {
        const c = d.c;
        let cls = "t-min";
        if (c < r.cutoff) {
          cls += " missed";                    // gone, even by bike
        } else if (c < r.walk) {
          cls += " bike";                      // only catchable by bike
        } else if (!nextMarked) {
          nextMarked = true;
          const wait = c - r.walk;      // minutes standing at the stop
          if (wait <= 1) cls += " next tight";
          else if (wait <= CONFIG.maxWaitMin) cls += " next";
          // longer wait: neutral — leaving now would just mean waiting there
        }
        cells += '<div class="' + cls + '">' + c + "′" +
          (d.cool ? '<span class="t-cool">❄</span>' : "") +
          (d.sched ? '<span class="t-sched">≈</span>' : "") + "</div>";
      }
      for (let i = r.deps.length; i < 3; i++) cells += '<div class="t-min empty">–</div>';
    }
    // walk time is not displayed — it drives the traffic-light tiers,
    // which already say everything the number would
    html +=
      '<div class="t-row">' +
      '<span class="badge ' + badge + '">' + esc(r.name) + "</span>" +
      '<span class="t-dest">' + esc(r.towards) + "</span>" +
      cells +
      "</div>";
  }
  $("transit").innerHTML = html;
  syncBikeStripes();
}

// Continue the zebra pattern across the transit/bikes boundary: flip the
// bike rows' parity whenever the transit board has an odd row count.
function syncBikeStripes() {
  const n = document.querySelectorAll("#transit .t-row").length;
  $("bikes").classList.toggle("flip", n % 2 === 1);
}

const pageLoadedAt = Date.now();

// Disruption banner: WL trafficInfos scoped to our stops/lines
// (stoerunglang, stoerungkurz, aufzugsinfo requested with the monitor).
function renderAlerts(infos) {
  const stopIds = CONFIG.stops.map((s) => s.id);
  const seen = new Set();
  let html = "";
  for (const info of infos) {
    const stops = info.relatedStops || [];
    if (!stops.some((id) => stopIds.includes(id))) continue;
    const title = (info.title || info.name || "").trim();
    if (!title || seen.has(title)) continue;
    seen.add(title);
    const desc = (info.description || "").trim();
    html += '<div class="alert">⚠ <b>' + esc(title) + "</b>" +
      (desc ? "<span>" + esc(desc) + "</span>" : "") + "</div>";
    if (seen.size >= 2) break;   // keep the board calm
  }
  $("alerts").innerHTML = html;
}

function updateStaleBadge(now) {
  const el = $("stale");
  const ref = wlLastOk || pageLoadedAt;
  if (now.getTime() - ref > CONFIG.staleAfterMs) {
    if (wlLastOk) {
      const d = new Date(wlLastOk);
      el.textContent = "⚠ Abfahrten: Stand " +
        String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
    } else {
      el.textContent = "⚠ Abfahrten: keine Verbindung";
    }
    el.hidden = false;
  } else {
    el.hidden = true;
  }
}

/* ── WienMobil Rad / nextbike (GBFS, keyless + CORS) ─────────── */

// vehicle_type_id → label; everything not listed is a regular bike.
const BIKE_TYPES = { 348: "E-Bike", 189: "Kindersitz" };

async function fetchBikes() {
  try {
    const res = await fetch(
      "https://gbfs.nextbike.net/maps/gbfs/v2/nextbike_wr/de/station_status.json",
      { cache: "no-store" }
    );
    if (!res.ok) throw new Error("HTTP " + res.status);
    renderBikes((await res.json()).data.stations);
    markHealth("bikes", true);
  } catch (err) {
    console.warn("bike fetch failed:", err);
    markHealth("bikes", false);
  }
}

const BIKE_EMOJI = { "Rad": "🚲", "Kindersitz": "👶", "E-Bike": "⚡" };

// White line-art bike for the badge — the bicycle emoji is blue/dark and
// unreadable on colored fills, and a white chip looked out of place.
const BIKE_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round">' +
  '<circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/>' +
  '<circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></svg>';

function renderBikes(stations) {
  let html = "";
  for (const cfg of CONFIG.bikeStations) {
    const st = stations.find((s) => s.station_id === cfg.id);
    const total = st && st.is_renting ? st.num_bikes_available : 0;

    // Only the special types are worth a line: child-seat and e-bike.
    // Plain-bike availability is the total + its color.
    const counts = {};
    for (const v of (st && st.vehicle_types_available) || []) {
      const label = BIKE_TYPES[v.vehicle_type_id] || "Rad";
      counts[label] = (counts[label] || 0) + v.count;
    }
    const mix = ["Kindersitz", "E-Bike"]
      .filter((k) => counts[k])
      .map((k) => counts[k] + " " + BIKE_EMOJI[k])
      .join(" · ");

    // Availability is state, not urgency: plenty (≥3 pedal bikes) renders
    // neutral like a relaxed departure; amber only for scarcity (1-2 left,
    // and some docked bikes are broken — grab one soon if you want one);
    // dimmed at zero. E-bikes never count.
    const usable = (counts["Rad"] || 0) + (counts["Kindersitz"] || 0);
    const cls = usable >= 3 ? "" : usable > 0 ? " next tight" : " empty";
    html +=
      '<div class="t-row bike-row">' +
      '<span class="badge bike">' + BIKE_SVG + "</span>" +
      '<span class="t-dest">' + esc(cfg.name) + "</span>" +
      '<span class="bike-mix">' + mix + "</span>" +
      '<div class="t-min bike-total' + cls + '">' + total + "</div>" +
      "</div>";
  }
  $("bikes").innerHTML = html;
}

/* ── Weather (Open-Meteo, keyless + CORS) ────────────────────── */

const WMO = {
  0:  ["☀️", "Klar"],        1:  ["🌤️", "Heiter"],
  2:  ["⛅", "Wolkig"],       3:  ["☁️", "Bedeckt"],
  45: ["🌫️", "Nebel"],       48: ["🌫️", "Reifnebel"],
  51: ["🌦️", "Niesel"],      53: ["🌦️", "Niesel"],      55: ["🌧️", "Niesel"],
  56: ["🌧️", "gefr. Niesel"], 57: ["🌧️", "gefr. Niesel"],
  61: ["🌦️", "Regen"],       63: ["🌧️", "Regen"],       65: ["🌧️", "Starkregen"],
  66: ["🌧️", "gefr. Regen"],  67: ["🌧️", "gefr. Regen"],
  71: ["🌨️", "Schnee"],      73: ["🌨️", "Schnee"],      75: ["❄️", "Schnee"],
  77: ["🌨️", "Griesel"],
  80: ["🌦️", "Schauer"],     81: ["🌧️", "Schauer"],     82: ["⛈️", "Schauer"],
  85: ["🌨️", "Schneeschauer"], 86: ["🌨️", "Schneeschauer"],
  95: ["⛈️", "Gewitter"],    96: ["⛈️", "Gewitter"],    99: ["⛈️", "Gewitter"],
};

// Unicode has no moon-behind-cloud/rain emoji, so we composite our own.
const nightComposite = (front) =>
  '<span class="mooncloud"><span class="mc-moon">🌙</span>' +
  '<span class="mc-cloud">' + front + "</span></span>";
const MOON_CLOUD = nightComposite("☁️");
const MOON_RAIN = nightComposite("🌧️");
// day icons containing a sun that need a night variant
const NIGHT_RAIN_CODES = [51, 53, 61, 80];

function wmo(code, isDay) {
  const e = WMO[code] || ["·", "–"];
  if (isDay === 0) {
    if (code <= 1) {
      // clear night: show the actual phase when there's enough moon to
      // see; crescents/new stay the classic 🌙 (a dark disc on a dark
      // background reads as nothing)
      const phase = moonPhaseEmoji(new Date());
      return [["🌓", "🌔", "🌕", "🌖", "🌗"].includes(phase) ? phase : "🌙", e[1]];
    }
    if (code === 2) return [MOON_CLOUD, e[1]];
    if (NIGHT_RAIN_CODES.includes(code)) return [MOON_RAIN, e[1]];
  }
  return e;
}

// Warm/cool color per °C so temperatures read at a glance.
// Piecewise-linear interpolation between HSL anchors: the hue sweeps
// blue → teal → green → yellow → orange → red while saturation/lightness
// are tuned per stop to stay legible on the dark surface (naive RGB
// blending would turn muddy between blue and yellow).
const TEMP_STOPS = [
  [-10, [215, 90, 75]],  // icy blue
  // Lightness sits high (68–75) on purpose: the kiosk panel is mounted
  // upside-down and washes out the lower half — subtler tones vanish there.
  [0,   [205, 90, 75]],  // cold blue
  [8,   [185, 70, 68]],  // cyan
  [14,  [150, 55, 66]],  // teal-green
  [20,  [95,  60, 68]],  // green
  [25,  [48,  95, 66]],  // warm yellow
  [30,  [28, 100, 68]],  // orange
  [36,  [5,  100, 70]],  // red
];

function rampColor(stops, t) {
  const s = stops;
  if (t <= s[0][0]) return hsl(s[0][1]);
  if (t >= s[s.length - 1][0]) return hsl(s[s.length - 1][1]);
  for (let i = 1; i < s.length; i++) {
    if (t <= s[i][0]) {
      const f = (t - s[i - 1][0]) / (s[i][0] - s[i - 1][0]);
      return hsl(s[i - 1][1].map((a, k) => a + (s[i][1][k] - a) * f));
    }
  }
}

const tempColor = (t) => rampColor(TEMP_STOPS, t);

function hsl(c) {
  return "hsl(" + Math.round(c[0]) + " " + Math.round(c[1]) + "% " + Math.round(c[2]) + "%)";
}

// La La Land check: is LA having another day of sun? Judged relative to
// the possible: >= 70% of the day's daylight as sunshine + dry. Handles
// both marine-layer summer mornings and short winter days — a fixed hour
// bar would mute the line through LA's (sunny) winter.
async function fetchLA() {
  try {
    const res = await fetch(
      "https://api.open-meteo.com/v1/forecast?latitude=34.0522&longitude=-118.2437" +
      "&daily=sunshine_duration,daylight_duration,precipitation_probability_max" +
      "&forecast_days=1&timezone=America%2FLos_Angeles"
    );
    if (!res.ok) throw new Error("HTTP " + res.status);
    const day = (await res.json()).daily;
    const sunny = day.sunshine_duration[0] >= 0.7 * day.daylight_duration[0] &&
      day.precipitation_probability_max[0] <= 20;
    $("lala").hidden = !sunny;
    markHealth("la", true);
  } catch (err) {
    console.warn("LA fetch failed:", err);
    markHealth("la", false);
  }
}

async function fetchWeather() {
  try {
    const url = "https://api.open-meteo.com/v1/forecast" +
      "?latitude=" + CONFIG.lat + "&longitude=" + CONFIG.lon +
      "&current=temperature_2m,weather_code,is_day" +
      "&hourly=temperature_2m,weather_code,precipitation_probability,is_day,uv_index" +
      "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max" +
      "&forecast_days=13&timezone=Europe%2FVienna";
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    renderWeather(await res.json());
    markHealth("weather", true);
  } catch (err) {
    console.warn("weather fetch failed:", err);
    markHealth("weather", false);
  }
}

function renderWeather(d) {
  const [icon] = wmo(d.current.weather_code, d.current.is_day);
  $("now-icon").innerHTML = icon;   // may be the composite moon-cloud markup
  $("now-temp").textContent = Math.round(d.current.temperature_2m) + "°";
  $("now-temp").style.color = tempColor(d.current.temperature_2m);

  const nowIso = d.current.time.slice(0, 13);          // "2026-07-22T16"
  let start = d.hourly.time.findIndex((t) => t.slice(0, 13) === nowIso) + 1;
  if (start <= 0) start = 1;

  // Highest UV still ahead today (current hour included) — once the rest of
  // the day stays under 3, sunscreen advice is moot, badge and all
  const today = d.current.time.slice(0, 10);
  let uvAhead = 0;
  for (let i = start - 1; i < d.hourly.time.length && d.hourly.time[i].slice(0, 10) === today; i++)
    uvAhead = Math.max(uvAhead, d.hourly.uv_index[i]);

  // UV badge — only when sunscreen is actually advised (WHO: UV >= 3)
  const uvEl = $("uv");
  if (uvAhead >= 3) {
    const uvColor = uvAhead >= 11 ? "#c77dff" : uvAhead >= 8 ? "#ff5050" : uvAhead >= 6 ? "#ff9633" : "#f0e641";
    uvEl.textContent = "UV " + Math.round(uvAhead);
    uvEl.style.color = uvColor;
    uvEl.style.background = "color-mix(in srgb, " + uvColor + " 14%, var(--card-inset))";
    uvEl.hidden = false;
  } else {
    uvEl.hidden = true;
  }

  // Context for the greeting line
  WX = {
    uv: d.daily.uv_index_max[0],
    uvAhead: uvAhead,
    tMax: d.daily.temperature_2m_max[0],
    tMaxTomorrow: d.daily.temperature_2m_max[1],
    rainSoon: 0,
  };
  lastGreetKey = "";   // re-pick with fresh context

  // Hourly: the next 12 hours from now
  WX.rainSoon = Math.max(0, ...d.hourly.precipitation_probability.slice(start, start + 3));
  let hh = "";
  for (let i = start; i < Math.min(start + 12, d.hourly.time.length); i++) {
    const [hi] = wmo(d.hourly.weather_code[i], d.hourly.is_day[i]);
    const prob = d.hourly.precipitation_probability[i];
    const temp = d.hourly.temperature_2m[i];
    hh += '<div class="hour" style="background:color-mix(in srgb, ' +
      tempColor(temp) + ' 14%, var(--card-inset))">' +
      '<div class="h-time">' + d.hourly.time[i].slice(11, 16) + "</div>" +
      '<div class="h-icon">' + hi + "</div>" +
      '<div class="h-temp" style="color:' + tempColor(temp) + '">' + Math.round(temp) + "°</div>" +
      (prob >= 10 ? '<div class="rain-bar" style="width:' + prob + '%"></div>' : "") +
      "</div>";
  }
  setStrip($("hourly"), hh, d.hourly.time[start], d.hourly.time[start + 1]);

  // Daily strip: today + 11 days — same tile count as the hourly strip
  const fmtDay = new Intl.DateTimeFormat("de-AT", { weekday: "short" });
  let dd = "";
  for (let i = 0; i < Math.min(12, d.daily.time.length); i++) {
    const [di, dl] = wmo(d.daily.weather_code[i], 1);
    const date = new Date(d.daily.time[i] + "T12:00");
    const name = i === 0 ? "Heute"
      : fmtDay.format(date).replace(".", "") + " " + date.getDate() + ".";
    const rain = d.daily.precipitation_probability_max[i];
    const max = d.daily.temperature_2m_max[i];
    dd += '<div class="dday" style="background:color-mix(in srgb, ' +
      tempColor(max) + ' 14%, var(--card-inset))">' +
      '<div class="d-name">' + name + "</div>" +
      '<div class="d-icon" title="' + dl + '">' + di + "</div>" +
      '<div class="d-max" style="color:' + tempColor(max) + '">' + Math.round(max) + "°</div>" +
      '<div class="d-min" style="color:' + tempColor(d.daily.temperature_2m_min[i]) + '">' +
      Math.round(d.daily.temperature_2m_min[i]) + "°</div>" +
      (rain >= 10 ? '<div class="rain-bar" style="width:' + rain + '%"></div>' : "") +
      "</div>";
  }
  setStrip($("daily"), dd, d.daily.time[0], d.daily.time[1]);
}

/* ── Sun path (sunrise / sunset / twilight) ──────────────────── */

/* NOAA solar-position arithmetic — the sun needs no API either.
   Elevation good to ~0.1°, event times to ~1 min. */

const RAD = Math.PI / 180;

function solarBasis(d) {
  // fractional year (radians) from the UTC day-of-year
  const g = 2 * Math.PI / 365 *
    ((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 864e5);
  return {
    // equation of time (minutes), declination (radians)
    eqtime: 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g)
      - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g)),
    decl: 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g)
      - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g)
      - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g),
  };
}

function sunElevation(d) {
  const { eqtime, decl } = solarBasis(d);
  const tst = d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60 +
    eqtime + 4 * CONFIG.lon;
  const ha = (tst / 4 - 180) * RAD;
  const lat = CONFIG.lat * RAD;
  return Math.asin(Math.sin(lat) * Math.sin(decl) +
    Math.cos(lat) * Math.cos(decl) * Math.cos(ha)) / RAD;
}

// The two instants the sun crosses `alt` degrees on the given calendar
// day (-0.833 = sunrise/sunset incl. refraction, -6 = civil twilight) —
// null beyond the polar circles.
function sunCrossings(day, alt) {
  const { eqtime, decl } = solarBasis(
    new Date(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate(), 12)));
  const lat = CONFIG.lat * RAD;
  const cosHa = (Math.sin(alt * RAD) - Math.sin(lat) * Math.sin(decl)) /
    (Math.cos(lat) * Math.cos(decl));
  if (Math.abs(cosHa) > 1) return null;
  const haDeg = Math.acos(cosHa) / RAD;
  const base = Date.UTC(day.getFullYear(), day.getMonth(), day.getDate());
  return {
    rise: new Date(base + (720 - 4 * (CONFIG.lon + haDeg) - eqtime) * 60000),
    set: new Date(base + (720 - 4 * (CONFIG.lon - haDeg) - eqtime) * 60000),
  };
}

// Sky color by sun elevation: night slate → civil-twilight purple →
// horizon orange → golden hour → daylight. The curve wears these colors,
// so dawn/dusk read as zones instead of four timestamps.
// Hues climb monotonically past 360° (CSS wraps them) — interpolating
// 335 → 20 directly would take the long way round, through green.
const SUN_STOPS = [
  // night lightness sits at 30, not lower: the strip lives in the kiosk
  // panel's washed-out lower half, which crushes anything dimmer
  [-12, [222, 25, 30]],  // night
  [-6,  [258, 38, 42]],  // civil twilight starts: deep purple
  [-2,  [335, 55, 55]],  // pink shoulder just under the horizon
  [0,   [380, 85, 62]],  // horizon orange (380 = hue 20)
  [7,   [398, 95, 66]],  // golden hour   (398 = hue 38)
  [20,  [406, 92, 72]],
  [66,  [412, 88, 80]],  // high summer sun
];

// ?at=2026-12-21T16:30 previews the sun path at another instant (design aid)
const SUN_AT = new URLSearchParams(location.search).get("at");

let lastSunKey = "";

function renderSunPath(now) {
  if (SUN_AT) now = new Date(SUN_AT);
  const key = now.toDateString() + "|" + now.getHours() + ":" + now.getMinutes();
  if (key === lastSunKey) return;
  lastSunKey = key;

  // compact horizon widget: x = the local day 00:00–24:00, y = elevation.
  // Above the horizon the curve is to scale; below it the scale is
  // stretched so the twilight dip stays visible, floored at -13° where
  // the night runs flat.
  const W = 418, H = 58, HORIZON = 38, TOP = 8, FLOOR_DEG = -13;
  const PAD = 4;
  const upScale = (HORIZON - TOP) / 66;
  const dnScale = 1.1;
  const x = (min) => PAD + (min / 1440) * (W - 2 * PAD);
  const y = (e) => e >= 0 ? HORIZON - e * upScale
    : HORIZON - Math.max(e, FLOOR_DEG) * dnScale;
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  // path + gradient sampled across the local day
  let path = "", stops = "";
  for (let m = 0; m <= 1440; m += 10) {
    const e = sunElevation(new Date(base + m * 60000));
    path += (m ? "L" : "M") + x(m).toFixed(1) + " " + y(e).toFixed(1);
    if (m % 20 === 0) {
      stops += '<stop offset="' + (m / 1440 * 100).toFixed(1) + '%" stop-color="' +
        rampColor(SUN_STOPS, e) + '"/>';
    }
  }

  // current position: sun dot with a soft halo, or the moon at night
  // (x clamped so the midnight moon isn't clipped by the svg edge)
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const eNow = sunElevation(now);
  const cx = Math.min(Math.max(x(nowMin), 15), W - 15).toFixed(1);
  const cy = y(eNow).toFixed(1);
  const marker = eNow < -6
    ? '<text class="sp-moon" x="' + cx + '" y="' + (+cy + 5) + '">' +
      moonPhaseEmoji(now) + "</text>"
    : '<circle cx="' + cx + '" cy="' + cy + '" r="8" fill="' +
      rampColor(SUN_STOPS, eNow) + '" opacity="0.25"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="4" fill="' +
      rampColor(SUN_STOPS, eNow) + '"/>';

  // sunrise / sunset labels with the day-to-day drift in minutes,
  // tucked into the empty sky corners above the night ends of the curve
  const fmtHM = (d) => String(d.getHours()).padStart(2, "0") + ":" +
    String(d.getMinutes()).padStart(2, "0");
  const minOfDay = (d) => d.getHours() * 60 + d.getMinutes();
  const today = sunCrossings(now, -0.833);
  const tomorrow = sunCrossings(new Date(base + 36 * 3600e3), -0.833);
  let labels = "";
  if (today && tomorrow) {
    const label = (ev, arrow, anchor) => {
      const drift = minOfDay(tomorrow[ev]) - minOfDay(today[ev]);
      const lx = anchor === "start" ? PAD : W - PAD;
      return '<text class="sp-label" text-anchor="' + anchor + '" x="' + lx +
        '" y="14"><tspan class="sp-arrow">' + arrow +
        "</tspan> " + fmtHM(today[ev]) +
        (drift ? '<tspan class="sp-drift"> ' +
          (drift > 0 ? "+" : "−") + Math.abs(drift) + "′</tspan>" : "") +
        "</text>";
    };
    labels = label("rise", "↑", "start") + label("set", "↓", "end");
  }

  $("sunpath").innerHTML =
    '<svg viewBox="0 0 ' + W + " " + H + '">' +
    '<defs><linearGradient id="sp-grad" gradientUnits="userSpaceOnUse" ' +
    'x1="' + PAD + '" y1="0" x2="' + (W - PAD) + '" y2="0">' + stops +
    "</linearGradient>" +
    '<clipPath id="sp-sky"><rect x="0" y="0" width="' + W + '" height="' +
    HORIZON + '"/></clipPath></defs>' +
    '<line class="sp-horizon" x1="' + PAD + '" y1="' + HORIZON +
    '" x2="' + (W - PAD) + '" y2="' + HORIZON + '"/>' +
    // daylight as a faint warm area under the arc (clipped at the horizon)
    '<path d="' + path + "L" + (W - PAD) + " " + HORIZON + "L" + PAD + " " +
    HORIZON + 'Z" fill="url(#sp-grad)" opacity="0.08" clip-path="url(#sp-sky)"/>' +
    '<path d="' + path + '" fill="none" stroke="url(#sp-grad)" ' +
    'stroke-width="3" stroke-linecap="round"/>' +
    marker + labels +
    "</svg>";
}

/* ── Air quality (Open-Meteo, European AQI) ──────────────────── */

// Official EAQI band hues, the two worst lightened for dark-bg legibility.
const EAQI_BANDS = [
  [20,  "Gut",             "#50f0e6"],
  [40,  "Passabel",        "#5fd6a8"],
  [60,  "Mäßig",           "#f0e641"],
  [80,  "Schlecht",        "#ff5050"],
  [100, "Sehr schlecht",   "#ff2e63"],
  [Infinity, "Extrem",     "#c77dff"],
];

// Per-pollutant EAQI band edges (µg/m³) — which measurement drives the index.
const POLLUTANT_BANDS = {
  pm2_5:            [10, 20, 25, 50, 75],
  pm10:             [20, 40, 50, 100, 150],
  ozone:            [50, 100, 130, 240, 380],
  nitrogen_dioxide: [40, 90, 120, 230, 340],
};

function pollutantBand(key, v) {
  const edges = POLLUTANT_BANDS[key];
  let i = 0;
  while (i < edges.length && v > edges[i]) i++;
  return i;                                  // 0 (Gut) … 5 (Extrem)
}

async function fetchAQI() {
  try {
    const url = "https://air-quality-api.open-meteo.com/v1/air-quality" +
      "?latitude=" + CONFIG.lat + "&longitude=" + CONFIG.lon +
      "&current=european_aqi,pm10,pm2_5,ozone,nitrogen_dioxide";
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    renderAQI((await res.json()).current);
    markHealth("aqi", true);
  } catch (err) {
    console.warn("AQI fetch failed:", err);
    markHealth("aqi", false);
  }
}

function renderAQI(c) {
  const band = EAQI_BANDS.find((b) => c.european_aqi <= b[0]);
  // From "Mäßig" upward the tile takes the band color (border, tint,
  // value) so the culprit measurement is visible at a glance.
  const tile = (label, val, key) => {
    const idx = pollutantBand(key, val);
    if (idx < 2) return '<div><span class="ap-label">' + label + "</span><b>" + val + "</b></div>";
    const color = EAQI_BANDS[idx][2];
    return '<div style="border-color:color-mix(in srgb, ' + color + ' 55%, transparent);' +
      'background:color-mix(in srgb, ' + color + ' 16%, var(--card-inset))">' +
      '<span class="ap-label">' + label + '</span><b style="color:' + color + '">' + val + "</b></div>";
  };
  $("aqi").innerHTML =
    '<div class="aqi-top">' +
    '<div><div class="aqi-value" style="color:' + band[2] + '">' +
    Math.round(c.european_aqi) + "</div>" +
    '<div class="aqi-sub">Europ. AQI</div></div>' +
    '<div class="aqi-band" style="color:' + band[2] +
    ';background:color-mix(in srgb, ' + band[2] + ' 15%, transparent)">' +
    band[1] + "</div>" +
    "</div>" +
    '<div class="aqi-pollutants">' +
    tile("PM2.5", c.pm2_5, "pm2_5") +
    tile("PM10", c.pm10, "pm10") +
    tile("O₃", Math.round(c.ozone), "ozone") +
    tile("NO₂", c.nitrogen_dioxide, "nitrogen_dioxide") +
    "</div>";
}

/* ── Pollen (polleninformation.at via local proxy) ───────────── */

const POLLEN_LEVELS = [
  null,
  ["gering",      "#7bc96f"],
  ["mäßig",       "#f0e641"],
  ["hoch",        "#ff9633"],
  ["sehr hoch",   "#ff5050"],
];

// Icon per allergen kind, matched against the German name (first hit wins).
const POLLEN_ICONS = [
  ["pilz", "🍄"], ["schimmel", "🍄"],
  ["gräser", "🌾"], ["roggen", "🌾"],
  ["hasel", "🌰"], ["kastanie", "🌰"],
  ["olive", "🫒"], ["ölbaum", "🫒"],
  ["zypresse", "🌲"],
  ["ambrosia", "🌼"], ["ragweed", "🌼"],
  ["nessel", "🍃"], ["glaskraut", "🍃"],
  ["beifuß", "🌿"], ["ampfer", "🌿"], ["wegerich", "🌿"],
  // tree pollen: birke, erle, esche, eiche, buche, ulme, platane, linde, weide…
  ["", "🌳"],
];

function pollenIcon(name) {
  const n = name.toLowerCase();
  return POLLEN_ICONS.find(([k]) => n.includes(k))[1];
}

async function fetchPollen() {
  try {
    const res = await fetch("/api/pollen");
    if (!res.ok) throw new Error("HTTP " + res.status);
    renderPollen(await res.json());
    markHealth("pollen", true);
  } catch (err) {
    console.warn("pollen fetch failed:", err);
    markHealth("pollen", false);
  }
}

const RISK_WORDS = [
  ["Keine Belastung", "#7bc96f"],
  ["Gering",          "#7bc96f"],
  ["Mäßig",           "#f0e641"],
  ["Hoch",            "#ff9633"],
  ["Sehr hoch",       "#ff5050"],
];

function renderPollen(d) {
  const isMine = (name) =>
    CONFIG.myAllergens.length === 0 ||
    CONFIG.myAllergens.some((k) => name.toLowerCase().includes(k));

  const entries = (d.contamination || []).map((p) => ({
    name: p.poll_title
      .replace(/\s*\(.*$/, "")            // drop the Latin name
      .replace(/- und Glaskraut/, "")     // "Nessel- und Glaskraut" → "Nessel"
      .replace(/gewächse$/, ""),          // "Wegerichgewächse" → "Wegerich"
    days: [1, 2, 3, 4].map((n) => Math.min(p["contamination_" + n] || 0, 4)),
  }));
  const active = entries
    .map((p) => ({ ...p, level: p.days[0], next: p.days[1] }))
    .filter((p) => p.level >= 1);

  const mine = active.filter((p) => isMine(p.name));
  const others = active.filter((p) => !isMine(p.name)).sort((a, b) => b.level - a.level);

  // Headline: with a personal selection, YOUR risk = worst of your
  // allergens; otherwise the API's overall 0–10 value (→ 0–4 scale).
  let risk;
  if (CONFIG.myAllergens.length) {
    risk = mine.reduce((m, p) => Math.max(m, p.level), 0);
  } else {
    const raw = (d.allergyrisk && d.allergyrisk.allergyrisk_1) || 0;
    risk = Math.max(0, Math.min(4, Math.round(raw / 2.5)));
  }
  const [rWord, rColor] = RISK_WORDS[risk];
  const top = '<span class="risk-value" style="color:' + rColor + '">' + rWord + "</span>";

  // Content-width chips in a wrapped cluster, worst first — no level
  // words, the chip color encodes intensity. Arrow = tomorrow's trend.
  mine.sort((a, b) => b.level - a.level);
  const chips = mine.map((p) => {
    const color = POLLEN_LEVELS[p.level][1];
    let trend = "";
    if (p.next > p.level) {
      trend = '<span class="p-trend" style="color:' + POLLEN_LEVELS[p.next][1] + '">↗</span>';
    } else if (p.next < p.level) {
      trend = '<span class="p-trend" style="color:#7bc96f">↘</span>';
    }
    // steady: no arrow — no ink on non-information
    return '<div class="p-chip" style="background:color-mix(in srgb, ' + color +
      ' 10%, var(--card-inset));color:' + color + '">' +
      pollenIcon(p.name) + " " + esc(p.name) + trend + "</div>";
  }).join("");

  // 3-day outlook: YOUR risk (max of your allergens) for the next days.
  const myEntries = CONFIG.myAllergens.length
    ? entries.filter((p) => isMine(p.name))
    : entries;
  const OUTLOOK_WORDS = ["Keine", "Gering", "Mäßig", "Hoch", "Sehr hoch"];
  const fmtDow = new Intl.DateTimeFormat("de-AT", { weekday: "short" });
  let outlook = '<div class="p-outlook">';
  for (let n = 1; n <= 3; n++) {
    const lvl = myEntries.reduce((m, p) => Math.max(m, p.days[n]), 0);
    const color = lvl > 0 ? POLLEN_LEVELS[lvl][1] : "#7bc96f";
    const date = new Date();
    date.setDate(date.getDate() + n);
    const label = n === 1 ? "Morgen"
      : fmtDow.format(date).replace(".", "") + " " + date.getDate() + ".";
    outlook += '<div class="po-tile"><span class="po-day">' + label + "</span>" +
      '<b style="color:' + color + '">' + OUTLOOK_WORDS[lvl] + "</b></div>";
  }
  outlook += "</div>";

  // Everything you're not allergic to: greyed out, own section.
  const rest = others.length
    ? '<div class="p-others">' +
      others.map((p) =>
        '<div class="p-chip grey"><span class="p-ico">' + pollenIcon(p.name) + "</span> " +
        esc(p.name) +
        '<span class="p-hint" style="background:' + POLLEN_LEVELS[p.level][1] + '"></span></div>'
      ).join("") +
      "</div>"
    : "";

  $("pollen").innerHTML = top +
    (chips ? '<div class="p-mine">' + chips + "</div>" : "") +
    outlook + rest;
}

/* ── Uptime Kuma: minute bar turns red when a monitor is down ── */

async function fetchKuma() {
  try {
    const res = await fetch("/api/kuma", { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const beats = (await res.json()).heartbeatList || {};
    kumaDown = Object.values(beats).some(
      (a) => a.length && a[a.length - 1].status === 0
    );
    markHealth("kuma", true);
  } catch (err) {
    console.warn("kuma fetch failed:", err);
    markHealth("kuma", false);
  }
}

/* ── Boot ────────────────────────────────────────────────────── */

tick();
setInterval(tick, 1000);

fetchWL();
setInterval(fetchWL, CONFIG.wlRefreshMs);

fetchBikes();
setInterval(fetchBikes, CONFIG.bikeRefreshMs);

fetchWeather();
setInterval(fetchWeather, CONFIG.weatherRefreshMs);

fetchLA();
setInterval(fetchLA, 60 * 60 * 1000);

fetchAQI();
setInterval(fetchAQI, CONFIG.aqiRefreshMs);

fetchPollen();
setInterval(fetchPollen, CONFIG.pollenRefreshMs);

if (CONFIG.kumaEnabled) {
  fetchKuma();
  setInterval(fetchKuma, 60 * 1000);
}
