export {
  inferNicheFromText,
  inferAudienceFromText,
  isNicheAndAudienceClear,
  shouldAskCreatorContextQuestion,
  inferOnboardingSlugsFromDescription,
  isNicheAndAudienceClear as isOnboardingDescriptionClearEnough,
  shouldAskCreatorContextQuestion as shouldAskOnboardingClarifyingQuestion,
} from "./creatorContextInference";
