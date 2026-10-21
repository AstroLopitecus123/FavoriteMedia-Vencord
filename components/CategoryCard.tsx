import { React, ContextMenuApi, Menu } from "@webpack/common";
import { Category, MediaType } from "../types";
import { FolderIcon } from "./Icons";
import { t } from "../i18n";

interface CategoryCardProps {
    category: Category;
    type: MediaType;
    onClick: () => void;
    onEdit: (cat: Category) => void;
    onDelete: (id: number) => void;
    onDropMedia: (mediaUrl: string, targetCategoryId: number) => void;
}

export const CategoryCard: React.FC<CategoryCardProps> = ({
    category,
    onClick,
    onEdit,
    onDelete,
    onDropMedia
}) => {
    const [dragOver, setDragOver] = React.useState(false);

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        ContextMenuApi.openContextMenu(e, () => (
            <Menu.Menu navId="fm-category-menu" onClose={ContextMenuApi.closeContextMenu} aria-label="Category Menu">
                <Menu.MenuItem
                    id="fm-edit-category"
                    label={t("editCategory")}
                    action={() => onEdit(category)}
                />
                <Menu.MenuItem
                    id="fm-delete-category"
                    label={t("deleteCategory")}
                    color="danger"
                    action={() => onDelete(category.id)}
                />
            </Menu.Menu>
        ));
    };

    return (
        <div
            className={`fm-category-card ${dragOver ? "fm-dragover" : ""}`}
            style={{
                borderColor: category.color || "var(--brand-experiment)",
                backgroundColor: "var(--background-secondary)"
            }}
            onClick={onClick}
            onContextMenu={handleContextMenu}
            onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const mediaUrl = e.dataTransfer.getData("text/plain");
                if (mediaUrl) {
                    onDropMedia(mediaUrl, category.id);
                }
            }}
        >
            <div className="fm-category-header">
                <div
                    className="fm-category-color-badge"
                    style={{ backgroundColor: category.color || "#5865F2" }}
                />
                <FolderIcon size={24} color={category.color || "var(--interactive-active)"} />
            </div>
            <div className="fm-category-name" title={category.name}>
                {category.name}
            </div>
        </div>
    );
};
