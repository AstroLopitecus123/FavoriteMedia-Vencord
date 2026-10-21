import * as DataStore from "@api/DataStore";
import { RestAPI } from "@webpack/common";
import { AllData, MediaItem, MediaType, TypeData } from "./types";
import { settings } from "./settings";

const DB_NAME = "FavoriteMedia";
const CACHE_STORE = "FMCache";

const memoryStore: Record<MediaType, TypeData> = {
    image: { medias: [], categories: [] },
    video: { medias: [], categories: [] },
    audio: { medias: [], categories: [] },
    file: { medias: [], categories: [] },
    gif: { medias: [], categories: [] }
};

const pendingRefreshes = new Map<string, Promise<string | null>>();

export async function initStorage() {
    for (const type of ["image", "video", "audio", "file", "gif"] as MediaType[]) {
        try {
            const data = await DataStore.get<TypeData>(`FavoriteMedia_${type}`);
            if (data && Array.isArray(data.medias)) {
                const validMedias = data.medias.filter(m => m?.url && !m.url.startsWith("data:") && !m.url.startsWith("blob:") && !m.url.startsWith("image/") && (m.url.startsWith("http://") || m.url.startsWith("https://")));
                memoryStore[type] = {
                    medias: validMedias,
                    categories: Array.isArray(data.categories) ? data.categories : []
                };
                if (validMedias.length !== data.medias.length) {
                    await DataStore.set(`FavoriteMedia_${type}`, memoryStore[type]);
                }
            }
        } catch (e) {
            console.error(`[FavoriteMedia] Error loading ${type}:`, e);
        }
    }

    if (memoryStore.gif.medias.length > 0) {
        let changed = false;
        for (const g of memoryStore.gif.medias) {
            if (!memoryStore.image.medias.some((m) => isSameMedia(m, g.url))) {
                memoryStore.image.medias.push({ ...g, ext: g.ext || ".gif" });
                changed = true;
            }
        }
        memoryStore.gif.medias = [];
        await DataStore.set("FavoriteMedia_gif", memoryStore.gif);
        if (changed) {
            await DataStore.set("FavoriteMedia_image", memoryStore.image);
        }
    }

    if (!settings.store.allowCaching) {
        FMDB.clearAllCache();
    }

    window.dispatchEvent(new CustomEvent("FM_DATA_UPDATED"));
    refreshAllExpiredUrls();
}

export function isDiscordCdnUrl(url?: string): boolean {
    if (!url) return false;
    try {
        const u = new URL(url);
        return (
            (u.hostname === "cdn.discordapp.com" || u.hostname === "media.discordapp.net") &&
            u.pathname.startsWith("/attachments/")
        );
    } catch {
        return false;
    }
}

export function isDiscordUrlExpired(url?: string): boolean {
    if (!url || !isDiscordCdnUrl(url)) return false;
    try {
        const u = new URL(url);
        const ex = u.searchParams.get("ex");
        if (!ex) return true;
        const expMs = parseInt(ex, 16) * 1000;
        if (Number.isNaN(expMs)) return true;
        return Date.now() >= expMs - 30 * 60 * 1000;
    } catch {
        return false;
    }
}

export async function refreshDiscordUrlsBatch(urls: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    const unique = Array.from(new Set(urls.filter(isDiscordCdnUrl)));
    if (unique.length === 0) return result;

    for (let i = 0; i < unique.length; i += 50) {
        const chunk = unique.slice(i, i + 50);
        try {
            const res = await RestAPI.post({
                url: "/attachments/refresh-urls",
                body: { attachment_urls: chunk }
            });
            const list = res?.body?.refreshed_urls;
            if (Array.isArray(list)) {
                for (const item of list) {
                    if (item?.original && item?.refreshed) {
                        const cleaned = cleanUrl(item.refreshed);
                        result.set(item.original, cleaned);
                        result.set(normalizeUrlBase(item.original), cleaned);
                    }
                }
            }
        } catch (e) {
            console.warn("[FavoriteMedia] Could not refresh attachment URLs:", e);
        }
    }

    return result;
}

