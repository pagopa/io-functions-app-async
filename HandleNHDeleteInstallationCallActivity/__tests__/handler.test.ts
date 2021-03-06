// tslint:disable:no-any

import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { context as contextMock } from "../../__mocks__/durable-functions";
import {
  getActivityBody,
  ActivityInput,
  ActivityResultSuccess
} from "../handler";

import * as azure from "azure-sb";

import { envConfig } from "../../__mocks__/env-config.mock";
import { NotificationHubConfig } from "../../utils/notificationhubServicePartition";
import {
  ActivityResultFailure,
  createActivity
} from "../../utils/durable/activities";
import { activityName } from "..";

const aFiscalCodeHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" as NonEmptyString;

const anInstallationId = aFiscalCodeHash;

const aNHConfig = {
  AZURE_NH_ENDPOINT: envConfig.AZURE_NH_ENDPOINT,
  AZURE_NH_HUB_NAME: envConfig.AZURE_NH_HUB_NAME
} as NotificationHubConfig;

const mockNotificationHubService = {
  deleteInstallation: jest.fn()
};
const mockBuildNHService = jest
  .fn()
  .mockImplementation(
    _ => (mockNotificationHubService as unknown) as azure.NotificationHubService
  );

const handler = createActivity(
  activityName,
  ActivityInput, // FIXME: the editor marks it as type error, but tests compile correctly
  ActivityResultSuccess,
  getActivityBody(mockBuildNHService)
);

describe("HandleNHDeleteInstallationCallActivity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it("should call deleteInstallation with right NH parameters", async () => {
    mockNotificationHubService.deleteInstallation = jest
      .fn()
      .mockImplementation((_, cb) => cb());

    const input = ActivityInput.encode({
      installationId: anInstallationId,
      notificationHubConfig: aNHConfig
    });
    const res = await handler(contextMock as any, input);
    expect(mockNotificationHubService.deleteInstallation).toHaveBeenCalledTimes(
      1
    );

    expect(mockBuildNHService).toHaveBeenCalledWith(aNHConfig);

    expect(ActivityResultSuccess.is(res)).toBeTruthy();
  });

  it("should NOT trigger a retry if deleteInstallation fails", async () => {
    mockNotificationHubService.deleteInstallation = jest
      .fn()
      .mockImplementation((_, cb) => cb(new Error("deleteInstallation error")));

    const input = ActivityInput.encode({
      installationId: anInstallationId,
      notificationHubConfig: aNHConfig
    });
    const res = await handler(contextMock as any, input);
    expect(mockNotificationHubService.deleteInstallation).toHaveBeenCalledTimes(
      1
    );
    expect(ActivityResultFailure.is(res)).toBeTruthy();
  });
});
