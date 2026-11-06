import { createRoot } from "react-dom/client";
import "@fontsource/ibm-plex-mono/cyrillic-400.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/cyrillic-500.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "@fontsource/cormorant-garamond/cyrillic-500.css";
import "@fontsource/cormorant-garamond/latin-500.css";
import "@fontsource/cormorant-garamond/cyrillic-600.css";
import "@fontsource/cormorant-garamond/latin-600.css";
import "@fontsource/jacquard-12/latin-400.css";
import "./styles.css";
import { App } from "./ui/App";
import { yandex } from "./yandex";

// SDK площадки поднимаем до интерфейса (на сайте это пустой вызов)
void yandex.init().finally(() => createRoot(document.getElementById("root")!).render(<App />));
