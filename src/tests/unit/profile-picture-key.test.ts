import { describe, expect, test } from 'vitest';
import { parseOwnedProfilePictureKey } from '@/utils/object-storage';

const USER = '0b6e1c1e-1111-4a4a-8888-000000000001';
const OTHER = '0b6e1c1e-1111-4a4a-8888-000000000002';
const FILE = '9f0d6a52-2c55-4f6e-9a0e-5d1f3b6b7c8d.webp';

describe('parseOwnedProfilePictureKey', () => {
  test("returns the key for the user's own upload", () => {
    expect(
      parseOwnedProfilePictureKey(
        `/api/assets/profile-pictures/${USER}/${FILE}`,
        USER,
      ),
    ).toBe(`profile-pictures/${USER}/${FILE}`);
  });

  test.each([
    ['another user’s avatar', `/api/assets/profile-pictures/${OTHER}/${FILE}`],
    [
      'an event attachment',
      `/api/assets/event-content/${OTHER}/9f0d6a52-2c55-4f6e-9a0e-5d1f3b6b7c8d.png`,
    ],
    ['a resume', `/api/assets/resumes/${USER}/${FILE}`],
    [
      'an encoded traversal',
      `/api/assets/profile-pictures%2F${USER}%2F..%2F${OTHER}%2F${FILE}`,
    ],
    ['an extra path segment', `/api/assets/profile-pictures/${USER}/x/${FILE}`],
    ['an OAuth avatar URL', 'https://avatars.githubusercontent.com/u/1'],
    ['nothing', null],
  ])('rejects %s', (_name, image) => {
    expect(parseOwnedProfilePictureKey(image, USER)).toBeNull();
  });
});
