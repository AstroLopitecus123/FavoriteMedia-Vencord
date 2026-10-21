import { React, ContextMenuApi, Menu, openModal, SelectedChannelStore, showToast } from "@webpack/common";
import { Category, MediaItem, MediaType } from "../types";
import { StarIcon, AudioIcon, VideoIcon, PlayIcon, PauseIcon, getDocumentTypeStyle } from "./Icons";
import { FMDB, getMimeFromExt, isDiscordUrlExpired, isLinkOnlyUrl, refreshMediaItemUrl } from "../db";
import { fetchMediaBuffer, getFileName, sendMedia } from "../sendMedia";
import { RenameModal } from "./Modals";
import { t } from "../i18n";

interface MediaCardProps {
    media: MediaItem;
    type: MediaType;
    categories: Category[];
    alwaysSendInstantly: boolean;
    allowCaching: boolean;
    mediaVolume: number;
    videoPreview?: boolean;
    mutePreview?: boolean;
    onUnfavorite: (url: string) => void;
    onRename: (url: string, newName: string) => void;
    onMoveCategory: (url: string, categoryId?: number) => void;
    onClosePicker?: () => void;
}

function formatAudioTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

export const MediaCard: React.FC<MediaCardProps> = ({
    media,
    type,
    categories,
    alwaysSendInstantly,
    allowCaching,
    mediaVolume,
    videoPreview = true,
    mutePreview = false,
    onUnfavorite,
    onRename,
    onMoveCategory,
    onClosePicker
}) => {
    const [cachedUrl, setCachedUrl] = React.useState<string | null>(null);
    const [fallbackSrc, setFallbackSrc] = React.useState<string | null>(null);
    const [audioPlaying, setAudioPlaying] = React.useState(false);
    const [audioProgress, setAudioProgress] = React.useState(0);
    const [audioDuration, setAudioDuration] = React.useState(0);
    const [audioCurrent, setAudioCurrent] = React.useState(0);
    const triedRefreshRef = React.useRef(false);
    const videoRef = React.useRef<HTMLVideoElement>(null);
    const audioRef = React.useRef<HTMLAudioElement>(null);

    React.useEffect(() => {
        triedRefreshRef.current = false;
        setFallbackSrc(null);
        setAudioPlaying(false);
        setAudioProgress(0);
        setAudioCurrent(0);
    }, [media.url, media.src]);

    React.useEffect(() => {
        if (!videoPreview && videoRef.current) {
            videoRef.current.pause();
            videoRef.current.currentTime = 0;
        }
    }, [videoPreview]);

    React.useEffect(() => {
        let active = true;
        let objectUrl: string | null = null;

        if (allowCaching) {
            FMDB.getCache(media.url).then((buf) => {
                if (!active || !buf) return;
                const blob = new Blob([buf], { type: getMimeFromExt(media.ext, type) });
                objectUrl = URL.createObjectURL(blob);
                setCachedUrl(objectUrl);
            });
        } else {
            setCachedUrl(null);
        }

        if (isDiscordUrlExpired(media.url) || (media.src && isDiscordUrlExpired(media.src))) {
            refreshMediaItemUrl(media, type);
        }

        return () => {
            active = false;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [media.url, media.src, media.ext, type, allowCaching]);

    const activeSrc = cachedUrl || fallbackSrc || (isLinkOnlyUrl(media.url) ? (media.src || media.poster || media.url) : (media.url || media.src)) || "";
    const validPoster = media.poster && !isDiscordUrlExpired(media.poster) ? media.poster : undefined;
    const extLabel = (media.ext || ({ image: "PNG", gif: "GIF", video: "MP4", audio: "MP3", file: "FILE" } as const)[type])
        .replace(/^\./, "")
        .toUpperCase();

    const handleMediaError = async () => {
        if (triedRefreshRef.current) {
            if (media.src && media.src !== activeSrc && fallbackSrc !== media.src) {
                setFallbackSrc(media.src);
            }
            return;
        }
        triedRefreshRef.current = true;
        const refreshed = await refreshMediaItemUrl(media, type);
        if (refreshed.url && refreshed.url !== activeSrc) {
            setFallbackSrc(refreshed.url);
        } else if (refreshed.src && refreshed.src !== activeSrc) {
            setFallbackSrc(refreshed.src);
        }
    };

    const handleSendMedia = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (!SelectedChannelStore.getChannelId()) return;

        if (!e.shiftKey && onClosePicker) onClosePicker();

        try {
            await sendMedia(media, type, alwaysSendInstantly);
        } catch (err) {
            console.error("[FavoriteMedia] Error sending media:", err);
            showToast({ text: t("sendFailed"), variant: "failure" } as any);
        }
    };

    const handleDownload = async () => {
        const filename = getFileName(media, type);
        try {
            if (cachedUrl) {
                const a = document.createElement("a");
                a.href = cachedUrl;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                return;
            }

            const res = await fetchMediaBuffer(media.url) ?? (media.src && media.src !== media.url ? await fetchMediaBuffer(media.src) : null);
            if (res) {
                const blobUrl = URL.createObjectURL(new Blob([res.buf], { type: res.type || getMimeFromExt(media.ext, type) }));
                const a = document.createElement("a");
                a.href = blobUrl;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
                return;
            }
        } catch { }
        window.open(activeSrc, "_blank");
    };

    const toggleAudioPlay = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const el = audioRef.current;
        if (!el) return;

        if (audioPlaying) {
            el.pause();
        } else {
            document.querySelectorAll<HTMLAudioElement>(".fm-hidden-audio").forEach((other) => {
                if (other !== el) other.pause();
            });
            el.muted = mutePreview || mediaVolume === 0;
            el.volume = mutePreview ? 0 : mediaVolume / 100;
            el.play().catch(() => {});
        }
    };

    const handleAudioSeek = (e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        const el = audioRef.current;
        if (!el || !el.duration) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        el.currentTime = ratio * el.duration;
        setAudioProgress(ratio * 100);
        setAudioCurrent(el.currentTime);
    };

    const availableCategories = categories.filter((c) => c.id !== media.category_id);

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        ContextMenuApi.openContextMenu(e, () => (
            <Menu.Menu navId="fm-media-context-menu" onClose={ContextMenuApi.closeContextMenu} aria-label="Media Menu">
                <Menu.MenuItem
                    id="fm-rename"
                    label={t("rename")}
                    action={() => {
                        openModal((props) => (
                            <RenameModal
                                modalProps={props}
                                initialName={media.name}
                                onSave={(newName) => onRename(media.url, newName)}
                            />
                        ));
                    }}
                />
                <Menu.MenuItem
                    id="fm-copy-link"
                    label={t("copyLink")}
                    action={() => {
                        navigator.clipboard.writeText(activeSrc);
                        showToast({ text: t("linkCopied"), variant: "success" } as any);
                    }}
                />
                {(availableCategories.length > 0 || media.category_id !== undefined) && (
                    <Menu.MenuItem
                        id="fm-move-to-category"
                        label={t("moveToCategory")}
                    >
                        {media.category_id !== undefined && (
                            <Menu.MenuItem
                                id="fm-remove-from-cat"
                                label={t("removeFromCategory")}
                                color="danger"
                                action={() => onMoveCategory(media.url, undefined)}
                            />
                        )}
                        {availableCategories.map((cat) => (
                            <Menu.MenuItem
                                key={cat.id}
                                id={`fm-cat-${cat.id}`}
                                label={cat.name}
                                action={() => onMoveCategory(media.url, cat.id)}
                            />
                        ))}
                    </Menu.MenuItem>
                )}
                <Menu.MenuItem
                    id="fm-download-media"
                    label={t("download")}
                    action={handleDownload}
                />
                <Menu.MenuSeparator />
                <Menu.MenuItem
                    id="fm-unfavorite"
                    label={t("removeFav")}
                    color="danger"
                    action={() => onUnfavorite(media.url)}
                />
            </Menu.Menu>
        ));
    };

    const renderPreview = () => {
        switch (type) {
            case "video":
                return (
                    <div className="fm-media-video-container">
                        <video
                            ref={videoRef}
                            src={activeSrc}
                            poster={validPoster}
                            preload="metadata"
                            loop
                            muted
                            playsInline
                            className="fm-media-video"
                            onError={handleMediaError}
                            onMouseEnter={() => {
                                if (!videoPreview || !videoRef.current) return;
                                const shouldMute = mutePreview || mediaVolume === 0;
                                videoRef.current.muted = shouldMute;
                                videoRef.current.volume = shouldMute ? 0 : mediaVolume / 100;
                                videoRef.current.play().catch(() => {});
                            }}
                            onMouseLeave={() => {
                                if (videoRef.current) {
                                    videoRef.current.pause();
                                    videoRef.current.currentTime = 0;
                                    videoRef.current.muted = true;
                                }
                            }}
                        />
                        <div className="fm-media-badge"><VideoIcon size={14} /></div>
                    </div>
                );
            case "audio":
                return (
                    <div className="fm-media-audio-stage">
                        <span className="fm-stage-ext-badge">{extLabel}</span>
                        <div className={`fm-audio-disc ${audioPlaying ? "playing" : ""}`}>
                            <AudioIcon size={24} />
                        </div>
                        <div
                            className="fm-audio-controls"
                            onClick={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                        >
                            <button
                                type="button"
                                className="fm-audio-play-btn"
                                onClick={toggleAudioPlay}
                            >
                                {audioPlaying ? <PauseIcon size={12} /> : <PlayIcon size={12} />}
                            </button>
                            <div className="fm-audio-progress-track" onClick={handleAudioSeek}>
                                <div
                                    className="fm-audio-progress-fill"
                                    style={{ width: `${audioProgress}%` }}
                                />
                            </div>
                            <span className="fm-audio-time">
                                {formatAudioTime(audioPlaying || audioCurrent > 0 ? audioCurrent : audioDuration)}
                            </span>
                        </div>
                        <audio
                            ref={audioRef}
                            src={activeSrc}
                            preload="metadata"
                            className="fm-hidden-audio"
                            onError={handleMediaError}
                            onLoadedMetadata={(e) => setAudioDuration(e.currentTarget.duration || 0)}
                            onPlay={() => setAudioPlaying(true)}
                            onPause={() => setAudioPlaying(false)}
                            onEnded={() => {
                                setAudioPlaying(false);
                                setAudioProgress(0);
                                setAudioCurrent(0);
                            }}
                            onTimeUpdate={(e) => {
                                const el = e.currentTarget;
                                setAudioCurrent(el.currentTime);
                                setAudioProgress(el.duration ? (el.currentTime / el.duration) * 100 : 0);
                            }}
                        />
                    </div>
                );
            case "file": {
                const docStyle = getDocumentTypeStyle(media.ext);
                return (
                    <div className="fm-media-file-stage">
                        <div
                            className="fm-file-center-icon"
                            style={{ color: docStyle.color, background: docStyle.bg, borderColor: docStyle.color }}
                        >
                            {docStyle.icon}
                        </div>
                        <span className="fm-file-corner-badge" style={{ background: docStyle.color }}>
                            {extLabel}
                        </span>
                    </div>
                );
            }
            case "gif":
            case "image":
            default:
                return (
                    <img
                        src={activeSrc}
                        alt={media.name}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="fm-media-image"
                        onError={handleMediaError}
                    />
                );
        }
    };

    return (
        <div
            className="fm-media-card"
            title={`${media.name} (${t("clickToSend")})`}
            onClick={handleSendMedia}
            onContextMenu={handleContextMenu}
            draggable
            onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", media.url);
                e.dataTransfer.effectAllowed = "copyMove";
            }}
        >
            {renderPreview()}
            <button
                type="button"
                className="fm-star-overlay-btn"
                title={t("removeFavShort")}
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onUnfavorite(media.url);
                }}
            >
                <StarIcon filled size={18} />
            </button>
            <div className="fm-media-footer">
                <span className="fm-media-name" title={media.name}>{media.name}</span>
            </div>
        </div>
    );
};
