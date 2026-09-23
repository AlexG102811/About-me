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

const messagesList = document.querySelector("#admin-messages-list");
const messageCount = document.querySelector("#admin-message-count");
const unreadCount = document.querySelector("#admin-unread-count");
const messageBadge = document.querySelector("#admin-message-badge");
const refreshMessages = document.querySelector("#refresh-messages");

const messageInitials = (name) => {
  const initials = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("");
  return (initials || "?").toUpperCase();
};

const messageDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

const renderMessages = (messages) => {
  if (!messagesList) return;
  const sortedMessages = [...messages].sort((first, second) => {
    return new Date(second.submittedAt).getTime() - new Date(first.submittedAt).getTime();
  });
  const unreadMessages = sortedMessages.filter((message) => !message.read);

  messageCount.textContent = sortedMessages.length;
  unreadCount.textContent = unreadMessages.length;
  messageBadge.textContent = unreadMessages.length;
  messagesList.replaceChildren();

  if (!sortedMessages.length) {
    const empty = document.createElement("p");
    empty.className = "admin-messages-empty";
    empty.textContent = "No messages yet. They will appear here when someone uses your contact form.";
    messagesList.append(empty);
    return;
  }

  sortedMessages.forEach((message) => {
    const card = document.createElement("article");
    card.className = `admin-message-card${message.read ? "" : " is-unread"}`;

    const header = document.createElement("div");
    header.className = "admin-message-header";

    const sender = document.createElement("div");
    sender.className = "admin-message-sender";

    const avatar = document.createElement("span");
    avatar.className = "admin-message-avatar";
    avatar.textContent = messageInitials(message.name);

    const senderDetails = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = message.name;
    const email = document.createElement("a");
    email.href = `mailto:${message.email}`;
    email.textContent = message.email;
    senderDetails.append(name, email);
    sender.append(avatar, senderDetails);

    const date = document.createElement("time");
    date.className = "admin-message-date";
    date.dateTime = message.submittedAt;
    date.textContent = messageDate(message.submittedAt);
    header.append(sender, date);

    const body = document.createElement("p");
    body.className = "admin-message-body";
    body.textContent = message.message;

    const footer = document.createElement("div");
    footer.className = "admin-message-footer";
    if (!message.read) {
      const unread = document.createElement("span");
      unread.className = "admin-message-unread";
      unread.textContent = "Unread";
      footer.append(unread);

      const markRead = document.createElement("button");
      markRead.className = "admin-message-action";
      markRead.type = "button";
      markRead.textContent = "Mark as read";
      markRead.addEventListener("click", async () => {
        markRead.disabled = true;
        try {
          const response = await fetch(`/api/messages/${encodeURIComponent(message.id)}/read`, { method: "POST" });
          if (!response.ok) throw new Error("Unable to update message.");
          message.read = true;
          renderMessages(messages);
        } catch {
          markRead.disabled = false;
          markRead.textContent = "Try again";
        }
      });
      footer.append(markRead);
    }

    card.append(header, body, footer);
    messagesList.append(card);
  });
};

const loadMessages = async () => {
  if (!messagesList) return;
  messagesList.replaceChildren();
  const loading = document.createElement("p");
  loading.className = "admin-messages-loading";
  loading.textContent = "Loading messages…";
  messagesList.append(loading);

  try {
    const response = await fetch("/api/messages", { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Unable to load messages.");
    const data = await response.json();
    renderMessages(Array.isArray(data.messages) ? data.messages : []);
  } catch {
    messagesList.replaceChildren();
    const error = document.createElement("p");
    error.className = "admin-messages-empty";
    error.textContent = "Messages could not be loaded. Refresh and try again.";
    messagesList.append(error);
  }
};

refreshMessages?.addEventListener("click", loadMessages);
loadMessages();