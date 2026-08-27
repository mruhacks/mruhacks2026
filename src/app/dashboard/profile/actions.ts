/**
 * Server actions for user profile (dashboard profile page).
 * Profile-only: user_profiles, user_dietary_restrictions.
 * Decoupled from event application/registration (see register/actions.ts and dashboard/events/actions.ts).
 */

'use server';

import {
  user as authUser,
  userProfiles,
  userDietaryRestrictions,
} from '@/db/schema';
import { getUser } from '@/utils/auth';
import { db } from '@/utils/db';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { ActionResult, fail, ok } from '@/utils/action-result';
import {
  profileFormSchema,
  type ProfileFormValues,
} from '@/components/profile-form/schema';
import {
  deleteObject,
  isObjectStorageKey,
  parseProfilePictureKey,
  profilePictureUrl,
  putObject,
} from '@/utils/object-storage';

export type UserProfileData = {
  fullName: string;
  genderId: number;
  genderOtherText: string;
  universityId: number;
  universityOtherText: string;
  majorId: number;
  majorOtherText: string;
  yearOfStudyId: number;
  attendedHackathonBefore: boolean;
  linkedinUrl: string;
  githubUrl: string;
  dietaryRestrictions: number[];
  dietaryOtherText: string;
  hasResume: boolean;
  resumeFileName: string | null;
  resumeFileType: string | null;
};

const MAX_PROFILE_PICTURE_BYTES = 2 * 1024 * 1024;
const MAX_RESUME_BYTES = 5 * 1024 * 1024;
const PROFILE_PICTURE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const RESUME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

type UploadedFile = {
  name: string;
  type: string;
  bytes: Uint8Array;
};

async function readUploadedFile(
  formData: FormData,
  key: string,
  allowedTypes: Set<string>,
  maxBytes: number,
): Promise<ActionResult<UploadedFile>> {
  const value = formData.get(key);
  if (
    !value ||
    typeof value === 'string' ||
    typeof value.arrayBuffer !== 'function'
  ) {
    return fail('Choose a file to upload.');
  }
  if (!allowedTypes.has(value.type)) {
    return fail('That file type is not supported.');
  }
  if (value.size === 0 || value.size > maxBytes) {
    return fail(`File must be smaller than ${maxBytes / 1024 / 1024} MB.`);
  }

  const fileName = value.name.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 255);
  return ok({
    name: fileName || 'upload',
    type: value.type,
    bytes: new Uint8Array(await value.arrayBuffer()),
  });
}

function extension(fileName: string) {
  const match = /\.[a-z0-9]{1,10}$/i.exec(fileName);
  return match ? match[0].toLowerCase() : '';
}

const PROFILE_PICTURE_MAX_DIMENSION = 512;
// Guards against decompression-bomb images: a tiny compressed file (e.g. a
// PNG a few KB on disk) can decode to a huge pixel buffer. This caps decoded
// size well above any real photo (a 24MP photo is ~24_000_000) while still
// rejecting pathological inputs before they blow up memory.
const PROFILE_PICTURE_MAX_INPUT_PIXELS = 50_000_000;
// Upload bytes are already capped by MAX_PROFILE_PICTURE_BYTES, but a
// small-but-slow-to-decode file (or a stalled/blocked worker) shouldn't be
// able to hold the request open indefinitely — fail fast instead.
const PROFILE_PICTURE_PROCESSING_TIMEOUT_MS = 8000;

/**
 * Re-encodes an uploaded profile picture: auto-orients from the EXIF
 * orientation tag, downsizes to a fixed avatar size, and outputs WebP.
 * Sharp does not copy EXIF/ICC/XMP metadata to the output unless
 * `.withMetadata()` is called, so this also strips it in the process.
 */
async function processProfilePicture(
  bytes: Uint8Array,
): Promise<ActionResult<Uint8Array>> {
  try {
    const output = await Promise.race([
      sharp(bytes, {
        failOn: 'none',
        limitInputPixels: PROFILE_PICTURE_MAX_INPUT_PIXELS,
      })
        .rotate()
        .resize({
          width: PROFILE_PICTURE_MAX_DIMENSION,
          height: PROFILE_PICTURE_MAX_DIMENSION,
          fit: 'cover',
          withoutEnlargement: true,
        })
        .webp({ quality: 85 })
        .toBuffer(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('timeout')),
          PROFILE_PICTURE_PROCESSING_TIMEOUT_MS,
        ),
      ),
    ]);
    return ok(new Uint8Array(output));
  } catch (error) {
    const isTimeout = error instanceof Error && error.message === 'timeout';
    console.error(
      isTimeout
        ? 'Profile picture processing timed out'
        : 'Profile picture processing error:',
      isTimeout ? undefined : error,
    );
    return fail('That file could not be read as an image.');
  }
}

function revalidateProfile() {
  revalidatePath('/dashboard/profile');
  revalidatePath('/dashboard/account');
  revalidatePath('/dashboard', 'layout');
}