export async function refreshSingleDiscordUrl(url: string): Promise<string | null> {
    if (!isDiscordCdnUrl(url)) return url;
    const base = normalizeUrlBase(url);
    const existing = pendingRefreshes.get(base);
    if (existing) return existing;

    const promise = (async () => {
        try {
            const map = await refreshDiscordUrlsBatch([url]);
            return map.get(url) || map.get(base) || null;
        } finally {
            pendingRefreshes.delete(base);
        }
    })();

    pendingRefreshes.set(base, promise);
    return promise;
}

export async function refreshExpiredForType(type: MediaType): Promise<boolean> {
    const data = memoryStore[type];
    if (!data || data.medias.length === 0) return false;

    const toRefresh: string[] = [];
    for (const m of data.medias) {
        if (isDiscordUrlExpired(m.url)) toRefresh.push(m.url);
        if (m.src && m.src !== m.url && isDiscordUrlExpired(m.src)) toRefresh.push(m.src);
        if (m.poster && isDiscordUrlExpired(m.poster)) toRefresh.push(m.poster);
    }

    if (toRefresh.length === 0) return false;

    const refreshedMap = await refreshDiscordUrlsBatch(toRefresh);
    if (refreshedMap.size === 0) return false;

    let anyChanged = false;
    const updatedMedias = data.medias.map((m) => {
        let itemChanged = false;
        let nextUrl = m.url;
        let nextSrc = m.src;
        let nextPoster = m.poster;

        const rUrl = refreshedMap.get(m.url) || refreshedMap.get(normalizeUrlBase(m.url));
        if (rUrl && rUrl !== m.url) {
            nextUrl = rUrl;
            itemChanged = true;
        }

        if (m.src) {
            const rSrc = refreshedMap.get(m.src) || refreshedMap.get(normalizeUrlBase(m.src));
            if (rSrc && rSrc !== m.src) {
                nextSrc = rSrc;
                itemChanged = true;
            }
        } else if (rUrl) {
            nextSrc = rUrl;
            itemChanged = true;
        }

        if (m.poster) {
            const rPoster = refreshedMap.get(m.poster) || refreshedMap.get(normalizeUrlBase(m.poster));
            if (rPoster && rPoster !== m.poster) {
                nextPoster = rPoster;
                itemChanged = true;
            }
        }

        if (itemChanged) {
            anyChanged = true;
            return { ...m, url: nextUrl, src: nextSrc, poster: nextPoster };
        }
        return m;
    });

    if (anyChanged) {
        FMDB.setStoredData(type, { ...data, medias: updatedMedias });
    }
    return anyChanged;
}

export async function refreshAllExpiredUrls() {
    for (const type of ["image", "video", "audio", "file"] as MediaType[]) {
        await refreshExpiredForType(type);
    }
}

export async function refreshMediaItemUrl(media: MediaItem, type: MediaType): Promise<MediaItem> {
    const candidates = [media.url, media.src, media.poster].filter((u): u is string => Boolean(u && isDiscordCdnUrl(u)));
    if (candidates.length === 0) return media;

    const map = await refreshDiscordUrlsBatch(candidates);
    if (map.size === 0) return media;

    const nextUrl = map.get(media.url) || map.get(normalizeUrlBase(media.url)) || media.url;
    const nextSrc = (media.src && (map.get(media.src) || map.get(normalizeUrlBase(media.src)))) || nextUrl;
    const nextPoster = (media.poster && (map.get(media.poster) || map.get(normalizeUrlBase(media.poster)))) || media.poster;

    if (nextUrl !== media.url || nextSrc !== media.src || nextPoster !== media.poster) {
        const latest = FMDB.getStoredData(type);
        const updatedMedias = latest.medias.map((m) =>
            isSameMedia(m, media.url) ? { ...m, url: nextUrl, src: nextSrc, poster: nextPoster } : m
        );
        FMDB.setStoredData(type, { ...latest, medias: updatedMedias });
        return { ...media, url: nextUrl, src: nextSrc, poster: nextPoster };
    }

    return media;
}

export class FMDB {
    private static dbPromise: Promise<IDBDatabase> | null = null;

