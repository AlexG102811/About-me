const mediaMenuToggle = document.querySelector(".sports-menu-toggle");
const mediaNav = document.querySelector(".sports-nav");
const mediaFilters = document.querySelectorAll(".sport-filter");
const mediaCards = document.querySelectorAll(".media-card");
const mediaEmpty = document.querySelector(".sport-empty");
const mediaPhotoSlots = document.querySelectorAll("[data-photo-slot]");
const mediaVideoSlots = document.querySelectorAll("[data-video-slot]");
const mediaVideoStatus = document.querySelector("[data-video-status]");
const mediaPhotoStorageKey = "about-me-media-photos";
const mediaPhotoCaptionStorageKey = "about-me-media-photo-captions";
const mediaVideoStorageKey = "about-me-media-videos";
const mediaPhotoDefaults = ["attached_assets/image1_1790099258012.jpeg"];
const mediaVideoDefaults = [
  "attached_assets/Video_(1)_1790099620861.mov",
  "attached_assets/Video_1790099821395.mov",
];
const mediaVideoMimeTypes = {
  avi: "video/x-msvideo",
  m4v: "video/mp4",
  mkv: "video/x-matroska",
  mov: "video/quicktime",
  mp4: "video/mp4",
  ogg: "video/ogg",
  ogv: "video/ogg",
  "3gp": "video/3gpp",
  webm: "video/webm",
};
const mediaVideoDatabaseName = "personal-media-videos";
const mediaVideoStoreName = "videos";
const mediaPhotoDatabaseName = "personal-media-photos";
const mediaPhotoStoreName = "photos";
const mediaVideoObjectUrls = new Map();
const mediaPhotoObjectUrls = new Map();
let mediaVideoDatabasePromise;
let mediaPhotoDatabasePromise;

const openMediaPhotoDatabase = () => {
  if (!window.indexedDB) return Promise.reject(new Error("Browser photo storage is unavailable."));
  if (!mediaPhotoDatabasePromise) {
    mediaPhotoDatabasePromise = new Promise((resolve, reject) => {
      const request = window.indexedDB.open(mediaPhotoDatabaseName, 1);
      request.addEventListener("upgradeneeded", () => {
        if (!request.result.objectStoreNames.contains(mediaPhotoStoreName)) {
          request.result.createObjectStore(mediaPhotoStoreName);
        }
      });
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error || new Error("Couldn't open browser photo storage.")), { once: true });
      request.addEventListener("blocked", () => reject(new Error("Browser photo storage is blocked.")), { once: true });
    });
  }
  return mediaPhotoDatabasePromise;
};

const getStoredMediaPhoto = async (slotIndex) => {
  const database = await openMediaPhotoDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(mediaPhotoStoreName, "readonly")
      .objectStore(mediaPhotoStoreName)
      .get(slotIndex);
    request.addEventListener("success", () => resolve(request.result || null), { once: true });
    request.addEventListener("error", () => reject(request.error || new Error("Couldn't read the saved photo.")), { once: true });
  });
};

const saveStoredMediaPhoto = async (slotIndex, file) => {
  const database = await openMediaPhotoDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(mediaPhotoStoreName, "readwrite");
    transaction.objectStore(mediaPhotoStoreName).put(file, slotIndex);
    transaction.addEventListener("complete", resolve, { once: true });
    transaction.addEventListener("error", () => reject(transaction.error || new Error("Couldn't save the photo.")), { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error || new Error("Photo storage was interrupted.")), { once: true });
  });
};

const createMediaPhotoObjectUrl = (slotIndex, blob) => {
  const previousUrl = mediaPhotoObjectUrls.get(slotIndex);
  if (previousUrl) URL.revokeObjectURL(previousUrl);
  const objectUrl = URL.createObjectURL(blob);
  mediaPhotoObjectUrls.set(slotIndex, objectUrl);
  return objectUrl;
};

const mediaPhotoDataUrlToBlob = (dataUrl) => {
  const [metadata, encodedData] = dataUrl.split(",", 2);
  if (!metadata || !encodedData || !metadata.includes(";base64")) {
    throw new Error("The saved photo data is invalid.");
  }
  const mimeType = metadata.match(/^data:([^;]+)/)?.[1] || "application/octet-stream";
  const binary = window.atob(encodedData);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
};

