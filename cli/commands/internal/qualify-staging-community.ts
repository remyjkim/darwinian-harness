// ABOUTME: Hidden qualification-only command for one composite I321 D52 ceremony.
// ABOUTME: Writes only the paired public readiness and Community receipts.

import { Option } from "clipanion";
import { BaseCommand } from "../base";
import {
  executeI321PhaseACeremony,
  type I321PhaseACeremonyDependencies,
} from "../../core/management/phase-a-ceremony";

type QualificationCommandDependencies = I321PhaseACeremonyDependencies & {
  env?: Record<string, string | undefined>;
  executeCeremony?: typeof executeI321PhaseACeremony;
};

// Intentionally has no `static usage`: this is an I336 qualification seam, not public CLI surface.
export class QualifyStagingCommunityCommand extends BaseCommand {
  static override paths = [["__internal", "qualify-staging-community"]];
  static testDeps: QualificationCommandDependencies | undefined;

  planPath = Option.String("--plan-file", { required: true });
  approvalNoticePath = Option.String("--approval-notice-file", { required: true });
  adapterOrigin = Option.String("--phase-a-adapter-origin", { required: true });
  readinessOutputPath = Option.String("--readiness-output-file", { required: true });
  communityOutputPath = Option.String("--community-output-file", { required: true });

  async execute(): Promise<number> {
    const dependencies = QualifyStagingCommunityCommand.testDeps ?? {};
    try {
      const runnerTemp = (dependencies.env ?? process.env).RUNNER_TEMP;
      if (typeof runnerTemp !== "string" || runnerTemp.length === 0) throw new Error("runner temp unavailable");
      await (dependencies.executeCeremony ?? executeI321PhaseACeremony)({
        planPath: this.planPath,
        approvalNoticePath: this.approvalNoticePath,
        adapterOrigin: this.adapterOrigin,
        readinessOutputPath: this.readinessOutputPath,
        communityOutputPath: this.communityOutputPath,
        runnerTemp,
      }, dependencies);
      return 0;
    } catch {
      this.context.stderr.write("STAGING_COMMUNITY_QUALIFICATION_FAILED\n");
      return 1;
    }
  }
}
