import definePlugin from "@utils/types";

import { initStorage } from "./db";
import { startExpressionPickerObserver, stopExpressionPickerObserver } from "./expressionPicker";
import { settings } from "./settings";
import { startMediaObserver, stopMediaObserver } from "./mediaObserver";

import "./styles.css";

export default definePlugin({
    name: "FavoriteMedia",
    description: "Allows to favorite GIFs, images, videos, audios and files with categories, search and automatic cloud link renewal. Vencord port based on FavoriteMedia by Dastan21.",
    authors: [{ name: "astrogato14", id: 723238317595951155n }],
    settings,

    start() {
        initStorage();
        startMediaObserver();
        startExpressionPickerObserver();
    },

    stop() {
        stopMediaObserver();
        stopExpressionPickerObserver();
    }
});
