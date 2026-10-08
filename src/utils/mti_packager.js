'use strict';

const APP_ADDRESS = 0x0800B000;
const APP_LIMIT   = 0x0805A000;
const TARGET      = 0x4C345035;
const MAX_PAYLOAD = APP_LIMIT - APP_ADDRESS; // 319488 bytes (316 KB)
const FORMAT      = 2;

function crc32(buf, initial = 0xFFFFFFFF) {
    let crc = initial >>> 0;
    for (let i = 0; i < buf.length; i++) {
        crc ^= buf[i];
        for (let j = 0; j < 8; j++) {
            crc = (crc & 1) ? ((crc >>> 1) ^ 0xEDB88320) : (crc >>> 1);
        }
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * Validates a Release .bin and wraps it into an MTI2 UPDATE.MTI package.
 * Mirrors the logic in tools/sd-update/package.py exactly.
 *
 * @param {Buffer} binBuffer  Raw bytes of the Release .bin
 * @returns {{ mtiBuffer: Buffer, payloadCrc32: number, payloadSize: number }}
 * @throws {Error} if validation fails
 */
function packageFirmware(binBuffer) {
    if (!Buffer.isBuffer(binBuffer)) {
        throw new Error('Input harus berupa Buffer');
    }

    const len = binBuffer.length;

    if (len < 520 || len > MAX_PAYLOAD) {
        throw new Error(
            `Ukuran binary tidak valid: ${len} bytes (harus 520–${MAX_PAYLOAD} bytes)`
        );
    }

    // Application magic words at offset 0 and 4
    const magic0 = binBuffer.readUInt32LE(0);
    const magic1 = binBuffer.readUInt32LE(4);
    if (magic0 !== 0x12042000 || magic1 !== 0x05081999) {
        throw new Error(
            'Magic aplikasi tidak valid. Pastikan menggunakan file Release .bin (bukan Debug atau gabungan bootloader+app)'
        );
    }

    // Version string must have a null terminator within bytes 8–39
    let hasNull = false;
    for (let i = 8; i < 40; i++) {
        if (binBuffer[i] === 0) { hasNull = true; break; }
    }
    if (!hasNull) {
        throw new Error('String versi aplikasi harus diakhiri null dalam 32 byte pertama setelah magic');
    }

    // Vector table at offset 512: initial SP and Reset PC
    const sp = binBuffer.readUInt32LE(512);
    const pc = binBuffer.readUInt32LE(516);

    const spOk = (sp & 7) === 0 &&
        ((sp > 0x20001000 && sp <= 0x20050000) || (sp > 0x10000000 && sp <= 0x10010000));
    if (!spOk) {
        throw new Error('Initial stack pointer tidak valid (harus 8-byte aligned dan dalam SRAM MTI2)');
    }

    const pcThumb   = (pc & 1) !== 0;
    const pcInRange = (pc & ~1) >= APP_ADDRESS + 512 && (pc & ~1) < APP_ADDRESS + len;
    if (!pcThumb || !pcInRange) {
        throw new Error('Reset vector tidak mengarah ke partisi aplikasi ini (0x0800B000)');
    }

    // Confirmation hook must be present
    if (binBuffer.indexOf('MTI2_CONFIRM_V1') === -1) {
        throw new Error(
            'Aplikasi harus menyertakan boot confirmation hook (MTI2_CONFIRM_V1). ' +
            'Pastikan file Release dikompilasi dengan hook konfirmasi.'
        );
    }

    // Payload CRC32
    const payloadCrc = crc32(binBuffer);

    // Build 28-byte header
    const hdr = Buffer.alloc(28);
    hdr.write('MTI2UPD1', 0, 8, 'ascii');
    hdr.writeUInt32LE(TARGET,     8);
    hdr.writeUInt32LE(APP_ADDRESS, 12);
    hdr.writeUInt32LE(len,        16);
    hdr.writeUInt32LE(payloadCrc, 20);
    hdr.writeUInt32LE(FORMAT,     24);

    // Header CRC32 over the 28-byte header
    const hdrCrc = crc32(hdr);

    const hdrCrcBuf = Buffer.alloc(4);
    hdrCrcBuf.writeUInt32LE(hdrCrc, 0);

    const mtiBuffer = Buffer.concat([hdr, hdrCrcBuf, binBuffer]);

    return {
        mtiBuffer,
        payloadCrc32: payloadCrc,
        payloadSize:  len,
        totalSize:    mtiBuffer.length,
    };
}

module.exports = { packageFirmware };
