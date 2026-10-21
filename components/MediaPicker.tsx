import { React, Modal, openModal, showToast } from "@webpack/common";
import type { RenderModalProps } from "@vencord/discord-types";
import { Category, MediaType, TypeData } from "../types";
import { FMDB, isSameMedia, refreshExpiredForType } from "../db";
import { settings } from "../settings";
import { searchLabel, sectionLabel, t, tabLabel } from "../i18n";
import { CategoryCard } from "./CategoryCard";
import { MediaCard } from "./MediaCard";
import { CategoryModal, SettingsModal } from "./Modals";
import {
    ImageIcon,
    VideoIcon,
    AudioIcon,
    FileIcon,
    GifIcon,
    FolderIcon,
    SearchIcon,
    PlusIcon,
    ArrowBackIcon,
    CloseIcon,
    SettingsIcon
} from "./Icons";

export interface MediaPickerContentProps {
    initialType?: MediaType;
    activeType?: MediaType;
    onTypeChange?: (type: MediaType) => void;
    inline?: boolean;
    alwaysSendInstantly: boolean;
    allowCaching: boolean;
    mediaVolume: number;
    onClosePicker?: () => void;
}

export const MediaPickerContent: React.FC<MediaPickerContentProps> = ({
    initialType = "image",
    activeType,
    onTypeChange,
    inline = false,
    onClosePicker
}) => {
    const [internalType, setInternalType] = React.useState<MediaType>(initialType);
    const currentType = activeType ?? internalType;

    const setCurrentType = (next: MediaType) => {
        setInternalType(next);
        onTypeChange?.(next);
    };

    const [typeData, setTypeData] = React.useState<TypeData>(() => FMDB.getStoredData(currentType));
    const [activeCategoryId, setActiveCategoryId] = React.useState<number | undefined>(undefined);
    const [searchQuery, setSearchQuery] = React.useState("");
    const [, setTick] = React.useState(0);

    const videoPreview = settings.store.videoPreview ?? true;
    const mutePreview = settings.store.mutePreview ?? false;
    const mediaVolume = settings.store.mediaVolume ?? 25;
    const alwaysSendInstantly = settings.store.sendInstantly ?? true;
    const allowCaching = settings.store.allowCaching ?? false;

    const reloadData = React.useCallback((type: MediaType = currentType) => {
        const data = FMDB.getStoredData(type);
        setTypeData({
            medias: [...data.medias],
            categories: [...data.categories]
        });
    }, [currentType]);

    React.useEffect(() => {
        reloadData(currentType);
        setActiveCategoryId(undefined);
        setSearchQuery("");
        refreshExpiredForType(currentType);
    }, [currentType, reloadData]);

    React.useEffect(() => {
        const handler = (e: any) => {
            if (!e.detail?.type || e.detail.type === currentType) {
                reloadData(currentType);
            }
        };
        const refreshUI = () => setTick((x) => x + 1);
        window.addEventListener("FM_DATA_UPDATED", handler);
        window.addEventListener("FM_LANG_UPDATED", refreshUI);
        window.addEventListener("FM_SETTINGS_UPDATED", refreshUI);
        return () => {
            window.removeEventListener("FM_DATA_UPDATED", handler);
            window.removeEventListener("FM_LANG_UPDATED", refreshUI);
            window.removeEventListener("FM_SETTINGS_UPDATED", refreshUI);
        };
    }, [currentType, reloadData]);

    const handleCreateCategory = (newCat: { name: string; color: string }) => {
        const latest = FMDB.getStoredData(currentType);
        const nextId = latest.categories.reduce((max, c) => Math.max(max, c.id), 0) + 1;
        const updated: TypeData = {
            ...latest,
            categories: [
                ...latest.categories,
                { id: nextId, name: newCat.name, color: newCat.color, category_id: activeCategoryId }
            ]
        };
        FMDB.setStoredData(currentType, updated);
        reloadData(currentType);
        showToast({ text: t("categoryCreated"), variant: "success" } as any);
    };

    const handleEditCategory = (targetCat: Category) => {
        const targetType = currentType;
        openModal((props) => (
            <CategoryModal
                modalProps={props}
                type={targetType}
                initialData={targetCat}
                onSave={({ name, color }) => {
                    const latest = FMDB.getStoredData(targetType);
                    const updatedCategories = latest.categories.map((c) =>
                        c.id === targetCat.id ? { ...c, name, color } : c
                    );
                    FMDB.setStoredData(targetType, { ...latest, categories: updatedCategories });
                    reloadData(targetType);
                    showToast({ text: t("categoryUpdated"), variant: "success" } as any);
                }}
            />
        ));
    };

    const handleDeleteCategory = (catId: number) => {
        const latest = FMDB.getStoredData(currentType);
        const targetCat = latest.categories.find((c) => c.id === catId);
        const parentId = targetCat?.category_id;
        const updatedCategories = latest.categories
            .filter((c) => c.id !== catId)
            .map((c) => (c.category_id === catId ? { ...c, category_id: parentId } : c));
        const updatedMedias = latest.medias.map((m) =>
            m.category_id === catId ? { ...m, category_id: parentId } : m
        );
        FMDB.setStoredData(currentType, { medias: updatedMedias, categories: updatedCategories });
        if (activeCategoryId === catId) setActiveCategoryId(parentId);
        reloadData(currentType);
        showToast({ text: t("categoryDeleted"), variant: "success" } as any);
    };

    const handleUnfavorite = (url: string) => {
        const latest = FMDB.getStoredData(currentType);
        const existing = latest.medias.find((m) => isSameMedia(m, url));
        const updatedMedias = latest.medias.filter((m) => !isSameMedia(m, url));
        FMDB.setStoredData(currentType, { ...latest, medias: updatedMedias });
        FMDB.deleteCache(existing?.url || url);
        reloadData(currentType);
        showToast({ text: t("removed"), variant: "success" } as any);
    };

    const handleRenameMedia = (url: string, newName: string) => {
        const latest = FMDB.getStoredData(currentType);
        const updatedMedias = latest.medias.map((m) =>
            isSameMedia(m, url) ? { ...m, name: newName } : m
        );
        FMDB.setStoredData(currentType, { ...latest, medias: updatedMedias });
        reloadData(currentType);
        showToast({ text: t("renamed"), variant: "success" } as any);
    };

    const handleMoveCategory = (url: string, categoryId?: number) => {
        const latest = FMDB.getStoredData(currentType);
        const updatedMedias = latest.medias.map((m) =>
            isSameMedia(m, url) ? { ...m, category_id: categoryId } : m
        );
        FMDB.setStoredData(currentType, { ...latest, medias: updatedMedias });
        reloadData(currentType);
        showToast({ text: t("moved"), variant: "success" } as any);
    };

    const activeCategory = typeData.categories.find((c) => c.id === activeCategoryId);

    const filteredCategories = typeData.categories.filter((c) => {
        if (searchQuery) return c.name.toLowerCase().includes(searchQuery.toLowerCase());
        return c.category_id === activeCategoryId;
    });

    const filteredMedias = typeData.medias.filter((m) => {
        const matchesSearch = searchQuery
            ? m.name.toLowerCase().includes(searchQuery.toLowerCase()) || m.url.toLowerCase().includes(searchQuery.toLowerCase())
            : true;
        if (!matchesSearch) return false;

        if (searchQuery) return true;
        return m.category_id === activeCategoryId;
    });

    const sortOrder = (settings.store as any).sortOrder ?? "newest";
    const orderedMedias = sortOrder === "oldest" ? filteredMedias : [...filteredMedias].reverse();

    const tabs: { type: MediaType; label: string; icon: React.ReactNode }[] = [
        { type: "image", label: tabLabel("image"), icon: <ImageIcon size={18} /> },
        { type: "video", label: tabLabel("video"), icon: <VideoIcon size={18} /> },
        { type: "audio", label: tabLabel("audio"), icon: <AudioIcon size={18} /> },
        { type: "file", label: tabLabel("file"), icon: <FileIcon size={18} /> }
    ];

    return (
        <div className={`fm-picker-container ${inline ? "fm-picker-inline" : ""}`}>
            {!inline && (
                <div className="fm-tabs">
                    {tabs.map((tab) => (
                        <button
                            key={tab.type}
                            type="button"
                            className={`fm-tab-button ${currentType === tab.type ? "fm-tab-active" : ""}`}
                            onClick={() => setCurrentType(tab.type)}
                        >
                            {tab.icon}
                            <span>{tab.label}</span>
                        </button>
                    ))}
                </div>
            )}

            <div className="fm-picker-toolbar">
                <div className="fm-search-wrapper">
                    <SearchIcon size={18} />
                    <input
                        type="text"
                        className="fm-search-input"
                        placeholder={searchLabel(currentType)}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                        <button type="button" className="fm-clear-btn" onClick={() => setSearchQuery("")}>
                            <CloseIcon size={14} />
                        </button>
                    )}
                </div>

                <div className="fm-toolbar-actions">
                    {activeCategory && !searchQuery && (
                        <button
                            type="button"
                            className="fm-toolbar-btn fm-back-btn"
                            title={t("back")}
                            onClick={() => setActiveCategoryId(activeCategory.category_id)}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                                e.preventDefault();
                                const mediaUrl = e.dataTransfer.getData("text/plain");
                                if (mediaUrl) handleMoveCategory(mediaUrl, activeCategory.category_id);
                            }}
                        >
                            <ArrowBackIcon size={16} />
                            {!inline && <span>{t("back")}</span>}
                        </button>
                    )}

                    <button
                        type="button"
                        className="fm-toolbar-btn"
                        title={t("newCategory")}
                        onClick={() => {
                            openModal((props) => (
                                <CategoryModal
                                    modalProps={props}
                                    type={currentType}
                                    onSave={handleCreateCategory}
                                />
                            ));
                        }}
                    >
                        {inline ? <FolderIcon size={16} /> : <PlusIcon size={16} />}
                        {inline ? <span>+</span> : <span>{t("category")}</span>}
                    </button>

                    <button
                        type="button"
                        className="fm-toolbar-btn"
                        title={t("settings")}
                        onClick={() => {
                            openModal((props) => <SettingsModal modalProps={props} />);
                        }}
                    >
                        <SettingsIcon size={16} />
                        {!inline && <span>{t("settings")}</span>}
                    </button>
                </div>
            </div>

            {activeCategory && !searchQuery && (
                <div className="fm-breadcrumb-banner" style={{ borderLeftColor: activeCategory.color }}>
                    <span>{t("viewingFolder")} <strong>{activeCategory.name}</strong></span>
                </div>
            )}

            <div className="fm-picker-content">
                {filteredCategories.length === 0 && filteredMedias.length === 0 ? (
                    <div className="fm-empty-state">
                        <div className="fm-empty-icon">{tabs.find((tab) => tab.type === currentType)?.icon}</div>
                        <h3>{t("emptyTitle")}</h3>
                        <p>{t("emptyText")}</p>
                    </div>
                ) : (
                    <>
                        {filteredCategories.length > 0 && (
                            <div className="fm-section">
                                <div className="fm-section-title">{t("categories")} ({filteredCategories.length})</div>
                                <div className="fm-categories-grid">
                                    {filteredCategories.map((cat) => (
                                        <CategoryCard
                                            key={cat.id}
                                            category={cat}
                                            type={currentType}
                                            onClick={() => setActiveCategoryId(cat.id)}
                                            onEdit={handleEditCategory}
                                            onDelete={handleDeleteCategory}
                                            onDropMedia={handleMoveCategory}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {filteredMedias.length > 0 && (
                            <div className="fm-section">
                                <div className="fm-section-title">
                                    {sectionLabel(currentType)} ({filteredMedias.length})
                                </div>
                                <div className="fm-medias-grid">
                                    {orderedMedias.map((m) => (
                                        <MediaCard
                                            key={m.url}
                                            media={m}
                                            type={currentType}
                                            categories={typeData.categories}
                                            alwaysSendInstantly={alwaysSendInstantly}
                                            allowCaching={allowCaching}
                                            mediaVolume={mediaVolume}
                                            videoPreview={videoPreview}
                                            mutePreview={mutePreview}
                                            onUnfavorite={handleUnfavorite}
                                            onRename={handleRenameMedia}
                                            onMoveCategory={handleMoveCategory}
                                            onClosePicker={onClosePicker}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

interface MediaPickerProps {
    modalProps: RenderModalProps;
    initialType?: MediaType;
    alwaysSendInstantly: boolean;
    allowCaching: boolean;
    mediaVolume: number;
}

export const MediaPicker: React.FC<MediaPickerProps> = ({
    modalProps,
    initialType = "image",
    alwaysSendInstantly,
    allowCaching,
    mediaVolume
}) => {
    const [, setLangTick] = React.useState(0);

    React.useEffect(() => {
        const langHandler = () => setLangTick(x => x + 1);
        window.addEventListener("FM_LANG_UPDATED", langHandler);
        return () => window.removeEventListener("FM_LANG_UPDATED", langHandler);
    }, []);

    return (
        <Modal
            {...modalProps}
            size="lg"
            title={t("title")}
            actions={[
                {
                    text: t("close"),
                    variant: "secondary",
                    onClick: modalProps.onClose
                }
            ]}
        >
            <MediaPickerContent
                initialType={initialType}
                alwaysSendInstantly={alwaysSendInstantly}
                allowCaching={allowCaching}
                mediaVolume={mediaVolume}
                onClosePicker={modalProps.onClose}
            />
        </Modal>
    );
};
