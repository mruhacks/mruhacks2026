-- Retire the `participant` role. Being a participant is per-event state
-- (`event_participants`), not a role; the role granted no permissions and
-- gated nothing. Its `user_role` and `role_permission` rows go with it via
-- ON DELETE CASCADE.
DELETE FROM authz.role WHERE slug = 'participant';
