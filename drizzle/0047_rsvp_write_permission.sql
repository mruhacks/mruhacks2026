-- Overriding a participant's RSVP from the admin applications table is its
-- own narrow permission rather than a reuse of `application:review:all`:
-- it creates/removes event_attendees rows, which reviewing an application
-- never does (AGENTS.md).
INSERT INTO authz.permission (slug, description)
VALUES ('rsvp:write:all', 'Override a participant''s RSVP response')
ON CONFLICT (slug) DO NOTHING;
--> statement-breakpoint

-- Additive: admins hold every permission, and organizers already review
-- applications and run RSVP waves. Never revoke — roles are editable at
-- runtime.
INSERT INTO authz.role_permission (role_id, permission_id)
SELECT r.id, p.id
  FROM authz.role r
  CROSS JOIN authz.permission p
 WHERE r.slug IN ('admin', 'organizer')
   AND p.slug = 'rsvp:write:all'
ON CONFLICT DO NOTHING;
