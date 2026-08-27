// ABOUTME: Hidden qualification-only command for one process-local DAH organization read.
// ABOUTME: Writes only the public I321 staging Community receipt and never persists credentials.

import { Option } from "clipanion";
import { BaseCommand } from "../base";
import { openBrowser as defaultOpenBrowser } from "../../core/auth/browser";
import { runDeviceFlow } from "../../core/auth/device-flow";
import {
  executeStagingCommunityQualification,
  type StagingCommunityQualificationDependencies,
} from "../../core/management/staging-community-qualification";

type QualificationCommandDependencies = StagingCommunityQualificationDependencies & {
  openBrowser?: (url: string) => void;
  runDeviceFlow?: typeof runDeviceFlow;
};

// Intentionally has no `static usage`: this is an I336 qualification seam, not public CLI surface.
export class QualifyStagingCommunityCommand extends BaseCommand {
  static override paths = [["__internal", "qualify-staging-community"]];
  static testDeps: QualificationCommandDependencies | undefined;

  planPath = Option.String("--plan-file", { required: true });
  outputPath = Option.String("--output-file", { required: true });

  async execute(): Promise<number> {
    const dependencies = QualifyStagingCommunityCommand.testDeps ?? {};
    try {
      await executeStagingCommunityQualification({
        planPath: this.planPath,
        outputPath: this.outputPath,
        onUserAction: ({ verification_uri_complete }) => {
          this.context.stderr.write("AUTH_DEVICE_APPROVAL_REQUIRED\n");
          (dependencies.openBrowser ?? defaultOpenBrowser)(verification_uri_complete);
        },
      }, dependencies);
      return 0;
    } catch {
      this.context.stderr.write("STAGING_COMMUNITY_QUALIFICATION_FAILED\n");
      return 1;
    }
  }
}
