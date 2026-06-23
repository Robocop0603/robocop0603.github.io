const fs = require("fs");

const TIME_ZONE = "Atlantic/Reykjavik";
const API_URL = "https://worldcup26.ir/get/games";

function parseWorldCupDate(localDate) {
  // API format example: "06/11/2026 13:00"
  if (!localDate) return null;

  const match = String(localDate).match(
    /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/
  );

  if (!match) return null;

  const [, month, day, year, hour, minute] = match;

  // Treat source time as local tournament time enough for ordering/display.
  // We display the raw local time as given by the API.
  return new Date(`${year}-${month}-${day}T${hour}:${minute}:00Z`);
}

function formatDateKey(dateObj) {
  if (!dateObj || isNaN(dateObj)) return "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(dateObj);

  const year = parts.find(p => p.type === "year").value;
  const month = parts.find(p => p.type === "month").value;
  const day = parts.find(p => p.type === "day").value;

  return `${year}-${month}-${day}`;
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

function formatTimeFromLocalDate(localDate) {
  // From "06/11/2026 13:00" return "13:00"
  if (!localDate) return "Time not published";

  const match = String(localDate).match(/\s(\d{2}:\d{2})/);
  return match ? match[1] : "Time not published";
}

function normalizeGame(raw) {
  const home = raw.home_team_name_en || "Home";
  const away = raw.away_team_name_en || "Away";

  const homeScore = raw.home_score;
  const awayScore = raw.away_score;

  const dateText = raw.local_date || "";
  const dateObject = parseWorldCupDate(dateText);

  const finished = String(raw.finished).toLowerCase() === "true";
  const status = raw.time_elapsed || "";

  return {
    home,
    away,
    homeScore,
    awayScore,
    dateText,
    dateObject,
    finished,
    status,
    referee: "Not published yet"
  };
}

function formatMatch(game) {
  const hasScore =
    game.homeScore !== undefined &&
    game.awayScore !== undefined &&
    game.homeScore !== null &&
    game.awayScore !== null &&
    String(game.homeScore).toLowerCase() !== "null" &&
    String(game.awayScore).toLowerCase() !== "null" &&
    String(game.homeScore) !== "" &&
    String(game.awayScore) !== "";

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
    item.time = formatTimeFromLocalDate(game.dateText);
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

  return games
    .map(normalizeGame)
    .filter(game => game.dateObject && !isNaN(game.dateObject));
}

async function main() {
  const allFixtures = await getAllWorldCupFixtures();

  const yesterdayDate = getReykjavikDate(-1);
  const todayDate = getReykjavikDate(0);
  const now = new Date();

  const sortedFixtures = allFixtures.sort((a, b) => a.dateObject - b.dateObject);

  const yesterdayFixtures = sortedFixtures.filter(game => {
    return formatDateKey(game.dateObject) === yesterdayDate;
  });

  const todayFixtures = sortedFixtures.filter(game => {
    return formatDateKey(game.dateObject) === todayDate;
  });

  const finishedYesterday = yesterdayFixtures
    .filter(game => game.finished)
    .map(game => makeGameItem(game, false));

  const recentFinished = sortedFixtures
    .filter(game => game.dateObject < now && game.finished)
    .sort((a, b) => b.dateObject - a.dateObject)
    .slice(0, 4)
    .map(game => makeGameItem(game, false));

  const todayGames = todayFixtures.map(game => makeGameItem(game, true));

  const upcomingGames = sortedFixtures
    .filter(game => game.dateObject >= now && !game.finished)
    .slice(0, 4)
    .map(game => makeGameItem(game, true));

  let yesterday = finishedYesterday.length ? finishedYesterday : recentFinished;
  let today = todayGames.length ? todayGames : upcomingGames;
  let todayLabel = todayGames.length ? "Today" : "Next matches";

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
    todayLabel,
    yesterday: yesterday.length ? yesterday : [
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
    note: `World Cup API returned ${allFixtures.length} fixtures. Showing ${todayLabel.toLowerCase()}. Referee names are not included in this source yet.`
  };

  fs.mkdirSync("data", { recursive: true });

  fs.writeFileSync(
    "data/worldcup-briefing.json",
    JSON.stringify(briefing, null, 2) + "\n"
  );

  console.log("World Cup briefing updated.");
  console.log(`Readable fixtures: ${allFixtures.length}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
