const fs = require("fs");

const API_KEY = process.env.API_FOOTBALL_KEY;
const API_BASE = "https://v3.football.api-sports.io";
const TIME_ZONE = "Atlantic/Reykjavik";
const LEAGUE_ID = 1;
const SEASON = 2026;

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

async function getFixturesByDate(date) {
  const url = `${API_BASE}/fixtures?league=${LEAGUE_ID}&season=${SEASON}&date=${date}`;

  const response = await fetch(url, {
    headers: {
      "x-apisports-key": API_KEY
    }
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (data.errors && Object.keys(data.errors).length > 0) {
    console.log("API errors:", data.errors);
  }

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

  const yesterdayFixtures = await getFixturesByDate(yesterdayDate);
  const todayFixtures = await getFixturesByDate(todayDate);

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

  const briefing = {
    updated,
    title: "World Cup Briefing",
    yesterday: yesterday.length ? yesterday : [
      {
        match: "No completed World Cup matches found yesterday",
        referee: "Not published yet"
      }
    ],
    today: today.length ? today : [
      {
        match: "No World Cup matches found today",
        time: "",
        referee: "Not published yet"
      }
    ],
    note: refereeNames.length
      ? `Referee appointments found: ${refereeNames.join(" · ")}`
      : "Referee names will show here when available from the data source."
  };

  fs.mkdirSync("data", { recursive: true });

  fs.writeFileSync(
    "data/worldcup-briefing.json",
    JSON.stringify(briefing, null, 2) + "\n"
  );

  console.log("World Cup briefing updated.");
  console.log(`Yesterday: ${yesterdayDate}`);
  console.log(`Today: ${todayDate}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
