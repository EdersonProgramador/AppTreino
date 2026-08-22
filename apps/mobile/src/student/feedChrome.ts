type FeedChromeHandlers = {
  toggleCreate: () => void;
  toggleSearch: () => void;
};

let handlers: FeedChromeHandlers | null = null;
let pendingSearch = false;
const listeners = new Set<() => void>();

export function bindFeedChrome(next: FeedChromeHandlers | null) {
  handlers = next;
  if (next && pendingSearch) {
    pendingSearch = false;
    queueMicrotask(() => next.toggleSearch());
  }
  listeners.forEach((fn) => fn());
}

export function feedChrome() {
  return handlers;
}

export function requestFeedSearch() {
  if (handlers) {
    handlers.toggleSearch();
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
