type CreatePanel = "post" | "story" | "note";

type FeedChromeHandlers = {
  openSearch: () => void;
  closeSearch: () => void;
  toggleSearch: () => void;
  openPanel: (panel: CreatePanel) => void;
  goReels: () => void;
  goLive: () => void;
};

let handlers: FeedChromeHandlers | null = null;
let pendingSearch = false;
let pendingPanel: CreatePanel | null = null;
let createMenuOpen = false;
let searchOpen = false;
const createMenuListeners = new Set<(open: boolean) => void>();
const searchListeners = new Set<(open: boolean) => void>();
const listeners = new Set<() => void>();

function flushPending(next: FeedChromeHandlers) {
  if (pendingSearch) {
    pendingSearch = false;
    queueMicrotask(() => next.openSearch());
  }
  if (pendingPanel) {
    const panel = pendingPanel;
    pendingPanel = null;
    queueMicrotask(() => next.openPanel(panel));
  }
}

export function bindFeedChrome(next: FeedChromeHandlers | null) {
  handlers = next;
  if (next) flushPending(next);
  else setFeedSearchOpen(false);
  listeners.forEach((fn) => fn());
}

export function feedChrome() {
  return handlers;
}

/** Header create menu (owned by StudentChrome, same as web portal). */
export function getFeedCreateMenuOpen() {
  return createMenuOpen;
}

export function setFeedCreateMenuOpen(open: boolean) {
  createMenuOpen = open;
  createMenuListeners.forEach((fn) => fn(open));
}

export function toggleFeedCreateMenu() {
  setFeedCreateMenuOpen(!createMenuOpen);
}

export function subscribeFeedCreateMenu(listener: (open: boolean) => void) {
  createMenuListeners.add(listener);
  return () => {
    createMenuListeners.delete(listener);
  };
}

export function requestFeedCreate() {
  setFeedSearchOpen(false);
  setFeedCreateMenuOpen(true);
}

export function getFeedSearchOpen() {
  return searchOpen;
}

export function setFeedSearchOpen(open: boolean) {
  if (searchOpen === open) return;
  searchOpen = open;
  searchListeners.forEach((fn) => fn(open));
}

export function subscribeFeedSearch(listener: (open: boolean) => void) {
  searchListeners.add(listener);
  return () => {
    searchListeners.delete(listener);
  };
}

export function requestFeedSearch() {
  setFeedCreateMenuOpen(false);
  if (handlers) {
    handlers.toggleSearch();
    return;
  }
  pendingSearch = true;
}

/** Open search without toggling (e.g. after navigating to Feed). */
export function openFeedSearch() {
  setFeedCreateMenuOpen(false);
  setFeedSearchOpen(true);
  if (handlers) {
    handlers.openSearch();
    return;
  }
  pendingSearch = true;
}

export function closeFeedSearch() {
  setFeedSearchOpen(false);
  handlers?.closeSearch();
}

export function requestFeedPanel(panel: CreatePanel) {
  setFeedSearchOpen(false);
  setFeedCreateMenuOpen(false);
  if (handlers) {
    handlers.openPanel(panel);
    return;
  }
  pendingPanel = panel;
}

export function subscribeFeedChrome(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
