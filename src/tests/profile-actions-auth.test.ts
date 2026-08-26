/**
 * Auth tests for the six profile actions not covered by profile-actions.test.ts:
 * saveWelcomeProfile, uploadProfilePicture, removeProfilePicture,
 * uploadResume, removeResume, getOwnResume.
 *
 * All actions require only authentication (no permission gate), so the only
 * RBAC scenario to test is unauthenticated → fail('User not authenticated').
 */
import { describe, test, expect, vi } from 'vitest';

vi.mock('@/utils/auth', () => ({ getUser: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/utils/object-storage', () => ({
  putPrivateObject: vi.fn(),
  deleteObject: vi.fn(),
  isObjectStorageKey: vi.fn().mockReturnValue(false),
  parseProfilePictureKey: vi.fn().mockReturnValue(null),
  profilePictureUrl: vi.fn().mockReturnValue(''),
}));
vi.mock('sharp', () => ({ default: vi.fn() }));

import { getUser } from '@/utils/auth';
import {
  saveWelcomeProfile,
  uploadProfilePicture,
  removeProfilePicture,
  uploadResume,
  removeResume,
  getOwnResume,
} from '@/app/dashboard/profile/actions';

function asUnauthed() {
  vi.mocked(getUser).mockResolvedValueOnce(null as never);
}

describe('profile actions — unauthenticated', () => {
  test('saveWelcomeProfile fails', async () => {
    asUnauthed();
    // saveWelcomeProfile delegates to saveUserProfile first; saveUserProfile checks auth
    await expect(saveWelcomeProfile({} as never)).resolves.toMatchObject({
      success: false,
    });
  });

  test('uploadProfilePicture fails before reading FormData', async () => {
    asUnauthed();
    await expect(uploadProfilePicture(new FormData())).resolves.toMatchObject({
      success: false,
    });
  });

  test('removeProfilePicture fails', async () => {
    asUnauthed();
    await expect(removeProfilePicture()).resolves.toMatchObject({
      success: false,
    });
  });

  test('uploadResume fails before reading FormData', async () => {
    asUnauthed();
    await expect(uploadResume(new FormData())).resolves.toMatchObject({
      success: false,
    });
  });

  test('removeResume fails', async () => {
    asUnauthed();
    await expect(removeResume()).resolves.toMatchObject({ success: false });
  });

  test('getOwnResume fails', async () => {
    asUnauthed();
    await expect(getOwnResume()).resolves.toMatchObject({ success: false });
  });
});
