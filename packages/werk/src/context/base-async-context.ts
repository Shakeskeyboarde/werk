import { type CommandInfo } from '../command/load-command-plugin.js';
import { type CommanderArgs, type CommanderOptions } from '../commander/commander.js';
import { Log, type LogOptions } from '../utils/log.js';
import { type Spawn, spawn } from '../utils/spawn.js';
import { Workspace, type WorkspaceOptions } from '../workspace/workspace.js';
import { BaseContext } from './base-context.js';

export interface BaseAsyncContextOptions<A extends CommanderArgs, O extends CommanderOptions> {
  readonly log?: LogOptions;
  readonly command: CommandInfo;
  readonly rootDir: string;
  readonly args: A;
  readonly opts: O;
  readonly workspaces: readonly WorkspaceOptions[];
  readonly isWorker: boolean;
  readonly workerData: any;
  readonly startWorker: (data?: any) => Promise<boolean>;
}

export abstract class BaseAsyncContext<
  A extends CommanderArgs = CommanderArgs,
  O extends CommanderOptions = CommanderOptions,
> extends BaseContext {
  #startWorker: (data?: any) => Promise<boolean>;

  /**
   * Contextual logger.
   */
  readonly log: Log;

  /**
   * Information about the command package.
   */
  readonly command: CommandInfo;

  /**
   * Absolute path of the workspaces root.
   */
  readonly rootDir: string;

  /**
   * Arguments parsed from the command line.
   */
  readonly args: A;

  /**
   * Options parsed from the command line.
   */
  readonly opts: O;

  /**
   * Map of all NPM workspaces in order of interdependency (dependencies
   * before dependents).
   */
  readonly workspaces: ReadonlyMap<string, Workspace>;

  /**
   * True if the command is running in a worker thread.
   */
  readonly isWorker: boolean;

  /**
   * Value passed to the `worker(filename, data)` method.
   */
  readonly workerData: any;

  constructor(options: BaseAsyncContextOptions<A, O>) {
    super();
    const { log, command, rootDir, args, opts, workspaces, isWorker, workerData, startWorker } = options;

    this.log = new Log(log);
    this.command = command;
    this.rootDir = rootDir;
    this.args = args;
    this.opts = opts;
    this.workspaces = new Map(
      workspaces.map((workspace) => [workspace.name, new Workspace({ ...workspace, context: this })]),
    );
    this.isWorker = isWorker;
    this.workerData = workerData;
    this.#startWorker = startWorker;
  }

  /**
   * Spawn a child process at the workspaces root.
   */
  readonly spawn: Spawn = (cmd, args, options) => {
    this._assertMethodCallsAllowed('spawn');
    return spawn(cmd, args, { cwd: this.rootDir, log: this.log, ...options });
  };

  /**
   * Returns false if already running in a worker thread. Creating nested
   * worker threads is not supported.
   */
  readonly startWorker = async (data?: any): Promise<boolean> => {
    this._assertMethodCallsAllowed('startWorker');
    return await this.#startWorker(data);
  };
}