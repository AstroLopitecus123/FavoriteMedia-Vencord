import { createRoot, ExpressionPickerStore, openModal, React } from "@webpack/common";
import { MediaPicker, MediaPickerContent } from "./components/MediaPicker";
import { tabLabel } from "./i18n";
import { settings } from "./settings";
import { MediaType } from "./types";

const FM_TABS: MediaType[] = ["image", "video", "audio", "file"];

let epObserver: MutationObserver | null = null;
let navAttrObserver: MutationObserver | null = null;
let themeObserver: MutationObserver | null = null;
let themeTimers: number[] = [];
let lastActiveFmTab: MediaType = "image";
let pendingFmTab: MediaType | null = null;
let currentWrapper: HTMLElement | null = null;
let currentRoot: any = null;
let setReactTab: ((tab: MediaType | null) => void) | null = null;

let cachedActiveTabClass = "";
let cachedInactiveTabClass = "";

export function openStandaloneModal(initialType: MediaType = lastActiveFmTab) {
    openModal((props) => (
        <MediaPicker
            modalProps={props}
            initialType={initialType}
            alwaysSendInstantly={settings.store.sendInstantly}
            allowCaching={settings.store.allowCaching}
            mediaVolume={settings.store.mediaVolume}
        />
    ));
}

const InlinePickerHost: React.FC = () => {
    const [activeTab, setActiveTab] = React.useState<MediaType | null>(pendingFmTab);

    React.useEffect(() => {
        setReactTab = setActiveTab;
        return () => {
            if (setReactTab === setActiveTab) setReactTab = null;
        };
    }, []);

    if (!activeTab) return null;

    return (
        <MediaPickerContent
            inline
            activeType={activeTab}
            onTypeChange={(next) => {
                lastActiveFmTab = next;
                setActiveTab(next);
            }}
            alwaysSendInstantly={settings.store.sendInstantly}
            allowCaching={settings.store.allowCaching}
            mediaVolume={settings.store.mediaVolume}
            onClosePicker={() => ExpressionPickerStore.closeExpressionPicker()}
        />
    );
};

function parseAccentColor(raw: string): string | null {
    if (!raw || raw === "transparent" || raw === "inherit") return null;
    const str = raw.trim();
    if (str.startsWith("#")) {
        let hex = str.slice(1);
        if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
        if (hex.length >= 6) {
            const r = parseInt(hex.substring(0, 2), 16);
            const g = parseInt(hex.substring(2, 4), 16);
            const b = parseInt(hex.substring(4, 6), 16);
            if (r < 18 && g < 18 && b < 18) return null;
            return `rgb(${r}, ${g}, ${b})`;
        }
    }
    const m = str.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/i);
    if (m) {
        const r = Number(m[1]);
        const g = Number(m[2]);
        const b = Number(m[3]);
        const a = m[4] !== undefined ? Number(m[4]) : 1;
        if (a < 0.25) return null;
        if (r < 18 && g < 18 && b < 18) return null;
        return `rgb(${r}, ${g}, ${b})`;
    }
    try {
        const d = document.createElement("div");
        d.style.color = str;
        if (d.style.color && d.style.color !== str) {
            return parseAccentColor(d.style.color);
        }
    } catch { }
    return null;
}

function detectThemeAccent(activeNative?: HTMLElement | null): string | null {
    const rootStyle = window.getComputedStyle(document.documentElement);
    const varNames = [
        "--main-color",
        "--hsl-main-color",
        "--accent",
        "--accent-color",
        "--theme-accent",
        "--brand-experiment",
        "--brand-500"
    ];
    for (const name of varNames) {
        const val = rootStyle.getPropertyValue(name).trim();
        if (val) {
            const parsed = parseAccentColor(val);
            if (parsed) return parsed;
        }
    }

    if (activeNative) {
        const bg = window.getComputedStyle(activeNative).backgroundColor;
        let parsed = parseAccentColor(bg);
        if (parsed) return parsed;

        const afterBg = window.getComputedStyle(activeNative, "::after").backgroundColor;
        parsed = parseAccentColor(afterBg);
        if (parsed) return parsed;

        const beforeBg = window.getComputedStyle(activeNative, "::before").backgroundColor;
        parsed = parseAccentColor(beforeBg);
        if (parsed) return parsed;
    }

    const header = document.querySelector<HTMLElement>(
        "[class*='categoryFadeBlurple'], [class*='wrapper_f61d60'], [class*='wrapper__14245'], [class*='categoryItemDefaultCategorySelected']"
    );
    if (header) {
        const parsed = parseAccentColor(window.getComputedStyle(header).backgroundColor);
        if (parsed) return parsed;
    }

    return null;
}

