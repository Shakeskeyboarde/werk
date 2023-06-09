import { Transform, type TransformCallback } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';

export class LogStream extends Transform {
  readonly #decoder = new StringDecoder('utf-8');

  #buffer = '';
  #timeout?: NodeJS.Timeout;

  constructor() {
    super({
      decodeStrings: true,
      writableObjectMode: false,
      readableObjectMode: true,
    });

    process.setMaxListeners(process.getMaxListeners() + 1);
    process.on('exit', this.#onExit);
  }

  end(...args: [unknown?, (BufferEncoding | (() => void))?, (() => void)?]): this {
    if (args.length > 0) {
      this.write.call(this, ...(args as Parameters<this['write']>));
    }

    this.#send(true);

    // We don't want to call super.end() because log streams may be
    // re-piped, and therefore should never really end.

    return this;
  }

  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    if (chunk.length === 0) return;

    this.#buffer += this.#decoder.write(chunk);

    // Flush completed lines if the buffer is getting too big.
    if (this.#buffer.length > 40_000) this.#send(false);

    // Delay flushing the buffer as long as we're receiving data, so that
    // related lines stay together.
    clearTimeout(this.#timeout);
    this.#timeout = setTimeout(() => this.#send(true), 10);

    callback();
  }

  _flush(callback: TransformCallback): void {
    this.#send(true);
    callback();
  }

  _destroy(error: Error | null, callback: (error: Error | null) => void): void {
    this.#send(true);
    process.removeListener('exit', this.#onExit);
    process.setMaxListeners(process.getMaxListeners() - 1);
    super._destroy(error, callback);
  }

  readonly #send = (flush: boolean): void => {
    const value = this.#buffer + this.#decoder.end();
    this.#buffer = '';

    if (!value) return;

    const rx = /(.*?)(?:\r?\n|\r)/gu;
    let line: RegExpExecArray | null;
    let lastIndex = 0;

    while ((line = rx.exec(value))) {
      this.push((line[1] ?? '') + '\n');
      lastIndex = rx.lastIndex;
    }

    if (lastIndex >= value.length) return;

    if (flush) {
      // If we're flushing, write the last unterminated line.
      this.push(value.slice(lastIndex));
      clearTimeout(this.#timeout);
    } else {
      this.#buffer = value.slice(lastIndex);
    }
  };

  readonly #onExit = (): void => {
    this.destroy();
  };
}
