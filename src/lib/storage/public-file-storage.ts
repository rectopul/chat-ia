import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

type StorageDriver = "local" | "s3";

type SavePublicFileInput = {
    buffer: Buffer;
    contentType: string;
    originalFileName: string;
    folder: string;
};

export type SavePublicFileResult = {
    url: string;
    key: string;
    driver: StorageDriver;
};

const FILE_EXTENSION_BY_MIME_TYPE: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
};

function getStorageDriver(): StorageDriver {
    return process.env.FILE_STORAGE_DRIVER?.trim().toLowerCase() === "s3"
        ? "s3"
        : "local";
}

function sanitizePathSegment(value: string): string {
    return value
        .trim()
        .replace(/\\/g, "/")
        .replace(/\/+/g, "/")
        .replace(/^\/+|\/+$/g, "")
        .replace(/[^a-zA-Z0-9/_-]/g, "-");
}

function extractFileExtension(
    originalFileName: string,
    contentType: string,
): string {
    const fromName = path.extname(originalFileName).replace(".", "").toLowerCase();

    if (fromName) {
        return fromName;
    }

    return FILE_EXTENSION_BY_MIME_TYPE[contentType] ?? "bin";
}

function buildLocalPublicUrl(relativePath: string): string {
    const normalizedPath = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
    return `/${normalizedPath}`;
}

function joinUrl(baseUrl: string, pathname: string): string {
    const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    const normalizedPath = pathname.replace(/^\/+/, "");
    return new URL(normalizedPath, normalizedBase).toString();
}

function createS3Client(): S3Client {
    const region = process.env.FILE_STORAGE_S3_REGION?.trim();
    const accessKeyId = process.env.FILE_STORAGE_S3_ACCESS_KEY_ID?.trim();
    const secretAccessKey = process.env.FILE_STORAGE_S3_SECRET_ACCESS_KEY?.trim();

    if (!region || !accessKeyId || !secretAccessKey) {
        throw new Error(
            "FILE_STORAGE_S3_REGION, FILE_STORAGE_S3_ACCESS_KEY_ID e FILE_STORAGE_S3_SECRET_ACCESS_KEY sao obrigatorios quando FILE_STORAGE_DRIVER=s3.",
        );
    }

    return new S3Client({
        region,
        endpoint: process.env.FILE_STORAGE_S3_ENDPOINT?.trim() || undefined,
        forcePathStyle:
            process.env.FILE_STORAGE_S3_FORCE_PATH_STYLE?.trim() === "true",
        credentials: {
            accessKeyId,
            secretAccessKey,
        },
    });
}

async function saveFileLocally(
    input: SavePublicFileInput,
): Promise<SavePublicFileResult> {
    const publicRoot = sanitizePathSegment(
        process.env.FILE_STORAGE_LOCAL_PUBLIC_ROOT?.trim() || "uploads",
    );
    const safeFolder = sanitizePathSegment(input.folder);
    const extension = extractFileExtension(
        input.originalFileName,
        input.contentType,
    );
    const fileName = `${Date.now()}-${randomUUID()}.${extension}`;
    const relativePath = [publicRoot, safeFolder, fileName]
        .filter(Boolean)
        .join("/");
    const absolutePath = path.join(process.cwd(), "public", relativePath);

    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, input.buffer);

    return {
        url: buildLocalPublicUrl(relativePath),
        key: relativePath,
        driver: "local",
    };
}

async function saveFileOnS3(
    input: SavePublicFileInput,
): Promise<SavePublicFileResult> {
    const bucket = process.env.FILE_STORAGE_S3_BUCKET?.trim();
    const publicBaseUrl = process.env.FILE_STORAGE_S3_PUBLIC_BASE_URL?.trim();

    if (!bucket || !publicBaseUrl) {
        throw new Error(
            "FILE_STORAGE_S3_BUCKET e FILE_STORAGE_S3_PUBLIC_BASE_URL sao obrigatorios quando FILE_STORAGE_DRIVER=s3.",
        );
    }

    const client = createS3Client();
    const safeFolder = sanitizePathSegment(input.folder);
    const extension = extractFileExtension(
        input.originalFileName,
        input.contentType,
    );
    const key = [safeFolder, `${Date.now()}-${randomUUID()}.${extension}`]
        .filter(Boolean)
        .join("/");

    await client.send(
        new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: input.buffer,
            ContentType: input.contentType,
        }),
    );

    return {
        url: joinUrl(publicBaseUrl, key),
        key,
        driver: "s3",
    };
}

export async function savePublicFile(
    input: SavePublicFileInput,
): Promise<SavePublicFileResult> {
    if (getStorageDriver() === "s3") {
        return saveFileOnS3(input);
    }

    return saveFileLocally(input);
}
