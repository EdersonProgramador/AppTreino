import { create } from "zustand";

type FeedChromeActions = {
  toggleCreate: () => void;
  toggleSearch: () => void;
};

type FeedChromeState = FeedChromeActions & {
  bound: boolean;
  pendingSearch: boolean;
  pendingCreate: boolean;
  bind: (actions: FeedChromeActions) => void;
  unbind: () => void;
  /** Abre busca no Feed; se o Feed ainda não montou, agenda abertura. */
  requestSearch: () => void;
  /** Abre menu Criar no Feed; se o Feed ainda não montou, agenda abertura. */
  requestCreate: () => void;
};

export const useFeedChromeStore = create<FeedChromeState>((set, get) => ({
  bound: false,
  pendingSearch: false,
  pendingCreate: false,
  toggleCreate: () => undefined,
  toggleSearch: () => undefined,
  bind: (actions) => {
    const { pendingSearch, pendingCreate } = get();
    set({ ...actions, bound: true, pendingSearch: false, pendingCreate: false });
    if (pendingCreate) {
      queueMicrotask(() => actions.toggleCreate());
    }
    if (pendingSearch) {
      queueMicrotask(() => actions.toggleSearch());
    }
  },
  unbind: () =>
    set({
      bound: false,
      pendingSearch: false,
      pendingCreate: false,
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
  },
  requestCreate: () => {
    const state = get();
    if (state.bound) {
      state.toggleCreate();
      return;
    }
    set({ pendingCreate: true });
  }
}));