    static async open(): Promise<IDBDatabase> {
        if (this.dbPromise) return this.dbPromise;

        this.dbPromise = new Promise((resolve, reject) => {
            const request = window.indexedDB.open(DB_NAME, 5);
            request.onerror = () => {
                this.dbPromise = null;
                reject(new Error(`Failed to open IndexedDB ${DB_NAME}: ${request.error?.message}`));
            };
            request.onsuccess = () => resolve(request.result);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(CACHE_STORE)) {
                    db.createObjectStore(CACHE_STORE);
                }
            };
        });

        return this.dbPromise;
    }

    static async getCache(key: string): Promise<ArrayBuffer | null> {
        try {
            const db = await this.open();
            return await new Promise((resolve) => {
                const tx = db.transaction(CACHE_STORE, "readonly");
                const store = tx.objectStore(CACHE_STORE);
                const req = store.get(key);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => resolve(null);
            });
        } catch {
            return null;
        }
    }

    static async setCache(key: string, data: ArrayBuffer): Promise<void> {
        try {
            const db = await this.open();
            await new Promise<void>((resolve, reject) => {
                const tx = db.transaction(CACHE_STORE, "readwrite");
                const store = tx.objectStore(CACHE_STORE);
                store.put(data, key);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
        } catch (e) {
            console.error("[FavoriteMedia] Error saving cache:", e);
        }
    }

    static async deleteCache(key: string): Promise<void> {
        try {
            const db = await this.open();
            await new Promise<void>((resolve) => {
                const tx = db.transaction(CACHE_STORE, "readwrite");
                const store = tx.objectStore(CACHE_STORE);
                store.delete(key);
                tx.oncomplete = () => resolve();
                tx.onerror = () => resolve();
            });
        } catch { }
    }

    static async clearAllCache(): Promise<void> {
        try {
            const db = await this.open();
            await new Promise<void>((resolve) => {
                const tx = db.transaction(CACHE_STORE, "readwrite");
                const store = tx.objectStore(CACHE_STORE);
                store.clear();
                tx.oncomplete = () => resolve();
                tx.onerror = () => resolve();
            });
        } catch { }
    }

    static async getCacheStats(): Promise<{ count: number; totalBytes: number }> {
        try {
            const db = await this.open();
            return await new Promise((resolve) => {
                const tx = db.transaction(CACHE_STORE, "readonly");
                const store = tx.objectStore(CACHE_STORE);
                const countReq = store.count();
                countReq.onsuccess = () => {
                    const count = countReq.result;
                    const cursorReq = store.openCursor();
                    let totalBytes = 0;
                    cursorReq.onsuccess = (e) => {
                        const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
                        if (cursor) {
                            if (cursor.value?.byteLength) {
                                totalBytes += cursor.value.byteLength;
                            }
                            cursor.continue();
                        } else {
                            resolve({ count, totalBytes });
                        }
                    };
                    cursorReq.onerror = () => resolve({ count, totalBytes: 0 });
                };
                countReq.onerror = () => resolve({ count: 0, totalBytes: 0 });
            });
        } catch {
            return { count: 0, totalBytes: 0 };
        }
    }

    static getStoredData(type: MediaType): TypeData {
        return memoryStore[type] || { medias: [], categories: [] };
    }

    static setStoredData(type: MediaType, data: TypeData): void {
        try {
            memoryStore[type] = data;
            DataStore.set(`FavoriteMedia_${type}`, data);
            window.dispatchEvent(new CustomEvent("FM_DATA_UPDATED", { detail: { type } }));
        } catch (e) {
            console.error("[FavoriteMedia] Error saving data for " + type, e);
        }
    }

    static getAllData(): AllData {
        return {
            image: this.getStoredData("image"),
            video: this.getStoredData("video"),
            audio: this.getStoredData("audio"),
            file: this.getStoredData("file"),
            gif: this.getStoredData("gif")
        };
    }

    static formatSize(bytes: number): string {
        if (bytes === 0) return "0.00 B";
        const e = Math.floor(Math.log(bytes) / Math.log(1024));
        return (bytes / Math.pow(1024, e)).toFixed(2) + " " + " KMGTP".charAt(e) + "B";
    }
}

export function normalizeUrlBase(url: string): string {
    return url.split("?")[0].replace("media.discordapp.net", "cdn.discordapp.com");
}

export function cleanUrl(url: string): string {
    if (!url) return "";
    const trimmed = url.trim();
    if (trimmed.startsWith("data:") || trimmed.startsWith("blob:") || trimmed.startsWith("image/")) return "";
    try {
        const urlObj = new URL(trimmed);
        if (urlObj.protocol !== "http:" && urlObj.protocol !== "https:") return "";
        urlObj.searchParams.delete("width");
        urlObj.searchParams.delete("height");
        urlObj.searchParams.delete("quality");
        urlObj.searchParams.delete("format");
        return urlObj.toString().replace("media.discordapp.net", "cdn.discordapp.com");
    } catch {
        return "";
    }
}

export function isLinkOnlyUrl(url?: string): boolean {
    if (!url) return false;
    try {
        const u = new URL(url);
        const host = u.hostname.toLowerCase();
        const path = u.pathname.toLowerCase();
        if (host.includes("tenor.com") && path.includes("/view/")) return true;
        if (host.includes("giphy.com") && path.includes("/gifs/")) return true;
        if (host.includes("youtube.com") || host.includes("youtu.be")) return true;
        if (host.includes("twitter.com") || host.includes("x.com")) return true;
        if (host.includes("tiktok.com")) return true;
        if (host.includes("instagram.com")) return true;
        if (path.endsWith(".html") || path.endsWith(".htm") || path.endsWith(".php")) return true;
    } catch { }
    return false;
}

export function checkSameUrl(url1?: string, url2?: string): boolean {
    if (!url1 || !url2) return false;
    return url1 === url2 || normalizeUrlBase(url1) === normalizeUrlBase(url2);
}

export function isSameMedia(media: MediaItem, targetUrl?: string): boolean {
    if (!targetUrl) return false;
    return checkSameUrl(media.url, targetUrl) || Boolean(media.src && checkSameUrl(media.src, targetUrl));
}

export function getUrlName(url: string): string {
    if (!url) return "Media";
    try {
        const pathname = new URL(url).pathname;
        const filename = pathname.substring(pathname.lastIndexOf("/") + 1);
        const nameWithoutExt = filename.substring(0, filename.lastIndexOf(".")) || filename;
        return decodeURIComponent(nameWithoutExt).replace(/(_|-)/g, " ") || "Media";
    } catch {
        return "Media";
    }
}

export function getUrlExt(url: string, fallbackType: MediaType): string {
    if (!url) return "";
    try {
        const pathname = new URL(url).pathname;
        const lastDot = pathname.lastIndexOf(".");
        if (lastDot !== -1) {
            return pathname.substring(lastDot);
        }
    } catch { }
    switch (fallbackType) {
        case "image": return ".png";
        case "gif": return ".gif";
        case "video": return ".mp4";
        case "audio": return ".mp3";
        default: return "";
    }
}

export function getMimeFromExt(ext?: string, fallbackType?: MediaType): string {
    const clean = (ext || "").toLowerCase().replace(/^\./, "");
    switch (clean) {
        case "png": return "image/png";
        case "jpg":
        case "jpeg": return "image/jpeg";
        case "gif": return "image/gif";
        case "webp": return "image/webp";
        case "svg": return "image/svg+xml";
        case "avif": return "image/avif";
        case "bmp": return "image/bmp";
        case "ico": return "image/x-icon";
        case "mp4":
        case "m4v": return "video/mp4";
        case "webm": return "video/webm";
        case "mov": return "video/quicktime";
        case "mkv": return "video/x-matroska";
        case "avi": return "video/x-msvideo";
        case "mp3": return "audio/mpeg";
        case "ogg":
        case "opus": return "audio/ogg";
        case "wav": return "audio/wav";
        case "flac": return "audio/flac";
        case "m4a":
        case "aac": return "audio/mp4";
        case "pdf": return "application/pdf";
        case "zip": return "application/zip";
        case "txt": return "text/plain";
        case "json": return "application/json";
        case "doc": return "application/msword";
        case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    }
    if (fallbackType === "image") return "image/png";
    if (fallbackType === "gif") return "image/gif";
    if (fallbackType === "video") return "video/mp4";
    if (fallbackType === "audio") return "audio/mpeg";
    return "application/octet-stream";
}
