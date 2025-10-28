import { API_BASE_URL } from './app/config.js';

const API_ROOT = API_BASE_URL.replace(/\/?$/, '');
const CLIENT_CACHE_TTL = 30_000;
const clientCache = new Map();

function cloneData(value) {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      // Fallback below
    }
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

// Robust clipboard helper (mirrors implementation in studio)
function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text).catch(() => legacyCopy(text));
  }
  return legacyCopy(text);
}

function legacyCopy(text) {
  return new Promise((resolve, reject) => {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.setAttribute('readonly', '');
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    textArea.style.left = '0';
    textArea.style.top = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      const ok = document.execCommand('copy');
      document.body.removeChild(textArea);
      if (ok) resolve(); else reject(new Error('Copy command failed'));
    } catch (err) {
      document.body.removeChild(textArea);
      reject(err);
    }
  });
}

function getClientCache(key) {
  const entry = clientCache.get(key);
  if (!entry) return null;
  if (entry.expires <= Date.now()) {
    clientCache.delete(key);
    return null;
  }
  return cloneData(entry.data);
}

function setClientCache(key, data) {
  clientCache.set(key, { expires: Date.now() + CLIENT_CACHE_TTL, data: cloneData(data) });
}

const params = new URLSearchParams(window.location.search);

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1) return fallback;
  return parsed;
}

const state = {
  pageSize: 12,
  page: parsePositiveInt(params.get('page'), 1),
  pageCount: 1,
  total: 0,
  items: [],
  loading: false,
  errorMessage: null,
  selectedId: params.get('id') || null,
  selectedSummary: null
};

const listEl = document.getElementById('explore-list');
const previewFrame = document.getElementById('explore-preview');
const previewLoader = document.getElementById('preview-loader');
const previewEmpty = document.getElementById('preview-empty');
const previewDetails = document.getElementById('preview-details');
const openButton = document.getElementById('open-in-studio');
const copyButton = document.getElementById('copy-share-id');
const prevPageButton = document.getElementById('prev-page');
const nextPageButton = document.getElementById('next-page');
const paginationInfo = document.getElementById('pagination-info');

function formatRelativeTime(value) {
  try {
    const now = Date.now();
    const target = new Date(value).getTime();
    if (Number.isNaN(target)) return '';
    const diff = Math.max(0, now - target);

    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    const week = 7 * day;
    const month = 30 * day;

    if (diff < minute) return 'Just now';
    if (diff < hour) {
      const mins = Math.round(diff / minute);
      return `${mins} min${mins === 1 ? '' : 's'} ago`;
    }
    if (diff < day) {
      const hours = Math.round(diff / hour);
      return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    }
    if (diff < week) {
      const days = Math.round(diff / day);
      return `${days} day${days === 1 ? '' : 's'} ago`;
    }
    if (diff < month) {
      const weeks = Math.round(diff / week);
      return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
    }
    const months = Math.round(diff / month);
    return `${months} month${months === 1 ? '' : 's'} ago`;
  } catch {
    return '';
  }
}

function updateUrl() {
  const nextParams = new URLSearchParams();
  if (state.page > 1) nextParams.set('page', String(state.page));
  if (state.selectedId) nextParams.set('id', state.selectedId);
  const nextQuery = nextParams.toString();
  const nextUrl = nextQuery ? `${window.location.pathname}?${nextQuery}` : window.location.pathname;
  window.history.replaceState({}, '', nextUrl);
}

function renderList() {
  if (!listEl) return;
  listEl.innerHTML = '';

  if (state.loading) {
    const loading = document.createElement('div');
    loading.className = 'explore__loading';
    loading.textContent = 'Loading systems...';
    listEl.appendChild(loading);
    return;
  }

  if (state.errorMessage) {
    const error = document.createElement('div');
    error.className = 'explore__empty';
    error.textContent = state.errorMessage;
    listEl.appendChild(error);
    return;
  }

  if (!state.items.length) {
    const empty = document.createElement('div');
    empty.className = 'explore__empty';
    empty.textContent = 'No shared systems yet. Save one in the studio to get started.';
    listEl.appendChild(empty);
    return;
  }

  state.items.forEach((item) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'explore-card';
    card.dataset.id = item.id;
    card.setAttribute('role', 'listitem');

    const header = document.createElement('div');
    header.className = 'explore-card__header';

    const name = document.createElement('span');
    name.className = 'explore-card__name';
    name.textContent = item?.metadata?.name || item?.summary?.preset || `System ${item.id}`;

    const code = document.createElement('span');
    code.className = 'explore-card__code';
    code.textContent = `#${item.id}`;

    header.append(name, code);

    const details = document.createElement('dl');
    details.className = 'explore-card__details';

    const seedLabel = document.createElement('dt');
    seedLabel.textContent = 'Seed';
    const seedValue = document.createElement('dd');
    seedValue.textContent = item?.summary?.seed || '—';

    const presetLabel = document.createElement('dt');
    presetLabel.textContent = 'Preset';
    const presetValue = document.createElement('dd');
    presetValue.textContent = item?.summary?.preset || 'Custom';

    const moonsLabel = document.createElement('dt');
    moonsLabel.textContent = 'Moons';
    const moonCount = item?.summary?.moonCount;
    const moonsValue = document.createElement('dd');
    moonsValue.textContent = Number.isFinite(moonCount) ? String(moonCount) : '—';

    details.append(seedLabel, seedValue, presetLabel, presetValue, moonsLabel, moonsValue);

    const footer = document.createElement('div');
    footer.className = 'explore-card__footer';
    footer.textContent = formatRelativeTime(item.createdAt) || 'Recently shared';

    card.append(header, details, footer);
    card.addEventListener('click', () => selectItem(item));
    listEl.appendChild(card);
  });

  updateActiveCard();
}

