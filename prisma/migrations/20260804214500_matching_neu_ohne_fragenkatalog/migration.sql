-- Der alte Fragenkatalog wird abgelöst.
--
-- Bisher lagen die Matching-Fragen als Datensätze in `MatchQuestion` und die
-- Antworten des Betriebs als Zeilen in `JobCriterion`. Das konnte nur
-- Zahlenspannen abbilden; alles andere (Ausbildungsbereich, Aufgabenfelder,
-- Prioritäten) musste in 0/1 gepresst werden. Das Anforderungsprofil steht
-- jetzt in Spalten des Inserats, der Fachkatalog im Code
-- (`src/matching/catalog.ts`) — damit kann eine Antwort nicht mehr auf eine
-- Frage zeigen, die es nicht gibt.
--
-- Die gelöschten Zeilen stammen ausschließlich aus den Testbetrieben und
-- werden vom neuen Seed ersetzt.
ALTER TABLE "JobCriterion" DROP CONSTRAINT "JobCriterion_jobPostingId_fkey";
ALTER TABLE "JobCriterion" DROP CONSTRAINT "JobCriterion_questionId_fkey";

DROP TABLE "JobCriterion";
DROP TABLE "MatchQuestion";
