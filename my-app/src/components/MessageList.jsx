import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/fr";
import MessageItem from "./MessageItem";

dayjs.extend(relativeTime);
dayjs.locale("fr");

export default function MessageList({ items, loading }) {
  if (loading) return <p>Chargement des messages…</p>;
  const list = [...items].reverse();
  return (
    <ul className="messages">
      {list.map(m => (
        <MessageItem
          key={m.id}
          author={m.displayName || "???"}
          photoURL={m.photoURL || "/logo192.png"}
          text={m.text}
          when={m.createdAt?.seconds ? dayjs.unix(m.createdAt.seconds).fromNow() : "…"}
        />
      ))}
    </ul>
  );
}