/**
 * Returns the current user's profile (user_profiles + user_dietary_restrictions).
 * No attendedBefore; used for ProfileForm initial and event-form pre-fill when no prior application.
 * Returns ok(null) when no profile row exists.
 */
export async function getUserProfile(): Promise<
  ActionResult<UserProfileData | null>
> {
  const user = await getUser();
  if (!user) return fail('User not authenticated');

  const [profile] = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, user.id))
    .limit(1);

  if (!profile) return ok(null);

  const restrictionRows = await db
    .select({ restrictionId: userDietaryRestrictions.restrictionId })
    .from(userDietaryRestrictions)
    .where(eq(userDietaryRestrictions.userId, user.id));

  return ok({
    fullName: profile.fullName,
    genderId: profile.genderId,
    genderOtherText: profile.genderOtherText ?? '',
    universityId: profile.universityId,
    universityOtherText: profile.universityOtherText ?? '',
    majorId: profile.majorId,
    majorOtherText: profile.majorOtherText ?? '',
    yearOfStudyId: profile.yearOfStudyId,
    attendedHackathonBefore: profile.attendedHackathonBefore,
    linkedinUrl: profile.linkedinUrl ?? '',
    githubUrl: profile.githubUrl ?? '',
    dietaryRestrictions: restrictionRows.map((r) => r.restrictionId),
    dietaryOtherText: profile.dietaryOtherText ?? '',
    hasResume: profile.resumeFile != null,
    resumeFileName: profile.resumeFileName,
    resumeFileType: profile.resumeFileType,
  });
}

/**
 * Saves user profile only (user_profiles, user_dietary_restrictions).
 * Does not touch event_applications. Accommodations stay event-only.
 */
export async function saveUserProfile(
  formData: ProfileFormValues,
): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return fail('User not authenticated');

  const parsed = profileFormSchema.safeParse(formData);
  if (!parsed.success) {
    return fail(`Validation failed: ${parsed.error.message}`);
  }

  const data = parsed.data;

  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(userProfiles)
        .values({
          userId: user.id,
          fullName: data.fullName,
          genderId: data.genderId,
          genderOtherText: data.genderOtherText || null,
          universityId: data.universityId,
          universityOtherText: data.universityOtherText || null,
          majorId: data.majorId,
          majorOtherText: data.majorOtherText || null,
          yearOfStudyId: data.yearOfStudyId,
          dietaryOtherText: data.dietaryOtherText || null,
          linkedinUrl: data.linkedinUrl || null,
          githubUrl: data.githubUrl || null,
        })
        .onConflictDoUpdate({
          target: userProfiles.userId,
          set: {
            fullName: data.fullName,
            genderId: data.genderId,
            genderOtherText: data.genderOtherText || null,
            universityId: data.universityId,
            universityOtherText: data.universityOtherText || null,
            majorId: data.majorId,
            majorOtherText: data.majorOtherText || null,
            yearOfStudyId: data.yearOfStudyId,
            dietaryOtherText: data.dietaryOtherText || null,
            linkedinUrl: data.linkedinUrl || null,
            githubUrl: data.githubUrl || null,
            updatedAt: new Date(),
          },
        });

      // Keep the Better Auth display name in sync with the required profile
      // name so first-time users do not appear anonymous in the dashboard.
      await tx
        .update(authUser)
        .set({ name: data.fullName })
        .where(eq(authUser.id, user.id));

      await tx
        .delete(userDietaryRestrictions)
        .where(eq(userDietaryRestrictions.userId, user.id));
      const realRestrictions =
        data.dietaryRestrictions?.filter((id) => id > 0) ?? [];
      if (realRestrictions.length) {
        await tx.insert(userDietaryRestrictions).values(
          realRestrictions.map((restrictionId) => ({
            userId: user.id,
            restrictionId,
          })),
        );
      }
    });

    return ok('Profile saved successfully.');
  } catch (error) {
    console.error('Profile save error:', error);
    return fail('Failed to save profile.');
  }
}

/** Stores the onboarding-only profile signal after the complete profile is saved. */
export async function saveWelcomeProfile(
  formData: ProfileFormValues & { attendedHackathonBefore: boolean },
): Promise<ActionResult> {
  const result = await saveUserProfile(formData);
  if (!result.success) return result;

  const user = await getUser();
  if (!user) return fail('User not authenticated');

  try {
    await db
      .update(userProfiles)
      .set({ attendedHackathonBefore: formData.attendedHackathonBefore })
      .where(eq(userProfiles.userId, user.id));
    revalidateProfile();
    return ok();
  } catch (error) {
    console.error('Welcome profile save error:', error);
    return fail('Failed to save onboarding profile.');
  }
}

