import { Task } from "durable-functions/lib/src/classes";
import * as t from "io-ts";

import * as o from "../utils/durable/orchestrators";
import {
  getNotificationHubPartitionConfig,
  NotificationHubConfig
} from "../utils/notificationhubServicePartition";

import { DeleteInstallationMessage } from "../generated/notifications/DeleteInstallationMessage";

import { getCallableActivity as getDeleteInstallationCallableActivity } from "../HandleNHDeleteInstallationCallActivity";
import { getCallableActivity as getIsUserInActiveSubsetActivityCallableActivity } from "../IsUserInActiveSubsetActivity";

/**
 * Orchestrator Name
 */
export const OrchestratorName = "HandleNHDeleteInstallationCallOrchestrator";

/**
 * Carries information about Notification Hub Message payload
 */
export type OrchestratorCallInput = t.TypeOf<typeof OrchestratorCallInput>;
export const OrchestratorCallInput = t.interface({
  message: DeleteInstallationMessage
});

interface IHandlerParams {
  readonly deleteInstallationActivity: ReturnType<
    typeof getDeleteInstallationCallableActivity
  >;
  readonly isUserInActiveTestSubsetActivity: ReturnType<
    typeof getIsUserInActiveSubsetActivityCallableActivity
  >;
  readonly legacyNotificationHubConfig: NotificationHubConfig;
  readonly notificationHubConfigPartitionChooser: ReturnType<
    typeof getNotificationHubPartitionConfig
  >;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const getHandler = ({
  deleteInstallationActivity,
  isUserInActiveTestSubsetActivity,
  legacyNotificationHubConfig,
  notificationHubConfigPartitionChooser
}: IHandlerParams) =>
  o.createOrchestrator(OrchestratorName, OrchestratorCallInput, function*({
    context,
    input: {
      message: { installationId }
    },
    logger
  }): Generator<Task, void, Task> {
    yield* deleteInstallationActivity(context, {
      installationId,
      notificationHubConfig: legacyNotificationHubConfig
    });

    const isUserATestUser = yield* isUserInActiveTestSubsetActivity(context, {
      installationId
    });

    if (isUserATestUser.value) {
      logger.info(`TEST_USER:${installationId}`);

      const notificationHubConfigPartition = notificationHubConfigPartitionChooser(
        installationId
      );

      yield* deleteInstallationActivity(context, {
        installationId,
        notificationHubConfig: notificationHubConfigPartition
      });
    }
  });
