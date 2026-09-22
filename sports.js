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

document.querySelector("#sports-year").textContent = new Date().getFullYear();