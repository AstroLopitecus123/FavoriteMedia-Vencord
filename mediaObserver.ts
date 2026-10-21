import { MessageStore, showToast } from "@webpack/common";

import { cleanUrl, FMDB, getUrlExt, getUrlName, isSameMedia } from "./db";
import { t } from "./i18n";
import { fetchMediaBuffer } from "./sendMedia";
import { settings } from "./settings";
import { MediaItem, MediaType } from "./types";

const STAR_FILLED = `<svg viewBox="0 0 24 24" width="18" height="18" fill="#FEE75C"><path d="M10.81 2.86c.38-1.15 2-1.15 2.38 0l1.89 5.83h6.12c1.2 0 1.71 1.54.73 2.25l-4.95 3.6 1.9 5.82a1.25 1.25 0 0 1-1.93 1.4L12 18.16l-4.95 3.6c-.98.7-2.3-.25-1.92-1.4l1.89-5.82-4.95-3.6a1.25 1.25 0 0 1 .73-2.25h6.12l1.9-5.83Z"/></svg>`;
const STAR_OUTLINE = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M2.07 10.94a1.25 1.25 0 0 1 .73-2.25h6.12l1.9-5.83c.37-1.15 2-1.15 2.37 0l1.89 5.83h6.12c1.2 0 1.71 1.54.73 2.25l-4.95 3.6 1.9 5.82a1.25 1.25 0 0 1-1.93 1.4L12 18.16l-4.95 3.6c-.98.7-2.3-.25-1.92-1.4l1.89-5.82-4.95-3.6Zm11.55-.25h5.26l-4.25 3.09 1.62 5-4.25-3.1-4.25 3.1 1.62-5-4.25-3.1h5.26l1.62-5 1.62 5Z"/></svg>`;

const IMAGE_EXT = /\.(png|jpg|jpeg|webp|svg|bmp|ico|avif|gif)$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|mkv|avi|m4v)$/i;
const AUDIO_EXT = /\.(mp3|ogg|wav|flac|m4a|aac|opus)$/i;

let observer: MutationObserver | null = null;
let animFrame: number | null = null;

function getPathName(url: string): string {
    try {
        return new URL(url).pathname.toLowerCase();
    } catch {
        return url.split("?")[0].toLowerCase();
    }
}

export function typeFromExt(url: string): MediaType | null {
    const path = getPathName(url);
    if (IMAGE_EXT.test(path)) return "image";
    if (VIDEO_EXT.test(path)) return "video";
    if (AUDIO_EXT.test(path)) return "audio";
    const last = path.split("/").pop() || "";
    if (/\.[a-z0-9]{1,8}$/i.test(last)) return "file";
    return null;
}

interface Extracted {
    url: string;
    type: MediaType;
    poster?: string;
    src?: string;
    placement: "corner" | "inline";
    anchorEl?: HTMLElement;
}

function getMessageForContainer(container: HTMLElement) {
    const messageEl = container.closest<HTMLLIElement>('li[id^="chat-messages-"]');
    if (!messageEl?.id) return null;
    const match = messageEl.id.match(/^chat-messages-(\d+)-(\d+)$/);
    if (!match) return null;
    const [, channelId, messageId] = match;
    try {
        return MessageStore.getMessage(channelId, messageId);
    } catch {
        return null;
    }
}

