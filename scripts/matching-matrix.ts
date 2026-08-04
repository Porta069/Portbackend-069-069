/**
 * Prüfmatrix: jeder Testhandwerker gegen jedes Testinserat.
 *
 * Zeigt je Paarung entweder den Score oder das Ausschlusskriterium, an dem es
 * scheitert. Damit lässt sich nach einer Änderung am Matching in einem Blick
 * sehen, ob noch jede Regel greift — und zwar an echten Daten statt an
 * Testattrappen. Nur lesend.
 *
 *   npx ts-node scripts/matching-matrix.ts
 */
import { PrismaClient } from '@prisma/client';
import { MatchingService } from '../src/matching/matching.service';

const prisma = new PrismaClient();
const matching = new MatchingService();

async function main() {
  const workers = await prisma.user.findMany({
    where: { email: { endsWith: '@portawerk-test.de' }, role: 'APPLICANT' },
    orderBy: { email: 'asc' },
  });
  const postings = await prisma.jobPosting.findMany({
    where: { status: 'ACTIVE', source: 'ADMIN' },
    include: { company: true },
    orderBy: { createdAt: 'asc' },
  });

  for (const w of workers) {
    const profile = matching.extractProfile(w);
    console.log(`\n── ${w.email} (${profile.profil.bereich}, ${profile.profil.erfahrung}) ──`);
    let sichtbar = 0;
    for (const p of postings) {
      const b = matching.score(matching.anforderungVon(p), profile);
      const kurz = p.company.name.replace(/^TEST /, '').split(' [')[0];
      if (b.passed) {
        sichtbar++;
        console.log(`   ${String(b.score).padStart(3)} %  ${kurz}`);
      } else {
        console.log(`   ───   ${kurz}  ✗ ${b.knockouts.map((k) => k.label).join(', ')}`);
      }
    }
    console.log(`   → ${sichtbar} von ${postings.length} Stellen sichtbar`);
  }
  await prisma.$disconnect();
}

void main();
