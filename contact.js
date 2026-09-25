const menuToggle = document.querySelector(".menu-toggle");
const siteNav = document.querySelector("#site-nav");
const contactForm = document.querySelector("#contact-form");
const contactStatus = document.querySelector("#contact-form-status");
const contactSubmit = contactForm?.querySelector(".contact-page-submit");
const year = document.querySelector("#year");

if (year) year.textContent = new Date().getFullYear();

const defaultContactProfile = { name: "Alex Gomez Ewert", email: "hello@example.com" };
let contactProfile = defaultContactProfile;
try {
  contactProfile = { ...defaultContactProfile, ...JSON.parse(localStorage.getItem("about-me-profile")) };
} catch {
  contactProfile = defaultContactProfile;
}

const contactName = contactProfile.name?.trim();
if (contactName && contactName !== "Your Name") {
  document.querySelectorAll("[data-contact-name]").forEach((element) => {
    element.textContent = contactName;
  });
  const brandMark = document.querySelector(".brand-mark");
  brandMark?.setAttribute("aria-label", `${contactName} home`);
  document.title = `Contact — ${contactName}`;
  const initials = contactName.split(/\s+/).filter(Boolean).slice(0, 3).map((part) => part[0]).join("").toUpperCase();
  const initialsElement = document.querySelector("[data-contact-initials]");
  if (initialsElement) initialsElement.textContent = initials || "AGE";
}

const contactEmail = contactProfile.email?.trim();
const emailLink = document.querySelector("[data-contact-email-link]");
const emailText = document.querySelector("[data-contact-email]");
if (contactEmail && contactEmail !== "hello@example.com" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
  emailLink.href = `mailto:${contactEmail}`;
  emailText.textContent = contactEmail;
  emailLink.hidden = false;
}

menuToggle?.addEventListener("click", () => {
  const isOpen = menuToggle.classList.toggle("is-open");
  siteNav?.classList.toggle("is-open", isOpen);
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

const messageResult = new URLSearchParams(window.location.search).get("message");
if (messageResult === "sent" && contactStatus) {
  contactStatus.textContent = "Thanks for reaching out. Your message was sent.";
} else if (messageResult === "error" && contactStatus) {
  contactStatus.textContent = "That message did not go through. Please try again.";
  contactStatus.dataset.state = "error";
}

contactForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!contactForm.reportValidity()) return;

  contactStatus.textContent = "Sending your note…";
  delete contactStatus.dataset.state;
  contactSubmit.disabled = true;
  contactSubmit.querySelector("span:first-child").textContent = "Sending";

  try {
    const response = await fetch(contactForm.action, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: new URLSearchParams(new FormData(contactForm)),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Your message could not be sent.");
    contactForm.reset();
    contactStatus.textContent = result.message || "Thanks for reaching out.";
  } catch (error) {
    contactStatus.textContent = error.message || "Your message could not be sent. Please try again.";
    contactStatus.dataset.state = "error";
  } finally {
    contactSubmit.disabled = false;
    contactSubmit.querySelector("span:first-child").textContent = "Send message";
  }
});