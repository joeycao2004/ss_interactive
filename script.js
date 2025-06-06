let isLocked = false;
let isSleeping = false;
let clickCount = 0;
let clickTimer = null;
let idleTimeout = null;
let pressTimer = null;
let messageShown = false;
let currentTheme = null;
let currentClip = null;

const freezeCanvas = document.getElementById('videoFreezeFrame');
const freezeCtx = freezeCanvas.getContext('2d');
const loadingScreen = document.getElementById('loadingScreen');
const loadingMessage = document.getElementById('loadingMessage');
const clickbox = document.getElementById('clickbox');
const feedButton = document.getElementById('feedingButton');
const videoContainer = document.getElementById('videoContainer');

const VIDEO_NAMES = [
  "Idle", "Roar", "Rage", "Nuzzle",
  "Sleep-start", "Sleep-loop", "Sleep-wake", "Eat"
];

let clips = {};
let preloadBuffers = {};

// 🌓 Detect light/dark mode
function detectTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? "night-videos" : "day-videos";
}

// ⏳ Preload videos for a given theme
function preloadClips(theme, callback) {
  clips = {};
  let loaded = 0;

  VIDEO_NAMES.forEach(name => {
    const el = document.createElement('video');
    el.id = name;
    el.className = "evClip";
    el.src = `videos/${theme}/${name}.mp4`;
    el.preload = "auto";
    el.muted = true;
    el.playsInline = true;
    if (name === "Idle" || name === "Sleep-loop") el.loop = true;
    el.style.display = "none";
    videoContainer.appendChild(el);
    clips[name] = el;

    el.addEventListener('canplaythrough', function handler() {
      el.removeEventListener('canplaythrough', handler);
      loaded++;
      if (loaded >= VIDEO_NAMES.length) callback();
    });
    el.load();
  });

  setTimeout(() => callback(), 10000); // fallback
}

// 🌘 Preload Idle/Sleep-loop for opposite theme
function preloadBufferClips() {
  const otherTheme = currentTheme === "night-videos" ? "day-videos" : "night-videos";
  ["Idle", "Sleep-loop"].forEach(name => {
    const buffer = document.createElement('video');
    buffer.src = `videos/${otherTheme}/${name}.mp4`;
    buffer.preload = "auto";
    buffer.muted = true;
    buffer.playsInline = true;
    buffer.loop = true;
    preloadBuffers[`${otherTheme}/${name}`] = buffer;
    buffer.load();
  });
}

function unloadClips() {
  VIDEO_NAMES.forEach(name => {
    const el = document.getElementById(name);
    if (el) {
      el.pause();
      el.remove();
    }
  });
}

// 🧊 Freeze frame matching object-fit: cover
function captureFreezeFrame() {
  const vw = currentClip.videoWidth;
  const vh = currentClip.videoHeight;
  const cw = freezeCanvas.width = currentClip.offsetWidth;
  const ch = freezeCanvas.height = currentClip.offsetHeight;

  if (vw === 0 || vh === 0) return;

  const videoAspect = vw / vh;
  const canvasAspect = cw / ch;

  let sx, sy, sw, sh;
  if (videoAspect > canvasAspect) {
    sh = vh;
    sw = vh * canvasAspect;
    sx = (vw - sw) / 2;
    sy = 0;
  } else {
    sw = vw;
    sh = vw / canvasAspect;
    sx = 0;
    sy = (vh - sh) / 2;
  }

  freezeCtx.imageSmoothingEnabled = false;
  freezeCtx.drawImage(currentClip, sx, sy, sw, sh, 0, 0, cw, ch);
  freezeCanvas.style.display = 'block';
}

function clearFreezeFrame() {
  freezeCanvas.style.display = 'none';
}

function showLoadingMessage() {
  if (!loadingScreen || !loadingMessage || messageShown) return;
  messageShown = true;
  loadingMessage.style.opacity = '1';
  setTimeout(() => {
    loadingMessage.style.opacity = '0';
    setTimeout(() => { messageShown = false; }, 500);
  }, 3000);
}

