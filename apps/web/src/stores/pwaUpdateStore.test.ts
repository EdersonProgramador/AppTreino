import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { usePwaUpdateStore } from "./pwaUpdateStore";

function installSessionStorageMock() {
  const data = new Map<string, string>();
  const mock = {
    getItem(key: string) {
      return data.has(key) ? data.get(key)! : null;
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    },
    removeItem(key: string) {
      data.delete(key);
    },
    clear() {
      data.clear();
    }
  };
  Object.defineProperty(globalThis, "sessionStorage", { value: mock, configurable: true });
  return mock;
}

describe("pwaUpdateStore", () => {
  let storage: ReturnType<typeof installSessionStorageMock>;

  beforeEach(() => {
    storage = installSessionStorageMock();
    Object.defineProperty(globalThis, "window", {
      value: {
        setTimeout,
        clearTimeout,
        location: { reload: () => undefined }
      },
      configurable: true
    });
    storage.clear();
    usePwaUpdateStore.setState({
      visible: false,
      applying: false,
      applyUpdate: null
    });
  });

  afterEach(() => {
    storage.clear();
  });

  it("shows banner when update is available", () => {
    const apply = () => undefined;
    usePwaUpdateStore.getState().notifyUpdateAvailable(apply);
    const state = usePwaUpdateStore.getState();
    assert.equal(state.visible, true);
    assert.equal(state.applying, false);
    assert.equal(state.applyUpdate, apply);
  });

  it("respects session snooze", () => {
    storage.setItem("atlly-pwa-update-snooze", "1");
    usePwaUpdateStore.getState().notifyUpdateAvailable(() => undefined);
    assert.equal(usePwaUpdateStore.getState().visible, false);
  });

  it("does not apply until runUpdate", () => {
    let applied = 0;
    usePwaUpdateStore.getState().notifyUpdateAvailable(() => {
      applied += 1;
    });
    assert.equal(applied, 0);
    usePwaUpdateStore.getState().runUpdate();
    assert.equal(applied, 1);
    assert.equal(usePwaUpdateStore.getState().applying, true);
  });

  it("dismiss clears visible state without applying", () => {
    let applied = 0;
    usePwaUpdateStore.getState().notifyUpdateAvailable(() => {
      applied += 1;
    });
    usePwaUpdateStore.getState().dismissForSession();
    const state = usePwaUpdateStore.getState();
    assert.equal(applied, 0);
    assert.equal(state.visible, false);
    assert.equal(state.applying, false);
    assert.equal(state.applyUpdate, null);
    assert.equal(storage.getItem("atlly-pwa-update-snooze"), "1");
  });
});