function extractUrl(container: HTMLElement): Extracted | null {
    const fileNameLink = container.querySelector<HTMLAnchorElement>('a[class*="fileNameLink"]');

    const audio = container.querySelector("audio");
    if (audio || container.matches('[class*="wrapperAudio"]')) {
        const url = fileNameLink?.href || audio?.currentSrc || audio?.src || "";
        const clean = cleanUrl(url);
        if (clean) return { url: clean, type: "audio", src: clean, placement: "inline", anchorEl: fileNameLink ?? undefined };
    }

    if (fileNameLink?.href && !container.querySelector("video") && !container.querySelector('[class*="playButton"]')) {
        const clean = cleanUrl(fileNameLink.href);
        const t = typeFromExt(clean) ?? "file";
        if (t === "file" && clean) {
            return { url: clean, type: "file", src: clean, placement: "inline", anchorEl: fileNameLink };
        }
    }

    const msg = getMessageForContainer(container);

    const isVideoContainer = Boolean(
        container.querySelector("video") ||
        container.tagName === "VIDEO" ||
        container.querySelector('[class*="playButton"], [aria-label*="Play" i], [aria-label*="Reproducir" i]') ||
        container.closest('[class*="attachment_"], [class*="mosaicItemContent"]')?.querySelector('[class*="playButton"], [aria-label*="Play" i], [aria-label*="Reproducir" i]') ||
        container.querySelector('a[href*=".mp4"], a[href*=".webm"], a[href*=".mov"]') ||
        container.closest('[class*="attachment_"]')?.querySelector('a[href*=".mp4"], a[href*=".webm"], a[href*=".mov"]')
    );

    if (isVideoContainer || (msg?.attachments?.some((a: any) => a.content_type?.startsWith("video/") || /\.(mp4|webm|mov|mkv|avi|m4v)$/i.test(a.filename || a.url)) && !container.querySelector("audio"))) {
        let videoUrl = "";
        let posterUrl: string | undefined;

        if (msg?.attachments?.length) {
            const videoAtt = msg.attachments.find((a: any) => a.content_type?.startsWith("video/") || /\.(mp4|webm|mov|mkv|avi|m4v)$/i.test(a.filename || a.url));
            if (videoAtt) {
                videoUrl = cleanUrl(videoAtt.url);
                posterUrl = cleanUrl(videoAtt.proxy_url || "");
            }
        }

        if (!videoUrl && msg?.embeds?.length) {
            const videoEmbed = msg.embeds.find((e: any) => e.video || e.type === "video" || e.type === "gifv");
            if (videoEmbed) {
                videoUrl = cleanUrl(videoEmbed.video?.url || videoEmbed.url || "");
                posterUrl = cleanUrl(videoEmbed.thumbnail?.url || videoEmbed.image?.url || "");
            }
        }

        if (!videoUrl) {
            const downloadAnchor = container.querySelector<HTMLAnchorElement>('a[class*="downloadButton"], a[aria-label*="Download" i], a[aria-label*="Descargar" i], a[href*=".mp4"], a[href*=".webm"], a[href*=".mov"]')
                || container.closest('[class*="attachment_"]')?.querySelector<HTMLAnchorElement>('a[class*="downloadButton"], a[aria-label*="Download" i], a[aria-label*="Descargar" i], a[href*=".mp4"], a[href*=".webm"], a[href*=".mov"]');
            if (downloadAnchor?.href) videoUrl = cleanUrl(downloadAnchor.href);
        }

        if (!videoUrl) {
            const video = container.querySelector("video") || (container.tagName === "VIDEO" ? container as HTMLVideoElement : null);
            if (video) {
                const directSrc = video.currentSrc || video.src || video.querySelector("source")?.src || "";
                if (directSrc && !directSrc.startsWith("blob:") && !directSrc.startsWith("data:")) {
                    videoUrl = cleanUrl(directSrc);
                }
                if (video.poster && !video.poster.startsWith("blob:") && !video.poster.startsWith("data:")) {
                    posterUrl = cleanUrl(video.poster);
                }
            }
        }

        if (!videoUrl) {
            const parentAnchor = container.querySelector<HTMLAnchorElement>("a[href]") || container.closest<HTMLAnchorElement>("a[href]");
            if (parentAnchor?.href) videoUrl = cleanUrl(parentAnchor.href);
        }

        if (videoUrl) {
            if (!posterUrl) {
                const img = container.querySelector("img");
                if (img?.src && !img.src.startsWith("data:") && !img.src.startsWith("blob:")) {
                    posterUrl = cleanUrl(img.currentSrc || img.src);
                }
            }
            return {
                url: videoUrl,
                type: "video",
                poster: posterUrl || undefined,
                src: videoUrl,
                placement: "corner"
            };
        }
    }

    const img = container.querySelector("img") || (container.tagName === "IMG" ? container as HTMLImageElement : null);
    if (img?.src) {
        if (
            img.closest('[class*="avatar"]') ||
            img.closest('[class*="emoji"]') ||
            img.closest('[class*="sticker"]') ||
            img.closest('[class*="reaction"]') ||
            img.closest('[class*="embedAuthor"]') ||
            img.closest('[class*="embedFooter"]')
        ) {
            return null;
        }

        const parentAnchor = container.querySelector<HTMLAnchorElement>("a[href]") || container.closest<HTMLAnchorElement>("a[href]");
        let rawUrl = parentAnchor?.href || img.currentSrc || img.src;

        if (!rawUrl || rawUrl.startsWith("data:") || rawUrl.startsWith("blob:")) {
            const imgAtt = msg?.attachments?.find((a: any) => a.content_type?.startsWith("image/") || /\.(png|jpg|jpeg|webp|gif|svg|avif)$/i.test(a.filename || a.url));
            if (imgAtt) {
                rawUrl = imgAtt.url;
            } else if (parentAnchor?.href && !parentAnchor.href.startsWith("data:") && !parentAnchor.href.startsWith("blob:")) {
                rawUrl = parentAnchor.href;
            } else {
                return null;
            }
        }

        const clean = cleanUrl(rawUrl);
        if (!clean) return null;
        const t = typeFromExt(clean) ?? "image";
        return {
            url: clean,
            type: t === "file" ? "image" : t,
            src: cleanUrl(img.currentSrc || img.src) || clean,
            placement: "corner"
        };
    }

    return null;
}

