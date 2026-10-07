-- Retire the `judge` role. Expo judges are authorized by roster membership
-- (`event_judges`), never by a role, so the role gated nothing and only
-- invited someone to grant it expecting it to. Its `user_role` and
-- `role_permission` rows go with it via ON DELETE CASCADE.
DELETE FROM authz.role WHERE slug = 'judge';