const openMediaVideoDatabase = () => {
  if (!window.indexedDB) return Promise.reject(new Error("Browser video storage is unavailable."));
  if (!mediaVideoDatabasePromise) {
    mediaVideoDatabasePromise = new Promise((resolve, reject) => {
      const request = window.indexedDB.open(mediaVideoDatabaseName, 1);
      request.addEventListener("upgradeneeded", () => {
        if (!request.result.objectStoreNames.contains(mediaVideoStoreName)) {
          request.result.createObjectStore(mediaVideoStoreName);
        }
      });
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error || new Error("Couldn't open browser video storage.")), { once: true });
      request.addEventListener("blocked", () => reject(new Error("Browser video storage is blocked.")), { once: true });
    });
  }
  return mediaVideoDatabasePromise;
};

const getStoredMediaVideo = async (slotIndex) => {
  const database = await openMediaVideoDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(mediaVideoStoreName, "readonly")
      .objectStore(mediaVideoStoreName)
      .get(slotIndex);
    request.addEventListener("success", () => resolve(request.result || null), { once: true });
    request.addEventListener("error", () => reject(request.error || new Error("Couldn't read the saved video.")), { once: true });
  });
};

const saveStoredMediaVideo = async (slotIndex, file) => {
  const database = await openMediaVideoDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(mediaVideoStoreName, "readwrite");
    transaction.objectStore(mediaVideoStoreName).put(file, slotIndex);
    transaction.addEventListener("complete", resolve, { once: true });
    transaction.addEventListener("error", () => reject(transaction.error || new Error("Couldn't save the video.")), { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error || new Error("Video storage was interrupted.")), { once: true });
  });
};

const createMediaVideoObjectUrl = (slotIndex, blob) => {
  const previousUrl = mediaVideoObjectUrls.get(slotIndex);
  if (previousUrl) URL.revokeObjectURL(previousUrl);
  const objectUrl = URL.createObjectURL(blob);
  mediaVideoObjectUrls.set(slotIndex, objectUrl);
  return objectUrl;
};

const mediaVideoDataUrlToBlob = (dataUrl) => {
  const [metadata, encodedData] = dataUrl.split(",", 2);
  if (!metadata || !encodedData || !metadata.includes(";base64")) {
    throw new Error("The saved video data is invalid.");
  }
  const mimeType = metadata.match(/^data:([^;]+)/)?.[1] || "application/octet-stream";
  const binary = window.atob(encodedData);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
};

const mediaVideoBlobToDataUrl = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.addEventListener("load", () => resolve(reader.result), { once: true });
  reader.addEventListener("error", () => reject(reader.error || new Error("Couldn't prepare the video for storage.")), { once: true });
  reader.readAsDataURL(blob);
});

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
      const shouldShow = !card.hidden && (selectedFilter === "all" || card.dataset.mediaType === selectedFilter);
      card.classList.toggle("is-hidden", !shouldShow);
      if (shouldShow) visibleCards += 1;
    });

    mediaEmpty.hidden = visibleCards > 0;
  });
});