export function toggleFavoriteMedia(url: string, type: MediaType, poster?: string, src?: string) {
    const clean = cleanUrl(url);
    if (!clean) return;
    const allowCaching = settings.store.allowCaching;
    const typeData = FMDB.getStoredData(type);
    const index = typeData.medias.findIndex(m => isSameMedia(m, clean));

    if (index !== -1) {
        const removed = typeData.medias[index];
        typeData.medias.splice(index, 1);
        FMDB.setStoredData(type, typeData);
        FMDB.deleteCache(removed.url);
        showToast({ text: t("removed"), variant: "success" } as any);
    } else {
        const newItem: MediaItem = {
            url: clean,
            src: src ? cleanUrl(src) || clean : clean,
            name: getUrlName(clean),
            ext: getUrlExt(clean, type),
            poster
        };
        typeData.medias.push(newItem);
        FMDB.setStoredData(type, typeData);

        if (allowCaching) cacheOriginal(clean, src);

        showToast({ text: t("added"), variant: "success" } as any);
    }

    updateAllStars();
}

export async function cacheOriginal(url: string, fallbackSrc?: string) {
    const res = await fetchMediaBuffer(url) ?? (fallbackSrc && fallbackSrc !== url ? await fetchMediaBuffer(fallbackSrc) : null);
    if (res) await FMDB.setCache(url, res.buf);
}

function updateStarElement(button: HTMLButtonElement, url: string, type: MediaType) {
    const clean = cleanUrl(url);
    const typeData = FMDB.getStoredData(type);
    const isFav = typeData.medias.some(m => isSameMedia(m, clean));

    button.classList.toggle("fm-favorited", isFav);
    button.title = isFav ? t("removeFavShort") : t("addFav");
    button.innerHTML = isFav ? STAR_FILLED : STAR_OUTLINE;
}

export function updateAllStars() {
    document.querySelectorAll<HTMLButtonElement>(".fm-media-hover-star").forEach(btn => {
        const { fmUrl, fmType } = btn.dataset;
        if (fmUrl && fmType) updateStarElement(btn, fmUrl, fmType as MediaType);
    });
}

function processContainer(container: HTMLElement) {
    if (!container.closest('li[id^="chat-messages-"]')) return;
    if (container.closest(".fm-picker-modal") || container.closest(".fm-ep-panel-host")) return;
    if (container.dataset.fmProcessed) return;

    if (container.matches('[class*="imageWrapper"]') && container.closest('[class*="attachment_"], [class*="mosaicItemContent"], [class*="wrapper_"], [class*="mediaPlayer"]')) {
        return;
    }

    if (container.querySelector("[data-fm-processed]") || container.parentElement?.closest("[data-fm-processed]")) return;

    const data = extractUrl(container);
    if (!data?.url) return;

    container.dataset.fmProcessed = "1";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "fm-media-hover-star";
    btn.dataset.fmUrl = data.url;
    btn.dataset.fmType = data.type;

    updateStarElement(btn, data.url, data.type);

    btn.addEventListener("click", e => {
        e.preventDefault();
        e.stopPropagation();
        toggleFavoriteMedia(data.url, data.type, data.poster, data.src);
    });

    if (data.placement === "inline" && data.anchorEl) {
        btn.classList.add("fm-inline-star");
        data.anchorEl.insertAdjacentElement("afterend", btn);
    } else {
        if (window.getComputedStyle(container).position === "static") container.style.position = "relative";
        btn.classList.add("fm-corner-star");
        container.appendChild(btn);
    }
}

function scan() {
    const selectors = [
        '[class*="wrapperAudio"]',
        '[class*="attachment_"]',
        '[class*="mosaicItemContent"]',
        'div:has(> video)',
        '[class*="imageWrapper"]'
    ];

    try {
        document.querySelectorAll<HTMLElement>(selectors.join(", ")).forEach(processContainer);
    } catch {
        document.querySelectorAll<HTMLElement>('[class*="attachment_"], [class*="wrapperAudio"], [class*="imageWrapper"]').forEach(processContainer);
    }
}

function scheduleScan() {
    if (animFrame) cancelAnimationFrame(animFrame);
    animFrame = requestAnimationFrame(() => {
        scan();
        animFrame = null;
    });
}

export function startMediaObserver() {
    scan();

    if (!observer) {
        observer = new MutationObserver(() => scheduleScan());
        observer.observe(document.body, { childList: true, subtree: true });
    }

    window.addEventListener("FM_DATA_UPDATED", updateAllStars);
    window.addEventListener("FM_LANG_UPDATED", updateAllStars);
}

export function stopMediaObserver() {
    observer?.disconnect();
    observer = null;
    if (animFrame) {
        cancelAnimationFrame(animFrame);
        animFrame = null;
    }
    window.removeEventListener("FM_DATA_UPDATED", updateAllStars);
    window.removeEventListener("FM_LANG_UPDATED", updateAllStars);

    document.querySelectorAll(".fm-media-hover-star").forEach(el => el.remove());
    document.querySelectorAll<HTMLElement>("[data-fm-processed]").forEach(el => delete el.dataset.fmProcessed);
}
