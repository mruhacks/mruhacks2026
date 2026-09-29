import { randomInt, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { putObject } from '@/utils/object-storage';

/** Read the committed PDFs once per run; seeding never needs LaTeX. */
export async function createResumeSeeder() {
  const fixtures = await Promise.all(
    Array.from({ length: 20 }, async (_, index) => {
      const fileName = `resume-${String(index + 1).padStart(2, '0')}.pdf`;
      const body = await readFile(
        new URL(`./fixtures/resumes/${fileName}`, import.meta.url),
      );
      return { fileName, body };
    }),
  );

  return async (userId: string) => {
    // Keep resume selection independent of Faker's seeded demo-data sequence.
    const fixture = fixtures[randomInt(fixtures.length)];
    // Each user owns their copy: replacing/removing it must not delete
    // a shared object that another user's profile still references.
    const key = `resumes/${userId}/${randomUUID()}.pdf`;
    await putObject({
      key,
      body: fixture.body,
      contentType: 'application/pdf',
    });
    return {
      resumeFile: key,
      resumeFileName: fixture.fileName,
      resumeFileType: 'application/pdf',
    };
  };
}
