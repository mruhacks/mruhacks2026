-- Staff signing in for the first time shouldn't be pushed to apply for the
-- featured event. Its own narrow permission rather than a role-slug check
-- (AGENTS.md), so who skips stays editable from the roles UI.
INSERT INTO authz.permission (slug, description)
VALUES ('onboarding:skip:all', 'Skip the featured-event application step during onboarding (staff)')
ON CONFLICT (slug) DO NOTHING;
--> statement-breakpoint

-- Additive: admins hold every permission; organizers and volunteers are staff.
-- Never revoke — roles are editable at runtime.
INSERT INTO authz.role_permission (role_id, permission_id)
SELECT r.id, p.id
  FROM authz.role r
  CROSS JOIN authz.permission p
 WHERE r.slug IN ('admin', 'organizer', 'volunteer')
   AND p.slug = 'onboarding:skip:all'
ON CONFLICT DO NOTHING;
