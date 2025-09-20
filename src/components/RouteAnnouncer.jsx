import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

export default function RouteAnnouncer() {
  const location = useLocation();
  const [message, setMessage] = useState("");

  useEffect(() => {
    const main = document.getElementById("main");
    if (main) {
      main.focus({ preventScroll: false });
    }

    const pageTitle = document.title ? document.title : "Procedural Planet Studio";
    setMessage(`Navigated to ${pageTitle}`);
  }, [location]);

  return (
    <div aria-live="polite" className="sr-only" role="status">
      {message}
    </div>
  );
}
