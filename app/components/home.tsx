"use client";

require("../polyfill");

import { useState, useEffect } from "react";

import { IconButton } from "./button";
import styles from "./home.module.scss";

import SettingsIcon from "../icons/settings.svg";
import GithubIcon from "../icons/github.svg";
import ChatGptIcon from "../icons/chatgpt.svg";

import BotIcon from "../icons/bot.svg";
import AddIcon from "../icons/add.svg";
import LoadingIcon from "../icons/three-dots.svg";
import CloseIcon from "../icons/close.svg";

import { useChatStore } from "../store";
import { useScreen } from "../store/screen";

import Locale from "../locales";
import { Chat } from "./chat";

import dynamic from "next/dynamic";
import { REPO_URL } from "../constant";
import { ErrorBoundary } from "./error";

import { useAccessStore, AccessControlStore } from "../store";

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
  const [createNewSession, currentIndex, removeSession] = useChatStore(
    (state) => [
      state.newSession,
      state.currentSessionIndex,
      state.removeSession,
    ],
  );
  const loading = !useHasHydrated();
  const [showSideBar, setShowSideBar] = useState(true);

  // setting
  const [openSettings, setOpenSettings] = useState(false);
  const config = useChatStore((state) => state.config);
  const isMobile = useScreen((screen) => screen.isMobile);

  const accessStore = useAccessStore();

  useSwitchTheme();
  useCheckHash(accessStore);

  if (loading) {
    return <Loading />;
  }

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
          <div className={styles["sidebar-title"]}>ChatNext</div>
          <div className={styles["sidebar-logo"]}>
            <ChatGptIcon />
          </div>
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
            <div className={styles["sidebar-action"] + " " + styles.mobile}>
              <IconButton
                icon={<CloseIcon />}
                onClick={() => {
                  if (confirm(Locale.Home.DeleteChat)) {
                    removeSession(currentIndex);
                  }
                }}
              />
            </div>
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
              onClick={() => {
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
  useCheckHash(accessStore);
  const [showNotice, setShowNotice] = useState(
    accessStore.accessCode.length === 0,
  );

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
          contact admin at {location?.hostname}.
        </p>
        <button onClick={() => setShowNotice(false)}>
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
