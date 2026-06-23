const fs = require("fs");

const TIME_ZONE = "Atlantic/Reykjavik";
const API_URL = "https://worldcup26.ir/get/games";

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

  const d = new Date(dateString);
  if (isNaN(d)) return "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(d);

  const year = parts.find(p => p.type === "year").value;
  const month = parts.find(p => p.type === "month").value;
  const day = parts.find(p => p.type === "day").value;

  return `${year}-${month}-${day}`;
}

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
    ""
  );
}

function normalizeGame(raw) {
  const homeRaw =
    getValue(raw, ["home_team", "homeTeam", "home", "team1", "team_a", "teamA"]) ||
    getValue(raw, ["home_team_en", "home_name"]);

  const awayRaw =
    getValue(raw, ["away_team", "awayTeam", "away", "team2", "team_b", "teamB"]) ||
    getValue(raw, ["away_team_en", "away_name"]);

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

  return {
    home,
    away,
    homeScore,
    awayScore,
    date,
    status,
    referee,
    dateObject: new Date(date)
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
    item.time = formatTimeInReykjavik(game.date);
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

  console.log("Games returned:", games.length);

  if (games.length > 0) {
    console.log("First raw game sample:");
    console.log(JSON.stringify(games[0], null, 2));
  }

  return games
    .map(normalizeGame)
    .filter(game => game.date && !isNaN(game.dateObject));
}

async function main() {
  const yesterdayDate = getReykjavikDate(-1);
  const todayDate = getReykjavikDate(0);
  const now = new Date();

  const allFixtures = await getAllWorldCupFixtures();

  console.log(`Yesterday in Reykjavik: ${yesterdayDate}`);
  console.log(`Today in Reykjavik: ${todayDate}`);
  console.log(`World Cup fixtures found: ${allFixtures.length}`);

  const yesterdayFixtures = allFixtures.filter(game => {
    return getFixtureDateInReykjavik(game.date) === yesterdayDate;
  });

  const todayFixtures = allFixtures.filter(game => {
    return getFixtureDateInReykjavik(game.date) === todayDate;
  });

  const nextFixtures = allFixtures
    .filter(game => game.dateObject >= now && !isFinished(game))
    .sort((a, b) => a.dateObject - b.dateObject)
    .slice(0, 4);

  const recentFinished = allFixtures
    .filter(game => game.dateObject < now && isFinished(game))
    .sort((a, b) => b.dateObject - a.dateObject)
    .slice(0, 4);

  const yesterday = yesterdayFixtures
    .filter(game => isFinished(game))
    .map(game => makeGameItem(game, false));

  let today = todayFixtures.map(game => makeGameItem(game, true));

  let todayLabel = "Today";

  if (today.length === 0 && nextFixtures.length > 0) {
    today = nextFixtures.map(game => makeGameItem(game, true));
    todayLabel = "Next matches";
  }

  let yesterdayFinal = yesterday;

  if (yesterdayFinal.length === 0 && recentFinished.length > 0) {
    yesterdayFinal = recentFinished.map(game => makeGameItem(game, false));
  }

  const updated = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date()).replace(",", "");

  const refereeNames = [...yesterdayFinal, ...today]
    .filter(game => game.referee && game.referee !== "Not published yet")
    .map(game => `${game.match}: ${game.referee}`);

  let note = "";

  if (allFixtures.length === 0) {
    note = "World Cup API returned 0 fixtures. The dashboard system works, but this source may not be available right now.";
  } else if (refereeNames.length > 0) {
    note = `Referee appointments found: ${refereeNames.join(" · ")}`;
  } else {
    note = `World Cup API returned ${allFixtures.length} fixtures. Showing ${todayLabel.toLowerCase()}. Referee names will show here if this source publishes them.`;
  }

  const briefing = {
    updated,
    title: "World Cup Briefing",
    apiFixtureCount: allFixtures.length,
    todayLabel,
    yesterday: yesterdayFinal.length ? yesterdayFinal : [
      {
        match: "No completed World Cup matches found yet",
        referee: "Not published yet"
      }
    ],
    today: today.length ? today : [
      {
        match: "No upcoming World Cup matches found",
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
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
