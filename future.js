const futureMenuToggle = document.querySelector(".sports-menu-toggle");
const futureNav = document.querySelector(".sports-nav");

futureMenuToggle?.addEventListener("click", () => {
  const isOpen = futureMenuToggle.classList.toggle("is-open");
  futureNav.classList.toggle("is-open", isOpen);
  futureMenuToggle.setAttribute("aria-expanded", String(isOpen));
  futureMenuToggle.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
});

futureNav?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    futureMenuToggle?.classList.remove("is-open");
    futureNav.classList.remove("is-open");
    futureMenuToggle?.setAttribute("aria-expanded", "false");
    futureMenuToggle?.setAttribute("aria-label", "Open navigation");
  });
});

const futureBrandMark = document.querySelector(".sports-brand-mark");
const futureBrandImage = document.querySelector("[data-brand-image]");
const savedFutureBrandImage = (() => {
  try {
    return localStorage.getItem("about-me-brand-image");
  } catch {
    return null;
  }
})();

if (savedFutureBrandImage) {
  futureBrandImage.src = savedFutureBrandImage;
  futureBrandImage.hidden = false;
  futureBrandMark.classList.add("has-image");
}

const savedFutureProfile = (() => {
  try {
    return JSON.parse(localStorage.getItem("about-me-profile"));
  } catch {
    return null;
  }
})();

if (savedFutureProfile?.name) {
  const initials = savedFutureProfile.name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((part) => part[0])
    .join("");
  document.querySelector("[data-brand-initials]").textContent = (initials || "AGE").toUpperCase();
  document.querySelector(".sports-brand-name").textContent = savedFutureProfile.name;
  document.querySelector(".sports-brand").setAttribute("aria-label", `${savedFutureProfile.name} home`);
  const footerLabel = document.querySelector(".sports-footer").firstElementChild;
  const yearElement = document.querySelector("#future-year");
  footerLabel.replaceChildren(
    document.createTextNode("© "),
    yearElement,
    document.createTextNode(` ${savedFutureProfile.name}`),
  );
}

document.querySelector("#future-year").textContent = new Date().getFullYear();