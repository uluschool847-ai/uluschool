UPDATE "ScheduledClass"
SET "timezone" = 'Africa/Nairobi'
WHERE "timezone" IN ('Europe/Kiev', 'Europe/Kyiv');

UPDATE "TeacherAvailabilityRule"
SET "timezone" = 'Africa/Nairobi'
WHERE "timezone" IN ('Europe/Kiev', 'Europe/Kyiv');
