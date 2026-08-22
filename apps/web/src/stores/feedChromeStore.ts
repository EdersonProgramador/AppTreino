import { create } from "zustand";

type FeedChromeActions = {
  toggleCreate: () => void;
  toggleSearch: () => void;
};

type FeedChromeState = FeedChromeActions & {
  bound: boolean;
  pendingSearch: boolean;
  bind: (actions: FeedChromeActions) => void;
  unbind: () => void;
  /** Abre busca no Feed; se o Feed ainda não montou, agenda abertura. */
  requestSearch: () => void;
};

export const useFeedChromeStore = create<FeedChromeState>((set, get) => ({
  bound: false,
  pendingSearch: false,
  toggleCreate: () => undefined,
  toggleSearch: () => undefined,
  bind: (actions) => {
    const pending = get().pendingSearch;
    set({ ...actions, bound: true, pendingSearch: false });
    if (pending) {
      queueMicrotask(() => actions.toggleSearch());
    }
  },
  unbind: () =>
    set({
      bound: false,
      pendingSearch: false,
      toggleCreate: () => undefined,
      toggleSearch: () => undefined
    }),
  requestSearch: () => {
    const state = get();
    if (state.bound) {
      state.toggleSearch();
      return;
    }
    set({ pendingSearch: true });
  }
}));
