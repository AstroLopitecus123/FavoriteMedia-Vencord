import { IpcMainInvokeEvent } from "electron";

export async function fetchMedia(_: IpcMainInvokeEvent, url: string): Promise<{ data: Uint8Array; type: string; } | { error: string; }> {
    try {
        const res = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
        });
        if (!res.ok) return { error: `HTTP ${res.status}` };
        const buf = await res.arrayBuffer();
        return {
            data: new Uint8Array(buf),
            type: res.headers.get("content-type") || "application/octet-stream"
        };
    } catch (e) {
        return { error: String(e) };
    }
}
