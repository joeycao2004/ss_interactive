let isLocked = false;
let isSleeping = false;
let clickCount = 0;
let clickTimer = null;
let idleTimeout = null;
let pressTimer = null;
let messageShown = false;

const freezeCanvas = document.getElementById('videoFreezeFrame');
const freezeCtx = freezeCanvas.getContext('2d');
const loadingScreen = document.getElementById('loadingScreen');
const loadingMessage = document.getElementById('loadingMessage');
const overlay = document.getElementById('transitionOverlay');

const clips = {
  Idle: document.getElementById('Idle'),
  Roar: document.getElementById('Roar'),
  Rage: document.getElementById('Rage'),
  Nuzzle: document.getElementById('Nuzzle'),
  SleepStart: document.getElementById('SleepStart'),
  SleepLoop: document.getElementById('SleepLoop'),
  SleepWake: document.getElementById('SleepWake'),
};

let currentClip = clips.Idle;

// === Utility: Freeze current video frame to canvas ===
function captureFreezeFrame() {
  const vw = currentClip.videoWidth;
  const vh = currentClip.videoHeight;
  if (vw === 0 || vh === 0) return;

  freezeCanvas.width = currentClip.offsetWidth;
  freezeCanvas.height = currentClip.offsetHeight;

  freezeCanvas.style.width = currentClip.offsetWidth + 'px';
  freezeCanvas.style.height = currentClip.offsetHeight + 'px';

  freezeCtx.imageSmoothingEnabled = false;
  freezeCtx.drawImage(currentClip, 0, 0, freezeCanvas.width, freezeCanvas.height);
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
    setTimeout(() => {
      messageShown = false;
    }, 500);
  }, 3000);
}

function showOverlay() {
  overlay.style.opacity = '1';
}
function hideOverlay() {
  overlay.style.opacity = '0';
}

function playClip(name, loop = false, lockDuring = true) {
  return new Promise((resolve) => {
    const next = clips[name];
    if (!next || next === currentClip) {
      resolve();
      return;
    }

    showOverlay();
    captureFreezeFrame();

    currentClip.pause();
    currentClip.style.display = 'none';

    next.currentTime = 0;
    next.loop = loop;
    next.style.display = 'block';

    const onPlay = () => {
      next.removeEventListener('playing', onPlay);
      clearFreezeFrame();
      hideOverlay();

      if (!loop && lockDuring) {
        next.addEventListener('ended', () => {
          next.style.display = 'none';
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
    next.play().catch((e) => {
      console.warn('Playback error:', e);
      resolve();
    });
  });
}

function resetIdleTimer() {
  clearTimeout(idleTimeout);
  if (!isSleeping) {
    idleTimeout = setTimeout(async () => {
      isLocked = true;
      await playClip("SleepStart", false);
      isSleeping = true;
      await playClip("SleepLoop", true).then(() => {
        resetIdleTimer();
      });
    }, 10000);
  }
}

function wakeUp() {
  if (isSleeping) {
    isSleeping = false;
    isLocked = true;
    playClip("SleepWake", false).then(() => playIdle());
  }
}

function playIdle() {
  isSleeping = false;
  isLocked = false;
  playClip("Idle", true, false).then(() => {
    // Wait a few ms before starting the timer to ensure Idle is actually visible
    setTimeout(() => {
      if (currentClip === clips.Idle && !isSleeping) {
        resetIdleTimer();
      }
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

// Ensure videos are preloaded into DOM (already done by preload="auto")
function preloadAllVideos(callback) {
  let loaded = 0;
  const videoKeys = Object.keys(clips);
  const total = videoKeys.length;

  videoKeys.forEach((key) => {
    const v = clips[key];
    if (!v) return;

    const onReady = () => {
      v.removeEventListener('canplaythrough', onReady);
      loaded++;
      if (loaded >= total) callback();
    };

    v.addEventListener('canplaythrough', onReady);
    v.load();
  });

  setTimeout(() => {
    callback(); // fallback in case videos stall
  }, 10000);
}

document.addEventListener('DOMContentLoaded', () => {
  const clickbox = document.getElementById('clickbox');

  preloadAllVideos(() => {
    if (loadingScreen) {
      loadingScreen.style.opacity = '0';
      setTimeout(() => {
        loadingScreen.style.display = 'none';
      }, 500);
    }
    clips.Idle.style.display = 'block';
    clips.Idle.play().then(() => {
      resetIdleTimer();
    });
  });

  clickbox.addEventListener('mousedown', handleLongPressStart);
  clickbox.addEventListener('mouseup', handleLongPressEnd);

  clickbox.addEventListener('click', () => {
    if (loadingScreen.style.display !== 'none') {
      showLoadingMessage();
      return;
    }

    if (isSleeping) {
      wakeUp();
    } else {
      registerClick();
    }
  });
});
