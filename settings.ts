import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const settings = definePluginSettings({
    language: {
        type: OptionType.SELECT,
        description: "Language",
        options: [
            { label: "Español", value: "es", default: true },
            { label: "English", value: "en" }
        ],
        restartNeeded: false,
        hidden: true
    },
    sortOrder: {
        type: OptionType.SELECT,
        description: "Sort Order",
        options: [
            { label: "Más nuevos arriba", value: "newest", default: true },
            { label: "Más antiguos arriba", value: "oldest" }
        ],
        restartNeeded: false,
        hidden: true
    },
    sendInstantly: {
        type: OptionType.BOOLEAN,
        description: "Send Instantly",
        default: true,
        restartNeeded: false,
        hidden: true
    },
    videoPreview: {
        type: OptionType.BOOLEAN,
        description: "Video Preview",
        default: true,
        restartNeeded: false,
        hidden: true
    },
    mutePreview: {
        type: OptionType.BOOLEAN,
        description: "Mute Preview",
        default: false,
        restartNeeded: false,
        hidden: true
    },
    allowCaching: {
        type: OptionType.BOOLEAN,
        description: "Allow Caching",
        default: false,
        restartNeeded: false,
        hidden: true
    },
    mediaVolume: {
        type: OptionType.SLIDER,
        description: "Media Volume",
        default: 25,
        markers: [0, 25, 50, 75, 100],
        restartNeeded: false,
        hidden: true
    }
});
