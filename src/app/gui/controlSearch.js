import { debounce } from "../utils.js";

// Handles the search input above the settings panel and keeps lil-gui folders in sync with filter state.

export function initControlSearch({
  controlsContainer,
  searchInput,
  clearButton,
  emptyState,
  searchBar,
  infoPanel
}) {
  if (!controlsContainer) {
    const noop = () => {};
    const passThrough = (folder) => folder;
    return {
      registerFolder: passThrough,
      unregisterFolder: noop,
      applyControlSearch: noop,
      setControlSearchTerm: noop
    };
  }

  const guiFolders = new Set();
  let controlSearchTerm = "";
  let controlSearchRestoreState = null;

  function registerFolder(folder, { close = false } = {}) {
    guiFolders.add(folder);
    if (controlSearchRestoreState && !controlSearchRestoreState.has(folder)) {
      controlSearchRestoreState.set(folder, close);
      folder.open();
    } else if (close) {
      folder.close();
    }
    return folder;
  }

  function unregisterFolder(folder) {
    guiFolders.delete(folder);
    controlSearchRestoreState?.delete(folder);
  }

  function applyControlSearch({ scrollToFirst = false } = {}) {
    const root = controlsContainer.querySelector(".lil-gui.root");
    if (!root) return;

    const term = controlSearchTerm.trim().toLowerCase();
    const hasTerm = term.length > 0;

    if (hasTerm) {
      if (!controlSearchRestoreState) {
        controlSearchRestoreState = new Map();
      }
      guiFolders.forEach((folder) => {
        if (!controlSearchRestoreState.has(folder)) {
          controlSearchRestoreState.set(folder, folder._closed);
        }
        folder.open();
      });
    } else if (controlSearchRestoreState) {
      controlSearchRestoreState.forEach((wasClosed, folder) => {
        if (wasClosed) {
          folder.close();
        } else {
          folder.open();
        }
      });
      controlSearchRestoreState = null;
    }

    const controllers = Array.from(root.querySelectorAll(".controller"));
    let firstMatch = null;
    let matchCount = 0;

    controllers.forEach((controllerEl) => {
      const label = controllerEl.querySelector(".name")?.textContent?.toLowerCase() ?? "";
      const isMatch = !hasTerm || label.includes(term);
      controllerEl.classList.toggle("search-hidden", hasTerm && !isMatch);
      controllerEl.classList.toggle("search-match", hasTerm && isMatch);
      if (isMatch) {
        matchCount += 1;
        if (!firstMatch) {
          firstMatch = controllerEl;
        }
      }
    });

    const folders = Array.from(root.querySelectorAll(".lil-gui"));
    folders.forEach((folderEl) => {
      if (folderEl.classList.contains("root")) return;
      const hasVisibleControllers = folderEl.querySelector(".controller:not(.search-hidden)");
      folderEl.classList.toggle("search-hidden", hasTerm && !hasVisibleControllers);
    });

    root.classList.toggle("search-active", hasTerm);
    searchBar?.classList.toggle("has-value", hasTerm);
    if (clearButton) {
      clearButton.hidden = !hasTerm;
    }
    if (emptyState) {
      emptyState.hidden = !hasTerm || matchCount > 0;
    }

    if (hasTerm && scrollToFirst && firstMatch) {
      firstMatch.scrollIntoView({ block: "nearest" });
    }
  }

  function setControlSearchTerm(value, { scrollToFirst = true } = {}) {
    const previousTerm = controlSearchTerm;
    controlSearchTerm = value ?? "";
    const trimmedPrevious = previousTerm.trim();
    const trimmedCurrent = controlSearchTerm.trim();
    const shouldScroll = scrollToFirst && trimmedCurrent.length > 0 && trimmedPrevious.length === 0;
    applyControlSearch({ scrollToFirst: shouldScroll });
    if (infoPanel) {
      if (trimmedCurrent.length === 0 && trimmedPrevious.length > 0) {
        infoPanel.scrollTop = 0;
      } else if (shouldScroll) {
        infoPanel.scrollTop = 0;
      }
    }
  }

  const handleControlSearchInput = debounce(() => {
    if (!searchInput) return;
    setControlSearchTerm(searchInput.value, { scrollToFirst: true });
  }, 120);

  if (searchInput) {
    searchInput.addEventListener("input", handleControlSearchInput);
    searchInput.addEventListener("search", () => {
      setControlSearchTerm(searchInput.value, { scrollToFirst: true });
    });
    searchInput.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        searchInput.value = "";
        setControlSearchTerm("", { scrollToFirst: false });
        searchInput.blur();
      }
    });
  }

  if (clearButton) {
    clearButton.hidden = true;
    clearButton.addEventListener("click", () => {
      if (searchInput) {
        searchInput.value = "";
        searchInput.focus();
      }
      setControlSearchTerm("", { scrollToFirst: false });
    });
  }

  setControlSearchTerm(searchInput?.value ?? "", { scrollToFirst: false });

  return {
    registerFolder,
    unregisterFolder,
    applyControlSearch,
    setControlSearchTerm
  };
}

