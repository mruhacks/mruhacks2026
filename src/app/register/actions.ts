"use server";

import {
  participantDietaryRestrictions,
  participantInterests,
  participants,
  genders,
  universities,
  majors,
  yearsOfStudy,
  interests,
  dietaryRestrictions,
  heardFromSources,
} from "@/db/schema";
import { getUser } from "@/utils/auth";
import { ActionResult, fail, ok } from "@/utils/action-result";
import { db } from "@/utils/db";
import {
  formSchema,
  type RegistrationFormValues,
} from "@/components/registration-form/schema";
import { unstable_cache } from "next/cache";

export async function registerParticipant(
  formData: RegistrationFormValues,
): Promise<ActionResult> {
  const user = await getUser();

  if (!user) return fail("User not authenticated");

  const parsed = formSchema.safeParse(formData);

  if (!parsed.success) {
    const message = parsed.error.message;
    return fail(`Validation failed: ${message}`);
  }

  const data = parsed.data;

  try {
    await db.transaction(async (tx) => {
      await tx.insert(participants).values({
        userId: user.id,
        fullName: data.fullName,
        attendedBefore: data.attendedBefore,
        genderId: data.genderId,
        universityId: data.universityId,
        majorId: data.majorId,
        yearOfStudyId: data.yearOfStudyId,
        accommodations: data.accommodations ?? null,
        needsParking: data.needsParking,
        heardFromId: data.heardFromId,
        consentInfoUse: data.consentInfoUse,
        consentSponsorShare: data.consentSponsorShare,
        consentMediaUse: data.consentMediaUse,
      });

      if (data.interests?.length) {
        await tx.insert(participantInterests).values(
          data.interests.map((interestId) => ({
            userId: user.id,
            interestId,
          })),
        );
      }

      if (data.dietaryRestrictions?.length) {
        await tx.insert(participantDietaryRestrictions).values(
          data.dietaryRestrictions.map((restrictionId) => ({
            userId: user.id,
            restrictionId,
          })),
        );
      }
    });

    return ok("Participant registered successfully.");
  } catch (error) {
    console.error("Registration error:", error);
    return fail("Failed to register participant.");
  }
}

async function _getOptions() {
  const [
    genderRows,
    universityRows,
    majorRows,
    yearRows,
    interestRows,
    dietaryRows,
    heardFromRows,
  ] = await Promise.all([
    db.select().from(genders),
    db.select().from(universities),
    db.select().from(majors),
    db.select().from(yearsOfStudy),
    db.select().from(interests),
    db.select().from(dietaryRestrictions),
    db.select().from(heardFromSources),
  ]);

  return {
    genders: genderRows.map((g) => ({ value: g.id, label: g.label })),
    universities: universityRows.map((u) => ({ value: u.id, label: u.label })),
    majors: majorRows.map((m) => ({ value: m.id, label: m.label })),
    years: yearRows.map((y) => ({ value: y.id, label: y.label })),
    interests: interestRows.map((i) => ({ value: i.id, label: i.label })),
    dietary: dietaryRows.map((d) => ({ value: d.id, label: d.label })),
    heardFrom: heardFromRows.map((h) => ({ value: h.id, label: h.label })),
  };
}

export const getOptions = unstable_cache(
  _getOptions,
  ["registration-options"],
  {
    revalidate: 86400, // seconds
  },
);
