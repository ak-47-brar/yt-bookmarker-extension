(() => {
  let youtubeLeftControls, youtubePlayer;
  let currentVideo = "";
  let currentVideoBookmarks = [];

  // --- Dot style injection (run once per page) ---
  if (!document.getElementById('yt-bookmark-dot-style')) {
    const style = document.createElement('style');
    style.id = 'yt-bookmark-dot-style';
    style.innerHTML = `
      .yt-bookmark-dot {
        position: absolute;
        bottom: -6px;
        width: 10px;
        height: 10px;
        background: #DA0037;
        border-radius: 50%;
        transform: translateX(-50%);
        cursor: pointer;
        z-index: 1000;
        pointer-events: auto;
        transition: box-shadow 0.2s;
      }
      .yt-bookmark-dot:hover {
        box-shadow: 0 0 8px 2px #DA0037BB;
      }
    `;
    document.head.appendChild(style);
  }
  // --- End style injection ---

  // Listen for extension messages for play/delete/video change
  chrome.runtime.onMessage.addListener((obj, sender, response) => {
    const { type, value, videoId } = obj;

    if (type === "NEW") {
      currentVideo = videoId;
      newVideoLoaded();
    } else if (type === "PLAY") {
      youtubePlayer.currentTime = value;
    } else if (type === "DELETE") {
      currentVideoBookmarks = currentVideoBookmarks.filter((b) => b.time != value);
      chrome.storage.sync.set({ [currentVideo]: JSON.stringify(currentVideoBookmarks) }, () => {
        renderBookmarkDots(currentVideoBookmarks, youtubePlayer.duration);
        response(currentVideoBookmarks);
      });
      return true;
    }
  });

  // Fetch saved bookmarks for the current video
  const fetchBookmarks = () => {
    return new Promise((resolve) => {
      chrome.storage.sync.get([currentVideo], (obj) => {
        resolve(obj[currentVideo] ? JSON.parse(obj[currentVideo]) : []);
      });
    });
  };

  // --- Dot rendering logic ---
  function renderBookmarkDots(bookmarks, duration) {
    // Remove previously drawn dots
    document.querySelectorAll('.yt-bookmark-dot').forEach(dot => dot.remove());
    const progressBar = document.querySelector('.ytp-progress-bar');
    if (!progressBar) return;
    bookmarks.forEach(bookmark => {
      const dot = document.createElement('div');
      dot.className = 'yt-bookmark-dot';
      const leftPercent = (bookmark.time / duration) * 100;
      dot.style.left = `${leftPercent}%`;
      dot.title = bookmark.desc;
      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        youtubePlayer.currentTime = bookmark.time;
      });
      progressBar.appendChild(dot);
    });
  }

  // Add Bookmark Button and hook up dot logic
  const newVideoLoaded = async () => {
    const bookmarkBtnExists = document.getElementsByClassName("bookmark-btn")[0];
    currentVideoBookmarks = await fetchBookmarks();
    youtubeLeftControls = document.getElementsByClassName("ytp-left-controls")[0];
    youtubePlayer = document.getElementsByClassName("video-stream")[0];
    if (!bookmarkBtnExists && youtubeLeftControls) {
      const bookmarkBtn = document.createElement("img");
      bookmarkBtn.src = chrome.runtime.getURL("assets/bookmark.png");
      bookmarkBtn.className = "ytp-button bookmark-btn";
      bookmarkBtn.title = "Bookmark current timestamp";
      youtubeLeftControls.appendChild(bookmarkBtn);
      bookmarkBtn.addEventListener("click", addNewBookmarkEventHandler);
    }
    if (youtubePlayer) {
      renderBookmarkDots(currentVideoBookmarks, youtubePlayer.duration);
    }
  };

  // Add Bookmark Event Handler
  const addNewBookmarkEventHandler = async () => {
    const currentTime = youtubePlayer.currentTime;
    const newBookmark = {
      time: currentTime,
      desc: "Bookmark " + (currentVideoBookmarks.length + 1)
    };
    currentVideoBookmarks = await fetchBookmarks();
    chrome.storage.sync.set({
      [currentVideo]: JSON.stringify([...currentVideoBookmarks, newBookmark].sort((a, b) => a.time - b.time))
    }, () => {
      // Update the UI immediately
      currentVideoBookmarks.push(newBookmark);
      renderBookmarkDots(currentVideoBookmarks, youtubePlayer.duration);
    });
  };

  // Format time (HH:MM:SS)
  const getTime = t => {
    let date = new Date(0);
    date.setSeconds(t);
    return date.toISOString().substr(11, 8);
  };

  // --- ALT+X: Bookmark at current time ---
  document.addEventListener('keydown', function(event) {
    if (event.altKey && (event.key === 'x' || event.key === 'X')) {
      const bookmarkBtn = document.querySelector('.ytp-button.bookmark-btn');
      if (bookmarkBtn) {
        bookmarkBtn.click();
        event.preventDefault();
      }
    }
  });

  // --- ALT+C: Export bookmarks as text ---
  function exportCurrentVideoBookmarks() {
    const urlParams = new URLSearchParams(window.location.search);
    const videoId = urlParams.get('v');
    if (!videoId) return;
    chrome.storage.sync.get([videoId], (obj) => {
      const bookmarks = obj[videoId] ? JSON.parse(obj[videoId]) : [];
      if (bookmarks.length === 0) {
        alert("No bookmarks for this video.");
        return;
      }
      const text = bookmarks
        .map((b, index) => `${getTime(b.time)} - Bookmark ${index + 1}`)
        .join('\n');
      navigator.clipboard.writeText(text).then(() => {
        alert("Bookmarks copied to clipboard:\n\n" + text);
      }, (err) => {
        alert("Failed to copy bookmarks: " + err);
      });
    });
  }

  document.addEventListener('keydown', function(event) {
    if (event.altKey && (event.key === 'c' || event.key === 'C')) {
      exportCurrentVideoBookmarks();
      event.preventDefault();
    }
  });

})();