function captureNativeThemeClasses(navList: HTMLElement, wrapper?: HTMLElement | null, forceMeasure = false) {
    const nativeTabs = Array.from(
        navList.querySelectorAll<HTMLElement>("#gif-picker-tab, #sticker-picker-tab, #emoji-picker-tab")
    );
    if (nativeTabs.length === 0) return;

    const activeNative =
        nativeTabs.find((el) => el.getAttribute("aria-selected") === "true") ||
        nativeTabs.find((el) => el.className.toLowerCase().includes("active"));
    const inactiveNative = nativeTabs.find((el) => el !== activeNative);

    if (inactiveNative) {
        cachedInactiveTabClass = inactiveNative.className;
    }

    if (activeNative) {
        cachedActiveTabClass = activeNative.className;

        const wasFmActive = Boolean(wrapper?.classList.contains("fm-ep-mode-active"));
        if (wasFmActive && !forceMeasure) return;

        nativeTabs.forEach((el) => el.style.setProperty("transition", "none", "important"));
        if (wasFmActive && wrapper) wrapper.classList.remove("fm-ep-mode-active");

        void activeNative.offsetWidth;
        const detected = detectThemeAccent(activeNative);
        if (detected) {
            document.documentElement.style.setProperty("--fm-theme-accent", detected);
        } else {
            document.documentElement.style.removeProperty("--fm-theme-accent");
        }

        if (wasFmActive && wrapper) wrapper.classList.add("fm-ep-mode-active");
        void activeNative.offsetWidth;
        nativeTabs.forEach((el) => el.style.removeProperty("transition"));
    }
}

function updateTabButtonsUI(navList: HTMLElement, activeType: MediaType | null) {
    const fmButtons = navList.querySelectorAll<HTMLButtonElement>(".fm-ep-tab");
    fmButtons.forEach((btn) => {
        const t = btn.dataset.fmTab as MediaType;
        const isSelected = activeType === t;
        const baseClass = isSelected
            ? (cachedActiveTabClass || cachedInactiveTabClass)
            : (cachedInactiveTabClass || cachedActiveTabClass);
        btn.className = `${baseClass} fm-ep-tab ${isSelected ? "fm-ep-tab-active" : ""}`.trim();
        btn.setAttribute("aria-selected", isSelected ? "true" : "false");
        btn.textContent = tabLabel(t);
    });
}

function activateFmTab(wrapper: HTMLElement, navList: HTMLElement, type: MediaType | null) {
    if (!wrapper.classList.contains("fm-ep-mode-active")) {
        captureNativeThemeClasses(navList, wrapper, false);
    }

    if (type) {
        lastActiveFmTab = type;
        wrapper.classList.add("fm-ep-mode-active");
    } else {
        wrapper.classList.remove("fm-ep-mode-active");
    }
    updateTabButtonsUI(navList, type);
    setReactTab?.(type);
}

function injectIntoExpressionPicker() {
    const nativeTab = document.querySelector<HTMLElement>("#emoji-picker-tab, #gif-picker-tab, #sticker-picker-tab");
    if (!nativeTab) {
        if (currentWrapper) {
            navAttrObserver?.disconnect();
            navAttrObserver = null;
            try {
                currentRoot?.unmount?.();
            } catch { }
            currentWrapper = null;
            currentRoot = null;
            setReactTab = null;
        }
        return;
    }

    const navList = nativeTab.parentElement;
    const nav = nativeTab.closest("nav") || navList?.parentElement;
    const wrapper = nav?.parentElement;
    if (!navList || !wrapper) return;

    if (navList.querySelector(".fm-ep-tab")) {
        if (pendingFmTab) {
            const tabToOpen = pendingFmTab;
            pendingFmTab = null;
            activateFmTab(wrapper, navList, tabToOpen);
        }
        return;
    }

    currentWrapper = wrapper;

    if (nav) {
        nav.style.setProperty("max-width", "100%", "important");
        nav.style.setProperty("width", "100%", "important");
        nav.style.setProperty("overflow", "hidden", "important");
        nav.style.setProperty("box-sizing", "border-box", "important");
    }

    navList.classList.add("fm-ep-navlist");
    navList.style.setProperty("max-width", "100%", "important");
    navList.style.setProperty("width", "100%", "important");
    navList.style.setProperty("overflow-x", "auto", "important");
    navList.style.setProperty("overflow-y", "hidden", "important");
    navList.style.setProperty("box-sizing", "border-box", "important");
    navList.style.setProperty("scrollbar-width", "none", "important");

    navList.addEventListener("wheel", (e: WheelEvent) => {
        if (e.deltaY !== 0) {
            e.preventDefault();
            navList.scrollLeft += e.deltaY;
        }
    }, { passive: false });

    captureNativeThemeClasses(navList, wrapper, true);

    Array.from(navList.children).forEach((child) => {
        if (child instanceof HTMLElement && !child.classList.contains("fm-ep-tab")) {
            child.addEventListener("click", () => {
                activateFmTab(wrapper, navList, null);
                requestAnimationFrame(() => captureNativeThemeClasses(navList, wrapper, false));
            });
        }
    });

    navAttrObserver?.disconnect();
    navAttrObserver = new MutationObserver((mutations) => {
        for (const m of mutations) {
            const target = m.target as HTMLElement;
            if (!target.classList.contains("fm-ep-tab") && target.getAttribute("aria-selected") === "true") {
                if (wrapper.classList.contains("fm-ep-mode-active")) {
                    activateFmTab(wrapper, navList, null);
                } else {
                    captureNativeThemeClasses(navList, wrapper, false);
                }
                break;
            }
        }
    });
    navAttrObserver.observe(navList, { subtree: true, attributes: true, attributeFilter: ["aria-selected"] });

    FM_TABS.forEach((type) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.id = `fm-${type}-picker-tab`;
        btn.setAttribute("role", "tab");
        btn.setAttribute("aria-selected", "false");
        btn.className = `${cachedInactiveTabClass || nativeTab.className} fm-ep-tab`.trim();
        btn.dataset.fmTab = type;
        btn.textContent = tabLabel(type);

        btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            activateFmTab(wrapper, navList, type);
        });

        navList.appendChild(btn);
    });

    let panelHost = wrapper.querySelector<HTMLElement>(".fm-ep-panel-host");
    if (!panelHost) {
        panelHost = document.createElement("div");
        panelHost.className = "fm-ep-panel-host";
        wrapper.appendChild(panelHost);
    }

    try {
        currentRoot = createRoot(panelHost);
        currentRoot.render(<InlinePickerHost />);
    } catch (err) {
        console.error("[FavoriteMedia] Error mounting inline picker:", err);
    }

    if (pendingFmTab) {
        const tabToOpen = pendingFmTab;
        pendingFmTab = null;
        requestAnimationFrame(() => {
            activateFmTab(wrapper, navList, tabToOpen);
        });
    }
}

