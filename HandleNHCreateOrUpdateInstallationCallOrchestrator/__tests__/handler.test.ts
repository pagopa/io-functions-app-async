// tslint:disable:no-any

import { NonEmptyString } from "italia-ts-commons/lib/strings";
import { context as contextMockBase } from "../../__mocks__/durable-functions";
import { PlatformEnum } from "../../generated/backend/Platform";
import {
  CreateOrUpdateInstallationMessage,
  KindEnum as CreateOrUpdateKind
} from "../../generated/notifications/CreateOrUpdateInstallationMessage";

import { success } from "../../utils/durable/activities";
import { consumeGenerator } from "../../utils/durable/utils";
import {
  getHandler,
  NhCreateOrUpdateInstallationOrchestratorCallInput
} from "../handler";

import { NotificationHubConfig } from "../../utils/notificationhubServicePartition";
import { readableReport } from "italia-ts-commons/lib/reporters";
import { IOrchestrationFunctionContext } from "durable-functions/lib/src/iorchestrationfunctioncontext";
import {
  CallableActivity,
  failureActivity,
  OrchestratorActivityFailure,
  OrchestratorFailure,
  OrchestratorInvalidInputFailure,
  OrchestratorSuccess,
  OrchestratorUnhandledFailure
} from "../../utils/durable/orchestrators";
import { ActivityInput as CreateOrUpdateActivityInput } from "../../HandleNHCreateOrUpdateInstallationCallActivity";

import {
  getMockDeleteInstallationActivity,
  getMockIsUserATestUserActivity
} from "../../__mocks__/activities-mocks";

const aFiscalCodeHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" as NonEmptyString;
const aPushChannel =
  "fLKP3EATnBI:APA91bEy4go681jeSEpLkNqhtIrdPnEKu6Dfi-STtUiEnQn8RwMfBiPGYaqdWrmzJyXIh5Yms4017MYRS9O1LGPZwA4sOLCNIoKl4Fwg7cSeOkliAAtlQ0rVg71Kr5QmQiLlDJyxcq3p";

const aCreateOrUpdateInstallationMessage = CreateOrUpdateInstallationMessage.decode(
  {
    installationId: aFiscalCodeHash,
    kind: CreateOrUpdateKind.CreateOrUpdateInstallation,
    platform: PlatformEnum.apns,
    pushChannel: aPushChannel,
    tags: [aFiscalCodeHash]
  }
).getOrElseL(err => {
  throw new Error(
    `Cannot decode aCreateOrUpdateInstallationMessage: ${readableReport(err)}`
  );
});

const anOrchestratorInput = NhCreateOrUpdateInstallationOrchestratorCallInput.encode(
  {
    message: aCreateOrUpdateInstallationMessage
  }
);

const legacyNotificationHubConfig: NotificationHubConfig = {
  AZURE_NH_ENDPOINT: "foo" as NonEmptyString,
  AZURE_NH_HUB_NAME: "bar" as NonEmptyString
};
const newNotificationHubConfig: NotificationHubConfig = {
  AZURE_NH_ENDPOINT: "foo" as NonEmptyString,
  AZURE_NH_HUB_NAME: "bar" as NonEmptyString
};

type CallableCreateOrUpdateActivity = CallableActivity<
  CreateOrUpdateActivityInput
>;
const mockCreateOrUpdateActivity = jest.fn<
  ReturnType<CallableCreateOrUpdateActivity>,
  Parameters<CallableCreateOrUpdateActivity>
>(function*() {
  return { kind: "SUCCESS" };
});

const mockGetInput = jest.fn<unknown, []>(() => anOrchestratorInput);
const contextMockWithDf = ({
  ...contextMockBase,
  df: {
    callActivityWithRetry: jest.fn().mockReturnValueOnce(success()),
    getInput: mockGetInput,
    setCustomStatus: jest.fn()
  }
} as unknown) as IOrchestrationFunctionContext;

const mockIsUserATestUserActivityTrue = getMockIsUserATestUserActivity(true);
const mockIsUserATestUserActivityFalse = getMockIsUserATestUserActivity(false);
const mockDeleteInstallationActivitySuccess = getMockDeleteInstallationActivity(
  success()
);

