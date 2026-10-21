import { insertTextIntoChatInputBox, sendMessage } from "@utils/discord";
import { PluginNative } from "@utils/types";
import { CloudUpload as TCloudUpload } from "@vencord/discord-types";
import { CloudUploadPlatform } from "@vencord/discord-types/enums";
import { findLazy } from "@webpack";
import { ChannelStore, Constants, FluxDispatcher, MessageActions, PendingReplyStore, RestAPI, SelectedChannelStore, showToast, SnowflakeUtils, UploadHandler, UserStore } from "@webpack/common";

import { cleanUrl, FMDB, getMimeFromExt, isDiscordUrlExpired, isLinkOnlyUrl, isSameMedia, refreshMediaItemUrl, refreshSingleDiscordUrl } from "./db";
import { t } from "./i18n";
import { settings } from "./settings";
import { MediaItem, MediaType } from "./types";

const CloudUpload: typeof TCloudUpload = findLazy(m => m.prototype?.trackUploadFinished);
const Native = VencordNative.pluginHelpers?.FavoriteMedia as PluginNative<typeof import("./native")> | undefined;

function getMaxUploadSize(): number {
    const user = UserStore?.getCurrentUser?.();
    if (user?.premiumType === 2) return 500 * 1024 * 1024;
    if (user?.premiumType === 1 || user?.premiumType === 3) return 50 * 1024 * 1024;
    return 10 * 1024 * 1024;
}

async function directFetch(url: string): Promise<{ buf: ArrayBuffer; type: string; } | null> {
    try {
        const resp = await fetch(url);
        if (!resp.ok) return null;
        const buf = await resp.arrayBuffer();
        const type = resp.headers.get("content-type") || "application/octet-stream";
        return { buf, type };
    } catch {
        return null;
    }
}

async function fetchViaNative(targetUrl: string): Promise<{ buf: ArrayBuffer; type: string; } | null> {
    if (!Native?.fetchMedia) return null;
    try {
        const res = await Native.fetchMedia(targetUrl);
        if ("data" in res && res.data) {
            const bytes = res.data;
            const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
            return { buf, type: res.type };
        }
    } catch { }
    return null;
}

export async function fetchMediaBuffer(url: string): Promise<{ buf: ArrayBuffer; type: string; } | null> {
    try {
        let targetUrl = url;
        if (isDiscordUrlExpired(targetUrl)) {
            const refreshed = await refreshSingleDiscordUrl(targetUrl);
            if (refreshed) targetUrl = refreshed;
        }

        let res = await fetchViaNative(targetUrl);
        if (!res) res = await directFetch(targetUrl);

        if (!res) {
            const refreshed = await refreshSingleDiscordUrl(targetUrl);
            if (refreshed) {
                targetUrl = refreshed;
                res = await fetchViaNative(targetUrl);
                if (!res) res = await directFetch(targetUrl);
            }
        }

        return res;
    } catch (e) {
        console.warn("[FavoriteMedia] fetch failed:", url, e);
        return null;
    }
}

export function getFileName(media: MediaItem, type: MediaType): string {
    let rawExt = media.ext || ({ image: ".png", gif: ".gif", video: ".mp4", audio: ".mp3", file: "" } as const)[type];
    if (rawExt && !rawExt.startsWith(".")) rawExt = `.${rawExt}`;
    const base = (media.name || "media").trim();
    if (rawExt && base.toLowerCase().endsWith(rawExt.toLowerCase())) return base;
    return `${base}${rawExt}`;
}

function sendLink(channelId: string, url: string) {
    try {
        const reply = PendingReplyStore.getPendingReply(channelId);
        if (reply) FluxDispatcher.dispatch({ type: "DELETE_PENDING_REPLY", channelId });
        const replyOpts = reply ? MessageActions.getSendMessageOptionsForReply(reply) : {};
        sendMessage(channelId, { content: url }, true, replyOpts);
    } catch {
        insertTextIntoChatInputBox(url);
    }
}