export function toggleFavoriteExpressionPicker(initialType?: MediaType) {
    const targetType = initialType ?? lastActiveFmTab;
    const nativeTab = document.querySelector<HTMLElement>("#emoji-picker-tab, #gif-picker-tab, #sticker-picker-tab");

    if (nativeTab) {
        const navList = nativeTab.parentElement;
        const nav = nativeTab.closest("nav") || navList?.parentElement;
        const wrapper = nav?.parentElement;
        if (wrapper && navList) {
            if (wrapper.classList.contains("fm-ep-mode-active") && !initialType) {
                ExpressionPickerStore.closeExpressionPicker();
            } else {
                activateFmTab(wrapper, navList, targetType);
            }
            return;
        }
    }

    pendingFmTab = targetType;
    const chatEmojiBtn = document.querySelector<HTMLElement>(
        '[class*="buttons_"] [class*="emojiButton"], [class*="buttons_"] button[aria-label*="emoji" i], [class*="buttons_"] button[aria-label*="GIF" i]'
    );

    if (chatEmojiBtn) {
        chatEmojiBtn.click();
    } else {
        pendingFmTab = null;
        openStandaloneModal(targetType);
    }
}

function handleLangUpdated() {
    const navList = document.querySelector<HTMLElement>(".fm-ep-navlist");
    if (!navList) return;
    const activeBtn = navList.querySelector<HTMLButtonElement>(".fm-ep-tab.fm-ep-tab-active");
    const activeType = (activeBtn?.dataset.fmTab as MediaType) ?? null;
    updateTabButtonsUI(navList, activeType);
}

function refreshThemeAccent() {
    const navList = document.querySelector<HTMLElement>(".fm-ep-navlist");
    if (!navList) return;
    captureNativeThemeClasses(navList, currentWrapper, true);
    const activeBtn = navList.querySelector<HTMLButtonElement>(".fm-ep-tab.fm-ep-tab-active");
    const activeType = (activeBtn?.dataset.fmTab as MediaType) ?? null;
    updateTabButtonsUI(navList, activeType);
}

function handleThemeChanged() {
    themeTimers.forEach((id) => clearTimeout(id));
    themeTimers = [
        window.setTimeout(refreshThemeAccent, 20),
        window.setTimeout(refreshThemeAccent, 180),
        window.setTimeout(refreshThemeAccent, 500)
    ];
}

export function startExpressionPickerObserver() {
    injectIntoExpressionPicker();

    if (!epObserver) {
        epObserver = new MutationObserver(() => {
            injectIntoExpressionPicker();
        });
        epObserver.observe(document.body, { childList: true, subtree: true });
    }

    if (!themeObserver && document.head) {
        themeObserver = new MutationObserver(handleThemeChanged);
        themeObserver.observe(document.head, { childList: true, subtree: true, attributes: true, characterData: true });
    }

    window.addEventListener("FM_LANG_UPDATED", handleLangUpdated);
}

export function stopExpressionPickerObserver() {
    epObserver?.disconnect();
    epObserver = null;
    navAttrObserver?.disconnect();
    navAttrObserver = null;
    themeObserver?.disconnect();
    themeObserver = null;
    themeTimers.forEach((id) => clearTimeout(id));
    themeTimers = [];
    window.removeEventListener("FM_LANG_UPDATED", handleLangUpdated);

    try {
        currentRoot?.unmount?.();
    } catch { }
    currentRoot = null;
    currentWrapper?.classList.remove("fm-ep-mode-active");
    currentWrapper = null;
    setReactTab = null;

    document.querySelectorAll(".fm-ep-tab, .fm-ep-panel-host").forEach((el) => el.remove());
}
