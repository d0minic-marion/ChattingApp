export default function MessageItem({ author, photoURL, text, when }) {
  return (
    <li className="msg">
      <img src={photoURL} alt="" className="avatar" />
      <div className="bubble">
        <div className="meta">
          <strong>{author}</strong>
          <span className="when"> · {when}</span>
        </div>
        <div className="text">{text}</div>
      </div>
    </li>
  );
}