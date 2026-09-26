const menuToggle = document.querySelector(".menu-toggle");
const siteNav = document.querySelector(".site-nav");
const settingsLayer = document.querySelector("#settings-layer");
const settingsPanel = document.querySelector("#settings-panel");
const settingsTrigger = document.querySelector(".settings-trigger");
const profileForm = document.querySelector("#profile-form");
const settingsStatus = document.querySelector(".settings-status");
const artCard = document.querySelector(".art-card");
const heroImageInput = document.querySelector("#hero-image-input");
const heroImage = document.querySelector("[data-hero-image]");
const heroImagePlaceholder = document.querySelector(".art-card-image-placeholder");
const heroImageStorageKey = "about-me-hero-image";
const heroImageDefault = "attached_assets/image1_1790099258012.jpeg";
const secondaryArtCard = document.querySelector(".art-card-secondary");
const secondaryHeroImageInput = document.querySelector("#hero-image-secondary-input");
const secondaryHeroImage = document.querySelector("[data-hero-secondary-image]");
const secondaryHeroImageStorageKey = "about-me-hero-image-secondary";
const brandMark = document.querySelector(".brand-mark");
const brandInitials = document.querySelector("[data-brand-initials]");
const brandImageInput = document.querySelector("#brand-image-input");
const brandImage = document.querySelector("[data-brand-image]");
const brandImageStorageKey = "about-me-brand-image";
const profileUpdatedAtStorageKey = "about-me-profile-updated-at";

const profileDefaults = {
  name: "Alex Gomez Ewert",
  availability: "High school student · always learning",
  intro: "I’m a high school student who plays baseball, loves gaming, and enjoys spending time with friends.",
  about: "I enjoy baseball, gaming, and spending time with friends. I’m still figuring out what I want to do next.",
  contactNote: "Want to talk baseball, games, or something else? Send me a note.",
  email: "",
  instagram: "",
  youtube: "",
  tiktok: "",
  featuredPostUrl: "",
};

const previousIntroDefault = "I’m a designer and builder who turns complex ideas into clear, considered digital experiences.";
const previousAboutDefault = "I care about the details people feel but don’t always notice: the right words, the natural interaction, the moment a product simply makes sense.";
const previousAvailabilityDefault = "Available for select projects";
const previousContactNoteDefault = "I’m always open to a thoughtful conversation, a new collaboration, or a great excuse to make something.";

