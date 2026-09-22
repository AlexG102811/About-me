const sportsMenuToggle = document.querySelector(".sports-menu-toggle");
const sportsNav = document.querySelector(".sports-nav");
const sportsFilters = document.querySelectorAll(".sport-filter");
const sportCards = document.querySelectorAll(".sport-card");
const sportEmpty = document.querySelector(".sport-empty");
const sportsBrandMark = document.querySelector(".sports-brand-mark");
const sportsBrandImage = document.querySelector("[data-brand-image]");

sportsMenuToggle?.addEventListener("click", () => {
  const isOpen = sportsMenuToggle.classList.toggle("is-open");
  sportsNav.classList.toggle("is-open", isOpen);
  sportsMenuToggle.setAttribute("aria-expanded", String(isOpen));
  sportsMenuToggle.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
});

sportsNav?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    sportsMenuToggle?.classList.remove("is-open");
    sportsNav.classList.remove("is-open");
    sportsMenuToggle?.setAttribute("aria-expanded", "false");
    sportsMenuToggle?.setAttribute("aria-label", "Open navigation");
  });
});

sportsFilters.forEach((filter) => {
  filter.addEventListener("click", () => {
    const selectedFilter = filter.dataset.filter;
    let visibleCards = 0;

    sportsFilters.forEach((item) => {
      const isActive = item === filter;
      item.classList.toggle("is-active", isActive);
      item.setAttribute("aria-pressed", String(isActive));
    });

    sportCards.forEach((card) => {
      const shouldShow = selectedFilter === "all" || card.dataset.sport === selectedFilter;
      card.classList.toggle("is-hidden", !shouldShow);
      if (shouldShow) visibleCards += 1;
    });

    sportEmpty.hidden = visibleCards > 0;
  });
});

const savedProfile = (() => {
  try {
    return JSON.parse(localStorage.getItem("about-me-profile"));
  } catch {
    return null;
  }
})();

const savedBrandImage = (() => {
  try {
    return localStorage.getItem("about-me-brand-image");
  } catch {
    return null;
  }
})();

if (savedBrandImage) {
  sportsBrandImage.src = savedBrandImage;
  sportsBrandImage.hidden = false;
  sportsBrandMark.classList.add("has-image");
}

if (savedProfile?.name) {
  const initials = savedProfile.name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((part) => part[0])
    .join("");
  document.querySelector("[data-brand-initials]").textContent = (initials || "AGE").toUpperCase();
  document.querySelector(".sports-brand-name").textContent = savedProfile.name;
  document.querySelector(".sports-brand").setAttribute("aria-label", `${savedProfile.name} home`);
  const footerLabel = document.querySelector(".sports-footer").firstElementChild;
  const yearElement = document.querySelector("#sports-year");
  footerLabel.replaceChildren(
    document.createTextNode("© "),
    yearElement,
    document.createTextNode(` ${savedProfile.name}`),
  );
}

const baseballTrackerStorageKey = "about-me-baseball-tracker";
const baseballGameFields = [
  "atBats",
  "hits",
  "doubles",
  "triples",
  "homeRuns",
  "walks",
  "rbi",
  "runs",
  "stolenBases",
  "strikeouts",
];
const baseballTrackerDefaults = {
  player: savedProfile?.name || "Alex Gomez Ewert",
  season: String(new Date().getFullYear()),
  games: 0,
  atBats: 0,
  hits: 0,
  doubles: 0,
  triples: 0,
  homeRuns: 0,
  walks: 0,
  rbi: 0,
  runs: 0,
  stolenBases: 0,
  strikeouts: 0,
};

const loadBaseballTracker = () => {
  let savedTracker = {};
  try {
    savedTracker = JSON.parse(localStorage.getItem(baseballTrackerStorageKey)) || {};
  } catch {
    savedTracker = {};
  }

  const tracker = { ...baseballTrackerDefaults, ...savedTracker };
  tracker.player = String(tracker.player || baseballTrackerDefaults.player).trim();
  tracker.season = String(tracker.season || baseballTrackerDefaults.season).trim();
  ["games", ...baseballGameFields].forEach((field) => {
    tracker[field] = Math.max(0, Number.parseInt(tracker[field], 10) || 0);
  });
  return tracker;
};

const saveBaseballTracker = (tracker) => {
  try {
    localStorage.setItem(baseballTrackerStorageKey, JSON.stringify(tracker));
  } catch {
    // Keep the current totals visible even if this browser cannot save them.
  }
};

const trackerProfileForm = document.querySelector("#tracker-profile-form");
const baseballGameForm = document.querySelector("#baseball-game-form");
const trackerProfileStatus = document.querySelector("[data-tracker-profile-status]");
const trackerGameStatus = document.querySelector("[data-tracker-game-status]");
const tracker = loadBaseballTracker();

const formatRate = (value) => value.toFixed(3).replace(/^0\./, ".");

const renderBaseballTracker = () => {
  const singles = Math.max(0, tracker.hits - tracker.doubles - tracker.triples - tracker.homeRuns);
  const average = tracker.atBats ? tracker.hits / tracker.atBats : 0;
  const obpDenominator = tracker.atBats + tracker.walks;
  const obp = obpDenominator ? (tracker.hits + tracker.walks) / obpDenominator : 0;
  const slg = tracker.atBats
    ? (singles + tracker.doubles * 2 + tracker.triples * 3 + tracker.homeRuns * 4) / tracker.atBats
    : 0;
  const calculatedStats = {
    ...tracker,
    average: formatRate(average),
    obp: formatRate(obp),
    slg: formatRate(slg),
    ops: formatRate(obp + slg),
  };

  document.querySelectorAll("[data-tracker-stat]").forEach((element) => {
    element.textContent = calculatedStats[element.dataset.trackerStat];
  });
  document.querySelector("[data-tracker-player]").textContent = tracker.player;
  document.querySelector("[data-tracker-season]").textContent = tracker.season;

  if (trackerProfileForm) {
    trackerProfileForm.elements.player.value = tracker.player;
    trackerProfileForm.elements.season.value = tracker.season;
  }
};

