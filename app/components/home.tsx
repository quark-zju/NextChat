"use client";

require("../polyfill");

import { useState, useEffect, useLayoutEffect } from "react";

import { IconButton } from "./button";
import styles from "./home.module.scss";

import SettingsIcon from "../icons/settings.svg";
import GithubIcon from "../icons/github.svg";
import ArchiveIcon from "../icons/archive.svg";

import BotIcon from "../icons/bot.svg";
import AddIcon from "../icons/add.svg";
import LoadingIcon from "../icons/three-dots.svg";

import { useChatStore } from "../store";
import { useScreen } from "../store/screen";

import Locale from "../locales";
import { Chat } from "./chat";

import dynamic from "next/dynamic";
import { REPO_URL } from "../constant";
import { ErrorBoundary } from "./error";
import { showToast } from "./ui-lib";

import { useAccessStore, AccessControlStore } from "../store";
import { STORAGE_WARNING_EVENT } from "../store/persist-storage";

export function Loading(props: { noLogo?: boolean }) {
  return (
    <div className={styles["loading-content"]}>
      {!props.noLogo && <BotIcon />}
      <LoadingIcon />
    </div>
  );
}

const Settings = dynamic(async () => (await import("./settings")).Settings, {
  loading: () => <Loading noLogo />,
});

const ChatList = dynamic(async () => (await import("./chat-list")).ChatList, {
  loading: () => <Loading noLogo />,
});

function useSwitchTheme() {
  const config = useChatStore((state) => state.config);

  useEffect(() => {
    document.body.classList.remove("light");
    document.body.classList.remove("dark");

    if (config.theme === "dark") {
      document.body.classList.add("dark");
    } else if (config.theme === "light") {
      document.body.classList.add("light");
    }

    const metaDescriptionDark = document.querySelector(
      'meta[name="theme-color"][media]',
    );
    const metaDescriptionLight = document.querySelector(
      'meta[name="theme-color"]:not([media])',
    );

    if (config.theme === "auto") {
      metaDescriptionDark?.setAttribute("content", "#151515");
      metaDescriptionLight?.setAttribute("content", "#fafafa");
    } else {
      const themeColor = getComputedStyle(document.body)
        .getPropertyValue("--theme-color")
        .trim();
      metaDescriptionDark?.setAttribute("content", themeColor);
      metaDescriptionLight?.setAttribute("content", themeColor);
    }
  }, [config.theme]);
}

const useHasHydrated = () => {
  const [hasHydrated, setHasHydrated] = useState<boolean>(false);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  return hasHydrated;
};

const useCheckHash = (accessStore: AccessControlStore) => {
  useEffect(() => {
    try {
      const hash = window.location.hash;
      if (hash.startsWith("#c")) {
        const code = hash.substring(2);
        accessStore.updateCode(code);
        setTimeout(() => {
          window.location.hash = "";
          window.history.replaceState(
            {},
            "",
            window.location.href.slice(0, -1),
          );
        }, 1);
      }
    } catch {}
  }, [accessStore]);
};

