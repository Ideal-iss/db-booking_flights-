import { createRoot } from "react-dom/client";
import "@fontsource/pixelify-sans/cyrillic-400.css";
import "@fontsource/pixelify-sans/latin-400.css";
import "@fontsource/pixelify-sans/cyrillic-700.css";
import "@fontsource/pixelify-sans/latin-700.css";
import "@fontsource/ruslan-display/cyrillic-400.css";
import "@fontsource/ruslan-display/latin-400.css";
import "@fontsource/jacquard-12/latin-400.css";
import "./styles.css";
import { App } from "./ui/App";

createRoot(document.getElementById("root")!).render(<App />);