const getSavedProfile = () => {
  try {
    const saved = JSON.parse(localStorage.getItem("about-me-profile"));
    const profile = saved ? { ...profileDefaults, ...saved } : { ...profileDefaults };
    if (profile.name === "Your Name") profile.name = profileDefaults.name;
    if (profile.intro === previousIntroDefault) profile.intro = profileDefaults.intro;
    if (profile.about === previousAboutDefault) profile.about = profileDefaults.about;
    if (profile.availability === previousAvailabilityDefault) profile.availability = profileDefaults.availability;
    if (profile.contactNote === previousContactNoteDefault) profile.contactNote = profileDefaults.contactNote;
    if (profile.email === "hello@example.com") profile.email = "";
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
  document.querySelectorAll('[data-profile="name"]').forEach((element) => {
    element.textContent = profile.name;
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
  document.querySelector(".brand-name").setAttribute("aria-label", `${profile.name} home`);
  brandInitials.textContent = getInitials(profile.name);
  document.querySelectorAll("[data-profile-email-link]").forEach((element) => {
    const email = profile.email?.trim() || "";
    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !email.endsWith("@example.com");
    element.hidden = !isValidEmail;
    if (isValidEmail) {
      element.href = `mailto:${email}`;
      element.textContent = `Email ${profile.name} · ${email} ↗`;
    } else {
      element.removeAttribute("href");
      element.textContent = "";
    }
  });
  renderSocialLinks(profile);
  renderFeaturedPost(profile.featuredPostUrl);
  document.title = `${profile.name} — About me`;

  Object.entries(profile).forEach(([key, value]) => {
    const field = profileForm?.elements.namedItem(key);
    if (field) field.value = value;
  });
};

const trustedProfileUrl = (value, allowedHosts) => {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !allowedHosts.includes(url.hostname.toLowerCase())) return null;
    return url;
  } catch {
    return null;
  }
};

const renderSocialLinks = (profile) => {
  const container = document.querySelector("[data-social-links]");
  if (!container) return;
  const platforms = [
    { key: "instagram", label: "Instagram", hosts: ["instagram.com", "www.instagram.com"] },
    { key: "youtube", label: "YouTube", hosts: ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"] },
    { key: "tiktok", label: "TikTok", hosts: ["tiktok.com", "www.tiktok.com"] },
  ];
  const links = platforms.flatMap((platform) => {
    const url = trustedProfileUrl(profile[platform.key] || "", platform.hosts);
    if (!url) return [];
    const link = document.createElement("a");
    link.href = url.href;
    link.target = "_blank";
    link.rel = "me noopener noreferrer";
    link.textContent = `${platform.label} ↗`;
    return [link];
  });
  container.replaceChildren(...links);
  container.hidden = links.length === 0;
};

const featuredEmbed = (value) => {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const hostname = url.hostname.toLowerCase();

  if (["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"].includes(hostname)) {
    const videoId = hostname === "youtu.be"
      ? url.pathname.split("/").filter(Boolean)[0]
      : url.searchParams.get("v") || url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1];
    return videoId && /^[\w-]{11}$/.test(videoId)
      ? { title: "Featured YouTube video", url: url.href, embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}` }
      : null;
  }

  if (["instagram.com", "www.instagram.com"].includes(hostname)) {
    const match = url.pathname.match(/^\/(?:p|reel|tv)\/([\w-]+)/);
    return match
      ? { title: "Featured Instagram post", url: url.href, embedUrl: `https://www.instagram.com/p/${match[1]}/embed/` }
      : null;
  }

  if (["tiktok.com", "www.tiktok.com"].includes(hostname)) {
    const videoId = url.pathname.match(/\/video\/(\d+)/)?.[1];
    return videoId
      ? { title: "Featured TikTok video", url: url.href, embedUrl: `https://www.tiktok.com/embed/v2/${videoId}` }
      : null;
  }
  return null;
};

const renderFeaturedPost = (value) => {
  const container = document.querySelector("[data-featured-post]");
  if (!container) return;
  let url;
  try {
    url = new URL(value || "");
  } catch {
    container.replaceChildren();
    container.hidden = true;
    return;
  }
  if (url.protocol !== "https:") {
    container.replaceChildren();
    container.hidden = true;
    return;
  }

  const featured = featuredEmbed(url.href);
  const heading = document.createElement("p");
  heading.className = "home-featured-post-title";
  heading.textContent = "A post I wanted to share";
  const content = document.createElement("div");
  content.className = "home-featured-post-content";
  if (featured) {
    const frame = document.createElement("iframe");
    frame.src = featured.embedUrl;
    frame.title = featured.title;
    frame.loading = "lazy";
    frame.referrerPolicy = "no-referrer";
    frame.allow = "accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share";
    frame.allowFullscreen = true;
    frame.sandbox = "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox";
    content.append(frame);
  }
  const link = document.createElement("a");
  link.href = url.href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "Open post ↗";
  content.append(link);
  container.replaceChildren(heading, content);
  container.hidden = false;
};

const profile = getSavedProfile();
renderProfile(profile);

const renderBrandImage = (imageData) => {
  if (imageData) {
    brandImage.src = imageData;
    brandImage.hidden = false;
    brandMark.classList.add("has-image");
    return;
  }

  brandImage.removeAttribute("src");
  brandImage.hidden = true;
  brandMark.classList.remove("has-image");
};

let savedBrandImage = null;
try {
  savedBrandImage = localStorage.getItem(brandImageStorageKey);
} catch {
  savedBrandImage = null;
}
renderBrandImage(savedBrandImage);

brandMark?.addEventListener("click", () => {
  brandImageInput?.click();
});

brandImageInput?.addEventListener("change", () => {
  const file = brandImageInput.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      localStorage.setItem(brandImageStorageKey, reader.result);
    } catch {
      // Keep the preview visible even if this browser cannot store the image.
    }
    renderBrandImage(reader.result);
    brandImageInput.value = "";
  });
  reader.readAsDataURL(file);
});

