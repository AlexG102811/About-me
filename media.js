const mediaMenuToggle = document.querySelector(".sports-menu-toggle");
const mediaNav = document.querySelector(".sports-nav");
const mediaFilters = document.querySelectorAll(".sport-filter");
const mediaCards = document.querySelectorAll(".media-card");
const mediaEmpty = document.querySelector(".sport-empty");
const mediaPhotoSlots = document.querySelectorAll("[data-photo-slot]");
const mediaPhotoStorageKey = "about-me-media-photos";

mediaMenuToggle?.addEventListener("click", () => {
  const isOpen = mediaMenuToggle.classList.toggle("is-open");
  mediaNav.classList.toggle("is-open", isOpen);
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

mediaFilters.forEach((filter) => {
  filter.addEventListener("click", () => {
    const selectedFilter = filter.dataset.filter;
    let visibleCards = 0;

    mediaFilters.forEach((item) => {
      const isActive = item === filter;
      item.classList.toggle("is-active", isActive);
      item.setAttribute("aria-pressed", String(isActive));
    });

    mediaCards.forEach((card) => {
      const shouldShow = selectedFilter === "all" || card.dataset.mediaType === selectedFilter;
      card.classList.toggle("is-hidden", !shouldShow);
      if (shouldShow) visibleCards += 1;
    });

    mediaEmpty.hidden = visibleCards > 0;
  });
});

const renderSavedPhotos = () => {
  let savedPhotos = [];
  try {
    savedPhotos = JSON.parse(localStorage.getItem(mediaPhotoStorageKey)) || [];
  } catch {
    savedPhotos = [];
  }

  mediaPhotoSlots.forEach((slot, index) => {
    const image = slot.querySelector("[data-photo-image]");
    const photo = savedPhotos[index];
    if (photo) {
      image.src = photo;
      image.hidden = false;
      slot.classList.add("has-photo");
    }
  });
};

mediaPhotoSlots.forEach((slot) => {
  const input = slot.querySelector("[data-photo-input]");
  input?.addEventListener("change", () => {
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const image = slot.querySelector("[data-photo-image]");
      const slotIndex = Number(slot.dataset.photoSlot);
      let savedPhotos = [];
      try {
        savedPhotos = JSON.parse(localStorage.getItem(mediaPhotoStorageKey)) || [];
      } catch {
        savedPhotos = [];
      }

      savedPhotos[slotIndex] = reader.result;
      try {
        localStorage.setItem(mediaPhotoStorageKey, JSON.stringify(savedPhotos));
      } catch {
        // Keep the preview visible even if this browser cannot store the image.
      }
      image.src = reader.result;
      image.hidden = false;
      slot.classList.add("has-photo");
    });
    reader.readAsDataURL(file);
  });
});

renderSavedPhotos();

const savedProfile = (() => {
  try {
    return JSON.parse(localStorage.getItem("about-me-profile"));
  } catch {
    return null;
  }
})();

if (savedProfile?.name) {
  document.querySelector(".sports-brand-name").textContent = savedProfile.name;
  document.querySelector(".sports-brand").setAttribute("aria-label", `${savedProfile.name} home`);
  const footerLabel = document.querySelector(".sports-footer").firstElementChild;
  const yearElement = document.querySelector("#media-year");
  footerLabel.replaceChildren(
    document.createTextNode("© "),
    yearElement,
    document.createTextNode(` ${savedProfile.name}`),
  );
}

document.querySelector("#media-year").textContent = new Date().getFullYear();