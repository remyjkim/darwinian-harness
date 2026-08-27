// ABOUTME: Hidden qualification-only command for one process-local DAH organization read.
// ABOUTME: Writes only the public I321 staging Community receipt and never persists credentials.

import { Option } from "clipanion";
import { BaseCommand } from "../base";
import {
  executeStagingCommunityQualification,
  type StagingCommunityQualificationDependencies,
} from "../../core/management/staging-community-qualification";

type QualificationCommandDependencies = StagingCommunityQualificationDependencies & {
  env?: Record<string, string | undefined>;
};

// Intentionally has no `static usage`: this is an I336 qualification seam, not public CLI surface.
export class QualifyStagingCommunityCommand extends BaseCommand {
  static override paths = [["__internal", "qualify-staging-community"]];
  static testDeps: QualificationCommandDependencies | undefined;

  planPath = Option.String("--plan-file", { required: true });
  approvalNoticePath = Option.String("--approval-notice-file", { required: true });
  outputPath = Option.String("--output-file", { required: true });

  async execute(): Promise<number> {
    const dependencies = QualifyStagingCommunityCommand.testDeps ?? {};
    try {
      const runnerTemp = (dependencies.env ?? process.env).RUNNER_TEMP;
      if (typeof runnerTemp !== "string" || runnerTemp.length === 0) throw new Error("runner temp unavailable");
      await executeStagingCommunityQualification({
        planPath: this.planPath,
        approvalNoticePath: this.approvalNoticePath,
        runnerTemp,
        outputPath: this.outputPath,
      }, dependencies);
      return 0;
    } catch {
      this.context.stderr.write("STAGING_COMMUNITY_QUALIFICATION_FAILED\n");
      return 1;
    }
  }
}