const renderSavedPhotos = async () => {
  let savedPhotos = [];
  let savedCaptions = [];
  try {
    savedPhotos = JSON.parse(localStorage.getItem(mediaPhotoStorageKey)) || [];
  } catch {
    savedPhotos = [];
  }
  try {
    savedCaptions = JSON.parse(localStorage.getItem(mediaPhotoCaptionStorageKey)) || [];
  } catch {
    savedCaptions = [];
  }

  await Promise.all([...mediaPhotoSlots].map(async (slot, index) => {
    const image = slot.querySelector("[data-photo-image]");
    const caption = slot.querySelector("[data-photo-caption]");
    const openButton = slot.querySelector("[data-photo-open]");
    if (caption) {
      caption.value = savedCaptions[index] || (index === 0 ? "Baseball mural" : "");
      slot.dataset.caption = caption.value;
    }

    let photoSource = null;
    try {
      const storedPhoto = await getStoredMediaPhoto(index);
      if (storedPhoto) photoSource = createMediaPhotoObjectUrl(index, storedPhoto);
    } catch {
      if (mediaVideoStatus) mediaVideoStatus.textContent = "Saved photo storage could not be read. Check this browser’s storage settings.";
    }

    const legacyPhoto = savedPhotos[index];
    if (!photoSource && legacyPhoto) {
      if (legacyPhoto.startsWith("data:")) {
        try {
          photoSource = createMediaPhotoObjectUrl(index, mediaPhotoDataUrlToBlob(legacyPhoto));
          await saveStoredMediaPhoto(index, mediaPhotoDataUrlToBlob(legacyPhoto));
        } catch {
          photoSource = legacyPhoto;
        }
      } else {
        photoSource = legacyPhoto;
      }
    }
    if (!photoSource) photoSource = mediaPhotoDefaults[index] || null;

    if (photoSource) {
      image.src = photoSource;
      image.hidden = false;
      slot.classList.add("has-photo");
      if (openButton) openButton.disabled = false;
    }
    if (caption) image.alt = caption.value.trim() || `Photo ${String(index + 1).padStart(2, "0")}`;
  }));
};

const renderSavedVideos = async () => {
  let savedVideos = [];
  try {
    savedVideos = JSON.parse(localStorage.getItem(mediaVideoStorageKey)) || [];
  } catch {
    savedVideos = [];
  }

  await Promise.all([...mediaVideoSlots].map(async (slot, index) => {
    const video = slot.querySelector("[data-video-preview]");
    let savedBlob = null;
    let storageError = false;
    try {
      savedBlob = await getStoredMediaVideo(index);
    } catch {
      storageError = true;
    }

    let videoSource = savedBlob
      ? createMediaVideoObjectUrl(index, savedBlob)
      : savedVideos[index] || mediaVideoDefaults[index];

    if (videoSource?.startsWith("data:")) {
      try {
        videoSource = createMediaVideoObjectUrl(index, mediaVideoDataUrlToBlob(videoSource));
      } catch {
        videoSource = mediaVideoDefaults[index];
        if (index === 1 && mediaVideoStatus) {
          mediaVideoStatus.textContent = "The saved Video 02 could not be loaded. Showing its original clip.";
        }
      }
    }

    if (videoSource) {
      video.src = videoSource;
      video.hidden = false;
      video.load();
      slot.classList.add("has-video");
      const expandButton = slot.querySelector("[data-video-expand]");
      if (expandButton) expandButton.disabled = false;
    }
    if (storageError && index === 1 && mediaVideoStatus) {
      mediaVideoStatus.textContent = "Could not read saved video storage. Showing the last available clip.";
    }
  }));
};

const renderPhotoCaption = (slot, index, value) => {
  const caption = value.trim().slice(0, 120);
  const image = slot.querySelector("[data-photo-image]");
  const input = slot.querySelector("[data-photo-caption]");
  slot.dataset.caption = caption;
  if (input && input.value !== caption) input.value = caption;
  if (image) image.alt = caption || `Photo ${String(index + 1).padStart(2, "0")}`;
};

