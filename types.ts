export type MediaType = "image" | "video" | "audio" | "file" | "gif";

export interface MediaItem {
    url: string;
    src?: string;
    width?: number;
    height?: number;
    name: string;
    category_id?: number;
    poster?: string;
    ext?: string;
    message?: string;
    source?: string;
}

export interface Category {
    id: number;
    name: string;
    color: string;
    thumbnail?: string;
    category_id?: number;
}

export interface TypeData {
    medias: MediaItem[];
    categories: Category[];
}

export interface AllData {
    image: TypeData;
    video: TypeData;
    audio: TypeData;
    file: TypeData;
    gif: TypeData;
}
