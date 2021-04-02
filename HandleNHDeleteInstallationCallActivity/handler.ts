import * as t from "io-ts";

import { Context } from "@azure/functions";
import { toString } from "fp-ts/lib/function";

import { readableReport } from "italia-ts-commons/lib/reporters";

import { fromEither } from "fp-ts/lib/TaskEither";
import { DeleteInstallationMessage } from "../generated/notifications/DeleteInstallationMessage";
import { deleteInstallation } from "../utils/notification";

import {
  ActivityResult,
  ActivityResultFailure,
  ActivityResultSuccess,
  success
} from "../utils/activity";
import {
  buildNHService,
  NotificationHubConfig
} from "../utils/notificationhubServicePartition";

// Activity input
export const ActivityInput = t.interface({
  message: DeleteInstallationMessage,
  notificationHubConfig: NotificationHubConfig
});

export type ActivityInput = t.TypeOf<typeof ActivityInput>;

const failActivity = (context: Context, logPrefix: string) => (
  errorMessage: string,
  errorDetails?: string
) => {
  const details = errorDetails ? `|ERROR_DETAILS=${errorDetails}` : ``;
  context.log.error(`${logPrefix}|${errorMessage}${details}`);
  return ActivityResultFailure.encode({
    kind: "FAILURE",
    reason: errorMessage
  });
};

/**
 * For each Notification Hub Message of type "Delete" calls related Notification Hub service
 */
export const getCallNHDeleteInstallationActivityHandler = (
  logPrefix = "NHDeleteCallServiceActivity"
) => async (context: Context, input: unknown) => {
  const failure = failActivity(context, logPrefix);
  return fromEither(ActivityInput.decode(input))
    .mapLeft(errs =>
      failure("Error decoding activity input", readableReport(errs))
    )
    .chain<ActivityResultSuccess>(({ message, notificationHubConfig }) => {
      context.log.info(
        `${logPrefix}|${message.kind}|INSTALLATION_ID=${message.installationId}`
      );

      const nhService = buildNHService(notificationHubConfig);

      return deleteInstallation(nhService, message.installationId).mapLeft(
        e => {
          // do not trigger a retry as delete may fail in case of 404
          context.log.error(`${logPrefix}|ERROR=${toString(e)}`);
          return failure(e.message);
        }
      );
    })
    .fold<ActivityResult>(
      err => err,
      _ => success()
    )
    .run();
};
