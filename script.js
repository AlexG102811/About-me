const menuToggle = document.querySelector(".menu-toggle");
const siteNav = document.querySelector(".site-nav");
const settingsLayer = document.querySelector("#settings-layer");
const settingsPanel = document.querySelector("#settings-panel");
const settingsTrigger = document.querySelector(".settings-trigger");
const profileForm = document.querySelector("#profile-form");
const settingsStatus = document.querySelector(".settings-status");

const profileDefaults = {
  name: "Alex Gomez Ewert",
  availability: "Available for select projects",
  intro: "I’m a designer and builder who turns complex ideas into clear, considered digital experiences.",
  about: "I care about the details people feel but don’t always notice: the right words, the natural interaction, the moment a product simply makes sense.",
  contactNote: "I’m always open to a thoughtful conversation, a new collaboration, or a great excuse to make something.",
  email: "hello@example.com",
};

const getSavedProfile = () => {
  try {
    const saved = JSON.parse(localStorage.getItem("about-me-profile"));
    const profile = saved ? { ...profileDefaults, ...saved } : { ...profileDefaults };
    if (profile.name === "Your Name") profile.name = profileDefaults.name;
    return profile;
  } catch {
    return { ...profileDefaults };
  }
};

const getInitials = (name) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.slice(0, 3).map((part) => part[0]).join("") || "AGE").toUpperCase();
};

const renderProfile = (profile) => {
  document.querySelectorAll('[data-profile="availability"]').forEach((element) => {
    element.textContent = profile.availability;
  });
  document.querySelectorAll('[data-profile="intro"]').forEach((element) => {
    element.textContent = profile.intro;
  });
  document.querySelectorAll('[data-profile="about"]').forEach((element) => {
    element.textContent = profile.about;
  });
  document.querySelectorAll('[data-profile="contactNote"]').forEach((element) => {
    element.textContent = profile.contactNote;
  });
  document.querySelectorAll('[data-profile="footerName"]').forEach((element) => {
    element.textContent = profile.name;
  });
  document.querySelector(".brand-name").textContent = profile.name;
  document.querySelector(".brand").setAttribute("aria-label", `${profile.name} home`);
  document.querySelector(".brand-mark").textContent = getInitials(profile.name);
  document.querySelectorAll("[data-profile-email-link]").forEach((element) => {
    element.href = `mailto:${profile.email.trim()}`;
  });
  document.title = `${profile.name} — Designer & Builder`;

  Object.entries(profile).forEach(([key, value]) => {
    const field = profileForm?.elements.namedItem(key);
    if (field) field.value = value;
  });
};

const profile = getSavedProfile();
renderProfile(profile);

menuToggle?.addEventListener("click", () => {
  const isOpen = menuToggle.classList.toggle("is-open");
  siteNav.classList.toggle("is-open", isOpen);
  menuToggle.setAttribute("aria-expanded", String(isOpen));
  menuToggle.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
});

siteNav?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    menuToggle?.classList.remove("is-open");
    siteNav.classList.remove("is-open");
    menuToggle?.setAttribute("aria-expanded", "false");
    menuToggle?.setAttribute("aria-label", "Open navigation");
  });
});

document.querySelector("#year").textContent = new Date().getFullYear();

const closeSettings = () => {
  settingsLayer.hidden = true;
  settingsLayer.classList.remove("is-open");
  settingsPanel.setAttribute("aria-hidden", "true");
  settingsTrigger.setAttribute("aria-expanded", "false");
  document.body.classList.remove("settings-open");
};

const openSettings = () => {
  settingsLayer.hidden = false;
  requestAnimationFrame(() => settingsLayer.classList.add("is-open"));
  settingsPanel.setAttribute("aria-hidden", "false");
  settingsTrigger.setAttribute("aria-expanded", "true");
  document.body.classList.add("settings-open");
  profileForm.elements.name.focus();
};

settingsTrigger?.addEventListener("click", openSettings);
settingsLayer?.querySelector(".settings-backdrop")?.addEventListener("click", closeSettings);
settingsLayer?.querySelector(".settings-close")?.addEventListener("click", closeSettings);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !settingsLayer.hidden) closeSettings();
});

profileForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const updatedProfile = Object.fromEntries(new FormData(profileForm).entries());
  localStorage.setItem("about-me-profile", JSON.stringify(updatedProfile));
  renderProfile(updatedProfile);
  settingsStatus.textContent = "Saved on this device.";
});

profileForm?.querySelector(".settings-reset")?.addEventListener("click", () => {
  localStorage.removeItem("about-me-profile");
  renderProfile(profileDefaults);
  settingsStatus.textContent = "Defaults restored.";
});