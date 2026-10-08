-- Retire the `judge` role. Expo judges are authorized by roster membership
-- (`event_judges`), never by a role, so the role gated nothing and only
-- invited someone to grant it expecting it to. Only deleted while it still
-- grants nothing: if an admin attached permissions to it at runtime, it's
-- kept (roles are editable at runtime — never revoke). Its `user_role` rows
-- go with it via ON DELETE CASCADE.
DELETE FROM authz.role r
 WHERE r.slug = 'judge'
   AND NOT EXISTS (
     SELECT 1 FROM authz.role_permission rp WHERE rp.role_id = r.id
   );
