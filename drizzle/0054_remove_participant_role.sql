-- Retire the `participant` role. Being a participant is per-event state
-- (`event_participants`), not a role, and the role gated nothing. Only
-- deleted while it still grants nothing: if an admin attached permissions to
-- it at runtime, it's kept (roles are editable at runtime — never revoke).
-- Its `user_role` rows go with it via ON DELETE CASCADE.
DELETE FROM authz.role r
 WHERE r.slug = 'participant'
   AND NOT EXISTS (
     SELECT 1 FROM authz.role_permission rp WHERE rp.role_id = r.id
   );
