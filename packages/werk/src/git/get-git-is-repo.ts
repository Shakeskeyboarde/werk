import { spawn } from '../utils/spawn.js';

export const getGitIsRepo = async (dir: string): Promise<boolean> => {
  return await spawn('git', ['status'], { cwd: dir, errorThrow: true })
    .then(() => true)
    .catch(() => false);
};