function saveBackupUploadedUrl(media: MediaItem, type: MediaType, newAttachmentUrl: string, primaryFailed: boolean) {
    const cleaned = cleanUrl(newAttachmentUrl);
    if (!cleaned) return;
    const latest = FMDB.getStoredData(type);
    let updated = false;
    const updatedMedias = latest.medias.map((m) => {
        if (!isSameMedia(m, media.url)) return m;
        updated = true;
        return {
            ...m,
            url: primaryFailed ? cleaned : m.url,
            src: cleaned
        };
    });
    if (updated) {
        FMDB.setStoredData(type, { ...latest, medias: updatedMedias });
    }
}

export async function sendMedia(media: MediaItem, type: MediaType, instant: boolean) {
    const channelId = SelectedChannelStore.getChannelId();
    if (!channelId) return;

    let currentMedia = media;
    if (isDiscordUrlExpired(currentMedia.url) || (currentMedia.src && isDiscordUrlExpired(currentMedia.src))) {
        currentMedia = await refreshMediaItemUrl(currentMedia, type);
    }

    if (type === "gif" || isLinkOnlyUrl(currentMedia.url)) {
        sendLink(channelId, currentMedia.url);
        return;
    }

    showToast({ text: t("preparing"), variant: "message" as any });

    let buf: ArrayBuffer | null = null;
    let mime = "";
    let primaryFailed = false;

    if (settings.store.allowCaching) {
        try {
            buf = await FMDB.getCache(currentMedia.url) ?? null;
        } catch { }
    }

    if (!buf) {
        let res = await fetchMediaBuffer(currentMedia.url);
        if (!res && currentMedia.src && currentMedia.src !== currentMedia.url) {
            primaryFailed = true;
            res = await fetchMediaBuffer(currentMedia.src);
        }
        if (res) {
            buf = res.buf;
            mime = res.type;
            if (settings.store.allowCaching) {
                FMDB.setCache(currentMedia.url, buf);
            }
        }
    }

    if (!buf) {
        showToast({ text: t("downloadFailed"), variant: "failure" as any });
        sendLink(channelId, currentMedia.src || currentMedia.url);
        return;
    }

    const maxUpload = getMaxUploadSize();
    if (buf.byteLength > maxUpload) {
        showToast({ text: t("tooBig"), variant: "message" as any });
        sendLink(channelId, currentMedia.src || currentMedia.url);
        return;
    }

    const finalMime = (mime && mime !== "application/octet-stream") ? mime : getMimeFromExt(currentMedia.ext, type);
    const file = new File([buf], getFileName(currentMedia, type), { type: finalMime });

    if (!instant) {
        const channel = ChannelStore.getChannel(channelId);
        UploadHandler.promptToUpload([file], channel, 0);
        return;
    }

    const reply = PendingReplyStore.getPendingReply(channelId);
    if (reply) FluxDispatcher.dispatch({ type: "DELETE_PENDING_REPLY", channelId });

    const upload = new CloudUpload({
        file,
        isThumbnail: false,
        platform: CloudUploadPlatform.WEB,
    }, channelId);

    upload.on("complete", () => {
        RestAPI.post({
            url: Constants.Endpoints.MESSAGES(channelId),
            body: {
                channel_id: channelId,
                content: "",
                nonce: SnowflakeUtils.fromTimestamp(Date.now()),
                sticker_ids: [],
                type: 0,
                attachments: [{
                    id: "0",
                    filename: upload.filename,
                    uploaded_filename: upload.uploadedFilename,
                }],
                message_reference: reply ? MessageActions.getSendMessageOptionsForReply(reply)?.messageReference : null,
            }
        }).then((res: any) => {
            const newUrl = res?.body?.attachments?.[0]?.url;
            if (newUrl) {
                saveBackupUploadedUrl(currentMedia, type, newUrl, primaryFailed);
            }
        }).catch(() => showToast({ text: t("sendFailed"), variant: "failure" as any }));
    });
    upload.on("error", () => {
        showToast({ text: t("uploadFailed"), variant: "failure" as any });
        sendLink(channelId, currentMedia.src || currentMedia.url);
    });

    upload.upload();
}
