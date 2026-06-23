const fs = require("fs");

const API_KEY = process.env.API_FOOTBALL_KEY;
const API_BASE = "https://v3.football.api-sports.io";
const TIME_ZONE = "Atlantic/Reykjavik";
const LEAGUE_ID = 39;
const SEASON = 2023;

if (!API_KEY) {
  console.error("Missing API_FOOTBALL_KEY secret.");
  process.exit(1);
}

function getReykjavikDate(offsetDays = 0) {
  const now = new Date();

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);

  const year = parts.find(p => p.type === "year").value;
  const month = parts.find(p => p.type === "month").value;
  const day = parts.find(p => p.type === "day").value;

  const base = new Date(`${year}-${month}-${day}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + offsetDays);

  return base.toISOString().slice(0, 10);
}

function getFixtureDateInReykjavik(dateString) {
  if (!dateString) return "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(dateString));

  const year = parts.find(p => p.type === "year").value;
  const month = parts.find(p => p.type === "month").value;
  const day = parts.find(p => p.type === "day").value;

  return `${year}-${month}-${day}`;
}

function formatTimeInReykjavik(dateString) {
  if (!dateString) return "";

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(dateString));
}

function isFinished(statusShort) {
  return ["FT", "AET", "PEN"].includes(statusShort);
}

function formatMatch(fixture) {
  const home = fixture.teams?.home?.name || "Home";
  const away = fixture.teams?.away?.name || "Away";
  const homeGoals = fixture.goals?.home;
  const awayGoals = fixture.goals?.away;

  if (typeof homeGoals === "number" && typeof awayGoals === "number") {
    return `${home} ${homeGoals}–${awayGoals} ${away}`;
  }

  return `${home} vs ${away}`;
}

async function getAllWorldCupFixtures() {
  const url = `${API_BASE}/fixtures?league=${LEAGUE_ID}&season=${SEASON}`;

  console.log("Requesting all World Cup fixtures:");
  console.log(url);

  const response = await fetch(url, {
    headers: {
      "x-apisports-key": API_KEY
    }
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  console.log("API results:");
  console.log("Errors:", JSON.stringify(data.errors || {}));
  console.log("Fixtures returned:", data.results);

  return data.response || [];
}

function makeGameItem(fixture, includeTime = false) {
  const referee = fixture.fixture?.referee || "Not published yet";

  const item = {
    match: formatMatch(fixture),
    referee
  };

  if (includeTime) {
    item.time = formatTimeInReykjavik(fixture.fixture?.date);
  }

  return item;
}

async function main() {
  const yesterdayDate = getReykjavikDate(-1);
  const todayDate = getReykjavikDate(0);

  const allFixtures = await getAllWorldCupFixtures();

  console.log(`Yesterday in Reykjavik: ${yesterdayDate}`);
  console.log(`Today in Reykjavik: ${todayDate}`);

  if (allFixtures.length > 0) {
    console.log("First fixture sample:");
    console.log(JSON.stringify(allFixtures[0], null, 2));
  }

  const yesterdayFixtures = allFixtures.filter(game => {
    const fixtureDate = getFixtureDateInReykjavik(game.fixture?.date);
    return fixtureDate === yesterdayDate;
  });

  const todayFixtures = allFixtures.filter(game => {
    const fixtureDate = getFixtureDateInReykjavik(game.fixture?.date);
    return fixtureDate === todayDate;
  });

  const yesterday = yesterdayFixtures
    .filter(game => isFinished(game.fixture?.status?.short))
    .map(game => makeGameItem(game, false));

  const today = todayFixtures
    .map(game => makeGameItem(game, true));

  const updated = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date()).replace(",", "");

  const refereeNames = [...yesterday, ...today]
    .filter(game => game.referee && game.referee !== "Not published yet")
    .map(game => `${game.match}: ${game.referee}`);

  let note = "";

  if (allFixtures.length === 0) {
    note = "API-Football returned 0 World Cup 2026 fixtures for this account. The dashboard system works, but this API account may not include the data yet.";
  } else if (refereeNames.length > 0) {
    note = `Referee appointments found: ${refereeNames.join(" · ")}`;
  } else {
    note = `API-Football returned ${allFixtures.length} World Cup 2026 fixtures. Referee names will show here when available.`;
  }

  const briefing = {
    updated,
    title: "Premier League Test",
    apiFixtureCount: allFixtures.length,
    yesterday: yesterday.length ? yesterday : [
      {
        match: allFixtures.length === 0
          ? "World Cup 2026 data not available from API-Football yet"
          : "No completed World Cup matches found yesterday",
        referee: "Not published yet"
      }
    ],
    today: today.length ? today : [
      {
        match: allFixtures.length === 0
          ? "World Cup 2026 data not available from API-Football yet"
          : "No World Cup matches found today",
        time: "",
        referee: "Not published yet"
      }
    ],
    note
  };

  fs.mkdirSync("data", { recursive: true });

  fs.writeFileSync(
    "data/worldcup-briefing.json",
    JSON.stringify(briefing, null, 2) + "\n"
  );

  console.log("World Cup briefing updated.");
  console.log(`World Cup fixtures found: ${allFixtures.length}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
