import {
  ApplicationStatus,
  ContactRequestStatus,
  DocumentType,
  JobApplicationStatus,
  JobOfferStatus,
} from '@prisma/client';

/**
 * Deutsche Bezeichnungen der Datenbank-Status.
 *
 * Nach außen spricht die API durchgehend deutsch — die Enum-Namen aus der
 * Datenbank sind ein internes Detail. Die Tabellen standen bislang doppelt in
 * `jobs.service.ts` und `employer.service.ts`; sie liegen hier, damit
 * Handwerker-Ansicht, Betriebs-Ansicht und DSGVO-Auskunft denselben Begriff
 * für denselben Zustand verwenden und nicht auseinanderlaufen können.
 */

export const APPLICATION_STATUS_DE: Record<JobApplicationStatus, string> = {
  SENT: 'gesendet',
  SEEN: 'gesehen',
  INTERVIEW: 'im_gespraech',
  REJECTED: 'abgelehnt',
  ACCEPTED: 'zusage',
};

export const OFFER_STATUS_DE: Record<JobOfferStatus, string> = {
  NEW: 'neu',
  ACCEPTED: 'angenommen',
  DECLINED: 'abgelehnt',
};

export const CONTACT_STATUS_DE: Record<ContactRequestStatus, string> = {
  REQUESTED: 'angefragt',
  APPROVED: 'freigegeben',
  DECLINED: 'abgelehnt',
};

/** Absagegründe aus dem Angebots-Dialog, ausgeschrieben. */
export const DECLINE_REASON_DE: Record<string, string> = {
  zu_weit: 'Weg zu weit',
  gehalt: 'Gehalt zu niedrig',
  montage: 'Montage kommt nicht infrage',
  gewerk: 'Falsches Gewerk',
  sonstiges: 'Sonstiges',
};

/** Bearbeitungsstand einer über das Formular eingereichten Bewerbung. */
export const SUBMISSION_STATUS_DE: Record<ApplicationStatus, string> = {
  SUBMITTED: 'eingegangen',
  IN_REVIEW: 'in_pruefung',
  MATCHED: 'vermittelt',
  ARCHIVED: 'archiviert',
  ERASED: 'geloescht',
};

/** Art einer hochgeladenen Unterlage. */
export const DOCUMENT_TYPE_DE: Record<DocumentType, string> = {
  PHOTO: 'Bewerbungsfoto',
  CV: 'Lebenslauf',
  QUALIFICATION: 'Qualifikationsnachweis',
};
