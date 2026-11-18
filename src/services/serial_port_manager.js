const { SerialPort } = require('serialport');
const { EventEmitter } = require('events');

class SerialPortManager extends EventEmitter {
    constructor() {
        super();
        this.port = null;
        this.rxBuffer = Buffer.alloc(0);
        this.pendingResolve = null;
        this.pendingTimeout = null;
    }

    async listPorts() {
        return SerialPort.list();
    }

    isOpen() {
        return this.port?.isOpen ?? false;
    }

    info() {
        if (!this.isOpen()) return null;
        return { path: this.port.path, baudRate: this.port.baudRate };
    }

    async open(path, baudRate = 9600) {
        if (this.isOpen()) await this.close();
        return new Promise((resolve, reject) => {
            this.port = new SerialPort({ path, baudRate, autoOpen: false });
            this.port.open(err => {
                if (err) return reject(err);
                this.rxBuffer = Buffer.alloc(0);

                this.port.on('data', chunk => {
                    this.rxBuffer = Buffer.concat([this.rxBuffer, chunk]);
                    this.emit('data', chunk);
                    if (this.pendingResolve) this._tryResolve();
                });

                this.port.on('close', () => this.emit('close'));
                this.port.on('error', e => this.emit('error', e));
                resolve({ path, baudRate });
            });
        });
    }

    async close() {
        if (!this.isOpen()) return;
        return new Promise(resolve => {
            this._cancelPending('Port ditutup');
            this.port.close(() => { this.port = null; resolve(); });
        });
    }

    // Send frame, collect ALL bytes received until idle for idleMs within timeoutMs
    async send(frameHex, timeoutMs = 1000, idleMs = 50) {
        if (!this.isOpen()) throw new Error('Port belum dibuka');

        const bytes = frameHex.trim().split(/\s+/)
            .filter(s => /^[0-9a-fA-F]{1,2}$/.test(s))
            .map(s => parseInt(s, 16));

        if (!bytes.length) throw new Error('Frame tidak valid');

        this.rxBuffer = Buffer.alloc(0);

        return new Promise((resolve, reject) => {
            let idleTimer = null;

            const finish = () => {
                clearTimeout(this.pendingTimeout);
                clearTimeout(idleTimer);
                this.pendingResolve = null;
                this.pendingReject = null;
                if (!this.rxBuffer.length) {
                    reject({ timeout: true, received: null });
                    return;
                }
                resolve(Array.from(this.rxBuffer).map(b => b.toString(16).toUpperCase().padStart(2,'0')).join(' '));
            };

            const resetIdle = () => {
                clearTimeout(idleTimer);
                idleTimer = setTimeout(finish, idleMs);
            };

            this.pendingResolve = resolve;
            this.pendingReject = reject;

            // Hard timeout — give up if no response at all
            this.pendingTimeout = setTimeout(() => {
                clearTimeout(idleTimer);
                this.pendingResolve = null;
                this.pendingReject = null;
                const got = this.rxBuffer.length
                    ? Array.from(this.rxBuffer).map(b => b.toString(16).toUpperCase().padStart(2,'0')).join(' ')
                    : null;
                reject({ timeout: true, received: got });
            }, timeoutMs);

            // Reset idle timer on every incoming chunk
            this._idleResetFn = resetIdle;

            this.port.write(Buffer.from(bytes), err => {
                if (err) {
                    clearTimeout(this.pendingTimeout);
                    clearTimeout(idleTimer);
                    this.pendingResolve = null;
                    this._idleResetFn = null;
                    reject(err);
                }
            });
        });
    }

    _tryResolve() {
        if (this._idleResetFn) this._idleResetFn();
    }

    _cancelPending(reason) {
        if (this.pendingTimeout) clearTimeout(this.pendingTimeout);
        if (this.pendingReject) this.pendingReject(new Error(reason));
        this.pendingResolve = null;
        this.pendingReject = null;
    }
}

module.exports = new SerialPortManager();