describe("HandleNHCreateOrUpdateInstallationCallOrchestrator", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it("should start the activities with the right inputs", async () => {
    const orchestratorHandler = getHandler({
      createOrUpdateActivity: mockCreateOrUpdateActivity,
      deleteInstallationActivity: mockDeleteInstallationActivitySuccess,
      isUserInActiveTestSubsetActivity: mockIsUserATestUserActivityTrue,
      legacyNotificationHubConfig: legacyNotificationHubConfig,
      notificationHubConfigPartitionChooser: _ => newNotificationHubConfig
    })(contextMockWithDf);

    const result = consumeGenerator(orchestratorHandler);

    OrchestratorSuccess.decode(result).fold(
      err => fail(`Cannot decode test result, err: ${readableReport(err)}`),
      _ => {
        expect(mockCreateOrUpdateActivity).toBeCalledWith(
          expect.any(Object),
          expect.objectContaining({
            installationId: aCreateOrUpdateInstallationMessage.installationId,
            platform: aCreateOrUpdateInstallationMessage.platform,
            tags: aCreateOrUpdateInstallationMessage.tags,
            pushChannel: aCreateOrUpdateInstallationMessage.pushChannel,
            notificationHubConfig: legacyNotificationHubConfig
          })
        );
      }
    );
  });

  it("should call CreateOrUpdate activity with legacy parameters if user is a test user", async () => {
    const orchestratorHandler = getHandler({
      createOrUpdateActivity: mockCreateOrUpdateActivity,
      isUserInActiveTestSubsetActivity: mockIsUserATestUserActivityTrue,
      legacyNotificationHubConfig: legacyNotificationHubConfig,
      notificationHubConfigPartitionChooser: _ => newNotificationHubConfig,
      deleteInstallationActivity: mockDeleteInstallationActivitySuccess
    })(contextMockWithDf);

    const result = consumeGenerator(orchestratorHandler);

    OrchestratorSuccess.decode(result).fold(
      err => fail(`Cannot decode test result, err: ${readableReport(err)}`),
      _ => {
        expect(mockCreateOrUpdateActivity).toBeCalledWith(
          expect.any(Object),
          expect.objectContaining({
            installationId: aCreateOrUpdateInstallationMessage.installationId,
            platform: aCreateOrUpdateInstallationMessage.platform,
            tags: aCreateOrUpdateInstallationMessage.tags,
            pushChannel: aCreateOrUpdateInstallationMessage.pushChannel,
            notificationHubConfig: legacyNotificationHubConfig
          })
        );

        expect(mockDeleteInstallationActivitySuccess).not.toHaveBeenCalled();
      }
    );
  });

  it("should call CreateOrUpdate activity with legacy NH parameters if user is NOT a test user", async () => {
    const orchestratorHandler = getHandler({
      createOrUpdateActivity: mockCreateOrUpdateActivity,
      isUserInActiveTestSubsetActivity: mockIsUserATestUserActivityFalse,
      legacyNotificationHubConfig: legacyNotificationHubConfig,
      notificationHubConfigPartitionChooser: _ => newNotificationHubConfig,
      deleteInstallationActivity: mockDeleteInstallationActivitySuccess
    })(contextMockWithDf);

    const result = consumeGenerator(orchestratorHandler);

    OrchestratorSuccess.decode(result).fold(
      err => fail(`Cannot decode test result, err: ${readableReport(err)}`),
      _ => {
        expect(mockCreateOrUpdateActivity).toBeCalledWith(
          expect.any(Object),
          expect.objectContaining({
            installationId: aCreateOrUpdateInstallationMessage.installationId,
            platform: aCreateOrUpdateInstallationMessage.platform,
            tags: aCreateOrUpdateInstallationMessage.tags,
            pushChannel: aCreateOrUpdateInstallationMessage.pushChannel,
            notificationHubConfig: legacyNotificationHubConfig
          })
        );

        expect(mockDeleteInstallationActivitySuccess).not.toBeCalled();
      }
    );
  });

  // -------
  // Failure
  // -------

  it("should not start activity with wrong inputs", async () => {
    const input = {
      message: "aMessage"
    };
    mockGetInput.mockImplementationOnce(() => input);

    const orchestratorHandler = getHandler({
      createOrUpdateActivity: mockCreateOrUpdateActivity,
      isUserInActiveTestSubsetActivity: mockIsUserATestUserActivityFalse,
      legacyNotificationHubConfig: legacyNotificationHubConfig,
      notificationHubConfigPartitionChooser: _ => newNotificationHubConfig,
      deleteInstallationActivity: mockDeleteInstallationActivitySuccess
    })(contextMockWithDf);

    expect.assertions(2);
    try {
      consumeGenerator(orchestratorHandler);
    } catch (err) {
      expect(OrchestratorInvalidInputFailure.is(err)).toBe(true);
      expect(contextMockWithDf.df.callActivityWithRetry).not.toBeCalled();
    }
  });

  it("should fail if CreateOrUpdateActivity fails with unexpected throw", async () => {
    mockCreateOrUpdateActivity.mockImplementationOnce(() => {
      throw new Error("any exception");
    });

    const orchestratorHandler = getHandler({
      createOrUpdateActivity: mockCreateOrUpdateActivity,
      isUserInActiveTestSubsetActivity: mockIsUserATestUserActivityTrue,
      legacyNotificationHubConfig: legacyNotificationHubConfig,
      notificationHubConfigPartitionChooser: _ => newNotificationHubConfig,
      deleteInstallationActivity: mockDeleteInstallationActivitySuccess
    })(contextMockWithDf);

    expect.assertions(2);
    try {
      consumeGenerator(orchestratorHandler);
    } catch (err) {
      expect(OrchestratorUnhandledFailure.is(err)).toBe(true);
      expect(contextMockWithDf.df.callActivityWithRetry).not.toBeCalled();
    }
  });

  it("should fail if CreateOrUpdateActivity fails ", async () => {
    mockCreateOrUpdateActivity.mockImplementationOnce(() => {
      throw failureActivity("any activity name", "any reason");
    });

    const orchestratorHandler = getHandler({
      createOrUpdateActivity: mockCreateOrUpdateActivity,
      isUserInActiveTestSubsetActivity: mockIsUserATestUserActivityTrue,
      legacyNotificationHubConfig: legacyNotificationHubConfig,
      notificationHubConfigPartitionChooser: _ => newNotificationHubConfig,
      deleteInstallationActivity: mockDeleteInstallationActivitySuccess
    })(contextMockWithDf);

    expect.assertions(2);
    try {
      consumeGenerator(orchestratorHandler);
    } catch (err) {
      expect(OrchestratorActivityFailure.is(err)).toBe(true);
      expect(contextMockWithDf.df.callActivityWithRetry).not.toBeCalled();
    }
  });
});
