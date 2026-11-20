/** What an Ask or chat request carries (specs/020 B4): the field only when the box is shown and ticked. */
export const consentField = (shown: boolean, ticked: boolean): { trainingConsent?: true } => (shown && ticked ? { trainingConsent: true } : {});
