export interface EncryptedPayload {
  cipherBlob: string; // Base64
  nonce: string;      // Base64
}

class WasmCryptoService {
  private wasmInstance: WebAssembly.Exports | null = null;

  async initWasm(): Promise<void> {
    if (this.wasmInstance) return;
    try {
      const response = await fetch('/assets/wasm/keychat_crypto_bg.wasm');
      const bytes = await response.arrayBuffer();
      const wasmModule = await WebAssembly.instantiate(bytes, {});
      this.wasmInstance = wasmModule.instance.exports;
    } catch (err) {
      console.warn('WASM module not found, falling back to Web Crypto API:', err);
    }
  }

  async deriveKey(password: string, salt: string): Promise<CryptoKey> {
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    return window.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: enc.encode(salt),
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async encryptText(plainText: string, key: CryptoKey): Promise<EncryptedPayload> {
    const enc = new TextEncoder();
    const nonce = window.crypto.getRandomValues(new Uint8Array(12));

    const encryptedBuffer = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce },
      key,
      enc.encode(plainText)
    );

    return {
      cipherBlob: btoa(String.fromCharCode(...new Uint8Array(encryptedBuffer))),
      nonce: btoa(String.fromCharCode(...nonce))
    };
  }

  async decryptText(payload: EncryptedPayload, key: CryptoKey): Promise<string> {
    const cipherBuffer = Uint8Array.from(atob(payload.cipherBlob), c => c.charCodeAt(0));
    const nonceBuffer = Uint8Array.from(atob(payload.nonce), c => c.charCodeAt(0));

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: nonceBuffer },
      key,
      cipherBuffer
    );

    return new TextDecoder().decode(decryptedBuffer);
  }
}

export const cryptoService = new WasmCryptoService();