function updateActiveCard() {
  if (!listEl) return;
  listEl.querySelectorAll('.explore-card').forEach((card) => {
    card.classList.toggle('is-active', card.dataset.id === state.selectedId);
  });
}

function updatePreviewDetails(summary) {
  if (!previewDetails) return;
  if (!summary) {
    previewDetails.textContent = '';
    return;
  }

  const parts = [];
  if (summary.summary?.preset) parts.push(`Preset: ${summary.summary.preset}`);
  if (summary.summary?.seed) parts.push(`Seed: ${summary.summary.seed}`);
  if (Number.isFinite(summary.summary?.moonCount)) {
    const moons = summary.summary.moonCount;
    parts.push(`${moons} moon${moons === 1 ? '' : 's'}`);
  }
  if (summary.summary?.description) parts.push(summary.summary.description);
  const rel = formatRelativeTime(summary.createdAt);
  if (rel) parts.push(`Shared ${rel}`);

  previewDetails.textContent = parts.join(' · ');
}

function updatePreview(summary) {
  if (!previewFrame) return;
  if (!summary) {
    previewFrame.removeAttribute('data-current-id');
    previewFrame.src = '';
    if (previewLoader) previewLoader.style.opacity = '0';
    if (previewEmpty) previewEmpty.hidden = false;
    if (openButton) openButton.disabled = true;
    if (copyButton) copyButton.disabled = true;
    return;
  }

  if (previewLoader) previewLoader.style.opacity = '1';
  if (previewEmpty) previewEmpty.hidden = true;

  previewFrame.setAttribute('data-current-id', summary.id);
  previewFrame.src = `/studio.html?preview=1&load=${encodeURIComponent(summary.id)}`;

  previewFrame.onload = () => {
    if (previewLoader) {
      previewLoader.style.opacity = '0';
    }
  };

  if (openButton) {
    openButton.disabled = false;
    openButton.onclick = () => {
      window.location.href = `/studio.html#${summary.id}`;
    };
  }
  if (copyButton) {
    copyButton.disabled = false;
    copyButton.onclick = async () => {
      try {
        await copyToClipboard(summary.id);
        copyButton.textContent = 'Copied!';
        setTimeout(() => {
          copyButton.textContent = 'Copy Share Code';
        }, 2000);
      } catch (err) {
        console.warn('Clipboard copy failed', err);
      }
    };
  }
}

function selectItem(item) {
  state.selectedId = item.id;
  state.selectedSummary = item;
  updateUrl();
  updatePreview(item);
  updateActiveCard();
}

async function fetchSystems() {
  const cacheKey = JSON.stringify({ page: state.page, limit: state.pageSize, sort: 'recent' });

  const cached = getClientCache(cacheKey);
  if (cached) {
    state.items = cached.items;
    state.total = cached.total;
    state.pageCount = cached.pageCount;
    state.loading = false;
    state.errorMessage = null;
    renderList();
    updatePagination();
    return;
  }

  state.loading = true;
  state.errorMessage = null;
  renderList();

  try {
    const searchParams = new URLSearchParams({
      page: String(state.page),
      limit: String(state.pageSize),
      sort: 'recent'
    });

    const response = await fetch(`${API_ROOT}/explore?${searchParams}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    state.items = data.items || [];
    state.total = data.total || 0;
    state.pageCount = Math.ceil(state.total / state.pageSize);

    setClientCache(cacheKey, {
      items: state.items,
      total: state.total,
      pageCount: state.pageCount
    });

    state.loading = false;
    renderList();
    updatePagination();

    // Auto-select first item if none selected
    if (!state.selectedId && state.items.length > 0) {
      selectItem(state.items[0]);
    }
  } catch (error) {
    console.error('Failed to fetch systems:', error);
    state.errorMessage = 'Failed to load systems. Please try again.';
    state.loading = false;
    renderList();
  }
}

function updatePagination() {
  if (prevPageButton) {
    prevPageButton.disabled = state.page <= 1;
    prevPageButton.onclick = () => {
      if (state.page > 1) {
        state.page--;
        updateUrl();
        fetchSystems();
      }
    };
  }

  if (nextPageButton) {
    nextPageButton.disabled = state.page >= state.pageCount;
    nextPageButton.onclick = () => {
      if (state.page < state.pageCount) {
        state.page++;
        updateUrl();
        fetchSystems();
      }
    };
  }

  if (paginationInfo) {
    paginationInfo.textContent = `Page ${state.page} of ${state.pageCount}`;
  }
}

// Initialize
fetchSystems();