mediaPhotoSlots.forEach((slot) => {
  const input = slot.querySelector("[data-photo-input]");
  const captionInput = slot.querySelector("[data-photo-caption]");
  const openButton = slot.querySelector("[data-photo-open]");
  const slotIndex = Number(slot.dataset.photoSlot);

  captionInput?.addEventListener("input", () => {
    renderPhotoCaption(slot, slotIndex, captionInput.value);
    let savedCaptions = [];
    try {
      savedCaptions = JSON.parse(localStorage.getItem(mediaPhotoCaptionStorageKey)) || [];
      savedCaptions[slotIndex] = captionInput.value.trim().slice(0, 120);
      localStorage.setItem(mediaPhotoCaptionStorageKey, JSON.stringify(savedCaptions));
    } catch {
      if (mediaVideoStatus) mediaVideoStatus.textContent = "The caption is visible, but this browser could not save it.";
    }
  });

  openButton?.addEventListener("click", () => {
    const image = slot.querySelector("[data-photo-image]");
    if (!image?.src || image.hidden) return;
    openMediaLightbox("image", image.src, slot.dataset.caption || image.alt);
  });

  input?.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 15 * 1024 * 1024) {
      if (mediaVideoStatus) mediaVideoStatus.textContent = "Choose a PNG, JPEG, or WebP photo under 15 MB.";
      input.value = "";
      return;
    }

    try {
      await saveStoredMediaPhoto(slotIndex, file);
      const image = slot.querySelector("[data-photo-image]");
      image.src = createMediaPhotoObjectUrl(slotIndex, file);
      image.hidden = false;
      slot.classList.add("has-photo");
      if (openButton) openButton.disabled = false;
      if (mediaVideoStatus) mediaVideoStatus.textContent = "Photo saved in this browser.";

      try {
        const savedPhotos = JSON.parse(localStorage.getItem(mediaPhotoStorageKey)) || [];
        savedPhotos[slotIndex] = null;
        localStorage.setItem(mediaPhotoStorageKey, JSON.stringify(savedPhotos));
      } catch {
        // The new photo is already stored in IndexedDB.
      }
    } catch {
      if (mediaVideoStatus) mediaVideoStatus.textContent = "The photo preview was not saved. Check browser storage and try again.";
    } finally {
      input.value = "";
    }
  });
});

const lightbox = document.querySelector("[data-media-lightbox]");
const lightboxContent = document.querySelector("[data-lightbox-content]");
const lightboxCaption = document.querySelector("[data-lightbox-caption]");

const openMediaLightbox = (type, source, caption) => {
  if (!lightbox || !lightboxContent) return;
  lightboxContent.replaceChildren();
  let media;
  if (type === "video") {
    media = document.createElement("video");
    media.controls = true;
    media.autoplay = false;
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

mediaVideoSlots.forEach((slot) => {
  const input = slot.querySelector("[data-video-input]");
  const video = slot.querySelector("[data-video-preview]");
  const replaceButton = slot.querySelector("[data-video-replace]");
  const expandButton = slot.querySelector("[data-video-expand]");
  const slotIndex = Number(slot.dataset.videoSlot);

  video?.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  replaceButton?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    input?.click();
  });

  expandButton?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const source = video?.currentSrc || video?.src;
    if (source) openMediaLightbox("video", source, slot.querySelector("[data-video-caption]")?.textContent || "Video");
  });

  input?.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    const fileExtension = file.name.split(".").pop()?.toLowerCase();
    const inferredMimeType = mediaVideoMimeTypes[fileExtension];
    const mimeType = file.type && file.type !== "application/octet-stream" ? file.type : inferredMimeType;
    if (!mimeType) {
      if (slotIndex === 1 && mediaVideoStatus) {
        mediaVideoStatus.textContent = "Couldn't identify this video format. Try an MP4, MOV, or WebM file.";
      }
      input.value = "";
      return;
    }

    const readableFile = file.type === mimeType ? file : new Blob([file], { type: mimeType });
    video.src = createMediaVideoObjectUrl(slotIndex, readableFile);
    video.hidden = false;
    video.load();
    slot.classList.add("has-video");
    input.value = "";

    if (slotIndex === 1 && mediaVideoStatus) {
      mediaVideoStatus.textContent = "Saving the replacement for Video 02…";
    }

    video?.addEventListener("error", () => {
      if (slotIndex === 1 && mediaVideoStatus && video.currentSrc.startsWith("blob:")) {
        mediaVideoStatus.textContent = "Video 02 was saved, but this browser can't play its format.";
      }
    }, { once: true });

    try {
      await saveStoredMediaVideo(slotIndex, readableFile);
      let savedVideos = [];
      try {
        savedVideos = JSON.parse(localStorage.getItem(mediaVideoStorageKey)) || [];
        if (savedVideos[slotIndex]) {
          savedVideos[slotIndex] = null;
          localStorage.setItem(mediaVideoStorageKey, JSON.stringify(savedVideos));
        }
      } catch {
        // IndexedDB contains the current video even if legacy storage cannot be cleaned.
      }
      if (slotIndex === 1 && mediaVideoStatus) {
        mediaVideoStatus.textContent = "Video 02 was replaced and saved in this browser.";
      }
    } catch {
      if (readableFile.size <= 2 * 1024 * 1024) {
        try {
          let savedVideos = [];
          try {
            savedVideos = JSON.parse(localStorage.getItem(mediaVideoStorageKey)) || [];
          } catch {
            savedVideos = [];
          }
          savedVideos[slotIndex] = await mediaVideoBlobToDataUrl(readableFile);
          localStorage.setItem(mediaVideoStorageKey, JSON.stringify(savedVideos));
          if (slotIndex === 1 && mediaVideoStatus) {
            mediaVideoStatus.textContent = "Video 02 was replaced and saved in this browser.";
          }
          return;
        } catch {
          // Report below if the browser cannot store the replacement.
        }
      }
      if (slotIndex === 1 && mediaVideoStatus) {
        mediaVideoStatus.textContent = "Video 02 preview changed, but the browser couldn't save it. It may reset after reload.";
      }
    }
  });
});

