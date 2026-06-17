import {
  desktopIpcChannels,
  type DesktopComputerUseActionResult,
  type DesktopComputerUseStatus
} from "../../shared/contracts/ipc";
import type { DesktopComputerUseApi } from "../types";
import { invokeDesktopApi } from "./invoke";

export function createComputerUseDesktopApi(): DesktopComputerUseApi {
  return {
    checkStatus(): Promise<DesktopComputerUseStatus> {
      return invokeDesktopApi(desktopIpcChannels.computerUse.checkStatus);
    },
    install(): Promise<DesktopComputerUseActionResult> {
      return invokeDesktopApi(desktopIpcChannels.computerUse.install);
    },
    uninstall(): Promise<DesktopComputerUseActionResult> {
      return invokeDesktopApi(desktopIpcChannels.computerUse.uninstall);
    },
    grantPermissions(): Promise<DesktopComputerUseActionResult> {
      return invokeDesktopApi(desktopIpcChannels.computerUse.grantPermissions);
    }
  };
}
