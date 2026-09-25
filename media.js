const mediaMenuToggle = document.querySelector(".sports-menu-toggle");
const mediaNav = document.querySelector(".sports-nav");
const mediaPhotoSlots = document.querySelectorAll("[data-photo-slot]");
const mediaVideoSlots = document.querySelectorAll("[data-video-slot]");
const mediaVideoStatus = document.querySelector("[data-video-status]");
const mediaPhotoStorageKey = "about-me-media-photos";
const mediaVideoStorageKey = "about-me-media-videos";
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
const mediaVideoObjectUrls = new Map();
let mediaVideoDatabasePromise;

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
    }
    if (storageError && index === 1 && mediaVideoStatus) {
      mediaVideoStatus.textContent = "Could not read saved video storage. Showing the last available clip.";
    }
  }));
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

mediaVideoSlots.forEach((slot) => {
  const input = slot.querySelector("[data-video-input]");
  const video = slot.querySelector("[data-video-preview]");
  const replaceButton = slot.querySelector("[data-video-replace]");
  const slotIndex = Number(slot.dataset.videoSlot);

  video?.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  replaceButton?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    input?.click();
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