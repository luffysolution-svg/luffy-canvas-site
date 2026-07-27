import { unzipSync, zip } from "fflate";

type ZipFile = {
    name: string;
    data: BlobPart;
};

export async function createZip(files: ZipFile[]) {
    const entries: Record<string, Uint8Array> = {};
    for (const file of files) entries[file.name] = new Uint8Array(await new Blob([file.data]).arrayBuffer());
    const archive = await new Promise<Uint8Array>((resolve, reject) => zip(entries, { level: 0 }, (error, data) => (error ? reject(error) : resolve(data))));
    const buffer = new ArrayBuffer(archive.byteLength);
    new Uint8Array(buffer).set(archive);
    return new Blob([buffer], { type: "application/zip" });
}

export async function readZip(file: Blob) {
    const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
    return new Map(Object.entries(entries).map(([name, data]) => [name, new Blob([data])]));
}
