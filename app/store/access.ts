import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { persistStorage } from "./persist-storage";
import { queryMeta } from "../utils";

export interface AccessControlStore {
  accessCode: string;
  token: string;
  noticeAccepted: boolean;

  updateCode: (_: string) => void;
  acceptNotice: () => void;
  enabledAccessControl: () => boolean;
}

export const ACCESS_KEY = "access-control";

export const useAccessStore = create<AccessControlStore>()(
  persist(
    (set, get) => ({
      token: "",
      accessCode: "",
      noticeAccepted: false,
      enabledAccessControl() {
        return true;
      },
      updateCode(code: string) {
        set((state) => ({ accessCode: code }));
      },
      acceptNotice() {
        set(() => ({ noticeAccepted: true }));
      },
    }),
    {
      name: ACCESS_KEY,
      version: 2,
      storage: createJSONStorage(() => persistStorage),
      migrate(persistedState, version) {
        const state = persistedState as AccessControlStore;
        if (version < 2) {
          state.noticeAccepted = false;
        }
        return state;
      },
    }
  )
);