function playClip(name, loop = false, lockDuring = true) {
  return new Promise(resolve => {
    const next = clips[name];
    if (!next || next === currentClip) {
      resolve();
      return;
    }

    captureFreezeFrame();
    currentClip.pause();
    currentClip.style.display = "none";

    next.currentTime = 0;
    next.loop = loop;
    next.style.display = "block";

    const onPlay = () => {
      next.removeEventListener('playing', onPlay);
      clearFreezeFrame();

      if (!loop && lockDuring) {
        next.addEventListener('ended', () => {
          next.style.display = "none";
          resolve();
        });
      } else {
        resolve();
      }
    };

    if (lockDuring) isLocked = true;
    currentClip = next;
    clearTimeout(idleTimeout);

    next.addEventListener('playing', onPlay);
    next.play().catch(e => {
      console.warn("Playback error:", e);
      resolve();
    });
  });
}

function resetIdleTimer() {
  clearTimeout(idleTimeout);
  if (!isSleeping) {
    idleTimeout = setTimeout(async () => {
      isLocked = true;
      await playClip("Sleep-start", false);
      isSleeping = true;
      await playClip("Sleep-loop", true).then(() => resetIdleTimer());
    }, 10000);
  }
}

function wakeUp() {
  if (isSleeping) {
    isSleeping = false;
    isLocked = true;
    playClip("Sleep-wake", false).then(playIdle);
  }
}

function playIdle() {
  isSleeping = false;
  isLocked = false;
  playClip("Idle", true, false).then(() => {
    setTimeout(() => {
      if (currentClip === clips.Idle && !isSleeping) resetIdleTimer();
    }, 500);
  });
}

function registerClick() {
  if (isLocked || isSleeping) return;
  clickCount++;
  clearTimeout(clickTimer);
  clickTimer = setTimeout(() => {
    if (clickCount > 2) {
      playClip("Rage").then(playIdle);
    } else {
      playClip("Roar").then(playIdle);
    }
    clickCount = 0;
  }, 500);
}

function handleLongPressStart() {
  if (isLocked || isSleeping) return;
  pressTimer = setTimeout(() => {
    isLocked = true;
    clickCount = 0;
    playClip("Nuzzle").then(playIdle);
  }, 500);
}

function handleLongPressEnd() {
  clearTimeout(pressTimer);
}

function playEat() {
  if (isLocked || isSleeping) return;
  isLocked = true;
  clickCount = 0;
  playClip("Eat", false).then(playIdle);
}

function updateThemeIfNeeded() {
  const newTheme = detectTheme();
  if (newTheme !== currentTheme) {
    const wasSleeping = isSleeping;
    unloadClips();
    currentTheme = newTheme;
    preloadClips(currentTheme, () => {
      const resume = wasSleeping ? "Sleep-loop" : "Idle";
      clips[resume].style.display = "block";
      currentClip = clips[resume];
      clips[resume].play().then(() => resetIdleTimer());
      isSleeping = wasSleeping;
    });
    preloadBufferClips(); // Load Idle/Sleep-loop from new opposite theme
  }
}

document.addEventListener("DOMContentLoaded", () => {
  currentTheme = detectTheme();
  preloadClips(currentTheme, () => {
    if (loadingScreen) {
      loadingScreen.style.opacity = '0';
      setTimeout(() => {
        loadingScreen.style.display = 'none';
      }, 500);
    }
    clips.Idle.style.display = "block";
    currentClip = clips.Idle;
    clips.Idle.play().then(() => resetIdleTimer());
  });

  preloadBufferClips();

  clickbox.addEventListener('mousedown', handleLongPressStart);
  clickbox.addEventListener('mouseup', handleLongPressEnd);
  clickbox.addEventListener('click', () => {
    if (loadingScreen.style.display !== 'none') {
      showLoadingMessage();
      return;
    }
    if (isSleeping) wakeUp();
    else registerClick();
  });

  feedButton.addEventListener('click', playEat);

  const themeMedia = window.matchMedia('(prefers-color-scheme: dark)');
  themeMedia.addEventListener('change', updateThemeIfNeeded);
  setInterval(updateThemeIfNeeded, 60000);
});
