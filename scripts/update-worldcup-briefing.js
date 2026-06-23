const fs = require("fs");

const TIME_ZONE = "Atlantic/Reykjavik";
const API_GAMES_URL = "https://worldcup26.ir/get/games";
const API_STADIUMS_URL = "https://worldcup26.ir/get/stadiums";

// June/July 2026 offsets from UTC.
// Iceland/Reykjavík is UTC, so converting to UTC also gives Reykjavík time.
const TIMEZONE_OFFSETS = {
  "America/Mexico_City": -6,
  "America/Vancouver": -7,
  "America/Los_Angeles": -7,
  "America/Chicago": -5,
  "America/New_York": -4,
  "America/Toronto": -4
};

function getValue(obj, possibleKeys) {
  for (const key of possibleKeys) {
    if (obj && obj[key] !== undefined && obj[key] !== null && obj[key] !== "") {
      return obj[key];
    }
  }
  return "";
}

function detectVenueTimezone(stadium) {
  const text = JSON.stringify(stadium || {}).toLowerCase();

  if (
    text.includes("mexico city") ||
    text.includes("ciudad de méxico") ||
    text.includes("azteca") ||
    text.includes("banorte") ||
    text.includes("guadalajara") ||
    text.includes("monterrey")
  ) {
    return "America/Mexico_City";
  }

  if (text.includes("vancouver")) {
    return "America/Vancouver";
  }

  if (text.includes("toronto")) {
    return "America/Toronto";
  }

  if (
    text.includes("los angeles") ||
    text.includes("seattle") ||
    text.includes("san francisco") ||
    text.includes("bay area")
  ) {
    return "America/Los_Angeles";
  }

  if (
    text.includes("dallas") ||
    text.includes("houston") ||
    text.includes("kansas city")
  ) {
    return "America/Chicago";
  }

  if (
    text.includes("new york") ||
    text.includes("new jersey") ||
    text.includes("boston") ||
    text.includes("philadelphia") ||
    text.includes("miami") ||
    text.includes("atlanta")
  ) {
    return "America/New_York";
  }

  return "";
}

async function getStadiumTimezoneMap() {
  try {
    console.log("Requesting World Cup stadiums:");
    console.log(API_STADIUMS_URL);

    const response = await fetch(API_STADIUMS_URL);

    if (!response.ok) {
      console.log("Could not fetch stadiums. Status:", response.status);
      return {};
    }

    const data = await response.json();

    let stadiums = [];

    if (Array.isArray(data)) {
      stadiums = data;
    } else if (Array.isArray(data.data)) {
      stadiums = data.data;
    } else if (Array.isArray(data.stadiums)) {
      stadiums = data.stadiums;
    } else if (Array.isArray(data.response)) {
      stadiums = data.response;
    }

    console.log("Stadiums returned:", stadiums.length);

    if (stadiums.length > 0) {
      console.log("First raw stadium sample:");
      console.log(JSON.stringify(stadiums[0], null, 2));
    }

    const map = {};

    stadiums.forEach(stadium => {
      const id =
        getValue(stadium, ["id", "_id", "stadium_id", "stadiumId"]) ||
        getValue(stadium.stadium || {}, ["id", "stadium_id"]);

      const timezone = detectVenueTimezone(stadium);

      if (id && timezone) {
        map[String(id)] = timezone;
      }
    });

    console.log("Stadium timezone map:");
    console.log(JSON.stringify(map, null, 2));

    return map;
  } catch (error) {
    console.log("Stadium fetch failed:", error.message);
    return {};
  }
}

function parseWorldCupDateToUTC(localDate, stadiumId, stadiumTimezoneMap) {
  // API format example: "06/11/2026 13:00"
  if (!localDate) return null;

  const match = String(localDate).match(
    /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/
  );

  if (!match) return null;

  const [, month, day, year, hour, minute] = match;

  const timezone =
    stadiumTimezoneMap[String(stadiumId)] ||
    fallbackTimezoneFromStadiumId(stadiumId);

  const offset = TIMEZONE_OFFSETS[timezone];

  if (offset === undefined) {
    // If we cannot identify the venue timezone, keep the raw time as UTC fallback.
    return new Date(
      Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute)
      )
    );
  }

  // Local venue time to UTC:
  // Example Mexico City UTC-6, 13:00 local -> 19:00 UTC/Reykjavík.
  return new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour) - offset,
      Number(minute)
    )
  );
}

function fallbackTimezoneFromStadiumId(stadiumId) {
  // Fallback if stadium endpoint is unavailable.
  // We know from the game sample that stadium_id 1 is Mexico City.
  const fallback = {
    "1": "America/Mexico_City"
  };

  return fallback[String(stadiumId)] || "";
}

function formatReykjavikTime(dateObj) {
  if (!dateObj || isNaN(dateObj)) return "Time not published";

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(dateObj) + " Reykjavík";
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

function normalizeGame(raw, stadiumTimezoneMap) {
  const home = raw.home_team_name_en || "Home";
  const away = raw.away_team_name_en || "Away";

  const homeScore = raw.home_score;
  const awayScore = raw.away_score;

  const stadiumId = raw.stadium_id;
  const dateText = raw.local_date || "";
  const dateObject = parseWorldCupDateToUTC(dateText, stadiumId, stadiumTimezoneMap);

  const finished = String(raw.finished).toLowerCase() === "true";
  const status = raw.time_elapsed || "";

  return {
    home,
    away,
    homeScore,
    awayScore,
    stadiumId,
    dateText,
    dateObject,
    finished,
    status,
    referee: "Not published yet"
  };
}

function hasRealScore(value) {
  return (
    value !== undefined &&
    value !== null &&
    String(value).toLowerCase() !== "null" &&
    String(value) !== ""
  );
}

function formatMatch(game) {
  const hasScore = hasRealScore(game.homeScore) && hasRealScore(game.awayScore);

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
    item.time = formatReykjavikTime(game.dateObject);
  }

  return item;
}

async function getAllWorldCupFixtures(stadiumTimezoneMap) {
  console.log("Requesting World Cup games:");
  console.log(API_GAMES_URL);

  const response = await fetch(API_GAMES_URL);

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
    .map(game => normalizeGame(game, stadiumTimezoneMap))
    .filter(game => game.dateObject && !isNaN(game.dateObject));
}

async function main() {
  const stadiumTimezoneMap = await getStadiumTimezoneMap();
  const allFixtures = await getAllWorldCupFixtures(stadiumTimezoneMap);

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
    note: `Referee appointments are not included in this fixture source yet. Kickoff times are shown in Reykjavík time.`

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
