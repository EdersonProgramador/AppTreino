type FeedChromeHandlers = {
  toggleCreate: () => void;
  openCreate: () => void;
  toggleSearch: () => void;
  openSearch: () => void;
};

let handlers: FeedChromeHandlers | null = null;
let pendingCreate = false;
let pendingSearch = false;
const listeners = new Set<() => void>();

function flushPending(next: FeedChromeHandlers) {
  if (pendingCreate) {
    pendingCreate = false;
    queueMicrotask(() => next.openCreate());
  }
  if (pendingSearch) {
    pendingSearch = false;
    queueMicrotask(() => next.openSearch());
  }
}

export function bindFeedChrome(next: FeedChromeHandlers | null) {
  handlers = next;
  if (next) flushPending(next);
  listeners.forEach((fn) => fn());
}

export function feedChrome() {
  return handlers;
}

export function requestFeedCreate() {
  if (handlers) {
    handlers.openCreate();
    return;
  }
  pendingCreate = true;
}

export function requestFeedSearch() {
  if (handlers) {
    handlers.openSearch();
    return;
  }
  pendingSearch = true;
}

export function subscribeFeedChrome(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
