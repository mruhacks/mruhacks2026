-- Custom SQL migration file, put your code below! --
UPDATE "application_statuses" SET "title" = 'Invited' WHERE "label" = 'approved';
