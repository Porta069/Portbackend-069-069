-- Zustimmung zu Nutzungsbedingungen und Datenschutzerklärung nachweisbar machen.
--
-- Bisher wurden die beiden Häkchen der Registrierung nur im Browser geprüft und
-- danach verworfen. Damit ließ sich weder belegen, DASS jemand zugestimmt hat,
-- noch WELCHEM Textstand — beides braucht man, sobald eine Klausel (etwa das
-- Umgehungsverbot) durchgesetzt werden soll.
--
-- Bestandskonten bleiben leer: Ihre Zustimmung wurde nie erfasst, und ein
-- nachträglich gesetztes Datum wäre eine Erfindung. Sie werden bei nächster
-- Gelegenheit erneut um Zustimmung gebeten.
ALTER TABLE "User"
  ADD COLUMN "agbAcceptedAt"         TIMESTAMP(3),
  ADD COLUMN "agbVersion"            TEXT,
  ADD COLUMN "datenschutzAcceptedAt" TIMESTAMP(3),
  ADD COLUMN "datenschutzVersion"    TEXT;
