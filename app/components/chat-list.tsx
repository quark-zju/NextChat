import DeleteIcon from "../icons/delete.svg";
import ArchiveIcon from "../icons/archive.svg";
import styles from "./home.module.scss";
import {
  DragDropContext,
  Droppable,
  Draggable,
  OnDragEndResponder,
} from "@hello-pangea/dnd";

import { useChatStore } from "../store";

import Locale from "../locales";
import { isMobileScreen } from "../utils";

export function ChatItem(props: {
  onClick?: () => void;
  onDelete?: () => void;
  onArchive?: () => void;
  archived?: boolean;
  title: string;
  count: number;
  time: string;
  selected: boolean;
  id: number;
  index: number;
}) {
  return (
    <Draggable draggableId={`${props.id}`} index={props.index}>
      {(provided) => (
        <div
          className={`${styles["chat-item"]} ${
            props.selected && styles["chat-item-selected"]
          }`}
          onClick={props.onClick}
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
        >
          <div className={styles["chat-item-title"]}>{props.title}</div>
          <div className={styles["chat-item-info"]}>
            <div className={styles["chat-item-count"]}>
              {Locale.ChatItem.ChatItemCount(props.count)}
            </div>
            <div className={styles["chat-item-date"]}>{props.time}</div>
          </div>
          <div
            className={styles["chat-item-archive"]}
            title={props.archived ? Locale.Home.UnarchiveChat : Locale.Home.ArchiveChat}
            onClick={(e) => {
              e.stopPropagation();
              props.onArchive?.();
            }}
          >
            <ArchiveIcon />
          </div>
          <div
            className={styles["chat-item-delete"]}
            onClick={(e) => {
              e.stopPropagation();
              props.onDelete?.();
            }}
          >
            <DeleteIcon />
          </div>
        </div>
      )}
    </Draggable>
  );
}

export function ChatList() {
  const [
    sessions,
    selectedIndex,
    showArchived,
    selectSession,
    removeSession,
    archiveSession,
    unarchiveSession,
    moveSession,
  ] =
    useChatStore((state) => [
      state.sessions,
      state.currentSessionIndex,
      state.showArchived,
      state.selectSession,
      state.removeSession,
      state.archiveSession,
      state.unarchiveSession,
      state.moveSession,
    ]);

  const visibleSessions = sessions
    .map((session, index) => ({ session, index }))
    .filter(({ session }) => !!session.archived === showArchived);

  const onDragEnd: OnDragEndResponder = (result) => {
    const { destination, source } = result;
    if (!destination) {
      return;
    }

    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    const fromSession = visibleSessions[source.index];
    const toSession = visibleSessions[destination.index];
    if (!fromSession || !toSession) return;
    moveSession(fromSession.index, toSession.index);
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <Droppable droppableId="chat-list">
        {(provided) => (
          <div
            className={styles["chat-list"]}
            ref={provided.innerRef}
            {...provided.droppableProps}
          >
            {visibleSessions.map(({ session: item, index: sessionIndex }, i) => (
              <ChatItem
                title={item.topic}
                time={item.lastUpdate}
                count={item.messages.length}
                key={item.id}
                id={item.id}
                index={i}
                archived={!!item.archived}
                selected={sessionIndex === selectedIndex}
                onClick={() => selectSession(sessionIndex)}
                onArchive={() =>
                  item.archived
                    ? unarchiveSession(sessionIndex)
                    : archiveSession(sessionIndex)
                }
                onDelete={() =>
                  (!isMobileScreen() || confirm(Locale.Home.DeleteChat)) &&
                  removeSession(sessionIndex)
                }
              />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
}
