export async function generateKeyPair() {
    return await crypto.subtle.generateKey(
        {
            name: "RSA-OAEP",
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: "SHA-256",
        },
        true,
        ["encrypt", "decrypt"]
    );
}

export async function exportKey(key: CryptoKey) {
    const exported = await crypto.subtle.exportKey("jwk", key);
    return exported;
}

export async function importKey(jwk: JsonWebKey, usage: KeyUsage[]) {
    return await crypto.subtle.importKey(
        "jwk",
        jwk,
        {
            name: "RSA-OAEP",
            hash: "SHA-256",
        },
        true,
        usage
    );
}

export async function encryptMessage(publicKey: CryptoKey, message: string) {
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const encrypted = await crypto.subtle.encrypt(
        {
            name: "RSA-OAEP",
        },
        publicKey,
        data
    );
    return arrayBufferToBase64(encrypted);
}

export async function decryptMessage(privateKey: CryptoKey, encryptedMessage: string) {
    const data = base64ToArrayBuffer(encryptedMessage);
    const decrypted = await crypto.subtle.decrypt(
        {
            name: "RSA-OAEP",
        },
        privateKey,
        data
    );
    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function base64ToArrayBuffer(base64: string) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

// ========== AES-GCM Functions for Hybrid Encryption ==========

export async function generateSymKey() {
    return await crypto.subtle.generateKey(
        {
            name: "AES-GCM",
            length: 256,
        },
        true,
        ["encrypt", "decrypt"]
    );
}

export async function encryptSymMessage(key: CryptoKey, message: string) {
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
        {
            name: "AES-GCM",
            iv: iv,
        },
        key,
        data
    );

    // Combine IV and ciphertext
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);

    return arrayBufferToBase64(combined.buffer);
}

export async function decryptSymMessage(key: CryptoKey, encryptedMessage: string) {
    const combined = base64ToArrayBuffer(encryptedMessage);
    const combinedArray = new Uint8Array(combined);
    const iv = combinedArray.slice(0, 12);
    const data = combinedArray.slice(12);

    const decrypted = await crypto.subtle.decrypt(
        {
            name: "AES-GCM",
            iv: iv,
        },
        key,
        data
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
}

export async function exportSymKey(key: CryptoKey) {
    const exported = await crypto.subtle.exportKey("raw", key);
    return arrayBufferToBase64(exported);
}

export async function importSymKey(rawKey: string) {
    const buffer = base64ToArrayBuffer(rawKey);
    return await crypto.subtle.importKey(
        "raw",
        buffer,
        {
            name: "AES-GCM",
        },
        true,
        ["encrypt", "decrypt"]
    );
}

// ========== FILE ENCRYPTION FUNCTIONS ==========

/**
 * Encrypt a file (ArrayBuffer) with AES-GCM
 */
export async function encryptFile(aesKey: CryptoKey, fileData: ArrayBuffer): Promise<ArrayBuffer> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
        {
            name: "AES-GCM",
            iv,
        },
        aesKey,
        fileData
    );

    // Combine IV + encrypted data
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);

    return combined.buffer;
}

/**
 * Decrypt a file (ArrayBuffer) with AES-GCM
 */
export async function decryptFile(aesKey: CryptoKey, encryptedData: ArrayBuffer): Promise<ArrayBuffer> {
    const combined = new Uint8Array(encryptedData);
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);

    const decrypted = await crypto.subtle.decrypt(
        {
            name: "AES-GCM",
            iv: iv,
        },
        aesKey,
        data
    );

    return decrypted;
}
