import {
  installLaunchAgent,
  isLaunchAgentLoaded,
  readLaunchAgentProgramArguments,
  readLaunchAgentRuntime,
  restartLaunchAgent,
  stopLaunchAgent,
  uninstallLaunchAgent,
} from "./launchd.js";
import {
  installPm2Service,
  isPm2Available,
  isPm2ServiceEnabled,
  readPm2ServiceCommand,
  readPm2ServiceRuntime,
  restartPm2Service,
  stopPm2Service,
  uninstallPm2Service,
} from "./pm2.js";

export { isPm2Available };

import {
  installScheduledTask,
  isScheduledTaskInstalled,
  readScheduledTaskCommand,
  readScheduledTaskRuntime,
  restartScheduledTask,
  stopScheduledTask,
  uninstallScheduledTask,
} from "./schtasks.js";
import type { GatewayServiceRuntime } from "./service-runtime.js";
import {
  installSystemdService,
  isSystemdServiceEnabled,
  isSystemdUserServiceAvailable,
  readSystemdServiceExecStart,
  readSystemdServiceRuntime,
  restartSystemdService,
  stopSystemdService,
  uninstallSystemdService,
} from "./systemd.js";

export type GatewayServiceInstallArgs = {
  env: Record<string, string | undefined>;
  stdout: NodeJS.WritableStream;
  programArguments: string[];
  workingDirectory?: string;
  environment?: Record<string, string | undefined>;
  description?: string;
};

export type GatewayService = {
  label: string;
  loadedText: string;
  notLoadedText: string;
  install: (args: GatewayServiceInstallArgs) => Promise<void>;
  uninstall: (args: {
    env: Record<string, string | undefined>;
    stdout: NodeJS.WritableStream;
  }) => Promise<void>;
  stop: (args: {
    env?: Record<string, string | undefined>;
    stdout: NodeJS.WritableStream;
  }) => Promise<void>;
  restart: (args: {
    env?: Record<string, string | undefined>;
    stdout: NodeJS.WritableStream;
  }) => Promise<void>;
  isLoaded: (args: { env?: Record<string, string | undefined> }) => Promise<boolean>;
  readCommand: (env: Record<string, string | undefined>) => Promise<{
    programArguments: string[];
    workingDirectory?: string;
    environment?: Record<string, string>;
    sourcePath?: string;
  } | null>;
  readRuntime: (env: Record<string, string | undefined>) => Promise<GatewayServiceRuntime>;
};

export function resolveGatewayService(): GatewayService {
  if (process.platform === "darwin") {
    return {
      label: "LaunchAgent",
      loadedText: "loaded",
      notLoadedText: "not loaded",
      install: async (args) => {
        await installLaunchAgent(args);
      },
      uninstall: async (args) => {
        await uninstallLaunchAgent(args);
      },
      stop: async (args) => {
        await stopLaunchAgent({
          stdout: args.stdout,
          env: args.env,
        });
      },
      restart: async (args) => {
        await restartLaunchAgent({
          stdout: args.stdout,
          env: args.env,
        });
      },
      isLoaded: async (args) => isLaunchAgentLoaded(args),
      readCommand: readLaunchAgentProgramArguments,
      readRuntime: readLaunchAgentRuntime,
    };
  }

  if (process.platform === "linux") {
    return {
      label: "Systemd/PM2",
      loadedText: "active",
      notLoadedText: "inactive",
      install: async (args) => {
        if (await isSystemdUserServiceAvailable()) {
          await installSystemdService(args);
        } else if (await isPm2Available()) {
          await installPm2Service(args);
        } else {
          await installSystemdService(args);
        }
      },
      uninstall: async (args) => {
        if (await isSystemdUserServiceAvailable()) {
          try {
            await uninstallSystemdService(args);
          } catch {}
        }
        if (await isPm2Available()) {
          try {
            await uninstallPm2Service(args);
          } catch {}
        }
      },
      stop: async (args) => {
        if (
          (await isSystemdUserServiceAvailable()) &&
          (await isSystemdServiceEnabled({ env: args.env }))
        ) {
          await stopSystemdService(args);
          return;
        }
        if ((await isPm2Available()) && (await isPm2ServiceEnabled({ env: args.env }))) {
          await stopPm2Service(args);
          return;
        }
        await stopSystemdService(args);
      },
      restart: async (args) => {
        if (
          (await isSystemdUserServiceAvailable()) &&
          (await isSystemdServiceEnabled({ env: args.env }))
        ) {
          await restartSystemdService(args);
          return;
        }
        if ((await isPm2Available()) && (await isPm2ServiceEnabled({ env: args.env }))) {
          await restartPm2Service(args);
          return;
        }
        if (await isSystemdUserServiceAvailable()) {
          await restartSystemdService(args);
        } else if (await isPm2Available()) {
          await restartPm2Service(args);
        } else {
          await restartSystemdService(args);
        }
      },
      isLoaded: async (args) => {
        if (await isSystemdUserServiceAvailable()) {
          if (await isSystemdServiceEnabled(args)) return true;
        }
        if (await isPm2Available()) {
          if (await isPm2ServiceEnabled(args)) return true;
        }
        return false;
      },
      readCommand: async (env) => {
        if (await isSystemdUserServiceAvailable()) {
          const cmd = await readSystemdServiceExecStart(env);
          if (cmd) return cmd;
        }
        if (await isPm2Available()) {
          const cmd = await readPm2ServiceCommand(env);
          if (cmd) return cmd;
        }
        return null;
      },
      readRuntime: async (env) => {
        if (await isSystemdUserServiceAvailable()) {
          const rt = await readSystemdServiceRuntime(env);
          if (!rt.missingUnit) return rt;
        }
        if (await isPm2Available()) {
          return await readPm2ServiceRuntime(env);
        }
        return { status: "unknown", detail: "Systemd/PM2 unavailable" };
      },
    };
  }

  if (process.platform === "win32") {
    return {
      label: "Scheduled Task",
      loadedText: "registered",
      notLoadedText: "missing",
      install: async (args) => {
        await installScheduledTask(args);
      },
      uninstall: async (args) => {
        await uninstallScheduledTask(args);
      },
      stop: async (args) => {
        await stopScheduledTask({
          stdout: args.stdout,
          env: args.env,
        });
      },
      restart: async (args) => {
        await restartScheduledTask({
          stdout: args.stdout,
          env: args.env,
        });
      },
      isLoaded: async (args) => isScheduledTaskInstalled(args),
      readCommand: readScheduledTaskCommand,
      readRuntime: async (env) => await readScheduledTaskRuntime(env),
    };
  }

  throw new Error(`Gateway service install not supported on ${process.platform}`);
}