/** Uploads a profile photo for the signed-in user. */
export async function uploadProfilePicture(
  formData: FormData,
): Promise<ActionResult> {
  const currentUser = await getUser();
  if (!currentUser) return fail('User not authenticated');

  const file = await readUploadedFile(
    formData,
    'profilePicture',
    PROFILE_PICTURE_TYPES,
    MAX_PROFILE_PICTURE_BYTES,
  );
  if (!file.success) return fail(file.error);
  if (!file.data) return fail('Unable to read image.');

  const processed = await processProfilePicture(file.data.bytes);
  if (!processed.success) return fail(processed.error);
  if (!processed.data) return fail('Unable to process image.');

  try {
    const key = `profile-pictures/${currentUser.id}/${randomUUID()}.webp`;
    await putObject({
      key,
      body: processed.data,
      contentType: 'image/webp',
    });
    const [existing] = await db
      .select({ image: authUser.image })
      .from(authUser)
      .where(eq(authUser.id, currentUser.id))
      .limit(1);
    await db
      .update(authUser)
      .set({ image: profilePictureUrl(key) })
      .where(eq(authUser.id, currentUser.id));
    const previousKey = parseProfilePictureKey(existing?.image);
    if (previousKey) await deleteObject(previousKey);
    revalidateProfile();
    return ok();
  } catch (error) {
    console.error('Profile picture upload error:', error);
    return fail('Unable to upload your profile picture.');
  }
}

/** Removes the signed-in user's uploaded profile photo. */
export async function removeProfilePicture(): Promise<ActionResult> {
  const currentUser = await getUser();
  if (!currentUser) return fail('User not authenticated');

  try {
    const [existing] = await db
      .select({ image: authUser.image })
      .from(authUser)
      .where(eq(authUser.id, currentUser.id))
      .limit(1);
    await db
      .update(authUser)
      .set({ image: null })
      .where(eq(authUser.id, currentUser.id));
    const key = parseProfilePictureKey(existing?.image);
    if (key) await deleteObject(key);
    revalidateProfile();
    return ok();
  } catch (error) {
    console.error('Profile picture removal error:', error);
    return fail('Unable to remove your profile picture.');
  }
}

/** Uploads an optional resume for a completed profile. */
export async function uploadResume(formData: FormData): Promise<ActionResult> {
  const currentUser = await getUser();
  if (!currentUser) return fail('User not authenticated');

  const file = await readUploadedFile(
    formData,
    'resume',
    RESUME_TYPES,
    MAX_RESUME_BYTES,
  );
  if (!file.success) return fail(file.error);
  if (!file.data) return fail('Unable to read resume.');

  try {
    const key = `resumes/${currentUser.id}/${randomUUID()}${extension(file.data.name)}`;
    await putObject({
      key,
      body: file.data.bytes,
      contentType: file.data.type,
    });
    const [existing] = await db
      .select({ resumeFile: userProfiles.resumeFile })
      .from(userProfiles)
      .where(eq(userProfiles.userId, currentUser.id))
      .limit(1);
    const result = await db
      .update(userProfiles)
      .set({
        resumeFile: key,
        resumeFileName: file.data.name,
        resumeFileType: file.data.type,
        updatedAt: new Date(),
      })
      .where(eq(userProfiles.userId, currentUser.id))
      .returning({ userId: userProfiles.userId });
    if (result.length === 0) {
      await deleteObject(key);
      return fail('Complete your profile before uploading a resume.');
    }
    if (existing?.resumeFile && isObjectStorageKey(existing.resumeFile)) {
      await deleteObject(existing.resumeFile);
    }
    revalidateProfile();
    return ok();
  } catch (error) {
    console.error('Resume upload error:', error);
    return fail('Unable to upload your resume.');
  }
}

/** Removes the signed-in user's optional resume. */
export async function removeResume(): Promise<ActionResult> {
  const currentUser = await getUser();
  if (!currentUser) return fail('User not authenticated');

  try {
    const [existing] = await db
      .select({ resumeFile: userProfiles.resumeFile })
      .from(userProfiles)
      .where(eq(userProfiles.userId, currentUser.id))
      .limit(1);
    await db
      .update(userProfiles)
      .set({
        resumeFile: null,
        resumeFileName: null,
        resumeFileType: null,
        updatedAt: new Date(),
      })
      .where(eq(userProfiles.userId, currentUser.id));
    if (existing?.resumeFile && isObjectStorageKey(existing.resumeFile)) {
      await deleteObject(existing.resumeFile);
    }
    revalidateProfile();
    return ok();
  } catch (error) {
    console.error('Resume removal error:', error);
    return fail('Unable to remove your resume.');
  }
}

/** Returns the current user's resume only; the data is never exposed in list views. */
export async function getOwnResume(): Promise<
  ActionResult<{ url: string; fileName: string } | null>
> {
  const currentUser = await getUser();
  if (!currentUser) return fail('User not authenticated');

  const [profile] = await db
    .select({
      resumeFile: userProfiles.resumeFile,
      resumeFileName: userProfiles.resumeFileName,
    })
    .from(userProfiles)
    .where(eq(userProfiles.userId, currentUser.id))
    .limit(1);
  if (!profile?.resumeFile || !isObjectStorageKey(profile.resumeFile))
    return ok(null);
  return ok({
    url: '/api/profile/resume',
    fileName: profile.resumeFileName ?? 'resume',
  });
}
