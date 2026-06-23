const fs = require("fs");

const TIME_ZONE = "Atlantic/Reykjavik";
const API_URL = "https://worldcup26.ir/get/games";

function formatTimeInReykjavik(dateString) {
  if (!dateString) return "";

  const d = new Date(dateString);
  if (isNaN(d)) return "";

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(d);
}

function getValue(obj, possibleKeys) {
  for (const key of possibleKeys) {
    if (obj && obj[key] !== undefined && obj[key] !== null && obj[key] !== "") {
      return obj[key];
    }
  }
  return "";
}

function getTeamName(value) {
  if (!value) return "";
  if (typeof value === "string") return value;

  return (
    value.name ||
    value.en ||
    value.title ||
    value.country ||
    value.team_name ||
    value.short_name ||
    ""
  );
}

function normalizeGame(raw) {
  const homeRaw =
    getValue(raw, ["home_team", "homeTeam", "home", "team1", "team_a", "teamA"]) ||
    getValue(raw, ["home_team_en", "home_name", "homeTeamName"]);

  const awayRaw =
    getValue(raw, ["away_team", "awayTeam", "away", "team2", "team_b", "teamB"]) ||
    getValue(raw, ["away_team_en", "away_name", "awayTeamName"]);

  const home = getTeamName(homeRaw) || "Home";
  const away = getTeamName(awayRaw) || "Away";

  const homeScore = getValue(raw, [
    "home_score",
    "homeScore",
    "score1",
    "home_goals",
    "goals_home"
  ]);

  const awayScore = getValue(raw, [
    "away_score",
    "awayScore",
    "score2",
    "away_goals",
    "goals_away"
  ]);

  const date =
    getValue(raw, ["date", "match_date", "datetime", "kickoff", "time", "start_time"]) ||
    getValue(raw.fixture || {}, ["date"]);

  const status = String(
    getValue(raw, ["status", "match_status", "state"]) ||
    getValue(raw.fixture || {}, ["status"]) ||
    ""
  ).toLowerCase();

  const referee =
    getValue(raw, ["referee", "main_referee", "official"]) ||
    getValue(raw.officials || {}, ["referee"]) ||
    "Not published yet";

  const dateObject = new Date(date);

  return {
    home,
    away,
    homeScore,
    awayScore,
    date,
    status,
    referee,
    dateObject
  };
}

function isFinished(game) {
  return (
    game.status.includes("finished") ||
    game.status.includes("complete") ||
    game.status.includes("full") ||
    game.status === "ft" ||
    game.status === "aet" ||
    game.status === "pen"
  );
}

function formatMatch(game) {
  const hasScore =
    game.homeScore !== "" &&
    game.awayScore !== "" &&
    game.homeScore !== null &&
    game.awayScore !== null;

  if (hasScore) {
    return `${game.home} ${game.homeScore}–${game.awayScore} ${game.away}`;
  }

  return `${game.home} vs ${game.away}`;
}

function makeGameItem(game, includeTime = false) {
  const item = {
    match: formatMatch(game),
    referee: game.referee || "Not published yet"
  };

  if (includeTime) {
    const time = formatTimeInReykjavik(game.date);
    item.time = time || "Time not published";
  }

  return item;
}

async function getAllWorldCupFixtures() {
  console.log("Requesting World Cup games:");
  console.log(API_URL);

  const response = await fetch(API_URL);

  if (!response.ok) {
    throw new Error(`World Cup API request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  let games = [];

  if (Array.isArray(data)) {
    games = data;
  } else if (Array.isArray(data.data)) {
    games = data.data;
  } else if (Array.isArray(data.games)) {
    games = data.games;
  } else if (Array.isArray(data.matches)) {
    games = data.matches;
  } else if (Array.isArray(data.response)) {
    games = data.response;
  }

  console.log("Raw games returned:", games.length);

  if (games.length > 0) {
    console.log("First raw game sample:");
    console.log(JSON.stringify(games[0], null, 2));
  }

  return games.map(normalizeGame);
}

async function main() {
  const allFixtures = await getAllWorldCupFixtures();

  const validDateFixtures = allFixtures
    .filter(game => game.date && !isNaN(game.dateObject))
    .sort((a, b) => a.dateObject - b.dateObject);

  const noDateFixtures = allFixtures
    .filter(game => !game.date || isNaN(game.dateObject));

  const now = new Date();

  const upcoming = validDateFixtures
    .filter(game => game.dateObject >= now && !isFinished(game))
    .slice(0, 4);

  const fallbackUpcoming = validDateFixtures.slice(0, 4);

  const displayToday =
    upcoming.length > 0
      ? upcoming
      : fallbackUpcoming.length > 0
        ? fallbackUpcoming
        : noDateFixtures.slice(0, 4);

  const recentFinished = validDateFixtures
    .filter(game => game.dateObject < now && isFinished(game))
    .sort((a, b) => b.dateObject - a.dateObject)
    .slice(0, 4);

  const updated = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date()).replace(",", "");

  const briefing = {
    updated,
    title: "World Cup Briefing",
    apiFixtureCount: allFixtures.length,
    validDateCount: validDateFixtures.length,
    todayLabel: "Next matches",
    yesterday: recentFinished.length ? recentFinished.map(game => makeGameItem(game, false)) : [
      {
        match: "No completed World Cup matches found yet",
        referee: "Not published yet"
      }
    ],
    today: displayToday.length ? displayToday.map(game => makeGameItem(game, true)) : [
      {
        match: "No upcoming World Cup matches found",
        time: "",
        referee: "Not published yet"
      }
    ],
    note: `World Cup API returned ${allFixtures.length} fixtures. ${validDateFixtures.length} had readable dates. Showing next available matches. Referee names will show here if this source publishes them.`
  };

  fs.mkdirSync("data", { recursive: true });

  fs.writeFileSync(
    "data/worldcup-briefing.json",
    JSON.stringify(briefing, null, 2) + "\n"
  );

  console.log("World Cup briefing updated.");
  console.log(`Raw fixtures: ${allFixtures.length}`);
  console.log(`Readable date fixtures: ${validDateFixtures.length}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