const renderHeroImage = (imageData) => {
  if (imageData) {
    heroImage.src = imageData;
    heroImage.hidden = false;
    artCard.classList.add("has-image");
    return;
  }

  heroImage.removeAttribute("src");
  heroImage.hidden = true;
  artCard.classList.remove("has-image");
  heroImagePlaceholder.hidden = false;
};

let savedHeroImage = null;
try {
  savedHeroImage = localStorage.getItem(heroImageStorageKey) || heroImageDefault;
} catch {
  savedHeroImage = heroImageDefault;
}
renderHeroImage(savedHeroImage);

heroImageInput?.addEventListener("change", () => {
  const file = heroImageInput.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      localStorage.setItem(heroImageStorageKey, reader.result);
    } catch {
      // Keep the preview visible even if this browser cannot store the image.
    }
    renderHeroImage(reader.result);
    heroImageInput.value = "";
  });
  reader.readAsDataURL(file);
});

const renderSecondaryHeroImage = (imageData) => {
  if (imageData) {
    secondaryHeroImage.src = imageData;
    secondaryHeroImage.hidden = false;
    secondaryArtCard.classList.add("has-image");
    return;
  }

  secondaryHeroImage.removeAttribute("src");
  secondaryHeroImage.hidden = true;
  secondaryArtCard.classList.remove("has-image");
};

let savedSecondaryHeroImage = null;
try {
  savedSecondaryHeroImage = localStorage.getItem(secondaryHeroImageStorageKey);
} catch {
  savedSecondaryHeroImage = null;
}
renderSecondaryHeroImage(savedSecondaryHeroImage);

secondaryHeroImageInput?.addEventListener("change", () => {
  const file = secondaryHeroImageInput.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      localStorage.setItem(secondaryHeroImageStorageKey, reader.result);
    } catch {
      // Keep the preview visible even if this browser cannot store the image.
    }
    renderSecondaryHeroImage(reader.result);
    secondaryHeroImageInput.value = "";
  });
  reader.readAsDataURL(file);
});

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
  localStorage.setItem(profileUpdatedAtStorageKey, new Date().toISOString());
  renderProfile(updatedProfile);
  settingsStatus.textContent = "Saved on this device.";
});

profileForm?.querySelector(".settings-reset")?.addEventListener("click", () => {
  localStorage.removeItem("about-me-profile");
  localStorage.setItem(profileUpdatedAtStorageKey, new Date().toISOString());
  renderProfile(profileDefaults);
  settingsStatus.textContent = "Defaults restored.";
});

const contactForm = document.querySelector("#contact-form");
const contactStatus = document.querySelector("#contact-form-status");
const contactSubmit = contactForm?.querySelector(".contact-submit");
const contactResult = new URLSearchParams(window.location.search).get("message");

if (contactResult === "sent") {
  contactStatus.textContent = "Thanks — your message was sent.";
}

contactForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  contactStatus.textContent = "Sending…";
  contactSubmit.disabled = true;

  try {
    const response = await fetch(contactForm.action, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: new URLSearchParams(new FormData(contactForm)),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Message could not be sent.");
    contactForm.reset();
    contactStatus.textContent = result.message;
  } catch (error) {
    contactStatus.textContent = error.message || "Message could not be sent. Please try again.";
  } finally {
    contactSubmit.disabled = false;
  }
});