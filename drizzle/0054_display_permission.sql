-- One permission covers the lobby-display settings every screen follows. The
-- screens themselves hold no credentials: /display and its feed are public.
INSERT INTO authz.permission (slug, description)
VALUES ('display:manage:all', 'Configure the lobby displays (clock, theme)')
ON CONFLICT (slug) DO NOTHING;
--> statement-breakpoint

-- Additive: admins hold every permission, and organizers run the event floor.
-- Never revoke — roles are editable at runtime.
INSERT INTO authz.role_permission (role_id, permission_id)
SELECT r.id, p.id
  FROM authz.role r
  CROSS JOIN authz.permission p
 WHERE r.slug IN ('admin', 'organizer')
   AND p.slug = 'display:manage:all'
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- The settings table is a singleton every screen reads; seed its one row so
-- reads never have to handle it missing.
INSERT INTO display_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
