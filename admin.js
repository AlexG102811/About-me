const adminDefaults = {
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

const adminForm = document.querySelector("#admin-profile-form");
const adminStatus = document.querySelector(".admin-form-status");
const adminBrandMark = document.querySelector(".admin-brand-mark");
const adminBrandImage = document.querySelector("[data-brand-image]");

const loadAdminProfile = () => {
  try {
    const saved = JSON.parse(localStorage.getItem("about-me-profile"));
    const profile = saved ? { ...adminDefaults, ...saved } : { ...adminDefaults };
    if (profile.intro === previousIntroDefault) profile.intro = adminDefaults.intro;
    if (profile.about === previousAboutDefault) profile.about = adminDefaults.about;
    if (profile.availability === previousAvailabilityDefault) profile.availability = adminDefaults.availability;
    if (profile.contactNote === previousContactNoteDefault) profile.contactNote = adminDefaults.contactNote;
    if (profile.email === "hello@example.com") profile.email = "";
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

const profileUpdatedAtKey = "about-me-profile-updated-at";
const profileCompletion = document.querySelector("[data-profile-completion]");
const profileProgress = document.querySelector("[data-profile-progress]");
const lastUpdated = document.querySelector("#admin-last-updated");
const publishedPageCount = document.querySelector("[data-published-page-count]");

const renderProfileMetrics = (profile) => {
  const requiredFields = ["name", "availability", "intro", "about", "contactNote"];
  const completedFields = requiredFields.filter((key) => String(profile[key] || "").trim()).length;
  const percentage = Math.round((completedFields / requiredFields.length) * 100);
  if (profileCompletion) profileCompletion.textContent = percentage;
  if (profileProgress) {
    profileProgress.setAttribute("aria-valuenow", String(percentage));
    profileProgress.querySelector("span").style.width = `${percentage}%`;
  }
  if (publishedPageCount) {
    publishedPageCount.textContent = String(document.querySelectorAll(".admin-page-row").length).padStart(2, "0");
  }

  const savedAt = localStorage.getItem(profileUpdatedAtKey);
  if (lastUpdated) {
    if (!savedAt) {
      lastUpdated.textContent = "Not tracked";
    } else {
      const date = new Date(savedAt);
      lastUpdated.textContent = Number.isNaN(date.getTime())
        ? "Unknown"
        : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
    }
  }
};

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
  renderProfileMetrics(profile);
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
  localStorage.setItem(profileUpdatedAtKey, new Date().toISOString());
  renderAdminProfile(updatedProfile);
  adminStatus.textContent = "Saved to this browser.";
});

adminForm?.querySelector(".admin-reset")?.addEventListener("click", () => {
  localStorage.removeItem("about-me-profile");
  localStorage.setItem(profileUpdatedAtKey, new Date().toISOString());
  renderAdminProfile(adminDefaults);
  adminStatus.textContent = "Defaults restored.";
});

const messagesList = document.querySelector("#admin-messages-list");
const messageCount = document.querySelector("#admin-message-count");
const unreadCount = document.querySelector("#admin-unread-count");
const newCount = document.querySelector("#admin-new-count");
const repliedCount = document.querySelector("#admin-replied-count");
const messageBadge = document.querySelector("#admin-message-badge");
const refreshMessages = document.querySelector("#refresh-messages");
const downloadMessageBackup = document.querySelector("#download-message-backup");
const restoreMessageBackupForm = document.querySelector("#restore-message-backup-form");
const restoreMessageBackupFile = document.querySelector("#restore-message-backup-file");
const restoreMessageBackupButton = document.querySelector("#restore-message-backup");
const inboxRecoveryStatus = document.querySelector("#admin-inbox-recovery-status");
const restoreMessageBackupPreview = document.querySelector("#restore-message-backup-preview");
const restoreMessageBackupSummary = document.querySelector("#restore-message-backup-summary");
const restoreMessageBackupSenders = document.querySelector("#restore-message-backup-senders");
const restoreMessageBackupSenderList = document.querySelector("#restore-message-backup-sender-list");
const reasonChart = document.querySelector("#admin-reason-chart");
const reasonEmpty = document.querySelector("#admin-reason-empty");
const recentActivity = document.querySelector("#admin-recent-activity");
const storageStatus = document.querySelector("#admin-storage-status");
const messageFilters = document.querySelectorAll("[data-message-filter]");
const reasonLabels = ["General", "Baseball", "Gaming", "School", "Other"];
let allMessages = [];
let activeMessageFilter = "all";
let backupPreviewSequence = 0;
let previewedBackupFile = null;
const maxContactBackupBytes = 25 * 1024 * 1024;

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

const sortedMessages = (messages) => [...messages].sort((first, second) => {
  return new Date(second.submittedAt).getTime() - new Date(first.submittedAt).getTime();
});

const renderReasonChart = (messages) => {
  if (!reasonChart) return;
  const counts = new Map(reasonLabels.map((reason) => [reason, 0]));
  messages.forEach((message) => {
    const reason = counts.has(message.reason) ? message.reason : "Other";
    counts.set(reason, counts.get(reason) + 1);
  });
  const maxCount = Math.max(0, ...counts.values());
  reasonChart.replaceChildren();
  if (reasonEmpty) reasonEmpty.hidden = messages.length > 0;

  reasonLabels.forEach((reason) => {
    const count = counts.get(reason);
    const row = document.createElement("div");
    row.className = "admin-reason-row";

    const label = document.createElement("span");
    label.className = "admin-reason-label";
    label.textContent = reason;

    const track = document.createElement("span");
    track.className = "admin-reason-track";
    track.setAttribute("aria-hidden", "true");
    const fill = document.createElement("span");
    fill.className = "admin-reason-fill";
    fill.style.width = maxCount ? `${(count / maxCount) * 100}%` : "0";
    track.append(fill);

    const value = document.createElement("strong");
    value.className = "admin-reason-value";
    value.textContent = String(count);
    row.append(label, track, value);
    reasonChart.append(row);
  });
};

const renderRecentActivity = (messages) => {
  if (!recentActivity) return;
  recentActivity.replaceChildren();
  const latest = sortedMessages(messages).slice(0, 3);
  if (!latest.length) {
    const empty = document.createElement("p");
    empty.className = "admin-messages-empty";
    empty.textContent = "No messages yet. New notes will appear here.";
    recentActivity.append(empty);
    return;
  }

  latest.forEach((message, index) => {
    const row = document.createElement("div");
    row.className = "admin-activity-row";
    const icon = document.createElement("span");
    icon.className = `activity-icon ${index % 2 ? "activity-icon-blue" : "activity-icon-lime"}`;
    icon.textContent = message.status === "replied" ? "✓" : "✉";
    const copy = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = message.name;
    const detail = document.createElement("small");
    detail.textContent = `${message.reason || "General"} · ${message.status === "replied" ? "Replied" : "Needs a reply"}`;
    copy.append(name, detail);
    const date = document.createElement("time");
    date.dateTime = message.submittedAt;
    date.textContent = messageDate(message.submittedAt);
    row.append(icon, copy, date);
    recentActivity.append(row);
  });
};

const updateMessage = async (message, action, payload, button) => {
  button.disabled = true;
  try {
    const response = await fetch(`/api/messages/${encodeURIComponent(message.id)}/${action}`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Unable to update message.");
    Object.assign(message, result.message);
    renderMessages(allMessages);
  } catch (error) {
    button.disabled = false;
    button.textContent = "Try again";
    button.title = error.message || "Unable to update message.";
  }
};

const renderMessages = (messages) => {
  if (!messagesList) return;
  const sorted = sortedMessages(messages);
  const unreadMessages = sorted.filter((message) => !message.read);
  const newMessages = sorted.filter((message) => message.status !== "replied");
  const repliedMessages = sorted.filter((message) => message.status === "replied");

  messageCount.textContent = sorted.length;
  unreadCount.textContent = unreadMessages.length;
  newCount.textContent = newMessages.length;
  repliedCount.textContent = repliedMessages.length;
  messageBadge.textContent = newMessages.length;
  renderReasonChart(sorted);
  renderRecentActivity(sorted);
  messagesList.replaceChildren();

  const visibleMessages = activeMessageFilter === "all"
    ? sorted
    : sorted.filter((message) => message.status === activeMessageFilter);
  if (!visibleMessages.length) {
    const empty = document.createElement("p");
    empty.className = "admin-messages-empty";
    empty.textContent = sorted.length
      ? `No ${activeMessageFilter} messages.`
      : "No messages yet. They will appear here when someone uses your contact form.";
    messagesList.append(empty);
    return;
  }

  visibleMessages.forEach((message) => {
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

    const messageMeta = document.createElement("div");
    messageMeta.className = "admin-message-meta";
    const reason = document.createElement("span");
    reason.className = "admin-message-reason";
    reason.textContent = message.reason || "General";
    const status = document.createElement("span");
    status.className = `admin-message-status${message.status === "replied" ? " is-replied" : ""}`;
    status.textContent = message.status === "replied" ? "Replied" : "Needs a reply";
    messageMeta.append(reason, status);

    const body = document.createElement("p");
    body.className = "admin-message-body";
    body.textContent = message.message;

    const footer = document.createElement("div");
    footer.className = "admin-message-footer";
    const replyLink = document.createElement("a");
    replyLink.className = "admin-message-action";
    replyLink.href = `mailto:${message.email}?subject=${encodeURIComponent(`Re: your note to ${adminDefaults.name}`)}`;
    replyLink.textContent = "Reply by email";
    footer.append(replyLink);

    const readButton = document.createElement("button");
    readButton.className = "admin-message-action";
    readButton.type = "button";
    readButton.textContent = message.read ? "Mark unread" : "Mark read";
    readButton.addEventListener("click", () => {
      updateMessage(message, "read", { read: !message.read }, readButton);
    });
    footer.append(readButton);

    const replyStateButton = document.createElement("button");
    replyStateButton.className = "admin-message-action";
    replyStateButton.type = "button";
    replyStateButton.textContent = message.status === "replied" ? "Mark as new" : "Mark as replied";
    replyStateButton.addEventListener("click", () => {
      updateMessage(
        message,
        "reply",
        { status: message.status === "replied" ? "new" : "replied" },
        replyStateButton,
      );
    });
    footer.append(replyStateButton);

    card.append(header, messageMeta, body, footer);
    messagesList.append(card);
  });
};

messageFilters.forEach((filter) => {
  filter.addEventListener("click", () => {
    activeMessageFilter = filter.dataset.messageFilter;
    messageFilters.forEach((item) => {
      const isActive = item === filter;
      item.classList.toggle("is-active", isActive);
      item.setAttribute("aria-pressed", String(isActive));
    });
    renderMessages(allMessages);
  });
});

const loadMessages = async () => {
  if (!messagesList) return;
  messagesList.replaceChildren();
  const loading = document.createElement("p");
  loading.className = "admin-messages-loading";
  loading.textContent = "Loading messages…";
  messagesList.append(loading);

  try {
    const response = await fetch("/api/messages", { headers: { Accept: "application/json" } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to load messages.");
    allMessages = Array.isArray(data.messages) ? data.messages : [];
    if (storageStatus) storageStatus.textContent = "Persistent inbox connected";
    renderMessages(allMessages);
  } catch (error) {
    if (storageStatus) {
      storageStatus.textContent = error.message?.includes("App Storage")
        ? "App Storage setup needed"
        : "Inbox unavailable";
    }
    messagesList.replaceChildren();
    const message = document.createElement("p");
    message.className = "admin-messages-empty";
    message.textContent = error.message?.includes("App Storage")
      ? "The inbox needs a Replit App Storage bucket. Add App Storage to this repl, then refresh."
      : "Messages could not be loaded. Refresh and try again.";
    messagesList.append(message);
    if (recentActivity) {
      recentActivity.replaceChildren();
      const activityError = document.createElement("p");
      activityError.className = "admin-messages-empty";
      activityError.textContent = "Inbox activity is unavailable.";
      recentActivity.append(activityError);
    }
  }
};

refreshMessages?.addEventListener("click", loadMessages);

const clearBackupPreview = () => {
  previewedBackupFile = null;
  restoreMessageBackupButton.disabled = true;
  if (restoreMessageBackupPreview) restoreMessageBackupPreview.hidden = true;
  if (restoreMessageBackupSummary) restoreMessageBackupSummary.textContent = "";
  if (restoreMessageBackupSenders) restoreMessageBackupSenders.hidden = true;
  restoreMessageBackupSenderList?.replaceChildren();
};

downloadMessageBackup?.addEventListener("click", async () => {
  downloadMessageBackup.disabled = true;
  if (inboxRecoveryStatus) inboxRecoveryStatus.textContent = "Preparing inbox backup…";
  try {
    const response = await fetch("/api/messages/backup", {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Unable to download the inbox backup.");
    }

    const backup = await response.blob();
    const downloadUrl = URL.createObjectURL(backup);
    const link = document.createElement("a");
    const disposition = response.headers.get("Content-Disposition") || "";
    const filename = disposition.match(/filename="([^"]+)"/)?.[1] || "contact-inbox-backup.json";
    link.href = downloadUrl;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    if (inboxRecoveryStatus) inboxRecoveryStatus.textContent = "Inbox backup downloaded.";
  } catch (error) {
    if (inboxRecoveryStatus) inboxRecoveryStatus.textContent = error.message || "Unable to download the inbox backup.";
  } finally {
    downloadMessageBackup.disabled = false;
  }
});

restoreMessageBackupFile?.addEventListener("change", async () => {
  const previewSequence = ++backupPreviewSequence;
  const backupFile = restoreMessageBackupFile.files?.[0];
  clearBackupPreview();
  if (!backupFile) {
    if (inboxRecoveryStatus) inboxRecoveryStatus.textContent = "";
    return;
  }
  if (backupFile.size > maxContactBackupBytes) {
    if (inboxRecoveryStatus) {
      inboxRecoveryStatus.textContent = "This backup is larger than 25 MB and cannot be previewed.";
    }
    return;
  }

  if (inboxRecoveryStatus) inboxRecoveryStatus.textContent = "Checking backup…";
  try {
    const response = await fetch("/api/messages/preview", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: await backupFile.text(),
    });
    const result = await response.json();
    if (previewSequence !== backupPreviewSequence || restoreMessageBackupFile.files?.[0] !== backupFile) return;
    if (!response.ok) throw new Error(result.error || "Unable to preview this backup.");

    previewedBackupFile = backupFile;
    restoreMessageBackupButton.disabled = false;
    if (restoreMessageBackupSummary) {
      const count = Number(result.count) || 0;
      restoreMessageBackupSummary.textContent =
        `Valid backup · ${count} message${count === 1 ? "" : "s"}`;
    }
    if (restoreMessageBackupSenderList && restoreMessageBackupSenders) {
      restoreMessageBackupSenderList.replaceChildren();
      (Array.isArray(result.senders) ? result.senders : []).forEach((sender) => {
        const item = document.createElement("li");
        item.textContent = String(sender);
        restoreMessageBackupSenderList.append(item);
      });
      restoreMessageBackupSenders.hidden = restoreMessageBackupSenderList.childElementCount === 0;
    }
    if (restoreMessageBackupPreview) restoreMessageBackupPreview.hidden = false;
    if (inboxRecoveryStatus) inboxRecoveryStatus.textContent = "Review the backup summary before restoring.";
  } catch (error) {
    if (previewSequence !== backupPreviewSequence) return;
    if (inboxRecoveryStatus) {
      inboxRecoveryStatus.textContent = error.message || "Unable to preview this backup.";
    }
  }
});

restoreMessageBackupForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const backupFile = restoreMessageBackupFile?.files?.[0];
  if (!backupFile) {
    if (inboxRecoveryStatus) inboxRecoveryStatus.textContent = "Choose a JSON backup file first.";
    return;
  }
  if (previewedBackupFile !== backupFile) {
    if (inboxRecoveryStatus) inboxRecoveryStatus.textContent = "Wait for a valid backup preview before restoring.";
    return;
  }
  const previewCount = restoreMessageBackupSummary?.textContent.match(/\d+/)?.[0] || "0";
  if (!window.confirm(
    `This backup contains ${previewCount} message${previewCount === "1" ? "" : "s"}. Restore it and replace every message currently in the inbox?`,
  )) return;

  restoreMessageBackupButton.disabled = true;
  restoreMessageBackupFile.disabled = true;
  if (inboxRecoveryStatus) inboxRecoveryStatus.textContent = "Validating backup…";
  try {
    const response = await fetch("/api/messages/restore", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: await backupFile.text(),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Unable to restore the inbox.");
    if (inboxRecoveryStatus) {
      inboxRecoveryStatus.textContent = `Restored ${result.count} message${result.count === 1 ? "" : "s"}.`;
    }
    restoreMessageBackupForm.reset();
    backupPreviewSequence += 1;
    clearBackupPreview();
    await loadMessages();
  } catch (error) {
    if (inboxRecoveryStatus) inboxRecoveryStatus.textContent = error.message || "Unable to restore the inbox.";
  } finally {
    restoreMessageBackupFile.disabled = false;
    restoreMessageBackupButton.disabled = previewedBackupFile !== restoreMessageBackupFile.files?.[0];
  }
});

loadMessages();