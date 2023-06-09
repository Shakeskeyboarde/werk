import { type ChildProcess } from 'node:child_process';

import { spawn as crossSpawn } from 'cross-spawn';
import { npmRunPath } from 'npm-run-path';
import { quote } from 'shell-quote';

import { type Log, log as defaultLog } from './log.js';

type GetOutput = {
  (): Promise<Buffer>;
  (encoding: BufferEncoding): Promise<string>;
  (encoding?: BufferEncoding): Promise<string | Buffer>;
};

export interface SpawnOptions {
  readonly cwd?: string | URL;
  readonly env?: NodeJS.ProcessEnv;
  readonly echo?: boolean;
  readonly capture?: boolean;
  readonly stream?: boolean;
  readonly input?: boolean;
  readonly errorThrow?: boolean;
  readonly errorEcho?: boolean;
  readonly errorMessage?: (error: unknown, exitCode: number) => string;
  readonly log?: Log;
}

export interface SpawnResult {
  readonly stdout: Buffer;
  readonly stderr: Buffer;
  readonly output: Buffer;

  readonly getJson: <T>() => T;
  readonly tryGetJson: <T>() => T | undefined;

  readonly exitCode: number;
  readonly error: unknown;

  readonly succeeded: boolean;
  readonly failed: boolean;
}

export interface SpawnPromise extends Promise<SpawnResult> {
  readonly childProcess: ChildProcess;
  readonly stdin: NodeJS.WritableStream | null;
  readonly stdout: NodeJS.ReadableStream;
  readonly stderr: NodeJS.ReadableStream;

  readonly getStdout: GetOutput;
  readonly getStderr: GetOutput;
  readonly getOutput: GetOutput;

  readonly getJson: <T>() => Promise<T>;
  readonly tryGetJson: <T>() => Promise<T | undefined>;

  readonly getExitCode: () => Promise<number>;
  readonly getError: () => Promise<unknown>;

  readonly succeeded: () => Promise<boolean>;
  readonly failed: () => Promise<boolean>;
}

export const spawn = (
  cmd: string,
  args: readonly (string | null | undefined)[] = [],
  {
    echo = false,
    capture = false,
    stream = false,
    input = false,
    errorThrow = false,
    errorEcho = false,
    errorMessage,
    log = defaultLog,
    ...options
  }: SpawnOptions = {},
): SpawnPromise => {
  const args_ = args.filter((value): value is string => value != null);
  const env = options.env ?? process.env;
  const childProcess = crossSpawn(cmd, args_, {
    ...options,
    stdio: [
      input ? 'pipe' : 'ignore',
      echo || capture || errorEcho || stream ? 'pipe' : 'ignore',
      echo || capture || errorEcho || stream ? 'pipe' : 'ignore',
    ],
    env: {
      ...env,
      PATH: npmRunPath({ cwd: options.cwd, path: env.PATH }),
    },
  });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const stdio: Buffer[] = [];

  let exitCode = 0;
  let error: unknown = undefined;

  if (echo) {
    childProcess.stdout?.pipe(log.stdout);
    childProcess.stderr?.pipe(log.stderr);
  }

  if (capture || errorEcho) {
    childProcess.stdout?.on('data', (data: Buffer) => {
      stdout.push(data);
      stdio.push(data);
    });

    childProcess.stderr?.on('data', (data: Buffer) => {
      stderr.push(data);
      stdio.push(data);
    });
  }

  childProcess.on('error', (err) => {
    error = err;
  });

  // Switch the streams to flowing mode on the next tick, if they aren't
  // already, to prevent memory leaks. Not entirely sure this is
  // necessary, but I think it's better to be safe than sorry.
  Promise.resolve()
    .then(() => {
      childProcess.stdout?.resume();
      childProcess.stderr?.resume();
    })
    .catch(() => undefined);

  const promise = new Promise<SpawnResult>((resolve, reject) =>
    childProcess.on('close', () => {
      exitCode = childProcess.exitCode ?? 1;

      if (exitCode && !error) error = new Error(`Spawned process failed: ${quote([cmd, ...args_])}`);
      if (error && !exitCode) exitCode = 1;
      if (errorEcho && error != null) log.verbose(Buffer.concat(stdio).toString('utf-8').trim());
      if (errorMessage && error != null) log.error(errorMessage(error, exitCode));

      if (errorThrow && error != null) {
        reject(error);
      } else {
        const result: SpawnResult = {
          stdout: Buffer.concat(stdout),
          stderr: Buffer.concat(stderr),
          output: Buffer.concat(stdio),
          exitCode,
          error,
          succeeded: exitCode === 0,
          failed: exitCode !== 0,
          getJson: <T>(): T => JSON.parse(result.stdout.toString('utf-8')),
          tryGetJson: <T>(): T | undefined => {
            try {
              return result.getJson();
            } catch {
              return undefined;
            }
          },
        };

        resolve(result);
      }
    }),
  );

  return Object.assign(promise, {
    childProcess,
    stdin: childProcess.stdin,
    stdout: childProcess.stdout as NodeJS.ReadableStream,
    stderr: childProcess.stderr as NodeJS.ReadableStream,
    getStdout: (encoding?: BufferEncoding): Promise<any> =>
      promise.then((result) => (encoding ? result.stdout.toString(encoding).trim() : result.stdout)),
    getStderr: (encoding?: BufferEncoding): Promise<any> =>
      promise.then((result) => (encoding ? result.stderr.toString(encoding).trim() : result.stderr)),
    getOutput: (encoding?: BufferEncoding): Promise<any> =>
      promise.then((result) => (encoding ? result.output.toString(encoding).trim() : result.output)),
    getJson: <T>(): Promise<T> => promise.then((result) => result.getJson<T>()),
    tryGetJson: <T>(): Promise<T | undefined> => promise.then((result) => result.tryGetJson<T>()),
    getExitCode: () => promise.then((result) => result.exitCode),
    getError: () => promise.then((result) => result.error),
    succeeded: () =>
      promise.then(
        (result) => result.succeeded,
        () => false,
      ),
    failed: () =>
      promise.then(
        (result) => result.failed,
        () => true,
      ),
  });
};

export type Spawn = typeof spawn;