renderSavedPhotos();
renderSavedVideos();

const savedProfile = (() => {
  try {
    return JSON.parse(localStorage.getItem("about-me-profile"));
  } catch {
    return null;
  }
})();

const mediaBrandMark = document.querySelector(".sports-brand-mark");
const mediaBrandImage = document.querySelector("[data-brand-image]");
const savedBrandImage = (() => {
  try {
    return localStorage.getItem("about-me-brand-image");
  } catch {
    return null;
  }
})();

if (savedBrandImage) {
  mediaBrandImage.src = savedBrandImage;
  mediaBrandImage.hidden = false;
  mediaBrandMark.classList.add("has-image");
}

if (savedProfile?.name) {
  const initials = savedProfile.name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((part) => part[0])
    .join("");
  document.querySelector("[data-brand-initials]").textContent = (initials || "AGE").toUpperCase();
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

const mediaFeaturedPost = document.querySelector("[data-media-featured-post]");
const mediaFeaturedContent = document.querySelector("[data-media-featured-post-content]");
const featuredPostUrl = savedProfile?.featuredPostUrl?.trim();
if (mediaFeaturedPost && mediaFeaturedContent && featuredPostUrl) {
  let postUrl;
  try {
    postUrl = new URL(featuredPostUrl);
  } catch {
    postUrl = null;
  }
  if (postUrl?.protocol === "https:") {
    let embedUrl = null;
    let title = "Featured public post";
    const host = postUrl.hostname.toLowerCase();
    if (["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"].includes(host)) {
      const videoId = host === "youtu.be"
        ? postUrl.pathname.split("/").filter(Boolean)[0]
        : postUrl.searchParams.get("v") || postUrl.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1];
      if (videoId && /^[\w-]{11}$/.test(videoId)) {
        embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}`;
        title = "Featured YouTube video";
      }
    } else if (["instagram.com", "www.instagram.com"].includes(host)) {
      const postId = postUrl.pathname.match(/^\/(?:p|reel|tv)\/([\w-]+)/)?.[1];
      if (postId) {
        embedUrl = `https://www.instagram.com/p/${postId}/embed/`;
        title = "Featured Instagram post";
      }
    } else if (["tiktok.com", "www.tiktok.com"].includes(host)) {
      const videoId = postUrl.pathname.match(/\/video\/(\d+)/)?.[1];
      if (videoId) {
        embedUrl = `https://www.tiktok.com/embed/v2/${videoId}`;
        title = "Featured TikTok video";
      }
    }

    if (embedUrl) {
      const frame = document.createElement("iframe");
      frame.src = embedUrl;
      frame.title = title;
      frame.loading = "lazy";
      frame.referrerPolicy = "no-referrer";
      frame.allow = "accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share";
      frame.allowFullscreen = true;
      frame.sandbox = "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox";
      mediaFeaturedContent.append(frame);
    }
    const link = document.createElement("a");
    link.href = postUrl.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = embedUrl ? "Open post ↗" : "View this post ↗";
    mediaFeaturedContent.append(link);
    mediaFeaturedPost.hidden = false;
    const featuredCard = document.querySelector("[data-featured-post-card]");
    if (featuredCard) featuredCard.hidden = false;
  }
}