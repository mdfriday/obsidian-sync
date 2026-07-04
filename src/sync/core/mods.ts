let webcrypto: Crypto;
export async function getWebCrypto() {
    if (webcrypto) {
        return webcrypto;
    }
    if (window.crypto) {
        webcrypto = window.crypto;
        return webcrypto;
    }
    throw new Error("Web Crypto API is not available in this environment");
}
