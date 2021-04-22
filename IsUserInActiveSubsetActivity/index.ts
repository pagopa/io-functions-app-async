﻿import { getConfigOrThrow } from "../utils/config";
import { createActivity } from "../utils/durable/activities";
import {
  getIsInActiveSubset,
  getIsUserABetaTestUser
} from "../utils/featureFlags";

import {
  ActivityInput,
  ActivityResultSuccessWithValue,
  activityResultSuccessWithValue,
  getActivityBody
} from "./handler";

export {
  ActivityInput,
  ActivityResultSuccessWithValue,
  activityResultSuccessWithValue
};

const config = getConfigOrThrow();

export const activityName = "IsUserInActiveSubsetActivity";

const activityFunction = getActivityBody({
  enabledFeatureFlag: config.NH_PARTITION_FEATURE_FLAG,
  isInActiveSubset: getIsInActiveSubset(getIsUserABetaTestUser())
});

const activityFunctionHandler = createActivity(
  activityName,
  ActivityInput,
  activityResultSuccessWithValue,
  activityFunction
);

export default activityFunctionHandler;