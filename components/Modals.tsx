import { React, Modal, TextInput, showToast } from "@webpack/common";
import type { RenderModalProps } from "@vencord/discord-types";
import { Category, MediaType } from "../types";
import { FMDB } from "../db";
import { getLang, t } from "../i18n";
import { settings } from "../settings";

interface RenameModalProps {
    initialName: string;
    modalProps: RenderModalProps;
    onSave: (newName: string) => void;
}

export const RenameModal: React.FC<RenameModalProps> = ({
    initialName,
    modalProps,
    onSave
}) => {
    const [name, setName] = React.useState(initialName || "");

    const handleSubmit = () => {
        if (!name.trim()) {
            showToast({ text: t("nameEmpty"), variant: "critical" } as any);
            return;
        }
        onSave(name.trim());
        modalProps.onClose();
    };

    return (
        <Modal
            {...modalProps}
            title={t("renameTitle")}
            actions={[
                {
                    text: t("cancel"),
                    variant: "secondary",
                    onClick: modalProps.onClose
                },
                {
                    text: t("save"),
                    variant: "primary",
                    onClick: handleSubmit
                }
            ]}
        >
            <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "8px 0" }}>
                <div>
                    <label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "#ffffff" }}>
                        {t("nameLabel")}
                    </label>
                    <TextInput
                        value={name}
                        onChange={(val: string) => setName(val)}
                        onKeyDown={(e: React.KeyboardEvent) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                handleSubmit();
                            }
                        }}
                        maxLength={80}
                        autoFocus
                    />
                </div>
            </div>
        </Modal>
    );
};

interface CategoryModalProps {
    type: MediaType;
    initialData?: Category;
    modalProps: RenderModalProps;
    onSave: (data: { name: string; color: string }) => void;
}

