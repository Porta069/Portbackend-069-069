-- Aufgabenbereiche sind standardmäßig KEIN Ausschlusskriterium mehr.
--
-- Mit Vorgabe 1 fiel jeder Handwerker aus jeder Stelle, deren Aufgabenfelder
-- er nicht angekreuzt hatte — ein Elektriker sah dann keine Elektrikerstelle
-- mehr. Gemeint war das Gegenteil: die Felder beschreiben die Stelle und
-- zählen Punkte. Wer sie zur Pflicht machen will, setzt `aufgabenMin` bewusst.
ALTER TABLE "JobPosting" ALTER COLUMN "aufgabenMin" SET DEFAULT 0;
