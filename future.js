const pageMenuToggle = document.querySelector(".sports-menu-toggle");
const pageNav = document.querySelector(".sports-nav");

pageMenuToggle?.addEventListener("click", () => {
  const isOpen = pageMenuToggle.classList.toggle("is-open");
  pageNav?.classList.toggle("is-open", isOpen);
  pageMenuToggle.setAttribute("aria-expanded", String(isOpen));
  pageMenuToggle.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
});

pageNav?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    pageMenuToggle?.classList.remove("is-open");
    pageNav.classList.remove("is-open");
    pageMenuToggle?.setAttribute("aria-expanded", "false");
    pageMenuToggle?.setAttribute("aria-label", "Open navigation");
  });
});

const pageBrandMark = document.querySelector(".sports-brand-mark");
const pageBrandImage = document.querySelector("[data-brand-image]");
const savedBrandImage = (() => {
  try {
    return localStorage.getItem("about-me-brand-image");
  } catch {
    return null;
  }
})();

if (savedBrandImage && pageBrandImage && pageBrandMark) {
  pageBrandImage.src = savedBrandImage;
  pageBrandImage.hidden = false;
  pageBrandMark.classList.add("has-image");
}

const savedProfile = (() => {
  try {
    return JSON.parse(localStorage.getItem("about-me-profile"));
  } catch {
    return null;
  }
})();

const siteYear = document.querySelector("[data-site-year]");
const footerName = document.querySelector(".sports-footer")?.firstElementChild;
const savedName = typeof savedProfile?.name === "string" ? savedProfile.name.trim() : "";

if (savedName) {
  const initials = savedName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((part) => part[0])
    .join("");
  const initialsElement = document.querySelector("[data-brand-initials]");
  const brandName = document.querySelector(".sports-brand-name");
  const brandLink = document.querySelector(".sports-brand");
  if (initialsElement) initialsElement.textContent = (initials || "AGE").toUpperCase();
  if (brandName) brandName.textContent = savedName;
  brandLink?.setAttribute("aria-label", `${savedName} home`);
  if (footerName && siteYear) {
    footerName.replaceChildren(
      document.createTextNode("© "),
      siteYear,
      document.createTextNode(` ${savedName}`),
    );
  }
}

if (siteYear) siteYear.textContent = new Date().getFullYear();