export const CategoryModal: React.FC<CategoryModalProps> = ({
    initialData,
    modalProps,
    onSave
}) => {
    const [name, setName] = React.useState(initialData?.name || "");
    const [color, setColor] = React.useState(initialData?.color || "#5865F2");

    const defaultColors = [
        "#5865F2", "#57F287", "#FEE75C", "#EB459E",
        "#ED4245", "#FFFFFF", "#99AAB5", "#2C2F33"
    ];

    const handleSubmit = () => {
        if (!name.trim()) {
            showToast({ text: t("categoryEmpty"), variant: "critical" } as any);
            return;
        }
        onSave({ name: name.trim(), color });
        modalProps.onClose();
    };

    return (
        <Modal
            {...modalProps}
            title={initialData ? t("editCategory") : t("createCategory")}
            actions={[
                {
                    text: t("cancel"),
                    variant: "secondary",
                    onClick: modalProps.onClose
                },
                {
                    text: t("save"),
                    variant: "primary",
                    onClick: handleSubmit
                }
            ]}
        >
            <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "8px 0" }}>
                <div>
                    <label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "#ffffff" }}>
                        {t("categoryName")}
                    </label>
                    <TextInput
                        value={name}
                        onChange={(val: string) => setName(val)}
                        onKeyDown={(e: React.KeyboardEvent) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                handleSubmit();
                            }
                        }}
                        placeholder={t("categoryPlaceholder")}
                        maxLength={30}
                        autoFocus
                    />
                </div>
                <div>
                    <label style={{ display: "block", marginBottom: 6, fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "#ffffff" }}>
                        {t("categoryColor")}
                    </label>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <input
                            type="color"
                            value={color}
                            onChange={(e) => setColor(e.target.value)}
                            style={{ width: 40, height: 40, border: "none", borderRadius: 8, cursor: "pointer", background: "none" }}
                        />
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {defaultColors.map((c) => (
                                <div
                                    key={c}
                                    onClick={() => setColor(c)}
                                    style={{
                                        width: 24,
                                        height: 24,
                                        borderRadius: "50%",
                                        backgroundColor: c,
                                        cursor: "pointer",
                                        border: color === c ? "2px solid white" : "2px solid transparent",
                                        boxShadow: color === c ? "0 0 6px rgba(0,0,0,0.5)" : "none"
                                    }}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

interface SettingsModalProps {
    modalProps: RenderModalProps;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ modalProps }) => {
    const [lang, setLang] = React.useState<"es" | "en">(() => getLang());
    const [sortOrder, setSortOrder] = React.useState<"newest" | "oldest">(() => (settings.store as any).sortOrder ?? "newest");
    const [videoPreview, setVideoPreview] = React.useState<boolean>(() => settings.store.videoPreview ?? true);
    const [mutePreview, setMutePreview] = React.useState<boolean>(() => settings.store.mutePreview ?? false);
    const [mediaVolume, setMediaVolume] = React.useState<number>(() => settings.store.mediaVolume ?? 25);
    const [sendInstantly, setSendInstantly] = React.useState<boolean>(() => settings.store.sendInstantly ?? true);
    const [allowCaching, setAllowCaching] = React.useState<boolean>(() => settings.store.allowCaching ?? false);
    const [stats, setStats] = React.useState<{ count: number; totalBytes: number }>({ count: 0, totalBytes: 0 });
    const [loadingStats, setLoadingStats] = React.useState(true);

    const refreshStats = async () => {
        setLoadingStats(true);
        const data = await FMDB.getCacheStats();
        setStats(data);
        setLoadingStats(false);
    };

    React.useEffect(() => {
        refreshStats();
    }, []);

    const notifySettingsChanged = () => {
        window.dispatchEvent(new CustomEvent("FM_SETTINGS_UPDATED"));
    };

    const handleChangeLang = (next: "es" | "en") => {
        settings.store.language = next;
        setLang(next);
        window.dispatchEvent(new CustomEvent("FM_LANG_UPDATED", { detail: { lang: next } }));
        notifySettingsChanged();
    };

    const handleChangeSortOrder = (next: "newest" | "oldest") => {
        (settings.store as any).sortOrder = next;
        setSortOrder(next);
        notifySettingsChanged();
    };

    const handleToggleVideoPreview = () => {
        const next = !videoPreview;
        settings.store.videoPreview = next;
        setVideoPreview(next);
        notifySettingsChanged();
    };

    const handleToggleMute = () => {
        const next = !mutePreview;
        settings.store.mutePreview = next;
        setMutePreview(next);
        notifySettingsChanged();
    };

    const handleVolumeChange = (val: number) => {
        settings.store.mediaVolume = val;
        setMediaVolume(val);
        notifySettingsChanged();
    };

    const handleToggleSendInstantly = () => {
        const next = !sendInstantly;
        settings.store.sendInstantly = next;
        setSendInstantly(next);
        notifySettingsChanged();
    };

    const handleToggleAllowCaching = async () => {
        const next = !allowCaching;
        settings.store.allowCaching = next;
        setAllowCaching(next);
        if (!next) {
            await FMDB.clearAllCache();
            await refreshStats();
        }
        notifySettingsChanged();
    };

    const handleClearCache = async () => {
        if (confirm(t("confirmClearCache"))) {
            await FMDB.clearAllCache();
            showToast({ text: t("cacheCleared"), variant: "success" } as any);
            refreshStats();
        }
    };

    return (
        <Modal
            {...modalProps}
            title={t("settingsTitle")}
            actions={[
                {
                    text: t("close"),
                    variant: "primary",
                    onClick: modalProps.onClose
                }
            ]}
        >
            <div className="fm-settings-modal-body">
                <div className="fm-setting-row">
                    <div className="fm-setting-info">
                        <div className="fm-setting-label">{t("language")}</div>
                    </div>
                    <div className="fm-lang-pills">
                        <button
                            type="button"
                            className={`fm-lang-pill ${lang === "es" ? "active" : ""}`}
                            onClick={() => handleChangeLang("es")}
                        >
                            Español
                        </button>
                        <button
                            type="button"
                            className={`fm-lang-pill ${lang === "en" ? "active" : ""}`}
                            onClick={() => handleChangeLang("en")}
                        >
                            English
                        </button>
                    </div>
                </div>

                <div className="fm-setting-row">
                    <div className="fm-setting-info">
                        <div className="fm-setting-label">{t("sortOrder")}</div>
                        <div className="fm-setting-desc">{t("sortOrderDesc")}</div>
                    </div>
                    <div className="fm-lang-pills">
                        <button
                            type="button"
                            className={`fm-lang-pill ${sortOrder === "newest" ? "active" : ""}`}
                            onClick={() => handleChangeSortOrder("newest")}
                        >
                            {t("newestFirst")}
                        </button>
                        <button
                            type="button"
                            className={`fm-lang-pill ${sortOrder === "oldest" ? "active" : ""}`}
                            onClick={() => handleChangeSortOrder("oldest")}
                        >
                            {t("oldestFirst")}
                        </button>
                    </div>
                </div>

                <div className="fm-setting-row">
                    <div className="fm-setting-info">
                        <div className="fm-setting-label">{t("videoHoverPlay")}</div>
                        <div className="fm-setting-desc">{t("videoHoverPlayDesc")}</div>
                    </div>
                    <button
                        type="button"
                        className={`fm-switch ${videoPreview ? "checked" : ""}`}
                        onClick={handleToggleVideoPreview}
                    >
                        <span className="fm-switch-knob" />
                    </button>
                </div>

                <div className="fm-setting-row">
                    <div className="fm-setting-info">
                        <div className="fm-setting-label">{t("mutePreview")}</div>
                        <div className="fm-setting-desc">{t("mutePreviewDesc")}</div>
                    </div>
                    <button
                        type="button"
                        className={`fm-switch ${mutePreview ? "checked" : ""}`}
                        onClick={handleToggleMute}
                    >
                        <span className="fm-switch-knob" />
                    </button>
                </div>

                <div className="fm-setting-row fm-setting-col">
                    <div className="fm-setting-header-line">
                        <div className="fm-setting-label">{t("previewVolume")}</div>
                        <span className="fm-setting-badge">{mutePreview ? "0%" : `${mediaVolume}%`}</span>
                    </div>
                    <input
                        type="range"
                        min={0}
                        max={100}
                        value={mediaVolume}
                        disabled={mutePreview}
                        onChange={(e) => handleVolumeChange(Number(e.target.value))}
                        className="fm-volume-slider"
                    />
                </div>

                <div className="fm-setting-row">
                    <div className="fm-setting-info">
                        <div className="fm-setting-label">{t("sendInstantlyLabel")}</div>
                        <div className="fm-setting-desc">{t("sendInstantlyDesc")}</div>
                    </div>
                    <button
                        type="button"
                        className={`fm-switch ${sendInstantly ? "checked" : ""}`}
                        onClick={handleToggleSendInstantly}
                    >
                        <span className="fm-switch-knob" />
                    </button>
                </div>

                <div className="fm-setting-row">
                    <div className="fm-setting-info">
                        <div className="fm-setting-label">{t("localCacheLabel")}</div>
                        <div className="fm-setting-desc">{t("localCacheDesc")}</div>
                    </div>
                    <button
                        type="button"
                        className={`fm-switch ${allowCaching ? "checked" : ""}`}
                        onClick={handleToggleAllowCaching}
                    >
                        <span className="fm-switch-knob" />
                    </button>
                </div>

                <div className="fm-cache-stats-box">
                    <div className="fm-cache-stats-lines">
                        <div className="fm-cache-stat-line">
                            <span>{t("cachedItems")}</span>
                            <strong>{loadingStats ? "..." : stats.count}</strong>
                        </div>
                        <div className="fm-cache-stat-line">
                            <span>{t("cacheSize")}</span>
                            <strong>{loadingStats ? "..." : FMDB.formatSize(stats.totalBytes)}</strong>
                        </div>
                    </div>
                    {stats.count > 0 && (
                        <button
                            type="button"
                            className="fm-clear-cache-btn"
                            onClick={handleClearCache}
                        >
                            {t("clearCache")}
                        </button>
                    )}
                </div>
            </div>
        </Modal>
    );
};