function _Home() {
  const [
    createNewSession,
    showArchived,
    toggleShowArchived,
    currentSessionMessageCount,
  ] = useChatStore((state) => [
    state.newSession,
    state.showArchived,
    state.toggleShowArchived,
    state.sessions[state.currentSessionIndex]?.messages.length ?? 0,
  ]);
  const isCurrentSessionEmpty = currentSessionMessageCount === 0;
  const [showSideBar, setShowSideBar] = useState(true);

  // setting
  const [openSettings, setOpenSettings] = useState(false);
  const config = useChatStore((state) => state.config);
  const isMobile = useScreen((screen) => screen.isMobile);

  const accessStore = useAccessStore();

  useSwitchTheme();
  useCheckHash(accessStore);

  useEffect(() => {
    const onStorageWarning = (event: Event) => {
      const customEvent = event as CustomEvent<{
        type: "near-limit" | "full";
      }>;

      if (customEvent.detail?.type === "full") {
        showToast(Locale.Store.StorageFull, 6000);
        return;
      }

      showToast(Locale.Store.StorageNearLimit, 5000);
    };

    window.addEventListener(STORAGE_WARNING_EVENT, onStorageWarning);
    return () => {
      window.removeEventListener(STORAGE_WARNING_EVENT, onStorageWarning);
    };
  }, []);

  return (
    <div
      className={`${
        config.tightBorder && !isMobile
          ? styles["tight-container"]
          : styles.container
      }`}
    >
      <div
        className={styles.sidebar + ` ${showSideBar && styles["sidebar-show"]}`}
      >
        <div className={styles["sidebar-header"]}>
          <div className={styles["sidebar-title"]}>NextChat</div>
          {showArchived && (
            <div className={styles["sidebar-sub-title"]}>
              {Locale.Home.ArchivedChatList}
            </div>
          )}
        </div>
        <div
          className={styles["sidebar-body"]}
          onClick={() => {
            setOpenSettings(false);
            setShowSideBar(false);
          }}
        >
          <ChatList />
        </div>

        <div className={styles["sidebar-tail"]}>
          <div className={styles["sidebar-actions"]}>
            <div className={styles["sidebar-action"]}>
              <IconButton
                icon={<SettingsIcon />}
                onClick={() => {
                  setOpenSettings(!openSettings);
                  setShowSideBar(false);
                }}
                shadow
              />
            </div>
            <div className={styles["sidebar-action"]}>
              <IconButton
                icon={<ArchiveIcon />}
                onClick={() => {
                  toggleShowArchived();
                  setOpenSettings(false);
                }}
                shadow
                className={`${styles["sidebar-action-archive"]} ${
                  showArchived ? styles["sidebar-action-active"] : ""
                }`}
                title={
                  showArchived
                    ? Locale.Home.ViewActiveChats
                    : Locale.Home.ViewArchivedChats
                }
              />
            </div>
            {null && (
              <div className={styles["sidebar-action"]}>
                <a href={REPO_URL} target="_blank">
                  <IconButton icon={<GithubIcon />} />
                  <IconButton icon={<GithubIcon />} shadow />
                </a>
              </div>
            )}
          </div>
          <div>
            <IconButton
              icon={<AddIcon />}
              text={Locale.Home.NewChat}
              disabled={isCurrentSessionEmpty}
              onClick={() => {
                if (showArchived) {
                  toggleShowArchived();
                }
                createNewSession();
                setShowSideBar(false);
              }}
              shadow
            />
          </div>
        </div>
      </div>

      <div className={styles["window-content"]}>
        {openSettings ? (
          <Settings
            closeSettings={() => {
              setOpenSettings(false);
              setShowSideBar(true);
            }}
          />
        ) : (
          <Chat
            key="chat"
            showSideBar={() => setShowSideBar(true)}
            sideBarShowing={showSideBar}
          />
        )}
      </div>
    </div>
  );
}

export function Home() {
  const accessStore = useAccessStore();
  const loading = !useHasHydrated();
  const isChineseBrowser =
    typeof navigator !== "undefined" &&
    [navigator.language, ...(navigator.languages ?? [])]
      .join(",")
      .toLowerCase()
      .includes("zh");

  useCheckHash(accessStore);
  const [showNotice, setShowNotice] = useState(
    !accessStore.noticeAccepted && !isChineseBrowser,
  );
  const [hostname, setHostname] = useState<string>("<loading>");

  useEffect(() => {
    setShowNotice(!accessStore.noticeAccepted && !isChineseBrowser);
  }, [accessStore.noticeAccepted, isChineseBrowser]);

  useLayoutEffect(() => {
    if (
      typeof window !== "undefined" &&
      typeof window.location !== "undefined"
    ) {
      const hostname = window.location.hostname;
      setHostname(hostname.replace("chat.", "").replace(".net", ""));
    }
  });

  if (loading) {
    return <Loading />;
  }

  if (showNotice) {
    return (
      <div className={styles["access-notice"]}>
        <p>
          This website is a private instance for personal use, built on the
          open-source{" "}
          <a href="https://github.com/ChatGPTNextWeb/">ChatGPTNextWeb</a>{" "}
          project. It is not affiliated with the official ChatGPT or OpenAI.
        </p>
        <p>
          Please do not enter your personal information unless you have a direct
          trust relationship with the website administrator. This site is
          designed to be used with an access code provided by the administrator,
          ensuring privacy and security.
        </p>
        <p>
          If you are not familiar with the website administrator or have any
          concerns about the site&apos;s legitimacy, please refrain from
          entering personal information. For inquiries or further information,
          contact admin <span className={styles["at"]}> </span>
          {hostname} <span className={styles["dot"]}> </span> net.
        </p>
        <button
          onClick={() => {
            accessStore.acceptNotice();
            setShowNotice(false);
          }}
        >
          I understand. I have an access code and trust the website
          administrator.
        </button>
      </div>
    );
  }
  return (
    <ErrorBoundary>
      <_Home></_Home>
    </ErrorBoundary>
  );
}
