-- A QR code on the judging roster that signs whoever scans it in as that
-- judge. Effectively impersonation, so it gets its own narrow permission
-- rather than riding on `judging:manage:all`.
INSERT INTO authz.permission (slug, description)
VALUES ('judging:signin:all', 'Generate a QR code that signs a judge in to their account')
ON CONFLICT (slug) DO NOTHING;
--> statement-breakpoint

-- Additive: admins hold every permission. Never revoke — roles are editable
-- at runtime.
INSERT INTO authz.role_permission (role_id, permission_id)
SELECT r.id, p.id
  FROM authz.role r
  CROSS JOIN authz.permission p
 WHERE r.slug = 'admin'
   AND p.slug = 'judging:signin:all'
ON CONFLICT DO NOTHING;
