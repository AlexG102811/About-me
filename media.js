const mediaMenuToggle = document.querySelector(".sports-menu-toggle");
const mediaNav = document.querySelector(".sports-nav");

mediaMenuToggle?.addEventListener("click", () => {
  const isOpen = mediaMenuToggle.classList.toggle("is-open");
  mediaNav?.classList.toggle("is-open", isOpen);
  mediaMenuToggle.setAttribute("aria-expanded", String(isOpen));
  mediaMenuToggle.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
});

mediaNav?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    mediaMenuToggle?.classList.remove("is-open");
    mediaNav.classList.remove("is-open");
    mediaMenuToggle?.setAttribute("aria-expanded", "false");
    mediaMenuToggle?.setAttribute("aria-label", "Open navigation");
  });
});

const lightbox = document.querySelector("[data-media-lightbox]");
const lightboxContent = document.querySelector("[data-lightbox-content]");
const lightboxCaption = document.querySelector("[data-lightbox-caption]");

const openMediaLightbox = (type, source, caption) => {
  if (!lightbox || !lightboxContent || !source) return;
  lightboxContent.replaceChildren();

  let media;
  if (type === "video") {
    media = document.createElement("video");
    media.controls = true;
    media.playsInline = true;
  } else {
    media = document.createElement("img");
    media.alt = caption || "Expanded photo";
  }

  media.src = source;
  lightboxContent.append(media);
  if (lightboxCaption) lightboxCaption.textContent = caption || "";
  if (!lightbox.open) lightbox.showModal();
};

document.querySelectorAll("[data-photo-open]").forEach((button) => {
  button.addEventListener("click", () => {
    const image = button.querySelector("img");
    if (image) openMediaLightbox("image", image.currentSrc || image.src, image.alt);
  });
});

document.querySelectorAll("[data-video-expand]").forEach((button) => {
  button.addEventListener("click", () => {
    const slot = button.closest(".media-video-slot");
    const video = slot?.querySelector("video");
    const caption = slot?.querySelector(".media-video-caption")?.textContent?.trim();
    if (video) openMediaLightbox("video", video.currentSrc || video.src, caption || "Video");
  });
});

document.querySelector("[data-lightbox-close]")?.addEventListener("click", () => lightbox?.close());
lightbox?.addEventListener("click", (event) => {
  if (event.target === lightbox) lightbox.close();
});
lightbox?.addEventListener("close", () => {
  const video = lightboxContent?.querySelector("video");
  if (video) {
    video.pause();
    video.removeAttribute("src");
    video.load();
  }
  lightboxContent?.replaceChildren();
});

const savedProfile = (() => {
  try {
    return JSON.parse(localStorage.getItem("about-me-profile"));
  } catch {
    return null;
  }
})();

const mediaBrandMark = document.querySelector(".sports-brand-mark");
const mediaBrandImage = document.querySelector("[data-brand-image]");
let savedBrandImage = null;
try {
  savedBrandImage = localStorage.getItem("about-me-brand-image");
} catch {
  savedBrandImage = null;
}

if (savedBrandImage && mediaBrandImage && mediaBrandMark) {
  mediaBrandImage.src = savedBrandImage;
  mediaBrandImage.hidden = false;
  mediaBrandMark.classList.add("has-image");
}

const profileName = typeof savedProfile?.name === "string" ? savedProfile.name.trim() : "";
if (profileName) {
  const initials = profileName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((part) => part[0])
    .join("");
  const initialsElement = document.querySelector("[data-brand-initials]");
  const brandNameElement = document.querySelector(".sports-brand-name");
  const brandLink = document.querySelector(".sports-brand");
  if (initialsElement) initialsElement.textContent = (initials || "AGE").toUpperCase();
  if (brandNameElement) brandNameElement.textContent = profileName;
  if (brandLink) brandLink.setAttribute("aria-label", `${profileName} home`);

  const footerLabel = document.querySelector(".sports-footer")?.firstElementChild;
  const yearElement = document.querySelector("#media-year");
  if (footerLabel && yearElement) {
    footerLabel.replaceChildren(
      document.createTextNode("© "),
      yearElement,
      document.createTextNode(` ${profileName}`),
    );
  }
}

const yearElement = document.querySelector("#media-year");
if (yearElement) yearElement.textContent = new Date().getFullYear();