renderBaseballTracker();

trackerProfileForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const profileDetails = Object.fromEntries(new FormData(trackerProfileForm).entries());
  tracker.player = profileDetails.player.trim() || baseballTrackerDefaults.player;
  tracker.season = profileDetails.season.trim() || baseballTrackerDefaults.season;
  saveBaseballTracker(tracker);
  renderBaseballTracker();
  renderPitchingTracker();
  trackerProfileStatus.textContent = "Season details saved.";
});

baseballGameForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const game = Object.fromEntries(new FormData(baseballGameForm).entries());
  const gameStats = Object.fromEntries(
    baseballGameFields.map((field) => [field, Math.max(0, Number.parseInt(game[field], 10) || 0)]),
  );

  if (gameStats.hits > gameStats.atBats) {
    trackerGameStatus.textContent = "Hits cannot be greater than at bats.";
    return;
  }

  const hitTypesTotal = gameStats.doubles + gameStats.triples + gameStats.homeRuns;
  if (hitTypesTotal > gameStats.hits) {
    trackerGameStatus.textContent = "2B, 3B, and HR cannot add up to more than your hits.";
    return;
  }

  tracker.games += 1;
  baseballGameFields.forEach((field) => {
    tracker[field] += gameStats[field];
  });
  saveBaseballTracker(tracker);
  renderBaseballTracker();
  baseballGameForm.reset();
  trackerGameStatus.textContent = "Game added to your season totals.";
});

document.querySelector("[data-tracker-reset]")?.addEventListener("click", () => {
  Object.assign(tracker, baseballTrackerDefaults);
  saveBaseballTracker(tracker);
  renderBaseballTracker();
  renderPitchingTracker();
  trackerProfileStatus.textContent = "Season totals reset.";
  trackerGameStatus.textContent = "";
});

const baseballPitchingStorageKey = "about-me-baseball-pitching-tracker";
const baseballPitchingFields = [
  "outs",
  "hitsAllowed",
  "walksAllowed",
  "strikeouts",
  "earnedRuns",
];
const baseballPitchingDefaults = {
  games: 0,
  outs: 0,
  hitsAllowed: 0,
  walksAllowed: 0,
  strikeouts: 0,
  earnedRuns: 0,
};

const loadBaseballPitching = () => {
  let savedPitching = {};
  try {
    savedPitching = JSON.parse(localStorage.getItem(baseballPitchingStorageKey)) || {};
  } catch {
    savedPitching = {};
  }

  const pitching = { ...baseballPitchingDefaults, ...savedPitching };
  ["games", ...baseballPitchingFields].forEach((field) => {
    pitching[field] = Math.max(0, Number.parseInt(pitching[field], 10) || 0);
  });
  return pitching;
};

const saveBaseballPitching = (pitching) => {
  try {
    localStorage.setItem(baseballPitchingStorageKey, JSON.stringify(pitching));
  } catch {
    // Keep the current pitching line visible even if this browser cannot save it.
  }
};

const baseballPitching = loadBaseballPitching();
const pitchingForm = document.querySelector("#baseball-pitching-form");
const pitchingStatus = document.querySelector("[data-pitching-status]");

const renderPitchingTracker = () => {
  const innings = baseballPitching.outs / 3;
  const era = baseballPitching.outs ? (baseballPitching.earnedRuns * 27) / baseballPitching.outs : 0;
  const whip = baseballPitching.outs
    ? (baseballPitching.hitsAllowed + baseballPitching.walksAllowed) / innings
    : 0;
  const kPer9 = baseballPitching.outs ? (baseballPitching.strikeouts * 27) / baseballPitching.outs : 0;
  const calculatedStats = {
    ...baseballPitching,
    innings: baseballPitching.outs
      ? `${Math.floor(baseballPitching.outs / 3)}.${baseballPitching.outs % 3}`
      : "0.0",
    era: era.toFixed(2),
    whip: whip.toFixed(2),
    kPer9: kPer9.toFixed(2),
  };

  document.querySelectorAll("[data-pitching-stat]").forEach((element) => {
    element.textContent = calculatedStats[element.dataset.pitchingStat];
  });
  document.querySelectorAll("[data-tracker-player]").forEach((element) => {
    element.textContent = tracker.player;
  });
  document.querySelectorAll("[data-tracker-season]").forEach((element) => {
    element.textContent = tracker.season;
  });
};

renderPitchingTracker();

pitchingForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const outing = Object.fromEntries(new FormData(pitchingForm).entries());
  baseballPitching.games += 1;
  baseballPitchingFields.forEach((field) => {
    baseballPitching[field] += Math.max(0, Number.parseInt(outing[field], 10) || 0);
  });
  saveBaseballPitching(baseballPitching);
  renderPitchingTracker();
  pitchingForm.reset();
  pitchingStatus.textContent = "Outing added to your pitching totals.";
});

document.querySelector("[data-pitching-reset]")?.addEventListener("click", () => {
  Object.assign(baseballPitching, baseballPitchingDefaults);
  saveBaseballPitching(baseballPitching);
  renderPitchingTracker();
  pitchingStatus.textContent = "Pitching totals reset.";
});

document.querySelector("#sports-year").textContent = new Date().getFullYear();