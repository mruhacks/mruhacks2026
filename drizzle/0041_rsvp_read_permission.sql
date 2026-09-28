-- The event dashboard's RSVP tile is gated on its own narrow permission
-- rather than reusing `event:manage:all`, so a viewer can be granted RSVP
-- visibility without gaining the ability to edit the event (AGENTS.md).
INSERT INTO authz.permission (slug, description)
VALUES ('rsvp:read:all', 'View an event''s RSVP waves and responses')
ON CONFLICT (slug) DO NOTHING;

-- Additive: organizers already run RSVP waves, so give them the read that
-- surfaces the tile. Never revoke — roles are editable at runtime.
INSERT INTO authz.role_permission (role_id, permission_id)
SELECT r.id, p.id
  FROM authz.role r
  CROSS JOIN authz.permission p
 WHERE r.slug = 'organizer'
   AND p.slug = 'rsvp:read:all'
ON CONFLICT DO NOTHING;
