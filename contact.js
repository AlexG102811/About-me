const menuToggle = document.querySelector(".menu-toggle");
const siteNav = document.querySelector("#site-nav");
const contactForm = document.querySelector("#contact-form");
const contactStatus = document.querySelector("#contact-form-status");
const contactSubmit = contactForm?.querySelector(".contact-page-submit");
const year = document.querySelector("#year");

if (year) year.textContent = new Date().getFullYear();

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