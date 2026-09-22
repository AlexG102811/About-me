const adminDefaults = {
  name: "Alex Gomez Ewert",
  availability: "Available for select projects",
  intro: "I’m a high school student who plays baseball, loves gaming, and enjoys spending time with friends.",
  about: "I care about the details people feel but don’t always notice: the right words, the natural interaction, the moment a product simply makes sense.",
  contactNote: "I’m always open to a thoughtful conversation, a new collaboration, or a great excuse to make something.",
  email: "hello@example.com",
};

const previousIntroDefault = "I’m a designer and builder who turns complex ideas into clear, considered digital experiences.";

const adminForm = document.querySelector("#admin-profile-form");
const adminStatus = document.querySelector(".admin-form-status");
const adminBrandMark = document.querySelector(".admin-brand-mark");
const adminBrandImage = document.querySelector("[data-brand-image]");

const loadAdminProfile = () => {
  try {
    const saved = JSON.parse(localStorage.getItem("about-me-profile"));
    const profile = saved ? { ...adminDefaults, ...saved } : { ...adminDefaults };
    if (profile.intro === previousIntroDefault) profile.intro = adminDefaults.intro;
    return profile;
  } catch {
    return { ...adminDefaults };
  }
};

const initialsFor = (name) => {
  const initials = name.trim().split(/\s+/).filter(Boolean).slice(0, 3).map((part) => part[0]).join("");
  return (initials || "AGE").toUpperCase();
};

const firstNameFor = (name) => name.trim().split(/\s+/).filter(Boolean)[0] || "there";

const renderAdminProfile = (profile) => {
  Object.entries(profile).forEach(([key, value]) => {
    const field = adminForm?.elements.namedItem(key);
    if (field) field.value = value;
  });

  document.querySelectorAll("[data-admin-name]").forEach((element) => {
    element.textContent = firstNameFor(profile.name);
  });
  document.querySelectorAll("[data-admin-footer-name]").forEach((element) => {
    element.textContent = profile.name;
  });
  document.querySelectorAll("[data-admin-preview-name]").forEach((element) => {
    element.textContent = profile.name;
  });
  document.querySelectorAll("[data-admin-preview-intro]").forEach((element) => {
    element.textContent = profile.intro;
  });
  document.querySelectorAll("[data-admin-initials]").forEach((element) => {
    element.textContent = initialsFor(profile.name);
  });
  document.querySelector("[data-brand-initials]").textContent = initialsFor(profile.name);
  document.querySelector(".admin-brand-name").textContent = profile.name;
  document.querySelector(".admin-brand").setAttribute("aria-label", `${profile.name} home`);
  document.title = `Admin dashboard — ${profile.name}`;
};

const savedBrandImage = (() => {
  try {
    return localStorage.getItem("about-me-brand-image");
  } catch {
    return null;
  }
})();

if (savedBrandImage) {
  adminBrandImage.src = savedBrandImage;
  adminBrandImage.hidden = false;
  adminBrandMark.classList.add("has-image");
}

renderAdminProfile(loadAdminProfile());
document.querySelector("#admin-year").textContent = new Date().getFullYear();

adminForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const updatedProfile = Object.fromEntries(new FormData(adminForm).entries());
  localStorage.setItem("about-me-profile", JSON.stringify(updatedProfile));
  renderAdminProfile(updatedProfile);
  adminStatus.textContent = "Saved to this browser.";
});

adminForm?.querySelector(".admin-reset")?.addEventListener("click", () => {
  localStorage.removeItem("about-me-profile");
  renderAdminProfile(adminDefaults);
  adminStatus.textContent = "Defaults restored.";
});