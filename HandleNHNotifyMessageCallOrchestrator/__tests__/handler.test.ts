// tslint:disable:no-any
import * as df from "durable-functions";

import { NonEmptyString } from "italia-ts-commons/lib/strings";
import { context as contextMock } from "../../__mocks__/durable-functions";
import {
  success as activitySuccess,
  success
} from "../../utils/durable/activities";

import { KindEnum as NotifyMessageKind } from "../../generated/notifications/NotifyMessage";
import { NotifyMessage } from "../../generated/notifications/NotifyMessage";

import { getHandler, NhNotifyMessageOrchestratorCallInput } from "../handler";

import { envConfig } from "../../__mocks__/env-config.mock";
import {
  getMockIsUserATestUserActivity,
  getMockNotifyMessageInstallationActivity
} from "../../__mocks__/activities-mocks";

import {
  OrchestratorFailure,
  success as orchestratorSuccess
} from "../../utils/durable/orchestrators";
import { IOrchestrationFunctionContext } from "durable-functions/lib/src/iorchestrationfunctioncontext";
import { NotificationHubConfig } from "../../utils/notificationhubServicePartition";

import { consumeGenerator } from "../../utils/durable/utils";

const legacyNotificationHubConfig: NotificationHubConfig = {
  AZURE_NH_ENDPOINT: "foo" as NonEmptyString,
  AZURE_NH_HUB_NAME: "bar" as NonEmptyString
};
const newNotificationHubConfig: NotificationHubConfig = {
  AZURE_NH_ENDPOINT: "foo2" as NonEmptyString,
  AZURE_NH_HUB_NAME: "bar2" as NonEmptyString
};

const aFiscalCodeHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" as NonEmptyString;

const aNotifyMessage: NotifyMessage = {
  installationId: aFiscalCodeHash,
  kind: NotifyMessageKind.Notify,
  payload: {
    message: "message",
    message_id: "id",
    title: "title"
  }
};

const nhCallOrchestratorInput = NhNotifyMessageOrchestratorCallInput.encode({
  message: aNotifyMessage
});

const retryOptions = {
  ...new df.RetryOptions(5000, envConfig.RETRY_ATTEMPT_NUMBER),
  backoffCoefficient: 1.5
};

const mockIsUserATestUserActivityTrue = getMockIsUserATestUserActivity(true);
const mockIsUserATestUserActivityFalse = getMockIsUserATestUserActivity(false);
const mockNotifyMessageActivitySuccess = getMockNotifyMessageInstallationActivity(
  success()
);

const mockGetInput = jest.fn<unknown, []>(() => nhCallOrchestratorInput);
const contextMockWithDf = ({
  ...contextMock,
  df: {
    callActivityWithRetry: jest.fn().mockReturnValue(activitySuccess()),
    getInput: mockGetInput,
    setCustomStatus: jest.fn()
  }
} as unknown) as IOrchestrationFunctionContext;

describe("HandleNHNotifyMessageCallOrchestrator", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should start the activities with the right inputs", async () => {
    const orchestratorHandler = getHandler({
      notifyMessageActivity: mockNotifyMessageActivitySuccess,
      isUserInActiveTestSubsetActivity: mockIsUserATestUserActivityFalse,
      legacyNotificationHubConfig: legacyNotificationHubConfig,
      notificationHubConfigPartitionChooser: _ => newNotificationHubConfig
    })(contextMockWithDf as any);

    consumeGenerator(orchestratorHandler);

    expect(mockNotifyMessageActivitySuccess).toBeCalledWith(
      expect.any(Object),
      expect.objectContaining({
        message: aNotifyMessage,
        notificationHubConfig: legacyNotificationHubConfig
      })
    );
  });

  it("should end the activity with SUCCESS", async () => {
    const orchestratorHandler = getHandler({
      notifyMessageActivity: mockNotifyMessageActivitySuccess,
      isUserInActiveTestSubsetActivity: mockIsUserATestUserActivityFalse,
      legacyNotificationHubConfig: legacyNotificationHubConfig,
      notificationHubConfigPartitionChooser: _ => newNotificationHubConfig
    })(contextMockWithDf as any);

    const res = consumeGenerator(orchestratorHandler);

    expect(res).toEqual(orchestratorSuccess());
  });

  it("should call Notify Message one time with legacy parameters, if user is NOT a test user", async () => {
    const orchestratorHandler = getHandler({
      notifyMessageActivity: mockNotifyMessageActivitySuccess,
      isUserInActiveTestSubsetActivity: mockIsUserATestUserActivityFalse,
      legacyNotificationHubConfig: legacyNotificationHubConfig,
      notificationHubConfigPartitionChooser: _ => newNotificationHubConfig
    })(contextMockWithDf as any);

    consumeGenerator(orchestratorHandler);

    expect(mockNotifyMessageActivitySuccess).toHaveBeenCalledTimes(1);
    expect(mockNotifyMessageActivitySuccess).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        message: aNotifyMessage,
        notificationHubConfig: legacyNotificationHubConfig
      })
    );
  });

  it("should call Notify Message twice with both legacy and new parameters, if user is a test user", async () => {
    const orchestratorHandler = getHandler({
      notifyMessageActivity: mockNotifyMessageActivitySuccess,
      isUserInActiveTestSubsetActivity: mockIsUserATestUserActivityTrue,
      legacyNotificationHubConfig: legacyNotificationHubConfig,
      notificationHubConfigPartitionChooser: _ => newNotificationHubConfig
    })(contextMockWithDf as any);

    consumeGenerator(orchestratorHandler);

    expect(mockNotifyMessageActivitySuccess).toHaveBeenCalledTimes(2);
    expect(mockNotifyMessageActivitySuccess).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        message: aNotifyMessage,
        notificationHubConfig: legacyNotificationHubConfig
      })
    );
    expect(mockNotifyMessageActivitySuccess).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        message: aNotifyMessage,
        notificationHubConfig: newNotificationHubConfig
      })
    );
  });

  it("should NOT start activity with wrong inputs", async () => {
    const nhCallOrchestratorInput = {
      message: "aMessage"
    };

    mockGetInput.mockImplementationOnce(() => nhCallOrchestratorInput);

    const orchestratorHandler = getHandler({
      notifyMessageActivity: mockNotifyMessageActivitySuccess,
      isUserInActiveTestSubsetActivity: mockIsUserATestUserActivityFalse,
      legacyNotificationHubConfig: legacyNotificationHubConfig,
      notificationHubConfigPartitionChooser: _ => newNotificationHubConfig
    })(contextMockWithDf as any);

    expect.assertions(2);
    try {
      consumeGenerator(orchestratorHandler);
    } catch (err) {
      expect(OrchestratorFailure.is(err)).toBe(true);
      expect(contextMockWithDf.df.callActivityWithRetry).not.toBeCalled();
    }
  });
});
